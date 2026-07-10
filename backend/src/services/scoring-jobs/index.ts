// backend/src/services/scoring-jobs/index.ts
// Nightly job — refreshes Application.matchScore so it doesn't go stale.
//
// Scope decision (roadmap #6): with page-local scoring already live in the
// worker job feed (worker.controller.ts's getJobs/getJob), a full worker×job
// score-matrix background job would be duplicate infrastructure computing
// scores nobody stores or reads. What's actually missing is narrower: once a
// worker has APPLIED to a job, Application.matchScore is a snapshot from
// application time — if the worker's profile changes (new skill, updated
// salary expectation) or the job posting changes (employer edits required
// skills) afterward, that stored score silently goes stale. This job closes
// that gap ONLY: it recomputes matchScore for applications still in an
// active status (APPLIED/VIEWED/SHORTLISTED — terminal statuses don't need a
// fresh number) whose job or worker profile was touched since this job's own
// last successful run.
//
// '02:15 UTC daily' — scheduler.ts.

import prisma from "../../lib/prisma";
import { calculateMatchScore, type ScoringWorker, type ScoringJob } from "../matching";

const JOB_NAME    = "match-score-recalc";
const BATCH_SIZE  = 200;
const ACTIVE_STATUSES = ["APPLIED", "VIEWED", "SHORTLISTED"] as const;

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

export async function runMatchScoreRecalc(): Promise<void> {
  const startedAt = new Date();
  console.log(`[${JOB_NAME}] Starting at ${startedAt.toISOString()}`);

  // "Since last run" = the most recent successful/partial run of THIS job.
  // No prior run (first-ever execution, or every prior run failed outright)
  // → fall back to the epoch so the first run establishes a full baseline.
  const lastRun = await prisma.jobRunLog.findFirst({
    where:   { jobName: JOB_NAME, status: { in: ["success", "partial"] } },
    orderBy: { startedAt: "desc" },
    select:  { startedAt: true },
  });
  const since = lastRun?.startedAt ?? new Date(0);

  const candidates = await prisma.application.findMany({
    where: {
      status: { in: [...ACTIVE_STATUSES] },
      OR: [
        { job:    { updatedAt: { gte: since } } },
        { worker: { workerProfile: { updatedAt: { gte: since } } } },
      ],
    },
    select: {
      id: true,
      job: {
        select: {
          requiredSkills:     true,
          salaryMin:          true,
          salaryMax:          true,
          country:            true,
          experienceRequired: true,
        },
      },
      worker: {
        select: {
          workerProfile: {
            select: {
              skills:             { select: { skill: true } },
              yearsExperience:    true,
              expectedSalary:     true,
              targetCountries:    { select: { country: true } },
              countryOfResidence: true,
              trustScore:         true,
            },
          },
        },
      },
    },
  });

  console.log(`[${JOB_NAME}] Found ${candidates.length} application(s) to recompute (since ${since.toISOString()})`);

  let processed = 0;
  let failed    = 0;

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (app) => {
      try {
        // Applicant has no WorkerProfile row (shouldn't happen post-onboarding,
        // but the same defensive stance as worker.controller.ts's scoringWorker
        // applies) — nothing to score against, skip without counting as failed.
        if (!app.worker.workerProfile) return;

        const scoringWorker: ScoringWorker = app.worker.workerProfile;
        const scoringJob:    ScoringJob    = app.job;
        const matchScore = calculateMatchScore(scoringWorker, scoringJob);

        await prisma.application.update({
          where: { id: app.id },
          data:  { matchScore },
        });
        processed++;
      } catch (err) {
        failed++;
        console.error(`[${JOB_NAME}] Failed for application ${app.id}:`, err);
      }
    }));
  }

  const status: "success" | "partial" | "failed" =
    failed === 0              ? "success"
    : failed === candidates.length && candidates.length > 0 ? "failed"
    : "partial";

  await writeJobLog({ status, recordsProcessed: processed, recordsFailed: failed, startedAt });

  console.log(`[${JOB_NAME}] Done — processed: ${processed}, failed: ${failed}`);
}
