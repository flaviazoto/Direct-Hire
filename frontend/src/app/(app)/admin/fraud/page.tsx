"use client";

import type React from "react";
import { useEffect, useState, useCallback } from "react";
import { adminApi } from "@/lib/api-client";
import { ToastDisplay, type ToastData, ErrorState } from "@/components/ui";
import { C, inputStyle } from "@/lib/admin-theme";

// ── Types ──────────────────────────────────────────────────────────────────────

interface User {
  id:              string;
  email:           string;
  role:            string;
  accountStatus?:  string;
  status?:         string;
  isEmailVerified: boolean;
  lastLoginAt?:    string;
  createdAt:       string;
  riskScore?:      number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function riskColor(score: number): string {
  if (score > 70) return C.accent;
  if (score > 40) return C.yellow;
  return C.green;
}

function rolePill(role: string) {
  const color = role === "WORKER" ? C.blue : C.teal;
  const bg    = role === "WORKER" ? "rgba(0,144,255,0.12)" : "rgba(20,184,166,0.12)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color, background: bg }}>
      {role}
    </span>
  );
}

// ── ReinstateModal ─────────────────────────────────────────────────────────────

function ReinstateModal({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void;
  onCancel:  () => void;
  loading:   boolean;
}) {
  return (
    <div
      className="glass-scrim"
      style={{ zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={onCancel}
    >
      <div
        className="glass-modal"
        style={{ width: "100%", maxWidth: 380, padding: 28, textAlign: "center" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(20,184,166,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 22 }}>
          ↩
        </div>
        <h3 style={{ color: C.text, fontWeight: 700, fontSize: 17, margin: "0 0 8px" }}>Reinstate Account?</h3>
        <p style={{ color: C.secondary, fontSize: 13, margin: "0 0 24px", lineHeight: 1.5 }}>
          The user will regain full access to their account.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: "rgba(20,184,166,0.15)", border: "1px solid rgba(20,184,166,0.4)", color: C.teal, cursor: loading ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}
          >
            {loading ? "…" : "Reinstate"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminFraudPage() {
  const [users, setUsers]               = useState<User[]>([]);
  const [flagged, setFlagged]           = useState<User[]>([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [flaggedLoading, setFlaggedLoading] = useState(true);
  const [flaggedError, setFlaggedError] = useState<string | null>(null);
  const [page, setPage]                 = useState(1);
  const [search, setSearch]             = useState("");
  const [acting, setActing]             = useState<string | null>(null);
  const [reinstateTarget, setReinstateTarget] = useState<string | null>(null);
  const [toast, setToast]               = useState<ToastData>(null);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = { page: String(page), limit: "20", status: "SUSPENDED" };
    const res = await adminApi.getUsers(params);
    if (!res.success) { setError(res.error ?? "Could not load suspended accounts."); setLoading(false); return; }
    const all = (res.data as unknown as User[]) ?? [];
    setUsers(search ? all.filter(u => u.email.toLowerCase().includes(search.toLowerCase())) : all);
    setTotal((res as unknown as { total: number }).total ?? 0);
    setLoading(false);
  }, [page, search]);

  const loadFlagged = useCallback(async () => {
    setFlaggedLoading(true);
    setFlaggedError(null);
    const res = await adminApi.getUsers({ sortBy: "riskScore", order: "desc", limit: "10" } as Record<string, string>);
    if (res.success) {
      const all = (res.data as unknown as User[]) ?? [];
      setFlagged(all.filter(u => (u.riskScore ?? 0) > 70));
    } else {
      setFlaggedError(res.error ?? "Could not load high-risk users.");
    }
    setFlaggedLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadFlagged(); }, [loadFlagged]);

  const handleActivate = async (id: string) => {
    setActing(id);
    const res = await adminApi.activateUser(id);
    setActing(null);
    if (res.success) { showToast("User reinstated", "ok"); load(); }
    else showToast((res as { error?: string }).error ?? "Failed", "err");
  };

  const statCard = (label: string, value: string | number, color: string, icon: string) => (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
          {icon}
        </div>
        <span style={{ fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{loading ? "—" : value}</div>
    </div>
  );

  const ghostBtn: React.CSSProperties = {
    background: "transparent", border: `1px solid ${C.border}`, color: C.muted,
    borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontFamily: "inherit",
  };

  const pageBtnStyle = (disabled: boolean): React.CSSProperties => ({
    background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
    color: disabled ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
    borderRadius: 8, padding: "6px 14px", cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13, fontFamily: "inherit",
  });

  const totalPages = Math.ceil(total / 20);

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <ToastDisplay toast={toast} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.text }}>Fraud &amp; Risk Console</h1>
          <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 14 }}>Review suspended accounts and risk signals</p>
        </div>
        <button onClick={load} style={ghostBtn}>↻ Refresh</button>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
        {statCard("Suspended Accounts", total, C.accent, "🚫")}
        {statCard("Risk Monitoring",    "Active", C.yellow, "🛡")}
        {statCard("Review Queue",       users.length, C.yellow, "⚠")}
      </div>

      {/* ── Flagged Activity ── */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>Flagged Activity</h2>
          <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: C.accent, background: "rgba(220,38,38,0.12)" }}>
            Risk Score &gt; 70
          </span>
        </div>
        <p style={{ margin: "0 0 16px", color: C.muted, fontSize: 13 }}>
          Users with elevated risk scores — potential fraud signals.
        </p>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
          {flaggedLoading ? (
            <div style={{ padding: "40px 24px", textAlign: "center", color: C.muted, fontSize: 14 }}>Loading…</div>
          ) : flaggedError ? (
            <div style={{ padding: "24px" }}>
              <ErrorState message={flaggedError} retry={loadFlagged} title="Could not load high-risk users" />
            </div>
          ) : flagged.length === 0 ? (
            <div style={{ padding: "40px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.2 }}>✅</div>
              <div style={{ color: C.muted, fontSize: 14 }}>No high-risk users detected</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
                  {["User", "Role", "Risk Score", "Status", "Joined"].map(h => (
                    <th key={h} style={{ padding: "11px 20px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flagged.map((u, i) => (
                  <tr
                    key={u.id}
                    style={{ borderBottom: i < flagged.length - 1 ? `1px solid ${C.border}` : "none" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <td style={{ padding: "14px 20px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.secondary }}>{u.email}</div>
                      <div style={{ fontSize: 11, fontFamily: "monospace", color: C.muted, marginTop: 2 }}>{u.id.slice(0, 10)}…</div>
                    </td>
                    <td style={{ padding: "14px 20px" }}>{rolePill(u.role)}</td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: riskColor(u.riskScore ?? 0) }}>
                        {u.riskScore !== undefined ? `⚠ ${u.riskScore}` : "—"}
                      </span>
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: C.muted, background: "rgba(113,113,122,0.12)" }}>
                        {(u.accountStatus ?? u.status ?? "—").replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 12, color: C.muted }}>{fmtDate(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Suspended Accounts ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>Suspended Accounts</h2>
        <div style={{ maxWidth: 260 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by email…"
            style={inputStyle}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "60px 24px", textAlign: "center", color: C.muted, fontSize: 14 }}>Loading…</div>
      ) : error ? (
        <ErrorState message={error} retry={load} title="Could not load suspended accounts" />
      ) : users.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "60px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.2 }}>✅</div>
          <div style={{ color: C.muted, fontSize: 15 }}>No suspended accounts</div>
          <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 13, marginTop: 6 }}>All accounts are in good standing.</div>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
                {["User", "Role", "Status", "Joined", "Actions"].map(h => (
                  <th key={h} style={{ padding: "11px 20px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr
                  key={u.id}
                  style={{ borderBottom: i < users.length - 1 ? `1px solid ${C.border}` : "none" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <td style={{ padding: "14px 20px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.secondary, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                    <div style={{ fontSize: 11, fontFamily: "monospace", color: C.muted, marginTop: 2 }}>{u.id.slice(0, 10)}…</div>
                  </td>
                  <td style={{ padding: "14px 20px" }}>{rolePill(u.role)}</td>
                  <td style={{ padding: "14px 20px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: C.accent, background: "rgba(220,38,38,0.12)" }}>
                      {(u.status ?? u.accountStatus ?? "SUSPENDED").replace(/_/g, " ")}
                    </span>
                  </td>
                  <td style={{ padding: "14px 20px", fontSize: 12, color: C.muted }}>{fmtDate(u.createdAt)}</td>
                  <td style={{ padding: "14px 20px" }}>
                    <button
                      disabled={!!acting}
                      onClick={() => setReinstateTarget(u.id)}
                      style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: acting ? "not-allowed" : "pointer", background: "rgba(20,184,166,0.12)", border: "1px solid rgba(20,184,166,0.3)", color: acting ? C.muted : C.teal, fontFamily: "inherit", transition: "all 0.15s" }}
                    >
                      {acting === u.id ? "…" : "Reinstate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 24 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pageBtnStyle(page === 1)}>Previous</button>
          <span style={{ color: C.muted, fontSize: 13 }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={pageBtnStyle(page >= totalPages)}>Next</button>
        </div>
      )}

      {/* Reinstate confirmation modal */}
      {reinstateTarget && (
        <ReinstateModal
          onConfirm={() => { handleActivate(reinstateTarget); setReinstateTarget(null); }}
          onCancel={() => setReinstateTarget(null)}
          loading={acting === reinstateTarget}
        />
      )}
    </div>
  );
}
