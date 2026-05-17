// backend/src/config/stripe.config.ts
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error(
    "FATAL: STRIPE_SECRET_KEY is not set. " +
    "Add it to backend/.env before starting the server."
  );
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-04-22.dahlia" as any,
});

export default stripe;
