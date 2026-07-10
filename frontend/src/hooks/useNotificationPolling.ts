"use client";
// frontend/src/hooks/useNotificationPolling.ts
// Role-agnostic unread-notification-count poller. Pass in whichever role's
// getUnreadCount function (employerApi.getUnreadCount, workerApi.getUnreadCount,
// adminApi.getUnreadCount, ...) — this hook doesn't know or care which role
// it's serving. Thin wrapper around useVisibilityPoll — the pause-when-hidden /
// refetch-on-refocus behavior lives there; this just adds the unread-count
// state and an immediate fetch on mount (list-refresh callers of
// useVisibilityPoll don't want that immediate call since they already have
// their own initial-load effect).

import { useCallback, useEffect, useRef, useState } from "react";
import { useVisibilityPoll } from "./useVisibilityPoll";

// `data` is typed as unknown (not { count?: number }) so this accepts the
// ApiResult<unknown> shape every *Api.getUnreadCount() call actually returns
// (api-client.ts's get<T>() infers T = unknown with no explicit type arg) —
// narrowed at the one place it's read, below.
type UnreadCountResult = { success: boolean; data?: unknown };
type UnreadCountFetcher = () => Promise<UnreadCountResult>;

export function useNotificationPolling(fetchUnreadCount: UnreadCountFetcher, intervalMs = 30_000) {
  const [unreadCount, setUnreadCount] = useState(0);

  // Keep the latest fetcher in a ref so the effect below doesn't need to
  // depend on (and re-subscribe for) a new function identity every render.
  const fetcherRef = useRef(fetchUnreadCount);
  fetcherRef.current = fetchUnreadCount;

  const poll = useCallback(async () => {
    const res = await fetcherRef.current();
    if (res.success) setUnreadCount((res.data as { count?: number } | undefined)?.count ?? 0);
  }, []);

  const { refetch } = useVisibilityPoll(poll, intervalMs);

  useEffect(() => { refetch(); }, [refetch]);

  return { unreadCount, refetch };
}
