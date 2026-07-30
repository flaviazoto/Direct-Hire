// backend/src/controllers/public-config.controller.ts
// Public, read-only pricing display config — no auth required. Returns only
// generic platform figures already shown to any registered employer (via
// GET /employer/lock-rate) or on the billing page (Stripe price), so nothing
// here is more sensitive than what's already public knowledge once you sign
// up. Exists so marketing/public pages can show real numbers instead of
// hardcoding them, same anti-drift reasoning as employer/subscription/page.tsx.

import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import stripe from "../services/stripe";

// ── Simple in-memory cache (60-second TTL) — same pattern as public-jobs.controller.ts ──

interface CacheEntry { data: unknown; expiresAt: number }
let cached: CacheEntry | null = null;
const CACHE_TTL_MS = 60_000;

// ── GET /api/public/config/pricing ────────────────────────────────────────────

export async function getPublicPricingConfig(req: Request, res: Response, next: NextFunction) {
  try {
    if (cached && Date.now() < cached.expiresAt) return res.json(cached.data);

    const [rateRow, maxDaysRow, maxConcurrentRow] = await Promise.all([
      prisma.platformConfig.findUnique({ where: { key: "lock_daily_rate_cents" } }),
      prisma.platformConfig.findUnique({ where: { key: "lock_max_duration_days" } }),
      prisma.platformConfig.findUnique({ where: { key: "lock_max_concurrent" } }),
    ]);

    const dailyRateCents = parseInt(rateRow?.value ?? "200");
    const maxDays        = parseInt(maxDaysRow?.value ?? "14");
    const maxConcurrent  = parseInt(maxConcurrentRow?.value ?? "5");

    // Same non-fatal degrade-to-null pattern as billing.controller.ts's
    // getSubscriptionStatus — a Stripe hiccup here must not break the page.
    let employerPrice: { amountCents: number; currency: string; interval: string } | null = null;
    if (process.env.STRIPE_EMPLOYER_PRICE_ID) {
      try {
        const price = await stripe.prices.retrieve(process.env.STRIPE_EMPLOYER_PRICE_ID);
        employerPrice = {
          amountCents: price.unit_amount ?? 0,
          currency:    price.currency,
          interval:    price.recurring?.interval ?? "month",
        };
      } catch (e) {
        console.error("[getPublicPricingConfig] Failed to retrieve Stripe price:", e);
      }
    }

    const payload = {
      success: true,
      data: {
        lock: {
          dailyRateCents,
          currency:    "USD",
          maxDays,
          maxConcurrent,
          rateDisplay: `$${(dailyRateCents / 100).toFixed(2)}`,
        },
        employerPrice,
        applicationFee: { minCents: 100, maxCents: 2500 },
      },
    };

    cached = { data: payload, expiresAt: Date.now() + CACHE_TTL_MS };
    return res.json(payload);
  } catch (e) { next(e); }
}
