import { createHash } from 'node:crypto';

/**
 * Génération du service worker.
 *
 * Le fichier est produit à la fin du build, quand la liste des ressources et
 * leurs empreintes sont connues. Écrire ce plugin plutôt que d'ajouter Workbox
 * tient à deux raisons : la règle de cache tient en trente lignes, et le budget
 * de l'écran d'accueil est contrôlé à 260 Ko compressés — une bibliothèque de
 * cache s'y taillerait une part disproportionnée.
 *
 * **Aucune réponse d'API n'est mise en cache.** C'est la règle centrale, et
 * elle n'a rien d'un détail de performance : les données sont cloisonnées par
 * organisation jusque dans PostgreSQL, et un `/vehicles` gardé en cache puis
 * resservi à l'utilisateur suivant sur le même appareil — un poste partagé au
 * dépôt, le cas le plus courant — anéantirait ce cloisonnement. Les écritures
 * faites sans réseau passent par la file IndexedDB, qui les rejoue à la
 * reconnexion.
 */
/** @returns {import('vite').Plugin} */
export function serviceWorkerPlugin() {
  return {
    name: 'fleetguard-service-worker',
    apply: 'build',

    generateBundle(_options, bundle) {
      // Le shell : ce qu'il faut pour afficher l'écran d'accueil hors réseau.
      // Les modules chargés à la demande ne sont pas précachés — les précharger
      // tous coûterait plusieurs mégaoctets sur une 3G de corridor, pour des
      // écrans que l'utilisateur n'ouvrira peut-être pas.
      const shell = Object.keys(bundle).filter(
        name =>
          /^assets\/index-[\w-]+\.(js|css)$/.test(name) ||
          /^assets\/vendor-(react|icons)-[\w-]+\.js$/.test(name),
      );

      // `/` et `/index.html` désignent la même page mais constituent deux
      // entrées de cache distinctes. Les deux sont précachées : le repli de
      // navigation interroge l'une, un accès direct à l'autre.
      const assets = ['/', '/index.html', ...shell.map(name => `/${name}`)];

      // La version dérive du contenu : un déploiement qui ne change rien
      // n'invalide pas le cache, et l'utilisateur ne retélécharge rien.
      const version = createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 12);

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: renderServiceWorker(version, assets),
      });
    },
  };
}

function renderServiceWorker(version, assets) {
  return `/**
 * Service worker de FleetGuard Africa — généré au build, ne pas modifier.
 *
 * Sur un corridor, la coupure réseau est l'état normal, pas l'exception. Sans
 * ce fichier, l'application ne s'ouvre pas du tout hors connexion : la file de
 * saisies hors ligne existe, mais l'écran qui permet de l'alimenter reste
 * inaccessible.
 */

const VERSION = '${version}';
const CACHE = 'fleetguard-shell-' + VERSION;

const SHELL = ${JSON.stringify(assets, null, 2)};

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(SHELL))
      // Le nouveau service worker prend la main sans attendre la fermeture de
      // tous les onglets : un correctif de sécurité ne doit pas rester bloqué
      // derrière un onglet oublié.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /**
   * Les appels d'API ne sont jamais mis en cache.
   *
   * Les données sont cloisonnées par organisation jusque dans la base ; les
   * garder ici les resservirait à l'utilisateur suivant sur le même appareil.
   * Un poste partagé au dépôt suffirait à faire fuir la flotte d'un client
   * vers un autre.
   */
  if (url.pathname.startsWith('/api/')) return;

  // Navigation : le réseau d'abord, pour ne jamais servir une version périmée
  // quand la connexion est là ; le shell en secours quand elle ne l'est pas.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then(cached => cached || caches.match('/')),
      ),
    );
    return;
  }

  // Ressources versionnées : leur nom contient une empreinte de contenu, donc
  // une réponse en cache ne peut pas être périmée.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
`;
}
