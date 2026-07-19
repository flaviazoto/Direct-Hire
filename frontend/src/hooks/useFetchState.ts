// frontend/src/hooks/useFetchState.ts
// Shared data-fetching state for a single resource, built around the
// existing api-client ApiResult<T> shape ({ success, data, error, ... }).
//
// Collapses a fetch into exactly one of four states: loading | error | empty | data.
// This exists because most pages in the app were writing `if (res.success) {...}`
// with no `else`, so a failed fetch silently rendered the same UI as "no data yet" —
// or a redirect to /login on ANY failure, not just real auth failures (the
// api-client's own 401/403 interceptor already handles real auth expiry/subscription
// gating centrally — see request() in lib/api-client.ts — so pages should never
// need to redirect-on-failure themselves).
//
// Boundary: this hook is for a page's PRIMARY, user-visible fetch. Silent background
// refreshes (useVisibilityPoll's `silent: true` path, polling, etc.) intentionally
// swallow transient failures and should NOT be routed through this hook — a
// background poll failing shouldn't blow away content the user is already looking at.

import { useCallback, useEffect, useRef, useState } from "react";

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  redirectTo?: string;
  fieldErrors?: Record<string, string>;
};

export type FetchState<T> =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "empty"; retry: () => void }
  | { status: "data"; data: T; retry: () => void };

export function useFetchState<T>(
  fetcher: () => Promise<ApiResult<T>>,
  deps: React.DependencyList,
  options?: { isEmpty?: (data: T) => boolean; fallbackMessage?: string }
): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ status: "loading" });

  // fetcher/options are re-created every render by the caller (inline closures) —
  // read them through a ref inside `load` so `load`'s own identity only changes
  // when the caller's `deps` change, not on every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetcherRef.current()
      .then((res) => {
        if (!res.success) {
          setState({
            status: "error",
            message: res.error ?? optionsRef.current?.fallbackMessage ?? "Something went wrong. Please try again.",
            retry: load,
          });
          return;
        }
        const data = res.data as T;
        const empty = optionsRef.current?.isEmpty
          ? optionsRef.current.isEmpty(data)
          : Array.isArray(data) && data.length === 0;
        setState(empty ? { status: "empty", retry: load } : { status: "data", data, retry: load });
      })
      .catch(() => {
        setState({
          status: "error",
          message: optionsRef.current?.fallbackMessage ?? "Network error - check your connection.",
          retry: load,
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { load(); }, [load]);

  return state;
}
