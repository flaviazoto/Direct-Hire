// backend/src/controllers/worker-lock.controller.ts
// Worker lock endpoints — all require role = EMPLOYER + accountStatus = VERIFIED.

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";
import {
  sendWorkerLockedWorkerEmail,
  sendWorkerLockedEmployerEmail,
  sendWorkerLockExtendedWorkerEmail,
  sendWorkerLockExtendedEmployerEmail,
  sendWorkerLockReleasedWorkerEmail,
  sendWorkerLockReleasedEmployerEmail,
} from "../services/email";
import { insertAdminAuditLog } from "../lib/audit";

// ── Validation ────────────────────────────────────────────────────────────────

const LockSchema = z.object({
  lock_days:  z.number().int().min(1).max(30),
  daily_fee:  z.number().positive(),
  currency:   z.string().length(3).default("USD"),
});

const ExtendSchema = z.object({
  additional_days: z.number().int().min(1).max(30),
});

const ReleaseSchema = z.object({
  reason: z.string().max(2000).optional(),
});

// ── POST /employer/workers/:workerId/lock ─────────────────────────────────────

export async function lockWorker(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { workerId } = req.params;

    const parsed = LockSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { lock_days, daily_fee, currency } = parsed.data;

    // Fetch worker with lock-relevant fields
    const worker = await prisma.user.findUnique({
      where: { id: workerId },
      select: {
        id:            true,
        accountStatus: true,
        role:          true,
        isLocked:      true,
        email:         true,
        workerProfile: { select: { firstName: true, lastName: true } },
      },
    });

    if (!worker || worker.role !== "WORKER") return err(res, "Worker not found", 404);
    if (worker.accountStatus !== "VERIFIED")  return err(res, "Worker is not verified", 400);

    // Worker locked by another employer
    if (worker.isLocked) {
      return err(res, "This worker is currently reserved by another employer.", 409, { code: "WORKER_LOCKED" });
    }

    // Employer already has an ACTIVE lock on this worker
    const existingLock = await prisma.workerLock.findFirst({
      where: { workerId, employerId, lockStatus: "ACTIVE" },
    });
    if (existingLock) return err(res, "You already have an active reservation on this worker.", 409);

    const now            = new Date();
    const lockExpiryDate = new Date(now.getTime() + lock_days * 24 * 3600 * 1000);

    // Fetch employer name for emails
    const employer = await prisma.user.findUnique({
      where: { id: employerId },
      select: {
        email:           true,
        employerProfile: { select: { companyName: true, contactPersonName: true } },
      },
    });

    const workerName   = [worker.workerProfile?.firstName, worker.workerProfile?.lastName]
      .filter(Boolean).join(" ") || "Worker";
    const employerName = employer?.employerProfile?.companyName
      ?? employer?.employerProfile?.contactPersonName
      ?? "Employer";

    // 1. Create lock + update worker flags atomically
    const [lock] = await prisma.$transaction([
      prisma.workerLock.create({
        data: {
          workerId,
          employerId,
          lockStatus:    "ACTIVE",
          dailyFee:      daily_fee,
          currency,
          lockStartDate: now,
          lockExpiryDate,
          lockDays:      lock_days,
          totalBilled:   daily_fee,     // first day billed immediately
          totalDaysBilled: 1,
        },
      }),
      prisma.user.update({
        where: { id: workerId },
        data: {
          isLocked:           true,
          lockedByEmployerId: employerId,
          lockedUntil:        lockExpiryDate,
          lockCount:          { increment: 1 },
        },
      }),
    ]);

    // 3. First billing charge
    await prisma.lockBillingCharge.create({
      data: {
        lockId:       lock.id,
        employerId,
        workerId,
        amount:       daily_fee,
        currency,
        chargeDate:   now,
        chargeStatus: "PENDING",
      },
    });

    // 4. Fire-and-forget side effects
    Promise.all([
      insertAdminAuditLog({
        actorId:  employerId,
        targetId: workerId,
        action:   "WORKER_LOCKED",
        metadata: {
          lock_id:         lock.id,
          lock_days,
          daily_fee,
          lock_expiry_date: lockExpiryDate.toISOString(),
        },
      }),
      sendWorkerLockedWorkerEmail(
        workerId,
        worker.email,
        worker.workerProfile?.firstName ?? "",
        lockExpiryDate,
      ),
      sendWorkerLockedEmployerEmail(
        employerId,
        employer!.email,
        worker.workerProfile?.firstName ?? "",
        workerName,
        now,
        lockExpiryDate,
        daily_fee,
        currency,
        lock_days,
      ),
      prisma.notification.create({
        data: {
          userId: workerId,
          title:  "Your profile has been reserved",
          body:   `${employerName} has placed a reservation on your profile until ${lockExpiryDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`,
          type:   "worker_locked",
          link:   "/worker/dashboard",
        },
      }),
    ]).catch(console.error);

    return ok(res, lock, "Worker reservation created", 201);
  } catch (e) { next(e); }
}

// ── POST /employer/workers/:workerId/extend-lock ──────────────────────────────

export async function extendLock(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { workerId } = req.params;

    const parsed = ExtendSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { additional_days } = parsed.data;

    const lock = await prisma.workerLock.findFirst({
      where: { workerId, employerId, lockStatus: "ACTIVE" },
    });
    if (!lock) return err(res, "No active reservation found for this worker.", 404);

    // Check 60-day total cap
    const totalDays = Math.round(
      (lock.lockExpiryDate.getTime() - lock.lockStartDate.getTime()) / (24 * 3600 * 1000)
    ) + additional_days;
    if (totalDays > 60) {
      return err(res, `Cannot extend: total reservation duration would be ${totalDays} days (max 60).`, 400);
    }

    const newExpiry = new Date(lock.lockExpiryDate.getTime() + additional_days * 24 * 3600 * 1000);

    // Fetch worker + employer for emails
    const [worker, employer] = await Promise.all([
      prisma.user.findUnique({
        where: { id: workerId },
        select: { email: true, workerProfile: { select: { firstName: true, lastName: true } } },
      }),
      prisma.user.findUnique({
        where: { id: employerId },
        select: { email: true, employerProfile: { select: { companyName: true, contactPersonName: true } } },
      }),
    ]);

    const workerName   = [worker?.workerProfile?.firstName, worker?.workerProfile?.lastName]
      .filter(Boolean).join(" ") || "Worker";

    const updated = await prisma.workerLock.update({
      where: { id: lock.id },
      data: {
        lockExpiryDate:    newExpiry,
        lockDays:          { increment: additional_days },
        expiryWarningSent: false,
      },
    });

    await prisma.user.update({
      where: { id: workerId },
      data: { lockedUntil: newExpiry },
    });

    Promise.all([
      insertAdminAuditLog({
        actorId:  employerId,
        targetId: workerId,
        action:   "WORKER_LOCK_EXTENDED",
        metadata: {
          lock_id:         lock.id,
          additional_days,
          new_expiry_date: newExpiry.toISOString(),
        },
      }),
      sendWorkerLockExtendedWorkerEmail(
        workerId,
        worker!.email,
        worker?.workerProfile?.firstName ?? "",
        newExpiry,
      ),
      sendWorkerLockExtendedEmployerEmail(
        employerId,
        employer!.email,
        worker?.workerProfile?.firstName ?? "",
        workerName,
        newExpiry,
        Number(lock.dailyFee),
        lock.currency,
        totalDays,
      ),
      prisma.notification.create({
        data: {
          userId: workerId,
          title:  "Your reservation has been extended",
          body:   `Your profile reservation has been extended until ${newExpiry.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`,
          type:   "worker_lock_extended",
          link:   "/worker/dashboard",
        },
      }),
    ]).catch(console.error);

    return ok(res, updated, "Reservation extended");
  } catch (e) { next(e); }
}

// ── POST /employer/workers/:workerId/release-lock ─────────────────────────────

export async function releaseLock(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { workerId } = req.params;

    const parsed = ReleaseSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { reason } = parsed.data;

    const lock = await prisma.workerLock.findFirst({
      where: { workerId, employerId, lockStatus: "ACTIVE" },
    });
    if (!lock) return err(res, "No active reservation found for this worker.", 404);

    const [worker, employer] = await Promise.all([
      prisma.user.findUnique({
        where: { id: workerId },
        select: { email: true, workerProfile: { select: { firstName: true, lastName: true } } },
      }),
      prisma.user.findUnique({
        where: { id: employerId },
        select: { email: true },
      }),
    ]);

    const workerName = [worker?.workerProfile?.firstName, worker?.workerProfile?.lastName]
      .filter(Boolean).join(" ") || "Worker";

    await prisma.$transaction([
      prisma.workerLock.update({
        where: { id: lock.id },
        data: { lockStatus: "RELEASED", releaseReason: reason ?? null },
      }),
      prisma.user.update({
        where: { id: workerId },
        data: { isLocked: false, lockedByEmployerId: null, lockedUntil: null },
      }),
    ]);

    Promise.all([
      insertAdminAuditLog({
        actorId:  employerId,
        targetId: workerId,
        action:   "WORKER_LOCK_RELEASED",
        metadata: {
          lock_id:      lock.id,
          total_billed: lock.totalBilled,
          total_days:   lock.totalDaysBilled,
          ...(reason && { reason }),
        },
      }),
      sendWorkerLockReleasedWorkerEmail(
        workerId,
        worker!.email,
        worker?.workerProfile?.firstName ?? "",
      ),
      sendWorkerLockReleasedEmployerEmail(
        employerId,
        employer!.email,
        workerName,
        Number(lock.totalBilled),
        lock.currency,
        lock.totalDaysBilled,
      ),
      prisma.notification.create({
        data: {
          userId: workerId,
          title:  "Your reservation has ended",
          body:   "Your profile reservation has been released. You are now available to other employers.",
          type:   "worker_lock_released",
          link:   "/worker/dashboard",
        },
      }),
    ]).catch(console.error);

    return ok(res, { success: true }, "Reservation released");
  } catch (e) { next(e); }
}

// ── GET /employer/workers/:workerId/lock-status ───────────────────────────────

export async function getLockStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { workerId } = req.params;

    const worker = await prisma.user.findUnique({
      where: { id: workerId },
      select: { isLocked: true, lockedByEmployerId: true },
    });
    if (!worker) return err(res, "Worker not found", 404);

    if (!worker.isLocked) {
      return ok(res, { is_locked: false });
    }

    // Locked by this employer — expose details
    if (worker.lockedByEmployerId === employerId) {
      const lock = await prisma.workerLock.findFirst({
        where: { workerId, employerId, lockStatus: "ACTIVE" },
        select: {
          id:              true,
          dailyFee:        true,
          currency:        true,
          lockExpiryDate:  true,
          lockStartDate:   true,
          lockDays:        true,
          totalBilled:     true,
          totalDaysBilled: true,
        },
      });
      if (!lock) return ok(res, { is_locked: true, lock_by_me: true, lock: null });
      return ok(res, {
        is_locked:  true,
        lock_by_me: true,
        lock: {
          id:                lock.id,
          lock_status:       "ACTIVE",
          daily_fee:         Number(lock.dailyFee),
          currency:          lock.currency,
          lock_start_date:   lock.lockStartDate.toISOString(),
          lock_expiry_date:  lock.lockExpiryDate.toISOString(),
          lock_days:         lock.lockDays,
          total_billed:      Number(lock.totalBilled),
          total_days_billed: lock.totalDaysBilled,
        },
      });
    }

    // Locked by another employer — never expose identity
    return ok(res, { is_locked: true, lock_by_me: false });
  } catch (e) { next(e); }
}

// ── GET /employer/locks ───────────────────────────────────────────────────────

export async function getMyLocks(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { status } = req.query as Record<string, string>;

    const VALID_STATUSES = ["ACTIVE", "EXPIRED", "RELEASED", "OVERRIDDEN"];
    const where: Record<string, unknown> = { employerId };
    if (status && VALID_STATUSES.includes(status)) where.lockStatus = status;

    const [rows, total] = await Promise.all([
      prisma.workerLock.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: "desc" },
        include: {
          worker: {
            select: {
              id:            true,
              workerProfile: {
                select: {
                  firstName:          true,
                  lastName:           true,
                  countryOfResidence: true,
                  city:               true,
                },
              },
            },
          },
        },
      }),
      prisma.workerLock.count({ where }),
    ]);

    const data = rows.map(r => ({
      id:               r.id,
      lock_status:      r.lockStatus,
      daily_fee:        r.dailyFee,
      currency:         r.currency,
      lock_start_date:  r.lockStartDate,
      lock_expiry_date: r.lockExpiryDate,
      lock_days:        r.lockDays,
      total_billed:     r.totalBilled,
      total_days_billed: r.totalDaysBilled,
      release_reason:   r.releaseReason,
      created_at:       r.createdAt,
      worker: {
        id:         r.worker.id,
        first_name: r.worker.workerProfile?.firstName          ?? null,
        last_name:  r.worker.workerProfile?.lastName           ?? null,
        country:    r.worker.workerProfile?.countryOfResidence ?? null,
        city:       r.worker.workerProfile?.city               ?? null,
      },
    }));

    return paginated(res, data, total, page, limit);
  } catch (e) { next(e); }
}
