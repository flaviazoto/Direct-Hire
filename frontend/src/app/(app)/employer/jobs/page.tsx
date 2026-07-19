"use client";
// src/app/(app)/employer/jobs/page.tsx

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { employerApi } from "@/lib/api-client";
import {
  Button,
  LoadingPage,
  ToastDisplay,
  type ToastData,
  ErrorState,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ModerationHistoryEntry {
  action: string;
  notes?: string | null;
  timestamp: string;
  admin_id?: string;
}

interface JobPost {
  id: string;
  title: string;
  companyName: string;
  country: string;
  city: string;
  category: string;
  contractType: string;
  salaryMin: number | string;
  salaryMax: number | string;
  salaryCurrency: string;
  status: string;
  moderationNotes?: string | null;
  moderationHistory?: ModerationHistoryEntry[] | null;
  changesRequestedAt?: string | null;
  viewCount: number;
  applicationCount: number;
  positionsAvailable: number;
  applicationDeadline?: string | null;
  createdAt: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

type TabKey = "ALL" | "DRAFT" | "PENDING_MODERATION" | "APPROVED" | "REJECTED" | "ARCHIVED";

const TABS: { key: TabKey; label: string; emptyTitle: string; emptyDesc: string }[] = [
  { key: "ALL",                label: "All",           emptyTitle: "No job posts yet",              emptyDesc: "Create your first post to start receiving applicants." },
  { key: "DRAFT",              label: "Drafts",        emptyTitle: "No drafts saved",               emptyDesc: "Start a new job post." },
  { key: "PENDING_MODERATION", label: "Pending review",emptyTitle: "No posts under review",         emptyDesc: "Submit a draft to have it reviewed." },
  { key: "APPROVED",           label: "Live",          emptyTitle: "No live jobs",                  emptyDesc: "Submit a post to get candidates applying." },
  { key: "REJECTED",           label: "Rejected",      emptyTitle: "No rejected posts",             emptyDesc: "Any rejected posts will appear here." },
  { key: "ARCHIVED",           label: "Archived",      emptyTitle: "No archived posts",             emptyDesc: "Archived jobs are hidden from workers." },
];

const CONTRACT_LABELS: Record<string, string> = {
  FULL_TIME:  "Full-time",
  PART_TIME:  "Part-time",
  CONTRACT:   "Contract",
  TEMPORARY:  "Temporary",
  INTERNSHIP: "Internship",
  FREELANCE:  "Freelance",
};

// ── Status chip ────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string; border: string }> = {
    DRAFT:              { label: "Draft",        color: "#a1a1aa", bg: "rgba(161,161,170,0.08)", border: "rgba(161,161,170,0.2)"  },
    PENDING_MODERATION: { label: "Under review", color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.25)"  },
    APPROVED:           { label: "Live",         color: "#4ade80", bg: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.25)"  },
    REJECTED:           { label: "Rejected",     color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.25)" },
    ARCHIVED:           { label: "Archived",     color: "#71717a", bg: "rgba(113,113,122,0.08)", border: "rgba(113,113,122,0.2)"  },
  };
  const c = cfg[status] ?? cfg.DRAFT;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
      color: c.color, background: c.bg, border: `1px solid ${c.border}`,
      whiteSpace: "nowrap",
    }}>
      {status === "APPROVED" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px rgba(74,222,128,0.7)", display: "inline-block" }} />}
      {c.label}
    </span>
  );
}

// ── Chip ───────────────────────────────────────────────────────────────────────

function Chip({ children, color = "cyan" }: { children: React.ReactNode; color?: "cyan" | "violet" }) {
  const styles = {
    cyan:   { color: "#67e8f9", bg: "rgba(34,211,238,0.08)",  border: "rgba(34,211,238,0.25)"  },
    violet: { color: "#c4b5fd", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.25)" },
  };
  const s = styles[color];
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
      {children}
    </span>
  );
}

// ── Moderation timeline ────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { label: string; dot: string }> = {
  APPROVED:          { label: "Approved",          dot: "#4ade80" },
  REJECTED:          { label: "Rejected",          dot: "#f87171" },
  CHANGES_REQUESTED: { label: "Changes requested", dot: "#fbbf24" },
  JOB_RESUBMITTED:   { label: "Resubmitted",       dot: "#60a5fa" },
};

function ModerationTimeline({ history }: { history: ModerationHistoryEntry[] }) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 22px", background: "none", border: "none", cursor: "pointer",
          fontSize: 11, fontWeight: 600, color: "#71717a", fontFamily: "inherit",
          textTransform: "uppercase", letterSpacing: "0.05em",
          transition: "color 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.color = "#a1a1aa")}
        onMouseLeave={e => (e.currentTarget.style.color = "#71717a")}
      >
        <span>Moderation history</span>
        <span style={{ fontSize: 10, transition: "transform 0.2s", display: "inline-block", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
      </button>

      {open && (
        <div ref={contentRef} style={{ padding: "4px 22px 16px" }}>
          {history.map((entry, i) => {
            const cfg = ACTION_CONFIG[entry.action] ?? { label: entry.action, dot: "#71717a" };
            const date = new Date(entry.timestamp).toLocaleDateString("en-GB", {
              day: "numeric", month: "short", year: "numeric",
            });
            return (
              <div key={i} style={{ display: "flex", gap: 12, paddingBottom: i < history.length - 1 ? 12 : 0, position: "relative" }}>
                {/* Timeline line */}
                {i < history.length - 1 && (
                  <div style={{ position: "absolute", left: 5, top: 12, bottom: 0, width: 1, background: "rgba(255,255,255,0.06)" }} />
                )}
                {/* Dot */}
                <div style={{
                  width: 11, height: 11, borderRadius: "50%", flexShrink: 0,
                  background: cfg.dot, marginTop: 2,
                  boxShadow: `0 0 6px ${cfg.dot}66`,
                }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#e4e4e7" }}>{cfg.label}</span>
                    <span style={{ fontSize: 11, color: "#555" }}>{date}</span>
                  </div>
                  {entry.notes && (
                    <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 3, lineHeight: 1.5 }}>
                      {entry.notes}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Confirmation modal ─────────────────────────────────────────────────────────

function ConfirmModal({
  title, message, confirmLabel, variant = "danger", onConfirm, onCancel, loading,
}: {
  title: string; message: string; confirmLabel: string;
  variant?: "danger" | "amber"; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: "#161616", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 20, padding: 32, maxWidth: 420, width: "100%",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 12 }}>{title}</div>
        <div style={{ fontSize: 13, color: "#71717a", lineHeight: 1.6, marginBottom: 28 }}>{message}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 18px", color: "#a1a1aa", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}
          >
            Cancel
          </button>
          <Button
            variant={variant === "danger" ? "danger" : "amber"}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Job card ───────────────────────────────────────────────────────────────────

function JobCard({
  job,
  onSubmit,
  onArchive,
  onDelete,
  actionLoading,
}: {
  job: JobPost;
  onSubmit: (id: string) => void;
  onArchive: (job: JobPost) => void;
  onDelete: (job: JobPost) => void;
  actionLoading: string | null;
}) {
  const loading = actionLoading === job.id;

  const salaryMin = typeof job.salaryMin === "string" ? parseFloat(job.salaryMin) : job.salaryMin;
  const salaryMax = typeof job.salaryMax === "string" ? parseFloat(job.salaryMax) : job.salaryMax;

  const salaryStr = (salaryMin > 0 && salaryMax > 0)
    ? `${job.salaryCurrency} ${salaryMin.toLocaleString()} – ${salaryMax.toLocaleString()} / mo`
    : null;

  const postedDate = new Date(job.createdAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <div style={{
      background: "#161616",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      overflow: "hidden",
      transition: "border-color 0.15s",
    }}>
      {/* Rejection note */}
      {job.status === "REJECTED" && job.moderationNotes && (
        <div style={{
          borderLeft: "3px solid #f59e0b",
          background: "rgba(245,158,11,0.06)",
          padding: "10px 18px",
          fontSize: 12,
          color: "#fcd34d",
          lineHeight: 1.5,
        }}>
          <strong style={{ fontWeight: 700 }}>Not approved:</strong> {job.moderationNotes}
        </div>
      )}

      <div style={{ padding: "18px 22px" }}>
        {/* Top row: title + status */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff", lineHeight: 1.3 }}>{job.title}</div>
            <div style={{ fontSize: 12, color: "#71717a", marginTop: 3 }}>
              {job.companyName} · {[job.city, job.country].filter(Boolean).join(", ")}
            </div>
          </div>
          <StatusChip status={job.status} />
        </div>

        {/* Chips row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {job.contractType && <Chip color="violet">{CONTRACT_LABELS[job.contractType] ?? job.contractType}</Chip>}
          {job.category && <Chip color="cyan">{job.category}</Chip>}
          {salaryStr && (
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, color: "#86efac", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)" }}>
              {salaryStr}
            </span>
          )}
        </div>

        {/* Stats + date row */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16, fontSize: 12, color: "#555" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <EyeIcon /> {job.viewCount.toLocaleString()} views
          </span>
          <Link
            href={`/employer/jobs/${job.id}/applicants`}
            onClick={e => e.stopPropagation()}
            style={{ display: "flex", alignItems: "center", gap: 5, color: job.applicationCount > 0 ? "#2dd4bf" : "inherit", textDecoration: "none", borderRadius: 6, padding: "1px 4px", margin: "-1px -4px", transition: "background 0.15s" }}
            onMouseEnter={e => { if (job.applicationCount > 0) (e.currentTarget as HTMLAnchorElement).style.background = "rgba(0,144,255,0.08)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
          >
            <PersonIcon /> {job.applicationCount.toLocaleString()} applicant{job.applicationCount !== 1 ? "s" : ""}
          </Link>
          <span style={{ marginLeft: "auto" }}>Posted {postedDate}</span>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {job.status === "DRAFT" && (
            <>
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/employer/jobs/${job.id}/edit`}>Edit</Link>
              </Button>
              <Button
                variant="teal" size="sm" loading={loading}
                onClick={() => onSubmit(job.id)}
              >
                Submit for review
              </Button>
              <Button
                variant="danger" size="sm" loading={loading}
                onClick={() => onDelete(job)}
              >
                Delete
              </Button>
            </>
          )}

          {job.status === "PENDING_MODERATION" && (
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/employer/jobs/${job.id}/edit`}>View</Link>
            </Button>
          )}

          {job.status === "APPROVED" && (
            <>
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/employer/jobs/${job.id}/edit`}>View</Link>
              </Button>
              <Button
                variant="secondary" size="sm" loading={loading}
                onClick={() => onArchive(job)}
              >
                Archive
              </Button>
            </>
          )}

          {job.status === "REJECTED" && (
            <>
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/employer/jobs/${job.id}/edit`}>Edit</Link>
              </Button>
              <Button
                variant="teal" size="sm" loading={loading}
                onClick={() => onSubmit(job.id)}
              >
                Resubmit
              </Button>
            </>
          )}

          {job.status === "ARCHIVED" && (
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/employer/jobs/${job.id}/edit`}>View</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Moderation history timeline — shown for rejected jobs */}
      {job.status === "REJECTED" && Array.isArray(job.moderationHistory) && job.moderationHistory.length > 0 && (
        <ModerationTimeline history={job.moderationHistory} />
      )}
    </div>
  );
}

// ── SVG icons ──────────────────────────────────────────────────────────────────

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

function EmployerJobsContent() {
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab]       = useState<TabKey>("ALL");
  const [jobs, setJobs]                 = useState<JobPost[]>([]);
  const [counts, setCounts]             = useState<Partial<Record<TabKey, number>>>({});
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast]               = useState<ToastData>(null);
  const [confirm, setConfirm]           = useState<{
    type: "archive" | "delete"; job: JobPost;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  function showToast(msg: string, type: "ok" | "err") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Fetch counts (parallel, lightweight) ──────────────────────────────────

  const fetchCounts = useCallback(async () => {
    const statuses: TabKey[] = ["DRAFT", "PENDING_MODERATION", "APPROVED", "REJECTED", "ARCHIVED"];
    const results = await Promise.all(
      statuses.map(s =>
        employerApi.getJobs({ status: s, page: "1", limit: "1" }).then(r => ({
          status: s,
          total: (r as { total?: number }).total ?? 0,
        }))
      )
    );
    const map: Partial<Record<TabKey, number>> = {};
    let all = 0;
    for (const r of results) { map[r.status] = r.total; all += r.total; }
    map["ALL"] = all;
    setCounts(map);
  }, []);

  // ── Fetch jobs for active tab ─────────────────────────────────────────────

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = { page: String(page), limit: "20" };
    if (activeTab !== "ALL") params.status = activeTab;

    const res = await employerApi.getJobs(params);
    if (!res.success) { setError(res.error ?? "Could not load jobs."); setLoading(false); return; }

    setJobs((res.data as JobPost[]) ?? []);
    setTotal((res as { total?: number }).total ?? 0);
    setLoading(false);
  }, [activeTab, page]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Show success toast when redirected back from new job submission
  useEffect(() => {
    if (searchParams.get("submitted") === "1") {
      showToast("Job submitted for review! We'll notify you once it's approved.", "ok");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tab switch ────────────────────────────────────────────────────────────

  function switchTab(key: TabKey) {
    setActiveTab(key);
    setPage(1);
    setJobs([]);
  }

  // ── Inline status update (optimistic) ────────────────────────────────────

  function updateJobStatus(id: string, status: string, extra?: Partial<JobPost>) {
    setJobs(prev => {
      const updated = prev.map(j => j.id === id ? { ...j, status, ...extra } : j);
      // Remove from current filtered tab if it no longer matches
      if (activeTab !== "ALL") return updated.filter(j => j.status === activeTab);
      return updated;
    });
    fetchCounts();
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleSubmit(id: string) {
    setActionLoading(id);
    const res = await employerApi.submitJob(id);
    setActionLoading(null);
    if (!res.success) {
      showToast((res as { error?: string }).error ?? "Failed to submit", "err");
      return;
    }
    showToast("Job submitted for review!", "ok");
    updateJobStatus(id, "PENDING_MODERATION");
  }

  async function handleArchiveConfirm() {
    if (!confirm || confirm.type !== "archive") return;
    setConfirmLoading(true);
    const res = await employerApi.archiveJob(confirm.job.id);
    setConfirmLoading(false);
    setConfirm(null);
    if (!res.success) {
      showToast((res as { error?: string }).error ?? "Failed to archive", "err");
      return;
    }
    showToast("Job archived.", "ok");
    updateJobStatus(confirm.job.id, "ARCHIVED");
  }

  async function handleDeleteConfirm() {
    if (!confirm || confirm.type !== "delete") return;
    setConfirmLoading(true);
    const res = await employerApi.deleteJob(confirm.job.id);
    setConfirmLoading(false);
    setConfirm(null);
    if (!res.success) {
      showToast((res as { error?: string }).error ?? "Failed to delete", "err");
      return;
    }
    showToast("Draft deleted.", "ok");
    setJobs(prev => prev.filter(j => j.id !== confirm.job.id));
    fetchCounts();
  }

  // ── Tab bar ───────────────────────────────────────────────────────────────

  const currentTab = TABS.find(t => t.key === activeTab)!;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 900, margin: "0 auto", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <ToastDisplay toast={toast} />

      {/* Confirmation modal */}
      {confirm && (
        confirm.type === "archive" ? (
          <ConfirmModal
            title="Archive this job?"
            message={`"${confirm.job.title}" will be hidden from workers and will no longer accept applications. You can view it later in the Archived tab.`}
            confirmLabel="Archive"
            variant="amber"
            loading={confirmLoading}
            onConfirm={handleArchiveConfirm}
            onCancel={() => setConfirm(null)}
          />
        ) : (
          <ConfirmModal
            title="Delete this draft?"
            message={`"${confirm.job.title}" will be permanently deleted. This cannot be undone.`}
            confirmLabel="Delete"
            variant="danger"
            loading={confirmLoading}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setConfirm(null)}
          />
        )
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#ffffff" }}>My job posts</div>
          <div style={{ fontSize: 13, color: "#71717a", marginTop: 4 }}>
            {typeof counts["ALL"] === "number" ? `${counts["ALL"]} total` : ""}
          </div>
        </div>
        <Button variant="teal" asChild>
          <Link href="/employer/jobs/new">+ Post a job</Link>
        </Button>
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex", gap: 2, flexWrap: "wrap",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12, padding: 4, marginBottom: 24,
      }}>
        {TABS.map(tab => {
          const isActive = tab.key === activeTab;
          const count = counts[tab.key];
          return (
            <button
              key={tab.key}
              onClick={() => switchTab(tab.key)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 9, cursor: "pointer",
                fontSize: 12, fontWeight: isActive ? 700 : 500,
                fontFamily: "inherit",
                border: "none",
                background: isActive ? "#1f1f1f" : "transparent",
                color: isActive ? "#ffffff" : "#71717a",
                boxShadow: isActive ? "0 1px 4px rgba(0,0,0,0.4)" : "none",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
              {count !== undefined && count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, minWidth: 16, height: 16,
                  borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "0 4px",
                  background: isActive
                    ? tab.key === "APPROVED" ? "rgba(74,222,128,0.2)"
                    : tab.key === "REJECTED" ? "rgba(248,113,113,0.2)"
                    : tab.key === "PENDING_MODERATION" ? "rgba(251,191,36,0.2)"
                    : "rgba(255,255,255,0.1)"
                    : "rgba(255,255,255,0.06)",
                  color: isActive
                    ? tab.key === "APPROVED" ? "#4ade80"
                    : tab.key === "REJECTED" ? "#f87171"
                    : tab.key === "PENDING_MODERATION" ? "#fbbf24"
                    : "#a1a1aa"
                    : "#555",
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Job list */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(0,144,255,0.2)", borderTop: "2px solid #14b8a6", animation: "spin 0.8s linear infinite" }} />
        </div>
      ) : error ? (
        <ErrorState message={error} retry={fetchJobs} title="Could not load jobs" />
      ) : jobs.length === 0 ? (
        <div style={{
          background: "#161616", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 16, padding: "56px 32px", textAlign: "center",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{currentTab.emptyTitle}</div>
          <div style={{ fontSize: 13, color: "#71717a" }}>{currentTab.emptyDesc}</div>
          {(activeTab === "ALL" || activeTab === "DRAFT") && (
            <div style={{ marginTop: 20 }}>
              <Button variant="teal" asChild>
                <Link href="/employer/jobs/new">+ Post a job</Link>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {jobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                onSubmit={handleSubmit}
                onArchive={j => setConfirm({ type: "archive", job: j })}
                onDelete={j => setConfirm({ type: "delete", job: j })}
                actionLoading={actionLoading}
              />
            ))}
          </div>

          {/* Load more */}
          {jobs.length < total && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={loading}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  padding: "10px 28px",
                  color: "#a1a1aa",
                  cursor: "pointer",
                  fontSize: 13,
                  fontFamily: "inherit",
                  fontWeight: 600,
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#a1a1aa"; }}
              >
                Load more ({total - jobs.length} remaining)
              </button>
            </div>
          )}
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function EmployerJobsPage() {
  return (
    <Suspense fallback={<LoadingPage color="teal" />}>
      <EmployerJobsContent />
    </Suspense>
  );
}
