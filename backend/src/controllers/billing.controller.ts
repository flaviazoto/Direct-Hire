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
import { sendSubscriptionCanceledEmail } from "../services/email";

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
          companyName:         true,
          stripeCustomerId:    true,
          stripeSubscriptionId: true,
          subscriptionStatus:  true,
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
      userId, user.email, ep.companyName,
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
        subscriptionStatus:          true,
        subscriptionPlan:            true,
        subscriptionCurrentPeriodEnd: true,
        stripeCustomerId:            true,
        stripeSubscriptionId:        true,
        trialEndsAt:                 true,
      },
    });

    if (!ep) {
      return ok(res, { status: "INACTIVE", plan: null, currentPeriodEnd: null, payments: [] });
    }

    const payments = await prisma.payment.findMany({
      where:   { userId },
      orderBy: { createdAt: "desc" },
      take:    10,
      select:  {
        id: true, amount: true, currency: true,
        status: true, type: true, description: true, createdAt: true,
        stripeInvoiceId: true,
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });

    // Real price, read live from Stripe — never hardcode a number/currency
    // in the frontend for this. Non-fatal: a Stripe hiccup here must not
    // break the whole status page, so `planPrice` degrades to null and the
    // page falls back to plain copy with no fabricated figure.
    let planPrice: { amountCents: number; currency: string; interval: string } | null = null;
    if (process.env.STRIPE_EMPLOYER_PRICE_ID) {
      try {
        const price = await stripe.prices.retrieve(process.env.STRIPE_EMPLOYER_PRICE_ID);
        planPrice = {
          amountCents: price.unit_amount ?? 0,
          currency:    price.currency,
          interval:    price.recurring?.interval ?? "month",
        };
      } catch (e) {
        console.error("[getSubscriptionStatus] Failed to retrieve Stripe price:", e);
      }
    }

    return ok(res, {
      status:           ep.subscriptionStatus ?? "INACTIVE",
      plan:             ep.subscriptionPlan ?? null,
      currentPeriodEnd: ep.subscriptionCurrentPeriodEnd ?? null,
      trialEndsAt:      ep.trialEndsAt ?? null,
      hasCustomer:      !!ep.stripeCustomerId,
      cancelAtPeriodEnd: ep.subscriptionStatus === "CANCELED",
      planPrice,
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
        stripeSubscriptionId: true, subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true, contactPersonName: true, companyName: true,
      },
    });

    if (!ep?.stripeSubscriptionId) return err(res, "No active subscription found", 404);
    if (ep.subscriptionStatus !== "ACTIVE") {
      return err(res, "Subscription is not active", 400);
    }

    await cancelSubscription(ep.stripeSubscriptionId);

    await prisma.employerProfile.update({
      where: { userId },
      data:  { subscriptionStatus: "CANCELED" },
    });

    // Fire-and-forget: email + in-app confirmation, same non-fatal pattern
    // used everywhere else in this codebase. accessUntil falls back to "now"
    // only in the unexpected case subscriptionCurrentPeriodEnd was never set
    // (e.g. webhook hasn't synced yet) — should not normally happen for an
    // account that just passed the ACTIVE check above.
    const accessUntil = ep.subscriptionCurrentPeriodEnd ?? new Date();
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const name = ep.contactPersonName?.split(" ")[0] ?? ep.companyName ?? "there";
    if (user) {
      Promise.all([
        sendSubscriptionCanceledEmail(userId, user.email, name, accessUntil),
        prisma.notification.create({
          data: {
            userId,
            title: "Subscription canceled",
            body:  `Your cancellation is confirmed. You'll keep access until ${accessUntil.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`,
            type:  "GENERAL",
            link:  "/employer/subscription",
          },
        }),
      ]).catch((e: unknown) => console.error("[cancelEmployerSubscription] confirmation notify failed:", e));
    }

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
      select: { stripeCustomerId: true },
    });

    if (!ep?.stripeCustomerId) {
      return err(res, "No billing account found — subscribe first", 404);
    }

    const portalUrl = await createPortalSession(
      ep.stripeCustomerId,
      `${FRONTEND_URL()}/employer/subscription`,
    );

    return ok(res, { portalUrl });
  } catch (e) { next(e); }
}
