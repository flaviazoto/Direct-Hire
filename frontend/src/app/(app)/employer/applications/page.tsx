"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { employerApi } from "@/lib/api-client";
import { LoadingPage, Avatar, EmptyState } from "@/components/ui";

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

// ── Interview Modal ───────────────────────────────────────────────────────────

function InterviewModal({ app, onClose, onConfirm }: { app: Application; onClose: () => void; onConfirm: (data: { date: string; time: string; type: string; notes: string }) => void }) {
  const [date,  setDate]  = useState("");
  const [time,  setTime]  = useState("");
  const [type,  setType]  = useState("Video Call");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const name = [app.workerProfile?.firstName, app.workerProfile?.lastName].filter(Boolean).join(" ") || "Applicant";
  const INP: React.CSSProperties = { width: "100%", background: "var(--navy-3)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "10px 14px", fontSize: 14, color: "var(--white)", outline: "none", fontFamily: "var(--font-body)", colorScheme: "dark" as const };

  const handleConfirm = async () => {
    if (!date || !time) return;
    setSubmitting(true);
    await onConfirm({ date, time, type, notes });
    setSubmitting(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
      <div style={{ background: "var(--navy-2)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 20, padding: 36, maxWidth: 520, width: "100%", fontFamily: "var(--font-body)" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "var(--white)", margin: "0 0 6px" }}>Schedule Interview</h2>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 24px" }}>
          {name} — {app.jobPost?.title ?? "Position"}
        </p>

        <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={INP} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={INP} />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 10 }}>Interview Type</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["Video Call", "Phone", "In-Person"].map(t => (
                <div key={t} onClick={() => setType(t)} style={{ flex: 1, padding: 14, border: `1px solid ${type === t ? "var(--blue-3)" : "var(--border)"}`, borderRadius: "var(--r-md)", background: type === t ? "rgba(59,130,246,0.08)" : "var(--glass)", cursor: "pointer", textAlign: "center" as const, fontSize: 13, fontWeight: 500, color: type === t ? "var(--blue-4)" : "var(--muted)", transition: "all 0.2s" }}>
                  {t === "Video Call" ? "🎥" : t === "Phone" ? "📞" : "🏢"}<br />{t}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Any specific instructions for the candidate..." style={{ ...INP, resize: "vertical" as const }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "var(--glass)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", color: "var(--white)", fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleConfirm} disabled={!date || !time || submitting} style={{ flex: 2, padding: "12px", background: "var(--blue-2)", border: "none", borderRadius: "var(--r-md)", color: "white", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, cursor: (!date || !time) ? "not-allowed" : "pointer", opacity: (!date || !time) ? 0.6 : 1, boxShadow: "0 4px 20px rgba(30,84,183,0.35)" }}>
            {submitting ? "Sending..." : "Send Interview Invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hire Confirm Modal ────────────────────────────────────────────────────────

function HireConfirmModal({ app, onClose, onConfirm }: { app: Application; onClose: () => void; onConfirm: (data: { salary: string; startDate: string; contractType: string }) => void }) {
  const [salary,       setSalary]       = useState("");
  const [startDate,    setStartDate]    = useState("");
  const [contractType, setContractType] = useState("Full-time");
  const [submitting,   setSubmitting]   = useState(false);

  const name = [app.workerProfile?.firstName, app.workerProfile?.lastName].filter(Boolean).join(" ") || "Applicant";
  const INP: React.CSSProperties = { width: "100%", background: "var(--navy-3)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "10px 14px", fontSize: 14, color: "var(--white)", outline: "none", fontFamily: "var(--font-body)", colorScheme: "dark" as const };

  const handleConfirm = async () => {
    setSubmitting(true);
    await onConfirm({ salary, startDate, contractType });
    setSubmitting(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
      <div style={{ background: "var(--navy-2)", border: "1px solid rgba(13,148,136,0.3)", borderRadius: 20, padding: 36, maxWidth: 480, width: "100%", fontFamily: "var(--font-body)" }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(13,148,136,0.15)", border: "2px solid rgba(13,148,136,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--employer-2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>

        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "var(--white)", margin: "0 0 8px", textAlign: "center" as const }}>Confirm Hire</h2>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 24px", textAlign: "center" as const }}>
          You are about to hire <strong style={{ color: "var(--white)" }}>{name}</strong> for <strong style={{ color: "var(--white)" }}>{app.jobPost?.title ?? "this position"}</strong>.
        </p>

        <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Salary Offered (monthly)</label>
            <input type="number" value={salary} onChange={e => setSalary(e.target.value)} placeholder="e.g. 5000" style={INP} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={INP} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Contract Type</label>
            <select value={contractType} onChange={e => setContractType(e.target.value)} style={INP}>
              <option>Full-time</option>
              <option>Part-time</option>
              <option>Contract</option>
              <option>Freelance</option>
            </select>
          </div>

          <div style={{ background: "rgba(13,148,136,0.08)", border: "1px solid rgba(13,148,136,0.2)", borderRadius: "var(--r-md)", padding: "14px 16px", fontSize: 13, color: "var(--employer-3)", lineHeight: 1.65 }}>
            Once confirmed, this candidate will be notified and a reservation will be created automatically.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "var(--glass)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", color: "var(--white)", fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleConfirm} disabled={submitting} style={{ flex: 2, padding: "12px", background: "linear-gradient(135deg, var(--employer-primary), var(--employer-2))", border: "none", borderRadius: "var(--r-md)", color: "white", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 20px var(--employer-glow)" }}>
            {submitting ? "Confirming..." : "Confirm Hire ✓"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg, type }: { msg: string; type: "ok" | "err" }) {
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: type === "ok" ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)", border: `1px solid ${type === "ok" ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)"}`, borderRadius: "var(--r-md)", padding: "14px 20px", color: type === "ok" ? "var(--success)" : "var(--danger)", fontFamily: "var(--font-body)", fontSize: 14, boxShadow: "0 4px 24px rgba(0,0,0,0.3)", maxWidth: 360 }}>
      {msg}
    </div>
  );
}

// ── Filter tabs ───────────────────────────────────────────────────────────────

const FILTERS = ["All", "APPLIED", "VIEWED", "SHORTLISTED", "INTERVIEWED", "ACCEPTED", "REJECTED"];

// ── Main page ─────────────────────────────────────────────────────────────────

function EmployerApplicationsContent() {
  const router = useRouter();

  const [apps,         setApps]         = useState<Application[]>([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [activeFilter, setActiveFilter] = useState("All");
  const [page,         setPage]         = useState(1);
  const [hoverRow,     setHoverRow]     = useState<string | null>(null);
  const [toast,        setToast]        = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const [interviewApp, setInterviewApp] = useState<Application | null>(null);
  const [hireApp,      setHireApp]      = useState<Application | null>(null);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: "20" };
    if (activeFilter !== "All") params.status = activeFilter;
    const res = await employerApi.getApplications(params);
    if (!res.success) { router.push("/login"); return; }
    setApps((res.data as unknown as Application[]) ?? []);
    setTotal((res as unknown as { total: number }).total ?? 0);
    setLoading(false);
  }, [page, activeFilter, router]);

  useEffect(() => { load(); }, [load]);

  const handleScheduleInterview = (app: Application) => {
    if (app.status === "ACCEPTED" || app.status === "REJECTED") return;
    setInterviewApp(app);
  };

  const handleHire = (app: Application) => {
    if (app.status === "ACCEPTED" || app.status === "REJECTED") return;
    setHireApp(app);
  };

  const confirmInterview = async (app: Application, data: { date: string; time: string; type: string; notes: string }) => {
    const res = await employerApi.updateApplicationStatus(app.id, "INTERVIEWED", {
      interview_instructions: `${data.type} interview on ${data.date} at ${data.time}. ${data.notes}`.trim(),
    });
    setInterviewApp(null);
    if (res.success) { showToast(`Interview invitation sent to ${[app.workerProfile?.firstName, app.workerProfile?.lastName].filter(Boolean).join(" ") || "applicant"}`, "ok"); load(); }
    else showToast(res.error ?? "Failed to schedule interview", "err");
  };

  const confirmHire = async (app: Application, data: { salary: string; startDate: string; contractType: string }) => {
    const res = await employerApi.updateApplicationStatus(app.id, "ACCEPTED");
    setHireApp(null);
    if (res.success) {
      const name = [app.workerProfile?.firstName, app.workerProfile?.lastName].filter(Boolean).join(" ") || "Candidate";
      showToast(`🎉 ${name} has been hired! Reservation created.`, "ok");
      load();
    } else {
      showToast(res.error ?? "Failed to confirm hire", "err");
    }
  };

  const rejectApplication = async (id: string) => {
    const res = await employerApi.updateApplicationStatus(id, "REJECTED");
    if (res.success) { showToast("Application rejected.", "ok"); load(); }
    else showToast(res.error ?? "Failed to reject", "err");
  };

  if (loading) return <LoadingPage color="teal" />;

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
          <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
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
                      {score !== undefined ? (
                        <div>
                          <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: score >= 80 ? "var(--employer-3)" : score >= 60 ? "var(--blue-4)" : "var(--warning)" }}>{score}%</div>
                          <div style={{ width: 80, height: 4, background: "rgba(13,148,136,0.15)", borderRadius: 2, marginTop: 4 }}>
                            <div style={{ width: `${score}%`, height: "100%", background: "linear-gradient(90deg, var(--employer-primary), var(--employer-2))", borderRadius: 2 }} />
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

                    {/* Actions — CRITICAL FIX */}
                    <td style={{ padding: "14px 20px" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {/* Interview button */}
                        <button
                          className="btn-interview"
                          onClick={() => handleScheduleInterview(app)}
                          disabled={isTerminal}
                          title="Schedule Interview"
                        >
                          📅 Interview
                        </button>

                        {/* Hire button */}
                        <button
                          className="btn-hire"
                          onClick={() => handleHire(app)}
                          disabled={isTerminal}
                          title="Hire this candidate"
                        >
                          ✓ Hire
                        </button>

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

      {/* Modals */}
      {interviewApp && (
        <InterviewModal
          app={interviewApp}
          onClose={() => setInterviewApp(null)}
          onConfirm={data => confirmInterview(interviewApp, data)}
        />
      )}

      {hireApp && (
        <HireConfirmModal
          app={hireApp}
          onClose={() => setHireApp(null)}
          onConfirm={data => confirmHire(hireApp, data)}
        />
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
