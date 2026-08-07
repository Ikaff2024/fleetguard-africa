import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import unusedImports from 'eslint-plugin-unused-imports';

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'node_modules', 'src/generated', '*.config.js'],
  },

  // Base commune TypeScript
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Front React
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'unused-imports': unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // `rules-of-hooks` reste bloquant : une violation casse le rendu en production.
      'react-hooks/rules-of-hooks': 'error',

      // Règles issues du React Compiler (react-hooks v7). Elles signalent de la dette
      // réelle (re-rendus en cascade, composants recréés au rendu) mais leur correction
      // demande une refonte ciblée : suivies en dette technique, non bloquantes.
      // Voir PRODUCTION_PLAN.md § Dette technique.
      'react-hooks/static-components': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',

      // Imports morts : supprimés automatiquement par `npm run lint:fix`.
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],

      // Le typage est la seule barrière entre deux tenants : `any` doit rester visible.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Serveur / scripts Node
  {
    files: [
      'server.ts',
      'prisma/**/*.ts',
      'prisma.config.ts',
      'tests/**/*.ts',
      'src/server/**/*.ts',
      'scripts/**/*.{ts,mjs,js}',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  {
    // Ce contrôle interroge le cache du navigateur, l'enregistrement du service
    // worker et le stockage local — trois choses qu'aucun locator Playwright
    // n'atteint. Le code passé à `page.evaluate` s'exécute dans la page, pas
    // dans Node : les globales du navigateur y sont donc légitimes.
    files: ['scripts/verify-offline-shell.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // Prettier en dernier : désactive toute règle de formatage conflictuelle
  prettier,
);
