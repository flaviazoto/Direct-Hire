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
  if (app.workflowStatus !== "CLEARED_FOR_EMPLOYER") {
    return { error: `This candidate hasn't been cleared for interview yet (currently ${app.workflowStatus ?? "not yet reviewed"}).` as const };
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

    const applications = await prisma.application.findMany({
      where: {
        employerId,
        OR: [
          { workflowStatus: "CLEARED_FOR_EMPLOYER", interview: null },
          { interview: { isNot: null } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      include: APPLICATION_SUMMARY_INCLUDE,
    });

    return ok(res, applications);
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
      where: { employerId, workerId: { in: workerIds }, workflowStatus: "CLEARED_FOR_EMPLOYER", interview: null },
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
