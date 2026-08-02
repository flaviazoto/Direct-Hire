"use client";
// src/app/(app)/employer/interviews/page.tsx
// Part B — employer-side screening interview request (Step B1). Built as its
// own standalone route rather than as an addition to
// /employer/workers/[workerId]: that file is an exhaustiveness-surface file
// from Phase 1 and the Part B prompt granted no exception for it — same
// resolution pattern used throughout this project (e.g. /employer/document-
// requests, /worker/document-requests, /worker/application-status).
//
// New model: the employer never talks to the worker directly. This page's
// only actions are "request a screening interview" (with an optional free-
// text note for anything specific to confirm) and, once admin has conducted
// the call and relayed the outcome off-platform, viewing that outcome here.
// No worker contact info and no direct messaging channel is exposed.

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
  workflowStatus: string | null;
  status: string;
  worker: { workerProfile: { firstName: string | null; lastName: string | null } | null };
  job: { id: string; title: string; companyName: string };
  interview: InterviewInfo | null;
}

function candidateName(app: AppRow) {
  return [app.worker.workerProfile?.firstName, app.worker.workerProfile?.lastName].filter(Boolean).join(" ") || "Candidate";
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function StageInfo({ app }: { app: AppRow }) {
  if (!app.interview) {
    return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: "#71717a", background: "rgba(113,113,122,0.1)" }}>Cleared — ready to request</span>;
  }
  if (app.status === "ACCEPTED") {
    return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: "#4ade80", background: "rgba(74,222,128,0.1)" }}>Hired</span>;
  }
  if (app.status === "REJECTED") {
    return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: "#f87171", background: "rgba(248,113,113,0.1)" }}>Not selected</span>;
  }
  if (app.interview.relayedToEmployerAt) {
    return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: "#60a5fa", background: "rgba(96,165,250,0.1)" }}>Outcome shared with you</span>;
  }
  return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: "#fbbf24", background: "rgba(251,191,36,0.1)" }}>Interview in progress</span>;
}

export default function EmployerInterviewsPage() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const showToast = useCallback((msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await employerApi.getMyInterviews();
    if (!res.success) { setError(res.error ?? "Could not load interview requests."); setLoading(false); return; }
    setApps((res.data as unknown as AppRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRequest(applicationId: string) {
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

  if (loading) return <LoadingPage color="blue" />;

  const readyToRequest = apps.filter(a => !a.interview);
  const inProgress = apps.filter(a => a.interview && a.status !== "ACCEPTED" && a.status !== "REJECTED");
  const resolved = apps.filter(a => a.interview && (a.status === "ACCEPTED" || a.status === "REJECTED"));

  return (
    <div className="min-h-screen px-4 sm:px-6 pt-6 pb-8 md:px-8" style={{ maxWidth: 900, margin: "0 auto" }}>
      <ToastDisplay toast={toast} />

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>Screening Interviews</div>
        <div style={{ fontSize: 13, color: "#71717a", marginTop: 4 }}>
          Request a screening interview and admin will conduct the call on your behalf. Admin relays the outcome
          to you directly (email or WhatsApp) — you&apos;ll never be contacted by, or need to contact, the candidate
          before a hire decision.
        </div>
      </div>

      {error ? (
        <ErrorState message={error} retry={load} title="Could not load interviews" />
      ) : apps.length === 0 ? (
        <EmptyState icon="🎙️" title="No candidates ready yet" description="Candidates appear here once they're cleared for you to interview." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {readyToRequest.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                Ready to request ({readyToRequest.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {readyToRequest.map(app => (
                  <div key={app.id} style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{candidateName(app)}</div>
                        <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>{app.job.title}</div>
                      </div>
                      <StageInfo app={app} />
                    </div>
                    <textarea
                      value={notesDraft[app.id] ?? ""}
                      onChange={e => setNotesDraft(prev => ({ ...prev, [app.id]: e.target.value }))}
                      placeholder="Anything specific you'd like confirmed during screening (optional)…"
                      rows={2}
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e4e4e7", fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 10 }}
                    />
                    <button
                      onClick={() => handleRequest(app.id)}
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
                ))}
              </div>
            </div>
          )}

          {inProgress.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                In progress ({inProgress.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {inProgress.map(app => (
                  <div key={app.id} style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{candidateName(app)}</div>
                        <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>{app.job.title}</div>
                        <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 6 }}>
                          Requested {fmtDate(app.interview!.requestedAt)}.
                          {app.interview!.relayedToEmployerAt
                            ? " We've sent you the outcome by email or WhatsApp — check there for next steps."
                            : " Admin is conducting the screening call."}
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
