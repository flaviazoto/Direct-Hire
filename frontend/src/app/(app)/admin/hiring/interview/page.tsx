"use client";
// src/app/(app)/admin/hiring/interview/page.tsx
// Part B redesign — admin-mediated SCREENING interview. Replaces the old
// "schedule a call between worker and employer" section entirely. New model:
// the employer requests a screening interview (employer-interview.controller.ts),
// admin conducts the actual call off-platform, records free-text notes + a
// lightweight recommendation here, ticks "relayed to employer" once the
// outcome has been sent manually (email/WhatsApp — never through the
// platform), then either confirms the hire (unchanged flow) or marks the
// candidate as not selected.
//
// Queue = GET /admin/hiring/interview-hire-queue (workflowStatus stays
// CLEARED_FOR_EMPLOYER through interview-request, screening, and hired/
// not-selected, so the queue spans all of it, distinguished by
// Application.status + the joined `interview` record).

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/api-client";
import { C, pill, card, rowBg, inputStyle } from "@/lib/admin-theme";
import { ErrorState, EmptyState } from "@/components/ui";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface WorkerSummary {
  id: string;
  email: string;
  workerProfile: { firstName: string | null; lastName: string | null } | null;
}
interface JobSummary { id: string; title: string; companyName: string; country: string }
interface EmployerSummary { id: string; email: string; employerProfile: { companyName: string | null } | null }
interface AdminReview { decidedAt: string | null }
interface AppDocument { id: string; documentType: string; status: string; reviewedAt: string | null }
interface FeeCharge { amountUsd: string; status: string; paidAt: string | null }
type Recommendation = "RECOMMEND" | "DOES_NOT_MEET_REQUIREMENTS" | "NEEDS_FOLLOW_UP";
interface InterviewInfo {
  id: string;
  requestNotes: string | null;
  requestedAt: string;
  conductedAt: string | null;
  adminNotes: string | null;
  recommendation: Recommendation | null;
  relayedToEmployerAt: string | null;
}

interface AppRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "APPLIED" | "VIEWED" | "SHORTLISTED" | "INTERVIEWED" | "SCREENING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
  workflowStatus: string | null;
  hireConfirmedAt: string | null;
  acceptedAt: string | null;
  offeredSalary: string | null;
  offeredCurrency: string | null;
  startDate: string | null;
  contractType: string | null;
  worker: WorkerSummary;
  job: JobSummary;
  employer: EmployerSummary;
  adminReview: AdminReview | null;
  documents: AppDocument[];
  adminFeeCharge: FeeCharge | null;
  interview: InterviewInfo | null;
}
interface PagedResponse<T> { success: boolean; data: T[]; total: number; error?: string }

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function workerName(w: WorkerSummary) {
  const n = [w.workerProfile?.firstName, w.workerProfile?.lastName].filter(Boolean).join(" ");
  return n || w.email;
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function stagePill(row: AppRow) {
  if (row.status === "ACCEPTED") return <span style={pill(C.success, "rgba(22,163,74,0.12)", "rgba(22,163,74,0.3)")}>Hired</span>;
  if (row.status === "REJECTED") return <span style={pill(C.danger, "rgba(220,38,38,0.12)", "rgba(220,38,38,0.3)")}>Not selected</span>;
  if (row.workflowStatus === "HIRE_PENDING_WORKER_CONFIRMATION") return <span style={pill(C.warning, "rgba(234,88,12,0.12)", "rgba(234,88,12,0.3)")}>Awaiting worker confirmation</span>;
  if (row.status === "SCREENING") return <span style={pill(C.info, "rgba(37,99,235,0.12)", "rgba(37,99,235,0.3)")}>Interview in progress</span>;
  return <span style={pill(C.accent, "rgba(224,176,32,0.12)", "rgba(224,176,32,0.3)")}>Documents approved — awaiting request</span>;
}

const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  RECOMMEND: "Recommend",
  DOES_NOT_MEET_REQUIREMENTS: "Does not meet requirements",
  NEEDS_FOLLOW_UP: "Needs follow-up",
};

const CONTRACT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "INTERNSHIP", "FREELANCE"];

type TimelineEntry = { label: string; date: string };

function buildTimeline(row: AppRow): TimelineEntry[] {
  const entries: TimelineEntry[] = [{ label: "Application created", date: row.createdAt }];
  if (row.adminReview?.decidedAt) entries.push({ label: "Approved by admin review", date: row.adminReview.decidedAt });
  for (const doc of row.documents) {
    if (doc.status === "APPROVED" && doc.reviewedAt) entries.push({ label: `Document approved: ${doc.documentType}`, date: doc.reviewedAt });
  }
  if (row.adminFeeCharge?.paidAt) entries.push({ label: "Fee paid — cleared for employer", date: row.adminFeeCharge.paidAt });
  if (row.interview?.requestedAt) entries.push({ label: "Employer requested screening interview", date: row.interview.requestedAt });
  if (row.interview?.conductedAt) entries.push({ label: "Screening call notes recorded", date: row.interview.conductedAt });
  if (row.interview?.relayedToEmployerAt) entries.push({ label: "Outcome relayed to employer", date: row.interview.relayedToEmployerAt });
  if (row.hireConfirmedAt) entries.push({ label: "Hire confirmed", date: row.hireConfirmedAt });
  return entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// ── 4. Message history (Phase 5, Step 4) ──────────────────────────────────────
// Chosen entry point: this panel, not admin user-management — an admin
// reviewing a placement here already has both the worker and employer in
// context, which is exactly what Step 2's endpoint needs (a pair, not a
// platform-wide browse with no starting point). Lazy-loaded on demand rather
// than fetched for every row while just browsing the queue.

interface AdminMessage {
  id: string; body: string; createdAt: string;
  senderId: string; senderName: string; senderRole: string;
  recipientId: string; recipientName: string;
}

function MessageHistorySection({ workerId, employerId }: { workerId: string; employerId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdminMessage[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await adminApi.getMessagesForUser(workerId, employerId);
    setLoading(false);
    setLoaded(true);
    if (!res.success) { setError(res.error ?? "Could not load messages"); return; }
    setMessages((res.data as unknown as AdminMessage[]) ?? []);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>5. Message history</div>
        {!loaded && (
          <button
            onClick={load}
            disabled={loading}
            style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.accent, fontSize: 11, fontWeight: 700, cursor: loading ? "default" : "pointer" }}
          >
            {loading ? "Loading…" : "View message history"}
          </button>
        )}
      </div>

      {loaded && (
        error ? (
          <div style={{ fontSize: 12, color: C.danger }}>{error}</div>
        ) : messages.length === 0 ? (
          <div style={{ fontSize: 12, color: C.muted }}>No messages between this worker and employer.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
            {messages.map(m => (
              <div key={m.id} style={{ padding: "10px 12px", background: rowBg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.secondary }}>{m.senderName}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>{new Date(m.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.body}</div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function AdminInterviewHirePage() {
  const [rows, setRows] = useState<AppRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Section 1 — call notes & recommendation
  const [adminNotes, setAdminNotes] = useState("");
  const [recommendation, setRecommendation] = useState<Recommendation | "">("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Section 2 — relay to employer
  const [relaying, setRelaying] = useState(false);

  // Section 3 — outcome: confirm hire or mark not selected
  const [offeredSalary, setOfferedSalary] = useState("");
  const [offeredCurrency, setOfferedCurrency] = useState("USD");
  const [startDate, setStartDate] = useState("");
  const [contractType, setContractType] = useState("FULL_TIME");
  const [confirming, setConfirming] = useState(false);
  const [markingNotSelected, setMarkingNotSelected] = useState(false);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await adminApi.getInterviewHireQueue({ limit: "50" });
    const r = res as unknown as PagedResponse<AppRow>;
    if (!r.success) {
      setError(r.error ?? "Could not load queue.");
      setLoading(false);
      return;
    }
    setRows(r.data ?? []);
    setTotal(r.total ?? 0);
    setSelectedId(prev => (r.data?.some(x => x.id === prev) ? prev : r.data?.[0]?.id ?? null));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = rows.find(r => r.id === selectedId) ?? null;

  useEffect(() => {
    setAdminNotes(selected?.interview?.adminNotes ?? "");
    setRecommendation(selected?.interview?.recommendation ?? "");
    setOfferedSalary("");
    setStartDate("");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveNotes() {
    if (!selected) return;
    if (!adminNotes.trim() && !recommendation) {
      showToast("Add notes or a recommendation before saving", false);
      return;
    }
    setSavingNotes(true);
    const res = await adminApi.recordInterviewNotes(selected.id, {
      adminNotes: adminNotes.trim() || undefined,
      recommendation: recommendation || undefined,
    });
    setSavingNotes(false);
    if (res.success) {
      showToast("Notes saved");
      load();
    } else {
      showToast(res.error ?? "Could not save notes", false);
    }
  }

  async function handleMarkRelayed() {
    if (!selected) return;
    setRelaying(true);
    const res = await adminApi.markInterviewRelayed(selected.id);
    setRelaying(false);
    if (res.success) {
      showToast("Marked as relayed to employer");
      load();
    } else {
      showToast(res.error ?? "Could not mark as relayed", false);
    }
  }

  async function handleConfirmHire() {
    if (!selected) return;
    setConfirming(true);
    const res = await adminApi.confirmHire(selected.id, {
      offeredSalary: offeredSalary.trim() || undefined,
      offeredCurrency,
      startDate: startDate || undefined,
      contractType,
    });
    setConfirming(false);
    if (res.success) {
      showToast("Hire requested — waiting on the worker to confirm");
      load();
    } else {
      showToast(res.error ?? "Could not request hire", false);
    }
  }

  async function handleMarkNotSelected() {
    if (!selected) return;
    setMarkingNotSelected(true);
    const res = await adminApi.markApplicationNotSelected(selected.id);
    setMarkingNotSelected(false);
    if (res.success) {
      showToast("Marked as not selected — worker notified");
      load();
    } else {
      showToast(res.error ?? "Could not mark as not selected", false);
    }
  }

  const interview = selected?.interview ?? null;
  const isClosed = selected?.status === "ACCEPTED" || selected?.status === "REJECTED";
  const isHirePending = selected?.workflowStatus === "HIRE_PENDING_WORKER_CONFIRMATION";
  const canRecordNotes = !!interview && !isClosed && !isHirePending;
  const canRelay = !!interview?.conductedAt && !interview.relayedToEmployerAt && !isClosed && !isHirePending;
  const canDecideOutcome = !!interview?.relayedToEmployerAt && !isClosed && !isHirePending;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1280, margin: "0 auto", fontFamily: "var(--font-body)" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, color: C.text, margin: 0 }}>
          Screening Interview &amp; Hire
        </h1>
        <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0" }}>
          Applications with documents approved. Admin conducts the screening call on the employer&apos;s behalf,
          records notes, relays the outcome off-platform, then requests the hire (worker must confirm before it&apos;s
          final) or marks the candidate not selected.
        </p>
      </div>

      {/* Model note */}
      <div style={{
        ...card(), padding: "12px 16px", marginBottom: 20,
        display: "flex", gap: 10, alignItems: "flex-start",
        borderColor: "rgba(224,176,32,0.25)",
      }}>
        <span style={{ fontSize: 16 }}>ℹ️</span>
        <div style={{ fontSize: 12, color: C.secondary, lineHeight: 1.5 }}>
          The employer never talks to the worker directly. The employer requests an interview, admin conducts the
          call and records notes here, then relays the outcome to the employer manually (email/WhatsApp — the
          platform never sends this). The employer&apos;s decision comes back to admin the same way, off-platform.
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "64px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>Loading…</div>
      ) : error ? (
        <ErrorState message={error} retry={load} title="Could not load queue" />
      ) : rows.length === 0 ? (
        <EmptyState icon="🤝" title="Nothing here yet" description="Applications appear here once their documents are approved." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20, alignItems: "start" }}>

          {/* ── Queue (left) ─────────────────────────────────────────────── */}
          <div>
            {!loading && <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>{total} in queue</div>}
            {rows.map(row => (
              <div
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                style={{
                  padding: "14px 16px", borderRadius: 10, cursor: "pointer", marginBottom: 8,
                  background: row.id === selectedId ? "rgba(224,176,32,0.1)" : rowBg,
                  border: `1px solid ${row.id === selectedId ? "rgba(224,176,32,0.4)" : C.border}`,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{workerName(row.worker)}</div>
                <div style={{ fontSize: 12, color: C.secondary, margin: "2px 0" }}>{row.job.title} · {row.job.companyName}</div>
                <div style={{ marginTop: 6 }}>{stagePill(row)}</div>
              </div>
            ))}
          </div>

          {/* ── Detail panel (right) ─────────────────────────────────────── */}
          <div style={{ ...card(), padding: 24 }}>
            {!selected ? (
              <div style={{ color: C.muted, fontSize: 13 }}>Select an application from the queue.</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{workerName(selected.worker)}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{selected.worker.email}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.secondary }}>{selected.job.title}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {selected.employer.employerProfile?.companyName ?? selected.employer.email} · {selected.job.country}
                    </div>
                    <div style={{ marginTop: 6 }}>{stagePill(selected)}</div>
                  </div>
                </div>

                {/* ── 1. Call notes & recommendation ─────────────────────── */}
                <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                    1. Screening call notes
                  </div>

                  {!interview ? (
                    <div style={{ fontSize: 12, color: C.muted, padding: "10px 12px", background: rowBg, borderRadius: 8 }}>
                      No interview requested yet — waiting on the employer to request a screening interview for this candidate.
                    </div>
                  ) : (
                    <>
                      {interview.requestNotes && (
                        <div style={{ fontSize: 12, color: C.secondary, marginBottom: 12, padding: "10px 12px", background: rowBg, borderRadius: 8 }}>
                          <span style={{ fontWeight: 700, color: C.text }}>Employer asked to confirm: </span>{interview.requestNotes}
                        </div>
                      )}
                      <textarea
                        value={adminNotes}
                        onChange={e => setAdminNotes(e.target.value)}
                        placeholder="Free-text notes from the call (admin-internal — never shown to the worker or employer directly)…"
                        disabled={!canRecordNotes}
                        style={{ ...inputStyle, minHeight: 90, resize: "vertical", marginBottom: 10 }}
                      />
                      <select
                        value={recommendation}
                        onChange={e => setRecommendation(e.target.value as Recommendation | "")}
                        disabled={!canRecordNotes}
                        style={{ ...inputStyle, marginBottom: 10 }}
                      >
                        <option value="">No recommendation set</option>
                        <option value="RECOMMEND">Recommend</option>
                        <option value="DOES_NOT_MEET_REQUIREMENTS">Does not meet requirements</option>
                        <option value="NEEDS_FOLLOW_UP">Needs follow-up</option>
                      </select>
                      <button
                        onClick={handleSaveNotes}
                        disabled={savingNotes || !canRecordNotes}
                        style={{
                          padding: "9px 18px", borderRadius: 8, border: "none",
                          background: C.accent, color: "#fff", fontSize: 13, fontWeight: 700,
                          cursor: savingNotes || !canRecordNotes ? "default" : "pointer",
                          opacity: !canRecordNotes ? 0.5 : 1,
                        }}
                      >
                        {savingNotes ? "Saving…" : interview.conductedAt ? "Update notes" : "Save notes"}
                      </button>
                      {interview.conductedAt && (
                        <span style={{ marginLeft: 10, fontSize: 11, color: C.muted }}>Call recorded {fmtDateTime(interview.conductedAt)}.</span>
                      )}
                    </>
                  )}
                </div>

                {/* ── 2. Relay to employer ─────────────────────────────────── */}
                <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                    2. Relay outcome to employer
                  </div>
                  {interview?.relayedToEmployerAt ? (
                    <div style={{ padding: "10px 12px", background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.25)", borderRadius: 8, fontSize: 12, color: C.text }}>
                      Relayed to employer {fmtDateTime(interview.relayedToEmployerAt)} (manually, off-platform).
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
                        Once you&apos;ve sent the outcome to the employer by email or WhatsApp, tick this to unlock the hire/not-selected decision below.
                      </div>
                      <button
                        onClick={handleMarkRelayed}
                        disabled={relaying || !canRelay}
                        style={{
                          padding: "9px 18px", borderRadius: 8, border: `1px solid ${C.border}`,
                          background: "transparent", color: C.text, fontSize: 13, fontWeight: 700,
                          cursor: relaying || !canRelay ? "default" : "pointer",
                          opacity: !canRelay ? 0.5 : 1,
                        }}
                      >
                        {relaying ? "Saving…" : "✓ Mark as relayed to employer"}
                      </button>
                      {!interview?.conductedAt && (
                        <span style={{ marginLeft: 10, fontSize: 11, color: C.muted }}>Record call notes first.</span>
                      )}
                    </>
                  )}
                </div>

                {/* ── 3. Outcome: confirm hire or not selected ─────────────── */}
                <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                    3. Outcome
                  </div>

                  {selected.status === "ACCEPTED" ? (
                    <div style={{ padding: "12px 14px", background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.25)", borderRadius: 10, fontSize: 13, color: C.text }}>
                      Hire confirmed by the worker {selected.hireConfirmedAt && fmtDate(selected.hireConfirmedAt)}.
                      {selected.offeredSalary && <> Offer: {selected.offeredSalary} {selected.offeredCurrency}.</>}
                      {selected.startDate && <> Start date: {fmtDate(selected.startDate)}.</>}
                      {" "}The admin fee is next — see the{" "}
                      <a href="/admin/hiring/review" style={{ color: C.accent, textDecoration: "none", fontWeight: 700 }}>Awaiting Fee tab</a>.
                    </div>
                  ) : selected.status === "REJECTED" ? (
                    <div style={{ padding: "12px 14px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 10, fontSize: 13, color: C.text }}>
                      Marked as not selected. The worker has been notified automatically. This application is closed.
                    </div>
                  ) : isHirePending ? (
                    <div style={{ padding: "12px 14px", background: "rgba(234,88,12,0.08)", border: "1px solid rgba(234,88,12,0.25)", borderRadius: 10, fontSize: 13, color: C.text }}>
                      Hire requested — waiting on the worker to confirm in-app.
                      {selected.offeredSalary && <> Offer: {selected.offeredSalary} {selected.offeredCurrency}.</>}
                      {selected.startDate && <> Start date: {fmtDate(selected.startDate)}.</>}
                      {" "}Nothing further to do here until they do.
                    </div>
                  ) : (
                    <>
                      {!canDecideOutcome && (
                        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
                          Available once the outcome has been relayed to the employer.
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 10, marginBottom: 10 }}>
                        <input
                          value={offeredSalary}
                          onChange={e => setOfferedSalary(e.target.value)}
                          placeholder="Offered salary"
                          disabled={!canDecideOutcome}
                          style={inputStyle}
                        />
                        <select
                          value={offeredCurrency}
                          onChange={e => setOfferedCurrency(e.target.value)}
                          disabled={!canDecideOutcome}
                          style={inputStyle}
                        >
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="GBP">GBP</option>
                        </select>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                        <input
                          type="date"
                          value={startDate}
                          onChange={e => setStartDate(e.target.value)}
                          disabled={!canDecideOutcome}
                          style={inputStyle}
                        />
                        <select
                          value={contractType}
                          onChange={e => setContractType(e.target.value)}
                          disabled={!canDecideOutcome}
                          style={inputStyle}
                        >
                          {CONTRACT_TYPES.map(ct => <option key={ct} value={ct}>{ct.replace("_", " ")}</option>)}
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          onClick={handleConfirmHire}
                          disabled={confirming || !canDecideOutcome}
                          style={{
                            padding: "9px 18px", borderRadius: 8, border: "none",
                            background: C.success, color: "#fff", fontSize: 13, fontWeight: 700,
                            cursor: confirming || !canDecideOutcome ? "default" : "pointer",
                            opacity: !canDecideOutcome ? 0.5 : 1,
                          }}
                        >
                          {confirming ? "Requesting…" : "Request hire"}
                        </button>
                        <button
                          onClick={handleMarkNotSelected}
                          disabled={markingNotSelected || !canDecideOutcome}
                          style={{
                            padding: "9px 18px", borderRadius: 8, border: `1px solid rgba(220,38,38,0.3)`,
                            background: "rgba(220,38,38,0.1)", color: C.danger, fontSize: 13, fontWeight: 700,
                            cursor: markingNotSelected || !canDecideOutcome ? "default" : "pointer",
                            opacity: !canDecideOutcome ? 0.5 : 1,
                          }}
                        >
                          {markingNotSelected ? "Saving…" : "✕ Not selected"}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* ── 4. Activity timeline ────────────────────────────────── */}
                <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                    4. Activity timeline
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {buildTimeline(selected).map((e, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, flexShrink: 0 }} />
                        <div style={{ fontSize: 12, color: C.secondary }}>{e.label}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginLeft: "auto" }}>{fmtDateTime(e.date)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── 5. Message history (Phase 5, Step 4) ───────────────────── */}
                <MessageHistorySection key={selected.id} workerId={selected.worker.id} employerId={selected.employer.id} />
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 9999,
          padding: "13px 20px", borderRadius: 10,
          background: toast.ok ? "rgba(22,163,74,0.15)" : "rgba(220,38,38,0.15)",
          border: `1px solid ${toast.ok ? "rgba(22,163,74,0.4)" : "rgba(220,38,38,0.4)"}`,
          color: toast.ok ? C.success : C.danger,
          fontSize: 14, fontWeight: 600,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>
          {toast.ok ? "✓ " : "✕ "}{toast.msg}
        </div>
      )}
    </div>
  );
}
