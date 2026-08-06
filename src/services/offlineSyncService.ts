import { apiClient } from '../lib/api-client';

export interface OfflineQueueItem {
  id: string;
  type:
    | 'FUEL_LOG'
    | 'MAINTENANCE_RECORD'
    | 'ODOMETER_UPDATE'
    | 'GPS_TELEMETRY'
    | 'ROUTE_DISPATCH'
    | 'GEOFENCE_RULE';
  payload: Record<string, unknown>;
  timestamp: string;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  errorMessage?: string;
  tenantOrgId: string;
  retryCount: number;
}

export interface SyncReport {
  syncedCount: number;
  failedCount: number;
  syncedIds: string[];
  processedAt: string;
  details: { id: string; status: 'SYNCED' | 'FAILED'; message?: string }[];
}

const DB_NAME = 'FleetGuardOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'offline_queue';

class OfflineSyncService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB non supporté par cet environnement.'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('tenantOrgId', 'tenantOrgId', { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  /**
   * Enqueues a data update into IndexedDB local store
   */
  async enqueueItem(
    type: OfflineQueueItem['type'],
    payload: Record<string, unknown>,
    tenantOrgId: string,
  ): Promise<OfflineQueueItem> {
    const db = await this.getDB();
    const item: OfflineQueueItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type,
      payload,
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      tenantOrgId,
      retryCount: 0,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(item);

      request.onsuccess = () => resolve(item);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieves all queue items stored in IndexedDB
   */
  async getAllItems(): Promise<OfflineQueueItem[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const result: OfflineQueueItem[] = request.result || [];
        // Sort descending by timestamp
        result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        resolve(result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieves pending or failed items that require synchronization
   */
  async getPendingItems(): Promise<OfflineQueueItem[]> {
    const all = await this.getAllItems();
    return all.filter(item => item.status === 'PENDING' || item.status === 'FAILED');
  }

  /**
   * Updates an item's status in IndexedDB
   */
  async updateStatus(id: string, status: OfflineQueueItem['status'], errorMessage?: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const item: OfflineQueueItem = getReq.result;
        if (!item) {
          resolve();
          return;
        }

        item.status = status;
        if (errorMessage) item.errorMessage = errorMessage;
        if (status === 'FAILED') item.retryCount = (item.retryCount || 0) + 1;

        const putReq = store.put(item);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
    });
  }

  /**
   * Deletes a single item from IndexedDB
   */
  async deleteItem(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clears all SYNCED items from IndexedDB
   */
  async clearSyncedItems(): Promise<number> {
    const all = await this.getAllItems();
    const synced = all.filter(item => item.status === 'SYNCED');
    for (const item of synced) {
      await this.deleteItem(item.id);
    }
    return synced.length;
  }

  /**
   * Completely clears the IndexedDB queue
   */
  async clearAll(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Transmits pending items from IndexedDB queue to backend sync endpoint
   */
  async syncPendingQueue(): Promise<SyncReport> {
    const pendingItems = await this.getPendingItems();

    if (pendingItems.length === 0) {
      return {
        syncedCount: 0,
        failedCount: 0,
        syncedIds: [],
        processedAt: new Date().toISOString(),
        details: [],
      };
    }

    // Mark items as SYNCING in IndexedDB
    for (const item of pendingItems) {
      await this.updateStatus(item.id, 'SYNCING');
    }

    try {
      // Tous les éléments d'un lot appartiennent au même tenant : celui qui les
      // a mis en file. Le serveur rejette ceux qui ne correspondent pas.
      // La requête passe par le client HTTP commun : il porte le jeton de
      // session. L'en-tête d'organisation seul n'est accepté qu'en mode
      // démonstration — la synchronisation échouait donc en production.
      const result = await apiClient.post<{
        syncedItemIds?: string[];
        results?: { id: string; serverMessage?: string }[];
      }>('/sync/offline-batch', { items: pendingItems });

      const syncedIds: string[] = result.syncedItemIds ?? [];
      const messages = new Map((result.results ?? []).map(entry => [entry.id, entry.serverMessage ?? '']));

      // Update statuses in IndexedDB
      for (const item of pendingItems) {
        if (syncedIds.includes(item.id)) {
          await this.updateStatus(item.id, 'SYNCED');
        } else {
          // Le motif du serveur est conservé : « Aucun véhicule RB-4592-A dans
          // cette organisation » se corrige, « échec » ne se corrige pas.
          await this.updateStatus(
            item.id,
            'FAILED',
            messages.get(item.id) || 'Le serveur a rejeté la mise à jour.',
          );
        }
      }

      return {
        syncedCount: syncedIds.length,
        failedCount: pendingItems.length - syncedIds.length,
        syncedIds,
        processedAt: new Date().toISOString(),
        details: pendingItems.map(i => ({
          id: i.id,
          status: syncedIds.includes(i.id) ? 'SYNCED' : 'FAILED',
        })),
      };
    } catch (err) {
      // Rollback items to FAILED / PENDING on network error
      for (const item of pendingItems) {
        await this.updateStatus(
          item.id,
          'FAILED',
          err instanceof Error ? err.message : 'Erreur réseau lors de la synchronisation.',
        );
      }

      return {
        syncedCount: 0,
        failedCount: pendingItems.length,
        syncedIds: [],
        processedAt: new Date().toISOString(),
        details: pendingItems.map(i => ({
          id: i.id,
          status: 'FAILED',
          message: err instanceof Error ? err.message : String(err),
        })),
      };
    }
  }
}

export const offlineSyncService = new OfflineSyncService();
