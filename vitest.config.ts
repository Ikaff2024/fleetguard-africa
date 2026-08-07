import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    /**
     * Limiteur de débit desserré pour la suite, et pour elle seule.
     *
     * La protection réelle est de 300 requêtes par minute et par adresse. Les
     * suites d'API en émettent bien davantage depuis la même adresse, en
     * parallèle : à partir d'un certain nombre de fichiers, des connexions
     * commençaient à être refusées et des tests échouaient sans que le code
     * vérifié soit en cause.
     *
     * La valeur de production reste figée par un contrôle dédié
     * (`tests/rate-limit.test.ts`) : la desserrer ici ne doit pas revenir à
     * cesser de la vérifier.
     */
    env: {
      RATE_LIMIT_MAX: '100000',
      RATE_LIMIT_WINDOW_MS: '60000',
    },
    /**
     * Délai par test, relevé pour les suites d'intégration.
     *
     * Une grande partie de ces tests interroge une vraie base PostgreSQL, et
     * les fichiers s'exécutent en parallèle. Sous cette charge, un appel
     * dépassait les 5 secondes par défaut et le test échouait sur un délai —
     * pas sur le comportement vérifié.
     *
     * Un défaut réel continue d'échouer immédiatement, avec son message : ce
     * réglage ne masque que l'attente.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/data/scoring-engine.ts', 'src/services/**', 'src/lib/**'],
      // Le moteur de scoring pilote les sanctions et les primes des chauffeurs :
      // il doit rester couvert à un niveau élevé.
      thresholds: {
        'src/data/scoring-engine.ts': {
          statements: 90,
          branches: 85,
          functions: 100,
          lines: 90,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
