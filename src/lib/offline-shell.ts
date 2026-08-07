/**
 * Enregistrement du service worker.
 *
 * Il rend l'application ouvrable sans réseau. Sans lui, la file de saisies
 * hors ligne restait théorique : elle enregistre bien ce qu'un chauffeur note
 * à Malanville, mais l'écran qui permet de le saisir ne s'affichait pas une
 * fois la connexion perdue.
 *
 * L'enregistrement est volontairement tardif — après le premier rendu — pour
 * ne pas disputer la bande passante aux ressources dont dépend l'affichage.
 * Sur une 3G de corridor, quelques centaines de kilo-octets décalés valent
 * plusieurs secondes gagnées avant le premier écran.
 */

export function registerOfflineShell(): void {
  if (!('serviceWorker' in navigator)) return;

  // En développement, le worker interfère avec le rechargement à chaud et
  // masque les modifications : un cache périmé ferait perdre plus de temps
  // qu'il n'en fait gagner.
  if (import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Un échec d'enregistrement n'empêche pas l'application de fonctionner
      // en ligne : il ne doit donc pas interrompre le démarrage. Le mode hors
      // connexion, lui, ne sera simplement pas disponible.
    });
  });

  /**
   * Une nouvelle version prend la main : la page est rechargée une fois.
   *
   * Sans ce rechargement, l'utilisateur continuerait d'exécuter l'ancien code
   * tout en dialoguant avec la nouvelle API — la source de bogues la plus
   * difficile à reproduire qui soit.
   */
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}
