// backend/src/controllers/public-jobs.controller.ts
// Public job search — no auth required.
// CRITICAL: always filters status = APPROVED. Never exposes DRAFT, PENDING_MODERATION, REJECTED, ARCHIVED.

import { Request, Response, NextFunction } from "express";
import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";
import { getActiveExternalJobsForFeed } from "../lib/external-jobs";

// ── Simple in-memory cache (60-second TTL) ────────────────────────────────────

interface CacheEntry { data: unknown; expiresAt: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function cacheGet(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key: string, data: unknown): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  // Evict entries beyond 500 to prevent unbounded growth
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
}

// ── Safe field selection (never expose sensitive columns) ──────────────────────

const JOB_LIST_SELECT = {
  id:                  true,
  title:               true,
  companyName:         true,
  country:             true,
  city:                true,
  remoteAllowed:       true,
  salaryMin:           true,
  salaryMax:           true,
  salaryCurrency:      true,
  contractType:        true,
  experienceRequired:  true,
  category:            true,
  requiredSkills:      true,
  languagesRequired:   true,
  visaSupport:         true,
  accommodation:       true,
  applicationDeadline: true,
  positionsAvailable:  true,
  viewCount:           true,
  applicationCount:    true,
  createdAt:           true,
} as const;

const JOB_DETAIL_SELECT = {
  ...JOB_LIST_SELECT,
  description:  true,
  requirements: true,
  benefits:     true,
  // approvedAt (not createdAt) is the correct JobPosting.datePosted source —
  // createdAt is when the employer drafted it, approvedAt is when it actually
  // went public. Added for the public job detail page's JSON-LD (SEO phase 1).
  approvedAt:   true,
  // AI Content Agent output, consumed as the primary source (falling back to
  // constructed title/description when null) by generateMetadata on the
  // public job detail page.
  seoMetaTitle:       true,
  seoMetaDescription: true,
} as const;

// ── Sort helper ────────────────────────────────────────────────────────────────

function getOrderBy(sort?: string) {
  switch (sort) {
    case "salary_high":
      return [{ salaryMax: "desc" as const }, { createdAt: "desc" as const }];
    case "salary_low":
      return [{ salaryMin: "asc" as const }, { createdAt: "desc" as const }];
    case "newest":
    default:
      return [{ createdAt: "desc" as const }];
  }
}

// ── Where builder ──────────────────────────────────────────────────────────────

function buildWhere(query: Record<string, string>) {
  const {
    search, country, category, contract_type,
    salary_min, salary_max, visa_support, remote, skills,
  } = query;

  const where: Record<string, unknown> = { status: "APPROVED" };
  const and: Record<string, unknown>[] = [];

  if (country) {
    and.push({ country: { contains: country, mode: "insensitive" } });
  }
  if (category) {
    and.push({ category: { equals: category, mode: "insensitive" } });
  }
  if (contract_type) {
    const typeList = contract_type.split(",").map(s => s.trim()).filter(Boolean);
    if (typeList.length === 1) {
      and.push({ contractType: { equals: typeList[0] } });
    } else if (typeList.length > 1) {
      and.push({ contractType: { in: typeList } });
    }
  }
  if (visa_support === "true") {
    and.push({ visaSupport: true });
  }
  if (remote === "true") {
    and.push({ remoteAllowed: true });
  }
  if (salary_min) {
    const min = parseFloat(salary_min);
    if (!isNaN(min)) and.push({ salaryMax: { gte: min } });
  }
  if (salary_max) {
    const max = parseFloat(salary_max);
    if (!isNaN(max)) and.push({ salaryMin: { lte: max } });
  }
  if (skills) {
    const skillList = skills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (skillList.length > 0) {
      and.push({ requiredSkills: { hasSome: skillList } });
    }
  }
  if (search) {
    and.push({
      OR: [
        { title:       { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { companyName: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

// ── GET /api/public/jobs ───────────────────────────────────────────────────────

export async function getPublicJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const cacheKey = `jobs:list:${req.originalUrl}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const query = req.query as Record<string, string>;
    const where = buildWhere(query);
    const orderBy = getOrderBy(query.sort);

    const [rows, total] = await Promise.all([
      prisma.jobPost.findMany({
        where: where as Prisma.JobPostWhereInput,
        skip,
        take: limit,
        orderBy,
        select: JOB_LIST_SELECT,
      }),
      prisma.jobPost.count({
        where: where as Prisma.JobPostWhereInput,
      }),
    ]);

    // External jobs are opt-in via includeExternal=true — ONLY the public
    // jobs list page passes this. This same getPublicJobs handler is also
    // called by frontend/src/lib/jobs-ssr.ts::getAllPublicJobIdsServer to
    // build sitemap.ts, which never sends includeExternal, so external jobs
    // structurally can never end up in the sitemap or get an SEO page —
    // their canonical home is the external site, not ours.
    let data: unknown[] = rows.map((r) => ({ ...r, source: "jobpost" as const }));
    if (query.includeExternal === "true" && page === 1) {
      const external = await getActiveExternalJobsForFeed({
        country: query.country,
        search:  query.search,
      });
      data = [...data, ...external];
    }

    const payload = {
      success:    true,
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
    cacheSet(cacheKey, payload);
    return res.json(payload);
  } catch (e) { next(e); }
}

// ── GET /api/public/jobs/categories ───────────────────────────────────────────

export async function getJobCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const cacheKey = "jobs:categories";
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const rows = await prisma.jobPost.findMany({
      where: { status: "APPROVED" } as Prisma.JobPostWhereInput,
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    });

    const categories = rows
      .map((r) => r.category.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const payload = { success: true, data: categories };
    cacheSet(cacheKey, payload);
    return res.json(payload);
  } catch (e) { next(e); }
}

// ── GET /api/public/jobs/countries ────────────────────────────────────────────

export async function getJobCountries(req: Request, res: Response, next: NextFunction) {
  try {
    const cacheKey = "jobs:countries";
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const rows = await prisma.jobPost.findMany({
      where: { status: "APPROVED" } as Prisma.JobPostWhereInput,
      select: { country: true },
    });

    const countMap = new Map<string, number>();
    for (const r of rows) {
      const key = r.country?.trim();
      if (key) countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }

    const countries = Array.from(countMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));

    const payload = { success: true, data: countries };
    cacheSet(cacheKey, payload);
    return res.json(payload);
  } catch (e) { next(e); }
}

// ── GET /api/public/jobs/:id ──────────────────────────────────────────────────

export async function getPublicJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    // Guard: job must exist and be APPROVED before we touch view_count
    const guard = await prisma.jobPost.findFirst({
      where: { id, status: "APPROVED" } as Prisma.JobPostWhereInput,
      select: { id: true },
    });
    if (!guard) return err(res, "Job not found", 404);

    // Atomically increment view_count and return full detail (no sensitive fields)
    const job = await prisma.jobPost.update({
      where: { id },
      data:  { viewCount: { increment: 1 } },
      select: JOB_DETAIL_SELECT,
    });

    return ok(res, job);
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") return err(res, "Job not found", 404);
    next(e);
  }
}
