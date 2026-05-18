// backend/src/services/stripe/index.ts
import Stripe from "stripe";
import prisma from "../../lib/prisma";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("[stripe] STRIPE_SECRET_KEY not set — Stripe calls will fail");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  apiVersion: "2026-04-22.dahlia",
});

export default stripe;

/** Returns existing Stripe customer ID for the employer, or creates one. */
export async function getOrCreateCustomer(
  userId:      string,
  email:       string,
  companyName?: string | null,
): Promise<string> {
  const ep = await prisma.employerProfile.findUnique({
    where:  { userId },
    select: { id: true, subscription: { select: { stripe_customer_id: true } } },
  });

  if (ep?.subscription?.stripe_customer_id) return ep.subscription.stripe_customer_id;

  const customer = await stripe.customers.create({
    email,
    name:     companyName ?? undefined,
    metadata: { userId },
  });

  // Upsert the Subscription record with the new customer ID
  if (ep) {
    await prisma.subscription.upsert({
      where:  { employer_id: ep.id },
      update: { stripe_customer_id: customer.id },
      create: {
        employer_id:          ep.id,
        stripe_customer_id:   customer.id,
        stripe_sub_id:        `pending-${ep.id}`,
        status:               "INACTIVE",
        current_period_start: new Date(),
        current_period_end:   new Date(),
      },
    });
  }

  return customer.id;
}

/** Creates a Stripe Checkout Session (subscription mode) and returns the URL. */
export async function createCheckoutSession(opts: {
  customerId: string;
  priceId:    string;
  userId:     string;
  successUrl: string;
  cancelUrl:  string;
}): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    customer:   opts.customerId,
    mode:       "subscription",
    line_items: [{ price: opts.priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url:  opts.cancelUrl,
    metadata:    { userId: opts.userId },
    subscription_data: {
      metadata: { userId: opts.userId },
    },
  });
  return session.url!;
}

/** Cancels a subscription at the end of the current period. */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

/** Creates a Stripe Billing Portal session and returns the URL. */
export async function createPortalSession(
  customerId: string,
  returnUrl:  string,
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer:   customerId,
    return_url: returnUrl,
  });
  return session.url;
}

/** Maps a Stripe subscription status to the internal string used in DB. */
export function mapStripeStatus(status: string): string {
  switch (status) {
    case "active":   return "ACTIVE";
    case "trialing": return "TRIALING";
    case "past_due": return "PAST_DUE";
    case "canceled":
    case "unpaid":
    case "incomplete_expired": return "INACTIVE";
    default:                   return "INACTIVE";
  }
}
