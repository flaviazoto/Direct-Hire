// backend/src/controllers/employer-jobs.controller.ts
// Employer job management — all endpoints require VERIFIED employer account.

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";
import { sendJobSubmittedEmail, sendJobResubmittedNotification } from "../services/email";
import { notifyApplicantsOfJobClosure } from "../services/queue";

// ── Audit log helper (raw insert — JOB_SUBMITTED not in generated enum yet) ───

async function insertJobAuditLog(employerId: string, jobId: string, jobTitle: string) {
  const id = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "audit_log" (id, admin_id, action, target_user_id, notes, metadata, created_at)
     VALUES ($1, $2, 'JOB_SUBMITTED'::"AuditAction", $3, $4, $5, NOW())`,
    id,
    employerId,          // actor (employer acting on their own resource)
    employerId,          // target_user_id (same — self-service action)
    `Job submitted: ${jobTitle}`,
    JSON.stringify({ jobId, jobTitle }),
  );
}

// ── Notify all admin users of a new pending job ───────────────────────────────

async function notifyAdminsNewJob(jobId: string, jobTitle: string, companyName: string) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  if (!admins.length) return;

  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      title:  "New job post pending review",
      body:   `"${jobTitle}" by ${companyName} is awaiting moderation.`,
      type:   "new_job_pending",
      link:   `/admin/jobs?jobId=${jobId}`,
    })),
  });
}

// ── Validation schemas ────────────────────────────────────────────────────────

const CONTRACT_TYPES = [
  "FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "INTERNSHIP", "FREELANCE",
] as const;

const JobBodyBaseSchema = z.object({
  title:               z.string().min(5, "Title must be at least 5 characters").max(120),
  companyName:         z.string().min(1).max(200),
  description:         z.string().min(100, "Description must be at least 100 characters"),
  requirements:        z.string().min(50, "Requirements must be at least 50 characters"),
  benefits:            z.string().optional(),
  country:             z.string().min(2).max(100),
  city:                z.string().min(1).max(100),
  remoteAllowed:       z.boolean().default(false),
  salaryMin:           z.number().positive("salary_min must be > 0"),
  salaryMax:           z.number().positive("salary_max must be > 0"),
  salaryCurrency:      z.string().max(10).default("USD"),
  contractType:        z.enum(CONTRACT_TYPES),
  experienceRequired:  z.number().int().min(0).max(50),
  category:            z.string().min(1).max(100),
  requiredSkills:      z.array(z.string().min(1).max(100)).min(1, "At least 1 skill required").max(20),
  languagesRequired:   z.array(z.string()).default([]),
  visaSupport:         z.boolean().default(false),
  accommodation:       z.boolean().default(false),
  applicationDeadline: z.string().datetime().optional(),
  positionsAvailable:  z.number().int().min(1).max(100).default(1),
});

type JobBodyInput = z.infer<typeof JobBodyBaseSchema>;
type JobUpdateInput = Partial<JobBodyInput>;

const JobBodySchema = JobBodyBaseSchema.refine(
  (d: JobBodyInput) => d.salaryMax >= d.salaryMin,
  { message: "salary_max must be >= salary_min", path: ["salaryMax"] },
).refine(
  (d: JobBodyInput) => !d.applicationDeadline || new Date(d.applicationDeadline) > new Date(),
  { message: "application_deadline must be in the future", path: ["applicationDeadline"] },
);

const JobUpdateSchema = JobBodyBaseSchema.partial().refine(
  (d: JobUpdateInput) => d.salaryMax === undefined || d.salaryMin === undefined || d.salaryMax >= d.salaryMin,
  { message: "salary_max must be >= salary_min", path: ["salaryMax"] },
).refine(
  (d: JobUpdateInput) => !d.applicationDeadline || new Date(d.applicationDeadline) > new Date(),
  { message: "application_deadline must be in the future", path: ["applicationDeadline"] },
);

// ── POST /employer/jobs ───────────────────────────────────────────────────────

export async function createJob(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const submit     = req.query.submit === "true";

    const input = JobBodySchema.parse(req.body);
    const status = submit ? "PENDING_MODERATION" : "DRAFT";

    // Fetch employer details — also checks posting rights
    const employer = await prisma.user.findUnique({
      where: { id: employerId },
      include: {
        employerProfile: { select: { companyName: true, contactPersonName: true } },
      },
    });
    if (!employer) return err(res, "Employer not found", 404);
    if (employer.postingRightsRevoked) {
      return err(res, "Your job posting rights have been suspended. Contact support@directhire.io to appeal.", 403);
    }

    const employerName =
      employer.employerProfile?.contactPersonName ??
      employer.employerProfile?.companyName ??
      employer.email;

    const job = await prisma.jobPost.create({
      data: {
        employerId,
        title:               input.title,
        companyName:         input.companyName,
        description:         input.description,
        requirements:        input.requirements,
        benefits:            input.benefits,
        country:             input.country,
        city:                input.city,
        remoteAllowed:       input.remoteAllowed,
        salaryMin:           input.salaryMin,
        salaryMax:           input.salaryMax,
        salaryCurrency:      input.salaryCurrency,
        contractType:        input.contractType,
        experienceRequired:  input.experienceRequired,
        category:            input.category,
        requiredSkills:      input.requiredSkills,
        languagesRequired:   input.languagesRequired,
        visaSupport:         input.visaSupport,
        accommodation:       input.accommodation,
        applicationDeadline: input.applicationDeadline ? new Date(input.applicationDeadline) : undefined,
        positionsAvailable:  input.positionsAvailable,
        status,
      },
    });

    if (submit) {
      // Fire-and-forget side effects
      Promise.all([
        sendJobSubmittedEmail(employerId, employer.email, employerName, job.title),
        notifyAdminsNewJob(job.id, job.title, job.companyName),
        insertJobAuditLog(employerId, job.id, job.title),
        prisma.notification.create({
          data: {
            userId: employerId,
            title:  `Job submitted for review — ${job.title}`,
            body:   `"${job.title}" is now pending admin review. We'll notify you once it's approved.`,
            type:   "GENERAL",
            link:   `/employer/jobs/${job.id}/edit`,
          },
        }),
      ]).catch(console.error);
    }

    return ok(res, job, "Job post created", 201);
  } catch (e) { next(e); }
}

// ── GET /employer/jobs ────────────────────────────────────────────────────────

const JOB_STATUS_VALUES = [
  "DRAFT", "PENDING_MODERATION", "APPROVED", "REJECTED", "ARCHIVED",
] as const;

export async function getEmployerJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId      = req.user!.sub;
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { status }      = req.query as Record<string, string>;

    const where: Record<string, unknown> = { employerId };
    if (status && JOB_STATUS_VALUES.includes(status as typeof JOB_STATUS_VALUES[number])) {
      where.status = status;
    }

    const [rows, total] = await Promise.all([
      prisma.jobPost.findMany({
        where, skip, take: limit, orderBy: { createdAt: "desc" },
        select: {
          id:                  true,
          title:               true,
          companyName:         true,
          status:              true,
          country:             true,
          city:                true,
          category:            true,
          contractType:        true,
          salaryMin:           true,
          salaryMax:           true,
          salaryCurrency:      true,
          applicationDeadline: true,
          positionsAvailable:  true,
          applicationCount:    true,
          viewCount:           true,
          moderationNotes:     true,
          moderationHistory:   true,
          changesRequestedAt:  true,
          createdAt:           true,
          updatedAt:           true,
        },
      }),
      prisma.jobPost.count({ where }),
    ]);

    return paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
}

// ── GET /employer/jobs/:id ────────────────────────────────────────────────────

export async function getEmployerJob(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;

    const job = await prisma.jobPost.findUnique({ where: { id: req.params.id } });
    if (!job) return err(res, "Job post not found", 404);
    if (job.employerId !== employerId) return err(res, "Forbidden", 403);

    return ok(res, job);
  } catch (e) { next(e); }
}

// ── PUT /employer/jobs/:id ────────────────────────────────────────────────────

export async function updateJob(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;

    const job = await prisma.jobPost.findUnique({ where: { id: req.params.id } });
    if (!job) return err(res, "Job post not found", 404);
    if (job.employerId !== employerId) return err(res, "Forbidden", 403);
    if (job.status !== "DRAFT" && job.status !== "REJECTED") {
      return err(res, `Cannot edit a job with status ${job.status} — only DRAFT or REJECTED jobs can be updated`, 400);
    }

    const input = JobUpdateSchema.parse(req.body);

    const updated = await prisma.jobPost.update({
      where: { id: job.id },
      data: {
        ...(input.title               !== undefined && { title:               input.title }),
        ...(input.companyName         !== undefined && { companyName:         input.companyName }),
        ...(input.description         !== undefined && { description:         input.description }),
        ...(input.requirements        !== undefined && { requirements:        input.requirements }),
        ...(input.benefits            !== undefined && { benefits:            input.benefits }),
        ...(input.country             !== undefined && { country:             input.country }),
        ...(input.city                !== undefined && { city:                input.city }),
        ...(input.remoteAllowed       !== undefined && { remoteAllowed:       input.remoteAllowed }),
        ...(input.salaryMin           !== undefined && { salaryMin:           input.salaryMin }),
        ...(input.salaryMax           !== undefined && { salaryMax:           input.salaryMax }),
        ...(input.salaryCurrency      !== undefined && { salaryCurrency:      input.salaryCurrency }),
        ...(input.contractType        !== undefined && { contractType:        input.contractType }),
        ...(input.experienceRequired  !== undefined && { experienceRequired:  input.experienceRequired }),
        ...(input.category            !== undefined && { category:            input.category }),
        ...(input.requiredSkills      !== undefined && { requiredSkills:      input.requiredSkills }),
        ...(input.languagesRequired   !== undefined && { languagesRequired:   input.languagesRequired }),
        ...(input.visaSupport         !== undefined && { visaSupport:         input.visaSupport }),
        ...(input.accommodation       !== undefined && { accommodation:       input.accommodation }),
        ...(input.applicationDeadline !== undefined && {
          applicationDeadline: input.applicationDeadline ? new Date(input.applicationDeadline) : null,
        }),
        ...(input.positionsAvailable  !== undefined && { positionsAvailable:  input.positionsAvailable }),
      },
    });

    return ok(res, updated, "Job updated");
  } catch (e) { next(e); }
}

// ── POST /employer/jobs/:id/submit ────────────────────────────────────────────

export async function submitJob(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;

    // Check posting rights before allowing submission
    const submitter = await prisma.user.findUnique({
      where:  { id: employerId },
      select: { postingRightsRevoked: true },
    });
    if (submitter?.postingRightsRevoked) {
      return err(res, "Your job posting rights have been suspended. Contact support@directhire.io to appeal.", 403);
    }

    const job = await prisma.jobPost.findUnique({ where: { id: req.params.id } });
    if (!job) return err(res, "Job post not found", 404);
    if (job.employerId !== employerId) return err(res, "Forbidden", 403);
    if (job.status !== "DRAFT" && job.status !== "REJECTED") {
      return err(res, `Cannot submit a job with status ${job.status} — only DRAFT or REJECTED jobs can be submitted`, 400);
    }
    const isResubmission = job.status === "REJECTED";

    // Validate all required fields are present
    const missing: string[] = [];
    if (!job.title         || job.title.length < 5)        missing.push("title");
    if (!job.description   || job.description.length < 100) missing.push("description");
    if (!job.requirements  || job.requirements.length < 50)  missing.push("requirements");
    if (!job.country)                                        missing.push("country");
    if (!job.city)                                           missing.push("city");
    if (!job.contractType)                                   missing.push("contractType");
    if (!job.requiredSkills || job.requiredSkills.length < 1) missing.push("requiredSkills");
    if (Number(job.salaryMin) <= 0)                          missing.push("salaryMin");
    if (Number(job.salaryMax) < Number(job.salaryMin))       missing.push("salaryMax");
    if (job.applicationDeadline && job.applicationDeadline < new Date()) missing.push("applicationDeadline (must be in the future)");

    if (missing.length) {
      return err(res, `Cannot submit — missing or invalid fields: ${missing.join(", ")}`, 422);
    }

    const updated = await prisma.jobPost.update({
      where: { id: job.id },
      data: {
        status:        "PENDING_MODERATION",
        ...(isResubmission && { resubmittedAt: new Date() }),
      },
    });

    // Fetch employer details for notifications
    const employer = await prisma.user.findUnique({
      where: { id: employerId },
      include: {
        employerProfile: { select: { companyName: true, contactPersonName: true } },
      },
    });

    const employerName =
      employer?.employerProfile?.contactPersonName ??
      employer?.employerProfile?.companyName ??
      employer?.email ?? employerId;

    const companyName = employer?.employerProfile?.companyName ?? job.companyName;

    // Side effects: fire-and-forget
    const sideEffects: Promise<unknown>[] = [
      sendJobSubmittedEmail(employerId, employer?.email ?? "", employerName, job.title),
      notifyAdminsNewJob(job.id, job.title, job.companyName),
      insertJobAuditLog(employerId, job.id, job.title),
      prisma.notification.create({
        data: {
          userId: employerId,
          title:  `Job submitted for review — ${job.title}`,
          body:   `"${job.title}" is now pending admin review. We'll notify you once it's approved.`,
          type:   "GENERAL",
          link:   `/employer/jobs/${job.id}/edit`,
        },
      }),
    ];

    if (isResubmission) {
      const prevNotes = typeof job.moderationNotes === "string" ? job.moderationNotes : "";
      sideEffects.push(
        sendJobResubmittedNotification(employerName, companyName, job.title, prevNotes),
      );
    }

    Promise.all(sideEffects).catch(console.error);

    return ok(res, updated, "Job submitted for review");
  } catch (e) { next(e); }
}

// ── DELETE /employer/jobs/:id ─────────────────────────────────────────────────
// Only DRAFT jobs can be deleted by the employer.

export async function deleteJob(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;

    const job = await prisma.jobPost.findUnique({ where: { id: req.params.id } });
    if (!job) return err(res, "Job post not found", 404);
    if (job.employerId !== employerId) return err(res, "Forbidden", 403);
    if (job.status !== "DRAFT") {
      return err(res, "Only DRAFT jobs can be deleted", 400);
    }

    await prisma.jobPost.delete({ where: { id: job.id } });
    return ok(res, null, "Job post deleted");
  } catch (e) { next(e); }
}

// ── POST /employer/jobs/:id/archive ───────────────────────────────────────────

export async function archiveJob(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;

    const job = await prisma.jobPost.findUnique({ where: { id: req.params.id } });
    if (!job) return err(res, "Job post not found", 404);
    if (job.employerId !== employerId) return err(res, "Forbidden", 403);
    if (job.status !== "APPROVED" && job.status !== "DRAFT") {
      return err(res, `Cannot archive a job with status ${job.status} — only APPROVED or DRAFT jobs can be archived`, 400);
    }

    const updated = await prisma.jobPost.update({
      where: { id: job.id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });

    notifyApplicantsOfJobClosure(job.id).catch((e: unknown) =>
      console.error(`[archiveJob] notifyApplicantsOfJobClosure failed for job ${job.id}:`, e));

    return ok(res, updated, "Job archived");
  } catch (e) { next(e); }
}
