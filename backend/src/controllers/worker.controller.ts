// backend/src/controllers/worker.controller.ts
import { Request, Response, NextFunction } from "express";
import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";

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

function buildJobsWhere(query: Record<string, string>) {
  const { search, country, category, company, location } = query;

  const minSalary = toNumber(query.minSalary);
  const maxSalary = toNumber(query.maxSalary);
  const visaSupport = query.visaSupport;

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

  if (visaSupport === "true") {
    andFilters.push({ visaSupport: true });
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

async function getWorkerContext(userId?: string) {
  if (!userId) {
    return { workerProfileId: null as string | null, workerSkills: [] as string[] };
  }

  const workerProfile = await prisma.workerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      skills: { select: { skill: true } },
    },
  });

  return {
    workerProfileId: workerProfile?.id ?? null,
    workerSkills: workerProfile?.skills.map((skillRow) => skillRow.skill.toLowerCase()) ?? [],
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
    const { workerProfileId, workerSkills } = await getWorkerContext(userId);

    if (savedOnly && !workerProfileId) {
      return paginated(res, [], 0, page, limit);
    }

    const where = buildJobsWhere(query) as Prisma.JobPostWhereInput;
    if (savedOnly && workerProfileId) {
      where.savedBy = {
        some: { workerProfileId },
      };
    }
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

    const enriched = rows.map((job) => {
      const jobSkills = job.requiredSkills.map((s) => s.toLowerCase());
      const matched = workerSkills.filter((s) => jobSkills.includes(s)).length;
      const matchScore = jobSkills.length > 0
        ? Math.round((matched / jobSkills.length) * 100)
        : undefined;

      return {
        ...job,
        matchScore,
        isSaved: savedSet.has(job.id),
      };
    });

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
        country:     true,
        category:    true,
        companyName: true,
        salaryMin:   true,
        salaryMax:   true,
      },
    });

    const countries   = new Set<string>();
    const categories  = new Set<string>();
    const companies   = new Set<string>();
    let minSalary: number | null = null;
    let maxSalary: number | null = null;

    for (const row of rows) {
      if (row.country?.trim())     countries.add(row.country.trim());
      if (row.category?.trim())    categories.add(row.category.trim());
      if (row.companyName?.trim()) companies.add(row.companyName.trim());

      const sMin = row.salaryMin ? Number(row.salaryMin) : null;
      const sMax = row.salaryMax ? Number(row.salaryMax) : null;
      if (sMin !== null && Number.isFinite(sMin)) {
        minSalary = minSalary === null ? sMin : Math.min(minSalary, sMin);
      }
      if (sMax !== null && Number.isFinite(sMax)) {
        maxSalary = maxSalary === null ? sMax : Math.max(maxSalary, sMax);
      }
    }

    return ok(res, {
      countries:   Array.from(countries).sort((a, b) => a.localeCompare(b)),
      categories:  Array.from(categories).sort((a, b) => a.localeCompare(b)),
      companies:   Array.from(companies).sort((a, b) => a.localeCompare(b)),
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
    const { workerProfileId, workerSkills } = await getWorkerContext(userId);

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

    const jobSkills = job.requiredSkills.map((s) => s.toLowerCase());
    const matched = workerSkills.filter((s) => jobSkills.includes(s)).length;
    const matchScore = jobSkills.length > 0
      ? Math.round((matched / jobSkills.length) * 100)
      : undefined;

    return ok(res, { ...job, isSaved, matchScore });
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
