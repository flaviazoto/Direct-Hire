"use client";
// src/app/(app)/admin/hiring/interview/page.tsx
// Phase 3 — Screen 2: interview scheduling + hire confirmation panel.
// Queue = GET /admin/hiring/interview-hire-queue (Phase 3 addition — Phase 2
// never listed this stage; workflowStatus stays CLEARED_FOR_EMPLOYER through
// interview-scheduled and hired, so the queue spans all of it, distinguished
// by Application.status rather than workflowStatus).

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

interface AppRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "APPLIED" | "VIEWED" | "SHORTLISTED" | "INTERVIEWED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
  interviewedAt: string | null;
  interviewInstructions: string | null;
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
function stagePill(status: AppRow["status"]) {
  if (status === "ACCEPTED") return <span style={pill(C.success, "rgba(22,163,74,0.12)", "rgba(22,163,74,0.3)")}>Hired</span>;
  if (status === "INTERVIEWED") return <span style={pill(C.info, "rgba(37,99,235,0.12)", "rgba(37,99,235,0.3)")}>Interview scheduled</span>;
  return <span style={pill(C.accent, "rgba(224,176,32,0.12)", "rgba(224,176,32,0.3)")}>Cleared</span>;
}

const CONTRACT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "INTERNSHIP", "FREELANCE"];

type TimelineEntry = { label: string; date: string };

function buildTimeline(row: AppRow): TimelineEntry[] {
  const entries: TimelineEntry[] = [{ label: "Application created", date: row.createdAt }];
  if (row.adminReview?.decidedAt) entries.push({ label: "Approved by admin review", date: row.adminReview.decidedAt });
  for (const doc of row.documents) {
    if (doc.status === "APPROVED" && doc.reviewedAt) entries.push({ label: `Document approved: ${doc.documentType}`, date: doc.reviewedAt });
  }
  if (row.adminFeeCharge?.paidAt) entries.push({ label: "Fee paid — cleared for employer", date: row.adminFeeCharge.paidAt });
  if (row.interviewedAt) entries.push({ label: "Interview scheduled", date: row.interviewedAt });
  if (row.hireConfirmedAt) entries.push({ label: "Hire confirmed", date: row.hireConfirmedAt });
  return entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function AdminInterviewHirePage() {
  const [rows, setRows] = useState<AppRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Section 1 — schedule interview
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewType, setInterviewType] = useState<"video" | "phone" | "in-person">("video");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [scheduling, setScheduling] = useState(false);

  // Section 2 — confirm hire
  const [offeredSalary, setOfferedSalary] = useState("");
  const [offeredCurrency, setOfferedCurrency] = useState("USD");
  const [startDate, setStartDate] = useState("");
  const [contractType, setContractType] = useState("FULL_TIME");
  const [confirming, setConfirming] = useState(false);

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
    setInterviewNotes("");
    setOfferedSalary("");
    setStartDate("");
  }, [selectedId]);

  async function handleSchedule() {
    if (!selected || !interviewDate) return;
    setScheduling(true);
    const res = await adminApi.scheduleInterview(selected.id, {
      date: new Date(interviewDate).toISOString(),
      type: interviewType,
      notes: interviewNotes.trim() || undefined,
    });
    setScheduling(false);
    if (res.success) {
      showToast("Interview scheduled — both parties notified");
      load();
    } else {
      showToast(res.error ?? "Could not schedule interview", false);
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
      showToast("Hire confirmed — application closed");
      load();
    } else {
      showToast(res.error ?? "Could not confirm hire", false);
    }
  }

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1280, margin: "0 auto", fontFamily: "var(--font-body)" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, color: C.text, margin: 0 }}>
          Interview &amp; Hire
        </h1>
        <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0" }}>
          Applications cleared for the employer — schedule interviews and confirm hires.
        </p>
      </div>

      {/* Employer-side removal note */}
      <div style={{
        ...card(), padding: "12px 16px", marginBottom: 20,
        display: "flex", gap: 10, alignItems: "flex-start",
        borderColor: "rgba(224,176,32,0.25)",
      }}>
        <span style={{ fontSize: 16 }}>ℹ️</span>
        <div style={{ fontSize: 12, color: C.secondary, lineHeight: 1.5 }}>
          Interview scheduling and hire confirmation are admin-only actions. The employer-facing application page
          no longer offers these transitions — that removal was confirmed complete and clean (no other code path
          could still set an application to INTERVIEWED or ACCEPTED).
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "64px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>Loading…</div>
      ) : error ? (
        <ErrorState message={error} retry={load} title="Could not load queue" />
      ) : rows.length === 0 ? (
        <EmptyState icon="🤝" title="Nothing cleared yet" description="Applications appear here once they're cleared for the employer." />
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
                <div style={{ marginTop: 6 }}>{stagePill(row.status)}</div>
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
                    <div style={{ marginTop: 6 }}>{stagePill(selected.status)}</div>
                  </div>
                </div>

                {/* ── 1. Schedule interview ──────────────────────────────── */}
                <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                    1. Schedule interview
                  </div>

                  {selected.interviewedAt && (
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, padding: "8px 12px", background: rowBg, borderRadius: 8 }}>
                      Currently scheduled for {fmtDateTime(selected.interviewedAt)}. Submitting below reschedules it.
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 10, marginBottom: 10 }}>
                    <input
                      type="datetime-local"
                      value={interviewDate}
                      onChange={e => setInterviewDate(e.target.value)}
                      style={inputStyle}
                    />
                    <select
                      value={interviewType}
                      onChange={e => setInterviewType(e.target.value as typeof interviewType)}
                      style={inputStyle}
                    >
                      <option value="video">Video call</option>
                      <option value="phone">Phone call</option>
                      <option value="in-person">In-person</option>
                    </select>
                  </div>
                  <textarea
                    value={interviewNotes}
                    onChange={e => setInterviewNotes(e.target.value)}
                    placeholder="Notes shared with both the worker and the employer…"
                    style={{ ...inputStyle, minHeight: 70, resize: "vertical", marginBottom: 10 }}
                  />
                  <button
                    onClick={handleSchedule}
                    disabled={scheduling || !interviewDate || selected.status === "ACCEPTED"}
                    style={{
                      padding: "9px 18px", borderRadius: 8, border: "none",
                      background: C.accent, color: "#fff", fontSize: 13, fontWeight: 700,
                      cursor: scheduling || !interviewDate || selected.status === "ACCEPTED" ? "default" : "pointer",
                      opacity: !interviewDate || selected.status === "ACCEPTED" ? 0.5 : 1,
                    }}
                  >
                    {scheduling ? "Scheduling…" : selected.interviewedAt ? "Reschedule interview" : "Schedule interview"}
                  </button>
                  {selected.status === "ACCEPTED" && (
                    <span style={{ marginLeft: 10, fontSize: 11, color: C.muted }}>Already hired — interview stage is closed.</span>
                  )}
                </div>

                {/* ── 2. Confirm hire ─────────────────────────────────────── */}
                <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                    2. Confirm hire
                  </div>

                  {selected.status === "ACCEPTED" ? (
                    <div style={{ padding: "12px 14px", background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.25)", borderRadius: 10, fontSize: 13, color: C.text }}>
                      Hire confirmed {selected.hireConfirmedAt && fmtDate(selected.hireConfirmedAt)}.
                      {selected.offeredSalary && <> Offer: {selected.offeredSalary} {selected.offeredCurrency}.</>}
                      {selected.startDate && <> Start date: {fmtDate(selected.startDate)}.</>}
                      {" "}This application is closed — no further action is needed from you or the employer.
                    </div>
                  ) : (
                    <>
                      {selected.status !== "INTERVIEWED" && (
                        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
                          Available once an interview has been scheduled.
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 10, marginBottom: 10 }}>
                        <input
                          value={offeredSalary}
                          onChange={e => setOfferedSalary(e.target.value)}
                          placeholder="Offered salary"
                          disabled={selected.status !== "INTERVIEWED"}
                          style={inputStyle}
                        />
                        <select
                          value={offeredCurrency}
                          onChange={e => setOfferedCurrency(e.target.value)}
                          disabled={selected.status !== "INTERVIEWED"}
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
                          disabled={selected.status !== "INTERVIEWED"}
                          style={inputStyle}
                        />
                        <select
                          value={contractType}
                          onChange={e => setContractType(e.target.value)}
                          disabled={selected.status !== "INTERVIEWED"}
                          style={inputStyle}
                        >
                          {CONTRACT_TYPES.map(ct => <option key={ct} value={ct}>{ct.replace("_", " ")}</option>)}
                        </select>
                      </div>
                      <button
                        onClick={handleConfirmHire}
                        disabled={confirming || selected.status !== "INTERVIEWED"}
                        style={{
                          padding: "9px 18px", borderRadius: 8, border: "none",
                          background: C.success, color: "#fff", fontSize: 13, fontWeight: 700,
                          cursor: confirming || selected.status !== "INTERVIEWED" ? "default" : "pointer",
                          opacity: selected.status !== "INTERVIEWED" ? 0.5 : 1,
                        }}
                      >
                        {confirming ? "Confirming…" : "✓ Confirm hire"}
                      </button>
                    </>
                  )}
                </div>

                {/* ── 3. Activity timeline ────────────────────────────────── */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                    3. Activity timeline
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
