// backend/src/controllers/admin-revenue.controller.ts

import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { ok, getPagination, paginated } from "../lib/response";

// ─── ENDPOINT 1: GET /revenue/summary ────────────────────────────────────────

export async function getRevenueSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 86400000);

    const [locks30, fees30, failed30, activeSubs, activeLocks] =
      await Promise.all([
        prisma.payment.aggregate({
          where: { entity_type: "WORKER_LOCK", status: "SUCCEEDED", created_at: { gte: d30 } },
          _sum: { amount_cents: true },
        }),
        prisma.payment.aggregate({
          where: { entity_type: "APPLICATION_FEE", status: "SUCCEEDED", created_at: { gte: d30 } },
          _sum: { amount_cents: true },
        }),
        prisma.payment.count({
          where: { status: "FAILED", created_at: { gte: d30 } },
        }),
        prisma.subscription.count({ where: { status: "ACTIVE" } }),
        prisma.workerLock.count({ where: { lockStatus: "ACTIVE" } }),
      ]);

    const lockRevenue = locks30._sum.amount_cents ?? 0;
    const feeRevenue  = fees30._sum.amount_cents  ?? 0;

    return ok(res, {
      lockRevenue30d:           lockRevenue,
      applicationFeeRevenue30d: feeRevenue,
      totalRevenue30d:          lockRevenue + feeRevenue,
      activeSubscriptions:      activeSubs,
      activeLocksNow:           activeLocks,
      failedPayments30d:        failed30,
    });
  } catch (e) { next(e); }
}

// ─── ENDPOINT 2: GET /revenue/chart ──────────────────────────────────────────

interface DayBucket {
  subscriptionRevenue: number;
  lockRevenue:         number;
  feeRevenue:          number;
  total:               number;
}

export async function getRevenueChart(req: Request, res: Response, next: NextFunction) {
  try {
    const period = (req.query.period as string) ?? "30d";
    const type   = (req.query.type   as string) ?? "all";

    const days  = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const since = new Date(Date.now() - days * 86400000);

    const typeFilter: { entity_type?: string } =
      type === "lock" ? { entity_type: "WORKER_LOCK"     } :
      type === "fee"  ? { entity_type: "APPLICATION_FEE" } : {};

    const payments = await prisma.payment.findMany({
      where:   { status: "SUCCEEDED", created_at: { gte: since }, ...typeFilter },
      select:  { amount_cents: true, entity_type: true, created_at: true },
      orderBy: { created_at: "asc" },
    });

    // Initialise every day so the chart has no gaps
    const map: Record<string, DayBucket> = {};
    for (let i = days - 1; i >= 0; i--) {
      const key = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      map[key] = { subscriptionRevenue: 0, lockRevenue: 0, feeRevenue: 0, total: 0 };
    }

    for (const p of payments) {
      const key = p.created_at.toISOString().slice(0, 10);
      if (!map[key]) continue;
      if      (p.entity_type === "WORKER_LOCK")     map[key].lockRevenue += p.amount_cents;
      else if (p.entity_type === "APPLICATION_FEE") map[key].feeRevenue  += p.amount_cents;
      map[key].total += p.amount_cents;
    }

    return ok(res, Object.entries(map).map(([date, v]) => ({ date, ...v })));
  } catch (e) { next(e); }
}

// ─── ENDPOINT 3: GET /revenue/payments ───────────────────────────────────────

export async function getPaymentLog(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { type, status, search } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};
    if (type)   where.entity_type = type;
    if (status) where.status      = status;

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
        select: {
          id:                       true,
          entity_type:              true,
          entity_id:                true,
          stripe_payment_intent_id: true,
          amount_cents:             true,
          currency:                 true,
          status:                   true,
          metadata:                 true,
          created_at:               true,
        },
      }),
      prisma.payment.count({ where }),
    ]);

    const shaped = payments.map((p) => ({
      id:              p.id,
      amount:          p.amount_cents,
      currency:        p.currency,
      status:          p.status,
      type:            p.entity_type,
      entityId:        p.entity_id,
      metadata:        p.metadata,
      createdAt:       p.created_at,
      stripePaymentId: p.stripe_payment_intent_id,
    }));

    // Optionally filter by search term against metadata (best-effort)
    const filtered = search
      ? shaped.filter(p =>
          JSON.stringify(p.metadata ?? "").toLowerCase().includes(search.toLowerCase()),
        )
      : shaped;

    return paginated(res, filtered, total, page, limit);
  } catch (e) { next(e); }
}
