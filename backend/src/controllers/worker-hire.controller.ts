// backend/src/controllers/worker-hire.controller.ts
// Major resequencing — the worker-facing half of the new hire-confirmation
// gate. worker-applications.controller.ts is an off-limits exhaustiveness-
// surface file and its APPLICATION_LIST_SELECT doesn't expose offeredSalary/
// offeredCurrency/startDate/contractType, so this is a standalone endpoint
// pair (same resolution pattern used throughout this project — e.g.
// /worker/document-requests, /worker/application-status) rather than an
// edit to that file.
//
// getMyHireRequests gives /worker/application-status the offer detail it
// needs to render "an employer wants to hire you" and the confirmed-offer
// summary afterward. confirmHire is the real in-app action that finalizes
// the hire — it is NOT automatic and is not satisfied by the "hire
// requested" email alone; the hire stays pending until the worker actively
// confirms here. This is also the only place that advances workflowStatus
// to ADMIN_FEE_DUE, mirroring the existing confirmFeeCharge precedent of
// collapsing ADMIN_FEE_PAID -> CLEARED_FOR_EMPLOYER into one atomic step.

import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import { insertAdminAuditLog } from "../lib/audit";
import { sendApplicationAcceptedWorkerEmail, sendHireConfirmationEmployerEmail } from "../services/email";

// Audit finding: the WorkerLock-release side effect below used to just
// console.error on failure — if it fails, the employer keeps being billed
// for a daily lock on a worker they've already hired, with zero visibility
// beyond server logs. Fix: also notify every admin in-app, reusing the same
// "notify all admins" pattern already established in
// employer-interview.controller.ts's notifyAdminsOfRequest, rather than
// adding a new AuditAction enum value (which would need its own migration
// for what should page someone promptly, not just leave a queryable trail).
async function notifyAdminsOfLockReleaseFailure(workerId: string, employerId: string, applicationId: string, error: unknown) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  if (admins.length === 0) return;
  await prisma.notification.createMany({
    data: admins.map(a => ({
      userId: a.id,
      type:   "APPLICATION_UPDATE" as const,
      title:  "Worker lock failed to release on hire",
      body:   `A worker was hired but their active reservation lock could not be released automatically — the employer may keep being billed for it. Check /admin/locks.`,
      link:   "/admin/locks",
      metadata: { workerId, employerId, applicationId, error: error instanceof Error ? error.message : String(error) },
    })),
  }).catch(console.error);
}

const HIRE_REQUEST_SELECT = {
  id: true, status: true, workflowStatus: true,
  offeredSalary: true, offeredCurrency: true, startDate: true, contractType: true, hireConfirmedAt: true,
  job: { select: { id: true, title: true, companyName: true, country: true } },
} as const;

// ── GET /worker/hire-requests ─────────────────────────────────────────────────

export async function getMyHireRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;

    const applications = await prisma.application.findMany({
      where: {
        workerId,
        workflowStatus: {
          in: ["HIRE_PENDING_WORKER_CONFIRMATION", "ADMIN_FEE_DUE", "ADMIN_FEE_PAID", "CLEARED_FOR_EMPLOYER"],
        },
      },
      orderBy: { updatedAt: "desc" },
      select: HIRE_REQUEST_SELECT,
    });

    return ok(res, applications);
  } catch (e) { next(e); }
}

// ── POST /worker/hire-requests/:applicationId/confirm ────────────────────────
// The actual finalize step. Mirrors the old admin-only confirmHire's side
// effects exactly (lock release, both-party emails/notifications) — just
// moved here, since confirmation is now the worker's own action rather than
// something admin did on their behalf.

export async function confirmHire(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const { applicationId } = req.params;

    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        worker:   { select: { id: true, email: true, workerProfile: { select: { firstName: true, lastName: true } } } },
        job:      { select: { title: true, companyName: true } },
        employer: { select: { id: true, email: true, employerProfile: { select: { companyName: true, contactPersonName: true } } } },
      },
    });
    if (!app) return err(res, "Application not found", 404);
    if (app.workerId !== workerId) return err(res, "Forbidden", 403);
    if (app.workflowStatus !== "HIRE_PENDING_WORKER_CONFIRMATION") {
      return err(res, `Nothing to confirm — application is at workflow stage ${app.workflowStatus ?? "none"}.`, 400);
    }

    const now = new Date();
    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: {
        status:          "ACCEPTED",
        acceptedAt:      now,
        hireConfirmedAt: now,
        workflowStatus:  "ADMIN_FEE_DUE",
      },
    });

    const workerName = [app.worker.workerProfile?.firstName, app.worker.workerProfile?.lastName].filter(Boolean).join(" ") || "the candidate";
    const workerFirstName = app.worker.workerProfile?.firstName ?? "";
    const employerDisplayName = app.employer.employerProfile?.companyName ?? app.employer.employerProfile?.contactPersonName ?? app.employer.email;
    const offeredSalary = app.offeredSalary ? app.offeredSalary.toString() : undefined;
    const startDate = app.startDate ? app.startDate.toISOString() : undefined;

    const sideEffects: Promise<unknown>[] = [
      // Release any active lock the employer holds on this worker — hired, no longer needs a lock.
      // Identical logic to the old admin-only confirmHire.
      prisma.workerLock.findFirst({
        where: { workerId: app.worker.id, employerId: app.employer.id, lockStatus: "ACTIVE" },
      }).then(activeLock => {
        if (!activeLock) return;
        return prisma.$transaction([
          prisma.workerLock.update({ where: { id: activeLock.id }, data: { lockStatus: "RELEASED", releaseReason: "HIRED" } }),
          prisma.user.update({ where: { id: app.worker.id }, data: { isLocked: false, lockedByEmployerId: null, lockedUntil: null } }),
        ]);
      }).catch((e: unknown) => {
        console.error("[hire lock release]", e);
        notifyAdminsOfLockReleaseFailure(app.worker.id, app.employer.id, applicationId, e).catch(console.error);
      }),

      sendApplicationAcceptedWorkerEmail(
        app.worker.id, app.worker.email, workerFirstName, app.job.title, app.job.companyName,
      ).catch((e: unknown) => console.error("[accepted worker email]", e)),
      sendHireConfirmationEmployerEmail({
        employerUserId: app.employer.id, employerEmail: app.employer.email, employerName: employerDisplayName,
        workerName, jobTitle: app.job.title,
        startDate, contractType: app.contractType ?? undefined,
        offeredSalary, offeredCurrency: app.offeredCurrency ?? "USD",
      }).catch((e: unknown) => console.error("[hire confirmation email]", e)),

      prisma.notification.create({
        data: {
          userId: app.employer.id, type: "APPLICATION_UPDATE",
          title:  `${workerName} confirmed the hire — ${app.job.title}`,
          body:   `${workerName} has confirmed the placement for "${app.job.title}". The admin processing fee is now due before it's finalized.`,
          link:   `/employer/applications/${applicationId}`,
          metadata: { applicationId, status: "ACCEPTED" },
        },
      }).catch((e: unknown) => console.error("[hire confirmed employer notif]", e)),
    ];

    Promise.all(sideEffects).catch(console.error);

    insertAdminAuditLog({
      actorId: workerId, targetId: app.worker.id,
      action: "APPLICATION_STATUS_CHANGED",
      notes: "HIRE_PENDING_WORKER_CONFIRMATION -> ACCEPTED, workflowStatus -> ADMIN_FEE_DUE (worker-confirmed)",
      metadata: { applicationId },
    }).catch(console.error);

    return ok(res, updated, "Hire confirmed — the admin processing fee is next");
  } catch (e) { next(e); }
}
