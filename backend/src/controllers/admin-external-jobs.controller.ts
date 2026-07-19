// backend/src/controllers/admin-external-jobs.controller.ts
// Admin CRUD for ExternalJob — admin-pasted links to jobs hosted elsewhere
// (EURES, LinkedIn, Indeed, national job boards). All routes require ADMIN.
//
// ExternalJob has no employer and no natural "target user" the way JobPost
// moderation actions do, so audit entries here use the general insertAuditLog
// (targetId: adminId — same self-referential pattern as
// admin-pricing.controller.ts / admin-config.controller.ts for other
// platform-level, no-target-user admin actions), not insertAdminAuditLog
// (which requires a real target user row).

import { Request, Response, NextFunction } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";
import { insertAuditLog } from "../lib/audit";

const CONTRACT_TYPES = [
  "FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "INTERNSHIP", "FREELANCE",
] as const;

const STATUS_VALUES = ["ACTIVE", "ARCHIVED"] as const;

// ── Validation schemas ────────────────────────────────────────────────────────

const CreateExternalJobSchema = z.object({
  title:          z.string().min(3, "Title must be at least 3 characters").max(200),
  description:    z.string().min(20, "Description must be at least 20 characters"),
  country:        z.string().min(1, "Country is required").max(100),
  city:           z.string().max(100).optional(),
  salaryMin:      z.number().positive().optional(),
  salaryMax:      z.number().positive().optional(),
  salaryCurrency: z.string().max(10).optional(),
  contractType:   z.enum(CONTRACT_TYPES).optional(),
  externalUrl:    z.string().url("Must be a valid URL"),
  sourceName:     z.string().min(1, "Source name is required").max(80),
}).refine(
  (d) => d.salaryMax === undefined || d.salaryMin === undefined || d.salaryMax >= d.salaryMin,
  { message: "salaryMax must be >= salaryMin", path: ["salaryMax"] },
);

const UpdateExternalJobSchema = z.object({
  title:          z.string().min(3).max(200).optional(),
  description:    z.string().min(20).optional(),
  country:        z.string().min(1).max(100).optional(),
  city:           z.string().max(100).nullable().optional(),
  salaryMin:      z.number().positive().nullable().optional(),
  salaryMax:      z.number().positive().nullable().optional(),
  salaryCurrency: z.string().max(10).nullable().optional(),
  contractType:   z.enum(CONTRACT_TYPES).nullable().optional(),
  externalUrl:    z.string().url("Must be a valid URL").optional(),
  sourceName:     z.string().min(1).max(80).optional(),
  status:         z.enum(STATUS_VALUES).optional(),
}).refine(
  (d) => d.salaryMax == null || d.salaryMin == null || d.salaryMax >= d.salaryMin,
  { message: "salaryMax must be >= salaryMin", path: ["salaryMax"] },
);

// ── GET /admin/external-jobs ──────────────────────────────────────────────────

export async function getExternalJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { status, search } = req.query as Record<string, string>;

    const where: Prisma.ExternalJobWhereInput = {};
    if (status && STATUS_VALUES.includes(status as typeof STATUS_VALUES[number])) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { title:      { contains: search, mode: "insensitive" } },
        { sourceName: { contains: search, mode: "insensitive" } },
        { country:    { contains: search, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.externalJob.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { createdBy: { select: { id: true, email: true } } },
      }),
      prisma.externalJob.count({ where }),
    ]);

    return paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
}

// ── POST /admin/external-jobs ─────────────────────────────────────────────────

export async function createExternalJob(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const parsed = CreateExternalJobSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const input = parsed.data;

    const job = await prisma.externalJob.create({
      data: {
        title:          input.title,
        description:    input.description,
        country:        input.country,
        city:           input.city,
        salaryMin:      input.salaryMin,
        salaryMax:      input.salaryMax,
        salaryCurrency: input.salaryCurrency,
        contractType:   input.contractType,
        externalUrl:    input.externalUrl,
        sourceName:     input.sourceName,
        createdById:    adminId,
      },
    });

    insertAuditLog({
      actorId:  adminId,
      targetId: adminId,
      action:   "EXTERNAL_JOB_CREATED",
      entity:   "ExternalJob",
      entityId: job.id,
      metadata: { title: job.title, sourceName: job.sourceName },
    }).catch(console.error);

    return ok(res, job, "External job created", 201);
  } catch (e) { next(e); }
}

// ── PATCH /admin/external-jobs/:id ────────────────────────────────────────────

export async function updateExternalJob(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { id } = req.params;

    const existing = await prisma.externalJob.findUnique({ where: { id } });
    if (!existing) return err(res, "External job not found", 404);

    const parsed = UpdateExternalJobSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const input = parsed.data;

    const job = await prisma.externalJob.update({
      where: { id },
      data: {
        ...(input.title          !== undefined && { title:          input.title }),
        ...(input.description    !== undefined && { description:    input.description }),
        ...(input.country        !== undefined && { country:        input.country }),
        ...(input.city           !== undefined && { city:           input.city }),
        ...(input.salaryMin      !== undefined && { salaryMin:      input.salaryMin }),
        ...(input.salaryMax      !== undefined && { salaryMax:      input.salaryMax }),
        ...(input.salaryCurrency !== undefined && { salaryCurrency: input.salaryCurrency }),
        ...(input.contractType   !== undefined && { contractType:   input.contractType }),
        ...(input.externalUrl    !== undefined && { externalUrl:    input.externalUrl }),
        ...(input.sourceName     !== undefined && { sourceName:     input.sourceName }),
        ...(input.status         !== undefined && { status:         input.status }),
      },
    });

    insertAuditLog({
      actorId:  adminId,
      targetId: adminId,
      action:   "EXTERNAL_JOB_UPDATED",
      entity:   "ExternalJob",
      entityId: job.id,
      metadata: { title: job.title },
    }).catch(console.error);

    return ok(res, job, "External job updated");
  } catch (e) { next(e); }
}

// ── POST /admin/external-jobs/:id/archive ─────────────────────────────────────

export async function archiveExternalJob(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { id } = req.params;

    const existing = await prisma.externalJob.findUnique({ where: { id } });
    if (!existing) return err(res, "External job not found", 404);
    if (existing.status === "ARCHIVED") return err(res, "Already archived", 400);

    const job = await prisma.externalJob.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });

    insertAuditLog({
      actorId:  adminId,
      targetId: adminId,
      action:   "EXTERNAL_JOB_ARCHIVED",
      entity:   "ExternalJob",
      entityId: job.id,
      metadata: { title: job.title },
    }).catch(console.error);

    return ok(res, job, "External job archived");
  } catch (e) { next(e); }
}

// ── DELETE /admin/external-jobs/:id ───────────────────────────────────────────

export async function deleteExternalJob(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { id } = req.params;

    const existing = await prisma.externalJob.findUnique({ where: { id } });
    if (!existing) return err(res, "External job not found", 404);

    await prisma.externalJob.delete({ where: { id } });

    insertAuditLog({
      actorId:  adminId,
      targetId: adminId,
      action:   "EXTERNAL_JOB_DELETED",
      entity:   "ExternalJob",
      entityId: id,
      metadata: { title: existing.title, sourceName: existing.sourceName },
    }).catch(console.error);

    return ok(res, null, "External job deleted");
  } catch (e) { next(e); }
}
