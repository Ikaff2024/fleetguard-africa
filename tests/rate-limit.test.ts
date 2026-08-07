import { describe, expect, it } from 'vitest';

/**
 * Limiteur de débit.
 *
 * La suite d'API émet bien plus de requêtes qu'un utilisateur réel : la limite
 * est donc desserrée dans `vitest.config.ts`. Ce contrôle existe pour que
 * desserrer ne revienne pas à cesser de vérifier — la valeur qui protège la
 * production est figée ici, indépendamment de l'environnement de test.
 */
describe('Protection contre les rafales de requêtes', () => {
  it('conserve les seuils de production dans le schéma d’environnement', async () => {
    // Les valeurs sont lues sur le schéma, pas sur l'environnement courant :
    // c'est le défaut appliqué en production qui est vérifié.
    const { envSchema } = await import('../src/server/env.js');
    const defaults = envSchema.parse({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      JWT_SECRET: 'x'.repeat(32),
    });

    expect(defaults.RATE_LIMIT_MAX).toBe(300);
    expect(defaults.RATE_LIMIT_WINDOW_MS).toBe(60_000);
    // L'analyse par IA coûte cher à chaque appel : sa limite reste très basse.
    expect(defaults.RATE_LIMIT_AI_MAX).toBeLessThanOrEqual(20);
  });
});
