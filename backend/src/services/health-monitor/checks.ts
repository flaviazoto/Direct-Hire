// backend/src/services/health-monitor/checks.ts
// Operational checks run every 15 minutes by the health monitor, alongside
// the endpoint/database/storage probes in index.ts. Each returns the same
// CheckResult shape, so the existing alert / cooldown / recovery-email logic
// applies unchanged.
//
// Thresholds are PROVISIONAL, set for today's very low traffic, and can be
// tuned per environment without a deploy (see docs/MONITORING.md).

import prisma from "../../lib/prisma";
import { EXPECTED_INTERVAL_MINUTES } from "../../lib/job-schedule";

export interface CheckResult {
  name:       string;
  ok:         boolean;
  skipped?:   boolean;
  error?:     string;
  durationMs: number;
}

const num = (key: string, fallback: number) => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const THRESHOLDS = {
  jobLateFactor:        num("MONITOR_JOB_LATE_FACTOR", 1.5),      // × expected interval
  jobGraceMinutes:      num("MONITOR_JOB_GRACE_MINUTES", 15),
  uploadFailuresPerHour: num("MONITOR_UPLOAD_FAILURES_PER_HOUR", 1),
  emailFailuresPerHour:  num("MONITOR_EMAIL_FAILURES_PER_HOUR", 3),
  dbLatencyMs:          num("MONITOR_DB_LATENCY_MS", 2000),
  dbConnectionsMax:     num("MONITOR_DB_CONNECTIONS_MAX", 40),
  rssMb:                num("MONITOR_RSS_MB", 450),
  restartsPerHour:      num("MONITOR_RESTARTS_PER_HOUR", 4),
};

async function timed(name: string, fn: () => Promise<string | null>): Promise<CheckResult> {
  const start = Date.now();
  try {
    const problem = await fn();
    return problem ? { name, ok: false, error: problem, durationMs: Date.now() - start } : { name, ok: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, ok: false, error: `check could not run: ${e instanceof Error ? e.message : String(e)}`, durationMs: Date.now() - start };
  }
}

const hourAgo = () => new Date(Date.now() - 60 * 60 * 1000);

/** A scheduled job that stopped running, or whose latest run failed. */
export function checkScheduledJobs(): Promise<CheckResult> {
  return timed("scheduled-jobs", async () => {
    const problems: string[] = [];
    for (const [job, minutes] of Object.entries(EXPECTED_INTERVAL_MINUTES)) {
      if (job === "health-monitor") continue; // this run is the proof it's alive
      const latest = await prisma.jobRunLog.findFirst({ where: { jobName: job }, orderBy: { startedAt: "desc" } });
      const lateAfterMs = (minutes * THRESHOLDS.jobLateFactor + THRESHOLDS.jobGraceMinutes) * 60_000;
      if (!latest) { problems.push(`${job}: never ran`); continue; }
      const ageMin = Math.round((Date.now() - latest.startedAt.getTime()) / 60_000);
      if (Date.now() - latest.startedAt.getTime() > lateAfterMs) problems.push(`${job}: last ran ${ageMin} min ago (expected every ${minutes} min)`);
      else if (latest.status === "failed") problems.push(`${job}: last run failed — ${(latest.errorMessage ?? "").slice(0, 120)}`);
    }
    return problems.length ? problems.join("; ") : null;
  });
}

/** Storage uploads failing (status FAILED is only set when the storage call throws). */
export function checkUploadFailures(): Promise<CheckResult> {
  return timed("upload-failures", async () => {
    const n = await prisma.upload.count({ where: { status: "FAILED", uploadedAt: { gte: hourAgo() } } });
    return n >= THRESHOLDS.uploadFailuresPerHour ? `${n} failed upload(s) in the last hour` : null;
  });
}

/** Email delivery failing or bouncing (health-alert emails themselves excluded). */
export function checkEmailDelivery(): Promise<CheckResult> {
  return timed("email-delivery", async () => {
    const n = await prisma.emailLog.count({
      where: { status: { in: ["FAILED", "BOUNCED"] }, emailType: { not: "SYSTEM_HEALTH_ALERT" }, createdAt: { gte: hourAgo() } },
    });
    return n >= THRESHOLDS.emailFailuresPerHour ? `${n} failed or bounced email(s) in the last hour` : null;
  });
}

/** Database round-trip time (average of 3), the main latency driver measured in production. */
export function checkDatabaseLatency(): Promise<CheckResult> {
  return timed("database-latency", async () => {
    const samples: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      samples.push(Date.now() - t);
    }
    const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
    return avg > THRESHOLDS.dbLatencyMs ? `average query round trip ${avg} ms (threshold ${THRESHOLDS.dbLatencyMs} ms)` : null;
  });
}

/** Connections held open on the database (pool exhaustion / connection leak). */
export function checkDatabaseConnections(): Promise<CheckResult> {
  return timed("database-connections", async () => {
    const rows = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database()`;
    const n = rows[0]?.n ?? 0;
    return n > THRESHOLDS.dbConnectionsMax ? `${n} database connections open (threshold ${THRESHOLDS.dbConnectionsMax})` : null;
  });
}

/** Memory held by this API process. */
export function checkMemory(): Promise<CheckResult> {
  return timed("memory", async () => {
    const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    return rssMb > THRESHOLDS.rssMb ? `API process using ${rssMb} MB (threshold ${THRESHOLDS.rssMb} MB)` : null;
  });
}

/** Crash loop: the API keeps restarting (each start is logged by recordProcessStart). */
export function checkRestarts(): Promise<CheckResult> {
  return timed("restarts", async () => {
    const n = await prisma.jobRunLog.count({ where: { jobName: PROCESS_START_JOB, startedAt: { gte: hourAgo() } } });
    return n >= THRESHOLDS.restartsPerHour ? `API started ${n} times in the last hour` : null;
  });
}

export const PROCESS_START_JOB = "process-start";

/** Called once at boot so restarts and deploys are visible in JobRunLog. */
export async function recordProcessStart(): Promise<void> {
  const now = new Date();
  await prisma.jobRunLog.create({
    data: {
      jobName: PROCESS_START_JOB, status: "success", recordsProcessed: 0, recordsFailed: 0,
      errorMessage: `commit ${(process.env.RAILWAY_GIT_COMMIT_SHA ?? "unknown").slice(0, 7)}`,
      startedAt: now, completedAt: now, durationMs: 0,
    },
  });
}
