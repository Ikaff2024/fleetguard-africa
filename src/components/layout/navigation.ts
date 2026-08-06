/**
 * Écrans de l'application et permission requise par chacun.
 *
 * Ces tables vivent hors du composant de navigation : elles servent aussi à
 * choisir l'écran d'accueil selon le rôle, et un module qui n'exporte que des
 * constantes ne casse pas le rechargement à chaud des composants.
 */

export type NavigationTab =
  'live-map' | 'alerts' | 'trips' | 'fleet' | 'scoring' | 'rewards' | 'maintenance-fuel' | 'ai-hub';

/**
 * La permission est confrontée au profil renvoyé par le serveur à la
 * connexion, et non à une copie locale de la matrice des rôles qui dériverait
 * au premier changement côté API. Le filtrage reste cosmétique : c'est le
 * serveur qui refuse, ici on évite seulement de proposer un écran qui
 * répondrait « accès refusé ».
 */
export const NAV_PERMISSIONS: Record<NavigationTab, string> = {
  'live-map': 'tracking:read',
  alerts: 'alerts:read',
  trips: 'tracking:read',
  fleet: 'fleet:read',
  scoring: 'scoring:read',
  rewards: 'scoring:read',
  'maintenance-fuel': 'maintenance:read',
  'ai-hub': 'intelligence:use',
};

/** Ordre d'affichage, qui fixe aussi l'écran d'accueil selon le rôle. */
export const NAV_ORDER: NavigationTab[] = [
  'live-map',
  'alerts',
  'trips',
  'fleet',
  'scoring',
  'rewards',
  'maintenance-fuel',
  'ai-hub',
];
