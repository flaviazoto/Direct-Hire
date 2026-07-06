"use client";
// frontend/src/hooks/useNotificationPolling.ts
// Role-agnostic unread-notification-count poller. Pass in whichever role's
// getUnreadCount function (employerApi.getUnreadCount, workerApi.getUnreadCount,
// ...) — this hook doesn't know or care which role it's serving.

import { useCallback, useEffect, useRef, useState } from "react";

type UnreadCountResult = { success: boolean; data?: { count?: number } };
type UnreadCountFetcher = () => Promise<UnreadCountResult>;

export function useNotificationPolling(fetchUnreadCount: UnreadCountFetcher, intervalMs = 30_000) {
  const [unreadCount, setUnreadCount] = useState(0);

  // Keep the latest fetcher in a ref so the effect below doesn't need to
  // depend on (and re-subscribe for) a new function identity every render.
  const fetcherRef = useRef(fetchUnreadCount);
  fetcherRef.current = fetchUnreadCount;

  const refetch = useCallback(async () => {
    const res = await fetcherRef.current();
    if (res.success) setUnreadCount(res.data?.count ?? 0);
  }, []);

  useEffect(() => {
    refetch();

    const tick = () => {
      if (document.visibilityState === "visible") refetch();
    };

    const interval = setInterval(tick, intervalMs);
    // Also refetch immediately when the tab regains focus, so the badge
    // doesn't sit stale for up to `intervalMs` after switching back.
    document.addEventListener("visibilitychange", tick);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refetch, intervalMs]);

  return { unreadCount, refetch };
}
