// backend/src/controllers/employer-applications.controller.ts
// Employer application management — all require role = EMPLOYER + accountStatus = VERIFIED.
// Employers can only access applications for their own jobs (employer_id = JWT sub).

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";
import {
  sendApplicationShortlistedEmail,
  sendApplicationRejectedWorkerEmail,
} from "../services/email";
import { insertAdminAuditLog } from "../lib/audit";

// ── Status transition matrix ──────────────────────────────────────────────────
// VIEWED is set automatically on fetch — not allowed via this endpoint.
//
// Phase 2 sub-step 4: SHORTLISTED->INTERVIEWED and INTERVIEWED->ACCEPTED were
// removed from this employer-facing endpoint — scheduling interviews and
// confirming hires are now admin-only actions (see
// admin-hiring-workflow.controller.ts's scheduleInterview/confirmHire).
// VIEWED->SHORTLISTED and *->REJECTED remain employer-controlled and
// unchanged, per explicit instruction. No other code path in this codebase
// ever sets Application.status to INTERVIEWED or ACCEPTED (confirmed via
// Phase 1's audit — this matrix + MUTABLE_STATUSES below were the only
// place), so removing these two target values here is a complete,
// non-partial fix — nothing else could still reach them.
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  APPLIED:      [],                          // not via endpoint — auto-viewed on fetch
  VIEWED:       ["SHORTLISTED", "REJECTED"],
  SHORTLISTED:  ["REJECTED"],                // ->INTERVIEWED removed, now admin-only
  INTERVIEWED:  ["REJECTED"],                // ->ACCEPTED removed, now admin-only
  ACCEPTED:     [],
  REJECTED:     [],
  WITHDRAWN:    [],
} as const;

// ── Shared worker select ──────────────────────────────────────────────────────

const WORKER_SELECT = {
  id:                true,
  email:             true,
  isLocked:          true,
  lockedByEmployerId: true,
  workerProfile: {
    select: {
      firstName:          true,
      lastName:           true,
      yearsExperience:    true,
      expectedSalary:     true,
      countryOfResidence: true,
      city:               true,
      skills:     { select: { skill:            true } },
      languages:  { select: { language: true, proficiencyLevel: true } },
    },
  },
} as const;

// ── Validation ────────────────────────────────────────────────────────────────

// INTERVIEWED/ACCEPTED removed as settable targets — see ALLOWED_TRANSITIONS
// comment above. z.enum(MUTABLE_STATUSES) rejecting those values with a
// clear 422 is exactly the "graceful failure, not a crash" behavior the
// not-yet-updated frontend needs until Phase 4 removes its Interview/Hire
// buttons.
const MUTABLE_STATUSES = ["SHORTLISTED", "REJECTED"] as const;
type MutableStatus = typeof MUTABLE_STATUSES[number];

const StatusUpdateSchema = z.object({
  status: z.enum(MUTABLE_STATUSES),
  reason: z.string().max(2000).optional(),
});

// ── GET /employer/applications ────────────────────────────────────────────────
// List all applications across all of this employer's jobs.

export async function getEmployerApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { status } = req.query as Record<string, string>;

    const VALID_STATUSES = [
      "APPLIED", "VIEWED", "SHORTLISTED", "INTERVIEWED", "ACCEPTED", "REJECTED", "WITHDRAWN",
    ];

    const where: Record<string, unknown> = { employerId };
    if (status && VALID_STATUSES.includes(status)) where.status = status;

    // Real aggregate counts across ALL of this employer's applications (not
    // just the paginated/status-filtered page) — one groupBy, not N queries.
    // Scoped by employerId only, deliberately ignoring the `status` query
    // filter above so the dashboard stat cards always reflect the true total.
    const [rows, total, statusCounts] = await Promise.all([
      prisma.application.findMany({
        where, skip, take: limit,
        orderBy: [{ createdAt: "desc" }],
        select: {
          id:         true,
          status:     true,
          matchScore: true,
          createdAt:  true,
          job: {
            select: { id: true, title: true, country: true },
          },
          worker: {
            select: {
              id: true,
              workerProfile: {
                select: {
                  firstName:          true,
                  lastName:           true,
                  countryOfResidence: true,
                  skills: { select: { skill: true } },
                },
              },
            },
          },
        },
      }),
      prisma.application.count({ where }),
      prisma.application.groupBy({
        by:     ["status"],
        where:  { employerId },
        _count: { _all: true },
      }),
    ]);

    const countByStatus = Object.fromEntries(
      statusCounts.map(s => [s.status, s._count._all]),
    ) as Record<string, number>;

    const stats = {
      totalApplicants: statusCounts.reduce((sum, s) => sum + s._count._all, 0),
      shortlisted:     countByStatus.SHORTLISTED ?? 0,
      interviewed:     countByStatus.INTERVIEWED ?? 0,
    };

    const data = rows.map(r => ({
      id:           r.id,
      status:       r.status,
      aiMatchScore: r.matchScore != null ? Number(r.matchScore) : null,
      appliedAt:    r.createdAt,
      jobPost: r.job
        ? { title: r.job.title, country: r.job.country }
        : null,
      workerProfile: r.worker.workerProfile
        ? {
            firstName:          r.worker.workerProfile.firstName,
            lastName:           r.worker.workerProfile.lastName,
            countryOfResidence: r.worker.workerProfile.countryOfResidence,
            skills:             r.worker.workerProfile.skills,
          }
        : null,
    }));

    // Custom response shape (not the plain paginated() helper) — needs the
    // extra `stats` block alongside the usual pagination envelope.
    return res.json({
      success: true,
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats,
    });
  } catch (e) { next(e); }
}

// ── GET /employer/jobs/:jobId/applications ────────────────────────────────────

export async function getJobApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { jobId }  = req.params;
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { status, sort } = req.query as Record<string, string>;

    // Guard: employer owns this job
    const job = await prisma.jobPost.findUnique({
      where:  { id: jobId },
      select: { id: true, employerId: true, title: true, companyName: true },
    });
    if (!job)                          return err(res, "Job not found", 404);
    if (job.employerId !== employerId) return err(res, "Forbidden", 403);

    const VALID_STATUSES = [
      "APPLIED", "VIEWED", "SHORTLISTED", "INTERVIEWED", "ACCEPTED", "REJECTED", "WITHDRAWN",
    ];

    const where: Record<string, unknown> = { jobId, employerId };
    if (status && VALID_STATUSES.includes(status)) where.status = status;

    const orderBy =
      sort === "match_score"
        ? [{ matchScore: "desc" as const }, { createdAt: "desc" as const }]
        : [{ createdAt: "desc" as const }];

    const [rows, total] = await Promise.all([
      prisma.application.findMany({
        where, skip, take: limit, orderBy,
        select: {
          id:                       true,
          status:                   true,
          createdAt:                true,
          coverLetter:              true,
          matchScore:               true,
          interviewContactUnlocked: true,
          interviewResponse:        true,
          interviewResponseMessage: true,
          interviewRespondedAt:     true,
          worker:                   { select: WORKER_SELECT },
        },
      }),
      prisma.application.count({ where }),
    ]);

    // Bulk mark APPLIED → VIEWED (silent, no email)
    const appliedIds = rows
      .filter(r => r.status === "APPLIED")
      .map(r => r.id);

    if (appliedIds.length > 0) {
      await prisma.application.updateMany({
        where: { id: { in: appliedIds }, status: "APPLIED" },
        data:  { status: "VIEWED", viewedAt: new Date() },
      });
      // Reflect the update in the response payload without a second DB round-trip
      for (const row of rows) {
        if (appliedIds.includes(row.id)) {
          (row as Record<string, unknown>).status = "VIEWED";
        }
      }
    }

    // Flatten worker profile for cleaner response shape
    const data = rows.map(r => ({
      id:                       r.id,
      status:                   (r as Record<string, unknown>).status ?? r.status,
      created_at:               r.createdAt,
      cover_letter:             r.coverLetter,
      match_score:              r.matchScore != null ? Number(r.matchScore) : null,
      interview_contact_unlocked: r.interviewContactUnlocked,
      interview_response:         r.interviewResponse,
      interview_response_message: r.interviewResponseMessage,
      interview_responded_at:     r.interviewRespondedAt,
      worker: {
        id:           r.worker.id,
        email:        r.worker.email,
        first_name:   r.worker.workerProfile?.firstName  ?? null,
        last_name:    r.worker.workerProfile?.lastName   ?? null,
        is_locked:    (r.worker as unknown as { isLocked?: boolean }).isLocked   ?? false,
        locked_by_me: (r.worker as unknown as { lockedByEmployerId?: string }).lockedByEmployerId === employerId,
        profile: {
          skills:           r.worker.workerProfile?.skills           ?? [],
          years_experience: r.worker.workerProfile?.yearsExperience  ?? null,
          expected_salary:  r.worker.workerProfile?.expectedSalary   ?? null,
          country:          r.worker.workerProfile?.countryOfResidence ?? null,
          city:             r.worker.workerProfile?.city             ?? null,
          languages:        r.worker.workerProfile?.languages        ?? [],
        },
      },
    }));

    return paginated(res, data, total, page, limit);
  } catch (e) { next(e); }
}

// ── GET /employer/applications/:id ────────────────────────────────────────────

export async function getApplicationDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { id }     = req.params;

    const app = await prisma.application.findUnique({
      where: { id },
      include: {
        worker: { select: WORKER_SELECT },
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
      },
    });

    if (!app)                          return err(res, "Application not found", 404);
    if (app.employerId !== employerId) return err(res, "Forbidden", 403);

    return ok(res, app);
  } catch (e) { next(e); }
}

// ── PUT /employer/applications/:id/status ─────────────────────────────────────

export async function updateApplicationStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { id }     = req.params;

    const parsed = StatusUpdateSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { status: newStatus, reason } = parsed.data;

    // Fetch application with worker + job data needed for notifications
    const app = await prisma.application.findUnique({
      where: { id },
      include: {
        worker: {
          select: {
            id:    true,
            email: true,
            workerProfile: {
              select: { firstName: true, lastName: true },
            },
          },
        },
        job: {
          select: {
            title:       true,
            companyName: true,
            employerId:  true,
          },
        },
        employer: {
          select: {
            id:    true,
            email: true,
            employerProfile: { select: { companyName: true, contactPersonName: true } },
          },
        },
      },
    });

    if (!app)                          return err(res, "Application not found", 404);
    if (app.employerId !== employerId) return err(res, "Forbidden", 403);

    // Validate transition
    const allowed = ALLOWED_TRANSITIONS[app.status] ?? [];

    // Lock guard previously here for the ACCEPTED transition was removed along
    // with ACCEPTED itself as a settable target on this endpoint — the
    // equivalent check now lives in admin-hiring-workflow.controller.ts's
    // confirmHire, the only remaining path that can set status = ACCEPTED.
    if (!(allowed as string[]).includes(newStatus)) {
      return err(
        res,
        `Cannot transition from ${app.status} to ${newStatus}. Allowed: ${allowed.join(", ") || "none"}`,
        400,
      );
    }

    const now = new Date();

    // ── Build update payload per new status ──────────────────────────────────
    type UpdateData = Parameters<typeof prisma.application.update>[0]["data"];

    const updateData: UpdateData = { status: newStatus as MutableStatus };

    if (newStatus === "SHORTLISTED") {
      updateData.shortlistedAt = now;
      // Phase 2 correction: workflowStatus is now set at application creation
      // time (worker-applications.controller.ts's createApplicationRecord),
      // not here. The employer's hiring-pipeline status (this field) and the
      // admin workflow run in parallel, independent of each other — shortlisting
      // has no effect on workflowStatus.
    }

    if (newStatus === "REJECTED") {
      updateData.rejectedAt       = now;
      updateData.rejectionReason  = reason ?? null;
    }

    const updated = await prisma.application.update({
      where: { id },
      data:  updateData,
    });

    // ── Fire-and-forget side effects ─────────────────────────────────────────
    const sideEffects: Promise<unknown>[] = [
      insertAdminAuditLog({
        actorId:  employerId,
        targetId: app.worker.id,
        action:   "APPLICATION_STATUS_CHANGED",
        notes:    `${app.status} → ${newStatus}`,
        metadata: {
          application_id: id,
          job_title:      app.job.title,
          new_status:     newStatus,
          ...(reason && { reason }),
        },
      }),
    ];

    const workerFirstName = app.worker.workerProfile?.firstName ?? "";

    if (newStatus === "SHORTLISTED") {
      sideEffects.push(
        sendApplicationShortlistedEmail(
          app.worker.id, app.worker.email, workerFirstName, app.job.title, app.job.companyName,
        ).catch((e: unknown) => console.error("[shortlisted email]", e)),
        prisma.notification.create({
          data: {
            userId:   app.worker.id,
            type:     "APPLICATION_UPDATE",
            title:    `You've been shortlisted for ${app.job.title}`,
            body:     `Good news! You've been shortlisted for "${app.job.title}" at ${app.job.companyName}.`,
            link:     `/worker/applications/${id}`,
            metadata: { applicationId: id, jobId: app.job.title, status: "SHORTLISTED" },
          },
        }).catch((e: unknown) => console.error("[shortlisted notif]", e)),
      );
    }

    // INTERVIEWED and ACCEPTED side effects (interview email, hire lock
    // release, hire confirmation emails) removed along with those transitions
    // — see admin-hiring-workflow.controller.ts's scheduleInterview/
    // confirmHire, which now own this logic exactly as it was here.

    if (newStatus === "REJECTED") {
      sideEffects.push(
        // Do NOT include rejection reason in worker email (per spec)
        sendApplicationRejectedWorkerEmail(
          app.worker.id, app.worker.email, app.job.title, app.job.companyName,
        ).catch((e: unknown) => console.error("[rejected email]", e)),
        prisma.notification.create({
          data: {
            userId:   app.worker.id,
            type:     "APPLICATION_UPDATE",
            title:    `Update on your application — ${app.job.title}`,
            body:     `Thank you for your interest in "${app.job.title}" at ${app.job.companyName}. We will not be moving forward at this time.`,
            link:     `/worker/applications/${id}`,
            metadata: { applicationId: id, status: "REJECTED" },
          },
        }).catch((e: unknown) => console.error("[rejected notif]", e)),
      );
    }

    Promise.all(sideEffects).catch(console.error);

    return ok(res, updated, "Application status updated");
  } catch (e) { next(e); }
}
