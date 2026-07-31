// backend/src/controllers/admin-fee.controller.ts
// Admin-mediated hiring workflow (Phase 2, sub-step 3) — fee schedule CRUD
// and per-application fee charge creation/confirmation. All routes require
// role = ADMIN (see admin.routes.ts).
//
// COUNTRY/VISA FIELD-LOCATION FINDING (see Phase 2 report for the full
// explanation): countryCode is reliably resolved from Application.job.country
// (a real, required JobPost field). There is NO reliable "visaType" field
// anywhere in the schema for an application/job/worker chain — the only
// existing visa-shaped field is WorkerTargetCountry.visaTypePreference, which
// is (a) nullable, (b) a worker's stated PREFERENCE at onboarding time, not a
// confirmed requirement for this specific job/hire, and (c) keyed by country,
// not by job or application. Rather than silently trust that preference as
// this charge's authoritative visaType, createFeeCharge below requires the
// admin to explicitly supply visaType in the request body — flagged here and
// in the phase report rather than guessed.

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import stripe from "../services/stripe";
import { insertAdminAuditLog } from "../lib/audit";
import {
  sendAdminFeeDueEmail,
  sendClearedForEmployerEmail,
} from "../services/email";

// ── Fee schedule CRUD ─────────────────────────────────────────────────────────

export async function getFeeSchedules(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.adminFeeSchedule.findMany({ orderBy: [{ countryCode: "asc" }, { visaType: "asc" }] });
    return ok(res, rows);
  } catch (e) { next(e); }
}

const CreateFeeScheduleSchema = z.object({
  countryCode: z.string().min(1).max(10),
  visaType:    z.string().min(1).max(50),
  amountUsd:   z.number().positive(),
});

export async function createFeeSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { countryCode, visaType, amountUsd } = CreateFeeScheduleSchema.parse(req.body);

    const existing = await prisma.adminFeeSchedule.findUnique({ where: { countryCode_visaType: { countryCode, visaType } } });
    if (existing) return err(res, `A fee schedule for ${countryCode}/${visaType} already exists — use PATCH to update it.`, 409);

    const schedule = await prisma.adminFeeSchedule.create({
      data: { countryCode, visaType, amountUsd, updatedById: adminId },
    });

    // No AuditAction enum value fits "fee schedule changed" (checked the full
    // enum — closest is AI_DECISION_OVERRIDDEN, which would be misleading),
    // and admin-pricing.controller.ts's equivalent config-CRUD endpoints don't
    // audit-log either, so this follows that existing precedent.
    return ok(res, schedule, "Fee schedule created", 201);
  } catch (e) { next(e); }
}

const UpdateFeeScheduleSchema = z.object({
  amountUsd: z.number().positive().optional(),
  isActive:  z.boolean().optional(),
});

export async function updateFeeSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { id } = req.params;
    const body = UpdateFeeScheduleSchema.parse(req.body);

    if (body.amountUsd === undefined && body.isActive === undefined) {
      return err(res, "Provide at least one of: amountUsd, isActive", 422);
    }

    const existing = await prisma.adminFeeSchedule.findUnique({ where: { id } });
    if (!existing) return err(res, "Fee schedule not found", 404);

    const updated = await prisma.adminFeeSchedule.update({
      where: { id },
      data:  { ...body, updatedById: adminId },
    });

    return ok(res, updated, "Fee schedule updated");
  } catch (e) { next(e); }
}

// ── Fee charge: create (Stripe PaymentIntent) ─────────────────────────────────
// Mirrors worker-lock.controller.ts's lockWorker create step exactly: no DB
// row written yet, just a PaymentIntent + clientSecret. The AdminFeeCharge
// row itself is only written in confirmFeeCharge, after payment succeeds —
// same reasoning as WorkerLock (a created-but-never-paid attempt shouldn't
// leave a stray row behind).

const CreateFeeChargeSchema = z.object({
  visaType: z.string().min(1).max(50), // admin-supplied — see file header note
});

export async function createFeeCharge(req: Request, res: Response, next: NextFunction) {
  try {
    const { applicationId } = req.params;
    const { visaType } = CreateFeeChargeSchema.parse(req.body);

    const app = await prisma.application.findUnique({
      where:  { id: applicationId },
      include: {
        worker: { select: { id: true, email: true, workerProfile: { select: { firstName: true, lastName: true } } } },
        job:    { select: { country: true } },
      },
    });
    if (!app) return err(res, "Application not found", 404);
    if (app.workflowStatus !== "DOCUMENTS_APPROVED") {
      return err(res, `Cannot create a fee charge — application is at workflow stage ${app.workflowStatus ?? "none"}, not DOCUMENTS_APPROVED.`, 400);
    }

    const countryCode = app.job.country;
    const schedule = await prisma.adminFeeSchedule.findUnique({
      where: { countryCode_visaType: { countryCode, visaType } },
    });
    if (!schedule || !schedule.isActive) {
      return err(res, `No fee configured for ${countryCode}/${visaType} — configure it in the fee schedule before charging.`, 422);
    }

    const amountCents = Math.round(Number(schedule.amountUsd) * 100);

    // AdminFeeCharge.workerId is the charge's subject and the metadata spec
    // (type/applicationId/workerId, no employerId) both point to the worker
    // being the payer here, not the employer (unlike WorkerLock, which bills
    // the employer via getOrCreateCustomer). BUT getOrCreateCustomer is hard-
    // coded to EmployerProfile.stripeCustomerId — WorkerProfile/User has no
    // stripeCustomerId field at all, so calling it with a workerId would
    // crash. Rather than add a schema field for this (out of scope for a
    // backend-logic phase, and Phase 1's schema was already reviewed/closed),
    // this follows the existing, already-established worker-facing charge
    // pattern in worker-applications.controller.ts's applyToJob: a customer-
    // less PaymentIntent with receipt_email. Flagged in the phase report.
    const paymentIntent = await stripe.paymentIntents.create({
      amount:      amountCents,
      currency:    "usd",
      description: `DirectHire admin processing fee — ${countryCode}/${visaType}`,
      metadata:    { type: "admin_fee", applicationId, workerId: app.worker.id, visaType },
      automatic_payment_methods: { enabled: true },
      ...(app.worker.email ? { receipt_email: app.worker.email } : {}),
    });

    await prisma.application.update({
      where: { id: applicationId },
      data:  { workflowStatus: "ADMIN_FEE_DUE" },
    });

    const workerFirstName = app.worker.workerProfile?.firstName ?? "there";
    sendAdminFeeDueEmail(app.worker.id, app.worker.email, workerFirstName, schedule.amountUsd.toString()).catch(
      (e: unknown) => console.error("[admin fee due email]", e),
    );

    return ok(res, {
      requiresPayment: true,
      clientSecret:    paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountCents,
      countryCode,
      visaType,
    });
  } catch (e) { next(e); }
}

// ── Fee charge: confirm ────────────────────────────────────────────────────────

const ConfirmFeeChargeSchema = z.object({
  paymentIntentId: z.string().min(1),
});

export async function confirmFeeCharge(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = req.user!.sub;
    const { applicationId } = req.params;
    const { paymentIntentId } = ConfirmFeeChargeSchema.parse(req.body);

    const app = await prisma.application.findUnique({
      where:  { id: applicationId },
      include: {
        worker: { select: { id: true } },
        job:    { select: { country: true, title: true, companyName: true } },
      },
    });
    if (!app) return err(res, "Application not found", 404);

    // ── Idempotency: already confirmed successfully → return existing charge ──
    const existingCharge = await prisma.adminFeeCharge.findUnique({ where: { applicationId } });
    if (existingCharge?.status === "SUCCEEDED") {
      return ok(res, existingCharge, "Fee already confirmed");
    }

    type PaymentIntent = Awaited<ReturnType<typeof stripe.paymentIntents.retrieve>>;
    let paymentIntent: PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch {
      return err(res, "Invalid payment session.", 400);
    }

    if (paymentIntent.metadata?.applicationId !== applicationId) return err(res, "Application mismatch.", 400);
    if (paymentIntent.metadata?.workerId !== app.worker.id)       return err(res, "Worker mismatch.", 400);

    const now = new Date();

    // ── Failure case: record FAILED, leave workflowStatus at ADMIN_FEE_DUE ────
    // so it can be retried via createFeeCharge again — never left ambiguous.
    if (paymentIntent.status !== "succeeded") {
      const failedCharge = await prisma.adminFeeCharge.upsert({
        where:  { applicationId },
        update: { status: "FAILED", failedAt: now, stripePaymentIntentId: paymentIntentId },
        create: {
          applicationId, workerId: app.worker.id,
          countryCode: app.job.country, visaType: String(paymentIntent.metadata?.visaType ?? ""),
          amountUsd: paymentIntent.amount / 100, currency: paymentIntent.currency,
          stripePaymentIntentId: paymentIntentId, status: "FAILED", failedAt: now,
        },
      });
      return err(res, "Payment not completed — please try again.", 402, { charge: failedCharge });
    }

    const amountUsd = paymentIntent.amount / 100;

    const charge = await prisma.adminFeeCharge.upsert({
      where:  { applicationId },
      update: { status: "SUCCEEDED", paidAt: now, stripePaymentIntentId: paymentIntentId },
      create: {
        applicationId, workerId: app.worker.id,
        countryCode: app.job.country,
        visaType: String(paymentIntent.metadata?.visaType ?? ""),
        amountUsd, currency: paymentIntent.currency,
        stripePaymentIntentId: paymentIntentId, status: "SUCCEEDED", paidAt: now,
      },
    });

    // Per explicit instruction: fee-paid and cleared-for-employer happen
    // together as one automatic transition, not two separate manual steps.
    await prisma.application.update({
      where: { id: applicationId },
      data:  { workflowStatus: "CLEARED_FOR_EMPLOYER" },
    });

    const workerFirstName = (await prisma.workerProfile.findUnique({ where: { userId: app.worker.id }, select: { firstName: true } }))?.firstName ?? "there";
    const workerEmail = (await prisma.user.findUnique({ where: { id: app.worker.id }, select: { email: true } }))?.email ?? "";
    sendClearedForEmployerEmail(app.worker.id, workerEmail, workerFirstName, app.job.title, app.job.companyName).catch(
      (e: unknown) => console.error("[cleared for employer email]", e),
    );

    insertAdminAuditLog({
      actorId: adminId, targetId: app.worker.id,
      action: "APPLICATION_STATUS_CHANGED",
      notes: "ADMIN_FEE_DUE -> ADMIN_FEE_PAID -> CLEARED_FOR_EMPLOYER",
      metadata: { applicationId, amountUsd, stripePaymentIntentId: paymentIntentId },
    }).catch(console.error);

    return ok(res, charge, "Fee confirmed — application cleared for employer");
  } catch (e) { next(e); }
}
