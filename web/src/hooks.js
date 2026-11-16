import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from './api.js';

/** Runs an async loader on mount and whenever deps change. Returns { data, error, loading, reload }. */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const reload = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    run()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((err) => !cancelled && setState({ data: null, error: errorMessage(err), loading: false }));
    return () => (cancelled = true);
  }, [run]);

  useEffect(reload, [reload]);
  return { ...state, reload };
}
