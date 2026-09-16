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
import { paymentsEnabled } from "../config/flags";

// ── Simple in-memory cache (60-second TTL) — same pattern as public-jobs.controller.ts ──
// Cache entries are keyed off the payments-flag state so flipping
// PAYMENTS_ENABLED never serves a stale response built under the old state.

interface CacheEntry { data: unknown; expiresAt: number; paymentsEnabled: boolean }
let cached: CacheEntry | null = null;
const CACHE_TTL_MS = 60_000;

// ── GET /api/public/config/pricing ────────────────────────────────────────────

export async function getPublicPricingConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const enabled = paymentsEnabled();

    if (cached && cached.paymentsEnabled === enabled && Date.now() < cached.expiresAt) {
      return res.json(cached.data);
    }

    if (!enabled) {
      const payload = {
        success: true,
        data: {
          paymentsEnabled: false,
          lock:            null,
          employerPrice:   null,
          applicationFee:  null,
        },
      };
      cached = { data: payload, expiresAt: Date.now() + CACHE_TTL_MS, paymentsEnabled: enabled };
      return res.json(payload);
    }

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
        paymentsEnabled: true,
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

    cached = { data: payload, expiresAt: Date.now() + CACHE_TTL_MS, paymentsEnabled: enabled };
    return res.json(payload);
  } catch (e) { next(e); }
}
