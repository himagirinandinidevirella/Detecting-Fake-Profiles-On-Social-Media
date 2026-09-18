import { useCallback, useEffect, useRef, useState } from 'react';
import { get } from '../lib/api';

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches an API resource and re-fetches whenever `path` changes.
 * Every chart in the app is driven by these live payloads.
 */
export function useApi<T>(path: string | null): State<T> & { refetch: () => void } {
  const [state, setState] = useState<State<T>>({ data: null, loading: !!path, error: null });
  const [nonce, setNonce] = useState(0);
  const lastPath = useRef<string | null>(null);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    // show a loading state only on first load of a given endpoint
    if (lastPath.current !== path) setState((s) => ({ ...s, loading: true, error: null }));
    lastPath.current = path;
    const controller = new AbortController();
    let alive = true;
    get<T>(path, controller.signal)
      .then((data) => { if (alive) setState({ data, loading: false, error: null }); })
      .catch((err) => {
        if (!alive || err?.name === 'AbortError') return;
        setState((s) => ({ data: s.data, loading: false, error: err.message || 'Request failed' }));
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [path, nonce]);

  return { ...state, refetch };
}
