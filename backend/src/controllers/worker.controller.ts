// backend/src/controllers/worker.controller.ts
import { Request, Response, NextFunction } from "express";
import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";
import { calculateMatchScore, type ScoringWorker, type ScoringJob } from "../services/matching";

function toNumber(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function getJobOrderBy(sort?: string) {
  switch (sort) {
    case "newest":
      return [{ createdAt: "desc" as const }];
    case "salary_high":
      return [{ salaryMax: "desc" as const }, { salaryMin: "desc" as const }];
    case "salary_low":
      return [{ salaryMin: "asc" as const }, { createdAt: "desc" as const }];
    case "match":
    default:
      return [{ createdAt: "desc" as const }];
  }
}

function deriveCountryCode(country: string): string {
  const cleaned = country.trim();
  if (!cleaned) return "??";
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

// The real enum backing "work type" — schema.prisma has no separate workType
// column; JobPost.contractType is the actual field the frontend's workType
// dropdown should filter on.
const CONTRACT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "INTERNSHIP", "FREELANCE"];

function buildJobsWhere(query: Record<string, string>) {
  const { search, country, category, company, location, workType } = query;

  const minSalary = toNumber(query.minSalary);
  const maxSalary = toNumber(query.maxSalary);
  const visaSupport = query.visaSupport;
  // "visaType" has no real multi-value column of its own — the only real,
  // queryable signal is the boolean JobPost.visaSupport. Mapped honestly to
  // two selectable values rather than left decorative; see getJobFilterOptions.
  const visaType = query.visaType;

  const where: Record<string, unknown> = { status: "APPROVED" };
  const andFilters: Record<string, unknown>[] = [];

  if (country) {
    andFilters.push({ country: { contains: country, mode: "insensitive" } });
  }

  if (location) {
    andFilters.push({
      OR: [
        { country: { contains: location, mode: "insensitive" } },
        { city: { contains: location, mode: "insensitive" } },
      ],
    });
  }

  if (category) {
    andFilters.push({ category: { equals: category, mode: "insensitive" } });
  }

  if (workType && CONTRACT_TYPES.includes(workType.toUpperCase())) {
    andFilters.push({ contractType: workType.toUpperCase() });
  }

  if (visaSupport === "true") {
    andFilters.push({ visaSupport: true });
  }

  if (visaType === "VISA_SUPPORT_AVAILABLE") {
    andFilters.push({ visaSupport: true });
  } else if (visaType === "NO_VISA_SUPPORT") {
    andFilters.push({ visaSupport: false });
  }

  if (company) {
    andFilters.push({ companyName: { contains: company, mode: "insensitive" } });
  }

  if (minSalary !== undefined) {
    andFilters.push({
      OR: [
        { salaryMax: { gte: minSalary } },
        { salaryMax: null, salaryMin: { gte: minSalary } },
      ],
    });
  }

  if (maxSalary !== undefined) {
    andFilters.push({ salaryMin: { lte: maxSalary } });
  }

  if (search) {
    andFilters.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { category: { contains: search, mode: "insensitive" } },
        { companyName: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (andFilters.length > 0) {
    where.AND = andFilters;
  }

  return where;
}

// Loads everything calculateMatchScore needs for this worker, once per
// request — skills, experience, expected salary, target countries, current
// country, trust score. scoringWorker is null when there's no WorkerProfile
// row at all (e.g. an authenticated-but-not-yet-onboarded worker browsing
// jobs pre-verification) — callers must treat that as "no score available",
// not "score is 0".
async function getWorkerContext(userId?: string) {
  if (!userId) {
    return { workerProfileId: null as string | null, scoringWorker: null as ScoringWorker | null };
  }

  const workerProfile = await prisma.workerProfile.findUnique({
    where: { userId },
    select: {
      id:                 true,
      skills:             { select: { skill: true } },
      yearsExperience:    true,
      expectedSalary:     true,
      targetCountries:    { select: { country: true } },
      countryOfResidence: true,
      trustScore:         true,
    },
  });

  if (!workerProfile) {
    return { workerProfileId: null as string | null, scoringWorker: null as ScoringWorker | null };
  }

  return {
    workerProfileId: workerProfile.id,
    scoringWorker: {
      skills:             workerProfile.skills,
      yearsExperience:    workerProfile.yearsExperience,
      expectedSalary:     workerProfile.expectedSalary,
      targetCountries:    workerProfile.targetCountries,
      countryOfResidence: workerProfile.countryOfResidence,
      trustScore:         workerProfile.trustScore,
    } as ScoringWorker,
  };
}

function toScoringJob(job: { requiredSkills: string[]; salaryMin: Prisma.Decimal; salaryMax: Prisma.Decimal; country: string; experienceRequired: number }): ScoringJob {
  return {
    requiredSkills:     job.requiredSkills,
    salaryMin:          job.salaryMin,
    salaryMax:          job.salaryMax,
    country:            job.country,
    experienceRequired: job.experienceRequired,
  };
}

// GET /api/jobs - browse job posts (workers)
export async function getJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const query = req.query as Record<string, string>;
    const sort = query.sort;
    const savedOnly = query.savedOnly === "true";
    const userId = req.user?.sub;
    const { workerProfileId, scoringWorker } = await getWorkerContext(userId);

    if (savedOnly && !workerProfileId) {
      return paginated(res, [], 0, page, limit);
    }

    const where = buildJobsWhere(query) as Prisma.JobPostWhereInput;
    if (savedOnly && workerProfileId) {
      where.savedBy = {
        some: { workerProfileId },
      };
    }
    // NOTE — performance tradeoff: "match" sort can't be expressed as a DB
    // ORDER BY (the score is computed in application code from the worker's
    // relations against each job's fields). getJobOrderBy("match") already
    // falls through to createdAt desc, so this fetches ONE page using that
    // stable baseline order, then — for sort==="match" only — re-sorts that
    // already-fetched page in memory by real score, below. This ranks
    // correctly WITHIN the fetched page (e.g. the 20 jobs on page 1), not
    // across the full table: a better-matching job sitting on page 2 will
    // not bubble up to page 1. Doing that properly would need a
    // precomputed-scores table refreshed out of band — explicitly out of
    // scope for this pass per instruction.
    const orderBy = getJobOrderBy(sort);

    const [rows, total] = await Promise.all([
      prisma.jobPost.findMany({ where, skip, take: limit, orderBy }),
      prisma.jobPost.count({ where }),
    ]);

    let savedSet = new Set<string>();
    if (workerProfileId && rows.length > 0) {
      const saved = await prisma.savedJob.findMany({
        where: {
          workerProfileId,
          jobPostId: { in: rows.map((j) => j.id) },
        },
        select: { jobPostId: true },
      });
      savedSet = new Set(saved.map((savedRow) => savedRow.jobPostId));
    }

    // One worker load (above) + this one page of jobs — score every row in
    // memory, no N+1. scoringWorker is null for a worker with no profile
    // row yet, in which case matchScore stays undefined for every job
    // (never 0 — 0 would misleadingly read as "bad match" rather than
    // "no data to score against yet").
    let enriched = rows.map((job) => {
      const matchScore = scoringWorker
        ? calculateMatchScore(scoringWorker, toScoringJob(job))
        : undefined;

      return {
        ...job,
        matchScore,
        // Returned alongside matchScore (same value) for one release so any
        // other consumer still reading aiMatchScore doesn't silently break.
        // Drop this once nothing in the codebase reads aiMatchScore anymore
        // (frontend now reads matchScore as canonical — see jobs/page.tsx).
        aiMatchScore: matchScore,
        isSaved: savedSet.has(job.id),
      };
    });

    if (sort === "match" && scoringWorker) {
      enriched = [...enriched].sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1));
    }

    return paginated(res, enriched, total, page, limit);
  } catch (e) {
    next(e);
  }
}

// GET /api/jobs/filter-options - options for worker filters
export async function getJobFilterOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as Record<string, string>;
    const where = buildJobsWhere(query);

    const rows = await prisma.jobPost.findMany({
      where,
      select: {
        country:      true,
        category:     true,
        companyName:  true,
        salaryMin:    true,
        salaryMax:    true,
        contractType: true,
        visaSupport:  true,
      },
    });

    const countries   = new Set<string>();
    const categories  = new Set<string>();
    const companies   = new Set<string>();
    const workTypes   = new Set<string>();
    let hasVisaSupport   = false;
    let hasNoVisaSupport = false;
    let minSalary: number | null = null;
    let maxSalary: number | null = null;

    for (const row of rows) {
      if (row.country?.trim())     countries.add(row.country.trim());
      if (row.category?.trim())    categories.add(row.category.trim());
      if (row.companyName?.trim()) companies.add(row.companyName.trim());
      if (row.contractType)        workTypes.add(row.contractType);
      if (row.visaSupport) hasVisaSupport = true; else hasNoVisaSupport = true;

      const sMin = row.salaryMin ? Number(row.salaryMin) : null;
      const sMax = row.salaryMax ? Number(row.salaryMax) : null;
      if (sMin !== null && Number.isFinite(sMin)) {
        minSalary = minSalary === null ? sMin : Math.min(minSalary, sMin);
      }
      if (sMax !== null && Number.isFinite(sMax)) {
        maxSalary = maxSalary === null ? sMax : Math.max(maxSalary, sMax);
      }
    }

    // visaTypes has no real multi-value column — see buildJobsWhere's comment.
    // Only offer values that actually distinguish jobs currently in this set.
    const visaTypes: string[] = [];
    if (hasVisaSupport)   visaTypes.push("VISA_SUPPORT_AVAILABLE");
    if (hasNoVisaSupport) visaTypes.push("NO_VISA_SUPPORT");

    return ok(res, {
      countries:   Array.from(countries).sort((a, b) => a.localeCompare(b)),
      categories:  Array.from(categories).sort((a, b) => a.localeCompare(b)),
      companies:   Array.from(companies).sort((a, b) => a.localeCompare(b)),
      workTypes:   Array.from(workTypes).sort((a, b) => a.localeCompare(b)),
      visaTypes,
      salaryRange: { min: minSalary, max: maxSalary },
    });
  } catch (e) {
    next(e);
  }
}

// GET /api/jobs/countries - country counts for jobs explorer
export async function getJobCountries(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as Record<string, string>;
    const savedOnly = query.savedOnly === "true";
    const where = buildJobsWhere(query) as Prisma.JobPostWhereInput;

    if (savedOnly) {
      const { workerProfileId } = await getWorkerContext(req.user?.sub);
      if (!workerProfileId) {
        return ok(res, []);
      }
      where.savedBy = {
        some: { workerProfileId },
      };
    }

    const rows = await prisma.jobPost.findMany({
      where,
      select: { country: true },
    });

    const countryMap = new Map<string, number>();
    for (const row of rows) {
      const key = row.country?.trim();
      if (!key) continue;
      countryMap.set(key, (countryMap.get(key) ?? 0) + 1);
    }

    const countries = Array.from(countryMap.entries())
      .map(([country, count]) => ({
        country,
        code: deriveCountryCode(country),
        count,
      }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));

    return ok(res, countries);
  } catch (e) {
    next(e);
  }
}

// GET /api/jobs/:id - get single job post (worker)
export async function getJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = req.user?.sub;
    const { workerProfileId, scoringWorker } = await getWorkerContext(userId);

    const job = await prisma.jobPost.findUnique({ where: { id } });

    if (!job || job.status !== "APPROVED") {
      return err(res, "Job not found", 404);
    }

    let isSaved = false;
    if (workerProfileId) {
      const saved = await prisma.savedJob.findUnique({
        where: { workerProfileId_jobPostId: { workerProfileId, jobPostId: id } },
      });
      isSaved = !!saved;
    }

    // Same real formula, same worker, same job — the detail modal shows the
    // identical number the feed already showed for this job.
    const matchScore = scoringWorker
      ? calculateMatchScore(scoringWorker, toScoringJob(job))
      : undefined;

    return ok(res, { ...job, isSaved, matchScore, aiMatchScore: matchScore });
  } catch (e) {
    next(e);
  }
}

// POST /api/jobs/:id/save
export async function saveJob(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const jobId = req.params.id;

    const wp = await prisma.workerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!wp) return err(res, "Worker profile not found", 404);

    const job = await prisma.jobPost.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "APPROVED") {
      return err(res, "Job is unavailable", 404);
    }

    const saved = await prisma.savedJob.upsert({
      where: {
        workerProfileId_jobPostId: {
          workerProfileId: wp.id,
          jobPostId: jobId,
        },
      },
      update: {},
      create: {
        workerProfileId: wp.id,
        jobPostId: jobId,
      },
    });

    return ok(res, saved, "Job saved", 201);
  } catch (e) {
    next(e);
  }
}

// GET /api/saved-jobs
export async function getSavedJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);

    const wp = await prisma.workerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!wp) return paginated(res, [], 0, page, limit);

    const [rows, total] = await Promise.all([
      prisma.savedJob.findMany({
        where: { workerProfileId: wp.id },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { jobPost: true },
      }),
      prisma.savedJob.count({ where: { workerProfileId: wp.id } }),
    ]);

    const payload = rows.map((row) => ({
      id:      row.id,
      savedAt: row.createdAt,
      job:     row.jobPost,
    }));

    return paginated(res, payload, total, page, limit);
  } catch (e) {
    next(e);
  }
}

// DELETE /api/saved-jobs/:jobId
export async function unsaveJob(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const jobId = req.params.jobId;

    const wp = await prisma.workerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!wp) return err(res, "Worker profile not found", 404);

    await prisma.savedJob.deleteMany({
      where: {
        workerProfileId: wp.id,
        jobPostId: jobId,
      },
    });

    return ok(res, null, "Saved job removed");
  } catch (e) {
    next(e);
  }
}
