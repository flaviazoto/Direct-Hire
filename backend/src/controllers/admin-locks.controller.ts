// backend/src/controllers/admin-locks.controller.ts
// Admin lock management endpoints — all require role = ADMIN.

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";
import {
  sendWorkerLockReleasedWorkerEmail,
  sendWorkerLockReleasedEmployerEmail,
} from "../services/email";
import { insertAdminAuditLog } from "../lib/audit";

// ── Shared selects ────────────────────────────────────────────────────────────

const WORKER_SELECT = {
  id:    true,
  email: true,
  workerProfile: {
    select: { firstName: true, lastName: true },
  },
} as const;

const EMPLOYER_SELECT = {
  id:    true,
  email: true,
  employerProfile: {
    select: { companyName: true, contactPersonName: true },
  },
} as const;

function flattenWorker(w: {
  id: string;
  email: string;
  workerProfile: { firstName: string | null; lastName: string | null } | null;
}) {
  return {
    id:         w.id,
    first_name: w.workerProfile?.firstName  ?? null,
    last_name:  w.workerProfile?.lastName   ?? null,
    email:      w.email,
  };
}

function flattenEmployer(e: {
  id: string;
  email: string;
  employerProfile: { companyName: string | null; contactPersonName: string | null } | null;
}) {
  return {
    id:           e.id,
    company_name: e.employerProfile?.companyName        ?? null,
    first_name:   e.employerProfile?.contactPersonName  ?? null,
    last_name:    null,
    email:        e.email,
  };
}

// ── GET /admin/locks ──────────────────────────────────────────────────────────

export async function getAllLocks(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { status, employer_id, worker_id, sort } = req.query as Record<string, string>;

    const VALID_STATUSES = ["ACTIVE", "EXPIRED", "RELEASED", "OVERRIDDEN"];
    const where: Record<string, unknown> = {};
    if (status && VALID_STATUSES.includes(status)) where.lockStatus = status;
    if (employer_id) where.employerId = employer_id;
    if (worker_id)   where.workerId   = worker_id;

    const orderBy =
      sort === "expiry_soon"
        ? [{ lockExpiryDate: "asc" as const }]
        : [{ createdAt: "desc" as const }];

    const [rows, total] = await Promise.all([
      prisma.workerLock.findMany({
        where, skip, take: limit, orderBy,
        include: {
          worker:   { select: WORKER_SELECT },
          employer: { select: EMPLOYER_SELECT },
        },
      }),
      prisma.workerLock.count({ where }),
    ]);

    const data = rows.map(r => ({
      id:               r.id,
      lock_status:      r.lockStatus,
      daily_fee:        r.dailyFee,
      currency:         r.currency,
      total_billed:     r.totalBilled,
      total_days_billed: r.totalDaysBilled,
      lock_start_date:  r.lockStartDate,
      lock_expiry_date: r.lockExpiryDate,
      lock_days:        r.lockDays,
      worker:           flattenWorker(r.worker),
      employer:         flattenEmployer(r.employer),
    }));

    return paginated(res, data, total, page, limit);
  } catch (e) { next(e); }
}

// ── GET /admin/locks/summary ──────────────────────────────────────────────────

export async function getLocksSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const now = new Date();
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 3600 * 1000);
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [
      activeLocks,
      totalRevenueResult,
      monthRevenueResult,
      expiringSoon,
      avgDurationResult,
    ] = await Promise.all([
      // Count of active locks
      prisma.workerLock.count({ where: { lockStatus: "ACTIVE" } }),

      // Total revenue across all locks
      prisma.workerLock.aggregate({
        _sum: { totalBilled: true },
      }),

      // Revenue this calendar month
      prisma.workerLock.aggregate({
        where:  { createdAt: { gte: startOfMonth } },
        _sum:   { totalBilled: true },
      }),

      // Active locks expiring within 24 hours
      prisma.workerLock.count({
        where: {
          lockStatus:    "ACTIVE",
          lockExpiryDate: { lte: twentyFourHoursFromNow },
        },
      }),

      // Average lock duration across all completed locks
      prisma.workerLock.aggregate({
        where:  { lockStatus: { in: ["EXPIRED", "RELEASED", "OVERRIDDEN"] } },
        _avg:   { lockDays: true },
      }),
    ]);

    return ok(res, {
      active_locks:              activeLocks,
      total_revenue_from_locks:  totalRevenueResult._sum.totalBilled  ?? 0,
      revenue_this_month:        monthRevenueResult._sum.totalBilled   ?? 0,
      locks_expiring_24h:        expiringSoon,
      avg_lock_duration_days:    avgDurationResult._avg.lockDays
        ? Math.round(avgDurationResult._avg.lockDays * 10) / 10
        : 0,
    });
  } catch (e) { next(e); }
}

// ── GET /admin/locks/active ───────────────────────────────────────────────────

export async function getActiveLocks(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.workerLock.findMany({
      where:   { lockStatus: "ACTIVE" },
      take:    50,
      orderBy: { lockExpiryDate: "asc" },
      include: {
        worker:   { select: WORKER_SELECT },
        employer: { select: EMPLOYER_SELECT },
      },
    });

    const data = rows.map(r => ({
      id:               r.id,
      lock_status:      r.lockStatus,
      daily_fee:        r.dailyFee,
      currency:         r.currency,
      total_billed:     r.totalBilled,
      total_days_billed: r.totalDaysBilled,
      lock_start_date:  r.lockStartDate,
      lock_expiry_date: r.lockExpiryDate,
      lock_days:        r.lockDays,
      days_remaining:   Math.max(
        0,
        Math.ceil((r.lockExpiryDate.getTime() - Date.now()) / (24 * 3600 * 1000)),
      ),
      worker:   flattenWorker(r.worker),
      employer: flattenEmployer(r.employer),
    }));

    return ok(res, data);
  } catch (e) { next(e); }
}

// ── POST /admin/locks/:lockId/override ───────────────────────────────────────

const OverrideSchema = z.object({
  note: z.string().min(1, "A reason note is required").max(2000),
});

export async function overrideLock(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId   = req.user!.sub;
    const { lockId } = req.params;

    const parsed = OverrideSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { note } = parsed.data;

    const lock = await prisma.workerLock.findUnique({
      where: { id: lockId },
      include: {
        worker: {
          select: {
            id:            true,
            email:         true,
            workerProfile: { select: { firstName: true, lastName: true } },
          },
        },
        employer: {
          select: { id: true, email: true },
        },
      },
    });

    if (!lock)                         return err(res, "Lock not found", 404);
    if (lock.lockStatus !== "ACTIVE")  return err(res, "Only ACTIVE locks can be overridden", 400);

    const now        = new Date();
    const workerName = [
      lock.worker.workerProfile?.firstName,
      lock.worker.workerProfile?.lastName,
    ].filter(Boolean).join(" ") || "the worker";

    // 1. Update lock + clear worker flags atomically
    await prisma.$transaction([
      prisma.workerLock.update({
        where: { id: lockId },
        data: {
          lockStatus:        "OVERRIDDEN",
          adminOverrideBy:   adminId,
          adminOverrideAt:   now,
          adminOverrideNote: note,
        },
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
      actorId:  adminId,
      targetId: lock.workerId,
      action:   "WORKER_LOCK_OVERRIDDEN",
      notes:    note,
      metadata: {
        lock_id:       lockId,
        employer_id:   lock.employerId,
        total_billed:  Number(lock.totalBilled),
        overridden_at: now.toISOString(),
      },
    });

    // 4–5. Neutral emails — note is NOT included per spec
    const workerFirstName = lock.worker.workerProfile?.firstName ?? "";
    Promise.all([
      // Worker email: neutral, no mention of reason
      sendWorkerLockReleasedWorkerEmail(
        lock.workerId,
        lock.worker.email,
        workerFirstName,
      ),
      // Employer email: neutral, no mention of reason or note
      sendAdminOverrideEmployerEmail(
        lock.employerId,
        lock.employer.email,
        workerName,
      ),
      prisma.notification.create({
        data: {
          userId: lock.workerId,
          title:  "Your profile reservation has been lifted",
          body:   "Your reservation has been lifted by the DirectHire team. You are now available to all employers.",
          type:   "lock_overridden",
          link:   "/worker/dashboard",
        },
      }),
      prisma.notification.create({
        data: {
          userId: lock.employerId,
          title:  `Reservation ended — ${workerName}`,
          body:   `Your reservation on ${workerName} has been ended by the DirectHire moderation team. Contact support@directhire.io with any questions.`,
          type:   "lock_overridden",
          link:   "/employer/locks",
        },
      }),
    ]).catch(console.error);

    return ok(res, { success: true }, "Lock overridden");
  } catch (e) { next(e); }
}

// Neutral employer override email (inline — no financial data, no note)
async function sendAdminOverrideEmployerEmail(
  userId: string,
  to: string,
  workerName: string,
): Promise<void> {
  const { sendEmail } = await import("../services/email");
  const { lockOverrideEmployerTemplate } = await import("../services/email/templates");
  const { subject, html, text } = lockOverrideEmployerTemplate({ workerName });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "lock_override_employer" });
}

// ── GET /admin/locks/:lockId ──────────────────────────────────────────────────

export async function getLockDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { lockId } = req.params;

    const lock = await prisma.workerLock.findUnique({
      where: { id: lockId },
      include: {
        worker: {
          select: {
            id:    true,
            email: true,
            workerProfile: {
              select: {
                firstName:          true,
                lastName:           true,
                profession:         true,
                countryOfResidence: true,
                city:               true,
                yearsExperience:    true,
                skills:             { select: { skill: true } },
              },
            },
          },
        },
        employer: {
          select: {
            id:    true,
            email: true,
            employerProfile: {
              select: {
                companyName:       true,
                contactPersonName: true,
                industry:          true,
                country:           true,
                city:              true,
              },
            },
          },
        },
        billingCharges: {
          orderBy: { chargeDate: "asc" },
          select: {
            id:           true,
            amount:       true,
            currency:     true,
            chargeDate:   true,
            chargeStatus: true,
            invoiceId:    true,
            createdAt:    true,
          },
        },
      },
    });

    if (!lock) return err(res, "Lock not found", 404);

    // Fetch audit trail for this lock
    const auditRows = await prisma.$queryRaw<
      Array<{
        id:             string;
        action:         string;
        admin_id:       string;
        target_user_id: string;
        notes:          string | null;
        metadata:       unknown;
        created_at:     Date;
      }>
    >`
      SELECT id, action, admin_id, target_user_id, notes, metadata, created_at
      FROM   "audit_log"
      WHERE  (target_user_id = ${lock.workerId} OR target_user_id = ${lock.employerId})
        AND  metadata->>'lock_id' = ${lockId}
      ORDER  BY created_at ASC
    `;

    const timeline = auditRows.map(row => ({
      id:          row.id,
      event:       row.action,
      actor_id:    row.admin_id,
      notes:       row.notes ?? null,
      metadata:    row.metadata,
      occurred_at: row.created_at,
    }));

    return ok(res, {
      id:                  lock.id,
      lock_status:         lock.lockStatus,
      daily_fee:           lock.dailyFee,
      currency:            lock.currency,
      lock_start_date:     lock.lockStartDate,
      lock_expiry_date:    lock.lockExpiryDate,
      lock_days:           lock.lockDays,
      total_billed:        lock.totalBilled,
      total_days_billed:   lock.totalDaysBilled,
      release_reason:      lock.releaseReason,
      admin_override_by:   lock.adminOverrideBy,
      admin_override_at:   lock.adminOverrideAt,
      admin_override_note: lock.adminOverrideNote,
      expiry_warning_sent: lock.expiryWarningSent,
      created_at:          lock.createdAt,
      updated_at:          lock.updatedAt,
      worker: {
        id:         lock.worker.id,
        email:      lock.worker.email,
        first_name: lock.worker.workerProfile?.firstName          ?? null,
        last_name:  lock.worker.workerProfile?.lastName           ?? null,
        profession: lock.worker.workerProfile?.profession         ?? null,
        country:    lock.worker.workerProfile?.countryOfResidence ?? null,
        city:       lock.worker.workerProfile?.city               ?? null,
        years_experience: lock.worker.workerProfile?.yearsExperience ?? null,
        skills:     lock.worker.workerProfile?.skills             ?? [],
      },
      employer: {
        id:           lock.employer.id,
        email:        lock.employer.email,
        company_name: lock.employer.employerProfile?.companyName       ?? null,
        contact_name: lock.employer.employerProfile?.contactPersonName ?? null,
        industry:     lock.employer.employerProfile?.industry          ?? null,
        country:      lock.employer.employerProfile?.country           ?? null,
        city:         lock.employer.employerProfile?.city              ?? null,
      },
      billing_charges: lock.billingCharges,
      timeline,
    });
  } catch (e) { next(e); }
}
