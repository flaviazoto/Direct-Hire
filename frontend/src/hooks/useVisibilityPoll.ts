"use client";
// frontend/src/hooks/useVisibilityPoll.ts
// Generic visibility-aware polling: calls `fn` every intervalMs while the tab
// is visible, and again immediately on refocus (so state doesn't sit stale for
// up to intervalMs after switching back). Does NOT call `fn` on mount — callers
// that need an immediate first call (e.g. useNotificationPolling) do that
// themselves via the returned `refetch`, since list pages that already have
// their own initial-load effect would otherwise double-fetch on mount.

import { useCallback, useEffect, useRef } from "react";

export function useVisibilityPoll(fn: () => void | Promise<void>, intervalMs: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refetch = useCallback(() => fnRef.current(), []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") refetch();
    };

    const interval = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refetch, intervalMs]);

  return { refetch };
}
