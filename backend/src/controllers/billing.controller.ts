// backend/src/controllers/billing.controller.ts
import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import stripe, {
  getOrCreateCustomer,
  createCheckoutSession,
  cancelSubscription,
  createPortalSession,
} from "../services/stripe";

const FRONTEND_URL = () => process.env.FRONTEND_URL ?? "http://localhost:3000";

// ── POST /api/employer/subscription/checkout ──────────────────────────────────
export async function createCheckout(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const userId = req.user!.sub;

    const [user, ep] = await Promise.all([
      prisma.user.findUnique({
        where:  { id: userId },
        select: { email: true },
      }),
      prisma.employerProfile.findUnique({
        where:  { userId },
        select: {
          companyName:        true,
          subscriptionStatus: true,
          subscription:       { select: { stripe_customer_id: true, stripe_sub_id: true } },
        },
      }),
    ]);

    if (!user || !ep) return err(res, "Employer profile not found", 404);

    if (ep.subscriptionStatus === "ACTIVE") {
      return err(res, "You already have an active subscription", 400);
    }

    if (!process.env.STRIPE_EMPLOYER_PRICE_ID) {
      return err(res, "Stripe price not configured — contact support", 500);
    }

    const customerId = await getOrCreateCustomer(
      userId, user.email, ep.companyName ?? null,
    );

    const checkoutUrl = await createCheckoutSession({
      customerId,
      priceId:    process.env.STRIPE_EMPLOYER_PRICE_ID,
      userId,
      successUrl: `${FRONTEND_URL()}/employer/subscription?success=1`,
      cancelUrl:  `${FRONTEND_URL()}/employer/subscription?canceled=1`,
    });

    return ok(res, { checkoutUrl });
  } catch (e) { next(e); }
}

// ── GET /api/employer/subscription/status ─────────────────────────────────────
export async function getSubscriptionStatus(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const userId = req.user!.sub;

    const ep = await prisma.employerProfile.findUnique({
      where:  { userId },
      select: {
        subscriptionStatus: true,
        subscriptionPlan:   true,
        trialEndsAt:        true,
        subscription: {
          select: {
            stripe_customer_id: true,
            current_period_end: true,
          },
        },
      },
    });

    if (!ep) {
      return ok(res, { status: "INACTIVE", plan: null, currentPeriodEnd: null, payments: [] });
    }

    const payments = await prisma.payment.findMany({
      where:   { entity_type: "APPLICATION_FEE" },
      orderBy: { created_at: "desc" },
      take:    10,
      select:  {
        id:                       true,
        amount_cents:             true,
        currency:                 true,
        status:                   true,
        entity_type:              true,
        stripe_payment_intent_id: true,
        created_at:               true,
      },
    });

    return ok(res, {
      status:           ep.subscriptionStatus ?? "INACTIVE",
      plan:             ep.subscriptionPlan ?? null,
      currentPeriodEnd: ep.subscription?.current_period_end ?? null,
      trialEndsAt:      ep.trialEndsAt ?? null,
      hasCustomer:      !!ep.subscription?.stripe_customer_id,
      cancelAtPeriodEnd: ep.subscriptionStatus === "CANCELED",
      payments,
    });
  } catch (e) { next(e); }
}

// ── POST /api/employer/subscription/cancel ────────────────────────────────────
export async function cancelEmployerSubscription(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const userId = req.user!.sub;

    const ep = await prisma.employerProfile.findUnique({
      where:  { userId },
      select: {
        subscriptionStatus: true,
        subscription: { select: { stripe_sub_id: true } },
      },
    });

    if (!ep?.subscription?.stripe_sub_id) return err(res, "No active subscription found", 404);
    if (ep.subscriptionStatus !== "ACTIVE") {
      return err(res, "Subscription is not active", 400);
    }

    await cancelSubscription(ep.subscription.stripe_sub_id);

    await prisma.employerProfile.update({
      where: { userId },
      data:  { subscriptionStatus: "CANCELED" },
    });

    return ok(res, null, "Subscription will cancel at end of billing period");
  } catch (e) { next(e); }
}

// ── POST /api/employer/subscription/portal ────────────────────────────────────
export async function createPortal(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const userId = req.user!.sub;

    const ep = await prisma.employerProfile.findUnique({
      where:  { userId },
      select: { subscription: { select: { stripe_customer_id: true } } },
    });

    if (!ep?.subscription?.stripe_customer_id) {
      return err(res, "No billing account found — subscribe first", 404);
    }

    const portalUrl = await createPortalSession(
      ep.subscription.stripe_customer_id,
      `${FRONTEND_URL()}/employer/subscription`,
    );

    return ok(res, { portalUrl });
  } catch (e) { next(e); }
}
