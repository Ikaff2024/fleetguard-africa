/**
 * Démarrage en production : préparation de la base, puis lancement du serveur.
 *
 * Les migrations sont appliquées depuis l'intérieur du réseau privé, par le
 * conteneur applicatif lui-même. L'alternative — ouvrir un accès public à la
 * base pour migrer depuis un poste — exposerait durablement la donnée la plus
 * sensible de la plateforme pour un besoin ponctuel.
 *
 * Séquence :
 *   1. attente de la base ;
 *   2. `prisma migrate deploy` (schéma) ;
 *   3. scripts SQL d'isolation et de géométrie, tous idempotents ;
 *   4. peuplement de démonstration si demandé ;
 *   5. lancement du serveur.
 *
 * Toute étape 1 à 3 qui échoue interrompt le démarrage : servir l'application
 * sur un schéma incomplet produirait des erreurs incompréhensibles côté client.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const SQL_FILES = [
  'prisma/sql/001_rls_policies.sql',
  'prisma/sql/002_postgis_and_partitions.sql',
  'prisma/sql/003_auth_functions.sql',
];

const log = message => console.log(`[démarrage] ${message}`);

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`Échec de « ${command} ${args.join(' ')} » (code ${result.status})`);
  }
}

async function waitForDatabase(connectionString, attempts = 30) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const client = new pg.Client({ connectionString });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      log(`base joignable (tentative ${attempt})`);
      return;
    } catch (err) {
      await client.end().catch(() => undefined);
      if (attempt === attempts) {
        throw new Error(`Base injoignable après ${attempts} tentatives : ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

async function applySqlFiles(connectionString) {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    for (const file of SQL_FILES) {
      const sql = readFileSync(path.join(process.cwd(), file), 'utf8')
        // Les méta-commandes psql (\c, \echo) n'ont pas de sens hors du client
        // interactif ; elles sont retirées avant exécution.
        .split('\n')
        .filter(line => !line.trimStart().startsWith('\\'))
        .join('\n');

      log(`application de ${file}`);
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}

/**
 * Aligne le mot de passe du rôle applicatif sur celui fourni par
 * l'environnement. Le script SQL crée le rôle avec une valeur par défaut
 * explicitement marquée comme à remplacer ; c'est ici qu'elle l'est.
 */
async function configureAppRole(connectionString, password) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    // `ALTER ROLE` n'accepte pas de paramètre lié, et un bloc `DO` non plus.
    // On demande donc à PostgreSQL de composer l'ordre en échappant lui-même
    // la valeur (`%L`) : un mot de passe contenant une apostrophe casserait
    // une concaténation faite côté application.
    const { rows } = await client.query(
      "SELECT format('ALTER ROLE fleetguard_app WITH PASSWORD %L', $1::text) AS statement",
      [password],
    );
    await client.query(rows[0].statement);
    log('mot de passe du rôle applicatif synchronisé');
  } finally {
    await client.end();
  }
}

async function main() {
  const ownerUrl = process.env.DATABASE_URL;
  if (!ownerUrl) {
    throw new Error('DATABASE_URL est requis pour préparer la base.');
  }

  await waitForDatabase(ownerUrl);

  log('application des migrations Prisma');
  run('npx', ['prisma', 'migrate', 'deploy']);

  await applySqlFiles(ownerUrl);

  const appPassword = process.env.APP_DB_PASSWORD;
  if (appPassword) {
    await configureAppRole(ownerUrl, appPassword);
  } else {
    log('APP_DB_PASSWORD absent : le rôle applicatif conserve son mot de passe actuel');
  }

  if (process.env.SEED_ON_START === 'true') {
    log('peuplement du jeu de démonstration');
    run('node', ['dist/seed.js']);
  }

  log('démarrage du serveur');
  await import(path.join(process.cwd(), 'dist', 'server.js'));
}

main().catch(err => {
  console.error(`[démarrage] ÉCHEC : ${err.message}`);
  process.exit(1);
});
