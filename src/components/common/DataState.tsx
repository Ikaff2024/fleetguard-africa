import React from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import type { ApiClientError } from '../../lib/api-client';

interface DataStateProps {
  isLoading: boolean;
  error: ApiClientError | null;
  isEmpty?: boolean;
  onRetry?: () => void;
  emptyLabel?: string;
  emptyHint?: string;
  children: React.ReactNode;
}

/**
 * États de chargement, d'erreur et de vide, traités une fois pour toutes.
 *
 * Ces trois situations sont distinctes et ne doivent jamais se ressembler :
 * « je charge », « je n'ai pas pu charger » et « il n'y a rien » appellent des
 * réactions différentes du gestionnaire de flotte. Les confondre en un tableau
 * vide silencieux, c'est le laisser croire que sa flotte a disparu alors que
 * le réseau a coupé.
 */
export const DataState: React.FC<DataStateProps> = ({
  isLoading,
  error,
  isEmpty = false,
  onRetry,
  emptyLabel = 'Aucune donnée pour le moment',
  emptyHint,
  children,
}) => {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500 dark:text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        <p className="text-xs font-medium">Chargement des données…</p>
      </div>
    );
  }

  if (error) {
    const isNetwork = error.status === 0;
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 px-6 text-center">
        <div className="p-3 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600">
          {isNetwork ? <WifiOff className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {isNetwork ? 'Serveur injoignable' : 'Chargement impossible'}
          </p>
          {/* Le message du serveur est affiché tel quel : « quota dépassé » et
              « accès refusé » n'appellent pas la même action. */}
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">{error.message}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-1 px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Réessayer
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-14 px-6 text-center">
        <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
          <Inbox className="w-6 h-6" />
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{emptyLabel}</p>
        {emptyHint && <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">{emptyHint}</p>}
      </div>
    );
  }

  return <>{children}</>;
};
