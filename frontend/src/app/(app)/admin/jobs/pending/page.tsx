"use client";
// frontend/src/app/(app)/admin/jobs/pending/page.tsx
// Admin job moderation queue — PENDING_MODERATION jobs only.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api-client";
import {
  Button, Spinner, Textarea, ToastDisplay, type ToastData,
} from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingEmployer {
  id:                   string;
  email:                string;
  firstName:            string | null;
  lastName:             string | null;
  companyName:          string | null;
  accountStatus:        string;
  postingRightsRevoked: boolean;
}

interface PendingJob {
  id:                string;
  title:             string;
  companyName:       string;
  country:           string;
  city:              string;
  category:          string;
  contractType:      string;
  salaryMin:         string | number;
  salaryMax:         string | number;
  salaryCurrency:    string;
  requiredSkills:    string[];
  languagesRequired: string[];
  visaSupport:       boolean;
  accommodation:     boolean;
  description:       string;
  requirements:      string;
  benefits:          string | null;
  applicationDeadline: string | null;
  createdAt:         string;
  resubmittedAt:     string | null;
  employer:          PendingEmployer;
}

interface HistoryEntry {
  action:    string;
  admin_id:  string;
  notes?:    string;
  timestamp: string;
}

interface JobDetail extends PendingJob {
  experienceRequired: number;
  remoteAllowed:      boolean;
  positionsAvailable: number;
  moderationHistory:  HistoryEntry[];
  employer: PendingEmployer & {
    name?:             string;
    totalJobsPosted:   number;
    totalJobsApproved: number;
    totalJobsRejected: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysWaiting(submitted: string): number {
  return Math.floor((Date.now() - new Date(submitted).getTime()) / 86_400_000);
}

function fmtDate(d: string): string {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    ", " + dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function fmtSalary(min: string | number, max: string | number, currency: string): string {
  const fmt = (n: string | number) =>
    Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `${currency} ${fmt(min)} – ${fmt(max)}`;
}

function actionColor(action: string): { bg: string; color: string; label: string } {
  switch (action) {
    case "APPROVED":          return { bg: "rgba(0,144,255,0.15)", color: "#2dd4bf", label: "Approved" };
    case "REJECTED":          return { bg: "rgba(239,68,68,0.15)",  color: "#f87171", label: "Rejected" };
    case "CHANGES_REQUESTED": return { bg: "rgba(245,158,11,0.15)", color: "#fbbf24", label: "Changes requested" };
    case "ARCHIVED":          return { bg: "rgba(100,116,139,0.15)", color: "#94a3b8", label: "Archived" };
    default:                  return { bg: "rgba(255,255,255,0.05)", color: "#a1a1aa", label: action };
  }
}

// ── Inline styled primitives ──────────────────────────────────────────────────

const C = {
  bg:       "#0A0A0A",
  card:     "rgba(255,255,255,0.03)",
  border:   "rgba(255,255,255,0.07)",
  text:     "#ffffff",
  muted:    "#a1a1aa",
  faint:    "#555555",
  amber:    "#f59e0b",
  teal:     "#14b8a6",
  red:      "#ef4444",
  blue:     "#0090FF",
};

function Chip({ children, color = C.blue, bg }: {
  children: React.ReactNode;
  color?: string;
  bg?: string;
}) {
  return (
    <span style={{
      display:      "inline-flex",
      alignItems:   "center",
      padding:      "2px 9px",
      borderRadius: 99,
      fontSize:     11,
      fontWeight:   600,
      background:   bg ?? `${color}18`,
      color,
      border:       `1px solid ${color}30`,
    }}>
      {children}
    </span>
  );
}

function InfoBadge({ label, value, valueColor }: { label: string; value: string | number; valueColor?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: valueColor ?? C.text }}>
        {value}
      </span>
    </div>
  );
}

// ── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  const shimmer: React.CSSProperties = {
    background: "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 75%)",
    backgroundSize: "400% 100%",
    animation: "shimmer 1.5s infinite",
    borderRadius: 6,
  };
  return (
    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
      {[160, 130, 90, 90, 110, 80, 60, 130].map((w, i) => (
        <td key={i} style={{ padding: "14px 16px" }}>
          <div style={{ ...shimmer, height: 13, width: w }} />
          {i === 0 && <div style={{ ...shimmer, height: 11, width: 80, marginTop: 6 }} />}
        </td>
      ))}
    </tr>
  );
}

// ── Action modal ──────────────────────────────────────────────────────────────

function ActionModal({
  type,
  jobTitle,
  onClose,
  onSubmit,
}: {
  type:      "reject" | "changes";
  jobTitle:  string;
  onClose:   () => void;
  onSubmit:  (text: string) => Promise<void>;
}) {
  const [text, setText]       = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const isReject = type === "reject";
  const MIN = 20;

  const handleSubmit = async () => {
    if (text.trim().length < MIN) {
      setError(`Must be at least ${MIN} characters`);
      return;
    }
    setLoading(true);
    await onSubmit(text.trim());
    setLoading(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(6px)",
          zIndex: 200,
        }}
      />
      {/* Modal */}
      <div style={{
        position:  "fixed",
        top:       "50%",
        left:      "50%",
        transform: "translate(-50%,-50%)",
        zIndex:    201,
        width:     500,
        maxWidth:  "calc(100vw - 32px)",
        background: "#141414",
        border:    `1px solid ${C.border}`,
        borderRadius: 16,
        padding:   28,
        boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: 0 }}>
              {isReject ? "Reject job post" : "Request changes"}
            </h3>
            <p style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>
              &ldquo;{jobTitle}&rdquo;
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.faint, fontSize: 18, lineHeight: 1, padding: 4 }}
          >
            ✕
          </button>
        </div>

        {/* Textarea */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 8 }}>
            {isReject ? "Reason for rejection" : "Specific changes needed"}
            <span style={{ color: C.red }}> *</span>
          </label>
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setError(""); }}
            placeholder={
              isReject
                ? "e.g. Salary range not specified, misleading job title..."
                : "e.g. Please add a clearer job description, minimum 150 words..."
            }
            rows={5}
            style={{
              width:        "100%",
              background:   "rgba(255,255,255,0.04)",
              border:       `1px solid ${error ? C.red : C.border}`,
              borderRadius: 10,
              padding:      "12px 14px",
              fontSize:     14,
              color:        C.text,
              resize:       "vertical",
              outline:      "none",
              fontFamily:   "'Plus Jakarta Sans', system-ui, sans-serif",
              boxSizing:    "border-box",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            {error
              ? <span style={{ fontSize: 12, color: C.red }}>{error}</span>
              : <span />
            }
            <span style={{ fontSize: 11, color: text.length < MIN ? C.faint : C.teal }}>
              {text.length} / min {MIN}
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={isReject ? "danger" : "primary"}
            size="sm"
            disabled={text.trim().length < MIN || loading}
            loading={loading}
            onClick={handleSubmit}
            style={
              isReject
                ? { background: "rgba(239,68,68,0.85)", color: "#fff", border: "none" }
                : { background: "linear-gradient(135deg,#0090FF,#0070cc)" }
            }
          >
            {isReject ? "Reject post" : "Send request"}
          </Button>
        </div>
      </div>
    </>
  );
}

// ── Job detail drawer ─────────────────────────────────────────────────────────

function JobDrawer({
  job,
  detail,
  loading,
  onClose,
  onApprove,
  onReject,
  onChanges,
  approving,
}: {
  job:       PendingJob;
  detail:    JobDetail | null;
  loading:   boolean;
  onClose:   () => void;
  onApprove: (id: string) => void;
  onReject:  (id: string, title: string) => void;
  onChanges: (id: string, title: string) => void;
  approving: string | null;
}) {
  const [employerOpen, setEmployerOpen] = useState(true);
  const d = detail;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
          zIndex: 150,
        }}
      />
      {/* Panel */}
      <div style={{
        position:  "fixed",
        top:       0,
        right:     0,
        bottom:    0,
        width:     620,
        maxWidth:  "100vw",
        zIndex:    151,
        background: "#111111",
        borderLeft: `1px solid ${C.border}`,
        display:   "flex",
        flexDirection: "column",
        boxShadow: "-24px 0 80px rgba(0,0,0,0.5)",
      }}>

        {/* Drawer header */}
        <div style={{
          padding:      "20px 24px 18px",
          borderBottom: `1px solid ${C.border}`,
          flexShrink:   0,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                <Chip color={C.amber} bg="rgba(245,158,11,0.12)">PENDING REVIEW</Chip>
                {job.resubmittedAt && (
                  <Chip color={C.blue} bg="rgba(0,144,255,0.12)">RESUBMITTED</Chip>
                )}
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: "0 0 2px" }}>
                {job.title}
              </h2>
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
                {job.companyName}
                {job.employer.firstName && ` · ${job.employer.firstName}${job.employer.lastName ? " " + job.employer.lastName : ""}`}
              </p>
              <p style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>
                Submitted {fmtDate(job.createdAt)}
                {job.resubmittedAt && ` · Resubmitted ${fmtDate(job.resubmittedAt)}`}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", color: C.faint, fontSize: 20, padding: 4, flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

          {loading && (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 60 }}>
              <Spinner size="lg" color="amber" />
            </div>
          )}

          {!loading && d && (
            <>
              {/* Employer card */}
              <div style={{
                background:   C.card,
                border:       `1px solid ${C.border}`,
                borderRadius: 12,
                marginBottom: 20,
                overflow:     "hidden",
              }}>
                <button
                  onClick={() => setEmployerOpen(o => !o)}
                  style={{
                    width:      "100%",
                    display:    "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding:    "14px 16px",
                    background: "none",
                    border:     "none",
                    cursor:     "pointer",
                    color:      C.text,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Employer info</span>
                  <span style={{ color: C.faint, fontSize: 16, transition: "transform 0.2s", transform: employerOpen ? "rotate(180deg)" : "none" }}>
                    ▾
                  </span>
                </button>
                {employerOpen && (
                  <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.border}` }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px", marginTop: 14 }}>
                      <InfoBadge label="Contact" value={d.employer.name ?? d.employer.email} />
                      <InfoBadge label="Email" value={d.employer.email} />
                      <InfoBadge label="Account status" value={d.employer.accountStatus} />
                      <InfoBadge
                        label="Posting rights"
                        value={d.employer.postingRightsRevoked ? "Revoked" : "Active"}
                        valueColor={d.employer.postingRightsRevoked ? C.red : C.teal}
                      />
                      <InfoBadge label="Jobs posted" value={d.employer.totalJobsPosted} />
                      <InfoBadge label="Approved / Rejected"
                        value={`${d.employer.totalJobsApproved} / ${d.employer.totalJobsRejected}`}
                      />
                    </div>
                    <Link
                      href={`/admin/users/${d.employer.id}`}
                      style={{ fontSize: 12, color: C.blue, display: "inline-block", marginTop: 12, textDecoration: "none" }}
                    >
                      View employer profile →
                    </Link>
                  </div>
                )}
              </div>

              {/* Job details grid */}
              <div style={{
                background:   C.card,
                border:       `1px solid ${C.border}`,
                borderRadius: 12,
                padding:      "16px",
                marginBottom: 20,
              }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 14px" }}>
                  Job details
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px", marginBottom: 14 }}>
                  <InfoBadge label="Location" value={`${d.city}, ${d.country}`} />
                  <InfoBadge label="Contract type" value={d.contractType.replace("_", " ")} />
                  <InfoBadge label="Salary" value={fmtSalary(d.salaryMin, d.salaryMax, d.salaryCurrency)} />
                  <InfoBadge label="Experience" value={`${d.experienceRequired}+ years`} />
                  <InfoBadge label="Positions" value={d.positionsAvailable} />
                  {d.applicationDeadline && (
                    <InfoBadge label="Deadline" value={fmtDate(d.applicationDeadline)} />
                  )}
                </div>

                {/* Badges */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                  {d.remoteAllowed && <Chip color={C.blue}>Remote OK</Chip>}
                  {d.visaSupport   && <Chip color="#7c3aed">Visa support</Chip>}
                  {d.accommodation && <Chip color="#0d9488">Accommodation</Chip>}
                </div>

                {/* Skills */}
                {d.requiredSkills.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                      Required skills
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {d.requiredSkills.map(s => (
                        <Chip key={s} color={C.muted} bg="rgba(255,255,255,0.05)">{s}</Chip>
                      ))}
                    </div>
                  </div>
                )}

                {/* Languages */}
                {d.languagesRequired.length > 0 && (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                      Languages
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {d.languagesRequired.map(l => (
                        <Chip key={l} color={C.muted} bg="rgba(255,255,255,0.05)">{l}</Chip>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              <Section title="Description">
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: C.muted, lineHeight: 1.7, fontFamily: "inherit", margin: 0 }}>
                  {d.description}
                </pre>
              </Section>

              {/* Requirements */}
              <Section title="Requirements">
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: C.muted, lineHeight: 1.7, fontFamily: "inherit", margin: 0 }}>
                  {d.requirements}
                </pre>
              </Section>

              {/* Benefits */}
              {d.benefits && (
                <Section title="Benefits">
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: C.muted, lineHeight: 1.7, fontFamily: "inherit", margin: 0 }}>
                    {d.benefits}
                  </pre>
                </Section>
              )}

              {/* Moderation history */}
              {Array.isArray(d.moderationHistory) && d.moderationHistory.length > 0 && (
                <Section title="Moderation history">
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(d.moderationHistory as HistoryEntry[]).map((entry, i) => {
                      const ac = actionColor(entry.action);
                      return (
                        <div key={i} style={{
                          display:      "flex",
                          flexDirection: "column",
                          gap:          6,
                          padding:      "12px 14px",
                          background:   ac.bg,
                          borderRadius: 10,
                          borderLeft:   `3px solid ${ac.color}`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: ac.color }}>
                              {ac.label}
                            </span>
                            <span style={{ fontSize: 11, color: C.faint }}>
                              {fmtDate(entry.timestamp)}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: C.faint }}>
                            Admin: {entry.admin_id.slice(0, 8)}…
                          </span>
                          {entry.notes && (
                            <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.6 }}>
                              {entry.notes}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>

        {/* Sticky action footer */}
        <div style={{
          flexShrink:   0,
          padding:      "16px 24px",
          borderTop:    `1px solid ${C.border}`,
          background:   "#111111",
          display:      "flex",
          gap:          10,
          alignItems:   "center",
        }}>
          <Button
            variant="teal"
            size="sm"
            loading={approving === job.id}
            disabled={approving !== null}
            onClick={() => onApprove(job.id)}
            style={{ flex: 1 }}
          >
            Approve
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={approving !== null}
            onClick={() => onChanges(job.id, job.title)}
            style={{ flex: 1 }}
          >
            Request changes
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={approving !== null}
            onClick={() => onReject(job.id, job.title)}
            style={{ flex: 1 }}
          >
            Reject
          </Button>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background:   C.card,
      border:       `1px solid ${C.border}`,
      borderRadius: 12,
      padding:      "16px",
      marginBottom: 16,
    }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminJobsPendingPage() {
  const [jobs,       setJobs]       = useState<PendingJob[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [country,    setCountry]    = useState("");
  const [category,   setCategory]   = useState("");
  const [countries,  setCountries]  = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  // Drawer
  const [drawerJob,    setDrawerJob]    = useState<PendingJob | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<JobDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Modal
  const [modal,   setModal]   = useState<{ type: "reject" | "changes"; jobId: string; title: string } | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<ToastData>(null);

  // Debounce ref for search
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load ─────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (search.trim()) params.search   = search.trim();
    if (country)       params.country  = country;
    if (category)      params.category = category;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await adminApi.getPendingJobs(params) as any;
    setLoading(false);
    if (!res.success) return;

    const data: PendingJob[] = res.data ?? [];
    setJobs(data);
    setTotal(res.total ?? 0);

    // Populate filter selects from first unfiltered load
    if (!search && !country && !category) {
      const cts = [...new Set(data.map(j => j.country).filter(Boolean))].sort() as string[];
      const cats = [...new Set(data.map(j => j.category).filter(Boolean))].sort() as string[];
      if (cts.length)  setCountries(cts);
      if (cats.length) setCategories(cats);
    }
  }, [search, country, category]);

  useEffect(() => { load(); }, [load]);

  // Search debounce is handled via useEffect — clear timer on unmount
  useEffect(() => {
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, []);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (modal) setModal(null);
      else if (drawerJob) closeDrawer();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [modal, drawerJob]);

  // ── Actions ───────────────────────────────────────────────────────

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const removeJob = (id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id));
    setTotal(prev => Math.max(0, prev - 1));
    if (drawerJob?.id === id) closeDrawer();
  };

  const openDrawer = async (job: PendingJob) => {
    setDrawerJob(job);
    setDrawerDetail(null);
    setDrawerLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await adminApi.getAdminJobDetail(job.id) as any;
    setDrawerLoading(false);
    if (res.success && res.data) setDrawerDetail(res.data as JobDetail);
  };

  const closeDrawer = () => {
    setDrawerJob(null);
    setDrawerDetail(null);
  };

  const handleApprove = async (jobId: string) => {
    setApproving(jobId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await adminApi.approveJob(jobId) as any;
    setApproving(null);
    if (!res.success) { showToast(res.error ?? "Approval failed", "err"); return; }
    removeJob(jobId);
    showToast("Job approved and now live", "ok");
  };

  const handleModalSubmit = async (text: string) => {
    if (!modal) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = (modal.type === "reject"
      ? await adminApi.rejectJob(modal.jobId, text)
      : await adminApi.requestJobChanges(modal.jobId, text)) as any;
    if (!res.success) throw new Error(res.error ?? "Action failed");
    removeJob(modal.jobId);
    setModal(null);
    showToast(
      modal.type === "reject"
        ? "Job rejected — employer notified"
        : "Change request sent to employer",
      "ok",
    );
  };

  // ── Column headers ────────────────────────────────────────────────

  const COLS = ["Job title", "Company", "Country", "Category", "Salary", "Submitted", "Waiting", "Actions"];

  const TH_STYLE: React.CSSProperties = {
    padding: "11px 16px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 700,
    color: C.faint,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
  };

  const TD: React.CSSProperties = {
    padding: "13px 16px",
    verticalAlign: "middle",
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "32px 32px 60px", maxWidth: 1300, margin: "0 auto" }}>
      <ToastDisplay toast={toast} />

      {/* shimmer keyframe */}
      <style>{`@keyframes shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }`}</style>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0 }}>
            Job moderation
          </h1>
          {total > 0 && (
            <span style={{
              background:   "rgba(245,158,11,0.15)",
              color:        C.amber,
              border:       "1px solid rgba(245,158,11,0.3)",
              borderRadius: 99,
              fontSize:     13,
              fontWeight:   700,
              padding:      "3px 12px",
            }}>
              {total} pending
            </span>
          )}
        </div>
        <p style={{ fontSize: 14, color: C.faint, margin: 0 }}>
          Review and approve employer job posts before they go live
        </p>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20, alignItems: "center" }}>

        {/* Search */}
        <div style={{ position: "relative" }}>
          <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.faint, pointerEvents: "none" }}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              if (searchRef.current) clearTimeout(searchRef.current);
              searchRef.current = setTimeout(() => {}, 0); // triggers useEffect via state
            }}
            placeholder="Search title or company…"
            style={{
              paddingLeft:  36,
              paddingRight: 14,
              height:       36,
              border:       `1px solid ${C.border}`,
              borderRadius: 9,
              background:   C.card,
              color:        C.text,
              fontSize:     13,
              outline:      "none",
              width:        230,
            }}
          />
        </div>

        {/* Country select */}
        <select
          value={country}
          onChange={e => setCountry(e.target.value)}
          style={{
            height:     36,
            padding:    "0 12px",
            border:     `1px solid ${C.border}`,
            borderRadius: 9,
            background: C.card,
            color:      country ? C.text : C.faint,
            fontSize:   13,
            outline:    "none",
            minWidth:   150,
          }}
        >
          <option value="">All countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Category select */}
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{
            height:     36,
            padding:    "0 12px",
            border:     `1px solid ${C.border}`,
            borderRadius: 9,
            background: C.card,
            color:      category ? C.text : C.faint,
            fontSize:   13,
            outline:    "none",
            minWidth:   160,
          }}
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {(search || country || category) && (
          <button
            onClick={() => { setSearch(""); setCountry(""); setCategory(""); }}
            style={{
              height:     36,
              padding:    "0 14px",
              border:     `1px solid ${C.border}`,
              borderRadius: 9,
              background: "transparent",
              color:      C.muted,
              fontSize:   13,
              cursor:     "pointer",
            }}
          >
            Clear
          </button>
        )}

        <div style={{ marginLeft: "auto", fontSize: 13, color: C.faint }}>
          {!loading && `${jobs.length} of ${total} jobs`}
        </div>
      </div>

      {/* Table card */}
      <div style={{
        background:   C.card,
        border:       `1px solid ${C.border}`,
        borderRadius: 14,
        overflow:     "hidden",
      }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
                {COLS.map(col => <th key={col} style={TH_STYLE}>{col}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                : jobs.length === 0
                ? (
                  <tr>
                    <td colSpan={8}>
                      <div style={{ textAlign: "center", padding: "72px 24px" }}>
                        <div style={{
                          width: 60, height: 60, borderRadius: "50%",
                          background: "rgba(0,144,255,0.12)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          margin: "0 auto 16px",
                          fontSize: 28,
                        }}>
                          ✓
                        </div>
                        <p style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: "0 0 6px" }}>
                          All caught up!
                        </p>
                        <p style={{ fontSize: 13, color: C.faint, margin: 0 }}>
                          No jobs pending review.
                        </p>
                      </div>
                    </td>
                  </tr>
                )
                : jobs.map(job => {
                  const days   = daysWaiting(job.resubmittedAt ?? job.createdAt);
                  const waitColor = days > 5 ? C.red : days > 2 ? C.amber : C.faint;
                  const isApproving = approving === job.id;

                  return (
                    <tr
                      key={job.id}
                      style={{
                        borderBottom:     `1px solid ${C.border}`,
                        transition:       "background 0.12s",
                        background:       drawerJob?.id === job.id ? "rgba(255,255,255,0.03)" : "transparent",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.025)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = drawerJob?.id === job.id ? "rgba(255,255,255,0.03)" : "transparent"; }}
                    >
                      {/* Job title */}
                      <td style={TD}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {job.title}
                        </div>
                        <div style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>
                          {job.category}
                        </div>
                      </td>

                      {/* Company */}
                      <td style={TD}>
                        <div style={{ fontSize: 13, color: C.muted, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {job.companyName}
                        </div>
                        {job.employer.firstName && (
                          <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
                            ({job.employer.firstName}{job.employer.lastName ? " " + job.employer.lastName : ""})
                          </div>
                        )}
                      </td>

                      {/* Country */}
                      <td style={{ ...TD, fontSize: 13, color: C.muted }}>{job.country}</td>

                      {/* Category */}
                      <td style={TD}>
                        <Chip color={C.faint} bg="rgba(255,255,255,0.05)">{job.category}</Chip>
                      </td>

                      {/* Salary */}
                      <td style={{ ...TD, fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>
                        {fmtSalary(job.salaryMin, job.salaryMax, job.salaryCurrency)}
                      </td>

                      {/* Submitted */}
                      <td style={{ ...TD, fontSize: 12, color: C.faint, whiteSpace: "nowrap" }}>
                        {fmtDate(job.createdAt)}
                      </td>

                      {/* Waiting */}
                      <td style={{ ...TD, fontSize: 12, fontWeight: 700, color: waitColor, whiteSpace: "nowrap" }}>
                        {days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`}
                      </td>

                      {/* Actions */}
                      <td style={{ ...TD }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>

                          {/* Preview */}
                          <button
                            onClick={() => openDrawer(job)}
                            style={{
                              height:     28,
                              padding:    "0 10px",
                              borderRadius: 7,
                              border:     `1px solid ${C.border}`,
                              background: "transparent",
                              color:      C.muted,
                              fontSize:   11,
                              fontWeight: 600,
                              cursor:     "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Preview
                          </button>

                          {/* Approve */}
                          <button
                            onClick={() => handleApprove(job.id)}
                            disabled={isApproving || approving !== null}
                            style={{
                              height:     28,
                              padding:    "0 10px",
                              borderRadius: 7,
                              border:     "none",
                              background: isApproving ? "rgba(0,144,255,0.2)" : "rgba(0,144,255,0.12)",
                              color:      C.teal,
                              fontSize:   11,
                              fontWeight: 700,
                              cursor:     isApproving ? "default" : "pointer",
                              display:    "flex",
                              alignItems: "center",
                              gap:        4,
                              opacity:    approving !== null && !isApproving ? 0.4 : 1,
                            }}
                          >
                            {isApproving ? <Spinner size="xs" color="teal" /> : "Approve"}
                          </button>

                          {/* Reject */}
                          <button
                            onClick={() => setModal({ type: "reject",  jobId: job.id, title: job.title })}
                            disabled={approving !== null}
                            style={{
                              height:     28,
                              padding:    "0 10px",
                              borderRadius: 7,
                              border:     "1px solid rgba(239,68,68,0.25)",
                              background: "rgba(239,68,68,0.08)",
                              color:      "#f87171",
                              fontSize:   11,
                              fontWeight: 700,
                              cursor:     "pointer",
                              opacity:    approving !== null ? 0.4 : 1,
                            }}
                          >
                            Reject
                          </button>

                          {/* Changes */}
                          <button
                            onClick={() => setModal({ type: "changes", jobId: job.id, title: job.title })}
                            disabled={approving !== null}
                            style={{
                              height:     28,
                              padding:    "0 10px",
                              borderRadius: 7,
                              border:     `1px solid rgba(0,144,255,0.25)`,
                              background: "rgba(0,144,255,0.08)",
                              color:      "#60a5fa",
                              fontSize:   11,
                              fontWeight: 700,
                              cursor:     "pointer",
                              opacity:    approving !== null ? 0.4 : 1,
                              whiteSpace: "nowrap",
                            }}
                          >
                            Changes
                          </button>
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

      {/* Drawer */}
      {drawerJob && (
        <JobDrawer
          job={drawerJob}
          detail={drawerDetail}
          loading={drawerLoading}
          onClose={closeDrawer}
          onApprove={handleApprove}
          onReject={(id, title) => setModal({ type: "reject",  jobId: id, title })}
          onChanges={(id, title) => setModal({ type: "changes", jobId: id, title })}
          approving={approving}
        />
      )}

      {/* Action modal */}
      {modal && (
        <ActionModal
          type={modal.type}
          jobTitle={modal.title}
          onClose={() => setModal(null)}
          onSubmit={handleModalSubmit}
        />
      )}
    </div>
  );
}
