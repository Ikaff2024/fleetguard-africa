/**
 * Contrôle du fonctionnement hors connexion.
 *
 * Un service worker peut s'enregistrer sans rien mettre en cache d'utile, et
 * la panne ne se voit qu'au moment où l'utilisateur en a besoin : sur la route,
 * sans réseau, quand il est trop tard. Le seul contrôle qui vaille consiste à
 * couper réellement la connexion dans un navigateur et à vérifier que l'écran
 * s'affiche.
 *
 * Deux points sont vérifiés :
 *   1. l'application se charge une fois le réseau coupé ;
 *   2. aucune réponse d'API n'est servie depuis le cache — les données sont
 *      cloisonnées par organisation, et un poste partagé au dépôt ne doit
 *      jamais montrer la flotte du client précédent.
 *
 * Usage : node scripts/verify-offline-shell.mjs http://localhost:3000
 */
import { chromium } from 'playwright';

const baseUrl = process.argv[2] ?? 'http://localhost:3000';

const ok = message => console.log(`  [OK] ${message}`);
const fail = message => {
  console.error(`  [ÉCHEC] ${message}`);
  process.exitCode = 1;
};

console.log(`\nFonctionnement hors connexion : ${baseUrl}\n`);

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

try {
  /**
   * Une première visite ne doit pas recharger la page.
   *
   * Le worker s'installe puis réclame le contrôle, ce qui déclenche
   * `controllerchange` alors que le code affiché est déjà le bon. Recharger à
   * ce moment ferait clignoter l'écran de chaque nouvel utilisateur.
   */
  let navigations = 0;
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) navigations++;
  });

  // 1. Première visite en ligne : le service worker s'installe et précache.
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  const registered = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;
    await navigator.serviceWorker.ready;
    return true;
  });

  if (registered) ok('Service worker enregistré');
  else {
    fail("Aucun service worker enregistré — l'application ne s'ouvrira pas hors réseau");
    await browser.close();
    process.exit(1);
  }

  // La prise de contrôle a lieu pendant cette attente : c'est le moment où un
  // rechargement intempestif se produirait.
  await page.waitForTimeout(2000);
  if (navigations <= 1) ok('Aucun rechargement parasite à la première visite');
  else fail(`La page s'est rechargée ${navigations - 1} fois à la première visite`);

  // Le précache se remplit pendant l'installation ; on attend qu'il contienne
  // le shell plutôt que de temporiser au hasard.
  const cached = await page.evaluate(async () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const names = await caches.keys();
      for (const name of names) {
        const cache = await caches.open(name);
        const entries = await cache.keys();
        if (entries.length >= 4) return entries.map(request => new URL(request.url).pathname);
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return [];
  });

  if (cached.length > 0) ok(`Shell précaché (${cached.length} ressources)`);
  else fail('Le précache est vide');

  // 2. Contrôle décisif : aucune réponse d'API ne doit avoir été gardée.
  const cachedApi = cached.filter(pathname => pathname.startsWith('/api/'));
  if (cachedApi.length === 0) {
    ok('Aucune réponse d’API en cache (cloisonnement préservé)');
  } else {
    fail(`Réponses d'API mises en cache : ${cachedApi.join(', ')} — fuite possible entre clients`);
  }

  /**
   * Le worker doit avoir pris le contrôle de la page avant de couper le réseau.
   *
   * Précacher ne suffit pas : tant que `controller` est nul, les requêtes ne
   * passent pas par le gestionnaire `fetch` et rien ne sera servi depuis le
   * cache. Attendre cette condition plutôt qu'un délai arbitraire évite un
   * contrôle qui passerait ou échouerait selon la charge de la machine.
   */
  const controlled = await page.evaluate(async () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (navigator.serviceWorker.controller) return true;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return false;
  });

  if (controlled) ok('Page sous contrôle du service worker');
  else fail('Le service worker ne contrôle pas la page — rien ne sera servi hors réseau');

  // 3. Réseau coupé : l'application doit tout de même s'afficher.
  await context.setOffline(true);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const nodes = await page.locator('#root > *').count();
  const pageText = (await page.locator('body').innerText()).trim();

  if (nodes > 0 && pageText.length > 50) {
    ok(`Application affichée hors connexion (${pageText.length} caractères)`);
  } else {
    fail(`Écran vide hors connexion (${nodes} nœud(s), ${pageText.length} caractères)`);
    await page.screenshot({ path: 'offline-screenshot.png' });
    console.log('  [i]  Capture : offline-screenshot.png');
  }

  if (pageText.includes('FleetGuard')) ok('Identité de l’application présente à l’écran');
  else fail('« FleetGuard » absent de la page hors connexion');

  /**
   * Scénario du terrain : un exploitant connecté perd le réseau, puis rouvre
   * l'application. Il doit retrouver son espace de travail — c'est là que se
   * trouve la file de saisies hors ligne. La version précédente le renvoyait à
   * l'écran de connexion et effaçait son jeton au passage.
   */
  const account = process.env.OFFLINE_CHECK_EMAIL;
  const password = process.env.OFFLINE_CHECK_PASSWORD;

  if (!account || !password) {
    console.log('  [i]  Session hors connexion non contrôlée (identifiants absents)');
  } else {
    await context.setOffline(false);
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    await page.fill('input[type="email"]', account);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForSelector('nav', { timeout: 25000 });
    ok('Session ouverte en ligne');

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const hasNav = (await page.locator('nav').count()) > 0;
    const askingLogin = (await page.locator('input[type="password"]').count()) > 0;

    if (hasNav && !askingLogin) {
      ok('Espace de travail conservé après rechargement hors connexion');
    } else {
      fail('Retour à l’écran de connexion hors réseau — la file de saisies devient inatteignable');
    }

    // Le jeton doit survivre : sans lui, l'utilisateur est déconnecté pour de
    // bon dès qu'il retrouve le réseau.
    const tokenKept = await page.evaluate(() => Boolean(localStorage.getItem('fleetguard.refreshToken')));
    if (tokenKept) ok('Jeton de session préservé malgré la coupure');
    else fail('Jeton effacé par une simple panne réseau');
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
}

console.log(
  process.exitCode === 1 ? '\nContrôle hors connexion en échec.\n' : '\nContrôle hors connexion réussi.\n',
);
