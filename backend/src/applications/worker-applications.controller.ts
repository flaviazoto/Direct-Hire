// backend/src/applications/worker-applications.controller.ts
// GET  /api/worker/applications — paginated application list with job + payment summary
// DELETE /api/worker/applications/:id — withdraw (only when status = pending/APPLIED)

import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import { insertAuditLog } from "../lib/audit";

// ── Status mapping ────────────────────────────────────────────────────────────

type ClientStatus = "pending" | "shortlisted" | "interview" | "hired" | "rejected" | "withdrawn";

const DB_TO_CLIENT: Record<string, ClientStatus> = {
  APPLIED:     "pending",
  VIEWED:      "pending",
  SHORTLISTED: "shortlisted",
  INTERVIEWED: "interview",
  ACCEPTED:    "hired",
  REJECTED:    "rejected",
  WITHDRAWN:   "withdrawn",
};

// Sort order: hired first, rejected last
const STATUS_RANK: Record<string, number> = {
  ACCEPTED:    0,
  INTERVIEWED: 1,
  SHORTLISTED: 2,
  APPLIED:     3,
  VIEWED:      3,
  REJECTED:    4,
  WITHDRAWN:   5,
};

// ── DB select ─────────────────────────────────────────────────────────────────

const APP_SELECT = {
  id:                  true,
  status:              true,
  createdAt:           true,
  updatedAt:           true,
  matchScore:          true,
  applicationFeeCents: true,
  applicationFeePaid:  true,
  job: {
    select: {
      id:             true,
      title:          true,
      companyName:    true,
      country:        true,
      salaryMin:      true,
      salaryMax:      true,
      salaryCurrency: true,
      visaSupport:    true,
    },
  },
} as const;

// ── GET /worker/applications ──────────────────────────────────────────────────

export async function getWorkerApplications(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const workerId = req.user!.sub;

    const rows = await prisma.application.findMany({
      where:  { workerId },
      select: APP_SELECT,
    });

    // Sort: status rank ASC, then updatedAt DESC within each group
    rows.sort((a, b) => {
      const ra = STATUS_RANK[a.status] ?? 99;
      const rb = STATUS_RANK[b.status] ?? 99;
      if (ra !== rb) return ra - rb;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

    const applications = rows.map(row => ({
      id:          row.id,
      status:      DB_TO_CLIENT[row.status] ?? (row.status.toLowerCase() as ClientStatus),
      applied_at:  row.createdAt,
      updated_at:  row.updatedAt,
      match_score: row.matchScore ? Number(row.matchScore) : 0,
      job: {
        id:           row.job.id,
        title:        row.job.title,
        company_name: row.job.companyName,
        country:      row.job.country,
        salary_min:   Number(row.job.salaryMin),
        salary_max:   Number(row.job.salaryMax),
        currency:     row.job.salaryCurrency,
        visa_type:    row.job.visaSupport ? "sponsored" : "self",
      },
      payment: row.applicationFeeCents
        ? {
            amount_cents: row.applicationFeeCents,
            status:       (row.applicationFeePaid ? "succeeded" : "pending") as "pending" | "succeeded" | "failed",
          }
        : null,
    }));

    // Summary counts (excludes withdrawn from named buckets)
    const summary = {
      total:       applications.length,
      pending:     0,
      shortlisted: 0,
      interview:   0,
      hired:       0,
      rejected:    0,
    };
    for (const app of applications) {
      if (app.status in summary) {
        (summary as Record<string, number>)[app.status]++;
      }
    }

    return ok(res, { applications, summary });
  } catch (e) { next(e); }
}

// ── DELETE /worker/applications/:id ──────────────────────────────────────────

export async function deleteWorkerApplication(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const workerId = req.user!.sub;
    const { id }   = req.params;

    const app = await prisma.application.findUnique({
      where:  { id },
      select: {
        id:                  true,
        workerId:            true,
        status:              true,
        applicationFeeCents: true,
        jobId:               true,
        job: { select: { title: true, companyName: true } },
      },
    });

    if (!app)                      return err(res, "Application not found", 404);
    if (app.workerId !== workerId) return err(res, "Forbidden", 403);

    // Only APPLIED or VIEWED map to "pending" — all other statuses are non-withdrawable
    if (app.status !== "APPLIED" && app.status !== "VIEWED") {
      return err(
        res,
        "Cannot withdraw a shortlisted or active application",
        400,
      );
    }

    await prisma.application.update({
      where: { id },
      data:  { status: "WITHDRAWN" },
    });

    // Flag for admin fee review — non-fatal, fire-and-forget
    if (app.applicationFeeCents && app.applicationFeeCents > 0) {
      insertAuditLog({
        actorId:  workerId,
        targetId: workerId,
        action:   "APPLICATION_WITHDRAWN_FEE_REVIEW",
        entity:   "Application",
        entityId: id,
        metadata: {
          jobId:             app.jobId,
          jobTitle:          app.job.title,
          companyName:       app.job.companyName,
          feeCents:          app.applicationFeeCents,
          requiresRefundReview: true,
        },
      }).catch(console.error);
    }

    return ok(res, null, "Application withdrawn");
  } catch (e) { next(e); }
}
