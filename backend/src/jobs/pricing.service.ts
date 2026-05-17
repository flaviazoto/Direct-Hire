/**
 * PricingService — application fee computation stub.
 *
 * Returns the platform base fee in USD for a given job application.
 * Full dynamic pricing (trust-score discounts, country multipliers, etc.)
 * can be wired later by enriching computeFee without changing callers.
 */

import prisma from "../lib/prisma";

const FEE_CACHE_MS = 60_000; // 60s in-process cache so every job doesn't hit DB
let _cachedCents: number | null = null;
let _cacheExpiry = 0;

async function getBaseFeeUsd(): Promise<number> {
  const now = Date.now();
  if (_cachedCents !== null && now < _cacheExpiry) {
    return _cachedCents / 100;
  }

  const row = await prisma.platformConfig.findUnique({
    where:  { key: "application_base_fee_cents" },
    select: { value: true },
  });

  _cachedCents  = parseInt(row?.value ?? "300", 10);
  _cacheExpiry  = now + FEE_CACHE_MS;
  return _cachedCents / 100;
}

/**
 * Compute the application fee for a specific job + worker pair.
 * Currently returns the flat platform base fee.
 * Signature accepts job/worker so dynamic pricing can be added here later.
 */
export async function computeFee(
  _job:    { country: string; salaryMin: unknown; salaryMax: unknown },
  _worker: { trustScore?: number | null } | null,
): Promise<number> {
  const base = await getBaseFeeUsd();
  return parseFloat(base.toFixed(2));
}
