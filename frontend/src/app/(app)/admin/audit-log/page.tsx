"use client";

import type React from "react";
import { useEffect, useState, useCallback, useRef } from "react";
import { adminApi } from "@/lib/api-client";
import { ToastDisplay, type ToastData } from "@/components/ui";
import { C, inputStyle } from "@/lib/admin-theme";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AuditUser {
  id:         string;
  email:      string;
  first_name: string | null;
  last_name:  string | null;
}

interface AuditEntry {
  id:          string;
  action:      string;
  notes:       string | null;
  metadata?:   Record<string, unknown> | null;
  created_at:  string;
  admin:       AuditUser & { role?: string };
  target_user: AuditUser & { role: string };
}

// ── Action badge config ────────────────────────────────────────────────────────

const ACTION_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  USER_APPROVED:          { label: "Approved",      color: C.green,   bg: "rgba(34,197,94,0.12)"   },
  USER_REJECTED:          { label: "Rejected",      color: C.accent,  bg: "rgba(220,38,38,0.12)"   },
  USER_SUSPENDED:         { label: "Suspended",     color: C.yellow,  bg: "rgba(245,158,11,0.12)"  },
  USER_REINSTATED:        { label: "Reinstated",    color: C.blue,    bg: "rgba(0,144,255,0.12)"   },
  JOB_APPROVED:           { label: "Job OK",        color: C.green,   bg: "rgba(34,197,94,0.12)"   },
  JOB_REJECTED:           { label: "Job Rejected",  color: C.accent,  bg: "rgba(220,38,38,0.12)"   },
  LOCK_OVERRIDDEN:        { label: "Lock Override", color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  AI_DECISION_OVERRIDDEN: { label: "AI Override",   color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
};

const ACTION_OPTIONS = [
  { value: "USER_APPROVED",   label: "Approved"   },
  { value: "USER_REJECTED",   label: "Rejected"   },
  { value: "USER_SUSPENDED",  label: "Suspended"  },
  { value: "USER_REINSTATED", label: "Reinstated" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function userName(u: AuditUser): string {
  if (u.first_name) return [u.first_name, u.last_name].filter(Boolean).join(" ");
  return u.email;
}

function fmtDateOnly(s: string): string {
  return new Date(s).toISOString().split("T")[0];
}

// ── MetadataViewer ─────────────────────────────────────────────────────────────

function MetadataViewer({ entry }: { entry: AuditEntry }) {
  const meta = entry.metadata;
  const sL: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, display: "block" };
  const row: React.CSSProperties = { display: "flex", gap: 8, marginBottom: 4 };
  const lbl: React.CSSProperties = { fontSize: 12, color: C.muted, width: 116, flexShrink: 0 };
  const val: React.CSSProperties = { fontSize: 12, color: C.secondary, wordBreak: "break-all" };
  const mono: React.CSSProperties = { fontSize: 11, color: C.secondary, fontFamily: "monospace", wordBreak: "break-all" };

  return (
    <tr style={{ background: "#0d0d0d", borderBottom: `1px solid ${C.border}` }}>
      <td colSpan={5} style={{ padding: "20px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <span style={sL}>Identifiers</span>
            <div style={row}><span style={lbl}>Log ID:</span><span style={mono}>{entry.id}</span></div>
            <div style={row}><span style={lbl}>Admin ID:</span><span style={mono}>{entry.admin.id}</span></div>
            <div style={row}><span style={lbl}>Target User ID:</span><span style={mono}>{entry.target_user.id}</span></div>
          </div>
          <div>
            <span style={sL}>Parties</span>
            <div style={row}><span style={lbl}>Admin:</span><span style={val}>{userName(entry.admin)} &lt;{entry.admin.email}&gt;</span></div>
            <div style={row}><span style={lbl}>Target:</span><span style={val}>{userName(entry.target_user)} &lt;{entry.target_user.email}&gt;</span></div>
            <div style={row}><span style={lbl}>Target role:</span><span style={val}>{entry.target_user.role}</span></div>
            <div style={row}><span style={lbl}>Timestamp:</span><span style={val}>{new Date(entry.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
          </div>
          {entry.notes && (
            <div style={{ gridColumn: "1 / -1" }}>
              <span style={sL}>Notes / Reason</span>
              <p style={{ fontSize: 13, color: C.secondary, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", margin: 0, lineHeight: 1.6 }}>
                {entry.notes}
              </p>
            </div>
          )}
          {meta && Object.keys(meta).length > 0 && (
            <div style={{ gridColumn: "1 / -1" }}>
              <span style={sL}>Metadata</span>
              <div style={{ background: "#060606", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", overflowX: "auto" }}>
                <pre style={{ fontSize: 11, fontFamily: "monospace", color: "#a5f3fc", margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(meta, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── SkeletonRow ────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
      {[1, 2, 3, 4, 5].map(i => (
        <td key={i} style={{ padding: "16px 20px" }}>
          <div style={{ height: 12, background: "rgba(255,255,255,0.06)", borderRadius: 6, width: `${30 + (i * 19) % 50}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminAuditLogPage() {
  const [entries,      setEntries]      = useState<AuditEntry[]>([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [page,         setPage]         = useState(1);
  const [actionFilter, setAction]       = useState("");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [actorInput,   setActorInput]   = useState("");
  const [actorFilter,  setActorFilter]  = useState("");
  const [targetInput,  setTargetInput]  = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [toast,        setToast]        = useState<ToastData>(null);

  const actorDebRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetDebRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: "20" };
    if (actionFilter) params.action = actionFilter;
    if (dateFrom)     params.from   = dateFrom;
    if (dateTo)       params.to     = dateTo;
    if (actorFilter)  params.actor  = actorFilter;
    if (targetFilter) params.target = targetFilter;
    const res = await adminApi.getAuditLog(params);
    if (res.success) {
      setEntries((res.data as AuditEntry[]) ?? []);
      setTotal((res as unknown as { total: number }).total ?? 0);
    } else {
      setToast({ msg: "Failed to load audit log", type: "err" });
      setTimeout(() => setToast(null), 4000);
    }
    setLoading(false);
  }, [page, actionFilter, dateFrom, dateTo, actorFilter, targetFilter]);

  useEffect(() => { load(); }, [load]);

  function handleActorInput(val: string) {
    setActorInput(val);
    if (actorDebRef.current) clearTimeout(actorDebRef.current);
    actorDebRef.current = setTimeout(() => { setActorFilter(val); setPage(1); }, 400);
  }

  function handleTargetInput(val: string) {
    setTargetInput(val);
    if (targetDebRef.current) clearTimeout(targetDebRef.current);
    targetDebRef.current = setTimeout(() => { setTargetFilter(val); setPage(1); }, 400);
  }

  const resetFilters = () => {
    setAction(""); setDateFrom(""); setDateTo("");
    setActorInput(""); setActorFilter("");
    setTargetInput(""); setTargetFilter("");
    setPage(1);
  };

  const hasFilters = actionFilter || dateFrom || dateTo || actorFilter || targetFilter;
  const activeFilterCount = [actionFilter, actorFilter, targetFilter, dateFrom, dateTo].filter(Boolean).length;
  const totalPages = Math.ceil(total / 20);

  const exportCSV = () => {
    const rows = [
      ["Timestamp", "Admin", "Action", "Target User", "Notes"],
      ...entries.map(e => [
        e.created_at,
        `${userName(e.admin)} <${e.admin.email}>`,
        e.action,
        `${userName(e.target_user)} <${e.target_user.email}>`,
        e.notes ?? "",
      ]),
    ];
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ghostBtn: React.CSSProperties = {
    background: "transparent", border: `1px solid ${C.border}`, color: C.secondary,
    borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontFamily: "inherit",
  };

  const pageBtnStyle = (disabled: boolean): React.CSSProperties => ({
    background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
    color: disabled ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
    borderRadius: 8, padding: "6px 14px", cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13, fontFamily: "inherit",
  });

  const dateInputStyle: React.CSSProperties = { ...inputStyle, width: 148, colorScheme: "dark" as unknown as undefined };
  const selectStyle: React.CSSProperties    = { ...inputStyle, width: "auto", minWidth: 160, cursor: "pointer" };
  const textInputStyle: React.CSSProperties = { ...inputStyle, width: 180 };

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <ToastDisplay toast={toast} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.text }}>Audit Log</h1>
          <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 14 }}>All admin actions across the platform</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {hasFilters && (
            <button onClick={resetFilters} style={ghostBtn}>✕ Clear</button>
          )}
          <button
            onClick={exportCSV}
            style={{ ...ghostBtn, background: "rgba(0,144,255,0.1)", border: "1px solid rgba(0,144,255,0.3)", color: C.blue, fontWeight: 600 }}
          >
            ↓ Export CSV
          </button>
          <button onClick={load} style={ghostBtn}>↻ Refresh</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20, alignItems: "flex-end" }}>
        {/* From date */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            max={dateTo || fmtDateOnly(new Date().toISOString())}
            style={dateInputStyle}
          />
        </div>
        {/* To date */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
            min={dateFrom}
            max={fmtDateOnly(new Date().toISOString())}
            style={dateInputStyle}
          />
        </div>
        {/* Action */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>Action</label>
          <select
            value={actionFilter}
            onChange={e => { setAction(e.target.value); setPage(1); }}
            style={selectStyle}
          >
            <option value="">All actions</option>
            {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {/* Actor filter */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>Admin / actor</label>
          <input
            value={actorInput}
            onChange={e => handleActorInput(e.target.value)}
            placeholder="Filter by admin email…"
            style={textInputStyle}
          />
        </div>
        {/* Target filter */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>Target user</label>
          <input
            value={targetInput}
            onChange={e => handleTargetInput(e.target.value)}
            placeholder="Filter by user email…"
            style={textInputStyle}
          />
        </div>
        {/* Active filter count badge */}
        {activeFilterCount > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, justifyContent: "flex-end" }}>
            <span style={{
              padding: "5px 12px", borderRadius: 99, fontSize: 12, fontWeight: 700,
              background: "rgba(220,38,38,0.15)", color: C.accent,
              border: "1px solid rgba(220,38,38,0.3)",
              whiteSpace: "nowrap",
            }}>
              {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active
            </span>
          </div>
        )}
      </div>

      {/* Stats strip */}
      {!loading && (
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Showing {entries.length} of {total.toLocaleString()} events{hasFilters ? " (filtered)" : ""}
        </p>
      )}

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
                {["Timestamp", "Admin", "Action", "User Affected", "Notes"].map(h => (
                  <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "64px 24px", textAlign: "center" }}>
                    <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.2 }}>📋</div>
                    <div style={{ color: C.muted, fontSize: 15 }}>No events found</div>
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 13, marginTop: 6 }}>
                      {hasFilters ? "Try adjusting your filters." : "No audit events recorded yet."}
                    </div>
                  </td>
                </tr>
              ) : (
                entries.map(entry => {
                  const badge  = ACTION_BADGE[entry.action] ?? { label: entry.action.replace(/_/g, " "), color: C.muted, bg: "rgba(113,113,122,0.12)" };
                  const isOpen = expanded === entry.id;

                  return [
                    <tr
                      key={entry.id}
                      style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: isOpen ? "rgba(255,255,255,0.03)" : "transparent", transition: "background 0.1s" }}
                      onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isOpen ? "rgba(255,255,255,0.03)" : "transparent"; }}
                      onClick={() => setExpanded(isOpen ? null : entry.id)}
                    >
                      <td style={{ padding: "14px 20px", whiteSpace: "nowrap" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.secondary }}>
                          {new Date(entry.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                        </div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                          {new Date(entry.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </td>
                      <td style={{ padding: "14px 20px", maxWidth: 180 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userName(entry.admin)}</div>
                        <div style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.admin.email}</div>
                      </td>
                      <td style={{ padding: "14px 20px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: badge.color, background: badge.bg }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: "14px 20px", maxWidth: 220 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userName(entry.target_user)}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.target_user.email}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99, flexShrink: 0, color: entry.target_user.role === "WORKER" ? C.blue : C.teal, background: entry.target_user.role === "WORKER" ? "rgba(0,144,255,0.12)" : "rgba(20,184,166,0.12)" }}>
                            {entry.target_user.role}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "14px 20px", maxWidth: 200 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {entry.notes ? entry.notes.slice(0, 60) + (entry.notes.length > 60 ? "…" : "") : "—"}
                          </span>
                          <span style={{ color: C.muted, fontSize: 11, flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
                        </div>
                      </td>
                    </tr>,
                    ...(isOpen ? [<MetadataViewer key={`${entry.id}-meta`} entry={entry} />] : []),
                  ];
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 24 }}>
          <button
            onClick={() => { setPage(p => Math.max(1, p - 1)); setExpanded(null); }}
            disabled={page === 1}
            style={pageBtnStyle(page === 1)}
          >
            Previous
          </button>
          <span style={{ color: C.muted, fontSize: 13 }}>Page {page} of {totalPages}</span>
          <button
            onClick={() => { setPage(p => Math.min(totalPages, p + 1)); setExpanded(null); }}
            disabled={page >= totalPages}
            style={pageBtnStyle(page >= totalPages)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
