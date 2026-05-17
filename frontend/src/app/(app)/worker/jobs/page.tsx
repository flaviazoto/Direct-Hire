"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { userApi, workerApi } from "@/lib/api-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Job {
  id:                  string;
  title:               string;
  company:             string;
  country:             string;
  city:                string | null;
  salary_min:          number;
  salary_max:          number;
  currency:            string;
  skills:              string[];
  visa_type:           "sponsored" | "self";
  posted_at:           string;
  applicant_count:     number;
  match_score:         number;
  application_fee_usd: number;
}

type FilterTab = "all" | "top" | string; // "top" = ≥85, otherwise country or category value

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h    = Math.floor(diff / 3_600_000);
  if (h < 1)  return "Just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

function formatSalary(min: number, max: number, currency: string): string {
  const sym: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", AED: "د.إ" };
  const s = sym[currency] ?? currency + " ";
  const fmt = (n: number) =>
    n >= 1000 ? `${s}${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `${s}${n}`;
  return `${fmt(min)} – ${fmt(max)}`;
}

function matchBadgeStyle(score: number): { bg: string; color: string } {
  if (score >= 85) return { bg: "#dcfce7", color: "#15803d" };
  if (score >= 70) return { bg: "#fef9c3", color: "#92400e" };
  return { bg: "#f1f5f9", color: "#64748b" };
}

function greeting(firstName: string): string {
  const h = new Date().getHours();
  const time = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return `Good ${time}, ${firstName || "there"}`;
}

const TEAL_600 = "#0d9488";
const TEAL_700 = "#0f766e";
const TEAL_800 = "#115e59";
const TEAL_50  = "#f0fdfa";

// ─── Apply drawer ─────────────────────────────────────────────────────────────

function ApplyDrawer({
  job,
  onClose,
  onSuccess,
}: {
  job:       Job;
  onClose:   () => void;
  onSuccess: (jobId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await workerApi.applyToJob(job.id, {});
      if (!res.success) {
        setError((res as { error?: string }).error ?? "Application failed. Please try again.");
        return;
      }
      onSuccess(job.id);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position:   "fixed",
        inset:      0,
        zIndex:     100,
        display:    "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: "rgba(0,0,0,0.4)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background:   "#fff",
          borderRadius: "16px 16px 0 0",
          padding:      "28px 32px 40px",
          width:        "100%",
          maxWidth:     640,
          boxShadow:    "0 -8px 40px rgba(0,0,0,0.12)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "#e2e8f0" }} />
        </div>

        <p style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
          Confirm application
        </p>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: 0 }}>
          {job.title}
        </h2>
        <p style={{ fontSize: 14, color: "#64748b", marginTop: 4, marginBottom: 20 }}>
          {job.company} · {job.country}
        </p>

        <div
          style={{
            background:   TEAL_50,
            border:       `1px solid #99f6e4`,
            borderRadius: 10,
            padding:      "14px 18px",
            marginBottom: 20,
            display:      "flex",
            alignItems:   "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 14, color: TEAL_800, fontWeight: 500 }}>
            Platform fee
          </span>
          <span style={{ fontSize: 20, fontWeight: 800, color: TEAL_700 }}>
            ${job.application_fee_usd.toFixed(2)}
          </span>
        </div>

        <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6, marginBottom: 24 }}>
          By confirming, you agree to pay the DirectHire platform fee of{" "}
          <strong style={{ color: "#64748b" }}>${job.application_fee_usd.toFixed(2)}</strong>.
          This fee is non-refundable once the application is submitted.
        </p>

        {error && (
          <p style={{ fontSize: 13, color: "#dc2626", marginBottom: 16, padding: "10px 14px", background: "#fef2f2", borderRadius: 8 }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex:         1,
              padding:      "11px 0",
              borderRadius: 8,
              border:       "1px solid #e2e8f0",
              background:   "#f8fafc",
              fontSize:     14,
              fontWeight:   600,
              color:        "#475569",
              cursor:       "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{
              flex:         2,
              padding:      "11px 0",
              borderRadius: 8,
              border:       "none",
              background:   loading ? "#94a3b8" : TEAL_600,
              fontSize:     14,
              fontWeight:   700,
              color:        "#fff",
              cursor:       loading ? "not-allowed" : "pointer",
              transition:   "background 0.12s",
            }}
          >
            {loading ? "Submitting…" : `Confirm — $${job.application_fee_usd.toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Job card ─────────────────────────────────────────────────────────────────

function JobCard({
  job,
  applied,
  onApply,
}: {
  job:     Job;
  applied: boolean;
  onApply: (job: Job) => void;
}) {
  const badge = matchBadgeStyle(job.match_score);
  const visibleSkills = job.skills.slice(0, 3);
  const extraSkills   = job.skills.length - 3;

  return (
    <div
      style={{
        background:   "#fff",
        border:       "1px solid #e2e8f0",
        borderRadius: 12,
        padding:      "18px 20px",
        display:      "flex",
        flexDirection: "column",
        gap:          12,
        transition:   "box-shadow 0.15s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
    >
      {/* Top row: title + match badge */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>
            {job.company}
          </p>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "2px 0 0" }}>
            {job.title}
          </h3>
        </div>
        <div
          style={{
            padding:      "4px 10px",
            borderRadius: 20,
            fontSize:     12,
            fontWeight:   700,
            background:   badge.bg,
            color:        badge.color,
            flexShrink:   0,
            whiteSpace:   "nowrap",
          }}
        >
          {job.match_score}% match
        </div>
      </div>

      {/* Location + salary + visa */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#475569" }}>
          📍 {job.city ? `${job.city}, ` : ""}{job.country}
        </span>
        <span style={{ color: "#cbd5e1", fontSize: 13 }}>·</span>
        <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>
          {formatSalary(job.salary_min, job.salary_max, job.currency)} / mo
        </span>
        {job.visa_type === "sponsored" && (
          <>
            <span style={{ color: "#cbd5e1", fontSize: 13 }}>·</span>
            <span
              style={{
                fontSize:   11,
                fontWeight: 600,
                padding:    "2px 8px",
                borderRadius: 20,
                background: "#ede9fe",
                color:      "#6d28d9",
              }}
            >
              Visa sponsored
            </span>
          </>
        )}
      </div>

      {/* Skill pills */}
      {job.skills.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {visibleSkills.map(skill => (
            <span
              key={skill}
              style={{
                fontSize:   12,
                fontWeight: 500,
                padding:    "3px 10px",
                borderRadius: 20,
                background: "#f1f5f9",
                color:      "#475569",
              }}
            >
              {skill}
            </span>
          ))}
          {extraSkills > 0 && (
            <span
              style={{
                fontSize:   12,
                fontWeight: 500,
                padding:    "3px 10px",
                borderRadius: 20,
                background: "#f1f5f9",
                color:      "#94a3b8",
              }}
            >
              +{extraSkills} more
            </span>
          )}
        </div>
      )}

      {/* Footer: meta + apply button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#94a3b8" }}>
          <span>{timeAgo(job.posted_at)}</span>
          <span>·</span>
          <span>{job.applicant_count} applicant{job.applicant_count !== 1 ? "s" : ""}</span>
        </div>

        {applied ? (
          <span
            style={{
              fontSize:   13,
              fontWeight: 600,
              color:      "#15803d",
              padding:    "8px 16px",
              background: "#dcfce7",
              borderRadius: 8,
            }}
          >
            Applied ✓
          </span>
        ) : (
          <button
            onClick={() => onApply(job)}
            style={{
              padding:      "8px 18px",
              borderRadius: 8,
              border:       "none",
              background:   TEAL_600,
              color:        "#fff",
              fontSize:     13,
              fontWeight:   700,
              cursor:       "pointer",
              whiteSpace:   "nowrap",
              transition:   "background 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = TEAL_700; }}
            onMouseLeave={e => { e.currentTarget.style.background = TEAL_600; }}
          >
            Apply — ${job.application_fee_usd.toFixed(2)}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkerJobsPage() {
  const [jobs,        setJobs]        = useState<Job[]>([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [firstName,   setFirstName]   = useState("");
  const [trustScore,  setTrustScore]  = useState<number | null>(null);
  const [appliedIds,  setAppliedIds]  = useState<Set<string>>(new Set());
  const [activeTab,   setActiveTab]   = useState<FilterTab>("all");
  const [drawerJob,   setDrawerJob]   = useState<Job | null>(null);
  const [toast,       setToast]       = useState<string | null>(null);

  // Countries + categories derived from loaded jobs
  const countries  = useMemo(() => [...new Set(jobs.map(j => j.country))].sort(), [jobs]);
  const categories = useMemo(() => {
    // jobs don't carry category in the response shape — tabs are All, Top, by country only
    return [] as string[];
  }, []);

  // ── Load initial data ──────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      // Profile (first name + trust score)
      userApi.getProfile().then(res => {
        if (!res.success) return;
        const d = res.data as { profile?: { firstName?: string; trustScore?: number } | null };
        setFirstName(d?.profile?.firstName ?? "");
        setTrustScore(d?.profile?.trustScore ?? null);
      });

      // Already-applied job IDs from applications list
      workerApi.getApplications({ limit: "200" }).then(res => {
        if (!res.success) return;
        const apps = (res.data as { applications?: { jobId?: string }[] })?.applications ?? [];
        setAppliedIds(new Set(apps.map(a => a.jobId).filter(Boolean) as string[]));
      });

      // Jobs page 1
      await fetchJobs(1, false);
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchJobs(p: number, append: boolean) {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const res = await workerApi.getJobs({ page: String(p), limit: "20" });
      if (!res.success) return;
      const d = res.data as { jobs: Job[]; total: number; page: number };
      setJobs(prev => append ? [...prev, ...d.jobs] : d.jobs);
      setTotal(d.total);
      setPage(p);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  function loadMore() {
    fetchJobs(page + 1, true);
  }

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (activeTab === "all")  return jobs;
    if (activeTab === "top")  return jobs.filter(j => j.match_score >= 85);
    // Otherwise treat as a country name
    return jobs.filter(j => j.country === activeTab);
  }, [jobs, activeTab]);

  // ── Stats for hero ─────────────────────────────────────────────────────────
  const avgMatch = useMemo(() => {
    const top20 = [...jobs].sort((a, b) => b.match_score - a.match_score).slice(0, 20);
    if (!top20.length) return 0;
    return Math.round(top20.reduce((s, j) => s + j.match_score, 0) / top20.length);
  }, [jobs]);

  // ── Apply handlers ─────────────────────────────────────────────────────────
  function handleApply(job: Job) {
    setDrawerJob(job);
  }

  function handleApplySuccess(jobId: string) {
    setAppliedIds(prev => new Set([...prev, jobId]));
    setDrawerJob(null);
    setToast("Application submitted!");
    setTimeout(() => setToast(null), 3500);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <div style={{ textAlign: "center", color: "#94a3b8" }}>
          <div
            style={{
              width:        36,
              height:       36,
              border:       `3px solid #e2e8f0`,
              borderTopColor: TEAL_600,
              borderRadius: "50%",
              animation:    "spin 0.7s linear infinite",
              margin:       "0 auto 12px",
            }}
          />
          <p style={{ fontSize: 14 }}>Loading your job feed…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const tabItems: { id: FilterTab; label: string }[] = [
    { id: "all",  label: `All jobs (${total})` },
    { id: "top",  label: "Top matches ≥85%" },
    ...countries.slice(0, 4).map(c => ({ id: c, label: c })),
  ];

  return (
    <div style={{ padding: "24px 28px", maxWidth: 820, margin: "0 auto" }}>

      {/* ── Hero greeting card ───────────────────────────────────────────────── */}
      <div
        style={{
          background:   `linear-gradient(135deg, ${TEAL_700} 0%, #0369a1 100%)`,
          borderRadius: 16,
          padding:      "24px 28px",
          marginBottom: 24,
          color:        "#fff",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
          {greeting(firstName)}
        </h1>
        <p style={{ fontSize: 14, margin: "4px 0 20px", color: "rgba(255,255,255,0.8)" }}>
          {total > 0
            ? `${total} jobs match your profile today`
            : "No new jobs right now — check back soon"}
        </p>

        {/* Stat chips */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div
            style={{
              background:   "rgba(255,255,255,0.15)",
              borderRadius: 8,
              padding:      "8px 14px",
              backdropFilter: "blur(4px)",
            }}
          >
            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Avg match
            </p>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
              {avgMatch}%
            </p>
          </div>

          <div
            style={{
              background:   "rgba(255,255,255,0.15)",
              borderRadius: 8,
              padding:      "8px 14px",
              backdropFilter: "blur(4px)",
            }}
          >
            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Applied
            </p>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
              {appliedIds.size}
            </p>
          </div>

          {trustScore !== null && (
            <div
              style={{
                background:   "rgba(255,255,255,0.15)",
                borderRadius: 8,
                padding:      "8px 14px",
                backdropFilter: "blur(4px)",
              }}
            >
              <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Trust score
              </p>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
                {trustScore}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter pills ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display:        "flex",
          gap:            8,
          marginBottom:   20,
          flexWrap:       "wrap",
        }}
      >
        {tabItems.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding:      "7px 16px",
                borderRadius: 20,
                border:       isActive ? "none" : "1px solid #e2e8f0",
                background:   isActive ? TEAL_600 : "#fff",
                color:        isActive ? "#fff" : "#475569",
                fontSize:     13,
                fontWeight:   isActive ? 700 : 500,
                cursor:       "pointer",
                transition:   "all 0.12s",
                whiteSpace:   "nowrap",
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background   = TEAL_50;
                  e.currentTarget.style.borderColor  = TEAL_600;
                  e.currentTarget.style.color        = TEAL_800;
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background  = "#fff";
                  e.currentTarget.style.borderColor = "#e2e8f0";
                  e.currentTarget.style.color       = "#475569";
                }
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Job list ─────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div
          style={{
            textAlign:  "center",
            padding:    "60px 20px",
            color:      "#94a3b8",
          }}
        >
          <p style={{ fontSize: 32, margin: "0 0 8px" }}>🔍</p>
          <p style={{ fontSize: 16, fontWeight: 600, color: "#475569", margin: "0 0 4px" }}>
            No jobs in this filter
          </p>
          <p style={{ fontSize: 14, margin: 0 }}>
            Try a different filter or check back later.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map(job => (
            <JobCard
              key={job.id}
              job={job}
              applied={appliedIds.has(job.id)}
              onApply={handleApply}
            />
          ))}
        </div>
      )}

      {/* ── Load more ────────────────────────────────────────────────────────── */}
      {jobs.length < total && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
          <button
            onClick={loadMore}
            disabled={loadingMore}
            style={{
              padding:      "11px 32px",
              borderRadius: 8,
              border:       `1px solid ${TEAL_600}`,
              background:   "#fff",
              color:        TEAL_700,
              fontSize:     14,
              fontWeight:   700,
              cursor:       loadingMore ? "not-allowed" : "pointer",
              opacity:      loadingMore ? 0.6 : 1,
              transition:   "all 0.12s",
            }}
            onMouseEnter={e => {
              if (!loadingMore) {
                e.currentTarget.style.background = TEAL_50;
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "#fff";
            }}
          >
            {loadingMore ? "Loading…" : `Load more (${total - jobs.length} remaining)`}
          </button>
        </div>
      )}

      {/* ── Apply drawer ─────────────────────────────────────────────────────── */}
      {drawerJob && (
        <ApplyDrawer
          job={drawerJob}
          onClose={() => setDrawerJob(null)}
          onSuccess={handleApplySuccess}
        />
      )}

      {/* ── Toast ────────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          style={{
            position:     "fixed",
            bottom:       32,
            left:         "50%",
            transform:    "translateX(-50%)",
            background:   "#0f172a",
            color:        "#fff",
            padding:      "12px 24px",
            borderRadius: 10,
            fontSize:     14,
            fontWeight:   600,
            zIndex:       200,
            boxShadow:    "0 4px 20px rgba(0,0,0,0.2)",
            whiteSpace:   "nowrap",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
