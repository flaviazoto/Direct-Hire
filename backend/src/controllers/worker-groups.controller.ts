// backend/src/controllers/worker-groups.controller.ts
// Admin-mediated hiring workflow (Phase 2, sub-step 5) — employer side of
// worker groups + bulk quote requests. One WorkerGroup per employer
// (WorkerGroup.employerId is @unique, per Phase 1's design), created lazily
// on first add. Admin side (review/prepare/send quotes) lives in
// admin-worker-groups.controller.ts.

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import { employerCanViewWorker } from "../lib/worker-visibility";

const MEMBER_INCLUDE = {
  worker: {
    select: {
      id: true,
      workerProfile: {
        select: {
          firstName: true, lastName: true, profession: true,
          countryOfResidence: true, yearsExperience: true, documentsVerified: true,
        },
      },
    },
  },
} as const;

type GroupMemberRow = {
  workerId: string;
  worker: {
    workerProfile: {
      profession: string | null; countryOfResidence: string | null;
      yearsExperience: string | null; documentsVerified: boolean;
    } | null;
  };
};

/** Top entries of a tally, most common first. */
function top(tally: Map<string, number>, n: number) {
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([label, count]) => ({ label, count }));
}

/**
 * Facts about the group, counted from the members' own profiles and their
 * applications to THIS employer — nothing estimated. Shown in the employer's
 * group panel so the group is useful before anyone talks to an admin.
 */
async function summarizeGroup(employerId: string, members: GroupMemberRow[]) {
  const professions = new Map<string, number>();
  const countries   = new Map<string, number>();
  const years: number[] = [];
  let documentsVerified = 0;

  for (const m of members) {
    const p = m.worker.workerProfile;
    if (!p) continue;
    if (p.profession?.trim()) professions.set(p.profession.trim(), (professions.get(p.profession.trim()) ?? 0) + 1);
    if (p.countryOfResidence?.trim()) countries.set(p.countryOfResidence.trim(), (countries.get(p.countryOfResidence.trim()) ?? 0) + 1);
    const y = Number.parseFloat(p.yearsExperience ?? "");
    if (Number.isFinite(y) && y >= 0) years.push(y);
    if (p.documentsVerified) documentsVerified++;
  }

  const workerIds = members.map(m => m.workerId);
  const apps = workerIds.length === 0 ? [] : await prisma.application.findMany({
    where:  { employerId, workerId: { in: workerIds } },
    select: { workerId: true, workflowStatus: true },
  });
  const withStatus = (statuses: string[]) =>
    new Set(apps.filter(a => a.workflowStatus && statuses.includes(a.workflowStatus)).map(a => a.workerId)).size;

  return {
    memberCount:        members.length,
    documentsVerified,
    appliedToYourJobs:  new Set(apps.map(a => a.workerId)).size,
    readyForInterview:  withStatus(["DOCUMENTS_APPROVED"]),
    hired:              withStatus(["HIRE_PENDING_WORKER_CONFIRMATION", "ADMIN_FEE_DUE", "ADMIN_FEE_PAID", "CLEARED_FOR_EMPLOYER"]),
    averageYearsExperience: years.length ? Math.round((years.reduce((a, b) => a + b, 0) / years.length) * 10) / 10 : null,
    topProfessions:     top(professions, 3),
    topCountries:       top(countries, 3),
    countryCount:       countries.size,
  };
}

export async function getMyGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const group = await prisma.workerGroup.findUnique({
      where:  { employerId },
      include: {
        members: { include: MEMBER_INCLUDE, orderBy: { addedAt: "desc" } },
        // Phase 4, Step 2 addition — full history (not just non-SENT), so the
        // employer can see a delivered quote's amount/notes once admin sends
        // one. Phase 2 never built an employer-facing view of this at all.
        bulkQuoteRequests: { orderBy: { requestedAt: "desc" } },
      },
    });

    if (!group) return ok(res, { group: null, members: [], memberCount: 0, bulkQuoteRequests: [], summary: await summarizeGroup(employerId, []) });
    return ok(res, {
      group, members: group.members, memberCount: group.members.length, bulkQuoteRequests: group.bulkQuoteRequests,
      summary: await summarizeGroup(employerId, group.members),
    });
  } catch (e) { next(e); }
}

const AddMemberSchema = z.object({ workerId: z.string().min(1) });

export async function addGroupMember(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { workerId } = AddMemberSchema.parse(req.body);

    const worker = await prisma.user.findUnique({
      where:  { id: workerId },
      select: { id: true, role: true, isLocked: true, lockedByEmployerId: true },
    });
    if (!worker || worker.role !== "WORKER") return err(res, "Worker not found", 404);
    if (!(await employerCanViewWorker(employerId, workerId))) return err(res, "Worker not found", 404);

    // Phase 4, Step 2 addition — Phase 2 deliberately left this unrestricted
    // (flagged as an open question, not decided). Now decided: a worker
    // reserved by a DIFFERENT employer can't be added; available workers and
    // workers this same employer already has locked can be.
    if (worker.isLocked && worker.lockedByEmployerId !== employerId) {
      return err(res, "This worker is currently reserved by another employer.", 403, { code: "WORKER_LOCKED" });
    }

    const group = await prisma.workerGroup.upsert({
      where:  { employerId },
      update: {},
      create: { employerId },
    });

    const member = await prisma.workerGroupMember.upsert({
      where:  { workerGroupId_workerId: { workerGroupId: group.id, workerId } },
      update: {},
      create: { workerGroupId: group.id, workerId },
      include: MEMBER_INCLUDE,
    });

    return ok(res, member, "Worker added to group");
  } catch (e) { next(e); }
}

export async function removeGroupMember(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { workerId } = req.params;

    const group = await prisma.workerGroup.findUnique({ where: { employerId } });
    if (!group) return err(res, "You don't have a worker group yet", 404);

    await prisma.workerGroupMember.deleteMany({ where: { workerGroupId: group.id, workerId } });
    return ok(res, null, "Worker removed from group");
  } catch (e) { next(e); }
}

const MIN_MEMBERS_FOR_QUOTE = 10;

export async function requestBulkQuote(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;

    const group = await prisma.workerGroup.findUnique({
      where:  { employerId },
      include: { members: true, bulkQuoteRequests: { where: { status: { not: "SENT" } } } },
    });
    if (!group) return err(res, "You don't have a worker group yet — add workers first", 404);

    const memberCount = group.members.length;
    if (memberCount < MIN_MEMBERS_FOR_QUOTE) {
      return err(res, `A group request needs at least ${MIN_MEMBERS_FOR_QUOTE} workers in your group (currently ${memberCount}).`, 422);
    }

    if (group.bulkQuoteRequests.length > 0) {
      return err(res, "You already have a group request in progress.", 409, { request: group.bulkQuoteRequests[0] });
    }

    const request = await prisma.bulkQuoteRequest.create({
      data: {
        workerGroupId: group.id,
        employerId,
        workerCountAtRequest: memberCount,
        status: "REQUESTED",
      },
    });

    return ok(res, request, "Bulk quote requested", 201);
  } catch (e) { next(e); }
}
