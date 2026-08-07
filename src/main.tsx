import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { registerOfflineShell } from './lib/offline-shell';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Après le rendu : le mode hors connexion ne doit pas retarder le premier écran.
registerOfflineShell();
