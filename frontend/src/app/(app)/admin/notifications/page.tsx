"use client";
// src/app/(app)/admin/notifications/page.tsx
// Notifications redesign — admin's full notifications page. Same pattern as
// /worker/notifications/page.tsx (card layout, date-grouping, shared icon
// map, pagination, mark-one/mark-all, error/empty states), adapted to
// adminApi and admin-theme.ts's gold accent + shared admin page
// conventions (C tokens, ErrorState/EmptyState/ToastDisplay).

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/api-client";
import { C, rowBg } from "@/lib/admin-theme";
import { ToastDisplay, type ToastData, ErrorState, EmptyState } from "@/components/ui";
import { type NotifItem, getNotificationIcon, groupNotificationsByDate, timeAgo } from "@/lib/notifications";

interface PagedResponse {
  success:    boolean;
  data:       NotifItem[];
  total:      number;
  totalPages: number;
  page:       number;
}

export default function AdminNotificationsPage() {
  const router = useRouter();
  const [notifs,      setNotifs]      = useState<NotifItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [page,        setPage]        = useState(1);
  const [totalPages,  setTotalPages]  = useState(1);
  const [unreadOnly,  setUnreadOnly]  = useState(false);
  const [toast,       setToast]       = useState<ToastData>(null);
  const prevUnreadOnly = useRef(unreadOnly);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async (p: number, unread: boolean) => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = { page: String(p), limit: "20" };
    if (unread) params.unreadOnly = "true";
    const res = await adminApi.getNotifications(params);
    if (!res.success) { setError(res.error ?? "Could not load notifications."); setLoading(false); return; }
    const d = res as unknown as PagedResponse;
    setNotifs(d.data ?? []);
    setTotalPages(d.totalPages ?? 1);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (prevUnreadOnly.current !== unreadOnly) {
      prevUnreadOnly.current = unreadOnly;
      setPage(1);
      load(1, unreadOnly);
    } else {
      load(page, unreadOnly);
    }
  }, [page, unreadOnly, load]);

  const markRead = async (id: string) => {
    await adminApi.markNotificationRead(id);
    setNotifs(ns => ns.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllRead = async () => {
    await adminApi.markAllNotificationsRead();
    setNotifs(ns => ns.map(n => ({ ...n, isRead: true })));
    showToast("All marked as read", "ok");
  };

  const handleClick = async (n: NotifItem) => {
    if (!n.isRead) await markRead(n.id);
    if (n.link) router.push(n.link);
  };

  const unreadCount = notifs.filter(n => !n.isRead).length;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 760, margin: "0 auto", fontFamily: "var(--font-body)" }}>
      <ToastDisplay toast={toast} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, color: C.text, margin: 0 }}>Notifications</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0" }}>
            {unreadCount > 0 ? `${unreadCount} unread on this page` : "All caught up"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setUnreadOnly(v => !v)}
            style={{
              padding:      "7px 14px",
              borderRadius: 8,
              border:       `1px solid ${unreadOnly ? C.accent : C.border}`,
              background:   unreadOnly ? "rgba(224,176,32,0.12)" : "transparent",
              color:        unreadOnly ? C.accent : C.muted,
              fontSize:     13,
              fontWeight:   600,
              cursor:       "pointer",
            }}
          >
            {unreadOnly ? "Showing unread" : "Show unread only"}
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 13, cursor: "pointer" }}
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <div style={{ width: 32, height: 32, border: "3px solid rgba(224,176,32,0.2)", borderTopColor: C.accent, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : error ? (
        <ErrorState message={error} retry={() => load(page, unreadOnly)} title="Could not load notifications" />
      ) : notifs.length === 0 ? (
        <EmptyState
          icon="🔔"
          title="No notifications"
          description={unreadOnly ? "No unread notifications." : "You're all caught up. Notifications will appear here."}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {groupNotificationsByDate(notifs).map(({ group, items }) => (
            <div key={group}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, paddingLeft: 2 }}>
                {group}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {items.map(n => (
                  <div
                    key={n.id}
                    onClick={() => handleClick(n)}
                    style={{
                      display:      "flex",
                      gap:          14,
                      padding:      "14px 16px",
                      background:   n.isRead ? rowBg : "rgba(224,176,32,0.08)",
                      border:       `1px solid ${n.isRead ? C.border : "rgba(224,176,32,0.3)"}`,
                      borderLeft:   n.isRead ? undefined : `3px solid ${C.accent}`,
                      borderRadius: 12,
                      cursor:       n.link ? "pointer" : "default",
                      transition:   "background 0.15s",
                    }}
                    onMouseOver={e => { if (n.link) e.currentTarget.style.background = "rgba(224,176,32,0.14)"; }}
                    onMouseOut={e  => { e.currentTarget.style.background = n.isRead ? rowBg : "rgba(224,176,32,0.08)"; }}
                  >
                    {/* Icon */}
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                      {getNotificationIcon(n.type)}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
                        {!n.isRead && (
                          <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: C.accent, background: "rgba(224,176,32,0.15)", border: "1px solid rgba(224,176,32,0.3)", borderRadius: 20, padding: "1px 7px" }}>New</span>
                        )}
                      </div>
                      <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.body}</p>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>{timeAgo(n.createdAt)}</div>
                    </div>

                    {/* Unread dot */}
                    {!n.isRead && (
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent, flexShrink: 0, marginTop: 6 }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 24 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: page === 1 ? C.border : C.muted, cursor: page === 1 ? "not-allowed" : "pointer", fontSize: 13 }}
          >
            ← Prev
          </button>
          <span style={{ padding: "6px 14px", fontSize: 13, color: C.muted }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: page === totalPages ? C.border : C.muted, cursor: page === totalPages ? "not-allowed" : "pointer", fontSize: 13 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
