// backend/src/services/matching/index.ts
// Calculates a 0–100 match score between a worker profile and a job posting.
//
// Formula (from platform spec):
//   Score = (S_skill × 0.30) + (S_exp × 0.20) + (S_sal × 0.15)
//         + (S_loc  × 0.15) + (S_trust × 0.15) + (S_dem × 0.05)
//
// Input types are minimal shapes — not coupled to full Prisma models so this
// function is independently testable and reusable.

// ── Input types ───────────────────────────────────────────────────────────────

export interface ScoringWorker {
  skills:             { skill: string }[];       // WorkerSkill relation
  yearsExperience:    string | null;             // stored as String in DB
  expectedSalary:     string | null;             // stored as String in DB
  targetCountries:    { country: string }[];     // WorkerTargetCountry relation
  countryOfResidence: string | null;
  trustScore:         number | null;             // 0–100 Int, null → default 50
}

export interface ScoringJob {
  requiredSkills:     string[];                  // String[] field on JobPost
  salaryMin:          { toNumber(): number } | number; // Prisma Decimal or plain number
  salaryMax:          { toNumber(): number } | number;
  country:            string;
  experienceRequired: number;                    // Int — years
}

// ── Sub-score helpers ─────────────────────────────────────────────────────────

/** S_skill (30%) — Jaccard similarity between worker skills and job requirements. */
function scoreSkills(
  workerSkills: { skill: string }[],
  jobSkills:    string[],
): number {
  if (jobSkills.length === 0) return 100; // no requirements = full marks
  const ws  = new Set(workerSkills.map(s => s.skill.toLowerCase()));
  const js  = jobSkills.map(s => s.toLowerCase());
  const hit = js.filter(s => ws.has(s)).length;
  const den = Math.max(ws.size, js.length);
  return den === 0 ? 100 : (hit / den) * 100;
}

/** S_exp (20%) — proximity of worker experience to job requirement. */
function scoreExperience(workerExp: string | null, required: number): number {
  if (workerExp === null) return 0;
  const years = parseFloat(workerExp);
  if (isNaN(years)) return 0;
  const diff = Math.abs(years - required);
  if (diff === 0)  return 100;
  if (diff <= 2)   return 70;
  if (diff <= 5)   return 40;
  // Also hard-penalise workers with less than half the required years
  if (years < required / 2) return 0;
  return 0;
}

function toNum(v: { toNumber(): number } | number): number {
  return typeof v === "number" ? v : v.toNumber();
}

/** S_sal (15%) — how well expected salary fits within the job's range. */
function scoreSalary(
  workerSalary: string | null,
  salaryMin:    { toNumber(): number } | number,
  salaryMax:    { toNumber(): number } | number,
): number {
  if (workerSalary === null) return 50; // unknown → neutral
  const salary = parseFloat(workerSalary);
  if (isNaN(salary)) return 50;
  const min = toNum(salaryMin);
  const max = toNum(salaryMax);
  if (salary >= min && salary <= max)         return 100; // within range
  if (salary > max && salary <= max * 1.20)  return 60;  // up to 20% above max
  if (salary < min && salary >= min * 0.80)  return 80;  // up to 20% below min
  return 20; // outside acceptable band
}

/** S_loc (15%) — worker's openness to work in the job's country. */
function scoreLocation(
  targetCountries:    { country: string }[],
  countryOfResidence: string | null,
  jobCountry:         string,
): number {
  const jc = jobCountry.toLowerCase();
  if (targetCountries.some(tc => tc.country.toLowerCase() === jc)) return 100;
  if (countryOfResidence?.toLowerCase() === jc) return 80;
  return 0;
}

/** S_trust (15%) — direct map of trustScore (0–100 Int). */
function scoreTrust(trustScore: number | null): number {
  if (trustScore === null) return 50; // no score yet → neutral default
  return Math.min(100, Math.max(0, trustScore));
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Returns a weighted match score in [0, 100] rounded to 2 decimal places.
 * Never throws — any missing data falls back to a conservative default.
 */
export function calculateMatchScore(
  worker: ScoringWorker,
  job:    ScoringJob,
): number {
  const s_skill = scoreSkills(worker.skills, job.requiredSkills);
  const s_exp   = scoreExperience(worker.yearsExperience, job.experienceRequired);
  const s_sal   = scoreSalary(worker.expectedSalary, job.salaryMin, job.salaryMax);
  const s_loc   = scoreLocation(worker.targetCountries, worker.countryOfResidence, job.country);
  const s_trust = scoreTrust(worker.trustScore);
  const s_dem   = 50; // MVP constant — no regional demand data yet

  const raw =
    s_skill * 0.30 +
    s_exp   * 0.20 +
    s_sal   * 0.15 +
    s_loc   * 0.15 +
    s_trust * 0.15 +
    s_dem   * 0.05;

  return Math.round(Math.min(100, Math.max(0, raw)) * 100) / 100;
}
