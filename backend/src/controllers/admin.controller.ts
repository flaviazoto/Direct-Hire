// backend/src/controllers/admin.controller.ts
import { Request, Response, NextFunction } from "express";
import type { Prisma } from "@prisma/client";
import crypto from "crypto";
import prisma from "../lib/prisma";
import { ok, err, getPagination, paginated } from "../lib/response";
import { enqueue } from "../services/queue";
import {
  sendAccountApproved, sendAccountRejected, sendAccountSuspended, sendAccountReinstated,
  sendOtpVerification, sendWelcomeEmail, sendPasswordReset,
  sendContactFormEmail,
  OWNER_EMAIL,
} from "../services/email";
import { z } from "zod";
import { decrypt } from "../lib/encrypt";
import { insertAuditLog } from "../lib/audit";

// ── Audit log helper (raw insert — AdminAuditLog not yet in generated client) ──
async function insertAdminAuditLog(opts: {
  adminId: string;
  action: string;
  targetUserId: string;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const id = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "audit_log" (id, admin_id, action, target_user_id, notes, metadata, created_at)
     VALUES ($1, $2, $3::\"AuditAction\", $4, $5, $6::jsonb, NOW())`,
    id,
    opts.adminId,
    opts.action,
    opts.targetUserId,
    opts.notes ?? null,
    opts.metadata ? JSON.stringify(opts.metadata) : null,
  );
}

const ReviewSchema = z.object({
  userId:           z.string().cuid(),
  decision:         z.enum(["APPROVED","REJECTED","NEEDS_CHANGES"]),
  notes:            z.string().max(2000).optional(),
  changesRequested: z.string().max(2000).optional(),
});

const ReviewDocumentSchema = z.object({
  decision: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  notes: z.string().max(2000).optional(),
});

const ModerateJobSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "CLOSED", "DRAFT"]),
  notes: z.string().max(2000).optional(),
});

const ROLE_VALUES = ["WORKER", "EMPLOYER", "ADMIN"] as const;
const ONBOARDING_STATUS_VALUES = [
  "DRAFT",
  "IN_PROGRESS",
  "SUBMITTED",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "NEEDS_CHANGES",
] as const;
const USER_STATUS_VALUES = ["ACTIVE", "SUSPENDED", "BANNED", "PENDING_VERIFICATION"] as const;
const ACCOUNT_STATUS_VALUES = [
  "PENDING_EMAIL_VERIFICATION",
  "PENDING_REVIEW",
  "VERIFIED",
  "REJECTED",
  "SUSPENDED",
] as const;

type RoleValue = (typeof ROLE_VALUES)[number];
type OnboardingStatusValue = (typeof ONBOARDING_STATUS_VALUES)[number];
type UserStatusValue = (typeof USER_STATUS_VALUES)[number];
type AccountStatusValue = (typeof ACCOUNT_STATUS_VALUES)[number];

// ── getStats ──────────────────────────────────────────────────
export async function getStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const startOfDay = new Date(new Date().setHours(0,0,0,0));
    const start30d   = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const [totalWorkers, totalEmployers, totalAdmins, newToday, pendingUsers, approved, rejected, needsChanges, uploads, emailsToday] =
      await Promise.all([
        prisma.user.count({ where: { role: "WORKER" } }),
        prisma.user.count({ where: { role: "EMPLOYER" } }),
        prisma.user.count({ where: { role: "ADMIN" } }),
        prisma.user.count({ where: { createdAt: { gte: startOfDay } } }),
        prisma.user.count({ where: { accountStatus: "PENDING_REVIEW" } }),
        prisma.verificationRecord.count({ where: { reviewStatus: "APPROVED" } }),
        prisma.verificationRecord.count({ where: { reviewStatus: "REJECTED" } }),
        prisma.verificationRecord.count({ where: { reviewStatus: "NEEDS_CHANGES" } }),
        prisma.upload.count({ where: { status: "UPLOADED" } }),
        prisma.emailLog.count({ where: { createdAt: { gte: startOfDay } } }),
      ]);

    // Raw SQL with INNER JOIN guarantees no orphaned rows reach the mapping
    const recentRaw = await prisma.$queryRaw<{
      id: string; email: string; role: string; submittedAt: Date | null;
      firstName: string | null; lastName: string | null; countryOfResidence: string | null;
      companyName: string | null; contactPersonName: string | null;
    }[]>`
      SELECT
        u.id, u.email, u.role,
        op."submittedAt",
        wp."firstName", wp."lastName", wp."countryOfResidence",
        ep."companyName", ep."contactPersonName"
      FROM "OnboardingProgress" op
      INNER JOIN "User" u ON u.id = op."userId"
      LEFT JOIN "WorkerProfile" wp ON wp."userId" = u.id
      LEFT JOIN "EmployerProfile" ep ON ep."userId" = u.id
      WHERE op."isSubmitted" = true
        AND op."submittedAt" >= ${start30d}
      ORDER BY op."submittedAt" DESC
      LIMIT 5
    `;

    const recentSubmissions = recentRaw.map(r => ({
      userId:        r.id,
      email:         r.email,
      role:          r.role,
      submittedAt:   r.submittedAt,
      completionPct: 100,
      country:       r.countryOfResidence ?? null,
      name: r.role === "WORKER"
        ? [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email
        : r.companyName || r.contactPersonName || r.email,
    }));

    // Monthly registrations (last 12 months)
    const monthly = await prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT TO_CHAR(DATE_TRUNC('month',"createdAt"),'YYYY-MM') AS month, COUNT(*) AS count
      FROM "User"
      WHERE "createdAt" >= NOW() - INTERVAL '12 months'
      GROUP BY 1 ORDER BY 1
    `;

    return ok(res, {
      users:        { workers: totalWorkers, employers: totalEmployers, admins: totalAdmins, newToday },
      verification: { pending: pendingUsers, approved, rejected, needsChanges },
      uploads, emailsToday,
      recentSubmissions,
      monthly: monthly.map(m => ({ month: m.month, count: Number(m.count) })),
    });
  } catch (e) { console.error("[getStats] ERROR:", e); next(e); }
}

// ── getSubmissions ────────────────────────────────────────────
export async function getSubmissions(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { status, role, search, userId } = req.query as Record<string, string>;

    const where: Prisma.OnboardingProgressWhereInput = {};
    if (status && ONBOARDING_STATUS_VALUES.includes(status as OnboardingStatusValue)) {
      where.onboardingStatus = status as OnboardingStatusValue;
    }
    if (role && ROLE_VALUES.includes(role as RoleValue)) {
      where.role = role as RoleValue;
    }
    if (userId) where.userId = userId;
    if (search) {
      where.OR = [
        {
          user: {
            is: {
              email: { contains: search, mode: "insensitive" },
            },
          },
        },
        {
          user: {
            is: {
              workerProfile: {
                is: {
                  firstName: { contains: search, mode: "insensitive" },
                },
              },
            },
          },
        },
        {
          user: {
            is: {
              workerProfile: {
                is: {
                  lastName: { contains: search, mode: "insensitive" },
                },
              },
            },
          },
        },
        {
          user: {
            is: {
              employerProfile: {
                is: {
                  companyName: { contains: search, mode: "insensitive" },
                },
              },
            },
          },
        },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.onboardingProgress.findMany({
        where, skip, take: limit, orderBy: { updatedAt: "desc" },
        include: { user: { select: { id: true, email: true, role: true, status: true, createdAt: true } } },
      }),
      prisma.onboardingProgress.count({ where }),
    ]);

    const enriched = await Promise.all(rows.map(async row => {
      let name = row.user.email;
      let extra: Record<string, unknown> = {};
      if (row.role === "WORKER") {
        const wp = await prisma.workerProfile.findUnique({
          where:  { userId: row.userId },
          select: { firstName: true, lastName: true, countryOfResidence: true, riskScore: true },
        });
        name  = [wp?.firstName, wp?.lastName].filter(Boolean).join(" ") || name;
        extra = { country: wp?.countryOfResidence, riskScore: wp?.riskScore };
      } else {
        const ep = await prisma.employerProfile.findUnique({
          where:  { userId: row.userId },
          select: { companyName: true, industry: true },
        });
        name  = ep?.companyName ?? name;
        extra = { industry: ep?.industry };
      }
      const verif = await prisma.verificationRecord.findUnique({ where: { userId: row.userId } });
      return {
        userId: row.userId, email: row.user.email, role: row.role, name,
        onboardingStatus: row.onboardingStatus, isSubmitted: row.isSubmitted,
        submittedAt: row.submittedAt, userStatus: row.user.status,
        completionPct: Math.round((row.completedSteps.length / row.totalSteps) * 100),
        verificationStatus: verif?.reviewStatus, createdAt: row.user.createdAt, ...extra,
      };
    }));
    return paginated(res, enriched, total, page, limit);
  } catch (e) { next(e); }
}

// ── review ────────────────────────────────────────────────────
export async function review(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const input   = ReviewSchema.parse(req.body);

    const user   = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user)   return err(res, "User not found", 404);
    const verif  = await prisma.verificationRecord.findUnique({ where: { userId: input.userId } });
    if (!verif)  return err(res, "Verification record not found", 404);

    const newVerif   = input.decision === "APPROVED" ? "APPROVED" : input.decision === "REJECTED" ? "REJECTED" : "NEEDS_CHANGES";
    const newStatus  = input.decision === "APPROVED" ? "ACTIVE" : input.decision === "REJECTED" ? "SUSPENDED" : "PENDING_VERIFICATION";
    const newOnboard = input.decision === "APPROVED" ? "APPROVED" : input.decision === "REJECTED" ? "REJECTED" : "NEEDS_CHANGES";

    await prisma.$transaction([
      prisma.verificationRecord.update({
        where: { userId: input.userId },
        data: { reviewStatus: newVerif, adminNotes: input.notes,
                changesRequested: input.changesRequested, reviewedById: adminId, reviewedAt: new Date() },
      }),
      prisma.user.update({ where: { id: input.userId }, data: { status: newStatus } }),
      prisma.onboardingProgress.update({ where: { userId: input.userId }, data: { onboardingStatus: newOnboard } }),
    ]);

    if (input.decision === "APPROVED" && user.role === "WORKER") {
      await prisma.workerProfile.update({ where: { userId: input.userId }, data: { isSearchable: true } });
    }

    // Get display name
    let displayName = user.email;
    if (user.role === "WORKER") {
      const wp = await prisma.workerProfile.findUnique({ where: { userId: user.id } });
      displayName = [wp?.firstName, wp?.lastName].filter(Boolean).join(" ") || user.email;
    } else {
      const ep = await prisma.employerProfile.findUnique({ where: { userId: user.id } });
      displayName = ep?.companyName ?? user.email;
    }

    await insertAuditLog({
      actorId:  adminId,
      targetId: input.userId,
      action:   `REVIEW_${input.decision}`,
      entity:   "VerificationRecord",
      entityId: verif.id,
      metadata: { decision: input.decision, notes: input.notes },
    });

    const notifBody = input.decision === "APPROVED"
      ? "Your profile has been approved. You now have full access."
      : input.decision === "REJECTED"
      ? `Application not approved. Reason: ${input.notes ?? "See email for details"}`
      : `Changes requested: ${input.changesRequested ?? "See email for details"}`;

    await prisma.notification.create({
      data: {
        userId: input.userId,
        title:  input.decision === "APPROVED" ? "Profile Approved! 🎉" : input.decision === "REJECTED" ? "Application Not Approved" : "Profile Needs Updates",
        body:   notifBody, type: `REVIEW_${input.decision}`,
        link:   `/${user.role.toLowerCase()}/dashboard`,
      },
    });

    const appUrl = process.env.FRONTEND_URL!;
    if (input.decision === "APPROVED") {
      await enqueue("email.accountApproved", {
        userId: input.userId, to: user.email, name: displayName,
        role: user.role as "WORKER" | "EMPLOYER",
      });
    } else if (input.decision === "REJECTED") {
      await enqueue("email.accountRejected", {
        userId: input.userId, to: user.email, name: displayName,
        reason: input.notes ?? "Your application did not meet our requirements.",
      });
    } else {
      await enqueue("email.needsChanges", {
        userId: input.userId, to: user.email, name: displayName,
        changes: input.changesRequested ?? input.notes ?? "Please update your profile.",
      });
    }

    return ok(res, { decision: input.decision, userId: input.userId }, `User ${input.decision.toLowerCase()} successfully`);
  } catch (e) { next(e); }
}

// ── getUserCounts ─────────────────────────────────────────────
// Simple 60-second in-memory cache
let countsCache: { data: Record<string, number>; expiresAt: number } | null = null;

export async function getUserCounts(_req: Request, res: Response, next: NextFunction) {
  try {
    const now = Date.now();
    if (countsCache && countsCache.expiresAt > now) {
      return ok(res, countsCache.data);
    }

    const [
      pendingReview, verified, rejected, suspended, totalWorkers, totalEmployers,
      pendingJobs, liveJobs,
    ] = await Promise.all([
      prisma.user.count({ where: { accountStatus: "PENDING_REVIEW" } }),
      prisma.user.count({ where: { accountStatus: "VERIFIED" } }),
      prisma.user.count({ where: { accountStatus: "REJECTED" } }),
      prisma.user.count({ where: { accountStatus: "SUSPENDED" } }),
      prisma.user.count({ where: { role: "WORKER",   accountStatus: "VERIFIED" } }),
      prisma.user.count({ where: { role: "EMPLOYER", accountStatus: "VERIFIED" } }),
      prisma.jobPost.count({ where: { status: "PENDING_MODERATION" } }),
      prisma.jobPost.count({ where: { status: "APPROVED"           } }),
    ]);

    const data = {
      pending_review:   pendingReview,
      verified,
      rejected,
      suspended,
      total_workers:    totalWorkers,
      total_employers:  totalEmployers,
      pending_jobs:     pendingJobs,
      live_jobs:        liveJobs,
    };

    countsCache = { data, expiresAt: now + 60_000 };
    return ok(res, data);
  } catch (e) { next(e); }
}

// ── getAuditLog ───────────────────────────────────────────────
// Queries the admin audit_log table with admin + target_user joins
export async function getAuditLog(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const q = req.query as Record<string, string>;

    // Build WHERE clauses dynamically
    const conditions: string[] = [];
    const params: unknown[]    = [];
    let   pIdx = 1;

    if (q.admin_id) {
      conditions.push(`al.admin_id = $${pIdx++}`);
      params.push(q.admin_id);
    }
    if (q.target_user_id) {
      conditions.push(`al.target_user_id = $${pIdx++}`);
      params.push(q.target_user_id);
    }
    if (q.action) {
      conditions.push(`al.action = $${pIdx++}::"AuditAction"`);
      params.push(q.action);
    }
    if (q.from) {
      const d = new Date(q.from);
      if (!isNaN(d.getTime())) { conditions.push(`al.created_at >= $${pIdx++}`); params.push(d); }
    }
    if (q.to) {
      const d = new Date(q.to);
      if (!isNaN(d.getTime())) { conditions.push(`al.created_at <= $${pIdx++}`); params.push(d); }
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count query
    const countRows = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) AS count FROM "audit_log" al ${where}`,
      ...params,
    );
    const total = Number(countRows[0].count);

    // Data query — join admin + target_user, pull profile names
    // WorkerProfile columns are camelCase in DB (no @map), EmployerProfile likewise
    const rows = await prisma.$queryRawUnsafe<{
      id: string;
      action: string;
      notes: string | null;
      created_at: Date;
      admin_id: string;
      admin_email: string;
      admin_first: string | null;
      admin_last: string | null;
      target_id: string;
      target_email: string;
      target_role: string;
      target_first: string | null;
      target_last: string | null;
    }[]>(
      `SELECT
         al.id,
         al.action::text,
         al.notes,
         al.created_at,
         a.id               AS admin_id,
         a.email            AS admin_email,
         COALESCE(aw."firstName", ep_a."contactPersonName") AS admin_first,
         aw."lastName"      AS admin_last,
         t.id               AS target_id,
         t.email            AS target_email,
         t.role::text       AS target_role,
         COALESCE(tw."firstName", ep_t."contactPersonName") AS target_first,
         tw."lastName"      AS target_last
       FROM "audit_log" al
       JOIN "User" a    ON a.id  = al.admin_id
       JOIN "User" t    ON t.id  = al.target_user_id
       LEFT JOIN "WorkerProfile"   aw   ON aw."userId"  = al.admin_id
       LEFT JOIN "EmployerProfile" ep_a ON ep_a."userId" = al.admin_id
       LEFT JOIN "WorkerProfile"   tw   ON tw."userId"  = al.target_user_id
       LEFT JOIN "EmployerProfile" ep_t ON ep_t."userId" = al.target_user_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      ...params,
      limit,
      skip,
    );

    const data = rows.map((r) => ({
      id:         r.id,
      action:     r.action,
      notes:      r.notes,
      created_at: r.created_at,
      admin: {
        id:         r.admin_id,
        email:      r.admin_email,
        first_name: r.admin_first,
        last_name:  r.admin_last,
      },
      target_user: {
        id:         r.target_id,
        email:      r.target_email,
        role:       r.target_role,
        first_name: r.target_first,
        last_name:  r.target_last,
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

// ── getUsers ──────────────────────────────────────────────────
export async function getUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { role, status, search } = req.query as Record<string, string>;
    const where: Prisma.UserWhereInput = {};

    if (role && ROLE_VALUES.includes(role.toUpperCase() as RoleValue)) {
      where.role = role.toUpperCase() as RoleValue;
    }

    // 'status' param maps to accountStatus (new system)
    if (status && ACCOUNT_STATUS_VALUES.includes(status.toUpperCase() as AccountStatusValue)) {
      where.accountStatus = status.toUpperCase() as AccountStatusValue;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { workerProfile: { is: { firstName: { contains: search, mode: "insensitive" } } } },
        { workerProfile: { is: { lastName:  { contains: search, mode: "insensitive" } } } },
        { employerProfile: { is: { companyName: { contains: search, mode: "insensitive" } } } },
        { employerProfile: { is: { contactPersonName: { contains: search, mode: "insensitive" } } } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, skip, take: limit, orderBy: { createdAt: "desc" },
        select: {
          id: true, email: true, role: true,
          accountStatus: true, isEmailVerified: true, createdAt: true,
          verificationSubmittedAt: true,
          workerProfile:   { select: { firstName: true, lastName: true, documentsVerified: true } },
          employerProfile: { select: { companyName: true, contactPersonName: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const rows = users.map((u) => ({
      id:            u.id,
      email:         u.email,
      role:          u.role,
      accountStatus: u.accountStatus,
      isEmailVerified: u.isEmailVerified,
      createdAt:     u.createdAt,
      verificationSubmittedAt: u.verificationSubmittedAt,
      name: u.workerProfile
        ? [u.workerProfile.firstName, u.workerProfile.lastName].filter(Boolean).join(" ") || null
        : u.employerProfile?.contactPersonName ?? null,
      companyName: u.employerProfile?.companyName ?? null,
      documentsVerified: (u.workerProfile as any)?.documentsVerified === true,
    }));

    return paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
}

// ── getJobs ───────────────────────────────────────────────────
// GET /api/admin/jobs — all jobs, all employers, paginated + filterable.
const JOB_STATUS_FILTER_VALUES = [
  "DRAFT", "PENDING_MODERATION", "APPROVED", "REJECTED", "ARCHIVED",
] as const;
type JobStatusFilter = typeof JOB_STATUS_FILTER_VALUES[number];

export async function getJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { status, employer_id, country, category, search, sort } =
      req.query as Record<string, string>;

    const and: Prisma.JobPostWhereInput[] = [];

    if (status && JOB_STATUS_FILTER_VALUES.includes(status as JobStatusFilter)) {
      and.push({ status: status as JobStatusFilter });
    }
    if (employer_id) {
      and.push({ employerId: employer_id } as Prisma.JobPostWhereInput);
    }
    if (country) {
      and.push({ country: { contains: country, mode: "insensitive" } });
    }
    if (category) {
      and.push({ category: { contains: category, mode: "insensitive" } });
    }
    if (search) {
      and.push({
        OR: [
          { title:       { contains: search, mode: "insensitive" } },
          { companyName: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    const where: Prisma.JobPostWhereInput = and.length ? { AND: and } : {};
    const orderBy: Prisma.JobPostOrderByWithRelationInput =
      sort === "oldest" ? { createdAt: "asc" } : { createdAt: "desc" };

    const [rows, total] = await Promise.all([
      prisma.jobPost.findMany({
        where,
        skip,
        take:    limit,
        orderBy,
        select: {
          id:              true,
          title:           true,
          companyName:     true,
          country:         true,
          category:        true,
          status:          true,
          moderationNotes: true,
          createdAt:       true,
          approvedAt:      true,
          rejectedAt:      true,
          employer: {
            select: {
              id:    true,
              email: true,
              employerProfile: {
                select: {
                  contactPersonName: true,
                  companyName:       true,
                },
              },
            },
          },
        },
      }),
      prisma.jobPost.count({ where }),
    ]);

    const data = rows.map((r) => ({
      id:              r.id,
      title:           r.title,
      company_name:    r.companyName,
      country:         r.country,
      category:        r.category,
      status:          r.status,
      moderation_notes: r.moderationNotes,
      created_at:      r.createdAt,
      approved_at:     r.approvedAt,
      rejected_at:     r.rejectedAt,
      employer: {
        id:         r.employer.id,
        email:      r.employer.email,
        first_name: r.employer.employerProfile?.contactPersonName?.split(" ")[0] ?? null,
        last_name:  r.employer.employerProfile?.contactPersonName?.split(" ").slice(1).join(" ") || null,
        company:    r.employer.employerProfile?.companyName ?? null,
      },
    }));

    return paginated(res, data, total, page, limit);
  } catch (e) { next(e); }
}

// PATCH /api/admin/jobs/:id/status
// Legacy generic status update — use the dedicated moderation endpoints for full workflow.
const LegacyJobStatusSchema = z.object({
  status: z.enum(["DRAFT", "PENDING_MODERATION", "APPROVED", "REJECTED", "ARCHIVED"]),
  notes:  z.string().max(2000).optional(),
});

export async function updateJobStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { id }  = req.params;
    const input   = LegacyJobStatusSchema.parse(req.body);

    const existing = await prisma.jobPost.findUnique({
      where:  { id },
      select: {
        id:         true,
        status:     true,
        title:      true,
        employerId: true,
      },
    });
    if (!existing) return err(res, "Job post not found", 404);

    const updated = await prisma.jobPost.update({
      where:  { id },
      data:   { status: input.status },
      select: { id: true, status: true, title: true, updatedAt: true },
    });

    // Notify employer (fire-and-forget)
    prisma.notification.create({
      data: {
        userId: existing.employerId,
        title:  `Job status updated to ${input.status}`,
        body:   input.notes
          ? `"${existing.title}" is now ${input.status}. Note: ${input.notes}`
          : `"${existing.title}" is now ${input.status}.`,
        type: "ADMIN_JOB_MODERATION",
        link: "/employer/jobs",
      },
    }).catch(console.error);

    insertAuditLog({
      actorId:  adminId,
      targetId: existing.employerId,
      action:   "JOB_STATUS_UPDATED_BY_ADMIN",
      entity:   "JobPost",
      entityId: existing.id,
      metadata: { oldStatus: existing.status, newStatus: input.status, notes: input.notes ?? null },
    }).catch(console.error);

    return ok(res, updated, "Job status updated");
  } catch (e) { next(e); }
}

export async function suspendUser(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { status: "SUSPENDED" } });
    await insertAuditLog({ actorId: req.user!.sub, targetId: req.params.id, action: "USER_SUSPENDED", entity: "User", entityId: req.params.id });
    return ok(res, null, "User suspended");
  } catch (e) { next(e); }
}

export async function activateUser(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { status: "ACTIVE" } });
    await insertAuditLog({ actorId: req.user!.sub, targetId: req.params.id, action: "USER_ACTIVATED", entity: "User", entityId: req.params.id });
    return ok(res, null, "User activated");
  } catch (e) { next(e); }
}

// ── getUserDetail ─────────────────────────────────────────────
export async function getUserDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, role: true, status: true, accountStatus: true,
        isEmailVerified: true, lastLoginAt: true, createdAt: true,
        verificationSubmittedAt: true, approvedAt: true,
        rejectedAt: true, rejectionReason: true, suspendedAt: true, reviewedById: true,
      },
    });
    if (!user) return err(res, "User not found", 404);

    // Get uploads with URLs (generate signed URLs for private files)
    const uploads = await prisma.upload.findMany({
      where:   { userId: id, status: { not: "DELETED" } },
      orderBy: { uploadedAt: "desc" },
    });

    // For Supabase private files, generate signed URLs
    let enrichedUploads = uploads.map(u => ({ ...u }));
    if (process.env.STORAGE_PROVIDER === "supabase") {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
      enrichedUploads = await Promise.all(uploads.map(async u => {
        if (u.isPrivate && u.filePath) {
          const { data } = await client.storage
            .from(process.env.SUPABASE_STORAGE_BUCKET!)
            .createSignedUrl(u.filePath, 3600); // 1 hour
          return { ...u, signedUrl: data?.signedUrl ?? u.fileUrl };
        }
        return { ...u, signedUrl: u.fileUrl };
      }));
    } else {
      // Local storage — fileUrl is already accessible
      enrichedUploads = uploads.map(u => ({ ...u, signedUrl: u.fileUrl }));
    }

    let profile = null;
    let onboarding = null;
    let verification = null;

    if (user.role === "WORKER") {
      const raw = await prisma.workerProfile.findUnique({
        where: { userId: id },
        include: {
          skills:          { select: { skill: true } },
          languages:       { select: { language: true, proficiencyLevel: true } },
          targetCountries: { select: { country: true } },
        },
      });
      if (raw) {
        profile = {
          ...raw,
          passportNumber: (raw as any).passportNumber
            ? decrypt((raw as any).passportNumber)
            : null,
        };
      }
    } else if (user.role === "EMPLOYER") {
      const raw = await prisma.employerProfile.findUnique({
        where: { userId: id },
        include: {
          hiringCountries: { select: { country: true } },
          requiredSkills:  { select: { skill: true } },
        },
      });
      if (raw) {
        profile = {
          ...raw,
          administratorId: (raw as any).administratorId
            ? decrypt((raw as any).administratorId)
            : null,
        };
      }
    }

    onboarding   = await prisma.onboardingProgress.findUnique({ where: { userId: id } });
    verification = await prisma.verificationRecord.findUnique({ where: { userId: id } });

    // Last 5 admin audit log entries for this user
    const recentAuditLogs = await prisma.$queryRaw<{
      id: string; action: string; admin_id: string; notes: string | null; created_at: Date;
    }[]>`
      SELECT id, action, admin_id, notes, created_at
      FROM "audit_log"
      WHERE target_user_id = ${id}
      ORDER BY created_at DESC
      LIMIT 5
    `;

    return ok(res, { user, profile, uploads: enrichedUploads, onboarding, verification, recentAuditLogs });
  } catch (e) { next(e); }
}

// â”€â”€ reviewDocument â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function reviewDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const uploadId = req.params.id;
    const input = ReviewDocumentSchema.parse(req.body);

    const upload = await prisma.upload.findUnique({
      where: { id: uploadId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!upload || upload.status === "DELETED") {
      return err(res, "Document not found", 404);
    }

    const updateData = input.decision === "PENDING"
      ? {
          reviewStatus: "PENDING" as const,
          reviewNotes: input.notes ?? null,
          reviewedById: null,
          reviewedAt: null,
        }
      : {
          reviewStatus: input.decision,
          reviewNotes: input.notes ?? null,
          reviewedById: adminId,
          reviewedAt: new Date(),
        };

    const updated = await prisma.upload.update({
      where: { id: uploadId },
      data: updateData,
      select: {
        id: true,
        fileType: true,
        fileName: true,
        reviewStatus: true,
        reviewNotes: true,
        reviewedAt: true,
      },
    });

    if (upload.user.role === "WORKER") {
      const notifTitle = input.decision === "APPROVED"
        ? "Document Approved"
        : input.decision === "REJECTED"
        ? "Document Rejected"
        : "Document Pending Review";

      const notifBody = input.decision === "APPROVED"
        ? `${upload.fileType} was approved.`
        : input.decision === "REJECTED"
        ? `${upload.fileType} was rejected. ${input.notes ?? ""}`.trim()
        : `${upload.fileType} moved back to pending review.`;

      await prisma.notification.create({
        data: {
          userId: upload.user.id,
          title: notifTitle,
          body: notifBody,
          type: `DOCUMENT_${input.decision}`,
          link: "/worker/documents",
        },
      });
    }

    await insertAuditLog({
      actorId:  adminId,
      targetId: upload.user.id,
      action:   `DOCUMENT_REVIEW_${input.decision}`,
      entity:   "Upload",
      entityId: upload.id,
      metadata: { reviewStatus: input.decision, notes: input.notes ?? null },
    });

    return ok(res, updated, "Document review updated");
  } catch (e) { next(e); }
}

// ── getPendingUsers ───────────────────────────────────────────
// GET /admin/users/pending?role=worker|employer
export async function getPendingUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { role } = req.query as Record<string, string>;
    const where: Prisma.UserWhereInput = { accountStatus: "PENDING_REVIEW" };
    if (role && ROLE_VALUES.includes(role.toUpperCase() as typeof ROLE_VALUES[number])) {
      where.role = role.toUpperCase() as typeof ROLE_VALUES[number];
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { verificationSubmittedAt: "asc" },
      select: {
        id: true, email: true, role: true, createdAt: true,
        accountStatus: true, verificationSubmittedAt: true,
        workerProfile: { select: { firstName: true, lastName: true } },
        employerProfile: { select: { companyName: true, contactPersonName: true } },
      },
    });

    const result = users.map((u) => ({
      id:                       u.id,
      email:                    u.email,
      role:                     u.role,
      accountStatus:            u.accountStatus,
      createdAt:                u.createdAt,
      verificationSubmittedAt:  u.verificationSubmittedAt,
      firstName:  u.workerProfile?.firstName   ?? u.employerProfile?.contactPersonName?.split(" ")[0] ?? null,
      lastName:   u.workerProfile?.lastName    ?? u.employerProfile?.contactPersonName?.split(" ").slice(1).join(" ") ?? null,
      companyName: u.employerProfile?.companyName ?? null,
    }));

    return ok(res, result);
  } catch (e) { next(e); }
}

// ── approveUser ───────────────────────────────────────────────
// POST /admin/users/:id/approve
export async function approveUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.user?.role !== "ADMIN") return err(res, "Forbidden - admin only", 403);
    const adminId = req.user!.sub;
    const { id }  = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        workerProfile:   { select: { firstName: true } },
        employerProfile: { select: { contactPersonName: true } },
      },
    });
    if (!user) return err(res, "User not found", 404);
    if (user.accountStatus !== "PENDING_REVIEW") {
      return err(res, `Cannot approve user with status: ${user.accountStatus}`, 400);
    }

    const firstName =
      user.workerProfile?.firstName ??
      user.employerProfile?.contactPersonName?.split(" ")[0] ??
      user.email.split("@")[0];

    await prisma.user.update({
      where: { id },
      data: { accountStatus: "VERIFIED", approvedAt: new Date(), reviewedById: adminId, onboardingComplete: true },
    });

    // For workers: mark onboarding approved and make profile searchable
    if (user.role === "WORKER") {
      await Promise.all([
        prisma.onboardingProgress.updateMany({
          where: { userId: id },
          data:  { onboardingStatus: "APPROVED" },
        }),
        prisma.workerProfile.updateMany({
          where: { userId: id },
          data:  { isSearchable: true },
        }),
      ]);
    }

    await insertAdminAuditLog({ adminId, action: "USER_APPROVED", targetUserId: id });

    await prisma.notification.create({
      data: {
        userId: id,
        title:  "Account Approved! 🎉",
        body:   "Your account has been reviewed and approved. You now have full access.",
        type:   "ACCOUNT_APPROVED",
        link:   `/${user.role.toLowerCase()}/dashboard`,
      },
    });

    sendAccountApproved(id, user.email, firstName, user.role as "WORKER" | "EMPLOYER")
      .catch((e: Error) => console.error("[approveUser] email error:", e.message));

    return ok(res, { id, accountStatus: "VERIFIED" });
  } catch (e) { next(e); }
}

// ── rejectUser ────────────────────────────────────────────────
// POST /admin/users/:id/reject
const RejectSchema = z.object({ reason: z.string().min(10).max(2000) });

export async function rejectUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.user?.role !== "ADMIN") return err(res, "Forbidden - admin only", 403);
    const adminId      = req.user!.sub;
    const { id }       = req.params;
    const { reason }   = RejectSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        workerProfile:   { select: { firstName: true } },
        employerProfile: { select: { contactPersonName: true } },
      },
    });
    if (!user) return err(res, "User not found", 404);
    if (user.accountStatus !== "PENDING_REVIEW" && user.accountStatus !== "VERIFIED") {
      return err(res, `Cannot reject user with status: ${user.accountStatus}`, 400);
    }

    const firstName =
      user.workerProfile?.firstName ??
      user.employerProfile?.contactPersonName?.split(" ")[0] ??
      user.email.split("@")[0];

    await prisma.user.update({
      where: { id },
      data: { accountStatus: "REJECTED", rejectedAt: new Date(), rejectionReason: reason, reviewedById: adminId },
    });

    await insertAdminAuditLog({ adminId, action: "USER_REJECTED", targetUserId: id, notes: reason });

    await prisma.notification.create({
      data: {
        userId: id,
        title:  "Application Not Approved",
        body:   `Your application was not approved. Reason: ${reason}`,
        type:   "ACCOUNT_REJECTED",
        link:   "/login",
      },
    });

    sendAccountRejected(id, user.email, firstName, reason)
      .catch((e: Error) => console.error("[rejectUser] email error:", e.message));

    return ok(res, { success: true });
  } catch (e) { next(e); }
}

// ── suspendUserAccount ────────────────────────────────────────
// POST /admin/users/:id/suspend
const SuspendSchema = z.object({ reason: z.string().min(1).max(2000) });

export async function suspendUserAccount(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.user?.role !== "ADMIN") return err(res, "Forbidden - admin only", 403);
    const adminId    = req.user!.sub;
    const { id }     = req.params;
    const { reason } = SuspendSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        workerProfile:   { select: { firstName: true } },
        employerProfile: { select: { contactPersonName: true } },
      },
    });
    if (!user) return err(res, "User not found", 404);
    if (user.accountStatus !== "VERIFIED") {
      return err(res, `Cannot suspend user with status: ${user.accountStatus}`, 400);
    }

    const firstName =
      user.workerProfile?.firstName ??
      user.employerProfile?.contactPersonName?.split(" ")[0] ??
      user.email.split("@")[0];

    // Invalidate all sessions (blocks refresh; access tokens expire in 15min)
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { accountStatus: "SUSPENDED", suspendedAt: new Date(), reviewedById: adminId },
      }),
      prisma.session.deleteMany({ where: { userId: id } }),
    ]);

    await insertAdminAuditLog({ adminId, action: "USER_SUSPENDED", targetUserId: id, notes: reason });

    await prisma.notification.create({
      data: {
        userId: id,
        title:  "Account Suspended",
        body:   "Your account has been suspended. Contact support to appeal.",
        type:   "ACCOUNT_SUSPENDED",
        link:   "/login",
      },
    });

    sendAccountSuspended(id, user.email, firstName)
      .catch((e: Error) => console.error("[suspendUserAccount] email error:", e.message));

    return ok(res, { success: true });
  } catch (e) { next(e); }
}

// ── reinstateUser ─────────────────────────────────────────────
// POST /admin/users/:id/reinstate
const ReinstateSchema = z.object({ notes: z.string().max(2000).optional() });

export async function reinstateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId    = req.user!.sub;
    const { id }     = req.params;
    const { notes }  = ReinstateSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        workerProfile:   { select: { firstName: true } },
        employerProfile: { select: { contactPersonName: true } },
      },
    });
    if (!user) return err(res, "User not found", 404);
    if (user.accountStatus !== "SUSPENDED" && user.accountStatus !== "REJECTED") {
      return err(res, `Cannot reinstate user with status: ${user.accountStatus}`, 400);
    }

    const firstName =
      user.workerProfile?.firstName ??
      user.employerProfile?.contactPersonName?.split(" ")[0] ??
      user.email.split("@")[0];

    await prisma.user.update({
      where: { id },
      data: { accountStatus: "VERIFIED", suspendedAt: null, reviewedById: adminId },
    });

    await insertAdminAuditLog({ adminId, action: "USER_REINSTATED", targetUserId: id, notes: notes ?? null });

    await prisma.notification.create({
      data: {
        userId: id,
        title:  "Account Reinstated",
        body:   "Your DirectHire account has been reinstated. You may log in again.",
        type:   "ACCOUNT_REINSTATED",
        link:   "/login",
      },
    });

    sendAccountReinstated(id, user.email, firstName)
      .catch((e: Error) => console.error("[reinstateUser] email error:", e.message));

    return ok(res, { success: true });
  } catch (e) { next(e); }
}

// ── getEmailLogs ──────────────────────────────────────────────
// GET /admin/email-logs?page=&limit=&emailType=&status=&search=
const VALID_EMAIL_STATUSES = ["QUEUED", "SENT", "FAILED", "BOUNCED"] as const;
const VALID_EMAIL_TYPES = [
  "WELCOME", "EMAIL_VERIFICATION", "PASSWORD_RESET", "ONBOARDING_REMINDER",
  "ONBOARDING_SUBMITTED", "ACCOUNT_APPROVED", "ACCOUNT_REJECTED",
  "ACCOUNT_NEEDS_CHANGES", "SUBSCRIPTION_CONFIRMED", "ADMIN_NEW_SUBMISSION", "GENERAL",
] as const;

export async function getEmailLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { emailType, status, search } = req.query as Record<string, string>;

    const where: Prisma.EmailLogWhereInput = {};
    if (status    && (VALID_EMAIL_STATUSES as readonly string[]).includes(status))
      where.status = status as typeof VALID_EMAIL_STATUSES[number];
    if (emailType && (VALID_EMAIL_TYPES as readonly string[]).includes(emailType))
      where.emailType = emailType as typeof VALID_EMAIL_TYPES[number];
    if (search)
      where.toAddress = { contains: search, mode: "insensitive" };

    const [data, total] = await Promise.all([
      prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true, userId: true, emailType: true, toAddress: true,
          subject: true, status: true, providerMsgId: true,
          errorMessage: true, sentAt: true, createdAt: true,
        },
      }),
      prisma.emailLog.count({ where }),
    ]);

    return paginated(res, data, total, page, limit);
  } catch (e) { next(e); }
}

// ── getEmailStats ─────────────────────────────────────────────
// GET /admin/email-stats — counts grouped by status + type, last 30 days
export async function getEmailStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [byStatus, byType, last24h] = await Promise.all([
      prisma.emailLog.groupBy({
        by: ["status"],
        where: { createdAt: { gte: since30d } },
        _count: { _all: true },
      }),
      prisma.emailLog.groupBy({
        by: ["emailType"],
        where: { createdAt: { gte: since30d } },
        _count: { _all: true },
      }),
      prisma.emailLog.count({ where: { createdAt: { gte: since24h } } }),
    ]);

    const statusMap = Object.fromEntries(byStatus.map(r => [r.status, r._count._all]));

    return ok(res, {
      total:   byStatus.reduce((s, r) => s + r._count._all, 0),
      sent:    statusMap["SENT"]    ?? 0,
      failed:  statusMap["FAILED"]  ?? 0,
      queued:  statusMap["QUEUED"]  ?? 0,
      bounced: statusMap["BOUNCED"] ?? 0,
      last24h,
      byType:  byType.map(r => ({ type: r.emailType, count: r._count._all }))
                     .sort((a, b) => b.count - a.count),
    });
  } catch (e) { next(e); }
}

// ── testEmails — DELETE after confirming all 7 types deliver ──
// GET /api/admin/test-emails  (admin-only)
export async function testEmails(_req: Request, res: Response, next: NextFunction) {
  try {
    const to = OWNER_EMAIL;
    const results: Record<string, string> = {};
    const appUrl = process.env.FRONTEND_URL ?? "https://www.directhire.cc";

    const tests: Array<{ name: string; fn: () => Promise<void> }> = [
      { name: "otp",       fn: () => sendOtpVerification("test", to, "123456", 10) },
      { name: "welcome",   fn: () => sendWelcomeEmail("test", to, "Test User", "WORKER") },
      { name: "reset",     fn: () => sendPasswordReset("test", to, `${appUrl}/reset-password?token=test`) },
      { name: "approved",  fn: () => sendAccountApproved("test", to, "Test User", "WORKER") },
      { name: "rejected",  fn: () => sendAccountRejected("test", to, "Test User", "Test reason") },
      { name: "suspended", fn: () => sendAccountSuspended("test", to, "Test User") },
      { name: "contact",   fn: () => sendContactFormEmail("Test User", to, "Test Subject", "This is a test message from the email test endpoint.") },
    ];

    for (const test of tests) {
      try {
        await test.fn();
        results[test.name] = "✅ sent";
      } catch (err) {
        results[test.name] = `❌ ${err instanceof Error ? err.message : "unknown error"}`;
      }
    }

    return ok(res, results, `Sent to ${to} — check inbox and delete this endpoint.`);
  } catch (e) { next(e); }
}
