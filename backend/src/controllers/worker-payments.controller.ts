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

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where:   { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take:    limit,
        select:  {
          id:              true,
          amount:          true,
          currency:        true,
          status:          true,
          type:            true,
          description:     true,
          stripeInvoiceId: true,
          createdAt:       true,
          invoice:         { select: { id: true, invoiceNumber: true } },
        },
      }),
      prisma.payment.count({ where: { userId } }),
    ]);

    const totalSpend = await prisma.payment.aggregate({
      where:  { userId, status: "SUCCEEDED" },
      _sum:   { amount: true },
    });

    return ok(res, {
      payments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalSpend: totalSpend._sum.amount ?? 0,
    });
  } catch (e) { next(e); }
}
