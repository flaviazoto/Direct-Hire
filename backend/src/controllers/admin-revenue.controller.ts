// backend/src/controllers/admin-revenue.controller.ts

import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { ok, getPagination, paginated } from "../lib/response";

// ─── ENDPOINT 1: GET /revenue/summary ────────────────────────────────────────

export async function getRevenueSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const now            = new Date();
    const d30            = new Date(now.getTime() - 30 * 86400000);
    const startOfMonth   = new Date(now.getFullYear(), now.getMonth(), 1);
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [subThis, subLast, locks30, fees30, failed30, activeSubs, activeLocks] =
      await Promise.all([
        prisma.payment.aggregate({
          where: { type: "SUBSCRIPTION", status: "SUCCEEDED", createdAt: { gte: d30 } },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: {
            type: "SUBSCRIPTION", status: "SUCCEEDED",
            createdAt: { gte: startLastMonth, lt: startOfMonth },
          },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: { type: "WORKER_LOCK", status: "SUCCEEDED", createdAt: { gte: d30 } },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: { type: "APPLICATION_FEE", status: "SUCCEEDED", createdAt: { gte: d30 } },
          _sum: { amount: true },
        }),
        prisma.payment.count({
          where: { status: "FAILED", createdAt: { gte: d30 } },
        }),
        prisma.employerProfile.count({ where: { subscriptionStatus: "ACTIVE" } }),
        prisma.workerLock.count({ where: { lockStatus: "ACTIVE" } }),
      ]);

    const mrr         = subThis._sum.amount ?? 0;
    const mrrLast     = subLast._sum.amount ?? 0;
    const lockRevenue = locks30._sum.amount ?? 0;
    const feeRevenue  = fees30._sum.amount  ?? 0;
    const mrrGrowth   = mrrLast === 0 ? 0
      : Math.round(((mrr - mrrLast) / mrrLast) * 100);

    return ok(res, {
      mrr,
      mrrGrowth,
      lockRevenue30d:           lockRevenue,
      applicationFeeRevenue30d: feeRevenue,
      totalRevenue30d:          mrr + lockRevenue + feeRevenue,
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

    const typeFilter: { type?: string } =
      type === "subscription" ? { type: "SUBSCRIPTION"    } :
      type === "lock"         ? { type: "WORKER_LOCK"     } :
      type === "fee"          ? { type: "APPLICATION_FEE" } : {};

    const payments = await prisma.payment.findMany({
      where:   { status: "SUCCEEDED", createdAt: { gte: since }, ...typeFilter },
      select:  { amount: true, type: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // Initialise every day so the chart has no gaps
    const map: Record<string, DayBucket> = {};
    for (let i = days - 1; i >= 0; i--) {
      const key = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      map[key] = { subscriptionRevenue: 0, lockRevenue: 0, feeRevenue: 0, total: 0 };
    }

    for (const p of payments) {
      const key = p.createdAt.toISOString().slice(0, 10);
      if (!map[key]) continue;
      if      (p.type === "SUBSCRIPTION")    map[key].subscriptionRevenue += p.amount;
      else if (p.type === "WORKER_LOCK")     map[key].lockRevenue         += p.amount;
      else if (p.type === "APPLICATION_FEE") map[key].feeRevenue          += p.amount;
      map[key].total += p.amount;
    }

    return ok(res, Object.entries(map).map(([date, v]) => ({ date, ...v })));
  } catch (e) { next(e); }
}

// ─── ENDPOINT 3: GET /revenue/payments ───────────────────────────────────────

export async function getPaymentLog(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { type, status, search } = req.query as Record<string, string | undefined>;

    const where: {
      type?:   string;
      status?: string;
      user?:   { email: { contains: string; mode: "insensitive" } };
    } = {};
    if (type)   where.type   = type;
    if (status) where.status = status;
    if (search) where.user   = { email: { contains: search, mode: "insensitive" } };

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          user: {
            select: {
              email: true,
              role:  true,
              employerProfile: { select: { companyName: true, contactPersonName: true } },
              workerProfile:   { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.payment.count({ where }),
    ]);

    const shaped = payments.map((p) => {
      const ep = p.user.employerProfile;
      const wp = p.user.workerProfile;
      const displayName =
        ep?.companyName ??
        ep?.contactPersonName ??
        (wp ? [wp.firstName, wp.lastName].filter(Boolean).join(" ") : null) ??
        p.user.email;

      return {
        id:              p.id,
        amount:          p.amount,
        currency:        p.currency,
        status:          p.status,
        type:            p.type,
        description:     p.description,
        createdAt:       p.createdAt,
        stripePaymentId: p.stripePaymentId,
        user: {
          email:       p.user.email,
          role:        p.user.role,
          displayName,
        },
      };
    });

    return paginated(res, shaped, total, page, limit);
  } catch (e) { next(e); }
}
