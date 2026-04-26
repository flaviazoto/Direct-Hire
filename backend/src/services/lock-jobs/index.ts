// src/services/lock-jobs/index.ts
// Two scheduled background jobs for the worker lock system.
//
// JOB 1 — lock-daily-billing   ('5 0 * * *'  — 00:05 UTC daily)
//   A) Create today's billing charge for every ACTIVE lock (idempotent)
//   B) Send 48-hour expiry warning once per lock
//   C) Log run to job_run_logs
//
// JOB 2 — lock-expiry-processor ('15 * * * *' — every hour at :15)
//   Expire any ACTIVE locks whose lock_expiry_date has passed.
//   Notify both parties, audit-log, clear worker lock flags.

import prisma from "../../lib/prisma";
import {
  sendLockExpiryWarningEmail,
  sendLockExpiredWorkerEmail,
  sendLockExpiredEmployerEmail,
} from "../email";
import { insertAdminAuditLog } from "../../lib/audit";

// ── Job run log helper ────────────────────────────────────────────────────────

async function writeJobLog(opts: {
  jobName:          string;
  status:           "success" | "partial" | "failed";
  recordsProcessed: number;
  recordsFailed:    number;
  errorMessage?:    string;
  startedAt:        Date;
}) {
  const completedAt = new Date();
  await prisma.jobRunLog.create({
    data: {
      jobName:          opts.jobName,
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

// ── Employer display name (safe — no PII) ─────────────────────────────────────

async function getEmployerDisplayName(employerId: string): Promise<string> {
  const ep = await prisma.employerProfile.findUnique({
    where:  { userId: employerId },
    select: { companyName: true, contactPersonName: true },
  });
  return ep?.companyName ?? ep?.contactPersonName ?? "Employer";
}

// ─────────────────────────────────────────────────────────────────────────────
// JOB 1: lock-daily-billing
// ─────────────────────────────────────────────────────────────────────────────

export async function runLockDailyBilling(): Promise<void> {
  const JOB_NAME  = "lock-daily-billing";
  const startedAt = new Date();
  console.log(`[${JOB_NAME}] Starting at ${startedAt.toISOString()}`);

  let locksProcessed = 0;
  let chargesCreated = 0;
  let warningsSent   = 0;
  let failed         = 0;

  // Fetch all ACTIVE locks with worker + employer data
  const activeLocks = await prisma.workerLock.findMany({
    where: { lockStatus: "ACTIVE" },
    include: {
      worker: {
        select: {
          id:            true,
          email:         true,
          workerProfile: { select: { firstName: true, lastName: true } },
        },
      },
      employer: {
        select: {
          id:              true,
          email:           true,
          employerProfile: { select: { companyName: true, contactPersonName: true } },
        },
      },
    },
  });

  console.log(`[${JOB_NAME}] Processing ${activeLocks.length} active lock(s)`);

  for (const lock of activeLocks) {
    try {
      // ── A) Daily charge (idempotent) ──────────────────────────────────────
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart.getTime() + 24 * 3600 * 1000);

      const existingCharge = await prisma.lockBillingCharge.findFirst({
        where: {
          lockId:     lock.id,
          chargeDate: { gte: todayStart, lt: todayEnd },
        },
      });

      if (!existingCharge) {
        await prisma.$transaction([
          prisma.lockBillingCharge.create({
            data: {
              lockId:       lock.id,
              employerId:   lock.employerId,
              workerId:     lock.workerId,
              amount:       lock.dailyFee,
              currency:     lock.currency,
              chargeDate:   todayStart,
              chargeStatus: "PENDING",
            },
          }),
          prisma.workerLock.update({
            where: { id: lock.id },
            data: {
              totalBilled:     { increment: lock.dailyFee },
              totalDaysBilled: { increment: 1 },
            },
          }),
        ]);
        chargesCreated++;
        console.log(`[${JOB_NAME}] Charge created for lock ${lock.id}`);
      }

      // ── B) 48-hour expiry warning ─────────────────────────────────────────
      const fortyEightHoursFromNow = new Date(Date.now() + 48 * 3600 * 1000);

      if (
        !lock.expiryWarningSent &&
        lock.lockExpiryDate <= fortyEightHoursFromNow
      ) {
        const workerFirstName =
          lock.worker.workerProfile?.firstName ?? "the worker";

        await sendLockExpiryWarningEmail(
          lock.employerId,
          lock.employer.email,
          workerFirstName,
          lock.lockExpiryDate,
          lock.id,
        );

        await prisma.workerLock.update({
          where: { id: lock.id },
          data:  { expiryWarningSent: true },
        });

        await prisma.notification.create({
          data: {
            userId: lock.employerId,
            title:  `Reservation expiring soon — ${workerFirstName}`,
            body:   `Your reservation expires on ${lock.lockExpiryDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. Extend it from your dashboard.`,
            type:   "lock_expiry_warning",
            link:   "/employer/locks",
          },
        });

        warningsSent++;
        console.log(`[${JOB_NAME}] Expiry warning sent for lock ${lock.id}`);
      }

      locksProcessed++;
    } catch (err) {
      failed++;
      console.error(`[${JOB_NAME}] Failed for lock ${lock.id}:`, err);
    }
  }

  const status: "success" | "partial" | "failed" =
    failed === 0 ? "success"
    : failed === activeLocks.length ? "failed"
    : "partial";

  await writeJobLog({
    jobName:          JOB_NAME,
    status,
    recordsProcessed: locksProcessed,
    recordsFailed:    failed,
    startedAt,
  });

  console.log(
    `[${JOB_NAME}] Done — processed: ${locksProcessed}, charges: ${chargesCreated}, warnings: ${warningsSent}, failed: ${failed}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// JOB 2: lock-expiry-processor
// ─────────────────────────────────────────────────────────────────────────────

export async function runLockExpiryProcessor(): Promise<void> {
  const JOB_NAME  = "lock-expiry-processor";
  const startedAt = new Date();
  const now       = new Date();
  console.log(`[${JOB_NAME}] Starting at ${startedAt.toISOString()}`);

  // Find all ACTIVE locks that have passed their expiry date
  const expiredLocks = await prisma.workerLock.findMany({
    where: {
      lockStatus:    "ACTIVE",
      lockExpiryDate: { lt: now },
    },
    include: {
      worker: {
        select: {
          id:            true,
          email:         true,
          workerProfile: { select: { firstName: true, lastName: true } },
        },
      },
      employer: {
        select: {
          id:    true,
          email: true,
        },
      },
    },
  });

  console.log(`[${JOB_NAME}] Found ${expiredLocks.length} expired lock(s)`);

  let processed = 0;
  let failed    = 0;

  for (const lock of expiredLocks) {
    try {
      const workerFirstName =
        lock.worker.workerProfile?.firstName ?? "";
      const workerName = [
        lock.worker.workerProfile?.firstName,
        lock.worker.workerProfile?.lastName,
      ].filter(Boolean).join(" ") || "Worker";

      const totalBilled     = Number(lock.totalBilled);
      const totalDaysBilled = lock.totalDaysBilled;

      // 1. Update lock status + clear worker flags atomically
      await prisma.$transaction([
        prisma.workerLock.update({
          where: { id: lock.id },
          data:  { lockStatus: "EXPIRED" },
        }),
        prisma.user.update({
          where: { id: lock.workerId },
          data: {
            isLocked:           false,
            lockedByEmployerId: null,
            lockedUntil:        null,
          },
        }),
      ]);

      // 3. Audit log
      await insertAdminAuditLog({
        actorId:  lock.employerId,
        targetId: lock.workerId,
        action:   "WORKER_LOCK_EXPIRED",
        metadata: {
          lock_id:           lock.id,
          total_billed:      totalBilled,
          total_days_billed: totalDaysBilled,
          expired_at:        now.toISOString(),
        },
      });

      // 4–6. Emails + notifications (fire-and-forget, don't let one failure kill the lock)
      Promise.all([
        sendLockExpiredWorkerEmail(
          lock.workerId,
          lock.worker.email,
          workerFirstName,
        ),
        sendLockExpiredEmployerEmail(
          lock.employerId,
          lock.employer.email,
          workerName,
          totalBilled,
          lock.currency,
          totalDaysBilled,
        ),
        prisma.notification.create({
          data: {
            userId: lock.workerId,
            title:  "Your profile reservation has ended",
            body:   "Your reservation period has passed. You are now fully available to all employers.",
            type:   "lock_expired",
            link:   "/worker/dashboard",
          },
        }),
        prisma.notification.create({
          data: {
            userId: lock.employerId,
            title:  `Reservation expired — ${workerName}`,
            body:   `Your reservation for ${workerName} has expired. Total billed: ${lock.currency} ${totalBilled.toFixed(2)} over ${totalDaysBilled} day(s).`,
            type:   "lock_expired",
            link:   "/employer/locks",
          },
        }),
      ]).catch(err => console.error(`[${JOB_NAME}] Side-effect error for lock ${lock.id}:`, err));

      processed++;
      console.log(`[${JOB_NAME}] Expired lock ${lock.id} for worker ${lock.workerId}`);
    } catch (err) {
      failed++;
      console.error(`[${JOB_NAME}] Failed for lock ${lock.id}:`, err);
    }
  }

  const status: "success" | "partial" | "failed" =
    failed === 0 ? "success"
    : failed === expiredLocks.length ? "failed"
    : "partial";

  await writeJobLog({
    jobName:          JOB_NAME,
    status,
    recordsProcessed: processed,
    recordsFailed:    failed,
    startedAt,
  });

  console.log(`[${JOB_NAME}] Done — processed: ${processed}, failed: ${failed}`);
}
