"use client";
// src/app/(app)/employer/messages/page.tsx
// Minimum-viable inbox: received messages from workers, newest first.
// Mirrors frontend/src/app/(app)/worker/messages/page.tsx's structure.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { employerApi } from "@/lib/api-client";
import { useVisibilityPoll } from "@/hooks/useVisibilityPoll";

interface MessageItem {
  id:         string;
  body:       string;
  isRead:     boolean;
  createdAt:  string;
  senderId:   string;
  senderName: string;
}

interface PagedResponse {
  success:    boolean;
  data:       MessageItem[];
  total:      number;
  totalPages: number;
  page:       number;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60)    return "just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function initials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function EmployerMessagesPage() {
  const router = useRouter();
  const [messages,   setMessages]   = useState<MessageItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expanded,   setExpanded]   = useState<string | null>(null);
  const LIMIT = 20;

  const load = useCallback(async (p: number, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const res = await employerApi.getMessages({ page: String(p), limit: String(LIMIT) });
    if (!res.success) { if (!opts?.silent) router.push("/login"); return; }
    const d = res as unknown as PagedResponse;
    setMessages(d.data ?? []);
    setTotalPages(d.totalPages ?? 1);
    if (!opts?.silent) setLoading(false);
  }, [router]);

  useEffect(() => { load(page); }, [page, load]);

  // Background refresh so worker replies appear without a reload — silent (no
  // spinner), preserves the expanded row.
  useVisibilityPoll(useCallback(() => load(page, { silent: true }), [load, page]), 60_000);

  async function handleExpand(msg: MessageItem) {
    if (expanded === msg.id) { setExpanded(null); return; }
    setExpanded(msg.id);
    if (!msg.isRead) {
      await employerApi.markMessageRead(msg.id);
      setMessages(ms => ms.map(m => m.id === msg.id ? { ...m, isRead: true } : m));
    }
  }

  const unreadCount = messages.filter(m => !m.isRead).length;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 760, margin: "0 auto", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f8fafc", margin: 0 }}>Messages</h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
          {loading ? "Loading…" : unreadCount > 0 ? `${unreadCount} unread` : messages.length === 0 ? "No messages yet" : "All caught up"}
        </p>
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <div style={{ width: 32, height: 32, border: "3px solid rgba(59,130,246,0.2)", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        </div>
      ) : messages.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✉️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>No messages yet</div>
          <div style={{ fontSize: 13, color: "#4b5563" }}>
            When a worker replies to one of your messages, it will appear here.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {messages.map(msg => {
            const isOpen = expanded === msg.id;
            return (
              <div
                key={msg.id}
                style={{
                  background:   msg.isRead ? "rgba(255,255,255,0.02)" : "rgba(59,130,246,0.07)",
                  border:       `1px solid ${msg.isRead ? "rgba(255,255,255,0.06)" : "rgba(59,130,246,0.22)"}`,
                  borderRadius: 14,
                  overflow:     "hidden",
                  transition:   "border-color 0.15s",
                }}
              >
                {/* Row — click to expand */}
                <button
                  onClick={() => handleExpand(msg)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  {/* Avatar */}
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: msg.isRead ? "rgba(100,116,139,0.2)" : "rgba(59,130,246,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: msg.isRead ? "#64748b" : "#60a5fa", flexShrink: 0 }}>
                    {initials(msg.senderName)}
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>{msg.senderName}</span>
                      {!msg.isRead && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa", background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 20, padding: "1px 7px" }}>New</span>
                      )}
                    </div>
                    <p style={{ fontSize: 13, color: "#94a3b8", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isOpen ? "normal" : "nowrap" }}>
                      {isOpen ? "" : msg.body.slice(0, 120) + (msg.body.length > 120 ? "…" : "")}
                    </p>
                  </div>

                  {/* Meta */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: "#4b5563" }}>{timeAgo(msg.createdAt)}</span>
                    <span style={{ fontSize: 11, color: "#374151", transition: "transform 0.15s", display: "inline-block", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
                  </div>
                </button>

                {/* Expanded body */}
                {isOpen && (
                  <div style={{ padding: "0 18px 18px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ paddingTop: 14 }}>
                      <div style={{ background: "rgba(0,0,0,0.2)", borderLeft: "3px solid rgba(59,130,246,0.5)", borderRadius: "0 8px 8px 0", padding: "14px 18px", marginBottom: 12 }}>
                        <p style={{ margin: 0, fontSize: 14, color: "#cbd5e1", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{msg.body}</p>
                      </div>
                      <div style={{ fontSize: 12, color: "#4b5563", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>Sent by <strong style={{ color: "#64748b" }}>{msg.senderName}</strong> on {fmtDate(msg.createdAt)}</span>
                        <Link
                          href={`/employer/workers/${msg.senderId}`}
                          style={{ fontSize: 12, fontWeight: 600, color: "#60a5fa", textDecoration: "none" }}
                        >
                          View profile & reply →
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
          <span style={{ padding: "6px 14px", fontSize: 13, color: "#64748b" }}>{page} / {totalPages}</span>
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
