"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { employerApi } from "@/lib/api-client";
import { LoadingPage, Avatar, EmptyState, ErrorState } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Application {
  id:           string;
  status:       string;
  aiMatchScore?: number;
  appliedAt:    string;
  jobPost?:     { title: string; country: string };
  workerProfile?: {
    firstName?:          string;
    lastName?:           string;
    profession?:         string;
    countryOfResidence?: string;
    skills?:             { skill: string }[];
  };
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    APPLIED:            { bg: "rgba(59,130,246,0.12)",   color: "var(--blue-4)",     border: "rgba(59,130,246,0.25)"   },
    VIEWED:             { bg: "rgba(148,163,184,0.12)",  color: "#94a3b8",           border: "rgba(148,163,184,0.25)"  },
    SHORTLISTED:        { bg: "rgba(124,58,237,0.12)",   color: "var(--worker-3)",   border: "rgba(124,58,237,0.25)"   },
    INTERVIEWED:        { bg: "rgba(245,158,11,0.12)",   color: "var(--warning)",    border: "rgba(245,158,11,0.25)"   },
    ACCEPTED:           { bg: "rgba(16,185,129,0.12)",   color: "var(--success)",    border: "rgba(16,185,129,0.25)"   },
    REJECTED:           { bg: "rgba(244,63,94,0.12)",    color: "var(--danger)",     border: "rgba(244,63,94,0.25)"    },
    WITHDRAWN:          { bg: "rgba(113,113,122,0.12)",  color: "#71717a",           border: "rgba(113,113,122,0.25)"  },
    PENDING:            { bg: "rgba(245,158,11,0.12)",   color: "var(--warning)",    border: "rgba(245,158,11,0.25)"   },
    HIRED:              { bg: "rgba(16,185,129,0.12)",   color: "var(--success)",    border: "rgba(16,185,129,0.25)"   },
    INTERVIEW_REQUESTED:{ bg: "rgba(245,158,11,0.12)",   color: "var(--warning)",    border: "rgba(245,158,11,0.25)"   },
  };
  const s = map[status] ?? map.VIEWED;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: "nowrap" as const }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg, type }: { msg: string; type: "ok" | "err" }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: "rgba(30,41,59,0.9)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
      borderLeft: `3px solid ${type === "ok" ? "#16A34A" : "#DC2626"}`,
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 10, padding: "14px 20px",
      color: type === "ok" ? "#4ade80" : "#f87171",
      fontFamily: "var(--font-body)", fontSize: 14, boxShadow: "0 12px 32px rgba(0,0,0,0.4)", maxWidth: 360,
    }}>
      {msg}
    </div>
  );
}

// ── Filter tabs ───────────────────────────────────────────────────────────────

const FILTERS = ["All", "APPLIED", "VIEWED", "SHORTLISTED", "INTERVIEWED", "ACCEPTED", "REJECTED"];

// ── Main page ─────────────────────────────────────────────────────────────────

function EmployerApplicationsContent() {
  const [apps,         setApps]         = useState<Application[]>([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("All");
  const [page,         setPage]         = useState(1);
  const [hoverRow,     setHoverRow]     = useState<string | null>(null);
  const [toast,        setToast]        = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = { page: String(page), limit: "20" };
    if (activeFilter !== "All") params.status = activeFilter;
    const res = await employerApi.getApplications(params);
    if (!res.success) { setError(res.error ?? "Could not load applications."); setLoading(false); return; }
    setApps((res.data as unknown as Application[]) ?? []);
    setTotal((res as unknown as { total: number }).total ?? 0);
    setLoading(false);
  }, [page, activeFilter]);

  useEffect(() => { load(); }, [load]);

  const rejectApplication = async (id: string) => {
    const res = await employerApi.updateApplicationStatus(id, "REJECTED");
    if (res.success) { showToast("Application rejected.", "ok"); load(); }
    else showToast(res.error ?? "Failed to reject", "err");
  };

  if (loading) return <LoadingPage color="teal" />;
  if (error) {
    return (
      <div style={{ padding: "32px 40px", maxWidth: 1400, margin: "0 auto" }}>
        <ErrorState message={error} retry={load} title="Could not load applications" />
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1400, margin: "0 auto" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, color: "var(--white)", margin: "0 0 4px", letterSpacing: "-0.03em" }}>Applications</h1>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--muted)" }}>{total} total application{total !== 1 ? "s" : ""}</div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "var(--navy-2)", padding: 4, borderRadius: "var(--r-md)", border: "1px solid var(--border)", width: "fit-content", flexWrap: "wrap" as const }}>
        {FILTERS.map(f => {
          const active = activeFilter === f;
          return (
            <button key={f} onClick={() => { setActiveFilter(f); setPage(1); }} style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 12, fontWeight: active ? 700 : 500, color: active ? "var(--employer-3)" : "var(--muted)", background: active ? "rgba(13,148,136,0.15)" : "transparent", borderBottom: active ? "2px solid var(--employer-primary)" : "2px solid transparent", transition: "all 0.2s" }}>
              {f}
            </button>
          );
        })}
      </div>

      {apps.length === 0 ? (
        <EmptyState icon="📬" title="No applications yet" description="Applications matching this filter will appear here." />
      ) : (
        <div style={{ background: "var(--navy-2)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", minWidth: 920, borderCollapse: "collapse" as const }}>
            <thead>
              <tr style={{ background: "var(--navy-3)" }}>
                {["Applicant", "Applied For", "Match Score", "Status", "Applied Date", "Actions"].map(h => (
                  <th key={h} style={{ padding: "12px 20px", color: "var(--muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", textAlign: "left" as const, borderBottom: "1px solid var(--border)", fontFamily: "var(--font-body)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apps.map(app => {
                const name  = [app.workerProfile?.firstName, app.workerProfile?.lastName].filter(Boolean).join(" ") || "Applicant";
                const score = app.aiMatchScore;
                const isTerminal = app.status === "ACCEPTED" || app.status === "REJECTED" || app.status === "WITHDRAWN";

                return (
                  <tr key={app.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: hoverRow === app.id ? "rgba(13,148,136,0.03)" : "transparent", transition: "background 0.15s" }}
                    onMouseEnter={() => setHoverRow(app.id)}
                    onMouseLeave={() => setHoverRow(null)}
                  >
                    {/* Applicant */}
                    <td style={{ padding: "14px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar name={name} size="sm" />
                        <div>
                          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--white)" }}>{name}</div>
                          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                            {app.workerProfile?.profession}{app.workerProfile?.countryOfResidence ? ` · ${app.workerProfile.countryOfResidence}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Applied For */}
                    <td style={{ padding: "14px 20px" }}>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--white)" }}>{app.jobPost?.title ?? "—"}</div>
                      {app.jobPost?.country && <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--muted)" }}>🌍 {app.jobPost.country}</div>}
                    </td>

                    {/* Match Score */}
                    <td style={{ padding: "14px 20px" }}>
                      {score != null ? (
                        <div>
                          <span style={{
                            display: "inline-block",
                            fontSize: 12, fontWeight: 700,
                            padding: "3px 9px", borderRadius: 99,
                            fontFamily: "var(--font-display)",
                            color:       score >= 80 ? "#15803d" : score >= 60 ? "#92400e" : "#4b5563",
                            background:  score >= 80 ? "rgba(21,128,61,0.12)" : score >= 60 ? "rgba(146,64,14,0.12)" : "rgba(75,85,99,0.12)",
                            border: `1px solid ${score >= 80 ? "rgba(21,128,61,0.25)" : score >= 60 ? "rgba(146,64,14,0.25)" : "rgba(75,85,99,0.25)"}`,
                          }}>
                            {score.toFixed(0)}%
                          </span>
                          <div style={{ width: 64, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, marginTop: 5 }}>
                            <div style={{ width: `${score}%`, height: "100%", borderRadius: 2,
                              background: score >= 80 ? "#16a34a" : score >= 60 ? "#d97706" : "#6b7280" }} />
                          </div>
                        </div>
                      ) : <span style={{ color: "var(--muted)", fontSize: 13 }}>—</span>}
                    </td>

                    {/* Status */}
                    <td style={{ padding: "14px 20px" }}>
                      <StatusBadge status={app.status} />
                    </td>

                    {/* Applied Date */}
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--muted)" }}>
                        {new Date(app.appliedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "14px 20px" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        {/* Interview scheduling and hire confirmation moved to DirectHire's
                            admin-mediated workflow — no employer-side action here anymore.
                            The Status column already reflects progress once admin acts. */}
                        {!isTerminal && app.status !== "INTERVIEWED" && (
                          <span style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, maxWidth: 180 }}>
                            Interview and hire is handled by DirectHire once your candidate is cleared.
                          </span>
                        )}

                        {/* Reject button — icon only */}
                        <button
                          onClick={() => rejectApplication(app.id)}
                          disabled={isTerminal}
                          title="Reject application"
                          style={{ width: 30, height: 30, borderRadius: "50%", background: "transparent", border: "1px solid rgba(244,63,94,0.2)", cursor: isTerminal ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(244,63,94,0.7)", opacity: isTerminal ? 0.4 : 1, transition: "all 0.2s", flexShrink: 0 }}
                          onMouseEnter={e => { if (!isTerminal) (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(244,63,94,0.5)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(244,63,94,0.2)"; }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 20 && (
            <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--muted)" }}>
                Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "7px 14px", background: "var(--glass)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--muted)", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.4 : 1, fontFamily: "var(--font-body)", fontSize: 13 }}>← Prev</button>
                <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= total} style={{ padding: "7px 14px", background: "var(--glass)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--muted)", cursor: page * 20 >= total ? "not-allowed" : "pointer", opacity: page * 20 >= total ? 0.4 : 1, fontFamily: "var(--font-body)", fontSize: 13 }}>Next →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EmployerApplicationsPage() {
  return (
    <Suspense fallback={<LoadingPage color="teal" />}>
      <EmployerApplicationsContent />
    </Suspense>
  );
}
