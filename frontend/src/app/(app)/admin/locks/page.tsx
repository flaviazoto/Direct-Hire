"use client";
// src/app/(app)/admin/locks/page.tsx
// Admin lock monitor — table of every WorkerLock with status filtering and a
// force-release (override) action wired to POST /admin/locks/:lockId/override
// (admin-locks.controller.ts's overrideLock — already audit-logs via
// insertAdminAuditLog and notifies both parties; this page just surfaces it).

import type React from "react";
import { useEffect, useState, useCallback } from "react";
import { adminApi } from "@/lib/api-client";
import { ToastDisplay, type ToastData } from "@/components/ui";
import { C, inputStyle } from "@/lib/admin-theme";

// ── Types ──────────────────────────────────────────────────────────────────────

type LockStatus = "ACTIVE" | "EXPIRED" | "RELEASED" | "OVERRIDDEN";

interface LockPerson {
  id:           string;
  email:        string;
  first_name:   string | null;
  last_name:    string | null;
  company_name?: string | null;
}

interface LockRow {
  id:                string;
  lock_status:       LockStatus;
  daily_fee:         number | string;
  currency:          string;
  total_billed:      number | string;
  total_days_billed: number;
  lock_start_date:   string;
  lock_expiry_date:  string;
  lock_days:         number;
  worker:            LockPerson;
  employer:          LockPerson;
}

type StatusTab = "ALL" | LockStatus;

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<LockStatus, { label: string; color: string; bg: string; dot?: boolean }> = {
  ACTIVE:     { label: "Active",     color: C.teal,   bg: "rgba(20,184,166,0.12)",  dot: true },
  EXPIRED:    { label: "Expired",    color: C.muted,  bg: "rgba(113,113,122,0.12)"            },
  RELEASED:   { label: "Released",   color: C.blue,   bg: "rgba(0,144,255,0.12)"               },
  OVERRIDDEN: { label: "Overridden", color: C.accent, bg: "rgba(220,38,38,0.12)"               },
};

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: "ALL",        label: "All"        },
  { key: "ACTIVE",     label: "Active"     },
  { key: "EXPIRED",    label: "Expired"    },
  { key: "RELEASED",   label: "Released"   },
  { key: "OVERRIDDEN", label: "Overridden" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function personName(p: LockPerson): string {
  if (p.company_name) return p.company_name;
  const n = [p.first_name, p.last_name].filter(Boolean).join(" ");
  return n || p.email;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(v: number | string, currency: string) {
  const n = Number(v);
  return `${currency.toUpperCase()} ${n.toFixed(2)}`;
}

// ── Skeleton row ───────────────────────────────────────────────────────────────

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

// ── Force-release (override) confirm modal ──────────────────────────────────────

function ForceReleaseModal({
  workerName, employerName, onConfirm, onCancel, loading,
}: {
  workerName: string; employerName: string;
  onConfirm: (note: string) => void; onCancel: () => void; loading: boolean;
}) {
  const [note, setNote] = useState("");
  const tooShort = note.trim().length < 5;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onCancel}>
      <div style={{ background: "#141414", border: `1px solid ${C.border}`, borderRadius: 18, width: "100%", maxWidth: 440, padding: 28 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 99, background: "rgba(220,38,38,0.12)", color: C.accent, fontSize: 12, fontWeight: 700, marginBottom: 18 }}>
          Force-release reservation
        </div>
        <p style={{ color: C.secondary, fontSize: 13, lineHeight: 1.6, margin: "0 0 16px" }}>
          Ending <strong style={{ color: C.text }}>{employerName}</strong>&apos;s reservation on <strong style={{ color: C.text }}>{workerName}</strong>.
          Both parties will be notified — the reason below is logged internally and is <strong>not</strong> shown to either party.
        </p>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.secondary, marginBottom: 8 }}>Internal reason *</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          placeholder="e.g. fraud investigation, employer dispute, policy violation…"
          style={{ ...inputStyle, resize: "vertical" as const }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm(note.trim())}
            disabled={tooShort || loading}
            style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: tooShort || loading ? "rgba(113,113,122,0.1)" : "rgba(220,38,38,0.15)", border: `1px solid ${tooShort || loading ? C.border : "rgba(220,38,38,0.4)"}`, color: tooShort || loading ? C.muted : C.accent, cursor: tooShort || loading ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}
          >
            {loading ? "…" : "Force-release"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminLocksPage() {
  const [locks, setLocks]         = useState<LockRow[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [statusTab, setStatusTab] = useState<StatusTab>("ALL");
  const [toast, setToast]         = useState<ToastData>(null);

  const [releaseTarget, setReleaseTarget] = useState<LockRow | null>(null);
  const [acting, setActing] = useState(false);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: "20" };
    if (statusTab !== "ALL") params.status = statusTab;
    const res = await adminApi.getAllLocks(params);
    if (res.success) {
      setLocks((res.data as LockRow[]) ?? []);
      setTotal((res as unknown as { total: number }).total ?? 0);
    }
    setLoading(false);
  }, [page, statusTab]);

  useEffect(() => { load(); }, [load]);

  const setTab = (t: StatusTab) => { setStatusTab(t); setPage(1); };

  const handleForceReleaseConfirm = async (note: string) => {
    if (!releaseTarget) return;
    setActing(true);
    const res = await adminApi.overrideLock(releaseTarget.id, note);
    setActing(false);
    if (res.success) {
      showToast("Reservation force-released", "ok");
      setReleaseTarget(null);
      load();
    } else {
      showToast((res as { error?: string }).error ?? "Failed to release", "err");
    }
  };

  const totalPages = Math.ceil(total / 20);

  const pageBtnStyle = (disabled: boolean): React.CSSProperties => ({
    background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
    color: disabled ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
    borderRadius: 8, padding: "6px 14px", cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13, fontFamily: "inherit",
  });

  return (
    <div className="admin-page-root min-h-screen px-4 sm:px-6 pt-6 pb-8 md:px-8" style={{ maxWidth: 1200 }}>
      <ToastDisplay toast={toast} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.text }}>Lock Monitor</h1>
          <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 14 }}>{total.toLocaleString()} reservation{total !== 1 ? "s" : ""} total</p>
        </div>
        <button onClick={load} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.secondary, borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
          ↻ Refresh
        </button>
      </div>

      {/* Status tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
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

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
                {["Worker", "Employer", "Status", "Daily Rate", "Started", "Expires", "Total Charged", "Actions"].map(h => (
                  <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : locks.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "64px 24px", textAlign: "center" }}>
                    <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.2 }}>🔒</div>
                    <div style={{ color: C.muted, fontSize: 15 }}>No reservations found</div>
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 13, marginTop: 6 }}>Try a different status filter.</div>
                  </td>
                </tr>
              ) : locks.map((lock, idx) => {
                const badge = STATUS_BADGE[lock.lock_status] ?? { label: lock.lock_status, color: C.muted, bg: "rgba(113,113,122,0.12)" };
                const workerName   = personName(lock.worker);
                const employerName = personName(lock.employer);

                return (
                  <tr
                    key={lock.id}
                    style={{ borderBottom: idx < locks.length - 1 ? `1px solid ${C.border}` : "none" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <td style={{ padding: "14px 20px", maxWidth: 180 }}>
                      <div style={{ fontWeight: 600, color: C.secondary, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workerName}</div>
                      <div style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lock.worker.email}</div>
                    </td>
                    <td style={{ padding: "14px 20px", maxWidth: 180 }}>
                      <div style={{ fontWeight: 600, color: C.secondary, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{employerName}</div>
                      <div style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lock.employer.email}</div>
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: badge.color, background: badge.bg }}>
                        {badge.dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: badge.color, flexShrink: 0 }} />}
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{fmtMoney(lock.daily_fee, lock.currency)}</td>
                    <td style={{ padding: "14px 20px", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{fmtDate(lock.lock_start_date)}</td>
                    <td style={{ padding: "14px 20px", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{fmtDate(lock.lock_expiry_date)}</td>
                    <td style={{ padding: "14px 20px", fontSize: 12, color: C.secondary, whiteSpace: "nowrap" }}>
                      {fmtMoney(lock.total_billed, lock.currency)}
                      <span style={{ color: C.muted }}> / {lock.total_days_billed}d</span>
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      {lock.lock_status === "ACTIVE" && (
                        <button
                          onClick={() => setReleaseTarget(lock)}
                          disabled={acting}
                          style={{ padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: acting ? "not-allowed" : "pointer", background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.4)", color: C.accent, fontFamily: "inherit", whiteSpace: "nowrap" as const }}
                        >
                          Force-release
                        </button>
                      )}
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 24, flexWrap: "wrap" }}>
          <span style={{ color: C.muted, fontSize: 13 }}>Showing {locks.length} of {total.toLocaleString()}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pageBtnStyle(page === 1)}>Previous</button>
            <span style={{ color: C.muted, fontSize: 13 }}>Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={pageBtnStyle(page >= totalPages)}>Next</button>
          </div>
        </div>
      )}

      {releaseTarget && (
        <ForceReleaseModal
          workerName={personName(releaseTarget.worker)}
          employerName={personName(releaseTarget.employer)}
          onConfirm={handleForceReleaseConfirm}
          onCancel={() => setReleaseTarget(null)}
          loading={acting}
        />
      )}
    </div>
  );
}
