// backend/src/services/pricing/index.ts
// Calculates the application fee a worker pays when submitting an application.
//
// Fee formula:
//   rawFee = baseFee × RegionDemandMultiplier × SalaryTierMultiplier × ConversionAdj
//   clamp to [100, 2500] cents ($1–$25), round to nearest 50 cents
//
// Set env DISABLE_APPLICATION_FEES=true to bypass all fees (returns 0).

import prisma from "../../lib/prisma";

export interface FeeParams {
  jobId:      string;
  workerId:   string;
  jobCountry: string;
  salaryMax:  number;
  matchScore: number;
  trustScore: number | null;
}

export interface FeeResult {
  feeCents:   number;
  feeDisplay: string;
  breakdown: {
    base:             number;
    regionMultiplier: number;
    salaryMultiplier: number;
    conversionAdj:    number;
  };
}

const ZERO_FEE: FeeResult = {
  feeCents:  0,
  feeDisplay: "Free",
  breakdown: { base: 0, regionMultiplier: 1, salaryMultiplier: 1, conversionAdj: 1 },
};

// ── Platform config helper ────────────────────────────────────────────────────

async function cfg(key: string, fallback: string): Promise<string> {
  const row = await prisma.platformConfig.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

// ── Pure math (no I/O) ────────────────────────────────────────────────────────

function applyFormula(opts: {
  baseFee:          number;
  regionMultiplier: number;
  salaryMax:        number;
  matchScore:       number;
  trustScore:       number | null;
}): FeeResult {
  const { baseFee, regionMultiplier, salaryMax, matchScore, trustScore } = opts;

  const salaryMultiplier =
    salaryMax < 20_000  ? 1.0 :
    salaryMax < 50_000  ? 1.3 :
    salaryMax < 100_000 ? 1.5 :
                          1.8;

  const trust = trustScore ?? 50;
  const conversionAdj =
    (matchScore > 80 && trust > 80) ? 0.8 :
    (matchScore < 40 || trust < 40) ? 1.2 :
                                       1.0;

  const raw      = baseFee * regionMultiplier * salaryMultiplier * conversionAdj;
  const clamped  = Math.min(2500, Math.max(100, raw));
  const feeCents = Math.round(clamped / 50) * 50;

  return {
    feeCents,
    feeDisplay: `$${(feeCents / 100).toFixed(2)}`,
    breakdown:  { base: baseFee, regionMultiplier, salaryMultiplier, conversionAdj },
  };
}

// ── Main async export ─────────────────────────────────────────────────────────

export async function calculateApplicationFeeAsync(params: FeeParams): Promise<FeeResult> {
  if (process.env.DISABLE_APPLICATION_FEES === "true") return ZERO_FEE;

  const [enabledStr, baseFeeStr] = await Promise.all([
    cfg("application_fee_enabled",    "true"),
    cfg("application_base_fee_cents", "300"),
  ]);

  if (enabledStr === "false") return ZERO_FEE;

  const baseFee = Math.max(50, parseInt(baseFeeStr, 10) || 300);

  // ── Region demand multiplier ──────────────────────────────────────────────
  // ratio = active approved jobs in country / workers who target that country
  const [activeJobs, targetingWorkers] = await Promise.all([
    prisma.jobPost.count({
      where: { country: params.jobCountry, status: "APPROVED" },
    }),
    prisma.workerProfile.count({
      where: { targetCountries: { some: { country: params.jobCountry } } },
    }),
  ]);

  const ratio = targetingWorkers > 0 ? activeJobs / targetingWorkers : 0;
  const regionMultiplier = ratio > 2 ? 2.5 : ratio >= 1 ? 1.5 : 1.0;

  return applyFormula({
    baseFee,
    regionMultiplier,
    salaryMax:   params.salaryMax,
    matchScore:  params.matchScore,
    trustScore:  params.trustScore,
  });
}
