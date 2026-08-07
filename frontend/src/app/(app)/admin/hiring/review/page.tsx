"use client";
// src/app/(app)/admin/hiring/review/page.tsx
// Phase 3 — Screen 1: application review + document verification + fee queue.
// Three tabs, each backed by its own Phase 2 (or Phase 3-added) list endpoint:
//   Application review → GET /admin/hiring/review-queue   (workflowStatus=PENDING_ADMIN_REVIEW)
//   Document verification → GET /admin/hiring/document-queue (workflowStatus=APPROVED_QUEUED)
//   Awaiting fee → GET /admin/hiring/fee-queue (workflowStatus IN [ADMIN_FEE_DUE, ADMIN_FEE_PAID] — added this phase, no Phase 2 endpoint listed this stage)
// Layout (queue left / detail panel right) has no exact precedent among the
// other 18 admin pages — they use either an expand-in-place row or a
// navigate-to-[id] page — so this is a fresh layout, built entirely from
// admin-theme.ts tokens (C, pill, card, rowBg, inputStyle) rather than a
// copied structure.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api-client";
import { C, pill, card, rowBg, inputStyle } from "@/lib/admin-theme";
import { ErrorState, EmptyState } from "@/components/ui";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type Tab = "review" | "documents" | "fee";

interface WorkerSummary {
  id: string;
  email: string;
  workerProfile: { firstName: string | null; lastName: string | null; countryOfResidence?: string | null } | null;
}
interface JobSummary {
  id: string;
  title: string;
  companyName: string;
  country: string;
}
interface EmployerSummary {
  id: string;
  email: string;
  employerProfile: { companyName: string | null } | null;
}
interface AdminReview {
  id: string;
  decision: "PENDING" | "APPROVED";
  decisionNotes: string | null;
  noteToWorker: string | null;
  decidedAt: string | null;
}
interface AppDocument {
  id: string;
  applicationId: string;
  documentType: string;
  fileUrl: string | null;
  status: "REQUESTED" | "SUBMITTED" | "APPROVED";
  reviewNotes: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
}
interface FeeCharge {
  id: string;
  countryCode: string;
  visaType: string;
  amountUsd: string;
  currency: string;
  status: string;
  paidAt: string | null;
  failedAt: string | null;
}
interface FeeSchedule {
  id: string;
  countryCode: string;
  visaType: string;
  amountUsd: string;
  isActive: boolean;
}
interface AppRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  workflowStatus?: string | null;
  worker: WorkerSummary;
  job: JobSummary;
  employer: EmployerSummary;
  adminReview: AdminReview | null;
  documents?: AppDocument[];
  adminFeeCharge?: FeeCharge | null;
}
interface PagedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  totalPages: number;
  error?: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function workerName(w: WorkerSummary) {
  const n = [w.workerProfile?.firstName, w.workerProfile?.lastName].filter(Boolean).join(" ");
  return n || w.email;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function daysAgo(d: string) {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "review", label: "Application Review" },
  { id: "documents", label: "Document Verification" },
  { id: "fee", label: "Awaiting Fee" },
];

/* ─── Sub-components ────────────────────────────────────────────────────── */

function DocStatusPill({ status }: { status: string }) {
  const cfg: Record<string, [string, string, string]> = {
    REQUESTED: [C.warning, "rgba(234,88,12,0.12)", "rgba(234,88,12,0.3)"],
    SUBMITTED: [C.info, "rgba(37,99,235,0.12)", "rgba(37,99,235,0.3)"],
    APPROVED:  [C.success, "rgba(22,163,74,0.12)", "rgba(22,163,74,0.3)"],
  };
  const [color, bg, border] = cfg[status] ?? cfg.REQUESTED;
  return <span style={pill(color, bg, border)}>{status}</span>;
}

function FeeStatusPill({ status }: { status: string }) {
  const cfg: Record<string, [string, string, string]> = {
    PENDING:   [C.muted, "rgba(148,163,184,0.1)", "rgba(148,163,184,0.25)"],
    SUCCEEDED: [C.success, "rgba(22,163,74,0.12)", "rgba(22,163,74,0.3)"],
    FAILED:    [C.danger, "rgba(220,38,38,0.12)", "rgba(220,38,38,0.3)"],
    REFUNDED:  [C.info, "rgba(37,99,235,0.12)", "rgba(37,99,235,0.3)"],
  };
  const [color, bg, border] = cfg[status] ?? cfg.PENDING;
  return <span style={pill(color, bg, border)}>{status}</span>;
}

function QueueRow({
  row, selected, onClick, subtitle,
}: { row: AppRow; selected: boolean; onClick: () => void; subtitle: React.ReactNode }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "14px 16px",
        borderRadius: 10,
        cursor: "pointer",
        background: selected ? "rgba(224,176,32,0.1)" : rowBg,
        border: `1px solid ${selected ? "rgba(224,176,32,0.4)" : C.border}`,
        marginBottom: 8,
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{workerName(row.worker)}</div>
      <div style={{ fontSize: 12, color: C.secondary, margin: "2px 0" }}>
        {row.job.title} · {row.job.companyName}
      </div>
      <div style={{ fontSize: 11, color: C.muted, display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span>{subtitle}</span>
        <span>{daysAgo(row.createdAt)}</span>
      </div>
    </div>
  );
}

const noteFieldStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 90,
  resize: "vertical",
  fontFamily: "inherit",
};

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function AdminHiringReviewPage() {
  const [tab, setTab] = useState<Tab>("review");
  const [rows, setRows] = useState<AppRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Review-tab detail state
  const [noteText, setNoteText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Document-tab detail state
  const [newDocType, setNewDocType] = useState("");
  const [requestingDoc, setRequestingDoc] = useState(false);
  const [approvingDocId, setApprovingDocId] = useState<string | null>(null);
  const [skippingDocs, setSkippingDocs] = useState(false);
  const [visaType, setVisaType] = useState("");
  const [chargingFee, setChargingFee] = useState(false);
  const [feeSchedules, setFeeSchedules] = useState<FeeSchedule[]>([]);
  const [feeSchedulesLoaded, setFeeSchedulesLoaded] = useState(false);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    setError(null);
    const fetcher =
      t === "review" ? adminApi.getHiringReviewQueue :
      t === "documents" ? adminApi.getDocumentQueue :
      adminApi.getFeeQueue;
    const res = await fetcher({ limit: "50" });
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

  useEffect(() => { load(tab); }, [tab, load]);

  // Fetched once on first visit to the Awaiting Fee tab — the full schedule
  // list is small (one row per country+visa combo) and shared across every
  // application on this tab, so it's filtered client-side per selected
  // row's country rather than re-fetched per application.
  useEffect(() => {
    if (tab !== "fee" || feeSchedulesLoaded) return;
    adminApi.getFeeSchedules().then(res => {
      if (res.success) setFeeSchedules((res.data as FeeSchedule[]) ?? []);
      setFeeSchedulesLoaded(true);
    });
  }, [tab, feeSchedulesLoaded]);

  function switchTab(t: Tab) {
    setTab(t);
    setSelectedId(null);
  }

  const selected = rows.find(r => r.id === selectedId) ?? null;

  useEffect(() => {
    setNoteText(selected?.adminReview?.noteToWorker ?? "");
    setVisaType(""); // a visa type picked for one application's country isn't valid for another
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApprove() {
    if (!selected) return;
    setSubmitting(true);
    const res = await adminApi.approveApplicationReview(selected.id, { noteToWorker: noteText.trim() || undefined });
    setSubmitting(false);
    if (res.success) {
      showToast("Application approved and queued for document collection");
      load("review");
    } else {
      showToast(res.error ?? "Approve failed", false);
    }
  }

  async function handleLeavePending() {
    if (!selected) return;
    setSubmitting(true);
    const res = await adminApi.updateApplicationReviewNotes(selected.id, { noteToWorker: noteText.trim() || undefined });
    setSubmitting(false);
    if (res.success) {
      showToast("Note saved — decision left pending");
      load("review");
    } else {
      showToast(res.error ?? "Could not save note", false);
    }
  }

  async function handleRequestDoc() {
    if (!selected || !newDocType.trim()) return;
    setRequestingDoc(true);
    const res = await adminApi.requestApplicationDocument(selected.id, newDocType.trim());
    setRequestingDoc(false);
    if (res.success) {
      showToast(`Requested: ${newDocType.trim()}`);
      setNewDocType("");
      load("documents");
    } else {
      showToast(res.error ?? "Could not request document", false);
    }
  }

  async function handleApproveDoc(docId: string) {
    setApprovingDocId(docId);
    const res = await adminApi.approveApplicationDocument(docId);
    setApprovingDocId(null);
    if (res.success) {
      const d = res.data as { allApproved?: boolean; workflowAdvanced?: boolean } | undefined;
      showToast(d?.workflowAdvanced ? "Document approved — all documents complete, fee stage unlocked" : "Document approved");
      load("documents");
    } else {
      showToast(res.error ?? "Could not approve document", false);
    }
  }

  async function handleSkipDocs() {
    if (!selected) return;
    setSkippingDocs(true);
    const res = await adminApi.skipDocumentVerification(selected.id);
    setSkippingDocs(false);
    if (res.success) {
      showToast("No documents needed — documents approved, ready for the employer");
      load("documents");
    } else {
      showToast(res.error ?? "Could not skip document verification", false);
    }
  }

  async function handleChargeFee() {
    if (!selected || !visaType.trim()) return;
    setChargingFee(true);
    const res = await adminApi.createFeeCharge(selected.id, visaType.trim());
    setChargingFee(false);
    if (res.success) {
      showToast("Fee charge started");
      setVisaType("");
      load("fee");
    } else {
      showToast(res.error ?? "Could not start the fee charge", false);
    }
  }

  // Only active schedules for this application's country — the dropdown's
  // source of truth. createFeeCharge's own lookup is unchanged; this is
  // purely showing the same data admin would otherwise have to guess at.
  const availableSchedules = selected
    ? feeSchedules.filter(s => s.isActive && s.countryCode === selected.job.country)
    : [];
  const selectedSchedule = availableSchedules.find(s => s.visaType === visaType) ?? null;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1280, margin: "0 auto", fontFamily: "var(--font-body)" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, color: C.text, margin: 0 }}>
          Application Review
        </h1>
        <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0" }}>
          Vet applications, verify documents, and track admin processing fees before they reach the employer.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            style={{
              padding: "10px 18px",
              border: "none",
              borderBottom: `2px solid ${tab === t.id ? C.accent : "transparent"}`,
              background: "transparent",
              color: tab === t.id ? C.accent : C.muted,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
        {!loading && <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: C.muted }}>{total} in queue</span>}
      </div>

      {/* No-reject note */}
      <div style={{
        ...card(), padding: "12px 16px", marginBottom: 20,
        display: "flex", gap: 10, alignItems: "flex-start",
        borderColor: "rgba(224,176,32,0.25)",
      }}>
        <span style={{ fontSize: 16 }}>ℹ️</span>
        <div style={{ fontSize: 12, color: C.secondary, lineHeight: 1.5 }}>
          There is no reject action anywhere in this workflow — an application can only move forward or be left
          pending. If an application looks fraudulent, use{" "}
          <a href="/admin/fraud" style={{ color: C.accent, textDecoration: "none", fontWeight: 700 }}>account suspension</a>{" "}
          on the worker instead.
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "64px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>Loading…</div>
      ) : error ? (
        <ErrorState message={error} retry={() => load(tab)} title="Could not load queue" />
      ) : rows.length === 0 ? (
        <EmptyState icon="📋" title="Nothing in this queue" description="Check back once applications reach this stage." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20, alignItems: "start" }}>

          {/* ── Queue (left) ─────────────────────────────────────────────── */}
          <div>
            {rows.map(row => (
              <QueueRow
                key={row.id}
                row={row}
                selected={row.id === selectedId}
                onClick={() => setSelectedId(row.id)}
                subtitle={
                  tab === "review" ? "Pending review" :
                  tab === "documents" ? `${(row.documents ?? []).filter(d => d.status === "APPROVED").length}/${(row.documents ?? []).length} docs approved` :
                  row.adminFeeCharge ? <FeeStatusPill status={row.adminFeeCharge.status} /> : "Not yet charged"
                }
              />
            ))}
          </div>

          {/* ── Detail panel (right) ─────────────────────────────────────── */}
          <div style={{ ...card(), padding: 24 }}>
            {!selected ? (
              <div style={{ color: C.muted, fontSize: 13 }}>Select an application from the queue.</div>
            ) : (
              <>
                {/* Applicant header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{workerName(selected.worker)}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{selected.worker.email}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.secondary }}>{selected.job.title}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {/* Second layer of protection, on top of the real fix
                          (getFeeQueue now includes employer, matching the
                          other two tabs' endpoints) — this header renders
                          for all three tabs regardless of which queue
                          endpoint populated `selected`, so a future 4th
                          tab/endpoint that forgets the same include degrades
                          to "—" here instead of crashing the page. */}
                      {selected.employer?.employerProfile?.companyName ?? selected.employer?.email ?? "—"} · {selected.job.country}
                    </div>
                  </div>
                </div>

                {/* ── Application Review tab ─────────────────────────────── */}
                {tab === "review" && (
                  <>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
                      Applied {fmtDate(selected.createdAt)} ({daysAgo(selected.createdAt)})
                    </div>

                    <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Note to worker
                    </div>
                    <textarea
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      placeholder="Optional — shown to the worker while their application is in review…"
                      style={noteFieldStyle}
                    />

                    <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                      <button
                        onClick={handleApprove}
                        disabled={submitting}
                        style={{
                          padding: "10px 20px", borderRadius: 10, border: "none",
                          background: C.accent, color: "#fff", fontSize: 13, fontWeight: 700,
                          cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.6 : 1,
                        }}
                      >
                        {submitting ? "Working…" : "✓ Approve & queue"}
                      </button>
                      <button
                        onClick={handleLeavePending}
                        disabled={submitting}
                        style={{
                          padding: "10px 20px", borderRadius: 10,
                          border: `1px solid ${C.border}`, background: "transparent",
                          color: C.secondary, fontSize: 13, fontWeight: 700,
                          cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.6 : 1,
                        }}
                      >
                        Save note & leave pending
                      </button>
                    </div>
                  </>
                )}

                {/* ── Document Verification tab ──────────────────────────── */}
                {tab === "documents" && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                      Documents
                    </div>
                    {(selected.documents ?? []).length === 0 ? (
                      <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>No documents requested yet.</div>
                    ) : (selected.documents ?? []).every(d => d.status === "APPROVED") ? (
                      <div style={{ fontSize: 13, color: C.success, marginBottom: 16 }}>All requested documents are approved.</div>
                    ) : null}

                    {selected.workflowStatus !== "DOCUMENTS_APPROVED" && ((selected.documents ?? []).length === 0 || (selected.documents ?? []).every(d => d.status === "APPROVED")) ? (
                      <button
                        onClick={handleSkipDocs}
                        disabled={skippingDocs}
                        style={{
                          padding: "10px 18px", borderRadius: 10, border: "none",
                          background: C.accent, color: "#fff", fontSize: 13, fontWeight: 700,
                          cursor: skippingDocs ? "default" : "pointer", opacity: skippingDocs ? 0.6 : 1,
                          marginBottom: 20,
                        }}
                      >
                        {skippingDocs ? "Working…" : "✓ No documents needed — approve documents"}
                      </button>
                    ) : null}

                    {/* Documents cleared — the fee is no longer charged from here.
                        Major resequencing: DOCUMENTS_APPROVED now leads into an
                        employer-hire + worker-confirm gate (see /admin/hiring/
                        interview), not directly to the fee. The fee only becomes
                        chargeable once that gate passes — see the Awaiting Fee tab. */}
                    {selected.workflowStatus === "DOCUMENTS_APPROVED" && (
                      <div style={{ padding: "14px 16px", background: rowBg, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 20 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                          Documents cleared
                        </div>
                        <div style={{ fontSize: 11, color: C.muted }}>
                          The employer can now see this candidate to request an interview and/or hire (
                          <a href="/admin/hiring/interview" style={{ color: C.accent, textDecoration: "none", fontWeight: 700 }}>Interview &amp; Hire</a>
                          ). Once the employer hires and the worker confirms, the admin fee becomes chargeable on the Awaiting Fee tab.
                        </div>
                      </div>
                    )}

                    {(selected.documents ?? []).length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                        {(selected.documents ?? []).map(doc => (
                          <div key={doc.id} style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "10px 14px", background: rowBg, borderRadius: 8,
                            border: `1px solid ${C.border}`,
                          }}>
                            <div>
                              <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{doc.documentType}</div>
                              <div style={{ fontSize: 11, color: C.muted }}>
                                {doc.fileUrl ? (
                                  <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.info, textDecoration: "none" }}>View ↗</a>
                                ) : "Not yet submitted by worker"}
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <DocStatusPill status={doc.status} />
                              {doc.status !== "APPROVED" && (
                                <button
                                  onClick={() => handleApproveDoc(doc.id)}
                                  disabled={approvingDocId === doc.id || !doc.fileUrl}
                                  title={!doc.fileUrl ? "Worker hasn't submitted this document yet" : undefined}
                                  style={{
                                    padding: "5px 12px", borderRadius: 6,
                                    border: `1px solid ${C.success}`,
                                    background: "rgba(22,163,74,0.12)", color: C.success,
                                    fontSize: 11, fontWeight: 700,
                                    cursor: approvingDocId === doc.id || !doc.fileUrl ? "default" : "pointer",
                                    opacity: !doc.fileUrl ? 0.4 : 1,
                                  }}
                                >
                                  {approvingDocId === doc.id ? "…" : "Approve"}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                      + Request a document
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={newDocType}
                        onChange={e => setNewDocType(e.target.value)}
                        placeholder="e.g. Passport scan, Medical certificate…"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        onClick={handleRequestDoc}
                        disabled={requestingDoc || !newDocType.trim()}
                        style={{
                          padding: "9px 16px", borderRadius: 8, border: "none",
                          background: C.accent, color: "#fff", fontSize: 12, fontWeight: 700,
                          cursor: requestingDoc || !newDocType.trim() ? "default" : "pointer",
                          opacity: !newDocType.trim() ? 0.5 : 1, whiteSpace: "nowrap",
                        }}
                      >
                        {requestingDoc ? "Requesting…" : "+ Request"}
                      </button>
                    </div>
                  </>
                )}

                {/* ── Awaiting Fee tab ────────────────────────────────────── */}
                {tab === "fee" && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                      Fee status
                    </div>
                    {selected.adminFeeCharge ? (
                      <div style={{ padding: "14px 16px", background: rowBg, borderRadius: 10, border: `1px solid ${C.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 13, color: C.secondary }}>Amount</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                            ${selected.adminFeeCharge.amountUsd} {selected.adminFeeCharge.currency.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 13, color: C.secondary }}>Country / visa</span>
                          <span style={{ fontSize: 13, color: C.text }}>
                            {selected.adminFeeCharge.countryCode} / {selected.adminFeeCharge.visaType || "—"}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 13, color: C.secondary }}>Status</span>
                          <FeeStatusPill status={selected.adminFeeCharge.status} />
                        </div>
                        {selected.adminFeeCharge.paidAt && (
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Paid {fmtDate(selected.adminFeeCharge.paidAt)}</div>
                        )}
                        {selected.adminFeeCharge.failedAt && (
                          <div style={{ fontSize: 11, color: C.danger, marginTop: 8 }}>Last attempt failed {fmtDate(selected.adminFeeCharge.failedAt)} — worker can retry.</div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: C.muted, padding: "14px 16px", background: rowBg, borderRadius: 10, border: `1px solid ${C.border}` }}>
                        No charge has been created for this application yet.
                      </div>
                    )}

                    {/* Charge trigger — moved here from the Documents tab: the fee
                        is now only chargeable once the employer-hire + worker-
                        confirm gate has passed (workflowStatus === ADMIN_FEE_DUE),
                        not right after documents clear. */}
                    {selected.workflowStatus === "ADMIN_FEE_DUE" && selected.adminFeeCharge?.status !== "SUCCEEDED" && (
                      <div style={{ padding: "14px 16px", background: rowBg, borderRadius: 10, border: `1px solid ${C.border}`, marginTop: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                          Hire confirmed by both sides — charge the admin fee
                        </div>
                        {!feeSchedulesLoaded ? (
                          <div style={{ fontSize: 12, color: C.muted }}>Loading fee schedules…</div>
                        ) : availableSchedules.length === 0 ? (
                          <div style={{ fontSize: 12, color: C.warning, lineHeight: 1.5 }}>
                            No fee schedules configured for {selected.job.country} yet —{" "}
                            <Link href="/admin/fee-schedules" style={{ color: C.accent, textDecoration: "underline" }}>
                              add one on the Fee Schedules page
                            </Link>.
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
                              Select the visa type — the fee amount is resolved live from the fee schedule for {selected.job.country}.
                            </div>
                            <div style={{ display: "flex", gap: 8, marginBottom: selectedSchedule ? 10 : 0 }}>
                              <select
                                value={visaType}
                                onChange={e => setVisaType(e.target.value)}
                                style={{ ...inputStyle, flex: 1 }}
                              >
                                <option value="">Select visa type…</option>
                                {availableSchedules.map(s => (
                                  <option key={s.id} value={s.visaType}>{s.visaType}</option>
                                ))}
                              </select>
                              <button
                                onClick={handleChargeFee}
                                disabled={chargingFee || !selectedSchedule}
                                style={{
                                  padding: "9px 16px", borderRadius: 8, border: "none",
                                  background: C.accent, color: "#fff", fontSize: 12, fontWeight: 700,
                                  cursor: chargingFee || !selectedSchedule ? "default" : "pointer",
                                  opacity: !selectedSchedule ? 0.5 : 1, whiteSpace: "nowrap",
                                }}
                              >
                                {chargingFee ? "Starting…" : "Charge admin fee"}
                              </button>
                            </div>
                            {selectedSchedule && (
                              <div style={{ fontSize: 14, fontWeight: 700, color: C.accent }}>
                                Fee: ${Number(selectedSchedule.amountUsd).toFixed(2)}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: C.muted, marginTop: 14, lineHeight: 1.5 }}>
                      Manage per-country/visa fee amounts on the{" "}
                      <Link href="/admin/fee-schedules" style={{ color: C.accent, textDecoration: "underline" }}>
                        Fee Schedules page
                      </Link>.
                    </div>
                  </>
                )}
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
