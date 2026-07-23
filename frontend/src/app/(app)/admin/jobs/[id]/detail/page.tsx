"use client";
// frontend/src/app/(app)/admin/jobs/[id]/detail/page.tsx

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { adminApi } from "@/lib/api-client";
import { C } from "@/lib/admin-theme";
import { Button, Spinner, ToastDisplay, type ToastData } from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────────

type JobStatus = "DRAFT" | "PENDING_MODERATION" | "APPROVED" | "REJECTED" | "ARCHIVED";

interface JobDetail {
  id:                  string;
  title:               string;
  companyName:         string;
  description:         string;
  requirements:        string;
  benefits?:           string | null;
  country:             string;
  city:                string;
  remoteAllowed:       boolean;
  salaryMin:           number;
  salaryMax:           number;
  salaryCurrency:      string;
  contractType:        string;
  experienceRequired:  number;
  category:            string;
  requiredSkills:      string[];
  languagesRequired:   string[];
  visaSupport:         boolean;
  accommodation:       boolean;
  applicationDeadline?: string | null;
  positionsAvailable:  number;
  status:              JobStatus;
  moderationNotes?:    string | null;
  approvedAt?:         string | null;
  rejectedAt?:         string | null;
  archivedAt?:         string | null;
  changesRequestedAt?: string | null;
  viewCount:           number;
  applicationCount:    number;
  createdAt:           string;
  updatedAt:           string;
  employer: {
    id:                  string;
    email:               string;
    accountStatus:       string;
    postingRightsRevoked: boolean;
    name:                string | null;
    companyName:         string | null;
    totalJobsPosted:     number;
    totalJobsApproved:   number;
    totalJobsRejected:   number;
  };
  moderationHistory: Array<{
    action:    string;
    admin_id:  string;
    notes?:    string;
    timestamp: string;
  }>;
  auditLog: Array<{
    id:             string;
    action:         string;
    notes:          string | null;
    metadata:       Record<string, unknown>;
    created_at:     string;
  }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined, fallback = "—"): string {
  if (!d) return fallback;
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtSalary(min: number, max: number, currency: string): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  return `${currency} ${fmt(min)}${max > min ? ` – ${fmt(max)}` : ""}`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30)  return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

// ── Status chip ────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<JobStatus, { label: string; color: string; bg: string; border: string }> = {
  PENDING_MODERATION: { label: "Pending review", color: "#fbbf24", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.3)"  },
  APPROVED:           { label: "Live",            color: "#4ade80", bg: "rgba(34,197,94,0.10)",   border: "rgba(34,197,94,0.3)"   },
  REJECTED:           { label: "Rejected",        color: "#f87171", bg: "rgba(239,68,68,0.10)",   border: "rgba(239,68,68,0.3)"   },
  ARCHIVED:           { label: "Archived",        color: "#94a3b8", bg: "rgba(100,116,139,0.10)", border: "rgba(100,116,139,0.3)" },
  DRAFT:              { label: "Draft",           color: "#94a3b8", bg: "rgba(100,116,139,0.10)", border: "rgba(100,116,139,0.3)" },
};

function StatusChip({ status, large }: { status: JobStatus; large?: boolean }) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.DRAFT;
  return (
    <span style={{
      display:      "inline-flex",
      alignItems:   "center",
      gap:          5,
      padding:      large ? "5px 14px" : "3px 9px",
      borderRadius: 99,
      fontSize:     large ? 13 : 11,
      fontWeight:   700,
      color:        s.color,
      background:   s.bg,
      border:       `1px solid ${s.border}`,
      whiteSpace:   "nowrap",
    }}>
      {status === "APPROVED" && (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
      )}
      {s.label}
    </span>
  );
}

// ── Field row ──────────────────────────────────────────────────────────────────

function FieldRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{
      display:       "grid",
      gridTemplateColumns: "140px 1fr",
      gap:           12,
      padding:       "9px 0",
      borderBottom:  `1px solid ${C.border}`,
      alignItems:    "baseline",
    }}>
      <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{label}</span>
      <span style={{
        fontSize:    13,
        color:       C.text,
        fontFamily:  mono ? "'JetBrains Mono', monospace" : "inherit",
        wordBreak:   "break-word",
      }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {title}
      </h3>
      {count != null && (
        <span style={{
          fontSize: 11, fontWeight: 700,
          background: "rgba(255,255,255,0.07)",
          color: C.muted,
          borderRadius: 99, padding: "1px 7px",
          border: `1px solid ${C.border}`,
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, color = C.blue }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton() {
  const shimmer: React.CSSProperties = {
    background: "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.07) 50%,rgba(255,255,255,0.04) 75%)",
    backgroundSize: "400% 100%",
    animation: "shimmer 1.5s infinite",
    borderRadius: 6,
  };
  return (
    <div style={{ padding: "32px 32px 60px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ ...shimmer, width: 120, height: 14, marginBottom: 32 }} />
      <div style={{ ...shimmer, width: "50%", height: 28, marginBottom: 10 }} />
      <div style={{ ...shimmer, width: "30%", height: 16, marginBottom: 24 }} />
      <div style={{ display: "grid", gridTemplateColumns: "60fr 40fr", gap: 20 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          {[240, 200, 180, 160, 200, 140].map((w, i) => (
            <div key={i} style={{ ...shimmer, width: w, height: 13 }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
              <div style={{ ...shimmer, width: "60%", height: 13, marginBottom: 10 }} />
              <div style={{ ...shimmer, width: "40%", height: 28 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Textarea modal (reject / request changes) ──────────────────────────────────

function TextareaModal({
  title, description, label, placeholder, confirmLabel, confirmColor,
  minLength = 10, onClose, onConfirm,
}: {
  title:         string;
  description?:  string;
  label:         string;
  placeholder:   string;
  confirmLabel:  string;
  confirmColor:  string;
  minLength?:    number;
  onClose:       () => void;
  onConfirm:     (text: string) => Promise<void>;
}) {
  const [text,    setText]    = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (text.trim().length < minLength) { setError(`At least ${minLength} characters required.`); return; }
    setLoading(true);
    try { await onConfirm(text.trim()); }
    catch (e) { setError((e as Error).message || "Something went wrong"); setLoading(false); }
  };

  return (
    <>
      <div onClick={onClose} className="glass-scrim" style={{ zIndex: 200 }} />
      <div className="glass-modal" style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        zIndex: 201, width: 500, maxWidth: "calc(100vw - 32px)",
        padding: 28,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>{title}</h3>
            {description && <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.5 }}>{description}</p>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 20, padding: 2, lineHeight: 1 }}>✕</button>
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 7 }}>
          {label} <span style={{ color: "#ef4444" }}>*</span>
        </label>
        <textarea
          value={text}
          onChange={e => { setText(e.target.value); setError(""); }}
          placeholder={placeholder}
          rows={4}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "rgba(255,255,255,0.04)", border: `1px solid ${error ? "#ef4444" : C.border}`,
            borderRadius: 10, padding: "11px 14px", fontSize: 13, color: C.text,
            resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.6,
          }}
        />
        {error && <p style={{ fontSize: 12, color: "#ef4444", margin: "4px 0 0" }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            size="sm" loading={loading}
            disabled={text.trim().length < minLength || loading}
            onClick={submit}
            style={{ background: confirmColor, color: "#fff", border: "none" }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </>
  );
}

// ── Confirm modal ──────────────────────────────────────────────────────────────

function ConfirmModal({
  title, body, confirmLabel, confirmColor, onClose, onConfirm,
}: {
  title:        string;
  body:         string;
  confirmLabel: string;
  confirmColor: string;
  onClose:      () => void;
  onConfirm:    () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const run = async () => { setLoading(true); await onConfirm(); setLoading(false); };

  return (
    <>
      <div onClick={onClose} className="glass-scrim" style={{ zIndex: 200 }} />
      <div className="glass-modal" style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        zIndex: 201, width: 420, maxWidth: "calc(100vw - 32px)",
        padding: 28,
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: "0 0 10px" }}>{title}</h3>
        <p style={{ fontSize: 13, color: C.muted, margin: "0 0 22px", lineHeight: 1.6 }}>{body}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={run} style={{ background: confirmColor, color: "#fff", border: "none" }}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </>
  );
}

// ── Small action button ────────────────────────────────────────────────────────

function ActionBtn({
  label, color, bg, border, loading: isLoading, disabled, onClick,
}: {
  label:    string;
  color:    string;
  bg:       string;
  border?:  string;
  loading?: boolean;
  disabled?: boolean;
  onClick:  () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      style={{
        height: 34, padding: "0 14px", borderRadius: 9,
        border: `1px solid ${border ?? "transparent"}`,
        background: bg, color, fontSize: 12, fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex", alignItems: "center", gap: 5,
        whiteSpace: "nowrap",
        opacity: disabled && !isLoading ? 0.45 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {isLoading ? <Spinner size="xs" color="white" /> : label}
    </button>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────────────

function Pager({ page, total, pageSize, onChange }: {
  page: number; total: number; pageSize: number; onChange: (p: number) => void;
}) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= page - 1 && i <= page + 1)) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const btn = (label: React.ReactNode, target: number, disabled: boolean) => (
    <button
      key={String(label)} onClick={() => !disabled && onChange(target)} disabled={disabled}
      style={{
        minWidth: 30, height: 30, padding: "0 8px", borderRadius: 7,
        border: `1px solid ${C.border}`, background: "transparent",
        color: disabled ? "#333" : C.muted, fontSize: 12, cursor: disabled ? "default" : "pointer",
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center", marginTop: 20 }}>
      {btn("‹", page - 1, page === 1)}
      {nums.map((n, i) =>
        n === "…"
          ? <span key={`e${i}`} style={{ color: C.muted, fontSize: 12, padding: "0 4px" }}>…</span>
          : (
            <button key={n} onClick={() => onChange(n)} style={{
              minWidth: 30, height: 30, padding: "0 8px", borderRadius: 7,
              border: `1px solid ${n === page ? "rgba(255,255,255,0.2)" : C.border}`,
              background: n === page ? "rgba(255,255,255,0.08)" : "transparent",
              color: n === page ? C.text : C.muted, fontSize: 12,
              cursor: n === page ? "default" : "pointer", fontWeight: n === page ? 700 : 400,
            }}>
              {n}
            </button>
          )
      )}
      {btn("›", page + 1, page === pages)}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminJobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [job,      setJob]      = useState<JobDetail | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null); // which action is running
  const [toast,    setToast]    = useState<ToastData>(null);

  // Description expand
  const [descExpanded, setDescExpanded] = useState(false);
  const [reqExpanded,  setReqExpanded]  = useState(false);

  // Modal state
  const [modal, setModal] = useState<
    "reject" | "request-changes" | "archive" | "revoke" | null
  >(null);

  // Applications sub-table
  const [apps,        setApps]        = useState<unknown[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsPage,    setAppsPage]    = useState(1);
  const APPS_PER_PAGE = 10;

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Fetch job detail ────────────────────────────────────────────────────────

  const fetchJob = useCallback(async () => {
    setLoading(true);
    setFetchErr(null);
    const res = await adminApi.getAdminJobDetail(id) as any;
    setLoading(false);
    if (!res.success) {
      setFetchErr(res.error ?? "Failed to load job details");
      return;
    }
    setJob(res.data as JobDetail);
  }, [id]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  // ── Escape closes modals ────────────────────────────────────────────────────

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setModal(null); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleApprove = async () => {
    if (!job) return;
    setActionId("approve");
    const res = await adminApi.approveJob(job.id) as any;
    setActionId(null);
    if (!res.success) { showToast(res.error ?? "Approval failed", "err"); return; }
    setJob(prev => prev ? { ...prev, status: "APPROVED", approvedAt: new Date().toISOString() } : prev);
    showToast("Job approved — now live", "ok");
  };

  const handleReject = async (reason: string) => {
    if (!job) return;
    setActionId("reject");
    const res = await adminApi.rejectJob(job.id, reason) as any;
    setActionId(null);
    if (!res.success) throw new Error(res.error ?? "Rejection failed");
    setJob(prev => prev ? { ...prev, status: "REJECTED", rejectedAt: new Date().toISOString(), moderationNotes: reason } : prev);
    setModal(null);
    showToast("Job rejected — employer notified", "ok");
  };

  const handleRequestChanges = async (notes: string) => {
    if (!job) return;
    setActionId("changes");
    const res = await adminApi.requestJobChanges(job.id, notes) as any;
    setActionId(null);
    if (!res.success) throw new Error(res.error ?? "Request failed");
    setJob(prev => prev ? { ...prev, status: "DRAFT", changesRequestedAt: new Date().toISOString(), moderationNotes: notes } : prev);
    setModal(null);
    showToast("Changes requested — employer notified", "ok");
  };

  const handleArchive = async () => {
    if (!job) return;
    setActionId("archive");
    const res = await adminApi.archiveJobAdmin(job.id) as any;
    setActionId(null);
    if (!res.success) throw new Error(res.error ?? "Archive failed");
    setJob(prev => prev ? { ...prev, status: "ARCHIVED", archivedAt: new Date().toISOString() } : prev);
    setModal(null);
    showToast("Job archived", "ok");
  };

  const handleRevoke = async () => {
    if (!job) return;
    setActionId("revoke");
    const res = await adminApi.revokePostingRights(job.employer.id, `Revoked from job detail page — job ${job.id}`) as any;
    setActionId(null);
    if (!res.success) throw new Error(res.error ?? "Revoke failed");
    setJob(prev => prev ? { ...prev, employer: { ...prev.employer, postingRightsRevoked: true } } : prev);
    setModal(null);
    showToast("Posting rights revoked", "ok");
  };

  // ── Render: loading ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <>
        <style>{`@keyframes shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}`}</style>
        <Skeleton />
      </>
    );
  }

  // ── Render: error ───────────────────────────────────────────────────────────

  if (fetchErr || !job) {
    return (
      <div style={{ padding: "60px 32px", maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: "0 0 8px" }}>
          {fetchErr ?? "Job not found"}
        </h2>
        <p style={{ fontSize: 13, color: C.muted, margin: "0 0 24px" }}>
          The job post could not be loaded. It may have been deleted or you may not have access.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={fetchJob} style={{
            height: 36, padding: "0 18px", borderRadius: 9, border: `1px solid ${C.border}`,
            background: "transparent", color: C.muted, fontSize: 13, cursor: "pointer",
          }}>
            Retry
          </button>
          <button onClick={() => router.push("/admin/jobs")} style={{
            height: 36, padding: "0 18px", borderRadius: 9, border: "none",
            background: "rgba(0,144,255,0.15)", color: "#60a5fa", fontSize: 13,
            fontWeight: 600, cursor: "pointer",
          }}>
            ← Back to jobs
          </button>
        </div>
      </div>
    );
  }

  // ── Computed ────────────────────────────────────────────────────────────────

  const salary     = fmtSalary(Number(job.salaryMin), Number(job.salaryMax), job.salaryCurrency);
  const descText   = job.description ?? "";
  const descClamped = !descExpanded && descText.length > 500 ? descText.slice(0, 400) + "…" : descText;
  const reqText    = job.requirements ?? "";
  const reqClamped  = !reqExpanded  && reqText.length > 400  ? reqText.slice(0, 320)  + "…" : reqText;

  const busy = actionId !== null;

  // ── Render: page ────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "32px 32px 80px", maxWidth: 1200, margin: "0 auto", fontFamily: "inherit" }}>
      <ToastDisplay toast={toast} />
      <style>{`@keyframes shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}`}</style>

      {/* ── Back button ── */}
      <button
        onClick={() => router.back()}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "none", border: "none", cursor: "pointer",
          fontSize: 13, color: C.muted, padding: "0 0 20px",
          fontFamily: "inherit",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back to all jobs
      </button>

      {/* ── Hero card ── */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
        padding: "24px 28px", marginBottom: 16,
        display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>
              {job.title}
            </h1>
            <StatusChip status={job.status} large />
          </div>
          <div style={{ fontSize: 15, color: C.muted, marginBottom: 6 }}>
            {job.companyName}
            {job.city && ` · ${job.city}`}
            {job.country && `, ${job.country}`}
          </div>
          <div style={{ fontSize: 12, color: "#444", display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span>Posted {timeAgo(job.createdAt)} · {fmtDate(job.createdAt)}</span>
            <span style={{ color: "#333" }}>ID: <code style={{ fontFamily: "'JetBrains Mono', monospace", color: "#555" }}>{job.id}</code></span>
            {job.approvedAt && <span style={{ color: C.green }}>Approved {fmtDate(job.approvedAt)}</span>}
            {job.rejectedAt && <span style={{ color: "#f87171" }}>Rejected {fmtDate(job.rejectedAt)}</span>}
            {job.changesRequestedAt && <span style={{ color: C.yellow }}>Changes requested {fmtDate(job.changesRequestedAt)}</span>}
          </div>
        </div>

        {/* View counts */}
        <div style={{
          display: "flex", gap: 20, flexShrink: 0,
          fontSize: 12, color: C.muted, alignItems: "center",
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.blue }}>{job.viewCount.toLocaleString()}</div>
            <div>Views</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.green }}>{job.applicationCount.toLocaleString()}</div>
            <div>Applications</div>
          </div>
        </div>
      </div>

      {/* ── Action row ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>

        {job.status === "PENDING_MODERATION" && (
          <>
            <ActionBtn
              label="✓ Approve"
              color="#fff" bg="linear-gradient(135deg,#14b8a6,#0d9488)"
              loading={actionId === "approve"} disabled={busy && actionId !== "approve"}
              onClick={handleApprove}
            />
            <ActionBtn
              label="✗ Reject"
              color="#f87171" bg="rgba(239,68,68,0.10)" border="rgba(239,68,68,0.3)"
              loading={actionId === "reject"} disabled={busy && actionId !== "reject"}
              onClick={() => setModal("reject")}
            />
            <ActionBtn
              label="Request changes"
              color={C.yellow} bg="rgba(245,158,11,0.10)" border="rgba(245,158,11,0.25)"
              loading={actionId === "changes"} disabled={busy && actionId !== "changes"}
              onClick={() => setModal("request-changes")}
            />
          </>
        )}

        {job.status === "APPROVED" && (
          <>
            <ActionBtn
              label="Archive"
              color={C.muted} bg="rgba(255,255,255,0.05)"
              loading={actionId === "archive"} disabled={busy && actionId !== "archive"}
              onClick={() => setModal("archive")}
            />
            {!job.employer.postingRightsRevoked && (
              <ActionBtn
                label="Revoke posting rights"
                color="#f87171" bg="rgba(239,68,68,0.08)" border="rgba(239,68,68,0.2)"
                loading={actionId === "revoke"} disabled={busy && actionId !== "revoke"}
                onClick={() => setModal("revoke")}
              />
            )}
          </>
        )}

        {(job.status === "REJECTED" || job.status === "ARCHIVED") && (
          <ActionBtn
            label="✓ Approve"
            color="#fff" bg="linear-gradient(135deg,#14b8a6,#0d9488)"
            loading={actionId === "approve"} disabled={busy && actionId !== "approve"}
            onClick={handleApprove}
          />
        )}

        {/* Moderation notes banner */}
        {job.moderationNotes && (
          <div style={{
            flex: "1 1 100%",
            background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: 10, padding: "8px 14px",
            fontSize: 12, color: C.yellow, lineHeight: 1.5,
          }}>
            <strong>Moderation note:</strong> {job.moderationNotes}
          </div>
        )}

        {job.employer.postingRightsRevoked && (
          <div style={{
            flex: "1 1 100%",
            background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 10, padding: "8px 14px",
            fontSize: 12, color: "#fca5a5", lineHeight: 1.5,
          }}>
            ⚠ This employer&apos;s posting rights have been revoked.
          </div>
        )}
      </div>

      {/* ── Two-column grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "60fr 40fr", gap: 20, marginBottom: 20 }}>

        {/* LEFT — Job details */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Job information */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "22px 24px" }}>
            <SectionHeader title="Job information" />
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              <FieldRow label="Country"     value={job.country} />
              <FieldRow label="City"        value={job.city} />
              <FieldRow label="Category"    value={job.category} />
              <FieldRow label="Work type"   value={job.contractType?.replace(/_/g, " ")} />
              <FieldRow label="Remote"      value={job.remoteAllowed ? "Yes" : "No"} />
              <FieldRow label="Visa support" value={
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                  background: job.visaSupport ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)",
                  color: job.visaSupport ? "#4ade80" : "#94a3b8",
                  border: `1px solid ${job.visaSupport ? "rgba(34,197,94,0.3)" : "rgba(100,116,139,0.3)"}`,
                }}>
                  {job.visaSupport ? "✓ Yes" : "No"}
                </span>
              } />
              <FieldRow label="Accommodation" value={job.accommodation ? "Provided" : "Not provided"} />
              <FieldRow label="Experience"    value={`${job.experienceRequired} year${job.experienceRequired !== 1 ? "s" : ""}`} />
              <FieldRow label="Positions"     value={job.positionsAvailable} />
              <FieldRow label="Salary"        value={<span style={{ color: C.green, fontWeight: 600 }}>{salary}</span>} />
              {job.applicationDeadline && (
                <FieldRow label="Deadline" value={fmtDate(job.applicationDeadline)} />
              )}
              {job.languagesRequired.length > 0 && (
                <FieldRow label="Languages" value={job.languagesRequired.join(", ")} />
              )}
            </div>
          </div>

          {/* Description */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "22px 24px" }}>
            <SectionHeader title="Description" />
            <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.75, margin: "0 0 8px", whiteSpace: "pre-wrap" }}>
              {descClamped}
            </p>
            {descText.length > 500 && (
              <button onClick={() => setDescExpanded(e => !e)} style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 12, color: C.blue, padding: 0, fontFamily: "inherit",
              }}>
                {descExpanded ? "Show less ↑" : "Show more ↓"}
              </button>
            )}

            {reqText && (
              <>
                <div style={{ marginTop: 18, marginBottom: 12, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                  <SectionHeader title="Requirements" />
                </div>
                <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.75, margin: "0 0 8px", whiteSpace: "pre-wrap" }}>
                  {reqClamped}
                </p>
                {reqText.length > 400 && (
                  <button onClick={() => setReqExpanded(e => !e)} style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 12, color: C.blue, padding: 0, fontFamily: "inherit",
                  }}>
                    {reqExpanded ? "Show less ↑" : "Show more ↓"}
                  </button>
                )}
              </>
            )}

            {job.benefits && (
              <>
                <div style={{ marginTop: 18, marginBottom: 12, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                  <SectionHeader title="Benefits" />
                </div>
                <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap" }}>
                  {job.benefits}
                </p>
              </>
            )}
          </div>

          {/* Required skills */}
          {job.requiredSkills.length > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "22px 24px" }}>
              <SectionHeader title="Required skills" count={job.requiredSkills.length} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {job.requiredSkills.map(skill => (
                  <span key={skill} style={{
                    fontSize: 12, fontWeight: 600, padding: "4px 10px",
                    background: "rgba(0,144,255,0.08)", border: "1px solid rgba(0,144,255,0.2)",
                    borderRadius: 7, color: "#60a5fa",
                  }}>
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Stats + employer */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Application stats */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Stats
              </span>
            </div>
            <StatCard label="Applications received" value={job.applicationCount} color={C.blue} />
            <StatCard label="Views" value={job.viewCount} color={C.muted} />
            <StatCard label="Positions available" value={job.positionsAvailable} color={C.green} />
          </div>

          {/* Employer card */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px" }}>
            <SectionHeader title="Employer" />

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 2 }}>
                {job.employer.companyName ?? "—"}
              </div>
              {job.employer.name && (
                <div style={{ fontSize: 13, color: C.muted }}>{job.employer.name}</div>
              )}
            </div>

            <div style={{ fontSize: 12, color: "#555", fontFamily: "'JetBrains Mono', monospace", marginBottom: 12, wordBreak: "break-all" }}>
              {job.employer.email}
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                background: job.employer.accountStatus === "ACTIVE" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                color: job.employer.accountStatus === "ACTIVE" ? "#4ade80" : "#f87171",
                border: `1px solid ${job.employer.accountStatus === "ACTIVE" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
              }}>
                {job.employer.accountStatus}
              </span>
              {job.employer.postingRightsRevoked && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                  background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)",
                }}>
                  Posting revoked
                </span>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
              {[
                { label: "Posted",   value: job.employer.totalJobsPosted },
                { label: "Approved", value: job.employer.totalJobsApproved },
                { label: "Rejected", value: job.employer.totalJobsRejected },
              ].map(s => (
                <div key={s.label} style={{
                  background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: "8px 10px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <Link
              href={`/admin/users/${job.employer.id}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 12, fontWeight: 600, color: C.blue,
                textDecoration: "none",
              }}
            >
              View employer profile →
            </Link>
          </div>

          {/* Moderation history */}
          {job.moderationHistory.length > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px" }}>
              <SectionHeader title="Moderation history" count={job.moderationHistory.length} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {job.moderationHistory.map((entry, i) => (
                  <div key={i} style={{
                    padding: "9px 12px",
                    background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`,
                    borderRadius: 8,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: entry.notes ? 4 : 0 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: entry.action === "APPROVED" ? C.green
                             : entry.action === "REJECTED" ? "#f87171"
                             : C.yellow,
                      }}>
                        {entry.action.replace(/_/g, " ")}
                      </span>
                      <span style={{ fontSize: 11, color: "#444" }}>{fmtDate(entry.timestamp)}</span>
                    </div>
                    {entry.notes && (
                      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{entry.notes}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Applications section ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{
          padding: "16px 22px", borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Applications
            </h3>
            <span style={{
              fontSize: 11, fontWeight: 700, background: "rgba(0,144,255,0.12)",
              color: "#60a5fa", borderRadius: 99, padding: "1px 7px",
              border: "1px solid rgba(0,144,255,0.25)",
            }}>
              {job.applicationCount}
            </span>
          </div>
          <Link
            href={`/admin/jobs?jobId=${job.id}`}
            style={{ fontSize: 12, color: C.muted, textDecoration: "none" }}
          >
            Filter in applications →
          </Link>
        </div>

        {job.applicationCount === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: "0 0 5px" }}>No applications yet</p>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Applications will appear here once workers start applying.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Applicant", "Match score", "Status", "Applied", "Actions"].map(h => (
                    <th key={h} style={{
                      padding: "11px 18px", textAlign: "left",
                      fontSize: 11, fontWeight: 700, color: "#444",
                      textTransform: "uppercase", letterSpacing: "0.06em",
                      background: "rgba(255,255,255,0.02)",
                      borderBottom: `1px solid ${C.border}`,
                      whiteSpace: "nowrap",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {appsLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      {[160, 80, 90, 90, 80].map((w, j) => (
                        <td key={j} style={{ padding: "13px 18px" }}>
                          <div style={{
                            height: 12, width: w, borderRadius: 5,
                            background: "rgba(255,255,255,0.05)",
                            animation: "shimmer 1.5s infinite",
                            backgroundSize: "400% 100%",
                            backgroundImage: "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.07) 50%,rgba(255,255,255,0.04) 75%)",
                          }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : apps.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div style={{ padding: "32px 24px", textAlign: "center", color: C.muted, fontSize: 13 }}>
                        Application details require a dedicated admin endpoint.
                        <br />
                        <span style={{ color: "#444" }}>Total count: {job.applicationCount} (from job summary)</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  // Populated when the applications endpoint is available
                  apps
                    .slice((appsPage - 1) * APPS_PER_PAGE, appsPage * APPS_PER_PAGE)
                    .map((app: unknown) => {
                      const a = app as Record<string, unknown>;
                      return (
                        <tr key={a.id as string}
                          style={{ borderBottom: `1px solid ${C.border}` }}
                          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        >
                          <td style={{ padding: "12px 18px", fontSize: 13, color: C.text }}>
                            {(a.workerName ?? a.worker_name ?? "Worker") as string}
                          </td>
                          <td style={{ padding: "12px 18px", fontSize: 13, color: C.blue, fontWeight: 600 }}>
                            {a.matchScore != null ? `${a.matchScore}%` : "—"}
                          </td>
                          <td style={{ padding: "12px 18px" }}>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                              background: "rgba(255,255,255,0.06)", color: C.muted,
                              border: `1px solid ${C.border}`,
                            }}>
                              {a.status as string}
                            </span>
                          </td>
                          <td style={{ padding: "12px 18px", fontSize: 12, color: "#444", whiteSpace: "nowrap" }}>
                            {fmtDate(a.createdAt as string)}
                          </td>
                          <td style={{ padding: "12px 18px" }}>
                            <Link href={`/admin/applications/${a.id}`} style={{
                              fontSize: 11, fontWeight: 600, color: C.muted, textDecoration: "none",
                              padding: "3px 8px", border: `1px solid ${C.border}`,
                              borderRadius: 6, display: "inline-block",
                            }}>
                              View →
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>

            {apps.length > APPS_PER_PAGE && (
              <div style={{ padding: "8px 0" }}>
                <Pager page={appsPage} total={apps.length} pageSize={APPS_PER_PAGE} onChange={setAppsPage} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Audit log ── */}
      {job.auditLog.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, marginTop: 20, padding: "18px 22px" }}>
          <SectionHeader title="Audit log" count={job.auditLog.length} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {job.auditLog.map(entry => (
              <div key={entry.id} style={{
                display: "flex", alignItems: "baseline", justifyContent: "space-between",
                padding: "7px 10px", background: "rgba(255,255,255,0.02)",
                border: `1px solid ${C.border}`, borderRadius: 8, gap: 12,
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.yellow, whiteSpace: "nowrap" }}>
                  {entry.action.replace(/_/g, " ")}
                </span>
                {entry.notes && (
                  <span style={{ fontSize: 12, color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.notes}
                  </span>
                )}
                <span style={{ fontSize: 11, color: "#444", whiteSpace: "nowrap" }}>
                  {fmtDate(entry.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {modal === "reject" && (
        <TextareaModal
          title="Reject job post"
          description={`"${job.title}" will be hidden and the employer will be notified with your reason.`}
          label="Rejection reason"
          placeholder="e.g. Misleading salary information, duplicate post, violates platform guidelines…"
          confirmLabel="Reject job"
          confirmColor="rgba(239,68,68,0.85)"
          minLength={10}
          onClose={() => setModal(null)}
          onConfirm={handleReject}
        />
      )}

      {modal === "request-changes" && (
        <TextareaModal
          title="Request changes"
          description={`The employer will be asked to revise "${job.title}" before it can be approved.`}
          label="Changes needed"
          placeholder="e.g. Please add specific salary figures, clarify visa requirements, improve the job description…"
          confirmLabel="Send request"
          confirmColor="rgba(245,158,11,0.85)"
          minLength={10}
          onClose={() => setModal(null)}
          onConfirm={handleRequestChanges}
        />
      )}

      {modal === "archive" && (
        <ConfirmModal
          title="Archive job post"
          body={`Archive "${job.title}"? It will be hidden from workers immediately. You can restore it later.`}
          confirmLabel="Archive"
          confirmColor="rgba(100,116,139,0.85)"
          onClose={() => setModal(null)}
          onConfirm={handleArchive}
        />
      )}

      {modal === "revoke" && (
        <ConfirmModal
          title="Revoke posting rights"
          body={`${job.employer.companyName ?? job.employer.email} will no longer be able to submit new job posts. Existing approved posts remain live.`}
          confirmLabel="Revoke rights"
          confirmColor="rgba(239,68,68,0.85)"
          onClose={() => setModal(null)}
          onConfirm={handleRevoke}
        />
      )}
    </div>
  );
}
