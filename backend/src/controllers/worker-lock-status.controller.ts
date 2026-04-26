// backend/src/controllers/worker-lock-status.controller.ts
// Worker-facing lock status endpoints.
// All require role = WORKER + accountStatus = VERIFIED.
// Workers only see their own locks (always filtered by workerId = JWT sub).
// Financial data (daily_fee, total_billed, total_days_billed) is never exposed.

import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";

// ── Shared employer display name helper ───────────────────────────────────────
// Returns company_name from the employer's most recent approved job post,
// falling back to first_name + last_name from the employer profile.
// NEVER exposes email, phone, or account details.

async function getEmployerDisplayName(employerId: string): Promise<string> {
  // Try most recent APPROVED job post companyName
  const job = await prisma.jobPost.findFirst({
    where:   { employerId, status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    select:  { companyName: true },
  });
  if (job?.companyName) return job.companyName;

  // Fall back to employer profile contact name
  const ep = await prisma.employerProfile.findUnique({
    where:  { userId: employerId },
    select: { companyName: true, contactPersonName: true },
  });
  if (ep?.companyName)       return ep.companyName;
  if (ep?.contactPersonName) return ep.contactPersonName;

  return "An employer";
}

// ── GET /worker/lock-status ───────────────────────────────────────────────────

export async function getMyLockStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;

    const user = await prisma.user.findUnique({
      where:  { id: workerId },
      select: { isLocked: true, lockedByEmployerId: true },
    });
    if (!user) return err(res, "User not found", 404);

    if (!user.isLocked || !user.lockedByEmployerId) {
      return ok(res, { is_locked: false });
    }

    const lock = await prisma.workerLock.findFirst({
      where:  { workerId, lockStatus: "ACTIVE" },
      select: {
        id:             true,
        lockStatus:     true,
        lockStartDate:  true,
        lockExpiryDate: true,
        lockDays:       true,
        employerId:     true,
      },
    });

    if (!lock) {
      // Stale flag — not authoritative. Return not locked.
      return ok(res, { is_locked: false });
    }

    const now           = Date.now();
    const daysRemaining = Math.ceil(
      (lock.lockExpiryDate.getTime() - now) / (24 * 3600 * 1000),
    );
    const companyName = await getEmployerDisplayName(lock.employerId);

    return ok(res, {
      is_locked: true,
      lock: {
        id:               lock.id,
        lock_status:      lock.lockStatus,
        lock_start_date:  lock.lockStartDate,
        lock_expiry_date: lock.lockExpiryDate,
        lock_days:        lock.lockDays,
        days_remaining:   Math.max(0, daysRemaining),
        employer: {
          company_name: companyName,
        },
      },
    });
  } catch (e) { next(e); }
}

// ── GET /worker/lock-history ──────────────────────────────────────────────────

export async function getMyLockHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);

    const [rows, total] = await Promise.all([
      prisma.workerLock.findMany({
        where:   { workerId },
        skip,
        take:    limit,
        orderBy: { createdAt: "desc" },
        select: {
          id:             true,
          lockStatus:     true,
          lockStartDate:  true,
          lockExpiryDate: true,
          lockDays:       true,
          releaseReason:  true,
          createdAt:      true,
          employerId:     true,
        },
      }),
      prisma.workerLock.count({ where: { workerId } }),
    ]);

    // Resolve employer display names in parallel
    const employerNames = await Promise.all(
      rows.map(r => getEmployerDisplayName(r.employerId)),
    );

    const data = rows.map((r, i) => ({
      id:               r.id,
      lock_status:      r.lockStatus,
      lock_start_date:  r.lockStartDate,
      lock_expiry_date: r.lockExpiryDate,
      lock_days:        r.lockDays,
      release_reason:   r.releaseReason,
      created_at:       r.createdAt,
      employer: {
        company_name: employerNames[i],
      },
    }));

    return paginated(res, data, total, page, limit);
  } catch (e) { next(e); }
}

// ── GET /worker/lock-history/:lockId ─────────────────────────────────────────

export async function getMyLockDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const { lockId } = req.params;

    const lock = await prisma.workerLock.findUnique({
      where:  { id: lockId },
      select: {
        id:                  true,
        workerId:            true,
        lockStatus:          true,
        currency:            true,
        lockStartDate:       true,
        lockExpiryDate:      true,
        lockDays:            true,
        releaseReason:       true,
        adminOverrideBy:     true,
        adminOverrideAt:     true,
        adminOverrideNote:   true,
        expiryWarningSent:   true,
        createdAt:           true,
        updatedAt:           true,
        employerId:          true,
        // Omit: dailyFee, totalBilled, totalDaysBilled — never shown to worker
      },
    });

    if (!lock)                      return err(res, "Lock not found", 404);
    if (lock.workerId !== workerId) return err(res, "Forbidden", 403);

    const companyName = await getEmployerDisplayName(lock.employerId);

    // Fetch audit log events for this lock from the raw table
    // metadata is stored as JSON; filter where metadata->>'lock_id' matches
    const auditRows = await prisma.$queryRaw<
      Array<{ action: string; notes: string | null; created_at: Date }>
    >`
      SELECT action, notes, created_at
      FROM   "audit_log"
      WHERE  target_user_id = ${workerId}
        AND  metadata->>'lock_id' = ${lockId}
      ORDER  BY created_at ASC
    `;

    const timeline = auditRows.map(row => ({
      event:      row.action,
      notes:      row.notes ?? null,
      occurred_at: row.created_at,
    }));

    const { workerId: _wid, employerId: _eid, ...rest } = lock;

    return ok(res, {
      ...rest,
      employer: { company_name: companyName },
      timeline,
    });
  } catch (e) { next(e); }
}
