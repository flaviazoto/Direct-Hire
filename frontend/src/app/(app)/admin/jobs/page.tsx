"use client";
// frontend/src/app/(app)/admin/jobs/page.tsx
// Admin — all job posts management (all statuses, all employers).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api-client";
import { Button, Spinner, ToastDisplay, type ToastData, ErrorState } from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────────

type JobStatus = "DRAFT" | "PENDING_MODERATION" | "APPROVED" | "REJECTED" | "ARCHIVED";

interface JobRow {
  id:               string;
  title:            string;
  company_name:     string;
  country:          string;
  category:         string;
  status:           JobStatus;
  moderation_notes: string | null;
  created_at:       string;
  approved_at:      string | null;
  rejected_at:      string | null;
  employer: {
    id:         string;
    email:      string;
    first_name: string | null;
    last_name:  string | null;
    company:    string | null;
  };
  // Enriched client-side after revoke action
  employer_revoked?: boolean;
}

interface JobCounts {
  pending_moderation: number;
  approved:           number;
  rejected:           number;
  archived:           number;
  total:              number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const C = {
  bg:     "#0A0A0A",
  card:   "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.07)",
  text:   "#ffffff",
  muted:  "#a1a1aa",
  faint:  "#444444",
  amber:  "#f59e0b",
  teal:   "#14b8a6",
  red:    "#ef4444",
  blue:   "#0090FF",
  green:  "#22c55e",
};

type TabKey = "ALL" | "APPROVED" | "PENDING_MODERATION" | "REJECTED" | "ARCHIVED";

const TABS: { key: TabKey; label: string; statusFilter: string }[] = [
  { key: "ALL",               label: "All",     statusFilter: "" },
  { key: "APPROVED",          label: "Live",    statusFilter: "APPROVED" },
  { key: "PENDING_MODERATION",label: "Pending", statusFilter: "PENDING_MODERATION" },
  { key: "REJECTED",          label: "Rejected",statusFilter: "REJECTED" },
  { key: "ARCHIVED",          label: "Archived",statusFilter: "ARCHIVED" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function employerName(e: JobRow["employer"]): string {
  const n = [e.first_name, e.last_name].filter(Boolean).join(" ");
  return n || e.company || e.email;
}

// ── Status chip ────────────────────────────────────────────────────────────────

const STATUS_CHIP: Record<JobStatus, { label: string; color: string; bg: string; border: string }> = {
  PENDING_MODERATION: { label: "Pending",  color: "#fbbf24", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)" },
  APPROVED:           { label: "Live",     color: "#4ade80", bg: "rgba(34,197,94,0.10)",  border: "rgba(34,197,94,0.3)"  },
  REJECTED:           { label: "Rejected", color: "#f87171", bg: "rgba(239,68,68,0.10)",  border: "rgba(239,68,68,0.3)"  },
  ARCHIVED:           { label: "Archived", color: "#94a3b8", bg: "rgba(100,116,139,0.10)",border: "rgba(100,116,139,0.3)"},
  DRAFT:              { label: "Draft",    color: "#94a3b8", bg: "rgba(100,116,139,0.10)",border: "rgba(100,116,139,0.3)"},
};

function StatusChip({ status }: { status: JobStatus }) {
  const s = STATUS_CHIP[status] ?? STATUS_CHIP.DRAFT;
  return (
    <span style={{
      display:      "inline-flex",
      alignItems:   "center",
      gap:          5,
      padding:      "3px 9px",
      borderRadius: 99,
      fontSize:     11,
      fontWeight:   700,
      color:        s.color,
      background:   s.bg,
      border:       `1px solid ${s.border}`,
      whiteSpace:   "nowrap",
    }}>
      {status === "APPROVED" && (
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
      )}
      {s.label}
    </span>
  );
}

// ── Skeleton row ───────────────────────────────────────────────────────────────

function SkeletonRow() {
  const shimmer: React.CSSProperties = {
    background: "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.07) 50%,rgba(255,255,255,0.04) 75%)",
    backgroundSize: "400% 100%",
    animation: "shimmer 1.5s infinite",
    borderRadius: 5,
  };
  return (
    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
      {[180, 140, 90, 80, 80, 60, 110].map((w, i) => (
        <td key={i} style={{ padding: "13px 16px" }}>
          <div style={{ ...shimmer, height: 13, width: w }} />
          {i <= 1 && <div style={{ ...shimmer, height: 10, width: w * 0.6, marginTop: 5 }} />}
        </td>
      ))}
    </tr>
  );
}

// ── Revoke modal ───────────────────────────────────────────────────────────────

function RevokeModal({
  job,
  onClose,
  onConfirm,
}: {
  job:       JobRow;
  onClose:   () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason,  setReason]  = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const MIN = 10;

  const submit = async () => {
    if (reason.trim().length < MIN) { setError(`At least ${MIN} characters required`); return; }
    setLoading(true);
    try { await onConfirm(reason.trim()); }
    catch (e) { setError((e as Error).message); setLoading(false); }
  };

  return (
    <>
      <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(6px)",zIndex:200 }} />
      <div style={{
        position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
        zIndex:201,width:480,maxWidth:"calc(100vw - 32px)",
        background:"#141414",border:`1px solid ${C.border}`,borderRadius:16,
        padding:28,boxShadow:"0 24px 80px rgba(0,0,0,0.6)",
      }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18 }}>
          <div>
            <h3 style={{ fontSize:17,fontWeight:700,color:C.text,margin:"0 0 4px" }}>
              Revoke posting rights
            </h3>
            <p style={{ fontSize:13,color:C.faint,margin:0 }}>
              {employerName(job.employer)} ({job.employer.email})
            </p>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",cursor:"pointer",color:C.faint,fontSize:18,padding:4 }}>✕</button>
        </div>

        {/* Warning */}
        <div style={{
          background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",
          borderRadius:10,padding:"10px 14px",marginBottom:16,
          fontSize:12,color:"#fca5a5",lineHeight:1.6,
        }}>
          This employer will no longer be able to submit new job posts. Existing approved posts remain live.
        </div>

        {/* Reason */}
        <label style={{ fontSize:12,fontWeight:600,color:C.muted,display:"block",marginBottom:6 }}>
          Reason <span style={{ color:C.red }}>*</span>
        </label>
        <textarea
          value={reason}
          onChange={e => { setReason(e.target.value); setError(""); }}
          placeholder="e.g. Multiple policy violations, misleading job posts..."
          rows={3}
          style={{
            width:"100%",background:"rgba(255,255,255,0.04)",border:`1px solid ${error ? C.red : C.border}`,
            borderRadius:10,padding:"11px 14px",fontSize:13,color:C.text,resize:"vertical",
            outline:"none",fontFamily:"inherit",boxSizing:"border-box",
          }}
        />
        {error && <p style={{ fontSize:12,color:C.red,marginTop:4 }}>{error}</p>}

        <div style={{ display:"flex",gap:10,justifyContent:"flex-end",marginTop:18 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            size="sm" loading={loading}
            disabled={reason.trim().length < MIN || loading}
            onClick={submit}
            style={{ background:"rgba(239,68,68,0.85)",color:"#fff",border:"none" }}
          >
            Revoke rights
          </Button>
        </div>
      </div>
    </>
  );
}

// ── Confirm modal (generic) ────────────────────────────────────────────────────

function ConfirmModal({
  title, body, confirmLabel, confirmStyle, onClose, onConfirm,
}: {
  title:        string;
  body:         string;
  confirmLabel: string;
  confirmStyle?: React.CSSProperties;
  onClose:      () => void;
  onConfirm:    () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const run = async () => { setLoading(true); await onConfirm(); setLoading(false); };

  return (
    <>
      <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(6px)",zIndex:200 }} />
      <div style={{
        position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
        zIndex:201,width:420,maxWidth:"calc(100vw - 32px)",
        background:"#141414",border:`1px solid ${C.border}`,borderRadius:16,
        padding:28,boxShadow:"0 24px 80px rgba(0,0,0,0.6)",
      }}>
        <h3 style={{ fontSize:16,fontWeight:700,color:C.text,margin:"0 0 10px" }}>{title}</h3>
        <p style={{ fontSize:13,color:C.muted,marginBottom:20,lineHeight:1.6 }}>{body}</p>
        <div style={{ display:"flex",gap:10,justifyContent:"flex-end" }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={run} style={confirmStyle}>{confirmLabel}</Button>
        </div>
      </div>
    </>
  );
}

// ── Tab button ─────────────────────────────────────────────────────────────────

function Tab({
  label, count, active, onClick,
}: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display:     "inline-flex",
        alignItems:  "center",
        gap:         7,
        padding:     "8px 16px",
        borderRadius: 9,
        border:      "none",
        cursor:      "pointer",
        fontSize:    13,
        fontWeight:  active ? 700 : 500,
        background:  active ? "rgba(255,255,255,0.07)" : "transparent",
        color:       active ? C.text : C.faint,
        transition:  "all 0.15s",
      }}
    >
      {label}
      {count != null && (
        <span style={{
          fontSize:     11,
          fontWeight:   700,
          background:   active ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)",
          color:        active ? C.text : C.faint,
          borderRadius: 99,
          padding:      "1px 7px",
          lineHeight:   "16px",
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Pagination controls ────────────────────────────────────────────────────────

function Pager({
  page, total, pageSize, onChange,
}: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;

  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= page - 1 && i <= page + 1)) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }

  const btn = (label: React.ReactNode, target: number, disabled: boolean) => (
    <button
      key={String(label)}
      onClick={() => !disabled && onChange(target)}
      disabled={disabled}
      style={{
        minWidth:     32,
        height:       32,
        padding:      "0 8px",
        borderRadius: 8,
        border:       `1px solid ${C.border}`,
        background:   "transparent",
        color:        disabled ? C.faint : C.muted,
        fontSize:     12,
        cursor:       disabled ? "default" : "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display:"flex",alignItems:"center",gap:4,justifyContent:"center",marginTop:24 }}>
      {btn("‹", page - 1, page === 1)}
      {nums.map((n, i) =>
        n === "…"
          ? <span key={`e${i}`} style={{ color:C.faint,fontSize:12,padding:"0 4px" }}>…</span>
          : (
            <button
              key={n}
              onClick={() => onChange(n)}
              style={{
                minWidth:  32, height: 32,
                padding:   "0 8px",
                borderRadius: 8,
                border:    `1px solid ${n === page ? "rgba(255,255,255,0.2)" : C.border}`,
                background: n === page ? "rgba(255,255,255,0.08)" : "transparent",
                color:     n === page ? C.text : C.muted,
                fontSize:  12,
                cursor:    n === page ? "default" : "pointer",
                fontWeight: n === page ? 700 : 400,
              }}
            >
              {n}
            </button>
          )
      )}
      {btn("›", page + 1, page === pages)}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminAllJobsPage() {
  const [tab,      setTab]      = useState<TabKey>("ALL");
  const [jobs,     setJobs]     = useState<JobRow[]>([]);
  const [total,    setTotal]    = useState(0);
  const [counts,   setCounts]   = useState<JobCounts | null>(null);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [search,   setSearch]   = useState("");
  const [country,  setCountry]  = useState("");
  const [category, setCategory] = useState("");
  const [employer, setEmployer] = useState("");

  // Derived select options
  const [countries,  setCountries]  = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  // Row-level action loading
  const [actionId, setActionId] = useState<string | null>(null);

  // Modals
  const [revokeJob, setRevokeJob]         = useState<JobRow | null>(null);
  const [archiveJob, setArchiveJob]       = useState<JobRow | null>(null);
  const [restoreJob, setRestoreJob]       = useState<JobRow | null>(null);

  // Toast
  const [toast, setToast] = useState<ToastData>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchCounts = useCallback(async () => {
    const res = await adminApi.getJobCounts() as any;
    if (res.success && res.data) setCounts(res.data as JobCounts);
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = { page: String(page), limit: "20" };
    const statusFilter = TABS.find(t => t.key === tab)?.statusFilter ?? "";
    if (statusFilter)     params.status      = statusFilter;
    if (search.trim())    params.search      = search.trim();
    if (country)          params.country     = country;
    if (category)         params.category    = category;
    if (employer.trim())  params.employer_id = employer.trim(); // treated as search hint

    const res = await adminApi.getJobs(params) as any;
    setLoading(false);
    if (!res.success) { setError(res.error ?? "Could not load jobs."); return; }
    const rows: JobRow[] = res.data ?? [];
    setJobs(rows);
    setTotal(res.total ?? 0);

    // Populate selects from first full load
    if (!statusFilter && !search && !country && !category) {
      const cts  = [...new Set(rows.map((j: JobRow) => j.country).filter(Boolean))].sort() as string[];
      const cats = [...new Set(rows.map((j: JobRow) => j.category).filter(Boolean))].sort() as string[];
      if (cts.length)  setCountries(cts);
      if (cats.length) setCategories(cats);
    }
  }, [tab, page, search, country, category, employer]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchJobs(); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchJobs]);

  // Escape key
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setRevokeJob(null); setArchiveJob(null); setRestoreJob(null);
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleApprove = async (job: JobRow) => {
    setActionId(job.id);
    const res = await adminApi.approveJob(job.id) as any;
    setActionId(null);
    if (!res.success) { showToast(res.error ?? "Approval failed", "err"); return; }
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: "APPROVED" } : j));
    fetchCounts();
    showToast("Job approved and now live", "ok");
  };

  const handleReject = async (job: JobRow) => {
    setActionId(job.id);
    const res = await adminApi.rejectJob(job.id, "Rejected by admin") as any;
    setActionId(null);
    if (!res.success) { showToast(res.error ?? "Rejection failed", "err"); return; }
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: "REJECTED" } : j));
    fetchCounts();
    showToast("Job rejected — employer notified", "ok");
  };

  const handleArchiveConfirm = async () => {
    if (!archiveJob) return;
    setActionId(archiveJob.id);
    const res = await adminApi.archiveJobAdmin(archiveJob.id) as any;
    setArchiveJob(null);
    setActionId(null);
    if (!res.success) { showToast(res.error ?? "Archive failed", "err"); return; }
    setJobs(prev => prev.map(j => j.id === archiveJob.id ? { ...j, status: "ARCHIVED" } : j));
    fetchCounts();
    showToast("Job archived", "ok");
  };

  const handleRestoreConfirm = async () => {
    if (!restoreJob) return;
    setActionId(restoreJob.id);
    const res = await adminApi.restoreJob(restoreJob.id) as any;
    setRestoreJob(null);
    setActionId(null);
    if (!res.success) { showToast(res.error ?? "Restore failed", "err"); return; }
    setJobs(prev => prev.map(j => j.id === restoreJob.id ? { ...j, status: "APPROVED" } : j));
    fetchCounts();
    showToast("Job restored to live", "ok");
  };

  const handleRevokeConfirm = async (reason: string) => {
    if (!revokeJob) return;
    const res = await adminApi.revokePostingRights(revokeJob.employer.id, reason) as any;
    if (!res.success) throw new Error(res.error ?? "Revoke failed");
    // Mark all rows for this employer as revoked
    setJobs(prev => prev.map(j =>
      j.employer.id === revokeJob.employer.id ? { ...j, employer_revoked: true } : j
    ));
    setRevokeJob(null);
    showToast(`Posting rights revoked for ${employerName(revokeJob.employer)}`, "ok");
  };

  // ── Tab count helper ───────────────────────────────────────────────────────

  const tabCount = (key: TabKey): number | undefined => {
    if (!counts) return undefined;
    switch (key) {
      case "APPROVED":           return counts.approved;
      case "PENDING_MODERATION": return counts.pending_moderation;
      case "REJECTED":           return counts.rejected;
      case "ARCHIVED":           return counts.archived;
      case "ALL":                return counts.total;
    }
  };

  // ── Table styles ───────────────────────────────────────────────────────────

  const TH: React.CSSProperties = {
    padding:       "11px 16px",
    textAlign:     "left",
    fontSize:      11,
    fontWeight:    700,
    color:         C.faint,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace:    "nowrap",
    background:    "rgba(255,255,255,0.02)",
    borderBottom:  `1px solid ${C.border}`,
  };

  const TD: React.CSSProperties = {
    padding:       "12px 16px",
    verticalAlign: "middle",
    borderBottom:  `1px solid ${C.border}`,
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "32px 32px 60px", maxWidth: 1340, margin: "0 auto" }}>
      <ToastDisplay toast={toast} />
      <style>{`@keyframes shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}`}</style>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:6 }}>
          <h1 style={{ fontSize:24,fontWeight:800,color:C.text,margin:0 }}>All job posts</h1>
          {counts && (
            <span style={{
              background:   "rgba(255,255,255,0.06)",
              color:        C.muted,
              borderRadius: 99,
              fontSize:     13,
              fontWeight:   600,
              padding:      "3px 12px",
              border:       `1px solid ${C.border}`,
            }}>
              {counts.total.toLocaleString()} total
            </span>
          )}
        </div>
        <p style={{ fontSize:14,color:C.faint,margin:0 }}>
          Manage all employer job posts across the platform
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display:      "flex",
        gap:          4,
        marginBottom: 20,
        background:   C.card,
        border:       `1px solid ${C.border}`,
        borderRadius: 12,
        padding:      "6px",
        width:        "fit-content",
      }}>
        {TABS.map(t => (
          <Tab
            key={t.key}
            label={t.label}
            count={tabCount(t.key)}
            active={tab === t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
          />
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display:"flex",flexWrap:"wrap",gap:10,marginBottom:20,alignItems:"center" }}>

        {/* Search */}
        <div style={{ position:"relative" }}>
          <svg style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:C.faint,pointerEvents:"none" }}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search title or company…"
            style={{
              paddingLeft:  36, paddingRight: 14, height: 36,
              border:       `1px solid ${C.border}`, borderRadius: 9,
              background:   C.card, color: C.text, fontSize: 13, outline: "none", width: 220,
            }}
          />
        </div>

        {/* Country */}
        <select value={country} onChange={e => { setCountry(e.target.value); setPage(1); }}
          style={{ height:36,padding:"0 12px",border:`1px solid ${C.border}`,borderRadius:9,background:C.card,color:country?C.text:C.faint,fontSize:13,outline:"none",minWidth:140 }}>
          <option value="">All countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Category */}
        <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}
          style={{ height:36,padding:"0 12px",border:`1px solid ${C.border}`,borderRadius:9,background:C.card,color:category?C.text:C.faint,fontSize:13,outline:"none",minWidth:150 }}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Employer search */}
        <input
          value={employer}
          onChange={e => { setEmployer(e.target.value); setPage(1); }}
          placeholder="Employer ID…"
          style={{ height:36,padding:"0 14px",border:`1px solid ${C.border}`,borderRadius:9,background:C.card,color:C.text,fontSize:13,outline:"none",width:170 }}
        />

        {/* Clear */}
        {(search || country || category || employer) && (
          <button
            onClick={() => { setSearch(""); setCountry(""); setCategory(""); setEmployer(""); setPage(1); }}
            style={{ height:36,padding:"0 14px",border:`1px solid ${C.border}`,borderRadius:9,background:"transparent",color:C.muted,fontSize:13,cursor:"pointer" }}
          >
            Clear
          </button>
        )}

        <div style={{ marginLeft:"auto",fontSize:13,color:C.faint }}>
          {!loading && `${total.toLocaleString()} results`}
        </div>
      </div>

      {/* Table */}
      <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead>
              <tr>
                {["Job title","Employer","Country","Status","Posted","Apps","Actions"].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : error
                ? (
                  <tr><td colSpan={7} style={{ padding: 24 }}>
                    <ErrorState message={error} retry={fetchJobs} title="Could not load jobs" />
                  </td></tr>
                )
                : jobs.length === 0
                ? (
                  <tr><td colSpan={7}>
                    <div style={{ textAlign:"center",padding:"72px 24px" }}>
                      <div style={{ fontSize:36,marginBottom:12 }}>📋</div>
                      <p style={{ fontSize:15,fontWeight:700,color:C.text,margin:"0 0 6px" }}>No jobs found</p>
                      <p style={{ fontSize:13,color:C.faint,margin:0 }}>Try adjusting your filters</p>
                    </div>
                  </td></tr>
                )
                : jobs.map(job => {
                  const busy = actionId === job.id;
                  const revoked = job.employer_revoked;

                  return (
                    <tr key={job.id}
                      style={{ borderBottom:`1px solid ${C.border}` }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >

                      {/* Job title */}
                      <td style={TD}>
                        <div style={{ fontSize:13,fontWeight:700,color:C.text,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                          {job.title}
                        </div>
                        <div style={{ fontSize:11,color:C.faint,marginTop:2 }}>{job.category}</div>
                      </td>

                      {/* Employer */}
                      <td style={TD}>
                        <div style={{ fontSize:13,color:C.muted,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                          {employerName(job.employer)}
                        </div>
                        <div style={{ display:"flex",alignItems:"center",gap:6,marginTop:3,flexWrap:"wrap" }}>
                          <span style={{ fontSize:11,color:C.faint }}>{job.employer.email}</span>
                          {revoked && (
                            <span style={{
                              fontSize:10,fontWeight:700,
                              background:"rgba(239,68,68,0.12)",color:"#f87171",
                              border:"1px solid rgba(239,68,68,0.25)",
                              borderRadius:99,padding:"1px 6px",whiteSpace:"nowrap",
                            }}>
                              Posting revoked
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Country */}
                      <td style={{ ...TD,fontSize:13,color:C.muted }}>{job.country}</td>

                      {/* Status */}
                      <td style={TD}><StatusChip status={job.status} /></td>

                      {/* Posted */}
                      <td style={{ ...TD,fontSize:12,color:C.faint,whiteSpace:"nowrap" }}>
                        {fmtDate(job.created_at)}
                      </td>

                      {/* Apps placeholder */}
                      <td style={{ ...TD,fontSize:13,color:C.muted }}>—</td>

                      {/* Actions */}
                      <td style={TD}>
                        <div style={{ display:"flex",alignItems:"center",gap:5,flexWrap:"nowrap" }}>

                          {/* View / Preview link */}
                          <Link
                            href={
                              job.status === "PENDING_MODERATION"
                                ? `/admin/jobs/pending`
                                : `/admin/jobs/${job.id}/detail`
                            }
                            style={{
                              height:36,padding:"0 10px",display:"inline-flex",alignItems:"center",
                              borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",
                              color:C.muted,fontSize:11,fontWeight:600,textDecoration:"none",whiteSpace:"nowrap",
                            }}
                          >
                            {job.status === "PENDING_MODERATION" ? "Preview" : "View"}
                          </Link>

                          {/* Status-conditional actions */}
                          {job.status === "PENDING_MODERATION" && (
                            <>
                              <ActionBtn
                                label="Approve" color={C.teal} bg="rgba(0,144,255,0.12)"
                                loading={busy} disabled={actionId !== null}
                                onClick={() => handleApprove(job)}
                              />
                              <ActionBtn
                                label="Reject" color="#f87171" bg="rgba(239,68,68,0.10)"
                                border="rgba(239,68,68,0.25)"
                                loading={busy} disabled={actionId !== null}
                                onClick={() => handleReject(job)}
                              />
                            </>
                          )}

                          {job.status === "APPROVED" && (
                            <>
                              <ActionBtn
                                label="Archive" color={C.muted} bg="rgba(255,255,255,0.05)"
                                disabled={actionId !== null}
                                onClick={() => setArchiveJob(job)}
                              />
                              {!revoked && (
                                <ActionBtn
                                  label="Revoke posting" color="#f87171" bg="rgba(239,68,68,0.08)"
                                  border="rgba(239,68,68,0.2)"
                                  disabled={actionId !== null}
                                  onClick={() => setRevokeJob(job)}
                                />
                              )}
                            </>
                          )}

                          {job.status === "DRAFT" && (
                            <ActionBtn
                              label="Archive" color={C.muted} bg="rgba(255,255,255,0.05)"
                              disabled={actionId !== null}
                              onClick={() => setArchiveJob(job)}
                            />
                          )}

                          {job.status === "ARCHIVED" && (
                            <ActionBtn
                              label="Restore" color={C.teal} bg="rgba(0,144,255,0.10)"
                              border="rgba(0,144,255,0.25)"
                              disabled={actionId !== null}
                              onClick={() => setRestoreJob(job)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {!loading && (
        <Pager page={page} total={total} pageSize={20} onChange={p => { setPage(p); window.scrollTo(0, 0); }} />
      )}

      {/* Modals */}
      {revokeJob && (
        <RevokeModal job={revokeJob} onClose={() => setRevokeJob(null)} onConfirm={handleRevokeConfirm} />
      )}
      {archiveJob && (
        <ConfirmModal
          title="Archive job post"
          body={`Archive "${archiveJob.title}"? It will be hidden from workers immediately.`}
          confirmLabel="Archive"
          confirmStyle={{ background: "rgba(100,116,139,0.8)", color: "#fff", border: "none" }}
          onClose={() => setArchiveJob(null)}
          onConfirm={handleArchiveConfirm}
        />
      )}
      {restoreJob && (
        <ConfirmModal
          title="Restore job post"
          body={`Set "${restoreJob.title}" back to Live? Workers will be able to see and apply.`}
          confirmLabel="Restore to live"
          confirmStyle={{ background: "linear-gradient(135deg,#14b8a6,#0d9488)", color: "#fff", border: "none" }}
          onClose={() => setRestoreJob(null)}
          onConfirm={handleRestoreConfirm}
        />
      )}
    </div>
  );
}

// ── Small inline action button ─────────────────────────────────────────────────

function ActionBtn({
  label, color, bg, border, loading, disabled, onClick,
}: {
  label:    string;
  color:    string;
  bg:       string;
  border?:  string;
  loading?: boolean;
  disabled?:boolean;
  onClick:  () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        height:     28,
        padding:    "0 10px",
        borderRadius: 7,
        border:     `1px solid ${border ?? "transparent"}`,
        background: bg,
        color,
        fontSize:   11,
        fontWeight: 700,
        cursor:     disabled ? "default" : "pointer",
        display:    "inline-flex",
        alignItems: "center",
        gap:        4,
        whiteSpace: "nowrap",
        opacity:    disabled && !loading ? 0.45 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {loading ? <Spinner size="xs" color="white" /> : label}
    </button>
  );
}
