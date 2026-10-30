// frontend/src/lib/stripe.ts
// Lazily loads Stripe.js the first time a payment actually needs it.
// Calling loadStripe() at module load made every visitor of pages like /jobs
// download Stripe.js and its fraud-fingerprinting frames, even though most
// never pay (and none do when the platform runs free).

import { loadStripe, type Stripe } from "@stripe/stripe-js";

const KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
let promise: Promise<Stripe | null> | null = null;

export const stripeConfigured = Boolean(KEY);

/** Same promise on every call, so <Elements stripe={getStripe()}> stays stable. */
export function getStripe(): Promise<Stripe | null> {
  if (!promise) promise = KEY ? loadStripe(KEY) : Promise.resolve(null);
  return promise;
}
