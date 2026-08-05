/**
 * Contrôle de fumée : charge réellement l'application dans un navigateur.
 *
 * Raison d'être : une page peut renvoyer un HTML parfaitement valide et rester
 * blanche parce qu'un script échoue. C'est exactement ce qui s'est produit en
 * production — le serveur répondait 200 sur toutes les ressources, mais la
 * politique CORS bloquait les fichiers de la page elle-même. Aucun test HTTP ne
 * pouvait le détecter : il faut exécuter le JavaScript.
 *
 * Usage :
 *   node scripts/smoke-test.mjs http://localhost:3000
 *   node scripts/smoke-test.mjs https://fleetguard-africa-production.up.railway.app
 */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:3000';
const TIMEOUT_MS = 45_000;

const consoleErrors = [];
const failedRequests = [];
const pageErrors = [];

const browser = await chromium.launch();
const page = await browser.newPage();

page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', err => pageErrors.push(err.message));
page.on('requestfailed', req => {
  failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'échec'}`);
});
page.on('response', res => {
  if (res.status() >= 400) failedRequests.push(`HTTP ${res.status()} ${res.url()}`);
});

console.log(`\nContrôle de fumée : ${url}\n`);

let exitCode = 0;

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });

  // 1. L'application est-elle réellement montée ?
  // `#root` non vide est le seul signal fiable : le HTML seul ne prouve rien.
  await page.waitForSelector('#root > *', { timeout: 20_000 });
  const rootChildren = await page.locator('#root > *').count();
  console.log(`  [OK] Application montée (${rootChildren} nœud(s) racine)`);

  // 2. Du contenu visible, pas seulement un conteneur vide.
  const textLength = (await page.locator('body').innerText()).trim().length;
  if (textLength < 100) {
    throw new Error(`Page quasiment vide : ${textLength} caractères visibles`);
  }
  console.log(`  [OK] Contenu affiché (${textLength} caractères)`);

  // 3. Les repères de l'interface.
  for (const label of ['Carte Live', 'FleetGuard']) {
    if (!(await page.getByText(label, { exact: false }).first().isVisible())) {
      throw new Error(`Élément d'interface introuvable : « ${label} »`);
    }
    console.log(`  [OK] Présent à l'écran : « ${label} »`);
  }

  await page.screenshot({ path: 'smoke-screenshot.png', fullPage: false });
  console.log('  [i]  Capture : smoke-screenshot.png');
} catch (err) {
  console.error(`\n  [ÉCHEC] ${err.message}`);
  exitCode = 1;
}

if (pageErrors.length > 0) {
  console.error(`\n  Exceptions JavaScript (${pageErrors.length}) :`);
  pageErrors.slice(0, 10).forEach(e => console.error(`    - ${e}`));
  exitCode = 1;
}

if (consoleErrors.length > 0) {
  console.error(`\n  Erreurs console (${consoleErrors.length}) :`);
  consoleErrors.slice(0, 10).forEach(e => console.error(`    - ${e}`));
  exitCode = 1;
}

if (failedRequests.length > 0) {
  console.error(`\n  Requêtes en échec (${failedRequests.length}) :`);
  failedRequests.slice(0, 10).forEach(r => console.error(`    - ${r}`));
  exitCode = 1;
}

await browser.close();

console.log(exitCode === 0 ? '\nContrôle de fumée réussi.\n' : '\nContrôle de fumée en échec.\n');
process.exit(exitCode);
