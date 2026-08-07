/**
 * Client HTTP unique de l'application.
 *
 * Il centralise trois responsabilités qui, dispersées, produisent des bogues
 * difficiles à diagnostiquer :
 *   - joindre le jeton d'accès à chaque requête ;
 *   - renouveler silencieusement une session expirée et rejouer la requête ;
 *   - remonter le message d'erreur réel du serveur plutôt qu'un texte générique.
 */

/** Erreur d'API portant le code et le statut renvoyés par le serveur. */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** Vrai quand la panne est transitoire et qu'un nouvel essai a du sens. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }

  /** Vrai quand la session doit être réétablie. */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /**
   * Vrai quand la requête n'a pas atteint le serveur.
   *
   * La distinction est essentielle : un serveur qui refuse une session et un
   * réseau absent demandent des réponses opposées. Confondre les deux revient
   * à déconnecter un chauffeur parce qu'il est passé sous un tunnel.
   */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  organizationId: string;
  organizationName: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  user: SessionUser;
}

/**
 * Le jeton d'accès reste en mémoire : il n'a que 15 minutes de vie et ne
 * survit pas volontairement à un rechargement.
 *
 * Le jeton de rafraîchissement est conservé dans `localStorage` pour éviter une
 * reconnexion à chaque ouverture d'onglet. C'est un compromis assumé : un
 * cookie `httpOnly` résisterait mieux à une injection de script. La politique
 * de sécurité de contenu, qui interdit tout script externe, constitue la
 * contre-mesure actuelle. Voir PRODUCTION_PLAN.md § Dette technique.
 */
const REFRESH_TOKEN_STORAGE_KEY = 'fleetguard.refreshToken';

let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

/**
 * Organisation courante du mode démonstration.
 *
 * Utilisée uniquement quand aucune session n'existe — c'est ce qui permet au
 * sélecteur d'organisation de la barre supérieure de continuer à fonctionner
 * sur une instance sans base de données. Dès qu'un jeton est présent, cette
 * valeur n'est plus transmise : le serveur lit le tenant dans le jeton signé.
 */
let demoOrganizationId: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setDemoOrganizationId(organizationId: string | null): void {
  demoOrganizationId = organizationId;
}

export function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    // Navigation privée ou stockage désactivé : la session reste valable le
    // temps de l'onglet.
    return null;
  }
}

export function storeRefreshToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    /* stockage indisponible : sans effet */
  }
}

/**
 * Empreinte de la session, pour l'ouverture sans réseau.
 *
 * Elle ne contient que de quoi afficher l'interface : identité, rôle,
 * organisation, permissions. **Aucune donnée de flotte n'y figure** — celles-ci
 * viennent de l'API, dont chaque réponse est bornée par le Row-Level Security.
 * Un appareil hors réseau affiche donc le cadre de travail et la file de
 * saisies, jamais les données d'un client.
 *
 * L'empreinte survit à un rechargement hors connexion, et disparaît à la
 * déconnexion. Elle ne prolonge aucun droit : dès le retour du réseau, le jeton
 * est reconfronté au serveur, qui reste seul juge.
 */
const SESSION_SNAPSHOT_KEY = 'fleetguard.session';

export interface SessionSnapshot {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    organizationId: string;
    organizationName: string;
  };
  permissions: string[];
}

export function readSessionSnapshot(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(SESSION_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionSnapshot;
    // Une empreinte tronquée vaut mieux ignorée qu'à moitié appliquée.
    return parsed?.user?.id && Array.isArray(parsed.permissions) ? parsed : null;
  } catch {
    return null;
  }
}

export function storeSessionSnapshot(snapshot: SessionSnapshot | null): void {
  try {
    if (snapshot) localStorage.setItem(SESSION_SNAPSHOT_KEY, JSON.stringify(snapshot));
    else localStorage.removeItem(SESSION_SNAPSHOT_KEY);
  } catch {
    /* stockage indisponible : sans effet */
  }
}

/** Callback invoqué quand la session ne peut plus être renouvelée. */
export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler;
}

interface RequestOptions {
  signal?: AbortSignal;
  /** Délai maximal en millisecondes (défaut : 30 s, adapté aux liaisons lentes). */
  timeoutMs?: number;
  /** Requête d'authentification : ne doit pas déclencher de renouvellement. */
  skipAuthRetry?: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Renouvellement partagé.
 *
 * Sans cette promesse mutualisée, cinq requêtes expirant simultanément
 * déclencheraient cinq rotations concurrentes — et la rotation invalidant le
 * jeton précédent, quatre d'entre elles échoueraient en déconnectant
 * l'utilisateur.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        storeRefreshToken(null);
        setAccessToken(null);
        return false;
      }

      const payload = await response.json();
      const session: AuthSession = payload.data;
      setAccessToken(session.accessToken);
      storeRefreshToken(session.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: RequestOptions = {},
  body?: unknown,
  isRetry = false,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  options.signal?.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    } else if (demoOrganizationId) {
      headers['X-Organization-Id'] = demoOrganizationId;
    }

    const response = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      // Session expirée : on tente une rotation, puis on rejoue une seule fois.
      if (response.status === 401 && !isRetry && !options.skipAuthRetry) {
        const renewed = await refreshAccessToken();
        if (renewed) {
          return request<T>(method, path, options, body, true);
        }
        onSessionLost?.();
      }

      throw new ApiClientError(
        response.status,
        payload?.message ?? `Le serveur a répondu ${response.status}.`,
        payload?.code,
        payload?.details,
      );
    }

    return (payload?.data ?? payload) as T;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;

    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiClientError(
        0,
        "Le serveur n'a pas répondu à temps. Vérifiez votre connexion et réessayez.",
        'TIMEOUT',
      );
    }

    throw new ApiClientError(
      0,
      'Serveur injoignable. Vos modifications restent enregistrées localement.',
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timeout);
  }
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, options, body),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, options, body),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
};

/** Marqueur commun aux réponses produites par le moteur d'analyse. */
export interface AiGenerated {
  /** `true` quand la réponse est un exemple de démonstration, pas une analyse réelle. */
  isSimulated: boolean;
  model: string | null;
  generatedAt: string;
}

export interface FleetAnalysisResponse extends AiGenerated {
  answer: string;
}
