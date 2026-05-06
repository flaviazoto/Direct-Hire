// src/services/lock-jobs/index.ts
// Two scheduled background jobs for the worker lock system.
//
// JOB 1 — lock-daily-billing   ('5 0 * * *'  — 00:05 UTC daily)
//   A) Detect ACTIVE locks with stale PENDING charges (failed initial payment)
//      — stale = older than platform_config:lock_grace_period_hours (default 24 h)
//   B) For each: expire lock, clear worker flags, create FAILED Payment record,
//      send emails + notifications, write audit log
//   C) Send 48-hour expiry warnings for upcoming expirations
//   D) Log run to job_run_logs
//
// JOB 2 — lock-expiry-processor ('15 * * * *' — every hour at :15)
//   Expire any ACTIVE locks whose lock_expiry_date has passed.
//   Create a Payment record (amount: 0, SUCCEEDED) to record natural expiry.
//   Notify both parties, audit-log, clear worker lock flags.

import { NotificationType } from "@prisma/client";
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

// ─────────────────────────────────────────────────────────────────────────────
// JOB 1: lock-daily-billing
// ─────────────────────────────────────────────────────────────────────────────

export async function runLockDailyBilling(): Promise<void> {
  const JOB_NAME  = "lock-daily-billing";
  const startedAt = new Date();
  const now       = new Date();
  console.log(`[${JOB_NAME}] Starting at ${startedAt.toISOString()}`);

  // ── C) Read grace period + daily rate from platform_config ───────────────
  const [gracePeriodRow, rateRow] = await Promise.all([
    prisma.platformConfig.findUnique({ where: { key: "lock_grace_period_hours" } }),
    prisma.platformConfig.findUnique({ where: { key: "lock_daily_rate_cents" } }),
  ]);
  const graceHours     = parseInt(gracePeriodRow?.value ?? "24");
  const dailyRateCents = parseInt(rateRow?.value ?? "200");
  const graceCutoff    = new Date(now.getTime() - graceHours * 3600 * 1000);

  console.log(`[${JOB_NAME}] Grace period: ${graceHours}h, daily rate: ${dailyRateCents}¢, cutoff: ${graceCutoff.toISOString()}`);

  let locksExpired = 0;
  let warningsSent = 0;
  let failed       = 0;

  // ── A) Find stale PENDING charges (failed initial payment) ────────────────
  // Payment is charged upfront at lock creation. A PENDING charge that's older
  // than the grace period means the Stripe PaymentIntent was never confirmed.
  const staleCharges = await prisma.lockBillingCharge.findMany({
    where: {
      chargeStatus: "PENDING",
      chargeDate:   { lt: graceCutoff },
    },
  });

  const staleLockIds = [...new Set(staleCharges.map(c => c.lockId))];
  const staleChargeByLock = new Map(staleCharges.map(c => [c.lockId, c]));

  const staleLocks = staleLockIds.length === 0 ? [] : await prisma.workerLock.findMany({
    where: {
      id:         { in: staleLockIds },
      lockStatus: "ACTIVE",
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
          id:              true,
          email:           true,
          employerProfile: { select: { companyName: true, contactPersonName: true } },
        },
      },
    },
  });

  console.log(`[${JOB_NAME}] Found ${staleLocks.length} lock(s) with stale PENDING charges`);

  // ── B) Expire each lock with a failed initial payment ─────────────────────
  for (const lock of staleLocks) {
    try {
      const staleCharge     = staleChargeByLock.get(lock.id);
      const workerFirstName = lock.worker.workerProfile?.firstName ?? "the worker";
      const workerName      = [
        lock.worker.workerProfile?.firstName,
        lock.worker.workerProfile?.lastName,
      ].filter(Boolean).join(" ") || "Worker";
      const totalBilled     = Number(lock.totalBilled);
      const totalDaysBilled = lock.totalDaysBilled;

      // Expire lock + clear worker isLocked flags atomically
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

      // Create FAILED Payment record (upfront charge that never succeeded)
      await prisma.payment.create({
        data: {
          userId:      lock.employerId,
          amount:      staleCharge ? Number(staleCharge.amount) : dailyRateCents,
          currency:    lock.currency,
          status:      "FAILED",
          type:        "WORKER_LOCK",
          description: `Worker lock initial payment failed — lock ${lock.id}`,
          metadata: {
            lockId:          lock.id,
            workerId:        lock.workerId,
            chargeId:        staleCharge?.id ?? null,
            reason:          "STALE_PENDING_CHARGE",
            graceHours,
            configuredRateCents: dailyRateCents,
          },
        },
      });

      // Audit log
      await insertAdminAuditLog({
        actorId:  lock.employerId,
        targetId: lock.workerId,
        action:   "WORKER_LOCK_EXPIRED",
        metadata: {
          lock_id:           lock.id,
          reason:            "failed_initial_payment",
          grace_hours:       graceHours,
          stale_charge_id:   staleCharge?.id ?? null,
          total_billed:      totalBilled,
          total_days_billed: totalDaysBilled,
          expired_at:        now.toISOString(),
        },
      });

      // Fire-and-forget: emails + notifications
      Promise.all([
        sendLockExpiredWorkerEmail(
          lock.workerId,
          lock.worker.email,
          workerFirstName,
        ).catch((e: unknown) => console.error(`[${JOB_NAME}] worker expired email failed for lock ${lock.id}:`, e)),
        sendLockExpiredEmployerEmail(
          lock.employerId,
          lock.employer.email,
          workerName,
          totalBilled,
          lock.currency,
          totalDaysBilled,
        ).catch((e: unknown) => console.error(`[${JOB_NAME}] employer expired email failed for lock ${lock.id}:`, e)),
        prisma.notification.create({
          data: {
            userId: lock.workerId,
            title:  "Your profile reservation has ended",
            body:   "Your reservation was cancelled due to a payment issue. You are now fully available to all employers.",
            type:   NotificationType.LOCK_EXPIRED,
            link:   "/worker/dashboard",
          },
        }).catch((e: unknown) => console.error(`[${JOB_NAME}] worker notif failed for lock ${lock.id}:`, e)),
        prisma.notification.create({
          data: {
            userId: lock.employerId,
            title:  `Reservation cancelled — ${workerName}`,
            body:   `Your reservation for ${workerName} was cancelled due to a failed payment.`,
            type:   NotificationType.LOCK_EXPIRED,
            link:   "/employer/locks",
          },
        }).catch((e: unknown) => console.error(`[${JOB_NAME}] employer notif failed for lock ${lock.id}:`, e)),
      ]);

      locksExpired++;
      console.log(`[${JOB_NAME}] Expired lock ${lock.id} (stale PENDING charge older than ${graceHours}h)`);
    } catch (err) {
      failed++;
      console.error(`[${JOB_NAME}] Failed for lock ${lock.id}:`, err);
    }
  }

  // ── D) 48-hour expiry warnings for upcoming expirations ───────────────────
  const unsentWarningLocks = await prisma.workerLock.findMany({
    where: {
      lockStatus:        "ACTIVE",
      expiryWarningSent: false,
    },
    include: {
      worker: {
        select: {
          id:            true,
          email:         true,
          workerProfile: { select: { firstName: true } },
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

  const fortyEightHoursFromNow = new Date(Date.now() + 48 * 3600 * 1000);

  for (const lock of unsentWarningLocks) {
    if (lock.lockExpiryDate > fortyEightHoursFromNow) continue;
    try {
      const workerFirstName = lock.worker.workerProfile?.firstName ?? "the worker";

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
          type:   NotificationType.LOCK_EXPIRY_WARNING,
          link:   "/employer/locks",
        },
      });

      warningsSent++;
      console.log(`[${JOB_NAME}] Expiry warning sent for lock ${lock.id}`);
    } catch (err) {
      failed++;
      console.error(`[${JOB_NAME}] Warning failed for lock ${lock.id}:`, err);
    }
  }

  const totalProcessed = staleLocks.length + unsentWarningLocks.length;
  const status: "success" | "partial" | "failed" =
    failed === 0            ? "success"
    : failed === totalProcessed ? "failed"
    : "partial";

  await writeJobLog({
    jobName:          JOB_NAME,
    status,
    recordsProcessed: locksExpired,
    recordsFailed:    failed,
    startedAt,
  });

  console.log(
    `[${JOB_NAME}] Done — expired: ${locksExpired}, warnings: ${warningsSent}, failed: ${failed}`,
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

  // ── FIX 4: Read daily rate from platform_config ───────────────────────────
  const rateRow = await prisma.platformConfig.findUnique({
    where: { key: "lock_daily_rate_cents" },
  });
  const dailyRateCents = parseInt(rateRow?.value ?? "200");

  // Find all ACTIVE locks that have passed their expiry date
  const expiredLocks = await prisma.workerLock.findMany({
    where: {
      lockStatus:     "ACTIVE",
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

  for (const expiredLock of expiredLocks) {
    try {
      const workerFirstName =
        expiredLock.worker.workerProfile?.firstName ?? "";
      const workerName = [
        expiredLock.worker.workerProfile?.firstName,
        expiredLock.worker.workerProfile?.lastName,
      ].filter(Boolean).join(" ") || "Worker";

      const totalBilled     = Number(expiredLock.totalBilled);
      const totalDaysBilled = expiredLock.totalDaysBilled;

      // 1. Update lock status + clear worker flags atomically
      await prisma.$transaction([
        prisma.workerLock.update({
          where: { id: expiredLock.id },
          data:  { lockStatus: "EXPIRED" },
        }),
        prisma.user.update({
          where: { id: expiredLock.workerId },
          data: {
            isLocked:           false,
            lockedByEmployerId: null,
            lockedUntil:        null,
          },
        }),
      ]);

      // 2. Create Payment record for natural expiry
      //    amount: 0 — already charged upfront; this records the expiry event
      await prisma.payment.create({
        data: {
          userId:      expiredLock.employerId,
          amount:      0,
          currency:    "usd",
          status:      "SUCCEEDED",
          type:        "WORKER_LOCK",
          description: `Worker lock expired after ${expiredLock.lockDays} days`,
          metadata: {
            lockId:              expiredLock.id,
            workerId:            expiredLock.workerId,
            reason:              "NATURAL_EXPIRY",
            totalBilled,
            totalDaysBilled,
            configuredRateCents: dailyRateCents,
          },
        },
      });

      // 3. Audit log
      await insertAdminAuditLog({
        actorId:  expiredLock.employerId,
        targetId: expiredLock.workerId,
        action:   "WORKER_LOCK_EXPIRED",
        metadata: {
          lock_id:           expiredLock.id,
          total_billed:      totalBilled,
          total_days_billed: totalDaysBilled,
          expired_at:        now.toISOString(),
        },
      });

      // 4–6. Emails + notifications (fire-and-forget)
      Promise.all([
        sendLockExpiredWorkerEmail(
          expiredLock.workerId,
          expiredLock.worker.email,
          workerFirstName,
        ).catch((e: unknown) => console.error(`[${JOB_NAME}] worker expired email failed for lock ${expiredLock.id}:`, e)),
        sendLockExpiredEmployerEmail(
          expiredLock.employerId,
          expiredLock.employer.email,
          workerName,
          totalBilled,
          expiredLock.currency,
          totalDaysBilled,
        ).catch((e: unknown) => console.error(`[${JOB_NAME}] employer expired email failed for lock ${expiredLock.id}:`, e)),
        prisma.notification.create({
          data: {
            userId: expiredLock.workerId,
            title:  "Your profile reservation has ended",
            body:   "Your reservation period has passed. You are now fully available to all employers.",
            type:   NotificationType.LOCK_EXPIRED,
            link:   "/worker/dashboard",
          },
        }).catch((e: unknown) => console.error(`[${JOB_NAME}] worker notif failed for lock ${expiredLock.id}:`, e)),
        prisma.notification.create({
          data: {
            userId: expiredLock.employerId,
            title:  `Reservation expired — ${workerName}`,
            body:   `Your reservation for ${workerName} has expired. Total billed: ${expiredLock.currency} ${totalBilled.toFixed(2)} over ${totalDaysBilled} day(s).`,
            type:   NotificationType.LOCK_EXPIRED,
            link:   "/employer/locks",
          },
        }).catch((e: unknown) => console.error(`[${JOB_NAME}] employer notif failed for lock ${expiredLock.id}:`, e)),
      ]);

      processed++;
      console.log(`[${JOB_NAME}] Expired lock ${expiredLock.id} for worker ${expiredLock.workerId}`);
    } catch (err) {
      failed++;
      console.error(`[${JOB_NAME}] Failed for lock ${expiredLock.id}:`, err);
    }
  }

  const status: "success" | "partial" | "failed" =
    failed === 0                    ? "success"
    : failed === expiredLocks.length  ? "failed"
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
