// backend/src/controllers/admin-hiring-workflow.controller.ts
// Admin-mediated hiring workflow (Phase 2, sub-steps 2 + 4; Part B redesigned
// the interview section) — all routes require role = ADMIN (see
// admin.routes.ts). Follows the exact ok/err/paginated response-shape and
// zod-validation conventions already used in admin-documents.controller.ts /
// admin.controller.ts.
//
// Sub-steps 2/4's original "no REJECTED path" note no longer holds as of
// Part B: markApplicationNotSelected below is an explicit, deliberate
// REJECTED path for the admin-mediated screening-interview outcome — see
// that function's comment for why REJECTED is the right value to reuse
// there. Everything else in this file (review/documents/fee stages) still
// has no reject path, unchanged.

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";
import { insertAdminAuditLog } from "../lib/audit";
import { getSignedUrlForPath } from "../services/storage";
import {
  sendApplicationApprovedQueuedEmail,
  sendApplicationDocumentRequestedEmail,
  sendApplicationDocumentsApprovedEmail,
  sendApplicationRejectedWorkerEmail,
} from "../services/email";
import { requestHire, EMPLOYER_VISIBLE_WORKFLOW_STATUSES } from "../lib/hire";

// ── Shared include shape for review-queue-style listings ─────────────────────

const APPLICATION_SUMMARY_INCLUDE = {
  worker: {
    select: {
      id: true, email: true,
      workerProfile: { select: { firstName: true, lastName: true, countryOfResidence: true } },
    },
  },
  job: { select: { id: true, title: true, companyName: true, country: true } },
  employer: {
    select: { id: true, email: true, employerProfile: { select: { companyName: true } } },
  },
  adminReview: true,
} as const;

// ── GET /admin/hiring/review-queue ────────────────────────────────────────────
// Applications awaiting the initial admin approve/leave-pending decision.

export async function getReviewQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);

    const where = { workflowStatus: "PENDING_ADMIN_REVIEW" as const };
    const [rows, total] = await Promise.all([
      prisma.application.findMany({
        where, skip, take: limit,
        // Sorts by createdAt, not updatedAt: the 2026-07-31 backfill
        // (backend/scripts/backfill-workflow-status.ts) moved 18 pre-migration
        // applications into this status in one batch, which would otherwise
        // all share the same updatedAt and cluster together out of true order
        // instead of reflecting their real age (spanning June-July 2026).
        orderBy: { createdAt: "asc" }, // oldest application first
        include: APPLICATION_SUMMARY_INCLUDE,
      }),
      prisma.application.count({ where }),
    ]);

    return paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
}

// ── POST /admin/hiring/applications/:applicationId/review/approve ────────────

const ApproveReviewSchema = z.object({
  noteToWorker: z.string().max(2000).optional(),
});

export async function approveApplicationReview(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { applicationId } = req.params;
    const { noteToWorker } = ApproveReviewSchema.parse(req.body);

    const app = await prisma.application.findUnique({
      where:  { id: applicationId },
      select: {
        id: true, workflowStatus: true,
        worker: { select: { id: true, email: true, workerProfile: { select: { firstName: true } } } },
        job:    { select: { title: true, companyName: true } },
      },
    });
    if (!app) return err(res, "Application not found", 404);
    if (app.workflowStatus !== "PENDING_ADMIN_REVIEW") {
      return err(res, `Cannot approve — application is at workflow stage ${app.workflowStatus ?? "none"}, not PENDING_ADMIN_REVIEW.`, 400);
    }

    const now = new Date();

    const [, updatedApp] = await prisma.$transaction([
      prisma.applicationAdminReview.upsert({
        where:  { applicationId },
        update: { decision: "APPROVED", decidedAt: now, reviewedById: adminId, noteToWorker: noteToWorker ?? null },
        create: { applicationId, decision: "APPROVED", decidedAt: now, reviewedById: adminId, noteToWorker: noteToWorker ?? null },
      }),
      prisma.application.update({
        where: { id: applicationId },
        data:  { workflowStatus: "APPROVED_QUEUED" },
      }),
    ]);

    const workerFirstName = app.worker.workerProfile?.firstName ?? "there";
    sendApplicationApprovedQueuedEmail(
      app.worker.id, app.worker.email, workerFirstName, app.job.title, app.job.companyName,
    ).catch((e: unknown) => console.error("[approved-queued email]", e));

    insertAdminAuditLog({
      actorId: adminId, targetId: app.worker.id,
      action: "APPLICATION_STATUS_CHANGED",
      notes: "workflowStatus PENDING_ADMIN_REVIEW -> APPROVED_QUEUED",
      metadata: { applicationId, noteToWorker: noteToWorker ?? null },
    }).catch(console.error);

    return ok(res, updatedApp, "Application approved and queued");
  } catch (e) { next(e); }
}

// ── PATCH /admin/hiring/applications/:applicationId/review/notes ─────────────
// Leave the record PENDING — update internal/worker-facing notes only, no
// decision or workflowStatus change. No reject endpoint exists in this file.

const UpdateReviewNotesSchema = z.object({
  decisionNotes: z.string().max(2000).optional(),
  noteToWorker:  z.string().max(2000).optional(),
});

export async function updateApplicationReviewNotes(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { applicationId } = req.params;
    const body = UpdateReviewNotesSchema.parse(req.body);

    if (body.decisionNotes === undefined && body.noteToWorker === undefined) {
      return err(res, "Provide at least one of: decisionNotes, noteToWorker", 422);
    }

    const app = await prisma.application.findUnique({ where: { id: applicationId }, select: { id: true } });
    if (!app) return err(res, "Application not found", 404);

    const review = await prisma.applicationAdminReview.upsert({
      where:  { applicationId },
      update: {
        ...(body.decisionNotes !== undefined && { decisionNotes: body.decisionNotes }),
        ...(body.noteToWorker  !== undefined && { noteToWorker:  body.noteToWorker }),
      },
      create: {
        applicationId,
        decisionNotes: body.decisionNotes ?? null,
        noteToWorker:  body.noteToWorker  ?? null,
      },
    });

    return ok(res, review, "Notes updated — decision left pending");
  } catch (e) { next(e); }
}

// ── GET /admin/hiring/document-queue ──────────────────────────────────────────
// Applications approved/queued and needing legal-document collection/review.

export async function getDocumentQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);

    // Widened from APPROVED_QUEUED-only (found while wiring the fee-charge
    // trigger below): that filter meant an application vanished from this
    // tab the moment a single document was requested (-> DOCUMENTS_PENDING)
    // or fully approved (-> DOCUMENTS_APPROVED) — losing the ability to
    // approve a worker's submission, or to start the fee charge, since the
    // application was no longer selectable here at all. This tab needs to
    // cover the whole document-verification lifecycle, not just its start.
    const where = {
      workflowStatus: {
        in: ["APPROVED_QUEUED", "DOCUMENTS_PENDING", "DOCUMENTS_APPROVED"] as ("APPROVED_QUEUED" | "DOCUMENTS_PENDING" | "DOCUMENTS_APPROVED")[],
      },
    };
    const [rawRows, total] = await Promise.all([
      prisma.application.findMany({
        where, skip, take: limit,
        orderBy: { updatedAt: "asc" },
        include: { ...APPLICATION_SUMMARY_INCLUDE, documents: true },
      }),
      prisma.application.count({ where }),
    ]);

    // Fresh signed URL per document on every read (filePath present) rather
    // than the possibly-expired fileUrl captured at submit time — same
    // convention as worker-applications.controller.ts's getApplicationDocuments.
    const rows = await Promise.all(rawRows.map(async (row) => ({
      ...row,
      documents: await Promise.all(row.documents.map(async (d) => {
        if (!d.filePath) return d;
        try { return { ...d, fileUrl: await getSignedUrlForPath(d.filePath) }; }
        catch { return d; }
      })),
    })));

    return paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
}

// ── POST /admin/hiring/applications/:applicationId/documents ─────────────────
// Admin specifies which legal doc is needed for this worker's country/visa —
// there's no fixed universal list, so this creates a fresh REQUESTED row.

const RequestDocumentSchema = z.object({
  documentType: z.string().min(1).max(100),
});

export async function requestApplicationDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const { applicationId } = req.params;
    const { documentType } = RequestDocumentSchema.parse(req.body);

    const app = await prisma.application.findUnique({
      where:  { id: applicationId },
      select: {
        id: true,
        worker: { select: { id: true, email: true, workerProfile: { select: { firstName: true } } } },
        job:    { select: { title: true, companyName: true } },
      },
    });
    if (!app) return err(res, "Application not found", 404);

    const doc = await prisma.applicationDocument.create({
      data: { applicationId, documentType, status: "REQUESTED" },
    });

    // Move workflowStatus to DOCUMENTS_PENDING the first time any document is
    // requested for this application (idempotent — only affects the initial
    // APPROVED_QUEUED -> DOCUMENTS_PENDING transition, harmless if already past it).
    await prisma.application.updateMany({
      where: { id: applicationId, workflowStatus: "APPROVED_QUEUED" },
      data:  { workflowStatus: "DOCUMENTS_PENDING" },
    });

    const workerFirstName = app.worker.workerProfile?.firstName ?? "there";
    sendApplicationDocumentRequestedEmail(
      app.worker.id, app.worker.email, workerFirstName, app.job.title, app.job.companyName, documentType,
    ).catch((e: unknown) => console.error("[document-requested email]", e));

    // Phase 4 addition — this previously only fired the email above, with no
    // in-app notification at all, and nowhere in-app for it to link to before
    // Phase 4 built the worker-facing upload page.
    prisma.notification.create({
      data: {
        userId: app.worker.id,
        type:   "DOCUMENT_PENDING",
        title:  "Document requested",
        body:   `${app.job.companyName} needs a document from you: ${documentType}.`,
        link:   "/worker/document-requests",
        metadata: { applicationId, documentId: doc.id },
      },
    }).catch((e: unknown) => console.error("[document-requested notif]", e));

    return ok(res, doc, "Document requested", 201);
  } catch (e) { next(e); }
}

// ── PATCH /admin/hiring/documents/:documentId/approve ─────────────────────────
// Per-document approve. After writing, checks whether every document on the
// same application is now APPROVED and — if so — advances workflowStatus to
// DOCUMENTS_APPROVED. This check runs after every single approval (not a
// separate manual button), so it can never be forgotten.

export async function approveApplicationDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { documentId } = req.params;

    const doc = await prisma.applicationDocument.findUnique({
      where:  { id: documentId },
      include: {
        application: {
          select: {
            workerId: true,
            worker: { select: { email: true, workerProfile: { select: { firstName: true } } } },
            job:    { select: { title: true, companyName: true } },
          },
        },
      },
    });
    if (!doc) return err(res, "Document not found", 404);

    const now = new Date();
    await prisma.applicationDocument.update({
      where: { id: documentId },
      data:  { status: "APPROVED", reviewedById: adminId, reviewedAt: now },
    });

    // ── "Approve all" check — triggered after every approval, not optional ──
    const remaining = await prisma.applicationDocument.count({
      where: { applicationId: doc.applicationId, status: { not: "APPROVED" } },
    });

    let workflowAdvanced = false;
    if (remaining === 0) {
      const updated = await prisma.application.updateMany({
        where: { id: doc.applicationId, workflowStatus: "DOCUMENTS_PENDING" },
        data:  { workflowStatus: "DOCUMENTS_APPROVED" },
      });
      workflowAdvanced = updated.count > 0;
    }

    if (workflowAdvanced) {
      sendApplicationDocumentsApprovedEmail(
        doc.application.workerId, doc.application.worker.email,
        doc.application.worker.workerProfile?.firstName ?? "there",
        doc.application.job.title, doc.application.job.companyName,
      ).catch((e: unknown) => console.error("[documents approved email]", e));
    }

    // targetId must be a User id (AdminAuditLog.targetUserId FK) — the
    // worker whose document this is, not the applicationId itself.
    insertAdminAuditLog({
      actorId: adminId, targetId: doc.application.workerId,
      action: "APPLICATION_STATUS_CHANGED",
      notes: workflowAdvanced ? "All application documents approved -> DOCUMENTS_APPROVED" : "Document approved",
      metadata: { documentId, applicationId: doc.applicationId, documentType: doc.documentType },
    }).catch(console.error);

    return ok(res, { documentId, allApproved: remaining === 0, workflowAdvanced }, "Document approved");
  } catch (e) { next(e); }
}

// ── POST /admin/hiring/applications/:applicationId/documents/skip ────────────
// Urgent fix: an application needing zero extra legal documents had no way
// to reach DOCUMENTS_APPROVED — approveApplicationDocument's "approve all"
// check only ever fires as a side effect of approving an actual document
// row, so an application with none was permanently stuck. This is the
// missing direct path: admin explicitly marks "no documents needed," same
// end state (DOCUMENTS_APPROVED) as if documents had been requested and all
// approved. Guarded the same way — only allowed when there's genuinely
// nothing outstanding (no rows, or every row already APPROVED) — so this
// can't be used to bypass a document that's still REQUESTED/SUBMITTED.

export async function skipDocumentVerification(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { applicationId } = req.params;

    const app = await prisma.application.findUnique({
      where:  { id: applicationId },
      select: {
        id: true, workflowStatus: true, workerId: true,
        worker: { select: { email: true, workerProfile: { select: { firstName: true } } } },
        job:    { select: { title: true, companyName: true } },
      },
    });
    if (!app) return err(res, "Application not found", 404);
    if (app.workflowStatus !== "APPROVED_QUEUED" && app.workflowStatus !== "DOCUMENTS_PENDING") {
      return err(res, `Cannot skip document verification — application is at workflow stage ${app.workflowStatus ?? "none"}.`, 400);
    }

    const outstanding = await prisma.applicationDocument.count({
      where: { applicationId, status: { not: "APPROVED" } },
    });
    if (outstanding > 0) {
      return err(res, `This application has ${outstanding} document(s) still awaiting approval — approve or resolve those first.`, 400);
    }

    const updated = await prisma.application.update({
      where: { id: applicationId },
      data:  { workflowStatus: "DOCUMENTS_APPROVED" },
    });

    sendApplicationDocumentsApprovedEmail(
      app.workerId, app.worker.email, app.worker.workerProfile?.firstName ?? "there",
      app.job.title, app.job.companyName,
    ).catch((e: unknown) => console.error("[documents approved email]", e));

    // targetId must be a User id (AdminAuditLog.targetUserId FK) — the
    // worker, not the applicationId itself.
    insertAdminAuditLog({
      actorId: adminId, targetId: app.workerId,
      action: "APPLICATION_STATUS_CHANGED",
      notes: "No documents needed -> DOCUMENTS_APPROVED",
      metadata: { applicationId },
    }).catch(console.error);

    return ok(res, updated, "No documents needed — moved to fee stage");
  } catch (e) { next(e); }
}

// ═══════════════════════════════════════════════════════════════════════════
// Part B — admin-mediated SCREENING interview (replaces Sub-step 4's
// "schedule interview" section entirely). New model: the employer never
// talks to the worker before a hire decision — admin conducts the actual
// screening call on the employer's behalf, records free-text notes + a
// lightweight recommendation, and relays the outcome to the employer
// manually (email/WhatsApp, off-platform). See employer-interview.controller.ts
// for the request side (Application.status -> SCREENING happens there, when
// the employer requests the interview — not here).
//
// interviewInstructions/interviewedAt (reused in Phase 2 for the old model)
// are a MISMATCH for this data and are deliberately left untouched by
// everything below: they were worker-facing scheduling details tied to
// interviewContactUnlocked (the old model shared the employer's contact
// details with the worker so the two could arrange the call themselves).
// The new adminNotes are admin-internal, never worker-facing, and there's no
// contact-sharing at all in this model — a different field for a different
// purpose, not a repurposing of the old one. ApplicationInterview.adminNotes/
// conductedAt is the real, correctly-scoped home for this data.
// ═══════════════════════════════════════════════════════════════════════════

// ── PATCH /admin/hiring/applications/:applicationId/interview ────────────────
// Records admin's notes + recommendation after the (off-platform) call.
// conductedAt is stamped once, on the first save — re-saving to edit notes
// later doesn't re-stamp it.

const RecordInterviewNotesSchema = z.object({
  adminNotes:     z.string().max(5000).optional(),
  recommendation: z.enum(["RECOMMEND", "DOES_NOT_MEET_REQUIREMENTS", "NEEDS_FOLLOW_UP"]).optional(),
});

export async function recordInterviewNotes(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { applicationId } = req.params;
    const { adminNotes, recommendation } = RecordInterviewNotesSchema.parse(req.body);

    if (adminNotes === undefined && recommendation === undefined) {
      return err(res, "Provide at least one of: adminNotes, recommendation", 422);
    }

    const interview = await prisma.applicationInterview.findUnique({
      where: { applicationId },
      include: { application: { select: { workerId: true } } },
    });
    if (!interview) return err(res, "No interview has been requested for this application yet", 404);

    const updated = await prisma.applicationInterview.update({
      where: { applicationId },
      data: {
        ...(adminNotes !== undefined && { adminNotes }),
        ...(recommendation !== undefined && { recommendation }),
        ...(interview.conductedAt === null && { conductedAt: new Date() }),
      },
    });

    // targetId must be a User id (AdminAuditLog.targetUserId FK) — the worker
    // being screened, not the applicationId itself.
    insertAdminAuditLog({
      actorId: adminId, targetId: interview.application.workerId,
      action: "APPLICATION_STATUS_CHANGED",
      notes: "Screening interview notes recorded",
      metadata: { applicationId, recommendation: recommendation ?? interview.recommendation },
    }).catch(console.error);

    return ok(res, updated, "Notes saved");
  } catch (e) { next(e); }
}

// ── POST /admin/hiring/applications/:applicationId/interview/relay ───────────
// Admin ticks this after sending the manual email/WhatsApp — the platform
// never sends this itself, this just records that it happened.

export async function markInterviewRelayed(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { applicationId } = req.params;

    const interview = await prisma.applicationInterview.findUnique({ where: { applicationId } });
    if (!interview) return err(res, "No interview has been requested for this application yet", 404);
    if (!interview.conductedAt) return err(res, "Record the call notes before marking it as relayed.", 400);

    const updated = await prisma.applicationInterview.update({
      where: { applicationId },
      data:  { relayedById: adminId, relayedToEmployerAt: new Date() },
    });

    return ok(res, updated, "Marked as relayed to employer");
  } catch (e) { next(e); }
}

// ── POST /admin/hiring/applications/:applicationId/not-selected ──────────────
// The close-out path alternative to confirmHire (unchanged, below). Reuses
// the existing REJECTED status — checked, not assumed: REJECTED already
// means exactly "this application did not result in a hire" everywhere else
// it's used (the employer's own pre-screening reject at VIEWED/SHORTLISTED),
// and that meaning holds just as well here — the trigger (admin, on the
// employer's relayed decision) differs, but the outcome represented by the
// status value itself doesn't. No ambiguity found worth flagging further.

export async function markApplicationNotSelected(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { applicationId } = req.params;

    const app = await prisma.application.findUnique({
      where:  { id: applicationId },
      include: {
        worker: { select: { id: true, email: true, workerProfile: { select: { firstName: true } } } },
        job:    { select: { title: true, companyName: true } },
      },
    });
    if (!app) return err(res, "Application not found", 404);
    if (app.status !== "SCREENING") {
      return err(res, `Cannot mark as not selected — application status is ${app.status}, not SCREENING.`, 400);
    }

    const updated = await prisma.application.update({
      where: { id: applicationId },
      data:  { status: "REJECTED", rejectedAt: new Date() },
    });

    sendApplicationRejectedWorkerEmail(
      app.worker.id, app.worker.email, app.job.title, app.job.companyName,
    ).catch((e: unknown) => console.error("[not selected email]", e));

    prisma.notification.create({
      data: {
        userId: app.worker.id, type: "APPLICATION_UPDATE",
        title:  `Update on your application — ${app.job.title}`,
        body:   `Thank you for your interest in "${app.job.title}" at ${app.job.companyName}. We will not be moving forward at this time.`,
        link:   `/worker/applications/${applicationId}`,
        metadata: { applicationId, status: "REJECTED" },
      },
    }).catch((e: unknown) => console.error("[not selected notif]", e));

    insertAdminAuditLog({
      actorId: adminId, targetId: app.worker.id,
      action: "APPLICATION_STATUS_CHANGED",
      notes: "SCREENING -> REJECTED (admin-mediated, not selected)",
      metadata: { applicationId },
    }).catch(console.error);

    return ok(res, updated, "Application marked as not selected");
  } catch (e) { next(e); }
}

// ── POST /admin/hiring/applications/:applicationId/hire ──────────────────────
// Interview-mediated hire path: after the employer's decision has been
// relayed back to admin off-platform (the interview redesign's flow), admin
// executes it here — capturing the same offer details the employer would
// enter directly (salary/start date/contract type). Major resequencing: this
// no longer finalizes the hire by itself. It calls the same requestHire()
// helper the employer's own direct "Hire" action uses (see
// employer-hire.controller.ts), which moves the application to
// HIRE_PENDING_WORKER_CONFIRMATION. The worker must still actively confirm
// (worker-hire.controller.ts) before status becomes ACCEPTED and the admin
// fee triggers — one consistent gate for every hire, regardless of which
// path (direct or interview-mediated) led to it. See lib/hire.ts.

const ConfirmHireSchema = z.object({
  offeredSalary:   z.string().optional(),
  offeredCurrency: z.string().max(3).optional(),
  startDate:       z.string().optional(),
  contractType:    z.string().max(50).optional(),
});

export async function confirmHire(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { applicationId } = req.params;
    const offer = ConfirmHireSchema.parse(req.body);

    const result = await requestHire(applicationId, adminId, offer);
    if ("error" in result) return err(res, result.error, result.status);

    return ok(res, result.application, "Hire requested — waiting on the worker to confirm");
  } catch (e) { next(e); }
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3 addition, updated for Part B and again for the hire-confirmation-
// gate resequencing. Previously spanned everything sitting at
// CLEARED_FOR_EMPLOYER — but under the new sequence, CLEARED_FOR_EMPLOYER is
// only reached at the very end (after the hire is confirmed AND the fee is
// paid), so an application is visible to admin for interview/hire purposes
// starting at DOCUMENTS_APPROVED, same as the employer's own view
// (employer-interview.controller.ts). Spans DOCUMENTS_APPROVED through
// CLEARED_FOR_EMPLOYER, distinguished by `status` (interview stage) and
// `workflowStatus` (hire/fee stage) together. Includes documents/adminReview/
// adminFeeCharge/interview alongside the row so the detail panel + activity
// timeline can render entirely from data already in this list response, with
// no second per-row fetch.
// ═══════════════════════════════════════════════════════════════════════════

// ── GET /admin/hiring/interview-hire-queue ────────────────────────────────────

export async function getInterviewHireQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);

    const where = { workflowStatus: { in: EMPLOYER_VISIBLE_WORKFLOW_STATUSES } };
    const [rows, total] = await Promise.all([
      prisma.application.findMany({
        where, skip, take: limit,
        orderBy: { updatedAt: "desc" }, // most recently progressed first
        include: {
          ...APPLICATION_SUMMARY_INCLUDE,
          documents:     { orderBy: { createdAt: "asc" } },
          adminFeeCharge: true,
          interview:      true,
        },
      }),
      prisma.application.count({ where }),
    ]);

    return paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
}
