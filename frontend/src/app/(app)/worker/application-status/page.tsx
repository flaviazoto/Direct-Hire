"use client";
// src/app/(app)/worker/application-status/page.tsx
// Phase 5, Step 1 — visual progress indicator for each application's
// workflowStatus (admin-mediated review/docs/fee/clearance) plus the
// existing hiring pipeline (interview/hired) it feeds into.
//
// Built as its own standalone route rather than inside worker/applications/
// page.tsx's expandable detail panel, which is where the prompt suggested it
// — that file is one of Phase 1's exhaustiveness-surface files, and unlike
// Phase 4's Step 1/Step 3, no exception is carved out for it anywhere in this
// phase's cross-cutting section. Mirrors /worker/document-requests (Phase 4
// Step 1): a flat list of applications, one tracker per application, with
// its own nav entry for discoverability — the same resolution used there for
// the identical conflict.
//
// Reuses the onboarding wizard's "Premium Stepper" visual pattern (numbered
// circles + connecting lines + checkmarks) rather than inventing a new one,
// per the explicit instruction to check for and reuse an existing pattern.
// No new backend endpoint: workerApi.getApplications already returns
// workflowStatus (added this phase — it wasn't selected before), and
// workerApi.getMyDocumentRequests (Phase 4) already provides the "is there a
// pending document request" signal the Documents-pending stage links out to.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { workerApi } from "@/lib/api-client";
import { LoadingPage, ErrorState, EmptyState } from "@/components/ui";

type WorkflowStatus =
  | "PENDING_ADMIN_REVIEW" | "APPROVED_QUEUED" | "DOCUMENTS_PENDING" | "DOCUMENTS_APPROVED"
  | "ADMIN_FEE_DUE" | "ADMIN_FEE_PAID" | "CLEARED_FOR_EMPLOYER" | null;

interface AppRow {
  id: string;
  status: string;
  workflowStatus: WorkflowStatus;
  createdAt: string;
  job: { title: string; companyName: string };
}
interface DocGroup { id: string; documents: { status: string }[] }

const PIPELINE_STATUS_LABEL: Record<string, string> = {
  APPLIED: "Applied", VIEWED: "Viewed", SHORTLISTED: "Shortlisted",
  INTERVIEWED: "Interview", ACCEPTED: "Hired", REJECTED: "Not selected", WITHDRAWN: "Withdrawn",
};

// Ordered chain — indices 0-6 come from workflowStatus, 7-8 continue via the
// existing Application.status field once CLEARED_FOR_EMPLOYER is reached
// (workflowStatus itself never advances past CLEARED_FOR_EMPLOYER — see
// Phase 3's design notes).
const STEPS: { key: string; label: string }[] = [
  { key: "PENDING_ADMIN_REVIEW", label: "Admin reviewing" },
  { key: "APPROVED_QUEUED",      label: "Approved, queued" },
  { key: "DOCUMENTS_PENDING",    label: "Documents pending" },
  { key: "DOCUMENTS_APPROVED",   label: "Documents verified" },
  { key: "ADMIN_FEE_DUE",        label: "Fee due" },
  { key: "ADMIN_FEE_PAID",       label: "Fee paid" },
  { key: "CLEARED_FOR_EMPLOYER", label: "Cleared" },
  { key: "INTERVIEWED",          label: "Interview" },
  { key: "ACCEPTED",             label: "Hired" },
];

function currentStepIndex(app: AppRow): number {
  if (app.workflowStatus === "CLEARED_FOR_EMPLOYER") {
    if (app.status === "ACCEPTED") return 8;
    if (app.status === "INTERVIEWED") return 7;
  }
  const idx = STEPS.findIndex(s => s.key === app.workflowStatus);
  return idx === -1 ? 0 : idx;
}

function Stepper({ app, hasPendingDoc }: { app: AppRow; hasPendingDoc: boolean }) {
  const current = currentStepIndex(app);
  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0, minWidth: STEPS.length * 84 }}>
        {STEPS.map((step, i) => {
          const done = i < current;
          const isCurrent = i === current;
          return (
            <div key={step.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, position: "relative" }}>
              {i > 0 && (
                <div style={{
                  position: "absolute", top: 13, left: "-50%", right: "50%", height: 2, zIndex: 0,
                  background: i <= current ? "linear-gradient(90deg, #0090FF, #6366F1)" : "rgba(255,255,255,0.08)",
                }} />
              )}
              <div style={{
                width: 26, height: 26, borderRadius: "50%", zIndex: 1,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
                background: done ? "linear-gradient(135deg, #0090FF, #6366F1)" : isCurrent ? "rgba(0,144,255,0.15)" : "rgba(255,255,255,0.05)",
                border: isCurrent ? "2px solid #0090FF" : done ? "none" : "2px solid rgba(255,255,255,0.1)",
                color: done || isCurrent ? "#fff" : "rgba(255,255,255,0.3)",
              }}>
                {done ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : i + 1}
              </div>
              <span style={{
                fontSize: 10, fontWeight: isCurrent ? 700 : 400, textAlign: "center", marginTop: 6, lineHeight: 1.3,
                color: isCurrent ? "#60a5fa" : done ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.25)",
              }}>
                {step.label}
              </span>
              {isCurrent && step.key === "DOCUMENTS_PENDING" && hasPendingDoc && (
                <Link href="/worker/document-requests" style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", textDecoration: "none", marginTop: 4, whiteSpace: "nowrap" }}>
                  Upload now →
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function WorkerApplicationStatusPage() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [pendingDocAppIds, setPendingDocAppIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [appsRes, docsRes] = await Promise.all([
      workerApi.getApplications({ limit: "100" }),
      workerApi.getMyDocumentRequests(),
    ]);
    if (!appsRes.success) { setError(appsRes.error ?? "Could not load applications."); setLoading(false); return; }
    setApps((appsRes.data as unknown as AppRow[]) ?? []);
    if (docsRes.success) {
      const groups = (docsRes.data as unknown as DocGroup[]) ?? [];
      setPendingDocAppIds(new Set(groups.filter(g => g.documents.some(d => d.status === "REQUESTED")).map(g => g.id)));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingPage color="blue" />;

  return (
    <div className="min-h-screen px-4 sm:px-6 pt-6 pb-8 md:px-8" style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#f8fafc" }}>Application Status</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
          Track where each application stands, from review through hire.
        </div>
      </div>

      {error ? (
        <ErrorState message={error} retry={load} title="Could not load applications" />
      ) : apps.length === 0 ? (
        <EmptyState icon="📋" title="No applications yet" description="Apply to a job to start tracking its progress here." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {apps.map(app => {
            const isTerminalOutcome = app.status === "REJECTED" || app.status === "WITHDRAWN";
            return (
              <div key={app.id} style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "18px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{app.job.title}</div>
                    <div style={{ fontSize: 12, color: "#71717a" }}>{app.job.companyName}</div>
                  </div>
                  {isTerminalOutcome && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#f87171", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 20, padding: "3px 10px" }}>
                      {PIPELINE_STATUS_LABEL[app.status] ?? app.status}
                    </span>
                  )}
                </div>

                {isTerminalOutcome ? (
                  // Not selected / withdrawn — the forward-looking tracker no longer
                  // applies (matches the null-workflowStatus instruction's spirit:
                  // don't render progress that implies a future that won't happen).
                  <div style={{ fontSize: 12, color: "#71717a" }}>
                    This application is closed.
                  </div>
                ) : app.workflowStatus == null ? (
                  // Pre-migration terminal application never entered the admin
                  // workflow at all (see the backfill follow-up) — show the
                  // existing hiring-pipeline status only, not a broken tracker.
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#a1a1aa", background: "rgba(161,161,170,0.08)", border: "1px solid rgba(161,161,170,0.2)", borderRadius: 20, padding: "3px 10px" }}>
                    {PIPELINE_STATUS_LABEL[app.status] ?? app.status}
                  </span>
                ) : (
                  <Stepper app={app} hasPendingDoc={pendingDocAppIds.has(app.id)} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
