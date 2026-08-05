import { randomUUID } from 'node:crypto';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { env, isProduction, isTest } from './env.js';

/**
 * Journalisation structurée (JSON en production, lisible en développement).
 * Le JSON est indispensable pour l'agrégation (Loki, Datadog) et l'astreinte.
 * En test : silencieux, et sans transport worker qui perturberait Vitest.
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  transport: isProduction || isTest ? undefined : { target: 'pino-pretty', options: { colorize: true } },
  redact: {
    // Ne jamais faire fuiter un secret ou une position GPS nominative dans les logs.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'res.headers["set-cookie"]',
      'password',
      '*.password',
    ],
    censor: '[REDACTED]',
  },
  base: { service: 'fleetguard-api' },
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: req => (req.headers['x-request-id'] as string) || randomUUID(),
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Les sondes de disponibilité ne doivent pas noyer les logs utiles.
  autoLogging: {
    ignore: req => req.url === '/api/v1/health' || req.url === '/api/v1/health/ready',
  },
});
