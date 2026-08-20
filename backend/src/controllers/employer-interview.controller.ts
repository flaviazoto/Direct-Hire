// backend/src/controllers/employer-interview.controller.ts
// Part B — admin-mediated screening interview redesign, employer side.
// Employer requests a screening interview (single application, or in bulk
// across their WorkerGroup); admin conducts the actual call and relays the
// outcome manually (email/WhatsApp), entirely outside the platform. The
// employer never gets worker contact info or a direct channel to the worker
// through this feature — the only actions here are "request" and, later,
// receiving the outcome off-platform.

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import { sendApplicationInterviewInProgressEmail } from "../services/email";
import { EMPLOYER_VISIBLE_WORKFLOW_STATUSES } from "../lib/hire";

const APPLICATION_SUMMARY_INCLUDE = {
  worker: {
    select: {
      id: true, email: true,
      workerProfile: { select: { firstName: true, lastName: true } },
    },
  },
  job: { select: { id: true, title: true, companyName: true } },
  interview: true,
} as const;

async function notifyAdminsOfRequest(applicationId: string, workerName: string, jobTitle: string, employerName: string) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  if (admins.length === 0) return;
  await prisma.notification.createMany({
    data: admins.map(a => ({
      userId: a.id,
      type:   "APPLICATION_UPDATE" as const,
      title:  "Screening interview requested",
      body:   `${employerName} requested a screening interview with ${workerName} for "${jobTitle}".`,
      link:   "/admin/hiring/interview",
      metadata: { applicationId },
    })),
  }).catch(console.error);
}

// Shared by both the single and bulk paths.
type InterviewRequestResult =
  | { error: string }
  | { interview: Awaited<ReturnType<typeof prisma.applicationInterview.create>> };

async function createInterviewRequest(
  applicationId: string, employerId: string, notes: string | null,
): Promise<InterviewRequestResult> {
  const app = await prisma.application.findUnique({
    where:  { id: applicationId },
    include: {
      worker:   { select: { id: true, email: true, workerProfile: { select: { firstName: true, lastName: true } } } },
      job:      { select: { title: true, companyName: true } },
      employer: { select: { employerProfile: { select: { companyName: true, contactPersonName: true } } } },
      interview: true,
    },
  });
  if (!app) return { error: "Application not found" as const };
  if (app.employerId !== employerId) return { error: "Forbidden" as const };
  // Major resequencing: the employer can request an interview from
  // DOCUMENTS_APPROVED onward, not just at the old CLEARED_FOR_EMPLOYER
  // gate — CLEARED_FOR_EMPLOYER is now the very last stage (see
  // lib/hire.ts), reached only after a hire is confirmed and the fee paid.
  if (!EMPLOYER_VISIBLE_WORKFLOW_STATUSES.includes(app.workflowStatus as typeof EMPLOYER_VISIBLE_WORKFLOW_STATUSES[number])) {
    return { error: `This candidate hasn't cleared document review yet (currently ${app.workflowStatus ?? "not yet reviewed"}).` as const };
  }
  if (app.interview) return { error: "An interview has already been requested for this application." as const };

  const [interview] = await prisma.$transaction([
    prisma.applicationInterview.create({
      data: { applicationId, requestedById: employerId, requestNotes: notes },
    }),
    prisma.application.update({ where: { id: applicationId }, data: { status: "SCREENING" } }),
  ]);

  const workerName = [app.worker.workerProfile?.firstName, app.worker.workerProfile?.lastName].filter(Boolean).join(" ") || "the candidate";
  const workerFirstName = app.worker.workerProfile?.firstName ?? "there";
  const employerName = app.employer.employerProfile?.companyName ?? app.employer.employerProfile?.contactPersonName ?? "The employer";

  notifyAdminsOfRequest(applicationId, workerName, app.job.title, employerName).catch(console.error);
  sendApplicationInterviewInProgressEmail(
    app.worker.id, app.worker.email, workerFirstName, app.job.title, app.job.companyName,
  ).catch((e: unknown) => console.error("[interview in progress email]", e));

  return { interview };
}

// ── GET /employer/interviews ──────────────────────────────────────────────────
// Applications ready to request an interview for (CLEARED_FOR_EMPLOYER, no
// request yet) plus ones already in progress or resolved (interview exists).

export async function getMyInterviews(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;

    // `data` (the applications array) is unchanged from before — the existing
    // /employer/interviews page reads res.data as that array directly. `stats`
    // is a new sibling field (custom response shape, not the plain ok()
    // helper — same convention getEmployerApplications already uses for its
    // own `stats` block) added for the employer dashboard's KPI cards: ready
    // = DOCUMENTS_APPROVED (genuinely awaiting the employer's interview/hire
    // decision); inProcess = every other non-terminal workflow stage,
    // including ones this endpoint doesn't otherwise return rows for
    // (PENDING_ADMIN_REVIEW/APPROVED_QUEUED/DOCUMENTS_PENDING — still in
    // document collection, not yet the employer's turn) — one extra groupBy,
    // no new route.
    // Sequential, not Promise.all — the dev DB connection pool is
    // connection_limit=1, and two concurrent queries here just queue up
    // behind each other anyway while holding up whichever other request
    // needs that one connection (confirmed the hard way earlier this
    // session: Promise.all across a real connection_limit=1 pool times out
    // rather than actually running in parallel).
    const applications = await prisma.application.findMany({
      where: {
        employerId,
        OR: [
          { workflowStatus: { in: EMPLOYER_VISIBLE_WORKFLOW_STATUSES } },
          { interview: { isNot: null } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      include: APPLICATION_SUMMARY_INCLUDE,
    });
    const workflowStatusCounts = await prisma.application.groupBy({
      by:     ["workflowStatus"],
      where:  { employerId, workflowStatus: { not: null } },
      _count: { _all: true },
    });

    const countOf = (statuses: string[]) =>
      workflowStatusCounts
        .filter(c => c.workflowStatus && statuses.includes(c.workflowStatus))
        .reduce((sum, c) => sum + c._count._all, 0);

    const stats = {
      readyCount:     countOf(["DOCUMENTS_APPROVED"]),
      inProcessCount: countOf([
        "PENDING_ADMIN_REVIEW", "APPROVED_QUEUED", "DOCUMENTS_PENDING",
        "HIRE_PENDING_WORKER_CONFIRMATION", "ADMIN_FEE_DUE", "ADMIN_FEE_PAID",
      ]),
    };

    return res.json({ success: true, data: applications, stats });
  } catch (e) { next(e); }
}

// ── POST /employer/applications/:applicationId/interview-request ────────────

const RequestInterviewSchema = z.object({ notes: z.string().max(2000).optional() });

export async function requestInterview(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { applicationId } = req.params;
    const { notes } = RequestInterviewSchema.parse(req.body);

    const result = await createInterviewRequest(applicationId, employerId, notes ?? null);
    if ("error" in result) {
      const status = result.error === "Application not found" ? 404 : result.error === "Forbidden" ? 403 : 400;
      return err(res, result.error, status);
    }

    return ok(res, result.interview, "Interview requested", 201);
  } catch (e) { next(e); }
}

// ── POST /employer/worker-groups/interview-requests ───────────────────────────
// Bulk request across the employer's WorkerGroup (Phase 4). A group member
// isn't necessarily tied to a specific application (they may have been added
// without ever applying to one of this employer's jobs), so this requests an
// interview for every CLEARED_FOR_EMPLOYER application this employer has with
// a current group member — not "one per member" — and reports what happened
// per worker rather than assuming a 1:1 mapping.

const BulkRequestInterviewSchema = z.object({ notes: z.string().max(2000).optional() });

export async function requestBulkInterviews(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { notes } = BulkRequestInterviewSchema.parse(req.body);

    const group = await prisma.workerGroup.findUnique({
      where:  { employerId },
      include: { members: { select: { workerId: true } } },
    });
    if (!group || group.members.length === 0) {
      return err(res, "You don't have any workers in your group yet.", 404);
    }

    const workerIds = group.members.map(m => m.workerId);
    const candidateApps = await prisma.application.findMany({
      where: { employerId, workerId: { in: workerIds }, workflowStatus: { in: EMPLOYER_VISIBLE_WORKFLOW_STATUSES }, interview: null },
      select: { id: true },
    });

    if (candidateApps.length === 0) {
      return ok(res, { requested: 0, total: 0 }, "No group members have a cleared application ready for interview.");
    }

    let requested = 0;
    const failures: { applicationId: string; error: string }[] = [];
    for (const app of candidateApps) {
      const result = await createInterviewRequest(app.id, employerId, notes ?? null);
      if ("error" in result) failures.push({ applicationId: app.id, error: result.error });
      else requested++;
    }

    return ok(res, { requested, total: candidateApps.length, failures }, `Requested ${requested} interview(s)`);
  } catch (e) { next(e); }
}
