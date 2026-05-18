// backend/src/controllers/worker-payments.controller.ts
import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { ok, getPagination } from "../lib/response";

export async function getWorkerPayments(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const userId = req.user!.sub;
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);

    // Resolve the worker's application IDs to look up APPLICATION_FEE payments
    const workerApplicationIds = await prisma.application.findMany({
      where:  { workerId: userId },
      select: { id: true },
    }).then(rows => rows.map(r => r.id));

    const where = workerApplicationIds.length > 0
      ? { entity_type: "APPLICATION_FEE" as const, entity_id: { in: workerApplicationIds } }
      : { entity_type: "APPLICATION_FEE" as const, entity_id: { in: [] as string[] } };

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take:    limit,
        select:  {
          id:                       true,
          amount_cents:             true,
          currency:                 true,
          status:                   true,
          entity_type:              true,
          stripe_payment_intent_id: true,
          created_at:               true,
        },
      }),
      prisma.payment.count({ where }),
    ]);

    const totalSpend = await prisma.payment.aggregate({
      where:  { ...where, status: "SUCCEEDED" },
      _sum:   { amount_cents: true },
    });

    return ok(res, {
      payments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalSpend: totalSpend._sum.amount_cents ?? 0,
    });
  } catch (e) { next(e); }
}
