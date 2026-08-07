import { apiClient } from '../lib/api-client';
import type { GpsPoint } from '../types';

/**
 * Émission de la télémétrie depuis le téléphone du chauffeur.
 *
 * C'est le chaînon qui manquait : l'API sait ingérer des positions, mais rien
 * ne lui en envoyait. Un boîtier coûte cinquante à cent cinquante euros par
 * véhicule, plus la pose et le dédouanement ; un téléphone Android est déjà
 * dans la cabine. La même route d'ingestion servira les boîtiers le jour où un
 * client équipé en voudra — ce choix n'en ferme aucun.
 *
 * Trois contraintes de terrain gouvernent l'écriture.
 *
 * **La batterie.** Un chauffeur désinstalle en deux jours une application qui
 * vide son téléphone. La position n'est donc pas suivie en continu à haute
 * précision : elle est relevée à intervalle fixe, et l'envoi se fait par lots.
 *
 * **Le réseau.** Sur un corridor, la coupure est l'état normal. Les points sont
 * conservés localement et rejoués à la reconnexion. L'ingestion étant
 * idempotente, un lot renvoyé deux fois ne compte pas deux fois — ce qui
 * fausserait le score du chauffeur, donc sa prime.
 *
 * **L'écran verrouillé.** C'est la limite réelle d'une application web : le
 * navigateur suspend le code quand l'écran s'éteint. Elle est signalée à
 * l'utilisateur plutôt que masquée, et le verrou d'écran est demandé quand le
 * navigateur le permet.
 */

/** Une position par demi-minute : assez fin pour un trajet, sobre en batterie. */
const SAMPLE_INTERVAL_MS = 30_000;

/** Envoi toutes les deux minutes : quatre points par lot, peu de requêtes. */
const FLUSH_INTERVAL_MS = 120_000;

/** Au-delà, la file locale est purgée des plus anciens points. */
const MAX_BUFFERED_POINTS = 2_000;

const BUFFER_KEY = 'fleetguard.trackingBuffer';

export interface TrackingStatus {
  isTracking: boolean;
  pointsBuffered: number;
  pointsSent: number;
  lastSentAt?: string;
  lastError?: string;
  /** Vrai quand le navigateur maintient l'écran allumé. */
  screenLockHeld: boolean;
}

type Listener = (status: TrackingStatus) => void;

function readBuffer(): GpsPoint[] {
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    return raw ? (JSON.parse(raw) as GpsPoint[]) : [];
  } catch {
    return [];
  }
}

function writeBuffer(points: GpsPoint[]): void {
  try {
    localStorage.setItem(BUFFER_KEY, JSON.stringify(points));
  } catch {
    /* stockage saturé : les points restent en mémoire pour cette session */
  }
}

export class DriverTracker {
  private watchId: number | null = null;
  private flushTimer: number | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private buffer: GpsPoint[] = readBuffer();
  private lastSampleAt = 0;
  private listeners = new Set<Listener>();

  private status: TrackingStatus = {
    isTracking: false,
    pointsBuffered: this.buffer.length,
    pointsSent: 0,
    screenLockHeld: false,
  };

  constructor(
    private readonly vehicleId: string,
    private readonly driverId: string,
  ) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private emit(patch: Partial<TrackingStatus>): void {
    this.status = { ...this.status, ...patch, pointsBuffered: this.buffer.length };
    for (const listener of this.listeners) listener(this.status);
  }

  async start(): Promise<void> {
    if (this.watchId !== null) return;
    if (!('geolocation' in navigator)) {
      this.emit({ lastError: 'Ce téléphone ne permet pas la localisation.' });
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      position => this.onPosition(position),
      error => this.emit({ lastError: geolocationMessage(error) }),
      {
        // Haute précision : sur une piste, une position à cinquante mètres près
        // ne permet ni de reconstruire un trajet ni de constater un excès.
        enableHighAccuracy: true,
        maximumAge: SAMPLE_INTERVAL_MS,
        timeout: 30_000,
      },
    );

    this.flushTimer = window.setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    await this.requestScreenLock();

    // Le passage au premier plan est le moment où le navigateur rend la main :
    // on en profite pour vider la file accumulée.
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.emit({ isTracking: true, lastError: undefined });
  }

  async stop(): Promise<void> {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    if (this.flushTimer !== null) window.clearInterval(this.flushTimer);
    this.watchId = null;
    this.flushTimer = null;

    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    await this.releaseScreenLock();

    // Dernier envoi : ce qui reste en file appartient au chauffeur, pas au
    // hasard d'une fermeture d'onglet.
    await this.flush();
    this.emit({ isTracking: false });
  }

  private onVisibilityChange = () => {
    if (document.visibilityState === 'visible') void this.flush();
  };

  private onPosition(position: GeolocationPosition): void {
    const now = Date.now();
    // `watchPosition` peut émettre bien plus souvent que nécessaire ; on ne
    // retient qu'un point par intervalle.
    if (now - this.lastSampleAt < SAMPLE_INTERVAL_MS) return;
    this.lastSampleAt = now;

    const { coords } = position;

    this.buffer.push({
      latitude: coords.latitude,
      longitude: coords.longitude,
      altitude: coords.altitude ?? undefined,
      // `speed` est en m/s et vaut `null` à l'arrêt sur bien des appareils.
      speedKmH: Math.min(250, Math.max(0, (coords.speed ?? 0) * 3.6)),
      headingDegree: Math.round(coords.heading ?? 0),
      timestamp: new Date(position.timestamp).toISOString(),
      accuracyMeters: Math.min(10_000, coords.accuracy),
      // Sans contact moteur accessible depuis un téléphone, on considère le
      // véhicule en service tant que le chauffeur n'a pas arrêté le suivi.
      ignitionOn: true,
      batteryLevelPct: 100,
      networkType: navigator.onLine ? '4G' : 'NONE',
    });

    // Purge des plus anciens : mieux vaut perdre le début d'une trace très
    // longue que saturer le stockage et tout perdre.
    if (this.buffer.length > MAX_BUFFERED_POINTS) {
      this.buffer = this.buffer.slice(-MAX_BUFFERED_POINTS);
    }

    writeBuffer(this.buffer);
    this.emit({});
  }

  /** Envoie la file au serveur. Sans réseau, elle reste intacte. */
  async flush(): Promise<void> {
    if (this.buffer.length === 0 || !navigator.onLine) return;

    const batch = [...this.buffer];
    // L'identifiant dérive du contenu du lot : un renvoi après coupure retombe
    // sur le même, et l'ingestion l'ignore au lieu de compter deux fois.
    const batchId = `mob-${this.driverId.slice(0, 8)}-${batch[0]!.timestamp}-${batch.length}`;

    try {
      await apiClient.post('/tracking/telemetry/batch', {
        batchId,
        vehicleId: this.vehicleId,
        driverId: this.driverId,
        sentAt: new Date().toISOString(),
        points: batch.slice(0, 500),
      });

      this.buffer = this.buffer.slice(batch.slice(0, 500).length);
      writeBuffer(this.buffer);

      this.emit({
        pointsSent: this.status.pointsSent + Math.min(500, batch.length),
        lastSentAt: new Date().toISOString(),
        lastError: undefined,
      });
    } catch (err) {
      // La file n'est pas vidée : un envoi manqué ne doit jamais effacer une
      // trace que le chauffeur croit transmise.
      this.emit({
        lastError: err instanceof Error ? `Envoi impossible : ${err.message}` : 'Envoi impossible.',
      });
    }
  }

  private async requestScreenLock(): Promise<void> {
    try {
      const lock = await navigator.wakeLock?.request('screen');
      if (lock) {
        this.wakeLock = lock;
        this.emit({ screenLockHeld: true });
      }
    } catch {
      // Non pris en charge, ou refusé : le suivi fonctionne, mais s'interrompt
      // quand l'écran s'éteint. L'interface le dit.
      this.emit({ screenLockHeld: false });
    }
  }

  private async releaseScreenLock(): Promise<void> {
    try {
      await this.wakeLock?.release();
    } catch {
      /* déjà relâché */
    }
    this.wakeLock = null;
    this.emit({ screenLockHeld: false });
  }
}

function geolocationMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Localisation refusée. Autorisez-la dans les réglages du téléphone pour démarrer la tournée.';
    case error.POSITION_UNAVAILABLE:
      return 'Position indisponible : signal GPS trop faible.';
    case error.TIMEOUT:
      return 'Le GPS met trop de temps à répondre.';
    default:
      return 'Localisation impossible.';
  }
}
