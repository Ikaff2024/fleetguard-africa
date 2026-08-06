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
const server = spawn('node', [DATABASE_READY ? 'scripts/start-production.mjs' : 'dist/server.js'], {
  env: serverEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
});
server.stdout.on('data', chunk => serverOutput.push(chunk.toString()));
server.stderr.on('data', chunk => serverOutput.push(chunk.toString()));

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
    run('Isolation multi-tenant (API)', 'npx', ['vitest', 'run', 'tests/tenant-isolation.test.ts']);
    run('Cloisonnement visible à l’écran', 'node', ['scripts/verify-tenant-isolation-ui.mjs', baseUrl]);
  } else {
    skip('Isolation multi-tenant', 'DATABASE_APP_URL et JWT_SECRET absents');
    skip('Cloisonnement visible à l’écran', 'DATABASE_APP_URL et JWT_SECRET absents');
  }
}

server.kill();

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
