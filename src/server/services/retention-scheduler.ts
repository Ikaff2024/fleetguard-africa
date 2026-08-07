import { db, isDatabaseEnabled } from '../db/prisma.js';
import { logger } from '../logger.js';
import { purgeExpiredData } from '../repositories/personal-data-repository.js';

/**
 * Purge périodique des données personnelles.
 *
 * Une durée de conservation qui dépend de quelqu'un pour lancer un script n'est
 * pas tenue : c'est le manquement le plus courant, et le plus simple à
 * constater lors d'un contrôle. La purge tourne donc d'elle-même, une fois par
 * jour, sur chaque organisation.
 *
 * Elle s'exécute avec le rôle applicatif, soumis au Row-Level Security : chaque
 * passage est borné à l'organisation traitée, et une erreur de filtre ne peut
 * pas effacer les données d'un autre client.
 */

/** Une fois par jour suffit : la donnée la plus courte vit quatre-vingt-dix jours. */
const INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Délai avant le premier passage : le démarrage a mieux à faire. */
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

async function runOnce(): Promise<void> {
  if (!isDatabaseEnabled()) return;

  try {
    // Le rôle propriétaire lit la liste des organisations ; chaque purge est
    // ensuite exécutée dans le contexte de l'une d'elles.
    const organizations = await db().organization.findMany({ select: { id: true, name: true } });

    for (const organization of organizations) {
      const report = await purgeExpiredData(organization.id);
      const total = report.gpsPoints + report.trips + report.safetyEvents + report.alerts;

      if (total > 0) {
        logger.info(
          { organization: organization.name, ...report },
          'Purge des données au-delà de leur durée de conservation',
        );
      }
    }
  } catch (err) {
    // Un échec de purge ne doit pas arrêter le service : il doit se voir dans
    // les journaux et se rattraper au passage suivant.
    logger.error({ err }, 'Purge des données personnelles impossible');
  }
}

export function startRetentionPurge(): void {
  if (timer) return;
  setTimeout(() => void runOnce(), FIRST_RUN_DELAY_MS);
  timer = setInterval(() => void runOnce(), INTERVAL_MS);
  // Ne pas retenir le processus au moment de l'arrêt.
  timer.unref?.();
}

export function stopRetentionPurge(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
