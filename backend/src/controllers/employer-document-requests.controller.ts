// backend/src/controllers/employer-document-requests.controller.ts
// Phase 4, Step 3 — EmployerDocumentRequest CRUD (employer side). Phase 1
// created this model and Phase 2's sub-step 2 prompt described it, but
// grepping the whole backend turned up zero endpoints anywhere for it before
// this — confirmed rather than assumed, per the Phase 4 prompt's explicit
// ask. Built from scratch here.
//
// applicationId is required at this layer even though the schema field
// itself is nullable: EmployerDocumentRequest has no workerId field at all,
// so a "standing" (applicationId = null) request would have no worker it's
// even attached to — nobody could ever discover it as theirs to fulfill.
// Only the application-scoped shape is actually usable with this schema;
// flagged rather than silently building something unreachable.
//
// Reviewed by the EMPLOYER, not admin — unlike ApplicationDocument (admin-
// initiated, admin-reviewed), this model is employer-initiated, so the
// employer who asked for the document is who signs off on it. No existing
// code established this either way; this is the judgment call.

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";

const MAX_REQUESTS_PER_APPLICATION = 5;

const CreateRequestSchema = z.object({
  applicationId: z.string().min(1),
  label:         z.string().min(1).max(100),
  description:   z.string().max(1000).optional(),
  isRequired:    z.boolean().optional(),
});

// ── POST /employer/document-requests ──────────────────────────────────────────

export async function createDocumentRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { applicationId, label, description, isRequired } = CreateRequestSchema.parse(req.body);

    const app = await prisma.application.findUnique({
      where:  { id: applicationId },
      select: {
        id: true, employerId: true,
        worker: { select: { id: true } },
        job:    { select: { companyName: true } },
      },
    });
    if (!app) return err(res, "Application not found", 404);
    if (app.employerId !== employerId) return err(res, "Forbidden", 403);

    const existingCount = await prisma.employerDocumentRequest.count({ where: { applicationId } });
    if (existingCount >= MAX_REQUESTS_PER_APPLICATION) {
      return err(res, `You can request at most ${MAX_REQUESTS_PER_APPLICATION} documents per application.`, 422);
    }

    const request = await prisma.employerDocumentRequest.create({
      data: {
        employerId, applicationId, label,
        description: description ?? null,
        isRequired:  isRequired ?? true,
        status:      "REQUESTED",
      },
    });

    // In-app notification only, same call as Step 1's admin-requested-document
    // case — no new email template built for this (Step 3 didn't ask for one).
    prisma.notification.create({
      data: {
        userId: app.worker.id,
        type:   "DOCUMENT_PENDING",
        title:  "Document requested",
        body:   `${app.job.companyName} needs a document from you: ${label}.`,
        link:   "/worker/document-requests",
        metadata: { applicationId, requestId: request.id },
      },
    }).catch((e: unknown) => console.error("[employer document request notif]", e));

    return ok(res, request, "Document requested", 201);
  } catch (e) { next(e); }
}

// ── GET /employer/document-requests?applicationId=... ────────────────────────

export async function listDocumentRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { applicationId } = req.query as Record<string, string>;

    const requests = await prisma.employerDocumentRequest.findMany({
      where:   { employerId, ...(applicationId ? { applicationId } : {}) },
      orderBy: { createdAt: "desc" },
    });

    return ok(res, requests);
  } catch (e) { next(e); }
}

// ── PATCH /employer/document-requests/:id/approve ─────────────────────────────

export async function approveDocumentRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { id } = req.params;

    const request = await prisma.employerDocumentRequest.findUnique({ where: { id } });
    if (!request) return err(res, "Document request not found", 404);
    if (request.employerId !== employerId) return err(res, "Forbidden", 403);
    if (request.status !== "SUBMITTED") {
      return err(res, `Cannot approve — this request is ${request.status.toLowerCase()}, not submitted.`, 400);
    }

    const updated = await prisma.employerDocumentRequest.update({
      where: { id },
      data:  { status: "APPROVED", reviewedById: employerId, reviewedAt: new Date() },
    });

    return ok(res, updated, "Document approved");
  } catch (e) { next(e); }
}
