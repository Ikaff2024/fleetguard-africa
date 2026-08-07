/**
 * Vérification complète, en local, de tout ce que contrôle l'intégration
 * continue.
 *
 * Utile dans deux situations :
 *   - avant de pousser, pour ne pas découvrir un échec dix minutes plus tard ;
 *   - quand l'intégration continue est indisponible (quota de minutes épuisé,
 *     runners saturés) : le projet doit rester vérifiable sans elle.
 *
 * Les contrôles nécessitant une base de données sont ignorés — et signalés
 * comme tels — si `DATABASE_APP_URL` n'est pas renseignée. Un contrôle sauté
 * doit se voir ; un faux succès serait pire que pas de contrôle du tout.
 *
 * Usage : npm run verify:all
 */
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';

const DATABASE_READY = Boolean(process.env.DATABASE_APP_URL && process.env.JWT_SECRET);
const PORT = process.env.VERIFY_PORT ?? '3910';

const results = [];

function run(label, command, args, options = {}) {
  process.stdout.write(`\n▸ ${label}\n`);
  const started = Date.now();
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  const ok = result.status === 0;
  results.push({ label, ok, seconds });
  if (!ok) process.stdout.write(`  ÉCHEC (${seconds} s)\n`);
  return ok;
}

function skip(label, reason) {
  results.push({ label, skipped: true, reason });
  process.stdout.write(`\n▸ ${label}\n  IGNORÉ — ${reason}\n`);
}

async function waitForServer(url, attempts = 45) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* pas encore prêt */
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

console.log('\n═══ Vérification complète ═══');

run('Types', 'npm', ['run', 'typecheck']);
run('Lint', 'npm', ['run', 'lint']);
run('Format', 'npm', ['run', 'format:check']);
run('Tests', 'npm', ['run', 'test']);
run('Build', 'npm', ['run', 'build']);

// --- Contrôles nécessitant un serveur en fonctionnement ---------------------
const serverEnv = {
  ...process.env,
  PORT,
  NODE_ENV: DATABASE_READY ? 'production' : 'development',
};

// La sortie du serveur est conservée : si le démarrage échoue, l'afficher est
// la seule façon de savoir pourquoi. Un « démarrage impossible » sans cause est
// inexploitable.
const serverOutput = [];
/**
 * Le serveur est lancé sans passer par un interpréteur de commandes.
 *
 * Avec `shell: true`, Windows insère un `cmd.exe` entre ce script et Node :
 * `server.kill()` ne tue alors que l'interpréteur, et le serveur survit. Chaque
 * exécution laissait ainsi un processus derrière elle, retenant son port et sa
 * connexion à la base — jusqu'à ce qu'une exécution ultérieure échoue sur un
 * port occupé, pour une raison sans rapport avec le code vérifié.
 *
 * `node` est un exécutable : aucun interpréteur n'est nécessaire.
 */
const server = spawn('node', [DATABASE_READY ? 'scripts/start-production.mjs' : 'dist/server.js'], {
  env: serverEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', chunk => serverOutput.push(chunk.toString()));
server.stderr.on('data', chunk => serverOutput.push(chunk.toString()));

/**
 * Arrêt du serveur, y compris ses descendants.
 *
 * `start-production.mjs` lance `prisma migrate deploy` puis importe le serveur :
 * tuer le seul processus parent laisserait un enfant en vie. Sous Windows,
 * `taskkill /T` est le seul moyen fiable de couper l'arborescence.
 */
let stopped = false;
function stopServer() {
  if (stopped || !server.pid) return;
  stopped = true;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      server.kill('SIGTERM');
    }
  }
}

// Une interruption au clavier ne doit pas davantage laisser de serveur orphelin.
process.on('exit', stopServer);
process.on('SIGINT', () => {
  stopServer();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stopServer();
  process.exit(143);
});

const baseUrl = `http://localhost:${PORT}`;
// Le démarrage applique migrations et scripts SQL : compter large.
const ready = await waitForServer(`${baseUrl}/api/v1/health`, 90);

if (!ready) {
  results.push({ label: 'Démarrage du serveur', ok: false, seconds: '—' });
  console.error(`\nSortie du serveur :\n${serverOutput.join('').slice(-2000)}`);
} else {
  const smokeEnv = DATABASE_READY
    ? {
        ...process.env,
        SMOKE_EMAIL: process.env.SMOKE_EMAIL ?? 'manager@transafrik.bj',
        SMOKE_PASSWORD: process.env.SMOKE_PASSWORD ?? 'FleetGuard2026!Demo',
      }
    : process.env;

  run('Contrôle de fumée', 'node', ['scripts/smoke-test.mjs', baseUrl], { env: smokeEnv });

  if (DATABASE_READY) {
    /**
     * Le mode hors connexion ne se vérifie que sur un build de production.
     *
     * Sans base, le serveur démarre en mode développement et sert l'application
     * par le middleware Vite, depuis les sources : `sw.js` n'existe alors pas,
     * et l'enregistrement du worker est volontairement désactivé pour ne pas
     * masquer les modifications derrière un cache. Lancer le contrôle dans ces
     * conditions produirait un échec sans rapport avec le code.
     */
    run('Fonctionnement hors connexion', 'node', ['scripts/verify-offline-shell.mjs', baseUrl], {
      env: {
        ...process.env,
        OFFLINE_CHECK_EMAIL: process.env.SMOKE_EMAIL ?? 'manager@transafrik.bj',
        OFFLINE_CHECK_PASSWORD: process.env.SMOKE_PASSWORD ?? 'FleetGuard2026!Demo',
      },
    });

    run('Isolation multi-tenant (API)', 'npx', ['vitest', 'run', 'tests/tenant-isolation.test.ts']);
    run('Cloisonnement visible à l’écran', 'node', ['scripts/verify-tenant-isolation-ui.mjs', baseUrl]);
  } else {
    skip('Fonctionnement hors connexion', 'build de production requis (base absente)');
    skip('Isolation multi-tenant', 'DATABASE_APP_URL et JWT_SECRET absents');
    skip('Cloisonnement visible à l’écran', 'DATABASE_APP_URL et JWT_SECRET absents');
  }
}

stopServer();

// --- Bilan ------------------------------------------------------------------
console.log('\n═══ Bilan ═══\n');

let failures = 0;
for (const entry of results) {
  if (entry.skipped) {
    console.log(`  IGNORÉ  ${entry.label} (${entry.reason})`);
  } else if (entry.ok) {
    console.log(`  OK      ${entry.label} — ${entry.seconds} s`);
  } else {
    console.log(`  ÉCHEC   ${entry.label}`);
    failures++;
  }
}

console.log(
  failures === 0
    ? '\nToutes les vérifications exécutées sont passées.\n'
    : `\n${failures} vérification(s) en échec.\n`,
);

process.exit(failures === 0 ? 0 : 1);
