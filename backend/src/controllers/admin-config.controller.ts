// backend/src/controllers/admin-config.controller.ts
// Admin endpoints for reading all platform_config and updating lock-rate settings.

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import { insertAuditLog } from "../lib/audit";

// ── GET /admin/config ─────────────────────────────────────────────────────────
// Returns all platform_config rows as a flat key→value object.

export async function getConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.platformConfig.findMany({ orderBy: { key: "asc" } });
    return ok(res, Object.fromEntries(rows.map(r => [r.key, r.value])));
  } catch (e) { next(e); }
}

// ── PATCH /admin/config/lock-rate ─────────────────────────────────────────────

const LockRateSchema = z.object({
  dailyRateCents:     z.number().int().min(50).max(100000).optional(),
  maxConcurrentLocks: z.number().int().min(1).max(50).optional(),
  maxDurationDays:    z.number().int().min(1).max(365).optional(),
});

export async function updateLockRateConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;

    const parsed = LockRateSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { dailyRateCents, maxConcurrentLocks, maxDurationDays } = parsed.data;

    if (dailyRateCents === undefined && maxConcurrentLocks === undefined && maxDurationDays === undefined) {
      return err(res, "Provide at least one field to update", 422);
    }

    const upserts: { key: string; value: string; description: string }[] = [];
    if (dailyRateCents !== undefined) {
      upserts.push({ key: "lock_daily_rate_cents",  value: String(dailyRateCents),     description: "Daily lock fee in cents (USD)" });
    }
    if (maxConcurrentLocks !== undefined) {
      upserts.push({ key: "lock_max_concurrent",     value: String(maxConcurrentLocks), description: "Max concurrent worker locks per employer" });
    }
    if (maxDurationDays !== undefined) {
      upserts.push({ key: "lock_max_duration_days",  value: String(maxDurationDays),    description: "Maximum lock duration in days" });
    }

    await Promise.all(upserts.map(u =>
      prisma.platformConfig.upsert({
        where:  { key: u.key },
        update: { value: u.value, updatedBy: adminId },
        create: { key: u.key, value: u.value, description: u.description, updatedBy: adminId },
      }),
    ));

    insertAuditLog({
      actorId:  adminId,
      targetId: adminId,
      action:   "LOCK_RATE_CONFIG_UPDATED",
      metadata: Object.fromEntries(upserts.map(u => [u.key, u.value])),
    }).catch(console.error);

    return ok(res, { updated: upserts.map(u => u.key) });
  } catch (e) { next(e); }
}
