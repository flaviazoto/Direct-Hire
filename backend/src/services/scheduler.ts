// src/services/scheduler.ts
// Registers scheduled background jobs on app startup.
//
// Strategy:
//   Production (REDIS_URL set): BullMQ repeat jobs + Worker process
//   Dev / serverless (JOBS_INLINE_MODE=true or no Redis): setInterval scheduler
//
// Schedules:
//   lock-daily-billing    '5 0 * * *'   (00:05 UTC daily)
//   lock-expiry-processor '15 * * * *'  (every hour at :15)

import { runLockDailyBilling, runLockExpiryProcessor } from "./lock-jobs";

const LOCK_DAILY_BILLING_CRON    = "5 0 * * *";
const LOCK_EXPIRY_PROCESSOR_CRON = "15 * * * *";

// ── cron → ms helper (only for setInterval fallback) ─────────────────────────
// Returns the milliseconds until the next scheduled fire time.
// We compute on startup and then re-compute after each run.

function msUntilNextCronFire(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(hour, minute, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

function msUntilNextHourlyMinute(minute: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCMinutes(minute, 0, 0);
  if (next <= now) next.setUTCHours(next.getUTCHours() + 1);
  return next.getTime() - now.getTime();
}

// ── Inline / dev scheduler using setTimeout chains ────────────────────────────

function scheduleRecurringDaily(
  name: string,
  hour: number,
  minute: number,
  fn: () => Promise<void>,
): void {
  const delay = msUntilNextCronFire(hour, minute);
  console.log(
    `[Scheduler] ${name} scheduled in ${Math.round(delay / 60000)} min (next ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} UTC)`,
  );
  setTimeout(async function tick() {
    try {
      await fn();
    } catch (err) {
      console.error(`[Scheduler] ${name} error:`, err);
    }
    // Reschedule for tomorrow same time
    const nextDelay = msUntilNextCronFire(hour, minute);
    setTimeout(tick, nextDelay);
  }, delay);
}

function scheduleRecurringHourly(
  name: string,
  minute: number,
  fn: () => Promise<void>,
): void {
  const delay = msUntilNextHourlyMinute(minute);
  console.log(
    `[Scheduler] ${name} scheduled in ${Math.round(delay / 60000)} min (every hour at :${minute.toString().padStart(2, "0")} UTC)`,
  );
  setTimeout(async function tick() {
    try {
      await fn();
    } catch (err) {
      console.error(`[Scheduler] ${name} error:`, err);
    }
    // Reschedule for next hour same minute
    const nextDelay = msUntilNextHourlyMinute(minute);
    setTimeout(tick, nextDelay);
  }, delay);
}

// ── BullMQ scheduler (production) ────────────────────────────────────────────

async function registerBullMQJobs(): Promise<void> {
  const { Queue } = await import("bullmq");
  const connection = { url: process.env.REDIS_URL! };

  const queue = new Queue("directhire-scheduled", { connection });

  // BullMQ v5: use upsertJobScheduler for cron repeats
  await queue.upsertJobScheduler(
    "lock-daily-billing",
    { pattern: LOCK_DAILY_BILLING_CRON, tz: "UTC" },
    { name: "lock-daily-billing", data: {} },
  );

  await queue.upsertJobScheduler(
    "lock-expiry-processor",
    { pattern: LOCK_EXPIRY_PROCESSOR_CRON, tz: "UTC" },
    { name: "lock-expiry-processor", data: {} },
  );

  await queue.close();
  console.log("[Scheduler] BullMQ repeat jobs registered: lock-daily-billing, lock-expiry-processor");
}

// ── BullMQ Worker process (processes scheduled jobs from queue) ───────────────

export async function startBullMQWorker(): Promise<void> {
  const { Worker } = await import("bullmq");
  const connection = { url: process.env.REDIS_URL! };

  const worker = new Worker(
    "directhire-scheduled",
    async (job) => {
      switch (job.name) {
        case "lock-daily-billing":
          await runLockDailyBilling();
          break;
        case "lock-expiry-processor":
          await runLockExpiryProcessor();
          break;
        default:
          console.warn(`[BullMQ Worker] Unknown job: ${job.name}`);
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[BullMQ Worker] Job ${job?.name} failed:`, err);
  });

  console.log("[Scheduler] BullMQ worker started for directhire-scheduled queue");
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function startScheduler(): Promise<void> {
  const useRedis = !!process.env.REDIS_URL && process.env.JOBS_INLINE_MODE !== "true";

  if (useRedis) {
    try {
      await registerBullMQJobs();
      await startBullMQWorker();
      return;
    } catch (err) {
      console.warn("[Scheduler] BullMQ unavailable, falling back to inline scheduler:", err);
    }
  }

  // Inline scheduler — works in dev and serverless environments without Redis
  console.log("[Scheduler] Using inline setTimeout scheduler (no Redis)");
  scheduleRecurringDaily("lock-daily-billing",    0, 5,  runLockDailyBilling);
  scheduleRecurringHourly("lock-expiry-processor", 15,   runLockExpiryProcessor);
}
