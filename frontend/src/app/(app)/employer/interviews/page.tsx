"use client";
// src/app/(app)/employer/interviews/page.tsx
// Part B — employer-side screening interview request. Extended for the
// major hire-confirmation-gate resequencing: once DOCUMENTS_APPROVED, the
// employer also gets an independent "Hire" action here (neither action
// requires the other). Built as its own standalone route rather than an
// addition to /employer/workers/[workerId]: that file is an exhaustiveness-
// surface file and no exception was granted for it — same resolution
// pattern used throughout this project (e.g. /employer/document-requests,
// /worker/document-requests, /worker/application-status).
//
// Clicking Hire does NOT finalize anything — it captures the offer (salary/
// start date/contract type) and moves the application to
// HIRE_PENDING_WORKER_CONFIRMATION. The worker must actively confirm
// in-app before it's final and the admin fee triggers. No worker contact
// info and no direct messaging channel is exposed anywhere on this page.

import { useCallback, useEffect, useState } from "react";
import { employerApi } from "@/lib/api-client";
import { LoadingPage, ErrorState, EmptyState, ToastDisplay, type ToastData } from "@/components/ui";

type Recommendation = "RECOMMEND" | "DOES_NOT_MEET_REQUIREMENTS" | "NEEDS_FOLLOW_UP";
interface InterviewInfo {
  requestNotes: string | null;
  requestedAt: string;
  conductedAt: string | null;
  recommendation: Recommendation | null;
  relayedToEmployerAt: string | null;
}
interface AppRow {
  id: string;
  status: string;
  workflowStatus: string | null;
  offeredSalary: string | null;
  offeredCurrency: string | null;
  startDate: string | null;
  contractType: string | null;
  worker: { workerProfile: { firstName: string | null; lastName: string | null } | null };
  job: { id: string; title: string; companyName: string };
  interview: InterviewInfo | null;
}

const CONTRACT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "INTERNSHIP", "FREELANCE"];

function candidateName(app: AppRow) {
  return [app.worker.workerProfile?.firstName, app.worker.workerProfile?.lastName].filter(Boolean).join(" ") || "Candidate";
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function StageInfo({ app }: { app: AppRow }) {
  if (app.status === "ACCEPTED") {
    return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: "#4ade80", background: "rgba(74,222,128,0.1)" }}>Hired</span>;
  }
  if (app.status === "REJECTED") {
    return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: "#f87171", background: "rgba(248,113,113,0.1)" }}>Not selected</span>;
  }
  if (app.workflowStatus === "HIRE_PENDING_WORKER_CONFIRMATION") {
    return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: "#fbbf24", background: "rgba(251,191,36,0.1)" }}>Awaiting worker confirmation</span>;
  }
  if (!app.interview) {
    return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: "#71717a", background: "rgba(113,113,122,0.1)" }}>Documents approved</span>;
  }
  if (app.interview.relayedToEmployerAt) {
    return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: "#60a5fa", background: "rgba(96,165,250,0.1)" }}>Outcome shared with you</span>;
  }
  return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: "#fbbf24", background: "rgba(251,191,36,0.1)" }}>Interview in progress</span>;
}

const textareaStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)", color: "#e4e4e7", fontSize: 13, fontFamily: "inherit",
  resize: "vertical", boxSizing: "border-box", marginBottom: 10,
};
const inputStyle: React.CSSProperties = {
  padding: "9px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)", color: "#e4e4e7", fontSize: 13, fontFamily: "inherit",
  boxSizing: "border-box",
};

export default function EmployerInterviewsPage() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [requestingId, setRequestingId] = useState<string | null>(null);

  // Hire form — per-candidate, toggled open on demand
  const [hireFormOpenFor, setHireFormOpenFor] = useState<string | null>(null);
  const [hireSalary, setHireSalary] = useState("");
  const [hireCurrency, setHireCurrency] = useState("USD");
  const [hireStartDate, setHireStartDate] = useState("");
  const [hireContractType, setHireContractType] = useState("FULL_TIME");
  const [hiringId, setHiringId] = useState<string | null>(null);

  const showToast = useCallback((msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await employerApi.getMyInterviews();
    if (!res.success) { setError(res.error ?? "Could not load candidates."); setLoading(false); return; }
    setApps((res.data as unknown as AppRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRequestInterview(applicationId: string) {
    setRequestingId(applicationId);
    const res = await employerApi.requestInterview(applicationId, notesDraft[applicationId]?.trim() || undefined);
    setRequestingId(null);
    if (res.success) {
      showToast("Interview requested — admin will conduct the screening call", "ok");
      load();
    } else {
      showToast(res.error ?? "Could not request interview", "err");
    }
  }

  function openHireForm(applicationId: string) {
    setHireFormOpenFor(applicationId);
    setHireSalary(""); setHireCurrency("USD"); setHireStartDate(""); setHireContractType("FULL_TIME");
  }

  async function handleHire(applicationId: string) {
    setHiringId(applicationId);
    const res = await employerApi.requestHire(applicationId, {
      offeredSalary: hireSalary.trim() || undefined,
      offeredCurrency: hireCurrency,
      startDate: hireStartDate || undefined,
      contractType: hireContractType,
    });
    setHiringId(null);
    if (res.success) {
      showToast("Hire requested — waiting on the worker to confirm", "ok");
      setHireFormOpenFor(null);
      load();
    } else {
      showToast(res.error ?? "Could not request hire", "err");
    }
  }

  if (loading) return <LoadingPage color="blue" />;

  const actionable = apps.filter(a => a.workflowStatus === "DOCUMENTS_APPROVED");
  const hirePending = apps.filter(a => a.workflowStatus === "HIRE_PENDING_WORKER_CONFIRMATION");
  const resolved = apps.filter(a =>
    a.status === "ACCEPTED" || a.status === "REJECTED" ||
    a.workflowStatus === "ADMIN_FEE_DUE" || a.workflowStatus === "ADMIN_FEE_PAID" || a.workflowStatus === "CLEARED_FOR_EMPLOYER",
  );

  return (
    <div className="min-h-screen px-4 sm:px-6 pt-6 pb-8 md:px-8" style={{ maxWidth: 900, margin: "0 auto" }}>
      <ToastDisplay toast={toast} />

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>Interviews &amp; Hiring</div>
        <div style={{ fontSize: 13, color: "#71717a", marginTop: 4 }}>
          Once a candidate&apos;s documents are approved, you can request a screening interview (admin conducts the
          call on your behalf) and/or hire directly — neither requires the other. A hire isn&apos;t final until the
          worker confirms it themselves.
        </div>
      </div>

      {error ? (
        <ErrorState message={error} retry={load} title="Could not load candidates" />
      ) : apps.length === 0 ? (
        <EmptyState icon="🎙️" title="No candidates ready yet" description="Candidates appear here once their documents are approved." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {actionable.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                Ready to act ({actionable.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {actionable.map(app => (
                  <div key={app.id} style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{candidateName(app)}</div>
                        <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>{app.job.title}</div>
                        {app.interview && (
                          <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 6 }}>
                            Interview requested {fmtDate(app.interview.requestedAt)}.
                            {app.interview.relayedToEmployerAt
                              ? " We've sent you the outcome by email or WhatsApp — check there for next steps."
                              : " Admin is conducting the screening call."}
                          </div>
                        )}
                      </div>
                      <StageInfo app={app} />
                    </div>

                    {!app.interview && (
                      <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <textarea
                          value={notesDraft[app.id] ?? ""}
                          onChange={e => setNotesDraft(prev => ({ ...prev, [app.id]: e.target.value }))}
                          placeholder="Anything specific you'd like confirmed during screening (optional)…"
                          rows={2}
                          style={textareaStyle}
                        />
                        <button
                          onClick={() => handleRequestInterview(app.id)}
                          disabled={requestingId === app.id}
                          style={{
                            padding: "9px 18px", borderRadius: 8, border: "none",
                            background: "#0090FF", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                            cursor: requestingId === app.id ? "default" : "pointer",
                          }}
                        >
                          {requestingId === app.id ? "Requesting…" : "Request interview"}
                        </button>
                      </div>
                    )}

                    {hireFormOpenFor === app.id ? (
                      <div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 8, marginBottom: 8 }}>
                          <input value={hireSalary} onChange={e => setHireSalary(e.target.value)} placeholder="Offered salary" style={inputStyle} />
                          <select value={hireCurrency} onChange={e => setHireCurrency(e.target.value)} style={inputStyle}>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                            <option value="GBP">GBP</option>
                          </select>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                          <input type="date" value={hireStartDate} onChange={e => setHireStartDate(e.target.value)} style={inputStyle} />
                          <select value={hireContractType} onChange={e => setHireContractType(e.target.value)} style={inputStyle}>
                            {CONTRACT_TYPES.map(ct => <option key={ct} value={ct}>{ct.replace("_", " ")}</option>)}
                          </select>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => handleHire(app.id)}
                            disabled={hiringId === app.id}
                            style={{
                              padding: "9px 18px", borderRadius: 8, border: "none",
                              background: "#16A34A", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                              cursor: hiringId === app.id ? "default" : "pointer",
                            }}
                          >
                            {hiringId === app.id ? "Requesting…" : "Confirm hire request"}
                          </button>
                          <button
                            onClick={() => setHireFormOpenFor(null)}
                            style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#a1a1aa", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => openHireForm(app.id)}
                        style={{
                          padding: "9px 18px", borderRadius: 8, border: "1px solid rgba(22,163,74,0.3)",
                          background: "rgba(22,163,74,0.1)", color: "#4ade80", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                        }}
                      >
                        Hire
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {hirePending.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                Awaiting worker confirmation ({hirePending.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {hirePending.map(app => (
                  <div key={app.id} style={{ background: "#161616", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 12, padding: "14px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{candidateName(app)}</div>
                        <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>{app.job.title}</div>
                        <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 6 }}>
                          You&apos;ve requested this hire — waiting on the worker to confirm before it&apos;s final.
                          {app.offeredSalary && <> Offer: {app.offeredSalary} {app.offeredCurrency}.</>}
                          {app.startDate && <> Start: {fmtDate(app.startDate)}.</>}
                        </div>
                      </div>
                      <StageInfo app={app} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resolved.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                Resolved ({resolved.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {resolved.map(app => (
                  <div key={app.id} style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 18px", opacity: 0.75 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{candidateName(app)}</div>
                        <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>{app.job.title}</div>
                      </div>
                      <StageInfo app={app} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
