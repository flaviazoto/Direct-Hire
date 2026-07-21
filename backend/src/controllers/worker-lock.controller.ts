// backend/src/controllers/worker-lock.controller.ts
// Worker lock endpoints — all require role = EMPLOYER + accountStatus = VERIFIED.
//
// Reservation flow (2 steps):
//   Step 1  POST /employer/workers/:workerId/lock
//           → validates, subscription gate, concurrent limit, creates Stripe PaymentIntent
//           → returns { requiresPayment: true, clientSecret, … }
//   Step 2  POST /employer/workers/:workerId/lock/confirm
//           → verifies payment_status === "succeeded"
//           → creates WorkerLock + LockBillingCharge + Payment record + side effects

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";
import stripe, { getOrCreateCustomer } from "../services/stripe";
import {
  sendWorkerLockedWorkerEmail,
  sendWorkerLockedEmployerEmail,
  sendWorkerLockExtendedWorkerEmail,
  sendWorkerLockExtendedEmployerEmail,
  sendWorkerLockReleasedWorkerEmail,
  sendWorkerLockReleasedEmployerEmail,
} from "../services/email";
import { insertAdminAuditLog } from "../lib/audit";

// ── Validation ────────────────────────────────────────────────────────────────

const LockSchema = z.object({
  // Hard ceiling of 90 here; actual cap enforced at runtime via platform_config
  lock_days: z.number().int().min(1).max(90),
  currency:  z.string().length(3).default("USD"),
});

const ConfirmLockSchema = z.object({
  paymentIntentId: z.string().min(1),
});

const ExtendSchema = z.object({
  additional_days: z.number().int().min(1).max(30),
});

const ConfirmExtendSchema = z.object({
  paymentIntentId: z.string().min(1),
});

const ReleaseSchema = z.object({
  reason: z.string().max(2000).optional(),
});

// ── Helper: read a platform_config value with a fallback ─────────────────────

async function cfg(key: string, fallback: string): Promise<string> {
  const row = await prisma.platformConfig.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

// ── POST /employer/workers/:workerId/lock ─────────────────────────────────────
// FIX 1 + 2 + 3 — subscription gate, concurrent / duration limits, PaymentIntent

export async function lockWorker(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { workerId } = req.params;

    const parsed = LockSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { lock_days } = parsed.data;

    // ── FIX 1: Subscription gate ──────────────────────────────────────────────
    const employerFull = await prisma.user.findUnique({
      where:  { id: employerId },
      select: {
        email: true,
        employerProfile: {
          select: {
            subscriptionStatus: true,
            trialEndsAt:        true,
            stripeCustomerId:   true,
            companyName:        true,
            contactPersonName:  true,
          },
        },
      },
    });

    if (!employerFull) return err(res, "Employer not found", 404);

    // Redundant with the router-level requireSubscription gate on this route,
    // but kept in sync with it (same ACTIVE-or-unexpired-TRIAL rule) rather
    // than removed — see employer.routes.ts's note on this duplication.
    const ep = employerFull.employerProfile;
    const isActive   = ep?.subscriptionStatus === "ACTIVE";
    const isTrialing = ep?.subscriptionStatus === "TRIAL" && ep?.trialEndsAt != null && ep.trialEndsAt.getTime() > Date.now();
    if (!isActive && !isTrialing) {
      return err(
        res,
        "An active subscription is required to reserve workers.",
        403,
        { code: "SUBSCRIPTION_REQUIRED", redirectTo: "/employer/subscription" },
      );
    }

    // ── FIX 2a: Read all platform limits in parallel ──────────────────────────
    const [maxDaysStr, maxConcurrentStr, dailyRateCentsStr] = await Promise.all([
      cfg("lock_max_duration_days", "14"),
      cfg("lock_max_concurrent",    "5"),
      cfg("lock_daily_rate_cents",  "200"),
    ]);

    const maxDaysInt       = parseInt(maxDaysStr);
    const maxConcurrentInt = parseInt(maxConcurrentStr);
    const dailyRateCents   = parseInt(dailyRateCentsStr);

    // ── FIX 2b: Duration cap ──────────────────────────────────────────────────
    if (lock_days > maxDaysInt) {
      return err(res, `Maximum reservation duration is ${maxDaysInt} days.`, 422);
    }

    // ── Fetch worker ──────────────────────────────────────────────────────────
    const worker = await prisma.user.findUnique({
      where:  { id: workerId },
      select: {
        id:            true,
        accountStatus: true,
        role:          true,
        isLocked:      true,
        email:         true,
        workerProfile: { select: { firstName: true, lastName: true } },
      },
    });

    if (!worker || worker.role !== "WORKER") return err(res, "Worker not found", 404);
    if (worker.accountStatus !== "VERIFIED")  return err(res, "Worker is not verified", 400);

    if (worker.isLocked) {
      return err(res, "This worker is currently reserved by another employer.", 409, {
        code: "WORKER_LOCKED",
      });
    }

    const alreadyMyLock = await prisma.workerLock.findFirst({
      where: { workerId, employerId, lockStatus: "ACTIVE" },
    });
    if (alreadyMyLock) {
      return err(res, "You already have an active reservation on this worker.", 409);
    }

    // ── FIX 2c: Concurrent lock limit ─────────────────────────────────────────
    const activeLockCount = await prisma.workerLock.count({
      where: { employerId, lockStatus: "ACTIVE" },
    });
    if (activeLockCount >= maxConcurrentInt) {
      return err(
        res,
        `You can only reserve up to ${maxConcurrentInt} workers at a time.`,
        403,
        { code: "MAX_LOCKS_REACHED", current: activeLockCount, max: maxConcurrentInt },
      );
    }

    // ── FIX 3: Create Stripe PaymentIntent (upfront charge for all days) ──────
    const totalCents = dailyRateCents * lock_days;

    const stripeCustomerId = await getOrCreateCustomer(
      employerId,
      employerFull.email,
      employerFull.employerProfile?.companyName
        ?? employerFull.employerProfile?.contactPersonName,
    );

    const paymentIntent = await stripe.paymentIntents.create({
      amount:      totalCents,
      currency:    "usd",
      customer:    stripeCustomerId,
      description: `Worker reservation: ${lock_days} day${lock_days !== 1 ? "s" : ""} × $${(dailyRateCents / 100).toFixed(2)}/day`,
      metadata:    {
        type:            "WORKER_LOCK",
        employerId,
        workerId,
        lockDays:        lock_days.toString(),
        dailyRateCents:  dailyRateCents.toString(),
        platform:        "directhire",
      },
      automatic_payment_methods: { enabled: true },
    });

    return ok(res, {
      requiresPayment: true,
      clientSecret:    paymentIntent.client_secret,
      totalCents,
      dailyRateCents,
      lockDays:        lock_days,
      paymentIntentId: paymentIntent.id,
    });
  } catch (e) { next(e); }
}

// ── POST /employer/workers/:workerId/lock/confirm ─────────────────────────────
// FIX 3 (continued) — verify payment → create WorkerLock + all side effects

export async function confirmLock(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { workerId } = req.params;

    const parsed = ConfirmLockSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { paymentIntentId } = parsed.data;

    // ── Retrieve and verify PaymentIntent ─────────────────────────────────────
    type PaymentIntent = Awaited<ReturnType<typeof stripe.paymentIntents.retrieve>>;
    let paymentIntent: PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch {
      return err(res, "Invalid payment session.", 400);
    }

    if (paymentIntent.status !== "succeeded") {
      return err(res, "Payment not completed — please try again.", 402);
    }

    // Guard against another employer's PaymentIntent being submitted
    if (paymentIntent.metadata?.employerId !== employerId) return err(res, "Forbidden.", 403);
    if (paymentIntent.metadata?.workerId   !== workerId)   return err(res, "Worker mismatch.", 400);

    // ── Idempotency: already confirmed → return existing lock ─────────────────
    const existingLock = await prisma.workerLock.findFirst({
      where: { workerId, employerId, stripePaymentIntentId: paymentIntentId },
    });
    if (existingLock) return ok(res, existingLock, "Reservation already confirmed");

    // ── Re-check worker availability (race condition between step 1 and step 2) ─
    const freshWorker = await prisma.user.findUnique({
      where:  { id: workerId },
      select: {
        id:             true,
        role:           true,
        accountStatus:  true,
        isLocked:       true,
        lockedByEmployerId: true,
        email:          true,
        workerProfile:  { select: { firstName: true, lastName: true } },
      },
    });

    if (!freshWorker || freshWorker.role !== "WORKER") return err(res, "Worker not found.", 404);

    if (freshWorker.isLocked && freshWorker.lockedByEmployerId !== employerId) {
      // Another employer locked this worker between step 1 and step 2 — auto-refund
      stripe.refunds.create({ payment_intent: paymentIntentId, reason: "duplicate" })
        .catch(e => console.error("[confirmLock] Auto-refund failed:", e));
      return err(
        res,
        "This worker was reserved by another employer. Your payment will be refunded.",
        409,
        { code: "WORKER_LOCKED" },
      );
    }

    // ── Derive authoritative values from PaymentIntent metadata ───────────────
    const lockDays       = parseInt(paymentIntent.metadata?.lockDays       ?? "0");
    const dailyRateCents = parseInt(paymentIntent.metadata?.dailyRateCents ?? "200");
    const totalCents     = paymentIntent.amount;

    if (!lockDays || lockDays < 1) return err(res, "Invalid lock duration in payment.", 400);

    const dailyFee       = dailyRateCents / 100;       // Decimal-compatible number
    const now            = new Date();
    const lockExpiryDate = new Date(now.getTime() + lockDays * 24 * 3600 * 1000);

    // Extract Stripe charge ID for the billing charge record
    const chargeId =
      typeof paymentIntent.latest_charge === "string"
        ? paymentIntent.latest_charge
        : (paymentIntent.latest_charge as { id?: string } | null)?.id ?? null;

    // ── Employer display name (for emails + notification body) ─────────────────
    const employer = await prisma.user.findUnique({
      where:  { id: employerId },
      select: {
        email:           true,
        employerProfile: { select: { companyName: true, contactPersonName: true } },
      },
    });

    const workerName   = [freshWorker.workerProfile?.firstName, freshWorker.workerProfile?.lastName]
      .filter(Boolean).join(" ") || "Worker";
    const employerName = employer?.employerProfile?.companyName
      ?? employer?.employerProfile?.contactPersonName
      ?? "Employer";

    // ── Atomic: create lock record + update worker flags ──────────────────────
    const [lock] = await prisma.$transaction([
      prisma.workerLock.create({
        data: {
          workerId,
          employerId,
          lockStatus:            "ACTIVE",
          dailyFee,
          currency:              "USD",
          lockStartDate:         now,
          lockExpiryDate,
          lockDays,
          totalBilled:           totalCents / 100,  // full amount actually charged by Stripe
          totalDaysBilled:       lockDays,
          stripePaymentIntentId: paymentIntentId,
        },
      }),
      prisma.user.update({
        where: { id: workerId },
        data: {
          isLocked:           true,
          lockedByEmployerId: employerId,
          lockedUntil:        lockExpiryDate,
          lockCount:          { increment: 1 },
        },
      }),
    ]);

    // ── First billing charge — already collected by Stripe ────────────────────
    await prisma.lockBillingCharge.create({
      data: {
        lockId:                lock.id,
        employerId,
        workerId,
        amount:                dailyFee,
        currency:              "USD",
        chargeDate:            now,
        chargeStatus:          "CHARGED",
        stripePaymentIntentId: paymentIntentId,
        stripeChargeId:        chargeId ?? undefined,
      },
    });

    // ── Payment record ────────────────────────────────────────────────────────
    await prisma.payment.create({
      data: {
        userId:          employerId,
        stripePaymentId: paymentIntentId,
        amount:          totalCents,
        currency:        "usd",
        status:          "SUCCEEDED",
        type:            "WORKER_LOCK",
        description:     `Worker reservation — ${lockDays} day${lockDays !== 1 ? "s" : ""}`,
        metadata:        { workerId, lockId: lock.id, lockDays },
      },
    });

    // ── Fire-and-forget side effects (FIX 5: valid NotificationType) ──────────
    Promise.all([
      insertAdminAuditLog({
        actorId:  employerId,
        targetId: workerId,
        action:   "WORKER_LOCKED",
        metadata: {
          lock_id:                  lock.id,
          lock_days:                lockDays,
          daily_fee:                dailyFee,
          total_cents:              totalCents,
          lock_expiry_date:         lockExpiryDate.toISOString(),
          stripe_payment_intent_id: paymentIntentId,
        },
      }),
      sendWorkerLockedWorkerEmail(
        workerId,
        freshWorker.email,
        freshWorker.workerProfile?.firstName ?? "",
        lockExpiryDate,
      ),
      sendWorkerLockedEmployerEmail(
        employerId,
        employer!.email,
        freshWorker.workerProfile?.firstName ?? "",
        workerName,
        now,
        lockExpiryDate,
        dailyFee,
        "USD",
        lockDays,
      ),
      prisma.notification.create({
        data: {
          userId:   workerId,
          type:     "WORKER_LOCKED",    // FIX 5: was "worker_locked"
          title:    "Your profile has been reserved",
          body:     `${employerName} has placed a reservation on your profile until ${lockExpiryDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`,
          link:     "/worker/reservations",
          metadata: { lockId: lock.id },
        },
      }),
    ]).catch(console.error);

    return ok(res, lock, "Worker reservation confirmed", 201);
  } catch (e) { next(e); }
}

// ── POST /employer/workers/:workerId/extend-lock ──────────────────────────────
// Reservation extension flow (2 steps, mirrors lockWorker/confirmLock):
//   Step 1  POST /employer/workers/:workerId/extend-lock
//           → validates, computes additional-days charge, creates Stripe PaymentIntent
//           → returns { requiresPayment: true, clientSecret, … }
//   Step 2  POST /employer/workers/:workerId/extend-lock/confirm
//           → verifies payment_status === "succeeded"
//           → applies the extension + updates totals + side effects
// The extension is charged at THIS lock's own dailyFee (the rate quoted at
// creation), not the current platform_config rate — matches the "days ×
// daily_fee = additional" figure already shown in the extend modal.

export async function extendLock(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { workerId } = req.params;

    const parsed = ExtendSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { additional_days } = parsed.data;

    const lock = await prisma.workerLock.findFirst({
      where: { workerId, employerId, lockStatus: "ACTIVE" },
    });
    if (!lock) return err(res, "No active reservation found for this worker.", 404);

    // 60-day total cap
    const totalDays = Math.round(
      (lock.lockExpiryDate.getTime() - lock.lockStartDate.getTime()) / (24 * 3600 * 1000),
    ) + additional_days;
    if (totalDays > 60) {
      return err(
        res,
        `Cannot extend: total duration would be ${totalDays} days (max 60).`,
        400,
      );
    }

    const employer = await prisma.user.findUnique({
      where:  { id: employerId },
      select: {
        email:           true,
        employerProfile: { select: { companyName: true, contactPersonName: true } },
      },
    });

    const dailyFeeCents   = Math.round(Number(lock.dailyFee) * 100);
    const additionalCents = dailyFeeCents * additional_days;

    const stripeCustomerId = await getOrCreateCustomer(
      employerId,
      employer!.email,
      employer?.employerProfile?.companyName ?? employer?.employerProfile?.contactPersonName,
    );

    const paymentIntent = await stripe.paymentIntents.create({
      amount:      additionalCents,
      currency:    "usd",
      customer:    stripeCustomerId,
      description: `Worker reservation extension: ${additional_days} day${additional_days !== 1 ? "s" : ""} × $${(dailyFeeCents / 100).toFixed(2)}/day`,
      metadata:    {
        type:            "WORKER_LOCK_EXTENSION",
        employerId,
        workerId,
        lockId:          lock.id,
        additionalDays:  additional_days.toString(),
        dailyRateCents:  dailyFeeCents.toString(),
        platform:        "directhire",
      },
      automatic_payment_methods: { enabled: true },
    });

    return ok(res, {
      requiresPayment: true,
      clientSecret:    paymentIntent.client_secret,
      additionalCents,
      dailyRateCents:  dailyFeeCents,
      additionalDays:  additional_days,
      paymentIntentId: paymentIntent.id,
    });
  } catch (e) { next(e); }
}

// ── POST /employer/workers/:workerId/extend-lock/confirm ──────────────────────

export async function confirmExtendLock(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { workerId } = req.params;

    const parsed = ConfirmExtendSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { paymentIntentId } = parsed.data;

    // ── Retrieve and verify PaymentIntent ─────────────────────────────────────
    type PaymentIntent = Awaited<ReturnType<typeof stripe.paymentIntents.retrieve>>;
    let paymentIntent: PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch {
      return err(res, "Invalid payment session.", 400);
    }

    if (paymentIntent.status !== "succeeded") {
      return err(res, "Payment not completed — please try again.", 402);
    }

    if (paymentIntent.metadata?.employerId !== employerId) return err(res, "Forbidden.", 403);
    if (paymentIntent.metadata?.workerId   !== workerId)   return err(res, "Worker mismatch.", 400);

    const lockId = paymentIntent.metadata?.lockId;
    if (!lockId) return err(res, "Invalid extension payment.", 400);

    // ── Idempotency: already applied → return current lock ────────────────────
    const existingCharge = await prisma.lockBillingCharge.findFirst({
      where: { lockId, stripePaymentIntentId: paymentIntentId },
    });
    if (existingCharge) {
      const current = await prisma.workerLock.findUnique({ where: { id: lockId } });
      return ok(res, current, "Extension already confirmed");
    }

    // ── Re-fetch: lock must still be this employer's ACTIVE lock ──────────────
    const lock = await prisma.workerLock.findFirst({
      where: { id: lockId, workerId, employerId, lockStatus: "ACTIVE" },
    });
    if (!lock) {
      // Released/expired/overridden between initiate and confirm — auto-refund
      stripe.refunds.create({ payment_intent: paymentIntentId, reason: "duplicate" })
        .catch(e => console.error("[confirmExtendLock] Auto-refund failed:", e));
      return err(
        res,
        "This reservation is no longer active. Your payment will be refunded.",
        409,
        { code: "LOCK_NOT_ACTIVE" },
      );
    }

    const additionalDays = parseInt(paymentIntent.metadata?.additionalDays ?? "0");
    if (!additionalDays || additionalDays < 1) return err(res, "Invalid extension duration in payment.", 400);

    const additionalCents = paymentIntent.amount;
    const additionalFee   = additionalCents / 100;
    const newExpiry       = new Date(lock.lockExpiryDate.getTime() + additionalDays * 24 * 3600 * 1000);
    const newTotalDays    = lock.lockDays + additionalDays;

    const chargeId =
      typeof paymentIntent.latest_charge === "string"
        ? paymentIntent.latest_charge
        : (paymentIntent.latest_charge as { id?: string } | null)?.id ?? null;

    const [worker, employer] = await Promise.all([
      prisma.user.findUnique({
        where:  { id: workerId },
        select: { email: true, workerProfile: { select: { firstName: true, lastName: true } } },
      }),
      prisma.user.findUnique({
        where:  { id: employerId },
        select: { email: true, employerProfile: { select: { companyName: true, contactPersonName: true } } },
      }),
    ]);

    const workerName = [worker?.workerProfile?.firstName, worker?.workerProfile?.lastName]
      .filter(Boolean).join(" ") || "Worker";

    // ── Atomic: apply the extension + honest totals ────────────────────────────
    const [updated] = await prisma.$transaction([
      prisma.workerLock.update({
        where: { id: lock.id },
        data: {
          lockExpiryDate:    newExpiry,
          lockDays:          { increment: additionalDays },
          totalBilled:       { increment: additionalFee },
          totalDaysBilled:   { increment: additionalDays },
          expiryWarningSent: false,
        },
      }),
      prisma.user.update({
        where: { id: workerId },
        data:  { lockedUntil: newExpiry },
      }),
    ]);

    // ── Extension billing charge — already collected by Stripe ────────────────
    await prisma.lockBillingCharge.create({
      data: {
        lockId:                lock.id,
        employerId,
        workerId,
        amount:                additionalFee,
        currency:              "USD",
        chargeDate:            new Date(),
        chargeStatus:          "CHARGED",
        stripePaymentIntentId: paymentIntentId,
        stripeChargeId:        chargeId ?? undefined,
      },
    });

    // ── Payment record ────────────────────────────────────────────────────────
    await prisma.payment.create({
      data: {
        userId:          employerId,
        stripePaymentId: paymentIntentId,
        amount:          additionalCents,
        currency:        "usd",
        status:          "SUCCEEDED",
        type:            "WORKER_LOCK",
        description:     `Worker reservation extension — ${additionalDays} day${additionalDays !== 1 ? "s" : ""}`,
        metadata:        { workerId, lockId: lock.id, additionalDays },
      },
    });

    Promise.all([
      insertAdminAuditLog({
        actorId:  employerId,
        targetId: workerId,
        action:   "WORKER_LOCK_EXTENDED",
        metadata: {
          lock_id:                  lock.id,
          additional_days:          additionalDays,
          additional_cents:         additionalCents,
          new_expiry_date:          newExpiry.toISOString(),
          stripe_payment_intent_id: paymentIntentId,
        },
      }),
      sendWorkerLockExtendedWorkerEmail(
        workerId,
        worker!.email,
        worker?.workerProfile?.firstName ?? "",
        newExpiry,
      ),
      sendWorkerLockExtendedEmployerEmail(
        employerId,
        employer!.email,
        worker?.workerProfile?.firstName ?? "",
        workerName,
        newExpiry,
        Number(lock.dailyFee),
        lock.currency,
        newTotalDays,
      ),
      prisma.notification.create({
        data: {
          userId:   workerId,
          type:     "WORKER_LOCK_EXTENDED",
          title:    "Your reservation has been extended",
          body:     `Your profile reservation has been extended until ${newExpiry.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`,
          link:     "/worker/reservations",
          metadata: { lockId: lock.id },
        },
      }),
    ]).catch(console.error);

    return ok(res, updated, "Reservation extended");
  } catch (e) { next(e); }
}

// ── POST /employer/workers/:workerId/release-lock ─────────────────────────────
// FIX 4: partial Stripe refund for unused days; lock is released even if refund fails

export async function releaseLock(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { workerId } = req.params;

    const parsed = ReleaseSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { reason } = parsed.data;

    const lock = await prisma.workerLock.findFirst({
      where: { workerId, employerId, lockStatus: "ACTIVE" },
    });
    if (!lock) return err(res, "No active reservation found for this worker.", 404);

    const [worker, employer] = await Promise.all([
      prisma.user.findUnique({
        where:  { id: workerId },
        select: { email: true, workerProfile: { select: { firstName: true, lastName: true } } },
      }),
      prisma.user.findUnique({
        where:  { id: employerId },
        select: { email: true },
      }),
    ]);

    const workerName = [worker?.workerProfile?.firstName, worker?.workerProfile?.lastName]
      .filter(Boolean).join(" ") || "Worker";

    // ── Release the lock in DB first (always succeeds regardless of Stripe) ────
    await prisma.$transaction([
      prisma.workerLock.update({
        where: { id: lock.id },
        data:  { lockStatus: "RELEASED", releaseReason: reason ?? null },
      }),
      prisma.user.update({
        where: { id: workerId },
        data:  { isLocked: false, lockedByEmployerId: null, lockedUntil: null },
      }),
    ]);

    // ── FIX 4: Partial Stripe refund for unused days ───────────────────────────
    // Only applicable to locks charged via Stripe (stripePaymentIntentId present)
    if (lock.stripePaymentIntentId) {
      try {
        const now        = new Date();
        const daysUsed   = Math.max(
          1,
          Math.ceil((now.getTime() - lock.lockStartDate.getTime()) / (1000 * 60 * 60 * 24)),
        );
        const unusedDays = Math.max(0, lock.lockDays - daysUsed);

        if (unusedDays > 0) {
          const dailyRateCents = parseInt(await cfg("lock_daily_rate_cents", "200"));
          const refundCents    = unusedDays * dailyRateCents;

          const refund = await stripe.refunds.create({
            payment_intent: lock.stripePaymentIntentId,
            amount:         refundCents,
            reason:         "requested_by_customer",
            metadata: {
              lockId:     lock.id,
              unusedDays: unusedDays.toString(),
              workerId,
              employerId,
            },
          });

          await prisma.workerLock.update({
            where: { id: lock.id },
            data: {
              stripeRefundId:     refund.id,
              totalRefundedCents: refundCents,
            },
          });

          await prisma.payment.create({
            data: {
              userId:          employerId,
              stripePaymentId: refund.id,
              amount:          -refundCents,   // negative = refund
              currency:        "usd",
              status:          "REFUNDED",
              type:            "WORKER_LOCK",
              description:     `Partial refund — ${unusedDays} unused day${unusedDays !== 1 ? "s" : ""}`,
              metadata:        { lockId: lock.id, unusedDays, workerId },
            },
          });
        }
      } catch (refundErr) {
        // Refund failure must NOT prevent the release response — log for admin review
        console.error("[releaseLock] Stripe refund failed:", refundErr);
        insertAdminAuditLog({
          actorId:  employerId,
          targetId: workerId,
          action:   "WORKER_LOCK_RELEASED",
          notes:    "STRIPE REFUND FAILED — requires manual review",
          metadata: {
            lock_id:               lock.id,
            stripe_payment_intent: lock.stripePaymentIntentId,
            error:                 refundErr instanceof Error ? refundErr.message : String(refundErr),
          },
        }).catch(console.error);
      }
    }

    // ── Fire-and-forget side effects (FIX 5: valid NotificationType) ──────────
    Promise.all([
      insertAdminAuditLog({
        actorId:  employerId,
        targetId: workerId,
        action:   "WORKER_LOCK_RELEASED",
        metadata: {
          lock_id:      lock.id,
          total_billed: lock.totalBilled,
          total_days:   lock.totalDaysBilled,
          ...(reason && { reason }),
        },
      }),
      sendWorkerLockReleasedWorkerEmail(
        workerId,
        worker!.email,
        worker?.workerProfile?.firstName ?? "",
      ),
      sendWorkerLockReleasedEmployerEmail(
        employerId,
        employer!.email,
        workerName,
        Number(lock.totalBilled),
        lock.currency,
        lock.totalDaysBilled,
      ),
      prisma.notification.create({
        data: {
          userId:   workerId,
          type:     "WORKER_LOCK_RELEASED",    // FIX 5: was "worker_lock_released"
          title:    "Your reservation has ended",
          body:     "Your profile reservation has been released. You are now available to other employers.",
          link:     "/worker/reservations",
          metadata: { lockId: lock.id },
        },
      }),
    ]).catch(console.error);

    return ok(res, { success: true }, "Reservation released");
  } catch (e) { next(e); }
}

// ── GET /employer/lock-rate ───────────────────────────────────────────────────

export async function getLockRate(req: Request, res: Response, next: NextFunction) {
  try {
    const [rateRow, maxDaysRow, maxConcurrentRow] = await Promise.all([
      prisma.platformConfig.findUnique({ where: { key: "lock_daily_rate_cents" } }),
      prisma.platformConfig.findUnique({ where: { key: "lock_max_duration_days" } }),
      prisma.platformConfig.findUnique({ where: { key: "lock_max_concurrent" } }),
    ]);

    const dailyRateCents = parseInt(rateRow?.value ?? "200");
    const maxDays        = parseInt(maxDaysRow?.value ?? "14");
    const maxConcurrent  = parseInt(maxConcurrentRow?.value ?? "5");

    return ok(res, {
      dailyRateCents,
      currency:    "USD",
      maxDays,
      maxConcurrent,
      rateDisplay: `$${(dailyRateCents / 100).toFixed(2)}`,
    });
  } catch (e) { next(e); }
}

// ── GET /employer/workers/:workerId/lock-status ───────────────────────────────

export async function getLockStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { workerId } = req.params;

    const worker = await prisma.user.findUnique({
      where:  { id: workerId },
      select: { isLocked: true, lockedByEmployerId: true },
    });
    if (!worker) return err(res, "Worker not found", 404);

    if (!worker.isLocked) {
      return ok(res, { is_locked: false });
    }

    if (worker.lockedByEmployerId === employerId) {
      const lock = await prisma.workerLock.findFirst({
        where:  { workerId, employerId, lockStatus: "ACTIVE" },
        select: {
          id:              true,
          dailyFee:        true,
          currency:        true,
          lockExpiryDate:  true,
          lockStartDate:   true,
          lockDays:        true,
          totalBilled:     true,
          totalDaysBilled: true,
        },
      });
      if (!lock) return ok(res, { is_locked: true, lock_by_me: true, lock: null });
      return ok(res, {
        is_locked:  true,
        lock_by_me: true,
        lock: {
          id:                lock.id,
          lock_status:       "ACTIVE",
          daily_fee:         Number(lock.dailyFee),
          currency:          lock.currency,
          lock_start_date:   lock.lockStartDate.toISOString(),
          lock_expiry_date:  lock.lockExpiryDate.toISOString(),
          lock_days:         lock.lockDays,
          total_billed:      Number(lock.totalBilled),
          total_days_billed: lock.totalDaysBilled,
        },
      });
    }

    // Locked by another employer — never expose identity
    return ok(res, { is_locked: true, lock_by_me: false });
  } catch (e) { next(e); }
}

// ── GET /employer/locks ───────────────────────────────────────────────────────

export async function getMyLocks(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { status } = req.query as Record<string, string>;

    const VALID_STATUSES = ["ACTIVE", "EXPIRED", "RELEASED", "OVERRIDDEN"];
    const where: Record<string, unknown> = { employerId };
    if (status && VALID_STATUSES.includes(status)) where.lockStatus = status;

    const [rows, total] = await Promise.all([
      prisma.workerLock.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: "desc" },
        include: {
          worker: {
            select: {
              id:            true,
              workerProfile: {
                select: {
                  firstName:          true,
                  lastName:           true,
                  countryOfResidence: true,
                  city:               true,
                },
              },
            },
          },
        },
      }),
      prisma.workerLock.count({ where }),
    ]);

    const data = rows.map(r => ({
      id:                r.id,
      lock_status:       r.lockStatus,
      daily_fee:         r.dailyFee,
      currency:          r.currency,
      lock_start_date:   r.lockStartDate,
      lock_expiry_date:  r.lockExpiryDate,
      lock_days:         r.lockDays,
      total_billed:      r.totalBilled,
      total_days_billed: r.totalDaysBilled,
      release_reason:    r.releaseReason,
      created_at:        r.createdAt,
      worker: {
        id:         r.worker.id,
        first_name: r.worker.workerProfile?.firstName          ?? null,
        last_name:  r.worker.workerProfile?.lastName           ?? null,
        country:    r.worker.workerProfile?.countryOfResidence ?? null,
        city:       r.worker.workerProfile?.city               ?? null,
      },
    }));

    return paginated(res, data, total, page, limit);
  } catch (e) { next(e); }
}
