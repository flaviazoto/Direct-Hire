// backend/src/controllers/employer-hire.controller.ts
// Major resequencing: the employer no longer waits until CLEARED_FOR_EMPLOYER
// to make a hire decision. Once DOCUMENTS_APPROVED, the employer sees the
// candidate and gets two independent actions: "Request interview" (existing,
// employer-interview.controller.ts) and "Hire" (this file) — neither is
// required before the other. Clicking Hire captures the full offer (salary/
// start date/contract type — same fields the old admin-only confirmHire
// always populated) but does NOT finalize the hire or trigger the admin fee
// by itself: it moves the application to HIRE_PENDING_WORKER_CONFIRMATION
// and the worker must actively confirm (worker-hire.controller.ts) before
// anything is final. See lib/hire.ts for the shared logic — this is also the
// path admin-hiring-workflow.controller.ts's confirmHire uses for the
// interview-mediated route, so there's exactly one gate for every hire.

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import { requestHire } from "../lib/hire";

// ── POST /employer/applications/:applicationId/hire-request ──────────────────

const RequestHireSchema = z.object({
  offeredSalary:   z.string().optional(),
  offeredCurrency: z.string().max(3).optional(),
  startDate:       z.string().optional(),
  contractType:    z.string().max(50).optional(),
});

export async function requestHireForApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { applicationId } = req.params;
    const offer = RequestHireSchema.parse(req.body);

    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { employerId: true },
    });
    if (!app) return err(res, "Application not found", 404);
    if (app.employerId !== employerId) return err(res, "Forbidden", 403);

    const result = await requestHire(applicationId, employerId, offer);
    if ("error" in result) return err(res, result.error, result.status);

    return ok(res, result.application, "Hire requested — waiting on the worker to confirm");
  } catch (e) { next(e); }
}
