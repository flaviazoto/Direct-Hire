"use client";
// src/app/(app)/admin/email-logs/page.tsx

import { useEffect, useState, useCallback, useRef } from "react";
import { adminApi } from "@/lib/api-client";
import { LoadingPage, ErrorState } from "@/components/ui";
import { C, pill } from "@/lib/admin-theme";

/* ─── Types ──────────────────────────────────────────────────────────────────── */

interface EmailLogEntry {
  id:             string;
  userId?:        string | null;
  emailType:      string;
  toAddress:      string;
  subject:        string;
  status:         "QUEUED" | "SENT" | "FAILED" | "BOUNCED";
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
      background: C.card,
      border: `1px solid rgba(220,38,38,0.15)`,
      borderRadius: 14,
      padding: "20px 22px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </span>
        <div style={{
          width: 36, height: 36, borderRadius: 7,
          background: accent,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16,
        }}>{icon}</div>
      </div>
      <div style={{
        fontFamily: "var(--font-display)",
        fontWeight: 800, fontSize: 28,
        color: C.text, lineHeight: 1,
      }}>{typeof value === "number" ? value.toLocaleString() : value}</div>
      {sub && <div style={{ fontSize: 12, color: C.accent }}>{sub}</div>}
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
  const c = cfg[status] ?? { label: status, color: C.muted, bg: "rgba(255,255,255,0.06)" };
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 999, fontSize: 11,
      fontWeight: 700, color: c.color, background: c.bg,
      letterSpacing: "0.04em", whiteSpace: "nowrap",
    }}>{c.label}</span>
  );
}

function TypeBadge({ emailType }: { emailType: string }) {
  const OTP_TYPES    = ["OTP", "EMAIL_VERIFICATION", "PASSWORD_RESET"];
  const APPROVE_TYPES = ["ACCOUNT_APPROVED", "ONBOARDING_SUBMITTED", "SUBSCRIPTION_CONFIRMED"];
  const REJECT_TYPES  = ["ACCOUNT_REJECTED", "ACCOUNT_NEEDS_CHANGES"];
  const WELCOME_TYPES = ["WELCOME", "ONBOARDING_REMINDER"];
  const JOB_TYPES     = ["JOB_MATCH", "ADMIN_NEW_SUBMISSION"];

  let color: string  = C.muted;
  let bg: string     = "rgba(113,113,122,0.15)";
  let border: string = "rgba(113,113,122,0.25)";

  if (OTP_TYPES.includes(emailType)) {
    color = C.blue; bg = "rgba(0,144,255,0.12)"; border = "rgba(0,144,255,0.25)";
  } else if (APPROVE_TYPES.includes(emailType)) {
    color = C.green; bg = "rgba(34,197,94,0.12)"; border = "rgba(34,197,94,0.25)";
  } else if (REJECT_TYPES.includes(emailType)) {
    color = C.accent; bg = "rgba(220,38,38,0.12)"; border = "rgba(220,38,38,0.25)";
  } else if (WELCOME_TYPES.includes(emailType)) {
    color = C.teal; bg = "rgba(20,184,166,0.12)"; border = "rgba(20,184,166,0.25)";
  } else if (JOB_TYPES.includes(emailType)) {
    color = "#a78bfa"; bg = "rgba(167,139,250,0.12)"; border = "rgba(167,139,250,0.25)";
  } else if (emailType.startsWith("APPLICATION")) {
    color = C.yellow; bg = "rgba(245,158,11,0.12)"; border = "rgba(245,158,11,0.25)";
  }

  return <span style={pill(color, bg, border)}>{fmtType(emailType)}</span>;
}

/* ─── Main page ──────────────────────────────────────────────────────────────── */

export default function AdminEmailLogsPage() {
  const [stats,    setStats]    = useState<EmailStats | null>(null);
  const [logs,     setLogs]     = useState<EmailLogEntry[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null);

  const [filterType,   setFilterType]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search,       setSearch]       = useState("");
  const [searchInput,  setSearchInput]  = useState("");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    adminApi.getEmailStats().then(res => {
      if (res.success) setStats(res.data as EmailStats);
      else console.error("[email-logs] stats fetch failed:", res.error);
    }).catch(err => console.error("[email-logs] stats fetch failed:", err));
  }, []);

  const loadLogs = useCallback(() => {
    setFetching(true);
    setError(null);
    const params: Record<string, string> = { page: String(page), limit: String(PAGE_SIZE) };
    if (filterType)   params.emailType = filterType;
    if (filterStatus) params.status    = filterStatus;
    if (search)       params.search    = search;
    if (dateFrom)     params.from      = dateFrom;
    if (dateTo)       params.to        = dateTo;

    adminApi.getEmailLogs(params)
      .then(res => {
        const r = res as unknown as LogsPage & { error?: string };
        if (r.success) {
          setLogs(r.data ?? []);
          setTotal(r.total ?? 0);
        } else {
          setError(r.error ?? "Could not load email logs.");
        }
      })
      .catch(() => setError("Network error - check your connection."))
      .finally(() => { setLoading(false); setFetching(false); });
  }, [page, filterType, filterStatus, search, dateFrom, dateTo]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

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
    setSearch(""); setSearchInput("");
    setDateFrom(""); setDateTo("");
    setPage(1);
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
  const hasFilters = filterType || filterStatus || search || dateFrom || dateTo;

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

  const dateInputStyle = {
    padding: "7px 12px", borderRadius: 7,
    border: `1px solid ${C.border}`,
    background: C.inputBg, color: C.text,
    fontSize: 13, outline: "none", colorScheme: "dark" as const,
  };

  const selectStyle = {
    padding: "7px 12px", borderRadius: 7,
    border: `1px solid ${C.border}`,
    background: C.inputBg,
    fontSize: 13, outline: "none", cursor: "pointer",
  };

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1280, margin: "0 auto", fontFamily: "var(--font-body)" }}>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: `linear-gradient(135deg, ${C.accent}, #b91c1c)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, boxShadow: "0 4px 18px rgba(220,38,38,0.3)", flexShrink: 0,
        }}>📧</div>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, color: C.text, margin: 0 }}>
            Email Logs
          </h1>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
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
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 14, overflow: "hidden",
      }}>

        {/* Filter bar */}
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const,
        }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: C.text, margin: 0, flexShrink: 0 }}>
            Log Entries
          </h2>
          <span style={{ fontSize: 12, color: C.muted, marginRight: "auto" }}>
            {total.toLocaleString()} total
          </span>

          {/* Search */}
          <input
            type="text"
            placeholder="Search recipient…"
            value={searchInput}
            onChange={e => handleSearchInput(e.target.value)}
            style={{ ...dateInputStyle, width: 180 }}
          />

          {/* Date range */}
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            max={dateTo || new Date().toISOString().split("T")[0]}
            style={{ ...dateInputStyle, width: 140 }}
            title="From date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
            min={dateFrom}
            max={new Date().toISOString().split("T")[0]}
            style={{ ...dateInputStyle, width: 140 }}
            title="To date"
          />

          {/* Type */}
          <select
            value={filterType}
            onChange={e => applyFilters(e.target.value, filterStatus)}
            style={{ ...selectStyle, color: filterType ? C.text : C.muted }}
          >
            <option value="">All Types</option>
            {EMAIL_TYPES.map(t => (
              <option key={t} value={t}>{fmtType(t)}</option>
            ))}
          </select>

          {/* Status */}
          <select
            value={filterStatus}
            onChange={e => applyFilters(filterType, e.target.value)}
            style={{ ...selectStyle, color: filterStatus ? C.text : C.muted }}
          >
            <option value="">All Statuses</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="QUEUED">Queued</option>
            <option value="BOUNCED">Bounced</option>
          </select>

          {hasFilters && (
            <button
              onClick={clearFilters}
              style={{
                padding: "7px 12px", borderRadius: 7,
                border: `1px solid ${C.border}`,
                background: "transparent", color: C.muted,
                fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" as const,
              }}
            >Clear ×</button>
          )}
        </div>

        {/* Table header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 200px 90px 170px 110px",
          padding: "9px 20px",
          background: "rgba(255,255,255,0.02)",
          borderBottom: `1px solid ${C.border}`,
        }}>
          {["Recipient / Subject", "Type", "Status", "Message ID", "Sent"].map(h => (
            <span key={h} style={{
              fontSize: 11, fontWeight: 700, color: C.muted,
              textTransform: "uppercase" as const, letterSpacing: "0.06em",
            }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        {fetching ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: C.muted, fontSize: 13 }}>
            Loading…
          </div>
        ) : error ? (
          <div style={{ padding: "24px" }}>
            <ErrorState message={error} retry={loadLogs} title="Could not load email logs" />
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: C.muted, fontSize: 13 }}>
            {hasFilters ? "No entries match these filters." : "No email logs yet."}
          </div>
        ) : logs.map(entry => (
          <div
            key={entry.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 200px 90px 170px 110px",
              padding: "13px 20px", alignItems: "center",
              borderBottom: `1px solid ${C.border}`,
              transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            {/* Recipient / Subject */}
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: C.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {entry.toAddress}
              </div>
              <div style={{
                fontSize: 11, color: C.muted, marginTop: 2,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {entry.subject}
              </div>
            </div>

            {/* Type — color-coded badge */}
            <div><TypeBadge emailType={entry.emailType} /></div>

            {/* Status */}
            <div><StatusBadge status={entry.status} /></div>

            {/* Message ID or error */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {entry.providerMsgId ? (
                <>
                  <span style={{
                    fontSize: 12, fontFamily: "monospace", color: C.muted,
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
                      border: `1px solid ${C.border}`,
                      background: "transparent", color: C.muted,
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
                <span style={{ fontSize: 12, color: C.muted }}>—</span>
              )}
            </div>

            {/* Sent at */}
            <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>
              {timeAgo(entry.sentAt ?? entry.createdAt)}
            </span>
          </div>
        ))}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            padding: "14px 20px", borderTop: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end",
          }}>
            <span style={{ fontSize: 12, color: C.muted, marginRight: "auto" }}>
              Page {page} of {totalPages} · {total.toLocaleString()} entries
            </span>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              style={{
                padding: "6px 14px", borderRadius: 7,
                border: `1px solid ${C.border}`,
                background: page <= 1 ? "transparent" : "rgba(255,255,255,0.04)",
                color: page <= 1 ? C.muted : C.text,
                fontSize: 13, fontWeight: 600,
                cursor: page <= 1 ? "default" : "pointer",
              }}
            >← Prev</button>
            {pageNums.map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                style={{
                  padding: "6px 12px", borderRadius: 7,
                  border: `1px solid ${C.border}`,
                  background: p === page ? "rgba(220,38,38,0.15)" : "transparent",
                  color: p === page ? C.accent : C.muted,
                  fontSize: 13, fontWeight: p === page ? 700 : 400, cursor: "pointer",
                }}
              >{p}</button>
            ))}
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              style={{
                padding: "6px 14px", borderRadius: 7,
                border: `1px solid ${C.border}`,
                background: page >= totalPages ? "transparent" : "rgba(255,255,255,0.04)",
                color: page >= totalPages ? C.muted : C.text,
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
          padding: "13px 20px", borderRadius: 10,
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
