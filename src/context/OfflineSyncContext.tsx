import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { offlineSyncService, OfflineQueueItem, SyncReport } from '../services/offlineSyncService';

interface OfflineSyncContextType {
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;
  queueItems: OfflineQueueItem[];
  pendingCount: number;
  isSyncing: boolean;
  lastSyncReport: SyncReport | null;
  syncNotification: string | null;
  enqueueUpdate: (
    type: OfflineQueueItem['type'],
    payload: Record<string, any>,
    tenantOrgId: string,
  ) => Promise<OfflineQueueItem>;
  triggerManualSync: () => Promise<SyncReport | null>;
  clearSyncedItems: () => Promise<void>;
  clearAllQueue: () => Promise<void>;
  refreshQueueState: () => Promise<void>;
  dismissNotification: () => void;
}

const OfflineSyncContext = createContext<OfflineSyncContextType | undefined>(undefined);

export const OfflineSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnlineState] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [queueItems, setQueueItems] = useState<OfflineQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncReport, setLastSyncReport] = useState<SyncReport | null>(null);
  const [syncNotification, setSyncNotification] = useState<string | null>(null);

  // Fetch queue items from IndexedDB
  const refreshQueueState = useCallback(async () => {
    try {
      const items = await offlineSyncService.getAllItems();
      setQueueItems(items);
    } catch (err) {
      console.error('Erreur lecture IndexedDB queue:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshQueueState();
  }, [refreshQueueState]);

  // Sync procedure
  const triggerManualSync = useCallback(async (): Promise<SyncReport | null> => {
    const pending = await offlineSyncService.getPendingItems();
    if (pending.length === 0) {
      return null;
    }

    setIsSyncing(true);
    setSyncNotification(
      `Synchronisation de ${pending.length} mise(s) à jour IndexedDB vers le serveur en cours...`,
    );

    try {
      const report = await offlineSyncService.syncPendingQueue();
      setLastSyncReport(report);
      await refreshQueueState();

      // Un refus n'est pas toujours passager : une plaque inconnue ou un
      // relevé de compteur incohérent ne se règleront pas en réessayant. Le
      // motif renvoyé par le serveur est visible sur chaque élément de la file.
      if (report.syncedCount > 0 && report.failedCount > 0) {
        setSyncNotification(
          `${report.syncedCount} saisie(s) enregistrée(s). ${report.failedCount} en attente — voir le motif sur chaque élément.`,
        );
      } else if (report.syncedCount > 0) {
        setSyncNotification(`${report.syncedCount} saisie(s) enregistrée(s) sur le serveur.`);
      } else if (report.failedCount > 0) {
        setSyncNotification(
          `${report.failedCount} saisie(s) non enregistrée(s), conservées dans la file — voir le motif sur chaque élément.`,
        );
      }

      return report;
    } catch (err: any) {
      setSyncNotification(`❌ Erreur de synchronisation IndexedDB : ${err.message}`);
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [refreshQueueState]);

  // Handle Online / Offline network status changes
  const setIsOnline = useCallback(
    (onlineStatus: boolean) => {
      setIsOnlineState(onlineStatus);
      if (onlineStatus) {
        setSyncNotification(
          'Connexion réseau rétablie (Online). Lancement de la synchronisation automatique IndexedDB...',
        );
        // Auto-trigger sync when connectivity is restored!
        setTimeout(() => {
          triggerManualSync();
        }, 500);
      } else {
        setSyncNotification('Mode Hors-Ligne activé. Les données seront temporisées dans IndexedDB.');
      }
    },
    [triggerManualSync],
  );

  // Listen for native browser window online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log('[OfflineSync] Browser event: Online');
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log('[OfflineSync] Browser event: Offline');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setIsOnline]);

  // Enqueue a new update into IndexedDB
  const enqueueUpdate = useCallback(
    async (
      type: OfflineQueueItem['type'],
      payload: Record<string, any>,
      tenantOrgId: string,
    ): Promise<OfflineQueueItem> => {
      const item = await offlineSyncService.enqueueItem(type, payload, tenantOrgId);
      await refreshQueueState();

      if (!isOnline) {
        setSyncNotification(
          `📱 [IndexedDB Offline] Mise à jour (${type}) enregistrée localement en attente de réseau.`,
        );
      } else {
        // If online, immediately sync the queue!
        setTimeout(() => {
          triggerManualSync();
        }, 200);
      }

      return item;
    },
    [isOnline, refreshQueueState, triggerManualSync],
  );

  const clearSyncedItems = useCallback(async () => {
    await offlineSyncService.clearSyncedItems();
    await refreshQueueState();
    setSyncNotification("Éléments déjà synchronisés purgés d'IndexedDB.");
  }, [refreshQueueState]);

  const clearAllQueue = useCallback(async () => {
    await offlineSyncService.clearAll();
    await refreshQueueState();
    setSyncNotification("File d'attente IndexedDB vidée.");
  }, [refreshQueueState]);

  const dismissNotification = useCallback(() => {
    setSyncNotification(null);
  }, []);

  const pendingCount = queueItems.filter(
    item => item.status === 'PENDING' || item.status === 'FAILED',
  ).length;

  return (
    <OfflineSyncContext.Provider
      value={{
        isOnline,
        setIsOnline,
        queueItems,
        pendingCount,
        isSyncing,
        lastSyncReport,
        syncNotification,
        enqueueUpdate,
        triggerManualSync,
        clearSyncedItems,
        clearAllQueue,
        refreshQueueState,
        dismissNotification,
      }}
    >
      {children}
    </OfflineSyncContext.Provider>
  );
};

export const useOfflineSync = () => {
  const context = useContext(OfflineSyncContext);
  if (!context) {
    throw new Error('useOfflineSync must be used within an OfflineSyncProvider');
  }
  return context;
};
