// backend/src/controllers/worker-applications.controller.ts
// Worker application endpoints — all require role = WORKER + accountStatus = VERIFIED.
// Workers can only access their own applications (always filtered by workerId = JWT sub).

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";
import {
  sendNewApplicationEmail,
  sendApplicationWithdrawnEmail,
} from "../services/email";
import { insertAdminAuditLog } from "../lib/audit";

// ── Shared select for list + detail ──────────────────────────────────────────

const APPLICATION_LIST_SELECT = {
  id:                       true,
  status:                   true,
  createdAt:                true,
  updatedAt:                true,
  coverLetter:              true,
  interviewContactUnlocked: true,
  interviewInstructions:    true,
  matchScore:               true,
  job: {
    select: {
      id:             true,
      title:          true,
      companyName:    true,
      country:        true,
      city:           true,
      salaryMin:      true,
      salaryMax:      true,
      salaryCurrency: true,
      contractType:   true,
    },
  },
} as const;

// ── Validation ────────────────────────────────────────────────────────────────

const ApplySchema = z.object({
  cover_letter: z.string().max(5000).optional(),
  worker_note:  z.string().max(2000).optional(),
});

const VALID_STATUSES = [
  "APPLIED", "VIEWED", "SHORTLISTED", "INTERVIEWED",
  "ACCEPTED", "REJECTED", "WITHDRAWN",
] as const;

// ── POST /worker/jobs/:jobId/apply ────────────────────────────────────────────

export async function applyToJob(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const jobId    = req.params.jobId;

    const parsed = ApplySchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { cover_letter, worker_note } = parsed.data;

    // Fetch job — verify it exists, is APPROVED, and grab employer email in one query
    const job = await prisma.jobPost.findUnique({
      where: { id: jobId },
      select: {
        id:          true,
        title:       true,
        companyName: true,
        employerId:  true,
        status:      true,
        employer:    { select: { id: true, email: true } },
      },
    });
    if (!job)                      return err(res, "Job not found", 404);
    if (job.status !== "APPROVED") return err(res, "This job is not accepting applications", 400);

    // Check duplicate (@@unique[workerId, jobId] — 409 as spec requires)
    const existing = await prisma.application.findUnique({
      where: { workerId_jobId: { workerId, jobId } },
      select: { id: true },
    });
    if (existing) return err(res, "Already applied", 409);

    // Create application
    const application = await prisma.application.create({
      data: {
        workerId,
        jobId,
        employerId:  job.employerId,
        status:      "APPLIED",
        coverLetter: cover_letter ?? null,
        workerNote:  worker_note  ?? null,
        matchScore:  null,
      },
    });

    // Increment applicationCount atomically
    await prisma.jobPost.update({
      where: { id: jobId },
      data:  { applicationCount: { increment: 1 } },
    });

    // Fire-and-forget side effects
    Promise.all([
      insertAdminAuditLog({
        actorId:  workerId,
        targetId: workerId,
        action:   "APPLICATION_SUBMITTED",
        metadata: {
          job_id:         jobId,
          employer_id:    job.employerId,
          application_id: application.id,
        },
      }),
      sendNewApplicationEmail(
        job.employer.id, job.employer.email,
        job.title, job.companyName, application.id, job.id,
      ),
      prisma.notification.create({
        data: {
          userId: job.employerId,
          title:  `New applicant for ${job.title}`,
          body:   `A new candidate has applied for ${job.title} at ${job.companyName}. Review their profile in your dashboard.`,
          type:   "new_application",
          link:   `/employer/jobs/${job.id}/applicants`,
        },
      }),
    ]).catch(console.error);

    return ok(res, application, "Application submitted", 201);
  } catch (e) { next(e); }
}

// ── GET /worker/applications ──────────────────────────────────────────────────

export async function getMyApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { status } = req.query as Record<string, string>;

    const where: Record<string, unknown> = { workerId };
    if (status && (VALID_STATUSES as readonly string[]).includes(status)) {
      where.status = status;
    }

    const [rows, total] = await Promise.all([
      prisma.application.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { updatedAt: "desc" },
        select:  APPLICATION_LIST_SELECT,
      }),
      prisma.application.count({ where }),
    ]);

    return paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
}

// ── GET /worker/applications/:id ──────────────────────────────────────────────

export async function getApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const { id }   = req.params;

    const app = await prisma.application.findUnique({
      where: { id },
      include: {
        job: {
          select: {
            id:             true,
            title:          true,
            companyName:    true,
            country:        true,
            city:           true,
            salaryMin:      true,
            salaryMax:      true,
            salaryCurrency: true,
            contractType:   true,
          },
        },
        employer: {
          select: {
            email:          true,
            phone:          true,
            employerProfile: { select: { contactPersonName: true } },
          },
        },
      },
    });

    if (!app)                       return err(res, "Application not found", 404);
    if (app.workerId !== workerId)  return err(res, "Forbidden", 403);

    // Build company_contact only when unlocked — never expose employer PII before that
    let companyContact: Record<string, unknown> | null = null;
    if (app.interviewContactUnlocked) {
      companyContact = {
        contact_name:           app.employer.employerProfile?.contactPersonName ?? null,
        contact_email:          app.employer.email,
        contact_phone:          app.employer.phone ?? null,
        company_name:           app.job.companyName,
        interview_instructions: app.interviewInstructions,
      };
    }

    // Strip internal employer relation from the response payload
    const { employer: _employer, ...rest } = app;
    return ok(res, { ...rest, company_contact: companyContact });
  } catch (e) { next(e); }
}

// ── POST /worker/applications/:id/withdraw ────────────────────────────────────

export async function withdrawApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const { id }   = req.params;

    const app = await prisma.application.findUnique({
      where: { id },
      select: {
        id:         true,
        workerId:   true,
        employerId: true,
        status:     true,
        jobId:      true,
        job:        { select: { title: true, companyName: true } },
        employer:   { select: { email: true } },
        worker:     { select: { workerProfile: { select: { firstName: true, lastName: true } } } },
      },
    });

    if (!app)                      return err(res, "Application not found", 404);
    if (app.workerId !== workerId) return err(res, "Forbidden", 403);
    if (app.status !== "APPLIED" && app.status !== "VIEWED") {
      return err(
        res,
        "Cannot withdraw after shortlisting — contact support@directhire.io",
        400,
      );
    }

    await prisma.application.update({
      where: { id },
      data:  { status: "WITHDRAWN" },
    });

    // Decrement applicationCount (floor at 0 — guard against accidental negatives)
    await prisma.$executeRaw`
      UPDATE "job_posts"
      SET    "application_count" = GREATEST(0, "application_count" - 1)
      WHERE  "id" = ${app.jobId}
    `;

    const wName = [
      app.worker.workerProfile?.firstName,
      app.worker.workerProfile?.lastName,
    ].filter(Boolean).join(" ") || "A candidate";

    // Fire-and-forget: notify employer
    sendApplicationWithdrawnEmail(
      app.employerId, app.employer.email,
      wName, app.job.title, app.job.companyName,
    ).catch(console.error);

    return ok(res, { success: true });
  } catch (e) { next(e); }
}

// ── GET /worker/applications/:id/contact ─────────────────────────────────────
// Critical security endpoint — only returns employer contact when ALL guards pass.

export async function getContactDetails(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const { id }   = req.params;

    const app = await prisma.application.findUnique({
      where: { id },
      select: {
        id:                      true,
        workerId:                true,
        employerId:              true,
        status:                  true,
        interviewContactUnlocked: true,
        interviewInstructions:   true,
        companyContactVisibleAt: true,
        job:      { select: { companyName: true } },
        employer: {
          select: {
            email:          true,
            phone:          true,
            employerProfile: { select: { contactPersonName: true } },
          },
        },
      },
    });

    if (!app)                           return err(res, "Application not found", 404);
    if (app.workerId !== workerId)      return err(res, "Forbidden", 403);
    if (!app.interviewContactUnlocked)  return err(res, "Contact details not available", 403);
    if (app.status !== "INTERVIEWED")   return err(res, "Contact details not available for this application status", 403);

    const now = new Date();

    // Fire-and-forget: audit + first-access timestamp
    Promise.all([
      insertAdminAuditLog({
        actorId:  workerId,
        targetId: workerId,
        action:   "CONTACT_DETAILS_ACCESSED",
        metadata: {
          application_id: id,
          employer_id:    app.employerId,
          accessed_at:    now.toISOString(),
        },
      }),
      // Record first access only — don't overwrite subsequent visits
      ...(!app.companyContactVisibleAt
        ? [prisma.application.update({
            where: { id },
            data:  { companyContactVisibleAt: now },
          })]
        : []),
    ]).catch(console.error);

    return ok(res, {
      contact_name:           app.employer.employerProfile?.contactPersonName ?? null,
      contact_email:          app.employer.email,
      contact_phone:          app.employer.phone ?? null,
      company_name:           app.job.companyName,
      interview_instructions: app.interviewInstructions,
    });
  } catch (e) { next(e); }
}
