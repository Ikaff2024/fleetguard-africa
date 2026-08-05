import compression from 'compression';
import express, { type Express } from 'express';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { applySecurity, globalRateLimit } from './http/security.js';
import { httpLogger } from './logger.js';
import { fleetRouter } from './routes/fleet.js';
import { healthRouter } from './routes/health.js';
import { intelligenceRouter } from './routes/intelligence.js';
import { scoringRouter } from './routes/scoring.js';
import { syncRouter } from './routes/sync.js';
import { trackingRouter } from './routes/tracking.js';

export interface CreateAppOptions {
  /**
   * Montage du frontend (middleware Vite en développement, fichiers statiques
   * en production). Inséré après l'API et avant le gestionnaire d'erreurs, afin
   * que le repli SPA n'avale jamais une route d'API inconnue.
   */
  mountFrontend?: (app: Express) => Promise<void> | void;
}

/**
 * Assemblage de l'application HTTP.
 * Séparé du démarrage du serveur pour rester testable sans ouvrir de port.
 */
export async function createApp(options: CreateAppOptions = {}): Promise<Express> {
  const app = express();

  applySecurity(app);
  app.use(httpLogger);
  app.use(compression());

  // 1 Mo suffit pour un lot de 500 points GPS ; au-delà, c'est une anomalie.
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  api.use(globalRateLimit);
  api.use(healthRouter);
  api.use(fleetRouter);
  api.use(scoringRouter);
  api.use(trackingRouter);
  api.use(syncRouter);
  api.use(intelligenceRouter);

  app.use('/api/v1', api);

  // 404 JSON pour l'API : une route d'API inconnue ne doit jamais renvoyer
  // la page HTML du SPA (erreur de parsing incompréhensible côté client).
  app.use('/api', notFoundHandler);

  if (options.mountFrontend) {
    await options.mountFrontend(app);
  }

  app.use(errorHandler);

  return app;
}
