"use client";
// src/app/(app)/employer/document-requests/page.tsx
// Phase 4, Step 3 — employer-facing EmployerDocumentRequest create/list/
// approve. Built as its own standalone route rather than as an addition to
// /employer/workers/[workerId] or /employer/applications: both are
// exhaustiveness-surface files from Phase 1, and the Phase 4 prompt's
// cross-cutting section only exempts them for Step 4's specific button
// removal, not for new additions — same reasoning as Step 1's
// /worker/document-requests page, which took the same approach for the
// symmetric worker-side file.
// No admin-theme.ts equivalent exists for the employer role yet
// (employer-theme.ts exists in the repo but has zero adopters among real
// employer pages) — matches the inline dark-palette convention every other
// employer page actually uses instead.

import { useCallback, useEffect, useState } from "react";
import { employerApi } from "@/lib/api-client";
import { LoadingPage, ErrorState, EmptyState, ToastDisplay, type ToastData } from "@/components/ui";

interface AppOption { id: string; job: { title: string }; worker: { workerProfile: { firstName: string | null; lastName: string | null } | null } }
interface DocRequest {
  id: string;
  applicationId: string;
  label: string;
  description: string | null;
  isRequired: boolean;
  status: "REQUESTED" | "SUBMITTED" | "APPROVED";
  fileUrl: string | null;
  createdAt: string;
}

function appLabel(app: AppOption) {
  const name = [app.worker.workerProfile?.firstName, app.worker.workerProfile?.lastName].filter(Boolean).join(" ") || "Candidate";
  return `${name} — ${app.job.title}`;
}

function StatusPill({ status }: { status: DocRequest["status"] }) {
  const cfg = {
    REQUESTED: { label: "Awaiting upload", color: "#fbbf24", bg: "rgba(251,191,36,0.1)" },
    SUBMITTED: { label: "Ready to review", color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
    APPROVED:  { label: "✓ Approved",      color: "#4ade80", bg: "rgba(74,222,128,0.1)" },
  }[status];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  );
}

export default function EmployerDocumentRequestsPage() {
  const [requests, setRequests] = useState<DocRequest[]>([]);
  const [apps, setApps] = useState<AppOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const showToast = useCallback((msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [reqRes, appRes] = await Promise.all([
      employerApi.getEmployerDocumentRequests(),
      employerApi.getApplications({ limit: "100" }),
    ]);
    if (!reqRes.success) { setError(reqRes.error ?? "Could not load document requests."); setLoading(false); return; }
    setRequests((reqRes.data as unknown as DocRequest[]) ?? []);
    if (appRes.success) setApps((appRes.data as unknown as AppOption[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!selectedAppId || !label.trim()) return;
    setSubmitting(true);
    const res = await employerApi.createEmployerDocumentRequest({
      applicationId: selectedAppId, label: label.trim(), description: description.trim() || undefined,
    });
    setSubmitting(false);
    if (res.success) {
      showToast("Document requested", "ok");
      setShowForm(false);
      setSelectedAppId(""); setLabel(""); setDescription("");
      load();
    } else {
      showToast(res.error ?? "Could not create request", "err");
    }
  }

  async function handleApprove(id: string) {
    setApprovingId(id);
    const res = await employerApi.approveEmployerDocumentRequest(id);
    setApprovingId(null);
    if (res.success) {
      showToast("Document approved", "ok");
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: "APPROVED" } : r));
    } else {
      showToast(res.error ?? "Could not approve", "err");
    }
  }

  if (loading) return <LoadingPage color="blue" />;

  const appById = new Map(apps.map(a => [a.id, a]));

  return (
    <div className="min-h-screen px-4 sm:px-6 pt-6 pb-8 md:px-8" style={{ maxWidth: 900, margin: "0 auto" }}>
      <ToastDisplay toast={toast} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>Document Requests</div>
          <div style={{ fontSize: 13, color: "#71717a", marginTop: 4 }}>
            Request custom documents from candidates and track their status.
          </div>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            padding: "9px 18px", borderRadius: 10,
            background: showForm ? "rgba(255,255,255,0.06)" : "rgba(0,144,255,0.12)",
            border: showForm ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,144,255,0.3)",
            color: showForm ? "#a1a1aa" : "#2dd4bf", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {showForm ? "Cancel" : "+ New request"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
              Application
            </label>
            <select
              value={selectedAppId}
              onChange={e => setSelectedAppId(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e4e4e7", fontSize: 13, fontFamily: "inherit" }}
            >
              <option value="">Select a candidate/application…</option>
              {apps.map(a => <option key={a.id} value={a.id}>{appLabel(a)}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
              Document name
            </label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Portfolio, Reference letter…"
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e4e4e7", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e4e4e7", fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={!selectedAppId || !label.trim() || submitting}
            style={{
              padding: "9px 20px", borderRadius: 8, border: "none",
              background: "#0090FF", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              cursor: !selectedAppId || !label.trim() || submitting ? "default" : "pointer",
              opacity: !selectedAppId || !label.trim() ? 0.5 : 1,
            }}
          >
            {submitting ? "Requesting…" : "Send request"}
          </button>
        </div>
      )}

      {error ? (
        <ErrorState message={error} retry={load} title="Could not load document requests" />
      ) : requests.length === 0 ? (
        <EmptyState icon="📄" title="No document requests yet" description="Request a custom document from a candidate to see it here." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {requests.map(r => {
            const app = appById.get(r.applicationId);
            return (
              <div key={r.id} style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{r.label}</div>
                    {app && <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>{appLabel(app)}</div>}
                    {r.description && <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 6 }}>{r.description}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <StatusPill status={r.status} />
                    {r.status === "SUBMITTED" && r.fileUrl && (
                      <a href={r.fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#60a5fa", textDecoration: "none", fontWeight: 600 }}>View ↗</a>
                    )}
                    {r.status === "SUBMITTED" && (
                      <button
                        onClick={() => handleApprove(r.id)}
                        disabled={approvingId === r.id}
                        style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.1)", color: "#4ade80", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        {approvingId === r.id ? "…" : "Approve"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
