// backend/src/services/health-monitor/index.ts
// Production health monitor — runs every 15 minutes (scheduler.ts, ':00/:15/
// :30/:45' UTC), checking four internal signals: the public jobs endpoint,
// this server's own /api/health liveness route, a DB roundtrip, and (when
// STORAGE_PROVIDER=supabase) storage connectivity. Each check is independent
// and non-fatal — one failing check never stops the others from running or
// being logged.
//
// SELF-AWARENESS LIMIT — read before treating this as sufficient monitoring:
// this job runs INSIDE the backend process it's checking. If the backend
// itself is fully down — process crashed, or the Railway-trial-expiry
// scenario this project has already hit once in its own history (see
// docs/DEPLOYMENT_OPERATIONS.md) — this monitor cannot run at all, and will
// not alert anyone. It only catches PARTIAL failures (a dependency down
// while the process itself is still up and able to run its own scheduler).
// Total-outage coverage requires an EXTERNAL monitor that pings this server
// from outside it — see the UptimeRobot recommendation in this feature's
// build output; that setup is a manual browser step, not something this
// file can do for itself.
//
// Alerting is EmailLog-based, reusing the exact same "reuse EmailLog instead
// of a new column/table" cooldown pattern as runOnboardingReminders' 7-day
// cooldown (services/queue/index.ts): each alert/recovery email is logged
// with `variables: { check, kind }`, and the most recent email per check
// (looked up once per run) tells us both (a) whether we're still inside the
// 60-minute alert cooldown, and (b) whether a just-passing check was
// previously failing and therefore needs a recovery email.

import prisma from "../../lib/prisma";
import { sendHealthCheckAlertEmail, sendHealthCheckRecoveryEmail } from "../email";

const JOB_NAME     = "health-monitor";
const COOLDOWN_MS  = 60 * 60 * 1000;          // 60 minutes — re-alert cadence for an ongoing failure
const LOOKBACK_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days — just needs to find the most recent email per check

interface CheckResult {
  name:       string;
  ok:         boolean;
  skipped?:   boolean;
  error?:     string;
  durationMs: number;
}

function backendUrl(): string {
  return process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
}

// Real HTTP calls against this server's own routes (not direct controller
// calls) — deliberately exercises the full path (routing, middleware, CORS,
// rate limiter, JSON parsing), the same path a real user's request takes.

async function checkPublicJobsEndpoint(): Promise<CheckResult> {
  const name  = "public-jobs-endpoint";
  const start = Date.now();
  try {
    const res = await fetch(`${backendUrl()}/api/public/jobs?limit=1`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { success?: boolean };
    if (json?.success !== true) throw new Error(`Response missing { success: true } — got ${JSON.stringify(json).slice(0, 200)}`);
    return { name, ok: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, ok: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - start };
  }
}

async function checkHealthEndpoint(): Promise<CheckResult> {
  const name  = "health-endpoint";
  const start = Date.now();
  try {
    const res = await fetch(`${backendUrl()}/api/health`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { status?: string };
    if (json?.status !== "ok") throw new Error(`Response missing { status: "ok" } — got ${JSON.stringify(json).slice(0, 200)}`);
    return { name, ok: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, ok: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - start };
  }
}

async function checkDatabase(): Promise<CheckResult> {
  const name  = "database";
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name, ok: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, ok: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - start };
  }
}

async function checkStorage(): Promise<CheckResult> {
  const name  = "storage";
  const start = Date.now();
  if (process.env.STORAGE_PROVIDER !== "supabase") {
    // Local-disk storage has no remote service to probe — nothing cheap to
    // check, so this is explicitly skipped rather than faked as passing.
    return { name, ok: true, skipped: true, durationMs: 0 };
  }
  try {
    const { checkStorageConnectivity } = await import("../storage");
    await checkStorageConnectivity();
    return { name, ok: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, ok: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - start };
  }
}

// ── Alert history — one query per run, not per check ──────────────────────────

async function getLastAlertEmailByCheck(): Promise<Map<string, { kind: string; createdAt: Date }>> {
  const since = new Date(Date.now() - LOOKBACK_MS);
  const rows = await prisma.emailLog.findMany({
    where:   { emailType: "SYSTEM_HEALTH_ALERT", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select:  { variables: true, createdAt: true },
  });

  const map = new Map<string, { kind: string; createdAt: Date }>();
  for (const row of rows) {
    const vars = row.variables as { check?: string; kind?: string } | null;
    if (!vars?.check || map.has(vars.check)) continue; // rows are already desc — first hit per check is the most recent
    map.set(vars.check, { kind: vars.kind ?? "alert", createdAt: row.createdAt });
  }
  return map;
}

async function writeJobLog(opts: {
  status:           "success" | "partial" | "failed";
  recordsProcessed: number;
  recordsFailed:    number;
  errorMessage?:    string;
  startedAt:        Date;
}) {
  const completedAt = new Date();
  await prisma.jobRunLog.create({
    data: {
      jobName:          JOB_NAME,
      status:           opts.status,
      recordsProcessed: opts.recordsProcessed,
      recordsFailed:    opts.recordsFailed,
      errorMessage:     opts.errorMessage ?? null,
      startedAt:        opts.startedAt,
      completedAt,
      durationMs:       completedAt.getTime() - opts.startedAt.getTime(),
    },
  });
}

export async function runHealthCheck(): Promise<void> {
  const startedAt = new Date();
  console.log(`[${JOB_NAME}] Starting at ${startedAt.toISOString()}`);

  const results = await Promise.all([
    checkPublicJobsEndpoint(),
    checkHealthEndpoint(),
    checkDatabase(),
    checkStorage(),
  ]);

  const lastAlertByCheck = await getLastAlertEmailByCheck().catch((e) => {
    console.error(`[${JOB_NAME}] Failed to read alert history — proceeding without cooldown/recovery awareness this run:`, e);
    return new Map<string, { kind: string; createdAt: Date }>();
  });

  const timestamp = startedAt.toISOString();
  let failed = 0;

  for (const result of results) {
    if (result.skipped) {
      console.log(`[${JOB_NAME}] ${result.name}: SKIPPED (no cheap check available for this storage provider)`);
      continue;
    }

    const last = lastAlertByCheck.get(result.name);

    if (!result.ok) {
      failed++;
      console.error(`[${JOB_NAME}] ${result.name}: FAILING — ${result.error}`);

      const cooldownActive = !!last && last.kind === "alert" && (Date.now() - last.createdAt.getTime()) < COOLDOWN_MS;
      if (!cooldownActive) {
        await sendHealthCheckAlertEmail(result.name, result.error ?? "unknown error", timestamp)
          .catch((e) => console.error(`[${JOB_NAME}] Failed to send alert email for ${result.name}:`, e));
      } else {
        console.log(`[${JOB_NAME}] ${result.name}: alert suppressed — within 60-minute cooldown`);
      }
    } else {
      console.log(`[${JOB_NAME}] ${result.name}: OK (${result.durationMs}ms)`);

      if (last?.kind === "alert") {
        await sendHealthCheckRecoveryEmail(result.name, timestamp)
          .catch((e) => console.error(`[${JOB_NAME}] Failed to send recovery email for ${result.name}:`, e));
      }
    }
  }

  const checkedCount = results.filter((r) => !r.skipped).length;
  const status: "success" | "partial" | "failed" =
    failed === 0 ? "success" : failed === checkedCount ? "failed" : "partial";

  await writeJobLog({
    status,
    recordsProcessed: checkedCount - failed,
    recordsFailed:    failed,
    errorMessage:     failed > 0 ? results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`).join("; ") : undefined,
    startedAt,
  }).catch((e) => console.error(`[${JOB_NAME}] Failed to write JobRunLog:`, e));

  console.log(`[${JOB_NAME}] Done — ${checkedCount - failed}/${checkedCount} passing`);
}
