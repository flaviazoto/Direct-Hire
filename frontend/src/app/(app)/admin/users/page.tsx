"use client";

import type React from "react";
import { useEffect, useState, useCallback } from "react";
import { adminApi } from "@/lib/api-client";
import { ToastDisplay, type ToastData } from "@/components/ui";
import { C, inputStyle } from "@/lib/admin-theme";

// ── Types ──────────────────────────────────────────────────────────────────────

type AccountStatus =
  | "PENDING_EMAIL_VERIFICATION"
  | "PENDING_REVIEW"
  | "VERIFIED"
  | "REJECTED"
  | "SUSPENDED";

interface UserRow {
  id:                      string;
  email:                   string;
  role:                    "WORKER" | "EMPLOYER" | "ADMIN";
  accountStatus:           AccountStatus;
  isEmailVerified:         boolean;
  createdAt:               string;
  verificationSubmittedAt: string | null;
  name:                    string | null;
  companyName:             string | null;
  documentsVerified:       boolean;
}

type StatusTab = "ALL" | AccountStatus;

// ── Status / role config ───────────────────────────────────────────────────────

const STATUS_BADGE: Record<AccountStatus, { label: string; color: string; bg: string; dot?: boolean }> = {
  VERIFIED:                   { label: "Verified",        color: C.green,  bg: "rgba(34,197,94,0.12)",   dot: true },
  PENDING_REVIEW:             { label: "Pending Review",  color: C.yellow, bg: "rgba(245,158,11,0.12)",  dot: true },
  REJECTED:                   { label: "Rejected",        color: C.accent, bg: "rgba(220,38,38,0.12)"              },
  SUSPENDED:                  { label: "Suspended",       color: C.muted,  bg: "rgba(113,113,122,0.12)"            },
  PENDING_EMAIL_VERIFICATION: { label: "Email Unverified",color: C.blue,   bg: "rgba(0,144,255,0.12)"              },
};

const ROLE_STYLE: Record<string, { color: string; bg: string }> = {
  WORKER:   { color: C.blue,    bg: "rgba(0,144,255,0.12)"   },
  EMPLOYER: { color: C.teal,    bg: "rgba(20,184,166,0.12)"  },
  ADMIN:    { color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
};

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: "ALL",                        label: "All"        },
  { key: "VERIFIED",                   label: "Verified"   },
  { key: "PENDING_REVIEW",             label: "Pending"    },
  { key: "REJECTED",                   label: "Rejected"   },
  { key: "SUSPENDED",                  label: "Suspended"  },
  { key: "PENDING_EMAIL_VERIFICATION", label: "Unverified" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function displayName(u: UserRow): string {
  return u.name ?? u.companyName ?? u.email;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Av({ name }: { name: string }) {
  const letters = name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: C.secondary, flexShrink: 0 }}>
      {letters}
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
      {[1, 2, 3, 4, 5, 6, 7].map(i => (
        <td key={i} style={{ padding: "16px 20px" }}>
          <div style={{ height: 12, background: "rgba(255,255,255,0.06)", borderRadius: 6, width: `${35 + (i * 17) % 45}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ── SuspendModal ───────────────────────────────────────────────────────────────

function SuspendModal({ onConfirm, onCancel, loading }: { onConfirm: (r: string) => void; onCancel: () => void; loading: boolean }) {
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < 5;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onCancel}>
      <div style={{ background: "#141414", border: `1px solid ${C.border}`, borderRadius: 18, width: "100%", maxWidth: 420, padding: 28 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 99, background: "rgba(113,113,122,0.15)", color: C.muted, fontSize: 12, fontWeight: 700, marginBottom: 18 }}>
          Suspend Account
        </div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.secondary, marginBottom: 8 }}>Reason for suspension *</label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder="Briefly explain why this account is being suspended…"
          style={{ ...inputStyle, resize: "vertical" as const }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={tooShort || loading}
            style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: tooShort || loading ? "rgba(113,113,122,0.1)" : "rgba(220,38,38,0.15)", border: `1px solid ${tooShort || loading ? C.border : "rgba(220,38,38,0.4)"}`, color: tooShort || loading ? C.muted : C.accent, cursor: tooShort || loading ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}
          >
            {loading ? "…" : "Suspend"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ReinstateModal ─────────────────────────────────────────────────────────────

function ReinstateModal({ onConfirm, onCancel, loading }: { onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onCancel}>
      <div style={{ background: "#141414", border: `1px solid ${C.border}`, borderRadius: 18, width: "100%", maxWidth: 360, padding: 28, textAlign: "center" }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(20,184,166,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 22 }}>↩</div>
        <h3 style={{ color: C.text, fontWeight: 700, fontSize: 17, margin: "0 0 8px" }}>Restore this account?</h3>
        <p style={{ color: C.secondary, fontSize: 13, margin: "0 0 24px", lineHeight: 1.5 }}>The user will regain full access to their account.</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: "rgba(20,184,166,0.15)", border: "1px solid rgba(20,184,166,0.4)", color: C.teal, cursor: loading ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>{loading ? "…" : "Reinstate"}</button>
        </div>
      </div>
    </div>
  );
}

// ── RejectModal ────────────────────────────────────────────────────────────────

function RejectModal({ onConfirm, onCancel, loading }: { onConfirm: (r: string) => void; onCancel: () => void; loading: boolean }) {
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < 10;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onCancel}>
      <div style={{ background: "#141414", border: `1px solid ${C.border}`, borderRadius: 18, width: "100%", maxWidth: 420, padding: 28 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 99, background: "rgba(220,38,38,0.12)", color: C.accent, fontSize: 12, fontWeight: 700, marginBottom: 18 }}>
          ✕ Reject Account
        </div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.secondary, marginBottom: 8 }}>Reason for rejection *</label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={4}
          placeholder="Explain why this account is being rejected (min. 10 characters)…"
          style={{ ...inputStyle, resize: "vertical" as const }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={tooShort || loading}
            style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: tooShort || loading ? "rgba(113,113,122,0.1)" : "rgba(220,38,38,0.15)", border: `1px solid ${tooShort || loading ? C.border : "rgba(220,38,38,0.4)"}`, color: tooShort || loading ? C.muted : C.accent, cursor: tooShort || loading ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}
          >
            {loading ? "…" : "Confirm Rejection"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [users, setUsers]         = useState<UserRow[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [statusTab, setStatusTab] = useState<StatusTab>("ALL");
  const [roleFilter, setRole]     = useState("");
  const [search, setSearch]       = useState("");
  const [toast, setToast]         = useState<ToastData>(null);

  const [suspendTarget,   setSuspendTarget]   = useState<string | null>(null);
  const [reinstateTarget, setReinstateTarget] = useState<string | null>(null);
  const [rejectTarget,    setRejectTarget]    = useState<string | null>(null);
  const [acting,          setActing]          = useState(false);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: "20" };
    if (statusTab !== "ALL") params.status = statusTab;
    if (roleFilter)          params.role   = roleFilter;
    if (search.trim())       params.search = search.trim();
    const res = await adminApi.getUsers(params);
    if (res.success) {
      setUsers((res.data as UserRow[]) ?? []);
      setTotal((res as unknown as { total: number }).total ?? 0);
    }
    setLoading(false);
  }, [page, statusTab, roleFilter, search]);

  useEffect(() => { load(); }, [load]);

  const setTab   = (t: StatusTab) => { setStatusTab(t); setPage(1); };
  const setRole2 = (r: string)    => { setRole(r);      setPage(1); };

  const handleApprove = async (id: string) => {
    setActing(true);
    const res = await adminApi.approveUser(id);
    setActing(false);
    if (res.success) { showToast("User approved", "ok"); load(); }
    else showToast((res as { error?: string }).error ?? "Failed", "err");
  };

  const handleSuspendConfirm = async (reason: string) => {
    if (!suspendTarget) return;
    setActing(true);
    const res = await adminApi.suspendUserAccount(suspendTarget, reason);
    setActing(false);
    if (res.success) { showToast("Account suspended", "ok"); setSuspendTarget(null); load(); }
    else showToast((res as { error?: string }).error ?? "Failed", "err");
  };

  const handleReinstateConfirm = async () => {
    if (!reinstateTarget) return;
    setActing(true);
    const res = await adminApi.reinstateUser(reinstateTarget);
    setActing(false);
    if (res.success) { showToast("Account reinstated", "ok"); setReinstateTarget(null); load(); }
    else showToast((res as { error?: string }).error ?? "Failed", "err");
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!rejectTarget) return;
    setActing(true);
    const res = await adminApi.rejectUser(rejectTarget, reason);
    setActing(false);
    if (res.success) { showToast("User rejected", "ok"); setRejectTarget(null); load(); }
    else showToast((res as { error?: string }).error ?? "Failed", "err");
  };

  const totalPages = Math.ceil(total / 20);

  const pageBtnStyle = (disabled: boolean): React.CSSProperties => ({
    background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
    color: disabled ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
    borderRadius: 8, padding: "6px 14px", cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13, fontFamily: "inherit",
  });

  const smallBtn = (label: string, color: string, bg: string, border: string, onClick: () => void, disabled?: boolean): React.ReactElement => (
    <button
      onClick={onClick}
      disabled={disabled || acting}
      style={{ padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: (disabled || acting) ? "not-allowed" : "pointer", background: (disabled || acting) ? "rgba(255,255,255,0.04)" : bg, border: `1px solid ${(disabled || acting) ? C.border : border}`, color: (disabled || acting) ? C.muted : color, fontFamily: "inherit", whiteSpace: "nowrap" as const }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <ToastDisplay toast={toast} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.text }}>User Management</h1>
          <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 14 }}>{total.toLocaleString()} users total</p>
        </div>
        <button onClick={load} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.secondary, borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
          ↻ Refresh
        </button>
      </div>

      {/* Status tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            style={{ padding: "6px 14px", borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: "pointer", background: statusTab === tab.key ? C.accent : "transparent", color: statusTab === tab.key ? "#fff" : C.muted, border: `1px solid ${statusTab === tab.key ? C.accent : C.border}`, transition: "all 0.15s", fontFamily: "inherit" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter row */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && load()}
          placeholder="Search name or email…"
          style={{ ...inputStyle, width: 220 }}
        />
        <select
          value={roleFilter}
          onChange={e => setRole2(e.target.value)}
          style={{ ...inputStyle, width: "auto", minWidth: 150, cursor: "pointer" }}
        >
          <option value="">All roles</option>
          <option value="WORKER">Workers</option>
          <option value="EMPLOYER">Employers</option>
          <option value="ADMIN">Admins</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
                {["Name", "Email", "Role", "Status", "Docs", "Joined", "Actions"].map(h => (
                  <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "64px 24px", textAlign: "center" }}>
                    <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.2 }}>👥</div>
                    <div style={{ color: C.muted, fontSize: 15 }}>No users found</div>
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 13, marginTop: 6 }}>Try adjusting your filters.</div>
                  </td>
                </tr>
              ) : users.map((u, idx) => {
                const sBadge = STATUS_BADGE[u.accountStatus] ?? { label: u.accountStatus, color: C.muted, bg: "rgba(113,113,122,0.12)" };
                const rStyle = ROLE_STYLE[u.role] ?? { color: C.muted, bg: "rgba(113,113,122,0.12)" };
                const name   = displayName(u);

                return (
                  <tr
                    key={u.id}
                    style={{ borderBottom: idx < users.length - 1 ? `1px solid ${C.border}` : "none" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <td style={{ padding: "14px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Av name={name} />
                        <span style={{ fontWeight: 600, color: C.secondary, fontSize: 13, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name === u.email ? "—" : name}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "14px 20px", maxWidth: 200 }}>
                      <span style={{ fontSize: 12, color: C.muted, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</span>
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: rStyle.color, background: rStyle.bg }}>{u.role}</span>
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: sBadge.color, background: sBadge.bg }}>
                        {sBadge.dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: sBadge.color, flexShrink: 0 }} />}
                        {sBadge.label}
                      </span>
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      {u.role === "WORKER" && u.documentsVerified && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: C.green, background: "rgba(34,197,94,0.12)" }}>
                          ✓ Verified
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{fmtDate(u.createdAt)}</td>
                    <td style={{ padding: "14px 20px" }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {u.accountStatus === "PENDING_REVIEW" && (
                          <>
                            {smallBtn("✓ Approve", C.teal,   "rgba(20,184,166,0.15)",  "rgba(20,184,166,0.4)",  () => handleApprove(u.id))}
                            {smallBtn("✕ Reject",  C.accent, "rgba(220,38,38,0.15)",   "rgba(220,38,38,0.4)",   () => setRejectTarget(u.id))}
                          </>
                        )}
                        {u.accountStatus === "VERIFIED" && u.role !== "ADMIN" && (
                          smallBtn("Suspend", C.muted, "rgba(113,113,122,0.1)", C.border, () => setSuspendTarget(u.id))
                        )}
                        {(u.accountStatus === "REJECTED" || u.accountStatus === "SUSPENDED") && (
                          smallBtn("↩ Reinstate", C.teal, "rgba(20,184,166,0.12)", "rgba(20,184,166,0.3)", () => setReinstateTarget(u.id))
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 24 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pageBtnStyle(page === 1)}>Previous</button>
          <span style={{ color: C.muted, fontSize: 13 }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={pageBtnStyle(page >= totalPages)}>Next</button>
        </div>
      )}

      {suspendTarget   && <SuspendModal   onConfirm={handleSuspendConfirm}   onCancel={() => setSuspendTarget(null)}   loading={acting} />}
      {reinstateTarget && <ReinstateModal onConfirm={handleReinstateConfirm} onCancel={() => setReinstateTarget(null)} loading={acting} />}
      {rejectTarget    && <RejectModal    onConfirm={handleRejectConfirm}    onCancel={() => setRejectTarget(null)}    loading={acting} />}
    </div>
  );
}
