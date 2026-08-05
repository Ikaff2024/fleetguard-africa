/**
 * Client HTTP unique de l'application.
 *
 * Centraliser les appels évite trois écueils déjà rencontrés :
 *   - un en-tête de tenant oublié sur une route (l'API répond 400) ;
 *   - des messages d'erreur serveur avalés et remplacés par un texte générique,
 *     qui masque la cause réelle à l'utilisateur comme au support ;
 *   - des appels sans délai maximal, qui laissent l'interface figée sur les
 *     réseaux mobiles instables où une requête peut ne jamais aboutir.
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
}

export interface ApiEnvelope<T> {
  statusCode: number;
  data: T;
}

interface RequestOptions {
  organizationId: string;
  signal?: AbortSignal;
  /** Délai maximal en millisecondes (défaut : 30 s, adapté aux liaisons lentes). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  options: RequestOptions,
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  // Permet à l'appelant d'annuler (démontage de composant) sans perdre le délai maximal.
  options.signal?.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const response = await fetch(`/api/v1${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        // Provisoire : en Phase 1, le tenant sera lu dans le JWT et cet en-tête
        // disparaîtra. Voir PRODUCTION_PLAN.md § Phase 1.
        'X-Organization-Id': options.organizationId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
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
  get: <T>(path: string, options: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body: unknown, options: RequestOptions) => request<T>('POST', path, options, body),
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
