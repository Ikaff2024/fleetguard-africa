import cors from 'cors';
import type { Express, RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import helmet from 'helmet';
import { corsOrigins, env, isProduction } from '../env.js';
import { logger } from '../logger.js';
import { ApiError } from './errors.js';

/**
 * Politique de sécurité de contenu.
 *
 * Les tuiles cartographiques sont servies par un fournisseur externe : c'est la
 * seule origine distante autorisée pour les images. Aucun script externe n'est
 * permis — Leaflet est empaqueté avec l'application, plus chargé depuis un CDN.
 */
const TILE_HOSTS = [
  'https://*.tile.openstreetmap.org',
  'https://*.basemaps.cartocdn.com',
  'https://server.arcgisonline.com',
  'https://*.maptiler.com',
];

export function applySecurity(app: Express) {
  // Indispensable derrière un load balancer : sans cela le rate limiting
  // compte toutes les requêtes sur l'IP du proxy et bloque tout le monde.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // En développement, Vite injecte son préambule de rechargement à
          // chaud sous forme de script inline : sans cette tolérance, la page
          // reste blanche en local. La production conserve `'self'` seul.
          scriptSrc: isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'"],
          // Tailwind injecte des styles à l'exécution.
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', ...TILE_HOSTS],
          // Le rechargement à chaud passe par un websocket local.
          connectSrc: isProduction
            ? ["'self'", ...TILE_HOSTS]
            : ["'self'", 'ws://localhost:*', 'ws://127.0.0.1:*', ...TILE_HOSTS],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      // Les tuiles proviennent d'une autre origine.
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
    }),
  );

  app.use(
    cors((req, callback) => {
      const origin = req.headers.origin;

      // Pas d'en-tête Origin : navigation classique, appel serveur à serveur,
      // sonde de disponibilité. Rien à arbitrer.
      if (!origin) {
        return callback(null, { origin: true, credentials: true, maxAge: 86_400 });
      }

      // Une requête vers sa propre origine est toujours légitime.
      //
      // Ce cas doit être traité avant la liste blanche : les navigateurs
      // envoient un en-tête `Origin` sur des requêtes same-origin (POST,
      // ressources en mode no-cors). Sans cette exception, une liste blanche
      // vide ou mal renseignée empêche la page de charger ses propres scripts
      // et feuilles de style — l'application se bloque elle-même.
      const forwardedHost = req.headers['x-forwarded-host'];
      const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.headers.host;
      const forwardedProto = req.headers['x-forwarded-proto'];
      const proto =
        (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ||
        (isProduction ? 'https' : 'http');

      if (host && origin === `${proto}://${host}`) {
        return callback(null, { origin: true, credentials: true, maxAge: 86_400 });
      }

      // Origine tierce : soumise à la liste blanche.
      if (corsOrigins.includes(origin)) {
        return callback(null, { origin: true, credentials: true, maxAge: 86_400 });
      }

      // Hors production, on n'entrave pas le travail local (outils, ports variés).
      if (!isProduction) {
        return callback(null, { origin: true, credentials: true, maxAge: 86_400 });
      }

      logger.warn({ origin, host }, 'Origine CORS tierce rejetée');
      // Pas d'erreur levée : le navigateur applique la politique en constatant
      // l'absence d'en-tête `Access-Control-Allow-Origin`. Lever une exception
      // transformerait un refus CORS en erreur 500 côté serveur.
      return callback(null, { origin: false });
    }),
  );
}

/** Limiteur global : protège l'API des boucles de retry et du scraping. */
export const globalRateLimit: RequestHandler = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: () => {
    throw new ApiError(429, 'Trop de requêtes. Réessayez dans quelques instants.', 'RATE_LIMITED');
  },
});

/**
 * Limiteur dédié aux routes d'IA, facturées au token.
 * Sans lui, une boucle côté client peut vider le budget mensuel en une nuit.
 */
export const aiRateLimit: RequestHandler = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_AI_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Le quota se compte par organisation, pas par IP : plusieurs utilisateurs
  // d'un même client partagent souvent une seule sortie internet.
  // `ipKeyGenerator` normalise l'IPv6 par sous-réseau /64 — sans lui, un client
  // IPv6 change d'adresse à chaque requête et contourne toute limite.
  keyGenerator: req => req.header('x-organization-id') ?? ipKeyGenerator(req.ip ?? 'anonyme'),
  handler: () => {
    throw new ApiError(
      429,
      "Quota d'analyses IA atteint pour votre organisation. Réessayez dans une minute.",
      'AI_RATE_LIMITED',
    );
  },
});

/**
 * Limiteur d'ingestion télémétrique : volumétrique par nature, il doit rester
 * généreux tout en plafonnant un boîtier devenu fou.
 */
export const ingestionRateLimit: RequestHandler = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: req => req.header('x-device-id') ?? ipKeyGenerator(req.ip ?? 'anonyme'),
  handler: () => {
    throw new ApiError(429, "Débit d'ingestion dépassé pour cet équipement.", 'INGESTION_RATE_LIMITED');
  },
});
