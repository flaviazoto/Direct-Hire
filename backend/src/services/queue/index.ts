// src/services/queue/index.ts
// BullMQ-backed job queue.
// In development (JOBS_INLINE_MODE=true) jobs run synchronously.
// In production, a separate worker process (scripts/jobs-worker.ts) processes them.

export type JobName =
  | "email.welcome"
  | "email.passwordReset"
  | "email.onboardingReminder"
  | "email.onboardingSubmitted"
  | "email.accountApproved"
  | "email.accountRejected"
  | "email.needsChanges"
  | "email.adminNewSubmission"
  | "scoring.calculateWorkerScore"
  | "scoring.calculateMatchScores"
  | "fraud.analyzeUser";

export interface JobPayload {
  "email.welcome":               { userId: string; to: string; firstName: string; role: "WORKER" | "EMPLOYER" };
  "email.passwordReset":         { userId: string; to: string; resetUrl: string };
  "email.onboardingReminder":    { userId: string; to: string; firstName: string; continueUrl: string; completionPct: number };
  "email.onboardingSubmitted":   { userId: string; to: string; name: string; role: "WORKER" | "EMPLOYER" };
  "email.accountApproved":       { userId: string; to: string; name: string; role: "WORKER" | "EMPLOYER" };
  "email.accountRejected":       { userId: string; to: string; name: string; reason: string };
  "email.needsChanges":          { userId: string; to: string; name: string; changes: string };
  "email.adminNewSubmission":    { submitterEmail: string; submitterRole: string; submitterName: string };
  "scoring.calculateWorkerScore":{ workerId: string };
  "scoring.calculateMatchScores":{ jobPostId: string };
  "fraud.analyzeUser":           { userId: string };
}

// ── Inline processor (dev mode) ───────────────────────────────
async function processInline<N extends JobName>(
  name: N,
  data: JobPayload[N]
) {
  const emailSvc = await import("../email");
  switch (name) {
    case "email.welcome": {
      const d = data as JobPayload["email.welcome"];
      await emailSvc.sendWelcomeEmail(d.userId, d.to, d.firstName, d.role);
      break;
    }
    case "email.passwordReset": {
      const d = data as JobPayload["email.passwordReset"];
      await emailSvc.sendPasswordReset(d.userId, d.to, d.resetUrl);
      break;
    }
    case "email.onboardingReminder": {
      const d = data as JobPayload["email.onboardingReminder"];
      await emailSvc.sendOnboardingReminder(d.userId, d.to, d.firstName, d.continueUrl, d.completionPct);
      break;
    }
    case "email.onboardingSubmitted": {
      const d = data as JobPayload["email.onboardingSubmitted"];
      await emailSvc.sendOnboardingSubmitted(d.userId, d.to, d.name, d.role);
      break;
    }
    case "email.accountApproved": {
      const d = data as JobPayload["email.accountApproved"];
      await emailSvc.sendAccountApproved(d.userId, d.to, d.name, d.role);
      break;
    }
    case "email.accountRejected": {
      const d = data as JobPayload["email.accountRejected"];
      await emailSvc.sendAccountRejected(d.userId, d.to, d.name, d.reason);
      break;
    }
    case "email.needsChanges": {
      const d = data as JobPayload["email.needsChanges"];
      await emailSvc.sendNeedsChanges(d.userId, d.to, d.name, d.changes);
      break;
    }
    case "email.adminNewSubmission": {
      const d = data as JobPayload["email.adminNewSubmission"];
      await emailSvc.sendAdminNewSubmission(d.submitterEmail, d.submitterRole, d.submitterName);
      break;
    }
    case "scoring.calculateMatchScores": {
      const d = data as JobPayload["scoring.calculateMatchScores"];
      await notifyMatchingWorkersForApprovedJob(d.jobPostId);
      break;
    }
    default:
      console.log(`[Queue] Job ${name} — no inline processor, skipping.`);
  }
}

// ── scoring.calculateMatchScores processor ─────────────────────
// Triggered by admin-jobs.controller.ts's approveJob via enqueue(), never
// awaited there — admin approval must not wait on scoring. Reuses the same
// weighted match formula the worker feed already uses (services/matching):
// scores every VERIFIED worker with a profile against the newly-approved
// job, notifies the top 20 scoring >= 70%. Runs once per approval, for one
// job — NOT a general worker×job score-matrix job (explicitly out of scope;
// see runMatchScoreRecalc in services/scoring-jobs for the separate nightly
// staleness-refresh job that covers already-submitted applications).
export async function notifyMatchingWorkersForApprovedJob(jobPostId: string): Promise<void> {
  const prisma = (await import("../../lib/prisma")).default;
  const { calculateMatchScore } = await import("../matching");

  const job = await prisma.jobPost.findUnique({
    where:  { id: jobPostId },
    select: {
      id: true, title: true,
      requiredSkills: true, salaryMin: true, salaryMax: true,
      country: true, experienceRequired: true,
    },
  });
  if (!job) {
    console.warn(`[scoring.calculateMatchScores] JobPost ${jobPostId} not found — skipping`);
    return;
  }

  const workers = await prisma.workerProfile.findMany({
    where: { user: { role: "WORKER", accountStatus: "VERIFIED" } },
    select: {
      userId:             true,
      firstName:          true,
      skills:             { select: { skill: true } },
      yearsExperience:    true,
      expectedSalary:     true,
      targetCountries:    { select: { country: true } },
      countryOfResidence: true,
      trustScore:         true,
      user:               { select: { email: true } },
    },
  });

  const topMatches = workers
    .map((w) => ({
      userId:    w.userId,
      email:     w.user.email,
      firstName: w.firstName ?? "there",
      score: calculateMatchScore(
        {
          skills:             w.skills,
          yearsExperience:    w.yearsExperience,
          expectedSalary:     w.expectedSalary,
          targetCountries:    w.targetCountries,
          countryOfResidence: w.countryOfResidence,
          trustScore:         w.trustScore,
        },
        {
          requiredSkills:     job.requiredSkills,
          salaryMin:          job.salaryMin,
          salaryMax:          job.salaryMax,
          country:            job.country,
          experienceRequired: job.experienceRequired,
        },
      ),
    }))
    .filter((s) => s.score >= 70)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  if (topMatches.length === 0) {
    console.log(`[scoring.calculateMatchScores] No workers >=70% match for job ${jobPostId}`);
    return;
  }

  await prisma.notification.createMany({
    data: topMatches.map((m) => ({
      userId: m.userId,
      title:  `New job matches your profile — ${Math.round(m.score)}% match`,
      body:   `"${job.title}" looks like a strong fit for your profile.`,
      type:   "JOB_MATCH",
      link:   "/worker/jobs",
    })),
  });

  // Email sibling of the bell above — suppressible (JOB_MATCH is classified
  // non-transactional in lib/unsubscribe.ts), sendEmail's central gate
  // already skips unsubscribed workers, so no extra filtering needed here.
  // Fire-and-forget, same non-fatal pattern as every other batch notify in
  // this codebase — one worker's send failing must not affect the rest.
  const emailSvc = await import("../email");
  Promise.all(
    topMatches.map((m) =>
      emailSvc.sendJobMatchEmail(m.userId, m.email, m.firstName, job.title, Math.round(m.score))
        .catch((e: unknown) => console.error(`[scoring.calculateMatchScores] email failed for worker ${m.userId}:`, e)),
    ),
  ).catch(() => {});

  console.log(`[scoring.calculateMatchScores] Notified ${topMatches.length} worker(s) for job ${jobPostId}`);
}

// ── notifyApplicantsOfJobClosure ────────────────────────────────
// Called from BOTH archiveJobAdmin (admin-jobs.controller.ts) and archiveJob
// (employer-jobs.controller.ts) — shared here rather than duplicated in two
// controllers. Notifies every applicant still in a non-terminal status
// (APPLIED/VIEWED/SHORTLISTED/INTERVIEWED) that the position closed.
//
// Boundary: this ONLY notifies — it never touches Application.status. An
// archived job's open applications stay exactly as they were; the employer
// (or admin) archiving a job is not the same action as rejecting every
// applicant, and silently auto-rejecting rows here would be a real status
// change hiding inside what's supposed to be a notification-only pass.
export async function notifyApplicantsOfJobClosure(jobPostId: string): Promise<void> {
  const prisma = (await import("../../lib/prisma")).default;

  const job = await prisma.jobPost.findUnique({
    where:  { id: jobPostId },
    select: { title: true, companyName: true },
  });
  if (!job) {
    console.warn(`[notifyApplicantsOfJobClosure] JobPost ${jobPostId} not found — skipping`);
    return;
  }

  const applications = await prisma.application.findMany({
    where: {
      jobId:  jobPostId,
      status: { in: ["APPLIED", "VIEWED", "SHORTLISTED", "INTERVIEWED"] },
    },
    select: {
      id: true,
      worker: {
        select: {
          id:    true,
          email: true,
          workerProfile: { select: { firstName: true } },
        },
      },
    },
  });

  if (applications.length === 0) {
    console.log(`[notifyApplicantsOfJobClosure] No open applicants for job ${jobPostId}`);
    return;
  }

  await prisma.notification.createMany({
    data: applications.map((a) => ({
      userId: a.worker.id,
      title:  `Position closed — ${job.title}`,
      body:   `The position you applied for, "${job.title}" at ${job.companyName}, has been closed by the employer.`,
      type:   "APPLICATION_UPDATE",
      link:   `/worker/applications/${a.id}`,
    })),
  });

  const emailSvc = await import("../email");
  Promise.all(
    applications.map((a) =>
      emailSvc.sendJobClosedApplicantEmail(
        a.worker.id, a.worker.email, a.worker.workerProfile?.firstName ?? "there", job.title, job.companyName,
      ).catch((e: unknown) => console.error(`[notifyApplicantsOfJobClosure] email failed for worker ${a.worker.id}:`, e)),
    ),
  ).catch(() => {});

  console.log(`[notifyApplicantsOfJobClosure] Notified ${applications.length} applicant(s) for job ${jobPostId}`);
}

// ── Enqueue function ──────────────────────────────────────────
export async function enqueue<N extends JobName>(
  name: N,
  data: JobPayload[N],
  opts?: { delay?: number; attempts?: number }
): Promise<void> {
  const inline = process.env.JOBS_INLINE_MODE === "true";

  if (inline) {
    // Run synchronously in-process (dev / serverless)
    try {
      await processInline(name, data);
    } catch (err) {
      console.error(`[Queue Inline] Failed: ${name}`, err);
    }
    return;
  }

  // Production: push to BullMQ
  try {
    const { Queue } = await import("bullmq");
    const redis = { url: process.env.REDIS_URL! };
    const queue = new Queue("directhire", { connection: redis });
    await queue.add(name, data, {
      delay:    opts?.delay,
      attempts: opts?.attempts ?? 3,
      backoff:  { type: "exponential", delay: 2000 },
    });
    await queue.close();
  } catch (err) {
    console.error(`[Queue BullMQ] Failed to enqueue ${name}:`, err);
  }
}

// ── Scheduled jobs (called from cron endpoint) ────────────────

const ONBOARDING_REMINDERS_JOB_NAME = "onboarding-reminders";

async function writeOnboardingRemindersJobLog(opts: {
  status:           "success" | "partial" | "failed";
  recordsProcessed: number;
  recordsFailed:    number;
  errorMessage?:    string;
  startedAt:        Date;
}) {
  const prisma = (await import("../../lib/prisma")).default;
  const completedAt = new Date();
  await prisma.jobRunLog.create({
    data: {
      jobName:          ONBOARDING_REMINDERS_JOB_NAME,
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

export async function runOnboardingReminders(): Promise<void> {
  const startedAt = new Date();
  const prisma = (await import("../../lib/prisma")).default;
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000); // 24h ago

  const stale = await prisma.onboardingProgress.findMany({
    where: {
      isSubmitted: false,
      onboardingStatus: { in: ["DRAFT", "IN_PROGRESS"] },
      lastSavedAt: { lt: cutoff },
    },
    include: { user: true },
  });

  if (stale.length === 0) {
    console.log(`[Cron] Sent 0 onboarding reminders.`);
    await writeOnboardingRemindersJobLog({ status: "success", recordsProcessed: 0, recordsFailed: 0, startedAt });
    return;
  }

  // Cooldown — one reminder per 7 days, not one per run. EmailLog already
  // records every reminder send (sendOnboardingReminder -> sendEmail with
  // emailType: "ONBOARDING_REMINDER"), so reusing it here is cheaper than
  // adding a lastReminderSentAt column + migration to OnboardingProgress.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const recentReminders = await prisma.emailLog.groupBy({
    by:    ["userId"],
    where: {
      emailType: "ONBOARDING_REMINDER",
      userId:    { in: stale.map((op) => op.userId) },
      createdAt: { gte: sevenDaysAgo },
    },
  });
  const remindedRecently = new Set(recentReminders.map((r) => r.userId));

  let sent = 0;
  for (const op of stale) {
    if (op.userId && remindedRecently.has(op.userId)) continue;

    const pct = Math.round((op.completedSteps.length / op.totalSteps) * 100);
    const firstName =
      (op.draftData as Record<string, unknown>)?.firstName as string | undefined ?? "there";
    const continueUrl = `${process.env.FRONTEND_URL ?? "https://directhire.io"}/${op.role.toLowerCase()}/onboarding`;
    await enqueue("email.onboardingReminder", {
      userId: op.userId,
      to:     op.user.email,
      firstName,
      continueUrl,
      completionPct: pct,
    });
    sent++;
  }
  console.log(`[Cron] Sent ${sent} onboarding reminder(s), skipped ${stale.length - sent} (reminded within the last 7 days).`);
  await writeOnboardingRemindersJobLog({ status: "success", recordsProcessed: sent, recordsFailed: 0, startedAt });
}

// ── Verification code cleanup ─────────────────────────────────
export async function runVerificationCodeCleanup(): Promise<void> {
  const prisma = (await import("../../lib/prisma")).default;
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  // Delete expired unused codes
  const expired = await prisma.verificationCode.deleteMany({
    where: { expiresAt: { lt: now }, usedAt: null },
  });

  // Delete used codes older than 7 days
  const old = await prisma.verificationCode.deleteMany({
    where: { usedAt: { lt: sevenDaysAgo } },
  });

  console.log(`[Cron] Verification code cleanup: ${expired.count} expired, ${old.count} old used records deleted.`);
}
