// backend/src/controllers/admin-growth.controller.ts
// Admin endpoints for the Growth/Marketing agent task log and approval
// workflow — all require role = ADMIN. Infrastructure only: there is no
// agent logic behind these tasks yet (see services/growth/agent-runner.ts),
// this is just the list/detail/approve/reject surface for whatever gets
// queued into GrowthAgentTask.

import { Request, Response, NextFunction } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";
import { enqueue } from "../services/queue";

const STATUS_VALUES = [
  "PENDING", "IN_PROGRESS", "AWAITING_APPROVAL", "APPROVED", "REJECTED", "COMPLETED", "FAILED",
] as const;

const RejectSchema = z.object({
  reason: z.string().min(1, "reason is required").max(2000),
});

const RunTaskSchema = z.object({
  agentName: z.string().min(1, "agentName is required"),
  taskType:  z.string().min(1, "taskType is required"),
  inputData: z.record(z.unknown()).optional(),
});

// ── POST /admin/growth/tasks/run ───────────────────────────────────────────────
// Creates a GrowthAgentTask (status PENDING) and enqueues it for
// processing — same fire-and-forget enqueue().catch(console.error) style
// used everywhere else in this codebase. The actual per-agentName dispatch
// happens in services/growth/agent-runner.ts, not here.

export async function runGrowthTask(req: Request, res: Response, next: NextFunction) {
  try {
    const input = RunTaskSchema.parse(req.body);

    const task = await prisma.growthAgentTask.create({
      data: {
        agentName: input.agentName,
        taskType:  input.taskType,
        inputData: input.inputData as Prisma.InputJsonValue | undefined,
      },
    });

    enqueue("growth.runAgentTask", { taskId: task.id }).catch(console.error);

    return ok(res, task, "Growth agent task created", 201);
  } catch (e) { next(e); }
}

// ── GET /admin/growth/tasks ───────────────────────────────────────────────────

export async function getGrowthTasks(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { status, agentName } = req.query as Record<string, string>;

    const where: Record<string, unknown> = {};
    if (status && STATUS_VALUES.includes(status as typeof STATUS_VALUES[number])) {
      where.status = status;
    }
    if (agentName) where.agentName = agentName;

    const [rows, total] = await Promise.all([
      prisma.growthAgentTask.findMany({
        where, skip, take: limit, orderBy: { createdAt: "desc" },
      }),
      prisma.growthAgentTask.count({ where }),
    ]);

    return paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
}

// ── GET /admin/growth/tasks/:id ────────────────────────────────────────────────

export async function getGrowthTaskDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const task = await prisma.growthAgentTask.findUnique({ where: { id: req.params.id } });
    if (!task) return err(res, "Task not found", 404);

    return ok(res, task);
  } catch (e) { next(e); }
}

// ── POST /admin/growth/tasks/:id/approve ───────────────────────────────────────
// If a GrowthContentDraft was produced by this task (sourceTaskId === id),
// approving the task also approves the draft — both writes happen in one
// $transaction (array form, matching the pattern already used in
// admin.controller.ts / employer-applications.controller.ts) so a draft can
// never end up APPROVED while its owning task is left AWAITING_APPROVAL, or
// vice versa. No linked draft (e.g. technical-seo-agent tasks) → plain
// single update, no transaction needed.

export async function approveGrowthTask(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { id }  = req.params;

    const task = await prisma.growthAgentTask.findUnique({ where: { id } });
    if (!task) return err(res, "Task not found", 404);
    if (task.status !== "AWAITING_APPROVAL") {
      return err(res, `Cannot approve a task with status ${task.status}`, 400);
    }

    const draft = await prisma.growthContentDraft.findFirst({ where: { sourceTaskId: id } });

    const taskUpdate = prisma.growthAgentTask.update({
      where: { id },
      data: {
        status:     "APPROVED",
        approvedBy: adminId,
        approvedAt: new Date(),
      },
    });

    let updated;
    if (draft) {
      [updated] = await prisma.$transaction([
        taskUpdate,
        prisma.growthContentDraft.update({ where: { id: draft.id }, data: { status: "APPROVED" } }),
      ]);
    } else {
      updated = await taskUpdate;
    }

    return ok(res, updated);
  } catch (e) { next(e); }
}

// ── POST /admin/growth/tasks/:id/reject ────────────────────────────────────────
// Same linked-draft handling as approve, in reverse. GrowthContentDraft has
// no rejection-reason column — the reason stays on the task row only, not
// duplicated onto the draft.

export async function rejectGrowthTask(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const input  = RejectSchema.parse(req.body);

    const task = await prisma.growthAgentTask.findUnique({ where: { id } });
    if (!task) return err(res, "Task not found", 404);
    if (task.status !== "AWAITING_APPROVAL") {
      return err(res, `Cannot reject a task with status ${task.status}`, 400);
    }

    const draft = await prisma.growthContentDraft.findFirst({ where: { sourceTaskId: id } });

    const taskUpdate = prisma.growthAgentTask.update({
      where: { id },
      data: {
        status:          "REJECTED",
        rejectedAt:       new Date(),
        rejectionReason:  input.reason,
      },
    });

    let updated;
    if (draft) {
      [updated] = await prisma.$transaction([
        taskUpdate,
        prisma.growthContentDraft.update({ where: { id: draft.id }, data: { status: "REJECTED" } }),
      ]);
    } else {
      updated = await taskUpdate;
    }

    return ok(res, updated);
  } catch (e) { next(e); }
}

// ── GET /admin/growth/eligible-jobs ─────────────────────────────────────────────
// Feeds the "Generate Career Guide Draft" job picker on the admin growth
// page — just the most recent 20 APPROVED jobs, no pagination/filtering.

export async function getEligibleJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.jobPost.findMany({
      where:   { status: "APPROVED" },
      select:  { id: true, title: true, category: true, country: true },
      orderBy: { createdAt: "desc" },
      take:    20,
    });

    return ok(res, rows);
  } catch (e) { next(e); }
}

// ── GET /admin/growth/content ──────────────────────────────────────────────────

export async function getGrowthContentDrafts(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { status, contentType } = req.query as Record<string, string>;

    const where: Record<string, unknown> = {};
    if (status && STATUS_VALUES.includes(status as typeof STATUS_VALUES[number])) {
      where.status = status;
    }
    if (contentType) where.contentType = contentType;

    const [rows, total] = await Promise.all([
      prisma.growthContentDraft.findMany({
        where, skip, take: limit, orderBy: { createdAt: "desc" },
      }),
      prisma.growthContentDraft.count({ where }),
    ]);

    return paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
}
