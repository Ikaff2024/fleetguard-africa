import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
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
