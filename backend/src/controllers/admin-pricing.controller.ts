// backend/src/controllers/admin-pricing.controller.ts
// Admin endpoints for reading and updating application fee configuration.
// All routes require requireAdmin middleware.

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import { insertAuditLog } from "../lib/audit";

const FEE_KEYS = ["application_fee_enabled", "application_base_fee_cents"] as const;

// ── GET /admin/config/application-fee ────────────────────────────────────────

export async function getPricingConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.platformConfig.findMany({
      where: { key: { in: FEE_KEYS as unknown as string[] } },
    });

    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));

    return ok(res, {
      enabled:   (map["application_fee_enabled"]    ?? "true")  === "true",
      baseCents:  parseInt(map["application_base_fee_cents"] ?? "300", 10),
      feeDisplay: `$${(parseInt(map["application_base_fee_cents"] ?? "300", 10) / 100).toFixed(2)}`,
      minCents:   100,
      maxCents:   2500,
    });
  } catch (e) { next(e); }
}

// ── PATCH /admin/config/application-fee ──────────────────────────────────────

const UpdateSchema = z.object({
  baseCents: z.number().int().min(50).max(2500).optional(),
  enabled:   z.boolean().optional(),
});

export async function updatePricingConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;

    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { baseCents, enabled } = parsed.data;

    if (baseCents === undefined && enabled === undefined) {
      return err(res, "Provide at least one of: baseCents, enabled", 422);
    }

    const upserts: Array<{ key: string; value: string; description: string }> = [];

    if (baseCents !== undefined) {
      upserts.push({
        key:         "application_base_fee_cents",
        value:       String(baseCents),
        description: "Base application fee in cents (USD)",
      });
    }
    if (enabled !== undefined) {
      upserts.push({
        key:         "application_fee_enabled",
        value:       String(enabled),
        description: "Whether application fees are charged",
      });
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
      action:   "PRICING_CONFIG_UPDATED",
      metadata: Object.fromEntries(upserts.map(u => [u.key, u.value])),
    }).catch(console.error);

    return ok(res, { updated: upserts.map(u => u.key) });
  } catch (e) { next(e); }
}
