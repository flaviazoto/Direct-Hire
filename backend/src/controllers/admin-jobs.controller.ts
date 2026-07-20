// backend/src/controllers/admin-jobs.controller.ts
// Admin job moderation endpoints — all require role = ADMIN.
// Handles approve, reject, request-changes, archive, and employer posting-rights.

import { Request, Response, NextFunction } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";
import {
  sendJobApprovedEmail,
  sendJobRejectedEmail,
  sendJobChangesRequestedEmail,
  sendPostingRightsRevokedEmail,
  sendPostingRightsRestoredEmail,
} from "../services/email";
import { insertAdminAuditLog } from "../lib/audit";
import { enqueue, notifyApplicantsOfJobClosure } from "../services/queue";

// ── Job counts cache (60-second TTL) ─────────────────────────────────────────

interface CountsCache { data: Record<string, number>; expiresAt: number }
let jobCountsCache: CountsCache | null = null;

// ── Moderation history helper ─────────────────────────────────────────────────

type HistoryEntry = Record<string, unknown>;

function appendHistory(current: unknown, entry: HistoryEntry): HistoryEntry[] {
  const arr = Array.isArray(current) ? (current as HistoryEntry[]) : [];
  return [...arr, { ...entry, timestamp: new Date().toISOString() }];
}

// ── Validation schemas ────────────────────────────────────────────────────────

const ReasonSchema = z.object({
  reason: z.string().min(20, "reason must be at least 20 characters").max(2000),
});

const NotesSchema = z.object({
  notes: z.string().min(20, "notes must be at least 20 characters").max(2000),
});

// ── Shared job fields for list queries ───────────────────────────────────────

const PENDING_LIST_SELECT = {
  id:                true,
  title:             true,
  companyName:       true,
  country:           true,
  city:              true,
  category:          true,
  contractType:      true,
  salaryMin:         true,
  salaryMax:         true,
  salaryCurrency:    true,
  requiredSkills:    true,
  visaSupport:       true,
  accommodation:     true,
  description:       true,
  requirements:      true,
  benefits:          true,
  createdAt:         true,
  resubmittedAt:     true,
  employer: {
    select: {
      id:                   true,
      email:                true,
      accountStatus:        true,
      postingRightsRevoked: true,
      employerProfile: {
        select: {
          contactPersonName: true,
          companyName:       true,
        },
      },
    },
  },
} as const;

// ── GET /admin/jobs/pending ───────────────────────────────────────────────────

export async function getPendingJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { category, country }  = req.query as Record<string, string>;

    const and: Record<string, unknown>[] = [{ status: "PENDING_MODERATION" }];
    if (category) and.push({ category: { equals: category, mode: "insensitive" } });
    if (country)  and.push({ country:  { contains: country,  mode: "insensitive" } });

    const where = { AND: and };

    const [rows, total] = await Promise.all([
      prisma.jobPost.findMany({
        where:   where as Prisma.JobPostWhereInput,
        skip,
        take:    limit,
        orderBy: { createdAt: "asc" },
        select:  PENDING_LIST_SELECT,
      }),
      prisma.jobPost.count({
        where: where as Prisma.JobPostWhereInput,
      }),
    ]);

    // Flatten employer name into a consistent shape
    const data = rows.map((r) => ({
      ...r,
      employer: {
        id:                   r.employer.id,
        email:                r.employer.email,
        accountStatus:        r.employer.accountStatus,
        postingRightsRevoked: r.employer.postingRightsRevoked,
        firstName:            r.employer.employerProfile?.contactPersonName?.split(" ")[0] ?? null,
        lastName:             r.employer.employerProfile?.contactPersonName?.split(" ").slice(1).join(" ") || null,
        companyName:          r.employer.employerProfile?.companyName ?? null,
      },
    }));

    return paginated(res, data, total, page, limit);
  } catch (e) { next(e); }
}

// ── GET /admin/jobs/:id ───────────────────────────────────────────────────────

export async function getAdminJobDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const job = await prisma.jobPost.findUnique({
      where:  { id },
      include: {
        employer: {
          select: {
            id:            true,
            email:         true,
            accountStatus: true,
            postingRightsRevoked: true,
            employerProfile: {
              select: {
                contactPersonName: true,
                companyName:       true,
              },
            },
          },
        },
      },
    });
    if (!job) return err(res, "Job not found", 404);

    const employerId = job.employerId;

    // Employer job stats
    const [totalPosted, totalApproved, totalRejected] = await Promise.all([
      prisma.jobPost.count({ where: { employerId } }),
      prisma.jobPost.count({ where: { employerId, status: "APPROVED"  } }),
      prisma.jobPost.count({ where: { employerId, status: "REJECTED"  } }),
    ]);

    // Audit log entries referencing this job
    const auditEntries = await prisma.$queryRaw<HistoryEntry[]>`
      SELECT id, admin_id, action, target_user_id, notes, metadata, created_at
      FROM "audit_log"
      WHERE metadata->>'job_id' = ${id}
      ORDER BY created_at ASC
    `;

    return ok(res, {
      ...job,
      employer: {
        id:              job.employer.id,
        email:           job.employer.email,
        accountStatus:   job.employer.accountStatus,
        postingRightsRevoked: job.employer.postingRightsRevoked,
        name:            job.employer.employerProfile?.contactPersonName ?? null,
        companyName:     job.employer.employerProfile?.companyName ?? null,
        totalJobsPosted:   totalPosted,
        totalJobsApproved: totalApproved,
        totalJobsRejected: totalRejected,
      },
      moderationHistory: job.moderationHistory ?? [],
      auditLog:          auditEntries,
    });
  } catch (e) { next(e); }
}

// ── POST /admin/jobs/:id/approve ──────────────────────────────────────────────

export async function approveJob(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { id }  = req.params;

    const job = await prisma.jobPost.findUnique({
      where:   { id },
      include: {
        employer: {
          select: {
            id:    true,
            email: true,
            employerProfile: { select: { contactPersonName: true } },
          },
        },
      },
    });
    if (!job)                                   return err(res, "Job not found", 404);
    if (job.status !== "PENDING_MODERATION")    return err(res, `Cannot approve a job with status ${job.status}`, 400);

    const firstName = job.employer.employerProfile?.contactPersonName?.split(" ")[0] ?? "there";

    const newHistory = appendHistory(job.moderationHistory, {
      action:   "APPROVED",
      admin_id: adminId,
    });

    const updated = await prisma.jobPost.update({
      where: { id },
      data: {
        status:           "APPROVED",
        approvedBy:       adminId,
        approvedAt:       new Date(),
        moderationHistory: newHistory as Parameters<typeof prisma.jobPost.update>[0]["data"]["moderationHistory"],
      },
      select: { id: true, status: true },
    });

    // Side effects: fire-and-forget
    Promise.all([
      insertAdminAuditLog({
        actorId:  adminId,
        targetId: job.employer.id,
        action:   "JOB_APPROVED",
        metadata: { job_id: id, job_title: job.title },
      }),
      sendJobApprovedEmail(job.employer.id, job.employer.email, firstName, job.title, id),
      prisma.notification.create({
        data: {
          userId: job.employer.id,
          title:  `Job approved — ${job.title}`,
          body:   `"${job.title}" has been approved and is now live for workers to see.`,
          type:   "ADMIN_JOB_MODERATION",
          link:   "/employer/jobs",
        },
      }),
    ]).catch(console.error);

    // Notify matching workers — background job, not awaited so approval never
    // waits on scoring dozens of worker profiles.
    enqueue("scoring.calculateMatchScores", { jobPostId: updated.id }).catch(console.error);

    return ok(res, { id: updated.id, status: updated.status });
  } catch (e) { next(e); }
}

// ── POST /admin/jobs/:id/reject ───────────────────────────────────────────────

export async function rejectJob(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { id }  = req.params;

    const parsed = ReasonSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { reason } = parsed.data;

    const job = await prisma.jobPost.findUnique({
      where:   { id },
      include: { employer: { select: { id: true, email: true } } },
    });
    if (!job)                                   return err(res, "Job not found", 404);
    if (job.status !== "PENDING_MODERATION")    return err(res, `Cannot reject a job with status ${job.status}`, 400);

    const newHistory = appendHistory(job.moderationHistory, {
      action:   "REJECTED",
      admin_id: adminId,
      notes:    reason,
    });

    await prisma.jobPost.update({
      where: { id },
      data: {
        status:            "REJECTED",
        moderationNotes:   reason,
        rejectedAt:        new Date(),
        moderationHistory: newHistory as Parameters<typeof prisma.jobPost.update>[0]["data"]["moderationHistory"],
      },
    });

    Promise.all([
      insertAdminAuditLog({
        actorId:  adminId,
        targetId: job.employer.id,
        action:   "JOB_REJECTED",
        notes:    reason,
        metadata: { job_id: id, job_title: job.title },
      }),
      sendJobRejectedEmail(job.employer.id, job.employer.email, job.title, id, reason),
      prisma.notification.create({
        data: {
          userId: job.employer.id,
          title:  `Job rejected — ${job.title}`,
          body:   `"${job.title}" was rejected. Reason: ${reason}`,
          type:   "ADMIN_JOB_MODERATION",
          link:   `/employer/jobs/${id}/edit`,
        },
      }),
    ]).catch(console.error);

    return ok(res, null);
  } catch (e) { next(e); }
}

// ── POST /admin/jobs/:id/request-changes ─────────────────────────────────────

export async function requestJobChanges(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { id }  = req.params;

    const parsed = NotesSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { notes } = parsed.data;

    const job = await prisma.jobPost.findUnique({
      where:   { id },
      include: { employer: { select: { id: true, email: true } } },
    });
    if (!job)                                   return err(res, "Job not found", 404);
    if (job.status !== "PENDING_MODERATION")    return err(res, `Cannot request changes on a job with status ${job.status}`, 400);

    const newHistory = appendHistory(job.moderationHistory, {
      action:   "CHANGES_REQUESTED",
      admin_id: adminId,
      notes,
    });

    // Set to REJECTED so employer can edit; changesRequestedAt signals the sub-status to the UI
    await prisma.jobPost.update({
      where: { id },
      data: {
        status:              "REJECTED",
        moderationNotes:     notes,
        changesRequestedAt:  new Date(),
        changesRequestedBy:  adminId,
        moderationHistory:   newHistory as Parameters<typeof prisma.jobPost.update>[0]["data"]["moderationHistory"],
      },
    });

    Promise.all([
      insertAdminAuditLog({
        actorId:  adminId,
        targetId: job.employer.id,
        action:   "JOB_CHANGES_REQUESTED",
        notes,
        metadata: { job_id: id, job_title: job.title },
      }),
      sendJobChangesRequestedEmail(job.employer.id, job.employer.email, job.title, id, notes),
      prisma.notification.create({
        data: {
          userId: job.employer.id,
          title:  `Changes requested — ${job.title}`,
          body:   `Admin requested changes to "${job.title}". Notes: ${notes}`,
          type:   "ADMIN_JOB_MODERATION",
          link:   `/employer/jobs/${id}/edit`,
        },
      }),
    ]).catch(console.error);

    return ok(res, null);
  } catch (e) { next(e); }
}

// ── POST /admin/jobs/:id/archive ──────────────────────────────────────────────

export async function archiveJobAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { id }  = req.params;

    const job = await prisma.jobPost.findUnique({
      where:   { id },
      include: { employer: { select: { id: true } } },
    });
    if (!job)                        return err(res, "Job not found", 404);
    if (job.status === "ARCHIVED")   return err(res, "Job is already archived", 400);

    const newHistory = appendHistory(job.moderationHistory, {
      action:   "ARCHIVED",
      admin_id: adminId,
    });

    await prisma.jobPost.update({
      where: { id },
      data: {
        status:            "ARCHIVED",
        archivedAt:        new Date(),
        moderationHistory: newHistory as Parameters<typeof prisma.jobPost.update>[0]["data"]["moderationHistory"],
      },
    });

    insertAdminAuditLog({
      actorId:  adminId,
      targetId: job.employer.id,
      action:   "JOB_ARCHIVED",
      metadata: { job_id: id, job_title: job.title },
    }).catch(console.error);

    notifyApplicantsOfJobClosure(id).catch((e: unknown) =>
      console.error(`[archiveJobAdmin] notifyApplicantsOfJobClosure failed for job ${id}:`, e));

    return ok(res, null);
  } catch (e) { next(e); }
}

// ── POST /admin/employers/:id/revoke-posting-rights ───────────────────────────

export async function revokePostingRights(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId     = req.user!.sub;
    const employerId  = req.params.id;

    const parsed = ReasonSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { reason } = parsed.data;

    const employer = await prisma.user.findUnique({
      where:  { id: employerId },
      select: { id: true, email: true, role: true, postingRightsRevoked: true },
    });
    if (!employer)                     return err(res, "User not found", 404);
    if (employer.role !== "EMPLOYER")  return err(res, "User is not an employer", 400);
    if (employer.postingRightsRevoked) return err(res, "Posting rights are already revoked", 400);

    await prisma.user.update({
      where: { id: employerId },
      data: {
        postingRightsRevoked:   true,
        postingRightsRevokedAt: new Date(),
        postingRightsRevokedBy: adminId,
      },
    });

    Promise.all([
      insertAdminAuditLog({
        actorId:  adminId,
        targetId: employerId,
        action:   "EMPLOYER_POSTING_RIGHTS_REVOKED",
        notes:    reason,
        metadata: { employer_id: employerId },
      }),
      sendPostingRightsRevokedEmail(employerId, employer.email),
    ]).catch(console.error);

    return ok(res, null);
  } catch (e) { next(e); }
}

// ── POST /admin/employers/:id/restore-posting-rights ─────────────────────────

export async function restorePostingRights(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId    = req.user!.sub;
    const employerId = req.params.id;

    const employer = await prisma.user.findUnique({
      where:  { id: employerId },
      select: { id: true, email: true, role: true, postingRightsRevoked: true },
    });
    if (!employer)                      return err(res, "User not found", 404);
    if (employer.role !== "EMPLOYER")   return err(res, "User is not an employer", 400);
    if (!employer.postingRightsRevoked) return err(res, "Posting rights are not revoked", 400);

    await prisma.user.update({
      where: { id: employerId },
      data: {
        postingRightsRevoked:   false,
        postingRightsRevokedAt: null,
      },
    });

    Promise.all([
      insertAdminAuditLog({
        actorId:  adminId,
        targetId: employerId,
        action:   "EMPLOYER_POSTING_RIGHTS_RESTORED",
        metadata: { employer_id: employerId },
      }),
      sendPostingRightsRestoredEmail(employerId, employer.email),
    ]).catch(console.error);

    return ok(res, null);
  } catch (e) { next(e); }
}

// ── GET /admin/jobs/counts ────────────────────────────────────────────────────

export async function getJobCounts(_req: Request, res: Response, next: NextFunction) {
  try {
    const now = Date.now();
    if (jobCountsCache && jobCountsCache.expiresAt > now) {
      return ok(res, jobCountsCache.data);
    }

    const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));

    const [
      pendingModeration,
      approved,
      rejected,
      archived,
      total,
      approvedToday,
      submittedToday,
    ] = await Promise.all([
      prisma.jobPost.count({ where: { status: "PENDING_MODERATION" } }),
      prisma.jobPost.count({ where: { status: "APPROVED"           } }),
      prisma.jobPost.count({ where: { status: "REJECTED"           } }),
      prisma.jobPost.count({ where: { status: "ARCHIVED"           } }),
      prisma.jobPost.count(),
      prisma.jobPost.count({ where: { status: "APPROVED", approvedAt: { gte: startOfToday } } }),
      prisma.jobPost.count({ where: { status: "PENDING_MODERATION", createdAt: { gte: startOfToday } } }),
    ]);

    const data = {
      pending_moderation: pendingModeration,
      approved,
      rejected,
      archived,
      total,
      approved_today:   approvedToday,
      submitted_today:  submittedToday,
    };

    jobCountsCache = { data, expiresAt: now + 60_000 };
    return ok(res, data);
  } catch (e) { next(e); }
}

// ── GET /admin/jobs/moderation-history ───────────────────────────────────────
// Paginated audit log for job moderation actions only (metadata->>'job_id' NOT NULL).

export async function getJobModerationHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const q = req.query as Record<string, string>;

    const conditions: string[] = [`al.metadata->>'job_id' IS NOT NULL`];
    const params: unknown[]    = [];
    let   pIdx = 1;

    if (q.job_id) {
      conditions.push(`al.metadata->>'job_id' = $${pIdx++}`);
      params.push(q.job_id);
    }
    if (q.employer_id) {
      conditions.push(`al.target_user_id = $${pIdx++}`);
      params.push(q.employer_id);
    }
    if (q.action) {
      conditions.push(`al.action = $${pIdx++}::"AuditAction"`);
      params.push(q.action);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const [countRows, rows] = await Promise.all([
      prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT COUNT(*) AS count FROM "audit_log" al ${where}`,
        ...params,
      ),
      prisma.$queryRawUnsafe<{
        id:               string;
        action:           string;
        notes:            string | null;
        created_at:       Date;
        admin_id:         string;
        admin_email:      string;
        admin_name:       string | null;
        employer_id:      string;
        employer_email:   string;
        employer_company: string | null;
        employer_name:    string | null;
        job_id:           string | null;
        job_title:        string | null;
      }[]>(
        `SELECT
           al.id,
           al.action::text,
           al.notes,
           al.created_at,
           a.id                                                   AS admin_id,
           a.email                                                AS admin_email,
           COALESCE(aw."firstName" || ' ' || aw."lastName",
                    ep_a."contactPersonName")                     AS admin_name,
           t.id                                                   AS employer_id,
           t.email                                                AS employer_email,
           ep_t."companyName"                                     AS employer_company,
           COALESCE(tw."firstName" || ' ' || tw."lastName",
                    ep_t."contactPersonName")                     AS employer_name,
           jp.id                                                  AS job_id,
           COALESCE(jp.title, al.metadata->>'job_title')          AS job_title
         FROM "audit_log" al
         JOIN "User"            a    ON a.id   = al.admin_id
         JOIN "User"            t    ON t.id   = al.target_user_id
         LEFT JOIN "WorkerProfile"   aw   ON aw."userId"  = al.admin_id
         LEFT JOIN "EmployerProfile" ep_a ON ep_a."userId" = al.admin_id
         LEFT JOIN "WorkerProfile"   tw   ON tw."userId"  = al.target_user_id
         LEFT JOIN "EmployerProfile" ep_t ON ep_t."userId" = al.target_user_id
         LEFT JOIN "job_posts"       jp   ON jp.id = al.metadata->>'job_id'
         ${where}
         ORDER BY al.created_at DESC
         LIMIT $${pIdx++} OFFSET $${pIdx++}`,
        ...params,
        limit,
        skip,
      ),
    ]);

    const total = Number(countRows[0].count);

    const data = rows.map((r) => ({
      id:         r.id,
      action:     r.action,
      notes:      r.notes,
      created_at: r.created_at,
      job: {
        id:    r.job_id,
        title: r.job_title,
      },
      admin: {
        id:    r.admin_id,
        email: r.admin_email,
        name:  r.admin_name,
      },
      employer: {
        id:      r.employer_id,
        email:   r.employer_email,
        name:    r.employer_name,
        company: r.employer_company,
      },
    }));

    return res.json({
      success:     true,
      data,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    });
  } catch (e) { next(e); }
}
