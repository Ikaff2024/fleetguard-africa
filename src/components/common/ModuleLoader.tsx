import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Indicateur affiché pendant le téléchargement d'un module.
 * Les écrans sont chargés à la demande : sur une liaison 2G/3G, un module
 * annexe ne doit pas retarder l'affichage de la carte live.
 */
export const ModuleLoader: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500 dark:text-slate-400">
    <Loader2 className="w-7 h-7 animate-spin text-orange-500" />
    <p className="text-xs font-medium">{label ?? 'Chargement du module…'}</p>
  </div>
);
