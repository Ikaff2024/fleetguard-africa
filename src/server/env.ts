import { z } from 'zod';

/**
 * Validation fail-fast de la configuration.
 *
 * Un SaaS multi-tenant ne doit jamais démarrer à moitié configuré : une variable
 * manquante en production doit empêcher le boot, pas produire un comportement
 * dégradé silencieux découvert par le client.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Imposé par la plupart des plateformes (Cloud Run, Render, Scaleway, Fly.io) :
  // le port est injecté à l'exécution et ne peut pas être codé en dur.
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Origines autorisées, séparées par des virgules. Vide = même origine uniquement.
  CORS_ORIGINS: z.string().default(''),

  // Nombre de proxies de confiance en amont (load balancer, CDN).
  // Nécessaire pour que le rate limiting voie la vraie IP cliente.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  // L'IA est facturée au token : quota beaucoup plus serré que les routes de lecture.
  RATE_LIMIT_AI_MAX: z.coerce.number().int().positive().default(10),

  GEMINI_API_KEY: z.string().min(1).optional(),

  /**
   * Clé du fournisseur de tuiles cartographiques.
   *
   * Sans elle, la carte retombe sur les tuiles OpenStreetMap publiques, dont la
   * politique d'utilisation interdit l'usage commercial. L'application le
   * signale à l'écran plutôt que de le laisser dans un fichier de
   * configuration que personne ne relit.
   */
  MAPTILER_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().default('gemini-3.6-flash'),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),

  /**
   * Mode démonstration de l'IA.
   *
   * À `false` (défaut), une IA indisponible renvoie une erreur explicite.
   * À `true`, l'API renvoie un exemple **marqué `isSimulated: true`**, que
   * l'interface signale visuellement.
   *
   * Ce garde-fou est délibéré : la version initiale renvoyait un diagnostic
   * fabriqué ("48.5 L/100km, siphonnage probable") avec un statut 200 quand la
   * clé manquait. Un gestionnaire pouvait sanctionner un chauffeur sur cette
   * base. Une donnée inventée ne doit jamais être indiscernable d'une vraie.
   */
  AI_DEMO_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),

  // Optionnels en développement (mode démonstration sans infrastructure),
  // obligatoires en production — voir les garde-fous ci-dessous.
  // Connexion propriétaire : migrations, seed, outillage.
  DATABASE_URL: z.string().optional(),
  /**
   * Connexion applicative, soumise au Row-Level Security.
   *
   * Doit désigner un rôle NON superutilisateur et NON BYPASSRLS. PostgreSQL
   * exempte les superutilisateurs du RLS **même avec FORCE ROW LEVEL SECURITY** :
   * utiliser le propriétaire de la base ici annule silencieusement toute
   * l'isolation entre clients. Le démarrage vérifie ce point.
   */
  DATABASE_APP_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit faire au moins 32 caractères').optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map(issue => `  - ${issue.path.join('.') || '(racine)'} : ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration d'environnement invalide :\n${details}`);
  }

  const env = parsed.data;

  // Garde-fous propres à la production, vérifiés au démarrage.
  if (env.NODE_ENV === 'production') {
    const fatals: string[] = [];

    if (env.AI_DEMO_MODE) {
      fatals.push(
        'AI_DEMO_MODE=true est interdit en production : des analyses simulées seraient servies à de vrais clients.',
      );
    }

    // Sans base de données, l'API bascule en mode démonstration : elle accepte
    // un en-tête `X-Organization-Id` sans authentification. Servir cela en
    // production reviendrait à exposer une API ouverte. Le service doit refuser
    // de démarrer plutôt que de se dégrader silencieusement.
    if (!env.DATABASE_URL) {
      fatals.push(
        "DATABASE_URL est requis en production : sans base, l'API fonctionnerait sans authentification.",
      );
    }
    if (!env.JWT_SECRET) {
      fatals.push('JWT_SECRET est requis en production : sans lui, aucune session ne peut être signée.');
    }

    if (fatals.length > 0) {
      throw new Error(`Configuration de production refusée :\n${fatals.map(f => `  - ${f}`).join('\n')}`);
    }
  }

  return env;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Origines CORS normalisées. */
export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map(o => o.trim())
  .filter(Boolean);
