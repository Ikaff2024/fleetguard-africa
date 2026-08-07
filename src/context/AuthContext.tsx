import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ApiClientError,
  type AuthSession,
  type SessionUser,
  apiClient,
  getStoredRefreshToken,
  readSessionSnapshot,
  storeSessionSnapshot,
  setAccessToken,
  setSessionLostHandler,
  storeRefreshToken,
} from '../lib/api-client';

/**
 * État d'authentification de l'application.
 *
 * Trois situations sont distinguées, et l'interface doit réagir différemment
 * à chacune :
 *   - `authenticated` : session valide ;
 *   - `anonymous` : le serveur exige une connexion ;
 *   - `demonstration` : le serveur tourne sans base de données, aucun compte
 *     n'existe et l'application reste explorable avec le jeu de démonstration.
 *
 * Ce dernier cas n'est pas un contournement : le serveur refuse de démarrer en
 * production sans base de données ni secret de signature.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'demonstration';

interface CurrentUserResponse {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: string;
  avatarUrl: string | null;
  permissions: string[];
  organization: {
    id: string;
    name: string;
    code: string;
    country: string;
    currency: string;
    timezone: string;
  };
}

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  permissions: string[];
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  const applySession = useCallback((session: AuthSession) => {
    setAccessToken(session.accessToken);
    storeRefreshToken(session.refreshToken);
    setUser(session.user);
    setStatus('authenticated');
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    storeRefreshToken(null);
    storeSessionSnapshot(null);
    setUser(null);
    setPermissions([]);
    setStatus('anonymous');
  }, []);

  /** Retient de quoi rouvrir l'interface sans réseau. */
  const rememberSession = useCallback((session: SessionUser, granted: string[]) => {
    storeSessionSnapshot({
      user: {
        id: session.id,
        email: session.email,
        fullName: session.fullName,
        role: session.role,
        organizationId: session.organizationId,
        organizationName: session.organizationName,
      },
      permissions: granted,
    });
  }, []);

  /**
   * Détermination de l'état au démarrage.
   *
   * On interroge `/auth/me` : sa réponse dit à la fois si une session est
   * valide et si le serveur exige une authentification. Un `503` signale un
   * serveur sans base, donc le mode démonstration.
   */
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const me = await apiClient.get<CurrentUserResponse>('/auth/me', { skipAuthRetry: true });
        if (cancelled) return;

        setUser({
          id: me.id,
          email: me.email,
          fullName: me.fullName,
          role: me.role,
          organizationId: me.organization.id,
          organizationName: me.organization.name,
        });
        setPermissions(me.permissions);
        rememberSession(
          {
            id: me.id,
            email: me.email,
            fullName: me.fullName,
            role: me.role,
            organizationId: me.organization.id,
            organizationName: me.organization.name,
          },
          me.permissions,
        );
        setStatus('authenticated');
      } catch (err) {
        if (cancelled) return;

        if (err instanceof ApiClientError && err.code === 'AUTH_UNAVAILABLE') {
          setStatus('demonstration');
          return;
        }

        /**
         * Réseau absent : la session est conservée telle quelle.
         *
         * Effacer le jeton ici — ce que faisait la version précédente —
         * déconnectait définitivement un chauffeur pour la seule raison qu'il
         * avait ouvert l'application sous un tunnel. L'interface se rouvre
         * depuis l'empreinte locale ; elle n'ouvre aucun droit supplémentaire,
         * puisque toute donnée vient d'une API injoignable, et le serveur
         * reconfronte le jeton dès le retour du réseau.
         */
        if (err instanceof ApiClientError && err.isNetworkError) {
          const snapshot = readSessionSnapshot();
          if (snapshot && getStoredRefreshToken()) {
            setUser(snapshot.user);
            setPermissions(snapshot.permissions);
            setStatus('authenticated');
            return;
          }
        }

        // Session absente ou expirée : une rotation est tentée si un jeton de
        // rafraîchissement subsiste d'une visite précédente.
        if (getStoredRefreshToken()) {
          try {
            const me = await apiClient.get<CurrentUserResponse>('/auth/me');
            if (cancelled) return;
            setUser({
              id: me.id,
              email: me.email,
              fullName: me.fullName,
              role: me.role,
              organizationId: me.organization.id,
              organizationName: me.organization.name,
            });
            setPermissions(me.permissions);
            rememberSession(
              {
                id: me.id,
                email: me.email,
                fullName: me.fullName,
                role: me.role,
                organizationId: me.organization.id,
                organizationName: me.organization.name,
              },
              me.permissions,
            );
            setStatus('authenticated');
            return;
          } catch {
            /* rotation impossible : connexion requise */
          }
        }

        if (!cancelled) clearSession();
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  // Le client HTTP signale une session définitivement perdue.
  useEffect(() => {
    setSessionLostHandler(() => clearSession());
    return () => setSessionLostHandler(null);
  }, [clearSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await apiClient.post<AuthSession>(
        '/auth/login',
        { email, password },
        { skipAuthRetry: true },
      );
      applySession(session);

      const me = await apiClient.get<CurrentUserResponse>('/auth/me');
      setPermissions(me.permissions);
      // L'empreinte est posée dès la connexion : c'est elle qui permettra de
      // rouvrir l'interface si le réseau vient à manquer.
      rememberSession(
        {
          id: me.id,
          email: me.email,
          fullName: me.fullName,
          role: me.role,
          organizationId: me.organization.id,
          organizationName: me.organization.name,
        },
        me.permissions,
      );
    },
    [applySession, rememberSession],
  );

  const logout = useCallback(async () => {
    const refreshToken = getStoredRefreshToken();
    try {
      await apiClient.post('/auth/logout', { refreshToken }, { skipAuthRetry: true });
    } catch {
      // Une déconnexion ne doit jamais rester bloquée côté client.
    }
    clearSession();
  }, [clearSession]);

  const hasPermission = useCallback(
    (permission: string) =>
      // La chaîne vide vaut « aucun droit requis » : c'est le cas du guide
      // d'utilisation, dont le chauffeur a autant besoin que le directeur.
      permission === '' ||
      // En démonstration, aucun compte n'existe : tous les modules sont
      // explorables.
      status === 'demonstration' ||
      permissions.includes(permission),
    [permissions, status],
  );

  const value = useMemo(
    () => ({ status, user, permissions, login, logout, hasPermission }),
    [status, user, permissions, login, logout, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth doit être utilisé à l'intérieur d'un AuthProvider.");
  }
  return context;
}
