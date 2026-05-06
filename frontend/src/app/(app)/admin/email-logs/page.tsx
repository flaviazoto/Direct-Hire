"use client";
// src/app/(app)/admin/email-logs/page.tsx

import { useEffect, useState, useCallback, useRef } from "react";
import { adminApi } from "@/lib/api-client";
import { LoadingPage } from "@/components/ui";

/* ─── Types ──────────────────────────────────────────────────────────────────── */

interface EmailLogEntry {
  id:            string;
  userId?:       string | null;
  emailType:     string;
  toAddress:     string;
  subject:       string;
  status:        "QUEUED" | "SENT" | "FAILED" | "BOUNCED";
  providerMsgId?: string | null;
  errorMessage?:  string | null;
  sentAt?:        string | null;
  createdAt:      string;
}

interface EmailStats {
  total:   number;
  sent:    number;
  failed:  number;
  queued:  number;
  bounced: number;
  last24h: number;
  byType:  { type: string; count: number }[];
}

interface LogsPage {
  success:    boolean;
  data:       EmailLogEntry[];
  total:      number;
  totalPages: number;
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtType(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

const EMAIL_TYPES = [
  "WELCOME", "EMAIL_VERIFICATION", "PASSWORD_RESET", "ONBOARDING_REMINDER",
  "ONBOARDING_SUBMITTED", "ACCOUNT_APPROVED", "ACCOUNT_REJECTED",
  "ACCOUNT_NEEDS_CHANGES", "SUBSCRIPTION_CONFIRMED", "ADMIN_NEW_SUBMISSION", "GENERAL",
] as const;

const PAGE_SIZE = 25;

/* ─── Sub-components ─────────────────────────────────────────────────────────── */

function KpiCard({ label, value, sub, icon, accent }: {
  label: string; value: string | number; sub?: string; icon: string; accent: string;
}) {
  return (
    <div style={{
      background: "var(--navy-2)",
      border: "1px solid rgba(220,38,38,0.15)",
      borderRadius: "var(--r-lg)",
      padding: "20px 22px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </span>
        <div style={{
          width: 36, height: 36, borderRadius: "var(--r-sm)",
          background: accent,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16,
        }}>{icon}</div>
      </div>
      <div style={{
        fontFamily: "var(--font-display)",
        fontWeight: 800, fontSize: 28,
        color: "var(--white)", lineHeight: 1,
      }}>{typeof value === "number" ? value.toLocaleString() : value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--admin-2)" }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    SENT:    { label: "Sent",    color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
    FAILED:  { label: "Failed",  color: "#f87171", bg: "rgba(248,113,113,0.12)" },
    QUEUED:  { label: "Queued",  color: "#94a3b8", bg: "rgba(148,163,184,0.10)" },
    BOUNCED: { label: "Bounced", color: "#fb923c", bg: "rgba(251,146,60,0.12)"  },
  };
  const c = cfg[status] ?? { label: status, color: "var(--muted)", bg: "rgba(255,255,255,0.06)" };
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 999, fontSize: 11,
      fontWeight: 700, color: c.color, background: c.bg,
      letterSpacing: "0.04em", whiteSpace: "nowrap",
    }}>{c.label}</span>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────────── */

export default function AdminEmailLogsPage() {
  const [stats,    setStats]    = useState<EmailStats | null>(null);
  const [logs,     setLogs]     = useState<EmailLogEntry[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [fetching, setFetching] = useState(false);
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null);

  const [filterType,   setFilterType]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search,       setSearch]       = useState("");
  const [searchInput,  setSearchInput]  = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Fetch stats once on mount
  useEffect(() => {
    adminApi.getEmailStats().then(res => {
      if (res.success) setStats(res.data as EmailStats);
    });
  }, []);

  // Fetch logs on page / filter change
  useEffect(() => {
    setFetching(true);
    const params: Record<string, string> = { page: String(page), limit: String(PAGE_SIZE) };
    if (filterType)   params.emailType = filterType;
    if (filterStatus) params.status    = filterStatus;
    if (search)       params.search    = search;

    adminApi.getEmailLogs(params)
      .then(res => {
        const r = res as unknown as LogsPage;
        if (r.success) {
          setLogs(r.data ?? []);
          setTotal(r.total ?? 0);
        }
      })
      .finally(() => { setLoading(false); setFetching(false); });
  }, [page, filterType, filterStatus, search]);

  function handleSearchInput(val: string) {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(val); setPage(1); }, 400);
  }

  function applyFilters(type: string, status: string) {
    setFilterType(type);
    setFilterStatus(status);
    setPage(1);
  }

  function clearFilters() {
    setFilterType(""); setFilterStatus("");
    setSearch(""); setSearchInput(""); setPage(1);
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard");
    } catch {
      showToast("Copy failed", false);
    }
  }

  if (loading) return <LoadingPage color="amber" />;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Pagination page numbers — up to 7 buttons centred around current page
  const pageNums: number[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNums.push(i);
  } else if (page <= 4) {
    for (let i = 1; i <= 7; i++) pageNums.push(i);
  } else if (page >= totalPages - 3) {
    for (let i = totalPages - 6; i <= totalPages; i++) pageNums.push(i);
  } else {
    for (let i = page - 3; i <= page + 3; i++) pageNums.push(i);
  }

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1280, margin: "0 auto", fontFamily: "var(--font-body)" }}>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: "var(--r-md)",
          background: "linear-gradient(135deg, var(--admin-primary), var(--admin-2))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, boxShadow: "0 4px 18px var(--admin-glow)", flexShrink: 0,
        }}>📧</div>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, color: "var(--white)", margin: 0 }}>
            Email Logs
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
            Delivery tracking · last 30 days
          </p>
        </div>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 }}>
        <KpiCard label="Total (30d)"  value={stats?.total   ?? "—"} icon="📧" accent="rgba(59,130,246,0.15)"  />
        <KpiCard label="Delivered"    value={stats?.sent    ?? "—"} icon="✅" accent="rgba(16,185,129,0.15)"  sub={stats ? `${stats.bounced} bounced` : undefined} />
        <KpiCard label="Failed"       value={stats?.failed  ?? "—"} icon="❌" accent="rgba(220,38,38,0.18)"   />
        <KpiCard label="Last 24h"     value={stats?.last24h ?? "—"} icon="⏱" accent="rgba(167,139,250,0.15)" />
      </div>

      {/* ── Log table ────────────────────────────────────────────────────────── */}
      <div style={{
        background: "var(--navy-2)", border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)", overflow: "hidden",
      }}>

        {/* Filter bar */}
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const,
        }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--white)", margin: 0, flexShrink: 0 }}>
            Log Entries
          </h2>
          <span style={{ fontSize: 12, color: "var(--muted)", marginRight: "auto" }}>
            {total.toLocaleString()} total
          </span>

          <input
            type="text"
            placeholder="Search recipient…"
            value={searchInput}
            onChange={e => handleSearchInput(e.target.value)}
            style={{
              padding: "7px 12px", borderRadius: "var(--r-sm)",
              border: "1px solid var(--border)",
              background: "var(--navy-3)", color: "var(--white)",
              fontSize: 13, outline: "none", width: 200,
            }}
          />

          <select
            value={filterType}
            onChange={e => applyFilters(e.target.value, filterStatus)}
            style={{
              padding: "7px 12px", borderRadius: "var(--r-sm)",
              border: "1px solid var(--border)",
              background: "var(--navy-3)",
              color: filterType ? "var(--white)" : "var(--muted)",
              fontSize: 13, outline: "none", cursor: "pointer",
            }}
          >
            <option value="">All Types</option>
            {EMAIL_TYPES.map(t => (
              <option key={t} value={t}>{fmtType(t)}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={e => applyFilters(filterType, e.target.value)}
            style={{
              padding: "7px 12px", borderRadius: "var(--r-sm)",
              border: "1px solid var(--border)",
              background: "var(--navy-3)",
              color: filterStatus ? "var(--white)" : "var(--muted)",
              fontSize: 13, outline: "none", cursor: "pointer",
            }}
          >
            <option value="">All Statuses</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="QUEUED">Queued</option>
            <option value="BOUNCED">Bounced</option>
          </select>

          {(filterType || filterStatus || search) && (
            <button
              onClick={clearFilters}
              style={{
                padding: "7px 12px", borderRadius: "var(--r-sm)",
                border: "1px solid var(--border)",
                background: "transparent", color: "var(--muted)",
                fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" as const,
              }}
            >Clear ×</button>
          )}
        </div>

        {/* Table header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 190px 90px 170px 110px",
          padding: "9px 20px",
          background: "rgba(255,255,255,0.02)",
          borderBottom: "1px solid var(--border)",
        }}>
          {["Recipient / Subject", "Type", "Status", "Message ID", "Sent"].map(h => (
            <span key={h} style={{
              fontSize: 11, fontWeight: 700, color: "var(--muted)",
              textTransform: "uppercase" as const, letterSpacing: "0.06em",
            }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        {fetching ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            Loading…
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            {(filterType || filterStatus || search) ? "No entries match these filters." : "No email logs yet."}
          </div>
        ) : logs.map(entry => (
          <div
            key={entry.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 190px 90px 170px 110px",
              padding: "13px 20px", alignItems: "center",
              borderBottom: "1px solid var(--border)",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            {/* Recipient / Subject */}
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: "var(--white)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {entry.toAddress}
              </div>
              <div style={{
                fontSize: 11, color: "var(--muted)", marginTop: 2,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {entry.subject}
              </div>
            </div>

            {/* Type */}
            <span style={{
              fontSize: 12, color: "var(--muted)", fontWeight: 500,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {fmtType(entry.emailType)}
            </span>

            {/* Status */}
            <div><StatusBadge status={entry.status} /></div>

            {/* Message ID or error */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {entry.providerMsgId ? (
                <>
                  <span style={{
                    fontSize: 12, fontFamily: "monospace", color: "var(--muted)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {entry.providerMsgId.length > 14
                      ? `${entry.providerMsgId.slice(0, 14)}…`
                      : entry.providerMsgId}
                  </span>
                  <button
                    title="Copy message ID"
                    onClick={() => copyToClipboard(entry.providerMsgId!)}
                    style={{
                      padding: "2px 6px", borderRadius: 4,
                      border: "1px solid var(--border)",
                      background: "transparent", color: "var(--muted)",
                      fontSize: 10, cursor: "pointer", flexShrink: 0, lineHeight: 1,
                    }}
                  >⎘</button>
                </>
              ) : entry.errorMessage ? (
                <span
                  title={entry.errorMessage}
                  style={{
                    fontSize: 11, color: "#f87171",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {entry.errorMessage.length > 30
                    ? `${entry.errorMessage.slice(0, 30)}…`
                    : entry.errorMessage}
                </span>
              ) : (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>—</span>
              )}
            </div>

            {/* Sent at */}
            <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
              {timeAgo(entry.sentAt ?? entry.createdAt)}
            </span>
          </div>
        ))}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            padding: "14px 20px", borderTop: "1px solid var(--border)",
            display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end",
          }}>
            <span style={{ fontSize: 12, color: "var(--muted)", marginRight: "auto" }}>
              Page {page} of {totalPages} · {total.toLocaleString()} entries
            </span>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              style={{
                padding: "6px 14px", borderRadius: "var(--r-sm)",
                border: "1px solid var(--border)",
                background: page <= 1 ? "transparent" : "rgba(255,255,255,0.04)",
                color: page <= 1 ? "var(--muted)" : "var(--white)",
                fontSize: 13, fontWeight: 600,
                cursor: page <= 1 ? "default" : "pointer",
              }}
            >← Prev</button>
            {pageNums.map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                style={{
                  padding: "6px 12px", borderRadius: "var(--r-sm)",
                  border: "1px solid var(--border)",
                  background: p === page ? "rgba(220,38,38,0.15)" : "transparent",
                  color: p === page ? "var(--admin-2)" : "var(--muted)",
                  fontSize: 13, fontWeight: p === page ? 700 : 400, cursor: "pointer",
                }}
              >{p}</button>
            ))}
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              style={{
                padding: "6px 14px", borderRadius: "var(--r-sm)",
                border: "1px solid var(--border)",
                background: page >= totalPages ? "transparent" : "rgba(255,255,255,0.04)",
                color: page >= totalPages ? "var(--muted)" : "var(--white)",
                fontSize: 13, fontWeight: 600,
                cursor: page >= totalPages ? "default" : "pointer",
              }}
            >Next →</button>
          </div>
        )}
      </div>

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 9999,
          padding: "13px 20px", borderRadius: "var(--r-md)",
          background: toast.ok ? "rgba(16,185,129,0.15)" : "rgba(220,38,38,0.15)",
          border: `1px solid ${toast.ok ? "rgba(16,185,129,0.4)" : "rgba(220,38,38,0.4)"}`,
          color: toast.ok ? "#34d399" : "#f87171",
          fontSize: 14, fontWeight: 600,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          animation: "slideInUp 0.25s ease",
        }}>
          <style>{`@keyframes slideInUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }`}</style>
          {toast.ok ? "✓ " : "✕ "}{toast.msg}
        </div>
      )}
    </div>
  );
}
