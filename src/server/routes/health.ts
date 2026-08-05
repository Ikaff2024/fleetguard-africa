import { Router } from 'express';
import { env } from '../env.js';
import { idempotencySize } from '../services/idempotency.js';
import { isAiConfigured } from '../services/gemini.js';

export const healthRouter = Router();

const startedAt = Date.now();

/**
 * Sonde de vivacité (liveness) : le processus répond-il ?
 * Volontairement sans dépendance externe — une base indisponible ne doit pas
 * déclencher un redémarrage en boucle de l'orchestrateur.
 */
healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'FleetGuard Africa API',
    version: process.env.npm_package_version ?? '0.1.0',
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  });
});

/**
 * Sonde de disponibilité (readiness) : le service peut-il traiter du trafic ?
 * En Phase 1, ajouter ici la vérification PostgreSQL et Redis.
 */
healthRouter.get('/health/ready', (_req, res) => {
  const checks = {
    ai: isAiConfigured() ? 'configured' : env.AI_DEMO_MODE ? 'demo-mode' : 'unavailable',
    idempotencyEntries: idempotencySize(),
    database: env.DATABASE_URL ? 'configured' : 'not-configured',
  };

  res.json({ status: 'ready', checks });
});
