/**
 * Vérifie que le cloisonnement entre organisations est visible à l'écran.
 *
 * Les tests d'intégration prouvent que l'API filtre correctement. Ce contrôle
 * répond à une question différente et tout aussi importante : l'interface
 * affiche-t-elle bien ces données filtrées, ou continue-t-elle de montrer autre
 * chose ? Un écran alimenté par un jeu de démonstration passerait les tests
 * d'API sans qu'aucun client ne voie jamais ses propres véhicules.
 *
 * Usage :
 *   node scripts/verify-tenant-isolation-ui.mjs http://localhost:3000
 */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:3000';
const password = process.env.SEED_PASSWORD ?? 'FleetGuard2026!Demo';

const TENANTS = [
  { label: 'TransAfrik (Bénin)', email: 'manager@transafrik.bj' },
  { label: 'Sahel Express (Sénégal)', email: 'manager@sahelexpress.sn' },
];

/** Immatriculations visibles sur l'écran de suivi, pour un compte donné. */
async function platesSeenBy(browser, email) {
  // Contexte isolé : chaque compte a son propre stockage, donc sa propre session.
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: /se connecter/i }).click();

  await page.waitForSelector('text=VÉHICULES EN CIRCULATION', { timeout: 30_000 });

  // Les immatriculations suivent le format des plaques d'Afrique de l'Ouest.
  const text = await page.locator('body').innerText();
  const plates = [...new Set(text.match(/\b[A-Z]{2}-\d{4}-[A-Z]{1,2}\b/g) ?? [])].sort();

  await context.close();
  return plates;
}

const browser = await chromium.launch();
let exitCode = 0;

try {
  console.log(`\nCloisonnement à l'écran : ${url}\n`);

  const results = [];
  for (const tenant of TENANTS) {
    const plates = await platesSeenBy(browser, tenant.email);
    results.push({ ...tenant, plates });
    console.log(`  ${tenant.label.padEnd(26)} ${plates.length} véhicule(s) : ${plates.join(', ')}`);
  }

  const [a, b] = results;

  if (a.plates.length === 0 || b.plates.length === 0) {
    throw new Error("Un des comptes n'affiche aucun véhicule : l'écran ne lit pas les données réelles.");
  }

  const shared = a.plates.filter(plate => b.plates.includes(plate));
  if (shared.length > 0) {
    throw new Error(
      `Véhicule(s) visible(s) par les deux organisations : ${shared.join(', ')}. ` +
        `L'écran n'affiche pas des données cloisonnées.`,
    );
  }

  console.log('\n  [OK] Aucun véhicule commun : le cloisonnement est visible à l’écran.\n');
} catch (err) {
  console.error(`\n  [ÉCHEC] ${err.message}\n`);
  exitCode = 1;
} finally {
  await browser.close();
}

process.exit(exitCode);
