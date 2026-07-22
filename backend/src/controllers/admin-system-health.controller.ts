// backend/src/controllers/admin-system-health.controller.ts
// Read-only surface over JobRunLog for the /admin/system page — one endpoint,
// requireAdmin, no writes. The list of known jobs is derived from whatever
// jobName values actually exist in JobRunLog (never hardcoded), so a job
// that's scheduled (scheduler.ts) but doesn't call writeJobLog — currently
// runOnboardingReminders, see services/queue/index.ts — simply won't appear
// here until/unless it's wired to log a run, rather than showing a fake row.

import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { ok } from "../lib/response";

// Expected interval per known job, in minutes — used only to compute the
// "stale" badge (no run within 2x expected interval). Mirrors the schedules
// registered in services/scheduler.ts. subscription-expiry-warnings is
// piggybacked inside lock-daily-billing's own run (see scheduler.ts's doc
// comment — not a separate registration), so it shares that daily cadence.
// A jobName with no entry here just skips the staleness check rather than
// guessing — never marked stale, since "no known interval" isn't the same
// claim as "on time".
const EXPECTED_INTERVAL_MINUTES: Record<string, number> = {
  "health-monitor":                 15,
  "lock-expiry-processor":          60,
  "lock-daily-billing":             24 * 60,
  "subscription-expiry-warnings":   24 * 60,
  "match-score-recalc":             24 * 60,
  "onboarding-reminders":           24 * 60,
};

interface JobRunRow {
  id:                string;
  job_name:          string;
  status:            string;
  records_processed: number;
  records_failed:    number;
  error_message:      string | null;
  started_at:        Date;
  completed_at:      Date;
  duration_ms:       number;
}

function serializeRun(r: JobRunRow) {
  return {
    id:               r.id,
    jobName:          r.job_name,
    status:           r.status,
    recordsProcessed: r.records_processed,
    recordsFailed:    r.records_failed,
    errorMessage:     r.error_message,
    startedAt:        r.started_at,
    completedAt:      r.completed_at,
    durationMs:       r.duration_ms,
  };
}

// ── GET /admin/system-health?job=<jobName> ────────────────────────────────────

export async function getSystemHealth(req: Request, res: Response, next: NextFunction) {
  try {
    const { job } = req.query as Record<string, string>;

    // Latest run per distinct job name — DISTINCT ON is the standard Postgres
    // idiom for "one row per group, the newest one"; Prisma's groupBy() only
    // aggregates and can't return full rows, so raw SQL is the direct route
    // here (same precedent as webhook.controller.ts / admin-jobs.controller.ts
    // using $queryRaw for things the query builder can't express).
    const latestPerJob = await prisma.$queryRaw<JobRunRow[]>`
      SELECT DISTINCT ON (job_name)
        id, job_name, status, records_processed, records_failed,
        error_message, started_at, completed_at, duration_ms
      FROM job_run_logs
      ORDER BY job_name, started_at DESC
    `;

    const now = Date.now();
    const jobs = latestPerJob
      .map(serializeRun)
      .sort((a, b) => a.jobName.localeCompare(b.jobName))
      .map((run) => {
        const expectedMinutes = EXPECTED_INTERVAL_MINUTES[run.jobName];
        const staleThresholdMs = expectedMinutes != null ? expectedMinutes * 60 * 1000 * 2 : null;
        const isStale = staleThresholdMs != null && (now - new Date(run.startedAt).getTime()) > staleThresholdMs;
        return { jobName: run.jobName, lastRun: run, isStale };
      });

    const recentRuns = await prisma.jobRunLog.findMany({
      where:   job ? { jobName: job } : undefined,
      orderBy: { startedAt: "desc" },
      take:    50,
      select: {
        id: true, jobName: true, status: true, recordsProcessed: true,
        recordsFailed: true, errorMessage: true, startedAt: true,
        completedAt: true, durationMs: true,
      },
    });

    return ok(res, { jobs, recentRuns });
  } catch (e) { next(e); }
}
