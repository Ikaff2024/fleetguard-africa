import React, { useState } from 'react';
import { AlertCircle, Loader2, LogIn, ShieldCheck, Truck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ApiClientError } from '../../lib/api-client';

/**
 * Écran de connexion.
 *
 * Volontairement sobre et léger : c'est le premier écran chargé, souvent sur
 * une liaison mobile lente, et il ne dépend d'aucune bibliothèque graphique.
 */
export const LoginPage: React.FC = () => {
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch (err) {
      // Le message du serveur est affiché tel quel : « compte verrouillé » et
      // « identifiants incorrects » n'appellent pas la même réaction.
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Connexion impossible. Vérifiez votre réseau et réessayez.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f19] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-500 text-white shadow-lg">
            <Truck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-50">
            FleetGuard <span className="text-orange-600">Africa</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Gestion intelligente de flotte — corridors routiers africains
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider"
            >
              Adresse e-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition disabled:opacity-60"
              placeholder="prenom.nom@entreprise.bj"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider"
            >
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition disabled:opacity-60"
              placeholder="••••••••••••"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-800 dark:text-red-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !email || !password}
            className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connexion…
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Se connecter
              </>
            )}
          </button>
        </form>

        <div className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400 px-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
          <p>
            Vos données de flotte sont cloisonnées par organisation au niveau de la base de données. Les accès
            aux dossiers nominatifs des chauffeurs sont journalisés.
          </p>
        </div>
      </div>
    </div>
  );
};
