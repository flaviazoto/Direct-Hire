// backend/src/controllers/admin-hiring-workflow.controller.ts
// Admin-mediated hiring workflow (Phase 2, sub-steps 2 + 4) — all routes
// require role = ADMIN (see admin.routes.ts). Follows the exact
// ok/err/paginated response-shape and zod-validation conventions already
// used in admin-documents.controller.ts / admin.controller.ts.
//
// No REJECTED path anywhere in this file, per Phase 1's design: admin can
// only move an application's workflowStatus forward or leave it at its
// current state. A document staying SUBMITTED (not yet APPROVED) is the
// only "not done yet" state.

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";
import { insertAdminAuditLog } from "../lib/audit";
import {
  sendApplicationApprovedQueuedEmail,
  sendApplicationDocumentRequestedEmail,
  sendInterviewScheduledWorkerEmail,
  sendInterviewScheduledEmployerEmail,
  sendApplicationAcceptedWorkerEmail,
  sendHireConfirmationEmployerEmail,
} from "../services/email";

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

    const where = { workflowStatus: "APPROVED_QUEUED" as const };
    const [rows, total] = await Promise.all([
      prisma.application.findMany({
        where, skip, take: limit,
        orderBy: { updatedAt: "asc" },
        include: { ...APPLICATION_SUMMARY_INCLUDE, documents: true },
      }),
      prisma.application.count({ where }),
    ]);

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

    const doc = await prisma.applicationDocument.findUnique({ where: { id: documentId } });
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

    insertAdminAuditLog({
      actorId: adminId, targetId: doc.applicationId,
      action: "APPLICATION_STATUS_CHANGED",
      notes: workflowAdvanced ? "All application documents approved -> DOCUMENTS_APPROVED" : "Document approved",
      metadata: { documentId, applicationId: doc.applicationId, documentType: doc.documentType },
    }).catch(console.error);

    return ok(res, { documentId, allApproved: remaining === 0, workflowAdvanced }, "Document approved");
  } catch (e) { next(e); }
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-step 4 — admin interview scheduling + hire confirmation
// (replaces the employer-side INTERVIEWED/ACCEPTED transitions removed from
// employer-applications.controller.ts's updateApplicationStatus)
// ═══════════════════════════════════════════════════════════════════════════

// ── POST /admin/hiring/applications/:applicationId/interview ─────────────────
// Schedules/confirms an interview. Reuses Application.interviewInstructions/
// interviewedAt as-is (see the file-level note in employer-applications.
// controller.ts on why no new columns were added for date/type — flagged in
// the Phase 2 report, not silently added here).

const ScheduleInterviewSchema = z.object({
  date:  z.string().min(1), // ISO date/time string, stored as text inside interviewInstructions
  type:  z.enum(["video", "phone", "in-person"]),
  notes: z.string().max(5000).optional(),
});

export async function scheduleInterview(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { applicationId } = req.params;
    const { date, type, notes } = ScheduleInterviewSchema.parse(req.body);

    const app = await prisma.application.findUnique({
      where:  { id: applicationId },
      include: {
        worker:   { select: { id: true, email: true, workerProfile: { select: { firstName: true, lastName: true } } } },
        job:      { select: { title: true, companyName: true } },
        employer: { select: { id: true, email: true, employerProfile: { select: { companyName: true, contactPersonName: true } } } },
      },
    });
    if (!app) return err(res, "Application not found", 404);

    const now = new Date();
    const typeLabel = type === "video" ? "Video call" : type === "phone" ? "Phone call" : "In-person";
    // Combined into one free-text field — see file header note. Keeps `date`
    // and `type` machine-parseable at the front of the string in case a
    // later phase needs to extract them, without adding new columns now.
    const combinedInstructions = `Interview scheduled: ${date} (${typeLabel})${notes ? `\n\n${notes}` : ""}`;

    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: {
        status:                  "INTERVIEWED",
        interviewedAt:           now,
        interviewContactUnlocked: true,
        companyContactVisibleAt: now,
        interviewInstructions:   combinedInstructions,
      },
    });

    const workerName = [app.worker.workerProfile?.firstName, app.worker.workerProfile?.lastName].filter(Boolean).join(" ") || "the candidate";
    const workerFirstName = app.worker.workerProfile?.firstName ?? "there";
    const employerName = app.employer.employerProfile?.companyName ?? app.employer.employerProfile?.contactPersonName ?? app.employer.email;

    Promise.all([
      sendInterviewScheduledWorkerEmail(
        app.worker.id, app.worker.email, workerFirstName, app.job.title, app.job.companyName, date, typeLabel, notes,
      ).catch((e: unknown) => console.error("[interview scheduled worker email]", e)),
      sendInterviewScheduledEmployerEmail(
        app.employer.id, app.employer.email, employerName, workerName, app.job.title, date, typeLabel,
      ).catch((e: unknown) => console.error("[interview scheduled employer email]", e)),
      prisma.notification.create({
        data: {
          userId: app.worker.id, type: "APPLICATION_UPDATE",
          title:  `Interview scheduled — ${app.job.title} at ${app.job.companyName}`,
          body:   `Your interview for "${app.job.title}" has been scheduled for ${date} (${typeLabel}).`,
          link:   `/worker/applications/${applicationId}`,
          metadata: { applicationId, status: "INTERVIEWED" },
        },
      }).catch((e: unknown) => console.error("[interview scheduled worker notif]", e)),
      prisma.notification.create({
        data: {
          userId: app.employer.id, type: "APPLICATION_UPDATE",
          title:  `Interview scheduled with ${workerName}`,
          body:   `An interview with ${workerName} for "${app.job.title}" has been scheduled for ${date} (${typeLabel}).`,
          link:   `/employer/applications/${applicationId}`,
          metadata: { applicationId, status: "INTERVIEWED" },
        },
      }).catch((e: unknown) => console.error("[interview scheduled employer notif]", e)),
    ]).catch(console.error);

    insertAdminAuditLog({
      actorId: adminId, targetId: app.worker.id,
      action: "APPLICATION_STATUS_CHANGED",
      notes: "APPLIED/SHORTLISTED -> INTERVIEWED (admin-scheduled)",
      metadata: { applicationId, date, type },
    }).catch(console.error);

    return ok(res, updated, "Interview scheduled");
  } catch (e) { next(e); }
}

// ── POST /admin/hiring/applications/:applicationId/hire ──────────────────────
// Confirms the hire. Mirrors the old employer-driven ACCEPTED branch exactly
// (lock release, both-party emails/notifications) — see file header note on
// trust-score: no trust-score-update mechanism exists anywhere in this
// codebase (confirmed by grep across every controller/service — every
// trustScore reference is a read, never a write), so none is invoked here.
// If one is wanted, it needs to be designed and built, not assumed.

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
    const { offeredSalary, offeredCurrency, startDate, contractType } = ConfirmHireSchema.parse(req.body);

    const app = await prisma.application.findUnique({
      where:  { id: applicationId },
      include: {
        worker:   { select: { id: true, email: true, workerProfile: { select: { firstName: true, lastName: true } } } },
        job:      { select: { title: true, companyName: true } },
        employer: { select: { id: true, email: true, employerProfile: { select: { companyName: true, contactPersonName: true } } } },
      },
    });
    if (!app) return err(res, "Application not found", 404);

    // Lock guard — same check the old employer-side ACCEPTED transition had
    // (employer-applications.controller.ts, removed in Phase 2 sub-step 4):
    // don't let a hire be confirmed for this employer if a DIFFERENT employer
    // currently holds an active reservation on the worker.
    const workerUser = await prisma.user.findUnique({
      where:  { id: app.worker.id },
      select: { isLocked: true, lockedByEmployerId: true },
    });
    if (workerUser?.isLocked && workerUser.lockedByEmployerId !== app.employer.id) {
      return err(res, "This worker is currently reserved by another employer.", 409, { code: "WORKER_LOCKED" });
    }

    const now = new Date();
    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: {
        status:          "ACCEPTED",
        acceptedAt:      now,
        hireConfirmedAt: now,
        offeredSalary:   offeredSalary ? parseFloat(offeredSalary) : null,
        offeredCurrency: offeredCurrency ?? "USD",
        startDate:       startDate ? new Date(startDate) : null,
        contractType:    contractType ?? null,
      },
    });

    const workerName = [app.worker.workerProfile?.firstName, app.worker.workerProfile?.lastName].filter(Boolean).join(" ") || "the candidate";
    const workerFirstName = app.worker.workerProfile?.firstName ?? "";
    const employerDisplayName = app.employer.employerProfile?.companyName ?? app.employer.employerProfile?.contactPersonName ?? app.employer.email;

    const sideEffects: Promise<unknown>[] = [
      // Release any active lock the employer holds on this worker — hired, no longer needs a lock.
      // Identical logic to the removed employer-side ACCEPTED branch.
      prisma.workerLock.findFirst({
        where: { workerId: app.worker.id, employerId: app.employer.id, lockStatus: "ACTIVE" },
      }).then(activeLock => {
        if (!activeLock) return;
        return prisma.$transaction([
          prisma.workerLock.update({ where: { id: activeLock.id }, data: { lockStatus: "RELEASED", releaseReason: "HIRED" } }),
          prisma.user.update({ where: { id: app.worker.id }, data: { isLocked: false, lockedByEmployerId: null, lockedUntil: null } }),
        ]);
      }).catch((e: unknown) => console.error("[hire lock release]", e)),

      sendApplicationAcceptedWorkerEmail(
        app.worker.id, app.worker.email, workerFirstName, app.job.title, app.job.companyName,
      ).catch((e: unknown) => console.error("[accepted worker email]", e)),
      sendHireConfirmationEmployerEmail({
        employerUserId: app.employer.id, employerEmail: app.employer.email, employerName: employerDisplayName,
        workerName, jobTitle: app.job.title, startDate, contractType, offeredSalary, offeredCurrency: offeredCurrency ?? "USD",
      }).catch((e: unknown) => console.error("[hire confirmation email]", e)),

      prisma.notification.create({
        data: {
          userId: app.worker.id, type: "APPLICATION_UPDATE",
          title:  `Application accepted — ${app.job.title}`,
          body:   `Congratulations! ${app.job.companyName} has accepted your application for "${app.job.title}".`,
          link:   `/worker/applications/${applicationId}`,
          metadata: { applicationId, status: "ACCEPTED" },
        },
      }).catch((e: unknown) => console.error("[accepted worker notif]", e)),
      prisma.notification.create({
        data: {
          userId: app.employer.id, type: "APPLICATION_UPDATE",
          title:  `${workerName} hired — ${app.job.title}`,
          body:   `The hire for ${workerName} on "${app.job.title}" has been confirmed. Their contact details are in your dashboard.`,
          link:   `/employer/applications/${applicationId}`,
          metadata: { applicationId, status: "ACCEPTED" },
        },
      }).catch((e: unknown) => console.error("[accepted employer notif]", e)),
    ];

    Promise.all(sideEffects).catch(console.error);

    insertAdminAuditLog({
      actorId: adminId, targetId: app.worker.id,
      action: "APPLICATION_STATUS_CHANGED",
      notes: "INTERVIEWED -> ACCEPTED (admin-confirmed hire)",
      metadata: { applicationId, offeredSalary, offeredCurrency, startDate, contractType },
    }).catch(console.error);

    return ok(res, updated, "Hire confirmed");
  } catch (e) { next(e); }
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3 addition — interview + hire queue listing (no Phase 2 endpoint
// listed applications at this stage; scheduleInterview/confirmHire only ever
// acted on a single applicationId passed in from elsewhere). workflowStatus
// stays at CLEARED_FOR_EMPLOYER for the rest of the process — there's no
// separate "interview scheduled" or "hired" workflowStatus value — so this
// queue spans everything from just-cleared through hired, distinguished by
// `status` (VIEWED/SHORTLISTED = not yet interviewed, INTERVIEWED = interview
// set, ACCEPTED = hired) rather than by workflowStatus. Includes documents/
// adminReview/adminFeeCharge alongside the row so the detail panel + activity
// timeline can render entirely from data already in this list response, with
// no second per-row fetch.
// ═══════════════════════════════════════════════════════════════════════════

// ── GET /admin/hiring/interview-hire-queue ────────────────────────────────────

export async function getInterviewHireQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);

    const where = { workflowStatus: "CLEARED_FOR_EMPLOYER" as const };
    const [rows, total] = await Promise.all([
      prisma.application.findMany({
        where, skip, take: limit,
        orderBy: { updatedAt: "desc" }, // most recently progressed first
        include: {
          ...APPLICATION_SUMMARY_INCLUDE,
          documents:     { orderBy: { createdAt: "asc" } },
          adminFeeCharge: true,
        },
      }),
      prisma.application.count({ where }),
    ]);

    return paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
}
