import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError, apiClient } from '../lib/api-client';

/**
 * Chargement d'une ressource depuis l'API.
 *
 * Écrit à la main plutôt qu'avec une bibliothèque de gestion de requêtes : le
 * besoin se limite ici à « charger, mettre en cache, recharger ». Une
 * dépendance supplémentaire pèserait plus lourd que ce code sur des liaisons
 * mobiles où chaque kilo-octet compte.
 *
 * Trois états sont exposés séparément parce que l'interface doit les
 * distinguer : un tableau vide pendant le chargement n'a pas le même sens
 * qu'un tableau vide après une réponse réussie (« aucun véhicule »), lui-même
 * différent d'un échec réseau.
 */

export interface ApiResourceState<T> {
  data: T | null;
  isLoading: boolean;
  error: ApiClientError | null;
  reload: () => void;
}

/**
 * Cache mémoire partagé entre composants.
 *
 * Plusieurs écrans demandent les mêmes véhicules ; sans ce cache, chaque
 * changement d'onglet relancerait la requête. Il est vidé au changement
 * d'organisation et à la déconnexion.
 */
const cache = new Map<string, unknown>();

export function clearApiCache(): void {
  cache.clear();
}

export function useApiResource<T>(
  path: string | null,
  options: { enabled?: boolean } = {},
): ApiResourceState<T> {
  const enabled = options.enabled ?? true;
  const cacheKey = path ?? '';

  const [data, setData] = useState<T | null>(() => (cache.get(cacheKey) as T) ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(enabled && !cache.has(cacheKey));
  const [error, setError] = useState<ApiClientError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Évite de mettre à jour un composant démonté : fréquent lors d'une
  // navigation rapide entre onglets sur connexion lente.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !path) {
      setIsLoading(false);
      return;
    }

    const cached = cache.get(path) as T | undefined;
    if (cached !== undefined && reloadToken === 0) {
      setData(cached);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    apiClient
      .get<T>(path, { signal: controller.signal })
      .then(result => {
        if (!mountedRef.current) return;
        cache.set(path, result);
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(
          err instanceof ApiClientError
            ? err
            : new ApiClientError(0, 'Erreur inattendue lors du chargement.'),
        );
      })
      .finally(() => {
        if (mountedRef.current) setIsLoading(false);
      });

    return () => controller.abort();
  }, [path, enabled, reloadToken]);

  const reload = useCallback(() => {
    if (path) cache.delete(path);
    setReloadToken(token => token + 1);
  }, [path]);

  return { data, isLoading, error, reload };
}
