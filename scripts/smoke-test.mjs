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

/**
 * Bruit de développement à ignorer : le rechargement à chaud de Vite n'existe
 * pas en production et ses avertissements ne disent rien de la santé de la page.
 */
const IGNORED_CONSOLE = [
  /\[vite\]/i,
  /websocket/i,
  /HMR/i,
  // Le navigateur journalise tout code >= 400, y compris ceux que
  // l'application traite (session absente, mode démonstration).
  /Failed to load resource/i,
];

/**
 * Seules les ressources de la page comptent.
 *
 * Un script ou une feuille de style en échec rend la page inutilisable — c'est
 * exactement la panne qu'on cherche à détecter. Un appel d'API qui répond 401
 * ou 503 est, lui, un état applicatif géré par l'interface : le signaler comme
 * une panne rendrait ce contrôle inexploitable.
 */
const PAGE_RESOURCES = new Set(['document', 'script', 'stylesheet', 'font']);

page.on('console', msg => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  if (IGNORED_CONSOLE.some(pattern => pattern.test(text))) return;
  consoleErrors.push(text);
});
page.on('pageerror', err => {
  // Idem pour les exceptions : celles du client de rechargement à chaud ne
  // concernent pas le code applicatif.
  if (IGNORED_CONSOLE.some(pattern => pattern.test(err.message))) return;
  pageErrors.push(err.message);
});
page.on('requestfailed', req => {
  if (!PAGE_RESOURCES.has(req.resourceType())) return;
  failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'échec'}`);
});
page.on('response', res => {
  if (res.status() >= 400 && PAGE_RESOURCES.has(res.request().resourceType())) {
    failedRequests.push(`HTTP ${res.status()} ${res.url()}`);
  }
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

  // 3. Marque présente dans les deux états possibles.
  if (!(await page.getByText('FleetGuard', { exact: false }).first().isVisible())) {
    throw new Error("Élément d'interface introuvable : « FleetGuard »");
  }
  console.log('  [OK] Présent à l’écran : « FleetGuard »');

  /**
   * L'application peut légitimement s'ouvrir sur deux écrans :
   *   - la connexion, quand une base de données est configurée ;
   *   - l'espace de travail, en mode démonstration.
   * Les deux sont des succès ; ce qui compte, c'est qu'un écran s'affiche.
   */
  const loginVisible = await page
    .getByRole('button', { name: /se connecter/i })
    .isVisible()
    .catch(() => false);

  if (loginVisible) {
    console.log('  [OK] Écran de connexion affiché (authentification requise)');

    // Si des identifiants sont fournis, on va jusqu'au bout : c'est le seul
    // moyen de vérifier que l'espace de travail se charge après connexion.
    const email = process.env.SMOKE_EMAIL;
    const password = process.env.SMOKE_PASSWORD;

    if (email && password) {
      await page.fill('#email', email);
      await page.fill('#password', password);
      await page.getByRole('button', { name: /se connecter/i }).click();

      await page.waitForSelector('text=Carte Live', { timeout: 20_000 });
      console.log('  [OK] Connexion réussie, espace de travail chargé');

      const workspaceText = (await page.locator('body').innerText()).trim().length;
      console.log(`  [OK] Espace de travail affiché (${workspaceText} caractères)`);
    } else {
      console.log('  [i]  SMOKE_EMAIL/SMOKE_PASSWORD absents : connexion non testée');
    }
  } else {
    await page.waitForSelector('text=Carte Live', { timeout: 10_000 });
    console.log('  [OK] Espace de travail affiché (mode démonstration)');
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
