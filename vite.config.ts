import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { serviceWorkerPlugin } from './scripts/vite-plugin-service-worker.mjs';

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerPlugin()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    // Cible resserrée : navigateurs supportant les modules ES natifs.
    // Moins de transpilation, donc moins d'octets à télécharger.
    target: 'es2022',
    // `hidden` : les sources restent disponibles pour l'outil de suivi
    // d'erreurs, sans être exposées au public via un commentaire dans le bundle.
    sourcemap: 'hidden',
    // Le découpage par route ramène chaque écran sous ce seuil.
    chunkSizeWarningLimit: 400,

    rollupOptions: {
      output: {
        /**
         * Les bibliothèques tierces sont isolées par famille.
         *
         * Sur les forfaits data africains, ce découpage est un gain direct :
         * un déploiement qui ne touche que le code métier laisse les paquets
         * `vendor` en cache, et l'utilisateur ne retélécharge que quelques Ko.
         *
         * L'ordre des tests compte : `lucide-react` et `react-dom` contiennent
         * tous deux la chaîne « react ».
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'vendor-charts';
          if (id.includes('leaflet')) return 'vendor-map';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('motion') || id.includes('framer')) return 'vendor-motion';
          if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
          // Le reliquat est laissé à Rollup : un groupe « commun » forcé créait
          // un cycle vendor-common ↔ vendor-react, source d'erreurs d'init.
          return undefined;
        },
      },
    },
  },

  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
