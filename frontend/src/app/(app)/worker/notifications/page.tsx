"use client";
// src/app/(app)/worker/notifications/page.tsx

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { workerApi } from "@/lib/api-client";
import { ToastDisplay, type ToastData } from "@/components/ui";

interface NotifItem {
  id:        string;
  type:      string;
  title:     string;
  body:      string;
  isRead:    boolean;
  link?:     string;
  createdAt: string;
}

interface PagedResponse {
  success:    boolean;
  data:       NotifItem[];
  total:      number;
  totalPages: number;
  page:       number;
}

const TYPE_ICON: Record<string, string> = {
  MESSAGE_RECEIVED:   "✉️",
  APPLICATION_UPDATE: "📋",
  PROFILE_APPROVED:   "✅",
  PROFILE_REJECTED:   "❌",
  JOB_MATCH:          "🎯",
  GENERAL:            "🔔",
};

function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60)    return "just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function WorkerNotificationsPage() {
  const router = useRouter();
  const [notifs,      setNotifs]      = useState<NotifItem[]>([]);
  const [loading,     setLoading]     = useState(true);
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
    const params: Record<string, string> = { page: String(p), limit: "20" };
    if (unread) params.unreadOnly = "true";
    const res = await workerApi.getNotifications(params);
    if (!res.success) { router.push("/login"); return; }
    const d = res as unknown as PagedResponse;
    setNotifs(d.data ?? []);
    setTotalPages(d.totalPages ?? 1);
    setLoading(false);
  }, [router]);

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
    await workerApi.markNotificationRead(id);
    setNotifs(ns => ns.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllRead = async () => {
    await workerApi.markAllNotificationsRead();
    setNotifs(ns => ns.map(n => ({ ...n, isRead: true })));
    showToast("All marked as read", "ok");
  };

  const handleClick = async (n: NotifItem) => {
    if (!n.isRead) await markRead(n.id);
    if (n.link) router.push(n.link);
  };

  const unreadCount = notifs.filter(n => !n.isRead).length;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 760, margin: "0 auto" }}>
      <ToastDisplay toast={toast} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f8fafc", margin: 0 }}>Notifications</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            {unreadCount > 0 ? `${unreadCount} unread on this page` : "All caught up"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setUnreadOnly(v => !v)}
            style={{
              padding:      "7px 14px",
              borderRadius: 8,
              border:       `1px solid ${unreadOnly ? "#7c3aed" : "rgba(255,255,255,0.1)"}`,
              background:   unreadOnly ? "rgba(124,58,237,0.15)" : "transparent",
              color:        unreadOnly ? "#a78bfa" : "#94a3b8",
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
              style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <div style={{ width: 32, height: 32, border: "3px solid rgba(124,58,237,0.2)", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : notifs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 0", color: "#4b5563" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>No notifications</div>
          <div style={{ fontSize: 13, color: "#4b5563" }}>
            {unreadOnly ? "No unread notifications." : "You're all caught up. Notifications will appear here."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {notifs.map(n => (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              style={{
                display:      "flex",
                gap:          14,
                padding:      "14px 16px",
                background:   n.isRead ? "rgba(255,255,255,0.02)" : "rgba(124,58,237,0.07)",
                border:       `1px solid ${n.isRead ? "rgba(255,255,255,0.05)" : "rgba(124,58,237,0.2)"}`,
                borderRadius: 12,
                cursor:       n.link ? "pointer" : "default",
                transition:   "background 0.15s",
              }}
              onMouseOver={e => { if (n.link) e.currentTarget.style.background = "rgba(124,58,237,0.12)"; }}
              onMouseOut={e  => { e.currentTarget.style.background = n.isRead ? "rgba(255,255,255,0.02)" : "rgba(124,58,237,0.07)"; }}
            >
              {/* Icon */}
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                {TYPE_ICON[n.type] ?? "🔔"}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>{n.title}</span>
                  {!n.isRead && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 20, padding: "1px 7px" }}>New</span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: "#94a3b8", margin: 0, lineHeight: 1.5 }}>{n.body}</p>
                <div style={{ fontSize: 11, color: "#4b5563", marginTop: 5 }}>{timeAgo(n.createdAt)}</div>
              </div>

              {/* Unread dot */}
              {!n.isRead && (
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#7c3aed", flexShrink: 0, marginTop: 6 }} />
              )}
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
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: page === 1 ? "#374151" : "#94a3b8", cursor: page === 1 ? "not-allowed" : "pointer", fontSize: 13 }}
          >
            ← Prev
          </button>
          <span style={{ padding: "6px 14px", fontSize: 13, color: "#64748b" }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: page === totalPages ? "#374151" : "#94a3b8", cursor: page === totalPages ? "not-allowed" : "pointer", fontSize: 13 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
