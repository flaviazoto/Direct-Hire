// backend/src/lib/hire.ts
// Shared "request a hire" logic (major resequencing — see schema.prisma's
// AdminWorkflowStatus comment). Reused by two entry points that both need
// identical behavior:
//   - employer-hire.controller.ts: the employer clicks "Hire" directly on a
//     DOCUMENTS_APPROVED-stage candidate.
//   - admin-hiring-workflow.controller.ts's confirmHire: admin executes the
//     hire on the employer's behalf after the (off-platform) interview
//     process concludes and the employer's decision is relayed back.
// Both paths capture the same offer details (reusing Application's existing
// offeredSalary/offeredCurrency/startDate/contractType fields — the same
// fields the old admin-only confirmHire always populated) and land in the
// same place: HIRE_PENDING_WORKER_CONFIRMATION, awaiting the worker's own
// in-app confirmation (worker-hire.controller.ts) before the admin fee ever
// triggers. This keeps the fee-trigger gate single and consistent regardless
// of which path led to the hire decision.

import prisma from "./prisma";
import { insertAdminAuditLog } from "./audit";
import { sendHireRequestedWorkerEmail } from "../services/email";

// Workflow stages at which the employer (and admin, mirroring the same
// view) can see and act on a candidate — request an interview and/or hire.
// Starts at DOCUMENTS_APPROVED (the major resequencing's whole point: the
// employer no longer waits for CLEARED_FOR_EMPLOYER, which now only happens
// at the very end, after the hire is confirmed and the fee is paid) through
// every later stage, so a candidate stays visible for the rest of the
// process rather than disappearing once the fee kicks in.
export const EMPLOYER_VISIBLE_WORKFLOW_STATUSES = [
  "DOCUMENTS_APPROVED", "HIRE_PENDING_WORKER_CONFIRMATION",
  "ADMIN_FEE_DUE", "ADMIN_FEE_PAID", "CLEARED_FOR_EMPLOYER",
] as ("DOCUMENTS_APPROVED" | "HIRE_PENDING_WORKER_CONFIRMATION" | "ADMIN_FEE_DUE" | "ADMIN_FEE_PAID" | "CLEARED_FOR_EMPLOYER")[];

export type HireOfferInput = {
  offeredSalary?: string;
  offeredCurrency?: string;
  startDate?: string;
  contractType?: string;
};

export type RequestHireResult =
  | { error: string; status: number }
  | { application: Awaited<ReturnType<typeof prisma.application.update>> };

// Valid starting points: DOCUMENTS_APPROVED (first request) or already
// HIRE_PENDING_WORKER_CONFIRMATION (editing the offer before the worker has
// confirmed — e.g. correcting a typo'd salary). Anything past that (fee
// already triggered, or further) can't be re-requested through here.
const REQUESTABLE_FROM = ["DOCUMENTS_APPROVED", "HIRE_PENDING_WORKER_CONFIRMATION"] as const;

export async function requestHire(
  applicationId: string,
  actorId: string,
  offer: HireOfferInput,
): Promise<RequestHireResult> {
  const app = await prisma.application.findUnique({
    where:  { id: applicationId },
    include: {
      worker:   { select: { id: true, email: true, workerProfile: { select: { firstName: true } } } },
      job:      { select: { title: true, companyName: true } },
      employer: { select: { id: true } },
    },
  });
  if (!app) return { error: "Application not found", status: 404 };
  if (!REQUESTABLE_FROM.includes(app.workflowStatus as typeof REQUESTABLE_FROM[number])) {
    return { error: `Cannot request a hire — application is at workflow stage ${app.workflowStatus ?? "none"}, not DOCUMENTS_APPROVED.`, status: 400 };
  }

  // Lock guard — same check the old direct-confirm flow always had: don't
  // let a hire be requested for this employer if a DIFFERENT employer
  // currently holds an active reservation on the worker.
  const workerUser = await prisma.user.findUnique({
    where:  { id: app.worker.id },
    select: { isLocked: true, lockedByEmployerId: true },
  });
  if (workerUser?.isLocked && workerUser.lockedByEmployerId !== app.employer.id) {
    return { error: "This worker is currently reserved by another employer.", status: 409 };
  }

  const isFirstRequest = app.workflowStatus === "DOCUMENTS_APPROVED";

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: {
      workflowStatus:  "HIRE_PENDING_WORKER_CONFIRMATION",
      offeredSalary:   offer.offeredSalary ? parseFloat(offer.offeredSalary) : null,
      offeredCurrency: offer.offeredCurrency ?? "USD",
      startDate:       offer.startDate ? new Date(offer.startDate) : null,
      contractType:    offer.contractType ?? null,
    },
  });

  // Only notify on the first request — re-saving the offer before the
  // worker has confirmed shouldn't re-spam them with another email.
  if (isFirstRequest) {
    const workerFirstName = app.worker.workerProfile?.firstName ?? "there";
    sendHireRequestedWorkerEmail(
      app.worker.id, app.worker.email, workerFirstName, app.job.title, app.job.companyName,
    ).catch((e: unknown) => console.error("[hire requested email]", e));

    prisma.notification.create({
      data: {
        userId: app.worker.id, type: "APPLICATION_UPDATE",
        title:  `An employer wants to hire you — ${app.job.title}`,
        body:   `${app.job.companyName} wants to hire you for "${app.job.title}". Confirm to proceed.`,
        link:   "/worker/application-status",
        metadata: { applicationId },
      },
    }).catch((e: unknown) => console.error("[hire requested notif]", e));
  }

  insertAdminAuditLog({
    actorId, targetId: app.worker.id,
    action: "APPLICATION_STATUS_CHANGED",
    notes: isFirstRequest ? "DOCUMENTS_APPROVED -> HIRE_PENDING_WORKER_CONFIRMATION" : "Hire offer updated (still awaiting worker confirmation)",
    metadata: { applicationId, offeredSalary: offer.offeredSalary, offeredCurrency: offer.offeredCurrency, startDate: offer.startDate, contractType: offer.contractType },
  }).catch(console.error);

  return { application: updated };
}
