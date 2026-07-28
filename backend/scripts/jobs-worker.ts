// backend/scripts/jobs-worker.ts
// Standalone BullMQ Worker process for the "directhire" queue — the
// general-purpose ad-hoc queue that enqueue() (src/services/queue/index.ts)
// pushes to whenever JOBS_INLINE_MODE is not "true". Until this file
// existed, nothing ever consumed that queue in production: jobs pushed via
// enqueue() (email.*, scoring.calculateMatchScores) were added to Redis and
// never processed. This does not touch the separate "directhire-scheduled"
// queue/Worker (cron-repeat jobs), which already has its own consumer
// embedded in services/scheduler.ts's startBullMQWorker() — that one runs
// inside the main web server process (started from server.ts); this one is
// meant to run as its own long-lived process (see package.json's "worker"
// script), same idea as a separate Railway service/dyno.
//
// Dispatch mirrors scheduler.ts's startBullMQWorker() exactly: same
// connection shape, same concurrency, same job.name switch structure, same
// worker.on("failed", ...) logging. The actual handler logic is NOT
// duplicated here — every case delegates to processJob() (services/queue/
// index.ts), the single shared function also used by the dev-mode inline
// processor, so there is one source of truth for what each job name does.

import "dotenv/config";

if (!process.env.REDIS_URL) {
  console.error("FATAL: REDIS_URL is not set — the jobs-worker process has nothing to connect to.");
  process.exit(1);
}

async function main(): Promise<void> {
  const { Worker } = await import("bullmq");
  const { processJob } = await import("../src/services/queue");
  const connection = { url: process.env.REDIS_URL! };

  const worker = new Worker(
    "directhire",
    async (job) => {
      switch (job.name) {
        case "email.welcome":
          await processJob("email.welcome", job.data);
          break;
        case "email.passwordReset":
          await processJob("email.passwordReset", job.data);
          break;
        case "email.onboardingReminder":
          await processJob("email.onboardingReminder", job.data);
          break;
        case "email.onboardingSubmitted":
          await processJob("email.onboardingSubmitted", job.data);
          break;
        case "email.accountApproved":
          await processJob("email.accountApproved", job.data);
          break;
        case "email.accountRejected":
          await processJob("email.accountRejected", job.data);
          break;
        case "email.needsChanges":
          await processJob("email.needsChanges", job.data);
          break;
        case "email.adminNewSubmission":
          await processJob("email.adminNewSubmission", job.data);
          break;
        case "scoring.calculateMatchScores":
          await processJob("scoring.calculateMatchScores", job.data);
          break;
        case "fraud.analyzeUser":
          // Declared as a JobName and accepted here, but never actually
          // enqueued anywhere in the codebase today, and processJob() has no
          // handler case for it either (falls through to its own "no
          // processor registered" log) — matches the pre-existing dev-mode
          // inline behavior exactly; not a gap introduced by this file.
          await processJob("fraud.analyzeUser", job.data);
          break;
        case "seo.generateJobMetadata":
          await processJob("seo.generateJobMetadata", job.data);
          break;
        case "growth.runAgentTask":
          await processJob("growth.runAgentTask", job.data);
          break;
        default:
          console.warn(`[jobs-worker] Unknown job: ${job.name}`);
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[jobs-worker] Job ${job?.name} failed:`, err);
  });

  console.log("[jobs-worker] BullMQ worker started for \"directhire\" queue");

  // scheduler.ts's embedded worker has no shutdown handling of its own — it
  // shares the Express process's lifecycle, which also has none. This
  // process has no such host, so without this, Railway's SIGTERM on
  // redeploy would kill it mid-job instead of letting BullMQ finish the
  // in-flight job and close the Redis connection cleanly.
  const shutdown = async (signal: string) => {
    console.log(`[jobs-worker] ${signal} received, closing worker...`);
    await worker.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[jobs-worker] Fatal startup error:", err);
  process.exit(1);
});
