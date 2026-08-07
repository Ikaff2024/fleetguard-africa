import path from 'node:path';
import 'dotenv/config';
import express, { type Express } from 'express';
import { createApp } from './src/server/app.js';
import { env, isProduction } from './src/server/env.js';
import { logger } from './src/server/logger.js';
import { startIdempotencyPurge, stopIdempotencyPurge } from './src/server/services/idempotency.js';
import { startRetentionPurge, stopRetentionPurge } from './src/server/services/retention-scheduler.js';
import { assertRlsEnforced, disconnectDatabase } from './src/server/db/prisma.js';

/** Sert le frontend : middleware Vite en développement, build statique en production. */
async function mountFrontend(app: Express) {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    return;
  }

  const distPath = path.join(process.cwd(), 'dist');

  app.use(
    express.static(distPath, {
      // Les assets portent un hash de contenu : cache long et immuable.
      // Décisif sur les réseaux mobiles africains, où chaque octet réémis coûte.
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );

  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

async function startServer() {
  // Contrôle préalable : une isolation multi-tenant inopérante ne se voit pas
  // à l'usage, elle se constate quand un client signale voir les données d'un
  // autre. Mieux vaut refuser de démarrer.
  await assertRlsEnforced();

  const app = await createApp({ mountFrontend });

  startIdempotencyPurge();
  startRetentionPurge();

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(
      { port: env.PORT, host: env.HOST, environment: env.NODE_ENV },
      'FleetGuard Africa — serveur démarré',
    );
  });

  // Ferme les connexions inactives pour que l'arrêt gracieux aboutisse vraiment.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  /**
   * Arrêt gracieux.
   * Sans cela, un déploiement coupe les requêtes en vol : un lot GPS remonté
   * après des heures de zone blanche peut être perdu au pire moment.
   */
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Arrêt en cours — plus aucune nouvelle connexion acceptée');

    stopIdempotencyPurge();
    stopRetentionPurge();
    void disconnectDatabase();

    server.close(err => {
      if (err) {
        logger.error({ err }, 'Erreur pendant la fermeture du serveur');
        process.exit(1);
      }
      logger.info('Arrêt terminé proprement');
      process.exit(0);
    });

    // Filet de sécurité : ne jamais rester bloqué indéfiniment.
    setTimeout(() => {
      logger.error('Arrêt gracieux trop long — sortie forcée');
      process.exit(1);
    }, 15_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', reason => {
    logger.error({ reason }, 'Promesse rejetée non gérée');
  });
  process.on('uncaughtException', err => {
    logger.fatal({ err }, 'Exception non interceptée — arrêt du processus');
    shutdown('uncaughtException');
  });
}

startServer().catch(err => {
  // La configuration est validée au chargement du module env : une erreur ici
  // signifie que le service ne doit pas démarrer du tout.
  logger.fatal({ err }, 'Échec du démarrage');
  process.exit(1);
});
