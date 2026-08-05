import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { env, isProduction } from '../env.js';
import { logger } from '../logger.js';

/**
 * Accès à la base de données.
 *
 * La persistance est optionnelle tant que la migration des modules n'est pas
 * terminée : sans `DATABASE_URL`, l'API continue de servir le jeu de
 * démonstration. Cela permet de basculer module par module sans jamais laisser
 * l'application hors service.
 */

let client: PrismaClient | null = null;

/**
 * L'application se connecte de préférence avec le rôle applicatif, soumis au
 * Row-Level Security. `DATABASE_URL` (propriétaire) ne sert qu'aux migrations
 * et au peuplement.
 */
const runtimeUrl = env.DATABASE_APP_URL ?? env.DATABASE_URL;

if (runtimeUrl) {
  client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: runtimeUrl }),
  });
  logger.info({ role: env.DATABASE_APP_URL ? 'applicatif' : 'propriétaire' }, 'Base de données connectée');
} else {
  logger.warn(
    "DATABASE_URL absente — l'API sert le jeu de démonstration en mémoire et l'authentification est indisponible.",
  );
}

export function isDatabaseEnabled(): boolean {
  return client !== null;
}

/**
 * Vérifie au démarrage que la connexion applicative est réellement soumise au
 * Row-Level Security.
 *
 * Ce contrôle existe parce que l'erreur est indétectable autrement : avec un
 * rôle superutilisateur, l'application fonctionne parfaitement — elle sert
 * simplement les données de tous les clients à chacun d'eux. Aucune erreur,
 * aucun log, juste une fuite totale.
 *
 * En production, le service refuse de démarrer. En développement, un
 * avertissement très visible est émis.
 */
export async function assertRlsEnforced(): Promise<void> {
  if (!client) return;

  let rows: { rolname: string; rolsuper: boolean; rolbypassrls: boolean }[];

  try {
    rows = await client.$queryRaw<
      { rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]
    >`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
  } catch (err) {
    // Base injoignable : ce n'est pas le contrôle d'isolation qui échoue, c'est
    // la connexion. Tuer le processus ici priverait l'exploitant des journaux
    // nécessaires au diagnostic. Les routes métier échoueront explicitement.
    logger.error(
      { err },
      "Vérification du Row-Level Security impossible : base injoignable. L'API démarre en mode dégradé.",
    );
    return;
  }

  const role = rows[0];
  if (!role) return;

  const bypassesRls = role.rolsuper || role.rolbypassrls;
  if (!bypassesRls) {
    logger.info({ role: role.rolname }, 'Row-Level Security actif sur la connexion applicative');
    return;
  }

  const message =
    `Le rôle « ${role.rolname} » contourne le Row-Level Security ` +
    `(superutilisateur=${role.rolsuper}, bypassrls=${role.rolbypassrls}). ` +
    `L'isolation entre organisations est INOPÉRANTE : chaque client verrait les données de tous les autres. ` +
    `Renseignez DATABASE_APP_URL avec un rôle applicatif dédié (voir prisma/sql/001_rls_policies.sql).`;

  if (isProduction) {
    throw new Error(message);
  }
  logger.warn(`AVERTISSEMENT — ${message}`);
}

/** Client Prisma, ou échec explicite si la base n'est pas configurée. */
export function db(): PrismaClient {
  if (!client) {
    throw new Error(
      'Cette fonctionnalité requiert une base de données. Renseignez DATABASE_URL et appliquez les migrations.',
    );
  }
  return client;
}

/**
 * Exécute une opération dans une transaction portant le tenant courant.
 *
 * `SET LOCAL` est impératif : la valeur meurt avec la transaction. Un `SET`
 * simple resterait attaché à la connexion et, celle-ci étant recyclée par le
 * pool, la requête suivante hériterait du tenant précédent — exactement la
 * fuite que le Row-Level Security cherche à empêcher.
 *
 * L'identifiant provient toujours d'un jeton signé, jamais d'une entrée client.
 */
export async function withTenant<T>(
  organizationId: string,
  operation: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db().$transaction(async tx => {
    // Paramètre lié : `set_config` accepte une valeur, là où `SET LOCAL`
    // n'admet qu'un littéral et exposerait à l'injection.
    await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${organizationId}, true)`;
    return operation(tx);
  });
}

/** Fermeture propre lors de l'arrêt du serveur. */
export async function disconnectDatabase(): Promise<void> {
  if (client) {
    await client.$disconnect();
    logger.info('Base de données déconnectée');
  }
}
