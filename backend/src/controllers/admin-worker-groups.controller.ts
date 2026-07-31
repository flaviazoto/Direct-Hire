// backend/src/controllers/admin-worker-groups.controller.ts
// Admin-mediated hiring workflow (Phase 2, sub-step 5) — admin side of bulk
// quotes: review pending requests, prepare a quote, send it. All routes
// require role = ADMIN (see admin.routes.ts). The employer side (add/remove
// worker, list group, request a quote) lives in worker-groups.controller.ts.

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";
import { insertAdminAuditLog } from "../lib/audit";
import { sendBulkQuoteReadyEmail } from "../services/email";

export async function getPendingBulkQuotes(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const [rows, total] = await Promise.all([
      prisma.bulkQuoteRequest.findMany({
        where:   { status: "REQUESTED" },
        include: {
          employer: { select: { id: true, email: true, employerProfile: { select: { companyName: true } } } },
          workerGroup: { select: { _count: { select: { members: true } } } },
        },
        orderBy: { requestedAt: "asc" },
        skip, take: limit,
      }),
      prisma.bulkQuoteRequest.count({ where: { status: "REQUESTED" } }),
    ]);
    return paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
}

const SubmitBulkQuoteSchema = z.object({
  quoteAmountUsd: z.number().positive(),
  quoteNotes:     z.string().max(2000).optional(),
});

export async function submitBulkQuote(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { id } = req.params;
    const { quoteAmountUsd, quoteNotes } = SubmitBulkQuoteSchema.parse(req.body);

    const request = await prisma.bulkQuoteRequest.findUnique({ where: { id } });
    if (!request) return err(res, "Bulk quote request not found", 404);
    if (request.status !== "REQUESTED") {
      return err(res, `Cannot prepare a quote — request is already ${request.status}.`, 400);
    }

    const updated = await prisma.bulkQuoteRequest.update({
      where: { id },
      data: {
        quoteAmountUsd, quoteNotes,
        preparedById:    adminId,
        quotePreparedAt: new Date(),
        status:          "QUOTE_PREPARED",
      },
    });

    insertAdminAuditLog({
      actorId: adminId, targetId: request.employerId, action: "APPLICATION_STATUS_CHANGED",
      notes: `Bulk quote prepared: $${quoteAmountUsd}`,
      metadata: { bulkQuoteRequestId: id, quoteAmountUsd },
    }).catch(console.error);

    return ok(res, updated, "Quote prepared");
  } catch (e) { next(e); }
}

export async function sendBulkQuote(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { id } = req.params;

    const request = await prisma.bulkQuoteRequest.findUnique({
      where:  { id },
      include: { employer: { select: { id: true, email: true, employerProfile: { select: { companyName: true, contactPersonName: true } } } } },
    });
    if (!request) return err(res, "Bulk quote request not found", 404);
    if (request.status !== "QUOTE_PREPARED") {
      return err(res, `Cannot send — request is ${request.status}, expected QUOTE_PREPARED.`, 400);
    }

    const updated = await prisma.bulkQuoteRequest.update({
      where: { id },
      data:  { status: "SENT", quoteSentAt: new Date() },
    });

    const contactName = request.employer.employerProfile?.contactPersonName
      ?? request.employer.employerProfile?.companyName
      ?? "there";
    sendBulkQuoteReadyEmail(
      request.employer.id,
      request.employer.email,
      contactName,
      request.quoteAmountUsd ? request.quoteAmountUsd.toString() : "0",
      request.quoteNotes ?? undefined,
    ).catch((e: unknown) => console.error("[bulk quote ready email]", e));

    insertAdminAuditLog({
      actorId: adminId, targetId: request.employerId, action: "APPLICATION_STATUS_CHANGED",
      notes: "Bulk quote sent to employer",
      metadata: { bulkQuoteRequestId: id },
    }).catch(console.error);

    return ok(res, updated, "Quote sent");
  } catch (e) { next(e); }
}
