"use client";
// src/app/(app)/admin/system/page.tsx
// Admin system-health monitor — read-only surface over JobRunLog
// (backend/src/controllers/admin-system-health.controller.ts), showing one
// card per known scheduled job plus a filterable recent-runs table.
//
// Job list is derived entirely from whatever jobName values exist in
// JobRunLog — never hardcoded. Note: onboarding-reminders is a real
// scheduled job (services/scheduler.ts) but never writes a JobRunLog row
// (services/queue/index.ts's runOnboardingReminders only console.logs), so
// it will not appear as a card here until that changes.

import { useEffect, useState, useCallback } from "react";
import { adminApi } from "@/lib/api-client";
import { LoadingPage, ErrorState } from "@/components/ui";
import { C } from "@/lib/admin-theme";

// ── Types ──────────────────────────────────────────────────────────────────────

interface JobRun {
  id:               string;
  jobName:          string;
  status:           string; // "success" | "partial" | "failed"
  recordsProcessed: number;
  recordsFailed:    number;
  errorMessage:      string | null;
  startedAt:        string;
  completedAt:      string;
  durationMs:       number;
}

interface JobCardData {
  jobName: string;
  lastRun: JobRun | null;
  isStale: boolean;
}

interface SystemHealthResponse {
  jobs:       JobCardData[];
  recentRuns: JobRun[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function jobLabel(jobName: string) {
  return jobName.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
}

// Cards override the recorded status with a grey "Stale" badge when no run
// has happened within 2x the job's expected interval — computed server-side
// (isStale) since only the backend knows each job's expected cadence.
const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  success: { label: "Healthy",  color: C.green,  bg: "rgba(34,197,94,0.12)"  },
  partial: { label: "Partial",  color: C.yellow, bg: "rgba(245,158,11,0.12)" },
  failed:  { label: "Failed",   color: C.accent, bg: "rgba(220,38,38,0.12)"  },
  stale:   { label: "Stale",    color: C.muted,  bg: "rgba(113,113,122,0.12)" },
};

function Badge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? { label: status, color: C.muted, bg: "rgba(113,113,122,0.12)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700,
      padding: "3px 9px", borderRadius: 99, color: cfg.color, background: cfg.bg,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

// ── Job card ───────────────────────────────────────────────────────────────────

function JobCard({ job }: { job: JobCardData }) {
  const badgeStatus = job.isStale ? "stale" : (job.lastRun?.status ?? "stale");

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{jobLabel(job.jobName)}</div>
        <Badge status={badgeStatus} />
      </div>

      {job.lastRun ? (
        <>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
            Last run <span style={{ color: C.secondary }}>{timeAgo(job.lastRun.startedAt)}</span> — {fmtDateTime(job.lastRun.startedAt)}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
            Duration {fmtDuration(job.lastRun.durationMs)} · Processed {job.lastRun.recordsProcessed} · Failed {job.lastRun.recordsFailed}
          </div>
          {job.isStale && (
            <div style={{ fontSize: 12, color: C.yellow, marginTop: 8 }}>
              No run within 2× the expected interval — the last recorded status may no longer reflect reality.
            </div>
          )}
          {job.lastRun.status === "failed" && job.lastRun.errorMessage && (
            <div style={{
              fontSize: 12, color: C.accent, marginTop: 10, padding: "8px 10px",
              background: "rgba(220,38,38,0.08)", borderRadius: 8, wordBreak: "break-word",
            }}>
              {job.lastRun.errorMessage}
            </div>
          )}
          {job.jobName === "health-monitor" && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 10, fontStyle: "italic" }}>
              Per-check breakdown isn&apos;t stored — only the overall pass/partial/fail status for this run.
              A failed run&apos;s error message above lists which check(s) failed.
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 12, color: C.muted }}>No runs recorded yet.</div>
      )}
    </div>
  );
}

// ── Recent-runs table ────────────────────────────────────────────────────────

function RecentRunsTable({ runs, loading }: { runs: JobRun[]; loading: boolean }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 800 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
              {["Job", "Status", "Started", "Duration", "Processed", "Failed", "Error"].map(h => (
                <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: C.muted }}>Loading…</td></tr>
            ) : runs.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: "48px 24px", textAlign: "center", color: C.muted }}>No runs recorded.</td></tr>
            ) : runs.map((run, idx) => (
              <tr key={run.id} style={{ borderBottom: idx < runs.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <td style={{ padding: "12px 20px", fontWeight: 600, color: C.secondary, whiteSpace: "nowrap" }}>{jobLabel(run.jobName)}</td>
                <td style={{ padding: "12px 20px" }}><Badge status={run.status} /></td>
                <td style={{ padding: "12px 20px", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{fmtDateTime(run.startedAt)}</td>
                <td style={{ padding: "12px 20px", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{fmtDuration(run.durationMs)}</td>
                <td style={{ padding: "12px 20px", fontSize: 12, color: C.muted }}>{run.recordsProcessed}</td>
                <td style={{ padding: "12px 20px", fontSize: 12, color: run.recordsFailed > 0 ? C.accent : C.muted }}>{run.recordsFailed}</td>
                <td style={{ padding: "12px 20px", fontSize: 12, color: C.muted, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={run.errorMessage ?? undefined}>
                  {run.errorMessage ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminSystemHealthPage() {
  const [data, setData]       = useState<SystemHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [jobFilter, setJobFilter] = useState<string>("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = {};
    if (jobFilter !== "ALL") params.job = jobFilter;
    const res = await adminApi.getSystemHealth(params);
    if (res.success) {
      setData((res.data as SystemHealthResponse) ?? { jobs: [], recentRuns: [] });
    } else {
      setError(res.error ?? "Could not load system health.");
    }
    setLoading(false);
  }, [jobFilter]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <LoadingPage />;

  return (
    <div className="admin-page-root min-h-screen px-4 sm:px-6 pt-6 pb-8 md:px-8" style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.text }}>System Health</h1>
          <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 14 }}>Scheduled background jobs — read-only view of JobRunLog</p>
        </div>
        <button onClick={load} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.secondary, borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
          ↻ Refresh
        </button>
      </div>

      {error ? (
        <ErrorState message={error} retry={load} title="Could not load system health" />
      ) : (
        <>
          {/* Job cards */}
          {data && data.jobs.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "48px 24px", textAlign: "center", color: C.muted, marginBottom: 28 }}>
              No scheduled-job runs recorded yet.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginBottom: 28 }}>
              {data?.jobs.map(job => <JobCard key={job.jobName} job={job} />)}
            </div>
          )}

          {/* Recent runs */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Recent runs</h2>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["ALL", ...(data?.jobs.map(j => j.jobName) ?? [])].map(name => (
                <button
                  key={name}
                  onClick={() => setJobFilter(name)}
                  style={{
                    padding: "5px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    background: jobFilter === name ? C.accent : "transparent",
                    color: jobFilter === name ? "#fff" : C.muted,
                    border: `1px solid ${jobFilter === name ? C.accent : C.border}`,
                    fontFamily: "inherit",
                  }}
                >
                  {name === "ALL" ? "All" : jobLabel(name)}
                </button>
              ))}
            </div>
          </div>

          <RecentRunsTable runs={data?.recentRuns ?? []} loading={loading} />
          <div style={{ marginTop: 10, fontSize: 12, color: C.muted }}>
            Showing the last {data?.recentRuns.length ?? 0} run{(data?.recentRuns.length ?? 0) !== 1 ? "s" : ""}{jobFilter !== "ALL" ? ` for ${jobLabel(jobFilter)}` : ""}.
          </div>
        </>
      )}
    </div>
  );
}
