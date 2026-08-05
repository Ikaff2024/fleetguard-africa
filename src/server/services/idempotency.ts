/**
 * Registre d'idempotence pour l'ingestion télémétrique.
 *
 * Un boîtier en zone blanche renvoie le même lot plusieurs fois : sans clé
 * d'idempotence, les points GPS sont comptés deux fois et le score de sécurité
 * du chauffeur est faussé — donc sa prime aussi.
 *
 * Implémentation actuelle : mémoire du processus, purge périodique.
 * Limite assumée : ne survit ni au redémarrage ni au passage à plusieurs
 * instances. Phase 2 remplace le corps par `SET key NX EX` sur Redis, sans
 * changer cette interface.
 */
export interface IdempotencyRecord {
  batchId: string;
  firstSeenAt: string;
  processedPoints: number;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24 h : au-delà, un rejeu est un vrai nouveau lot.
const PURGE_INTERVAL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 100_000; // Garde-fou mémoire.

const store = new Map<string, { record: IdempotencyRecord; expiresAt: number }>();

/**
 * Enregistre un lot s'il est inédit.
 * @returns le lot déjà connu (doublon), ou `null` si l'enregistrement est nouveau.
 */
export function registerBatch(
  organizationId: string,
  batchId: string,
  processedPoints: number,
): IdempotencyRecord | null {
  const key = `${organizationId}:${batchId}`;
  const existing = store.get(key);

  if (existing && existing.expiresAt > Date.now()) {
    return existing.record;
  }

  if (store.size >= MAX_ENTRIES) {
    purgeExpired();
    if (store.size >= MAX_ENTRIES) {
      // Dernier recours : on sacrifie l'entrée la plus ancienne plutôt que la mémoire.
      const oldest = store.keys().next().value;
      if (oldest) store.delete(oldest);
    }
  }

  const record: IdempotencyRecord = {
    batchId,
    firstSeenAt: new Date().toISOString(),
    processedPoints,
  };
  store.set(key, { record, expiresAt: Date.now() + TTL_MS });
  return null;
}

export function purgeExpired(): number {
  const now = Date.now();
  let removed = 0;
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(key);
      removed++;
    }
  }
  return removed;
}

export function idempotencySize(): number {
  return store.size;
}

/** Réinitialisation — usage tests uniquement. */
export function resetIdempotencyStore(): void {
  store.clear();
}

let purgeTimer: NodeJS.Timeout | undefined;

export function startIdempotencyPurge(): void {
  if (purgeTimer) return;
  purgeTimer = setInterval(purgeExpired, PURGE_INTERVAL_MS);
  // Ne doit pas maintenir le processus en vie lors d'un arrêt.
  purgeTimer.unref();
}

export function stopIdempotencyPurge(): void {
  if (purgeTimer) {
    clearInterval(purgeTimer);
    purgeTimer = undefined;
  }
}
