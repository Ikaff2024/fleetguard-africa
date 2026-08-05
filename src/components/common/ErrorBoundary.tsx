import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Nom du module, affiché au support pour situer l'incident. */
  moduleName?: string;
}

interface State {
  error: Error | null;
}

/**
 * Isole les pannes d'un module.
 *
 * Sans cela, une exception dans un seul écran vide toute l'application : un
 * régulateur en poste de nuit perd sa carte live et ses alertes à cause d'un
 * bug dans un tableau de bord annexe.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Phase 5 : remonter vers Sentry avec le tenant et l'utilisateur courants.
    console.error(`[${this.props.moduleName ?? 'module'}]`, error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 rounded-xl p-8 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto" />
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Ce module n'a pas pu s'afficher
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Les autres écrans restent utilisables. Si le problème persiste, communiquez la référence suivante
            au support :
          </p>
          <p className="text-[11px] font-mono text-slate-400 break-all max-w-md mx-auto pt-1">
            {this.props.moduleName ?? 'module'} — {this.state.error.message}
          </p>
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Réessayer
        </button>
      </div>
    );
  }
}
