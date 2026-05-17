// backend/src/jobs/jobs.controller.ts
// GET /api/worker/jobs — personalised, scored job feed for authenticated workers.
//
// Match score formula (sum of weighted sub-scores, clamped to [0, 100]):
//   S_skill  30% — cosine similarity between worker and job skill vectors
//   S_exp    20% — Gaussian decay around job's required years of experience
//   S_sal    15% — salary range overlap with worker's expected salary
//   S_loc    15% — binary: 100 if job country is in worker's target countries
//   S_trust  15% — worker.trustScore (already 0–100)
//   S_dem     5% — demand signal (placeholder: 50 until live data wired)
//
// Caching: Redis key "jobs:{workerId}:p{page}", TTL 5 minutes.
// Invalidate by calling invalidateJobsCache(workerId) on profile/job updates.

import { Request, Response, NextFunction } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import { redis } from "../lib/redis";
import { getSkillIndex, cosineSimilarity } from "../matching/skill-vector.service";
import { computeFee } from "./pricing.service";
import { enqueue } from "../services/queue";

const CACHE_TTL_SECS = 5 * 60; // 5 minutes
const INVALIDATE_PAGES = 10;   // pages cleared on cache invalidation

// ── Cache helpers ─────────────────────────────────────────────────────────────

function cacheKey(workerId: string, page: number): string {
  return `jobs:${workerId}:p${page}`;
}

/** Call this whenever a worker profile or any job post is updated. */
export async function invalidateJobsCache(workerId: string): Promise<void> {
  const deletes: Promise<number>[] = [];
  for (let p = 1; p <= INVALIDATE_PAGES; p++) {
    deletes.push(redis.del(cacheKey(workerId, p)));
  }
  await Promise.allSettled(deletes);
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

function encodeVector(skillIds: string[], index: Map<string, number>): number[] {
  const vec = new Array<number>(index.size).fill(0);
  for (const id of skillIds) {
    const pos = index.get(id);
    if (pos !== undefined) vec[pos] = 1;
  }
  return vec;
}

function parseYears(raw: string | null | undefined): number | null {
  if (!raw) return null;
  // Handles "3", "5+", "3-5", "10 years", etc. — take the first number found
  const m = raw.match(/\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function scoreExp(workerYears: number | null, jobYears: number): number {
  if (workerYears === null) return 50; // neutral when unknown
  // Gaussian σ = 4 years; full score if worker meets or slightly exceeds requirement
  const diff  = workerYears - jobYears;
  const score = 100 * Math.exp(-(diff * diff) / 32); // σ²=16, 2σ²=32
  return Math.min(100, Math.max(0, Math.round(score)));
}

function scoreSalary(
  expected: string | null | undefined,
  jobMin: number,
  jobMax: number,
): number {
  if (!expected) return 50;
  const val = parseFloat(expected.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(val) || val <= 0) return 50;

  if (val >= jobMin && val <= jobMax) return 100;

  if (val < jobMin) {
    // Worker accepts less than range — likely fine, slight penalty only
    return Math.min(100, Math.max(0, Math.round((val / jobMin) * 90)));
  }

  // Worker expects more than range — employer may not afford them
  return Math.min(100, Math.max(0, Math.round((jobMax / val) * 60)));
}

// ── Controller ────────────────────────────────────────────────────────────────

export async function getWorkerJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const query    = req.query as Record<string, string>;

    const page     = Math.max(1, parseInt(query.page  ?? "1",  10));
    const limit    = Math.min(50, Math.max(1, parseInt(query.limit ?? "20", 10)));
    const skip     = (page - 1) * limit;
    const { country, category } = query;

    // ── 1. Redis cache check ────────────────────────────────────────────────
    // Key is scoped to worker + page; country/category filters bypass cache
    // (filtered requests are less frequent and correctness matters more there).
    const useCache = !country && !category;
    if (useCache) {
      const hit = await redis.get(cacheKey(workerId, page));
      if (hit) return res.json(JSON.parse(hit));
    }

    // ── 2. Fetch worker context ─────────────────────────────────────────────
    const workerProfile = await prisma.workerProfile.findUnique({
      where:  { userId: workerId },
      select: {
        trustScore:      true,
        yearsExperience: true,
        expectedSalary:  true,
        skills: {
          select: { skill_id: true },
          where:  { skill_id: { not: null } },
        },
        targetCountries: { select: { country: true } },
      },
    });

    const workerSkillIds  = (workerProfile?.skills ?? [])
      .map(s => s.skill_id)
      .filter((id): id is string => !!id);

    const targetCountrySet = new Set(
      (workerProfile?.targetCountries ?? []).map(tc => tc.country.toLowerCase()),
    );
    const trustScore    = Math.min(100, Math.max(0, workerProfile?.trustScore ?? 0));
    const workerYears   = parseYears(workerProfile?.yearsExperience);
    const expectedSal   = workerProfile?.expectedSalary ?? null;

    // ── 3. Exclude already-applied jobs ────────────────────────────────────
    const applied = await prisma.application.findMany({
      where:  { workerId },
      select: { jobId: true },
    });
    const appliedIds = applied.map(a => a.jobId);

    // ── 4. Fetch approved jobs (all at once — scoring requires full set) ────
    const where: Prisma.JobPostWhereInput = {
      status: "APPROVED",
      ...(appliedIds.length > 0 && { id: { notIn: appliedIds } }),
      ...(country  && { country:  { contains: country,  mode: "insensitive" } }),
      ...(category && { category: { contains: category, mode: "insensitive" } }),
    };

    const jobs = await prisma.jobPost.findMany({
      where,
      select: {
        id:                 true,
        title:              true,
        companyName:        true,
        country:            true,
        city:               true,
        salaryMin:          true,
        salaryMax:          true,
        salaryCurrency:     true,
        experienceRequired: true,
        category:           true,
        requiredSkills:     true,
        visaSupport:        true,
        applicationCount:   true,
        createdAt:          true,
        requiredSkillTags: { select: { skill_id: true } },
      },
    });

    // ── 5. Build skill vectors (skill index fetched once, Redis-cached 6 h) ─
    const skillIndex = await getSkillIndex();
    const workerVec  = encodeVector(workerSkillIds, skillIndex);

    // ── 6. Score every job ──────────────────────────────────────────────────
    const baseFeeUsd = (await computeFee({ country: "", salaryMin: 0, salaryMax: 0 }, workerProfile));

    const scored = jobs.map((job) => {
      const jobSkillIds = job.requiredSkillTags.map(t => t.skill_id);
      const jobVec      = encodeVector(jobSkillIds, skillIndex);

      // S_skill (30%) — cosine similarity in skill space
      const sSkill = Math.min(100, Math.max(0,
        Math.round(cosineSimilarity(workerVec, jobVec) * 100),
      ));

      // S_exp (20%) — Gaussian around required experience
      const sExp = scoreExp(workerYears, job.experienceRequired);

      // S_sal (15%) — salary range overlap
      const sSal = scoreSalary(expectedSal, Number(job.salaryMin), Number(job.salaryMax));

      // S_loc (15%) — binary: worker targets this country
      const sLoc = targetCountrySet.has(job.country.toLowerCase()) ? 100 : 0;

      // S_trust (15%) — worker trust score
      const sTrust = trustScore;

      // S_dem (5%) — demand signal placeholder
      const sDem = 50;

      const matchScore = Math.min(100, Math.max(0, Math.round(
        0.30 * sSkill +
        0.20 * sExp   +
        0.15 * sSal   +
        0.15 * sLoc   +
        0.15 * sTrust +
        0.05 * sDem,
      )));

      return {
        id:                  job.id,
        title:               job.title,
        company:             job.companyName,
        country:             job.country,
        city:                job.city,
        salary_min:          Number(job.salaryMin),
        salary_max:          Number(job.salaryMax),
        currency:            job.salaryCurrency,
        skills:              job.requiredSkills,
        visa_type:           job.visaSupport ? "sponsored" : "self",
        posted_at:           job.createdAt,
        applicant_count:     job.applicationCount,
        match_score:         matchScore,
        application_fee_usd: baseFeeUsd,
      };
    });

    // ── 7. Sort by match_score DESC ─────────────────────────────────────────
    scored.sort((a, b) => b.match_score - a.match_score);

    // ── 8. Paginate ─────────────────────────────────────────────────────────
    const total      = scored.length;
    const pageItems  = scored.slice(skip, skip + limit);
    const payload    = { jobs: pageItems, total, page };

    // ── 9. Cache unfiltered results only ────────────────────────────────────
    if (useCache) {
      redis.set(cacheKey(workerId, page), JSON.stringify(payload), "EX", CACHE_TTL_SECS)
        .catch(() => {}); // non-fatal
    }

    return res.json(payload);
  } catch (e) { next(e); }
}

// ═════════════════════════════════════════════════════════════════════════════
// EMPLOYER JOB MANAGEMENT
// Routes: GET/POST/PATCH/DELETE /api/employer/jobs
// All require: JWT Bearer + employer role + active subscription.
// Subscription is enforced via requireSubscription middleware in employer.routes.
//
// Client status vocabulary vs DB enum:
//   'active'  ↔  APPROVED
//   'paused'  ↔  ARCHIVED + archivedAt = null    (temporarily hidden)
//   'closed'  ↔  ARCHIVED + archivedAt = Date()  (permanently closed)
// ═════════════════════════════════════════════════════════════════════════════

// ── Subscription check (inline guard for employer endpoints) ──────────────────

async function assertSubscription(employerId: string, res: Response): Promise<boolean> {
  const ep = await prisma.employerProfile.findUnique({
    where:  { userId: employerId },
    select: { subscriptionStatus: true },
  });
  if (ep?.subscriptionStatus === "ACTIVE") return true;
  err(res, "Active subscription required", 403);
  return false;
}

// ── Status helpers ─────────────────────────────────────────────────────────────

type ClientStatus = "active" | "paused" | "closed";

function toClientStatus(status: string, archivedAt: Date | null): ClientStatus {
  if (status === "APPROVED") return "active";
  if (status === "ARCHIVED") return archivedAt ? "closed" : "paused";
  return "closed"; // DRAFT / PENDING_MODERATION / REJECTED treated as closed for employer API
}

function mapExperienceLevel(years: number): string {
  if (years <= 1) return "entry";
  if (years <= 4) return "mid";
  if (years <= 8) return "senior";
  return "lead";
}

function experienceLevelToYears(level: string): number {
  if (level === "entry") return 0;
  if (level === "mid")   return 2;
  if (level === "senior") return 5;
  return 10; // lead
}

// ── Shared response builder ───────────────────────────────────────────────────

type JobRow = {
  id:                 string;
  title:              string;
  description:        string;
  country:            string;
  city:               string;
  salaryMin:          { toNumber: () => number } | number | string;
  salaryMax:          { toNumber: () => number } | number | string;
  salaryCurrency:     string;
  experienceRequired: number;
  visaSupport:        boolean;
  status:             string;
  archivedAt:         Date | null;
  createdAt:          Date;
  applicationCount:   number;
  requiredSkillTags:  { skill_id: string; skill: { name: string } | null }[];
};

type AppCounts = { total: number; shortlisted: number; interview: number; hired: number };

function buildJobPayload(job: JobRow, counts?: AppCounts) {
  const toNum = (v: { toNumber: () => number } | number | string) =>
    typeof v === "object" && "toNumber" in v ? v.toNumber() : Number(v);

  return {
    id:                job.id,
    title:             job.title,
    description:       job.description,
    country:           job.country,
    salary_min:        toNum(job.salaryMin),
    salary_max:        toNum(job.salaryMax),
    currency:          job.salaryCurrency,
    experience_level:  mapExperienceLevel(job.experienceRequired),
    visa_type:         job.visaSupport ? "sponsored" : "self",
    status:            toClientStatus(job.status, job.archivedAt),
    created_at:        job.createdAt,
    applicant_count:   counts?.total       ?? job.applicationCount,
    shortlisted_count: counts?.shortlisted ?? 0,
    interview_count:   counts?.interview   ?? 0,
    hired_count:       counts?.hired       ?? 0,
    skills:            job.requiredSkillTags.map(t => ({
      skill_id:   t.skill_id,
      skill_name: t.skill?.name ?? "",
    })),
  };
}

// Shared Prisma select for employer job queries
const EMPLOYER_JOB_SELECT = {
  id:                 true,
  title:              true,
  description:        true,
  country:            true,
  city:               true,
  salaryMin:          true,
  salaryMax:          true,
  salaryCurrency:     true,
  experienceRequired: true,
  visaSupport:        true,
  status:             true,
  archivedAt:         true,
  createdAt:          true,
  applicationCount:   true,
  requiredSkillTags:  { select: { skill_id: true, skill: { select: { name: true } } } },
} as const;

// Batch-fetch per-status application counts for a list of job IDs
async function fetchAppCounts(jobIds: string[]): Promise<Map<string, AppCounts>> {
  if (jobIds.length === 0) return new Map();

  const rows = await prisma.application.groupBy({
    by:     ["jobId", "status"],
    where:  { jobId: { in: jobIds } },
    _count: { _all: true },
  });

  const map = new Map<string, AppCounts>();
  for (const id of jobIds) map.set(id, { total: 0, shortlisted: 0, interview: 0, hired: 0 });

  for (const row of rows) {
    const c = map.get(row.jobId)!;
    const n = row._count._all;
    c.total += n;
    if (row.status === "SHORTLISTED")  c.shortlisted += n;
    if (row.status === "INTERVIEWED")  c.interview   += n;
    if (row.status === "ACCEPTED")     c.hired       += n;
  }

  return map;
}

// ── Validation schemas ────────────────────────────────────────────────────────

const EXP_LEVELS = ["entry", "mid", "senior", "lead"] as const;

const CreateJobSchema = z.object({
  title:               z.string().min(5).max(120),
  description:         z.string().min(50, "Description must be at least 50 characters"),
  country:             z.string().min(2).max(100),
  salary_min:          z.number().positive(),
  salary_max:          z.number().positive(),
  currency:            z.string().min(1).max(10).default("USD"),
  experience_level:    z.enum(EXP_LEVELS),
  visa_type:           z.string().min(1).max(50).optional(),
  required_skill_ids:  z.array(z.string().min(1)).min(1).max(30),
}).refine(d => d.salary_max >= d.salary_min, {
  message: "salary_max must be >= salary_min",
  path: ["salary_max"],
});

const PatchJobSchema = z.object({
  title:               z.string().min(5).max(120).optional(),
  description:         z.string().min(50).optional(),
  salary_min:          z.number().positive().optional(),
  salary_max:          z.number().positive().optional(),
  experience_level:    z.enum(EXP_LEVELS).optional(),
  visa_type:           z.string().min(1).max(50).optional(),
  required_skill_ids:  z.array(z.string().min(1)).min(1).max(30).optional(),
  country:             z.string().optional(), // accepted but rejected below
});

const PatchStatusSchema = z.object({
  status: z.enum(["active", "paused", "closed"]),
});

// ── GET /api/employer/jobs ────────────────────────────────────────────────────

export async function getEmployerJobList(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    if (!await assertSubscription(employerId, res)) return;

    const jobs = await prisma.jobPost.findMany({
      where:   { employerId, status: { in: ["APPROVED", "ARCHIVED"] } },
      orderBy: { createdAt: "desc" },
      select:  EMPLOYER_JOB_SELECT,
    });

    const jobIds    = jobs.map(j => j.id);
    const countMap  = await fetchAppCounts(jobIds);

    const mapped = jobs.map(j => buildJobPayload(j as JobRow, countMap.get(j.id)));

    // Summary
    const summary = {
      active:           mapped.filter(j => j.status === "active").length,
      paused:           mapped.filter(j => j.status === "paused").length,
      closed:           mapped.filter(j => j.status === "closed").length,
      total_applicants: mapped.reduce((s, j) => s + j.applicant_count, 0),
    };

    return ok(res, { jobs: mapped, summary });
  } catch (e) { next(e); }
}

// ── POST /api/employer/jobs ───────────────────────────────────────────────────

export async function createEmployerJob(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    if (!await assertSubscription(employerId, res)) return;

    const input = CreateJobSchema.parse(req.body);

    // Fetch employer company name for the job record
    const profile = await prisma.employerProfile.findUnique({
      where:  { userId: employerId },
      select: { companyName: true },
    });

    const job = await prisma.$transaction(async tx => {
      const newJob = await tx.jobPost.create({
        data: {
          employerId,
          title:              input.title,
          companyName:        profile?.companyName ?? "",
          description:        input.description,
          requirements:       input.description, // re-use description as requirements (new flow)
          country:            input.country,
          city:               "",
          salaryMin:          input.salary_min,
          salaryMax:          input.salary_max,
          salaryCurrency:     input.currency,
          contractType:       "FULL_TIME",
          experienceRequired: experienceLevelToYears(input.experience_level),
          category:           "General",
          requiredSkills:     [],
          visaSupport:        input.visa_type === "sponsored",
          status:             "APPROVED",
        },
        select: EMPLOYER_JOB_SELECT,
      });

      if (input.required_skill_ids.length > 0) {
        await tx.jobRequiredSkill.createMany({
          data: input.required_skill_ids.map(sid => ({
            job_id:   newJob.id,
            skill_id: sid,
          })),
          skipDuplicates: true,
        });
      }

      return newJob;
    });

    // Re-fetch with skill names populated
    const full = await prisma.jobPost.findUniqueOrThrow({
      where:  { id: job.id },
      select: EMPLOYER_JOB_SELECT,
    });

    // Enqueue match-score calculation for this job against all workers
    enqueue("scoring.calculateMatchScores", { jobPostId: job.id }).catch(console.error);

    return ok(res, buildJobPayload(full as JobRow), "Job created", 201);
  } catch (e) { next(e); }
}

// ── PATCH /api/employer/jobs/:id ──────────────────────────────────────────────

export async function patchEmployerJob(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    if (!await assertSubscription(employerId, res)) return;

    const job = await prisma.jobPost.findUnique({
      where:  { id: req.params.id },
      select: { id: true, employerId: true, status: true, archivedAt: true },
    });
    if (!job)                          return err(res, "Job not found", 404);
    if (job.employerId !== employerId) return err(res, "Forbidden", 403);

    const input = PatchJobSchema.parse(req.body);

    // Country change guard
    if ("country" in req.body) {
      return err(res, "Country cannot be changed after posting", 400);
    }

    const skillsChanged = input.required_skill_ids !== undefined;

    await prisma.$transaction(async tx => {
      await tx.jobPost.update({
        where: { id: job.id },
        data: {
          ...(input.title            !== undefined && { title:              input.title }),
          ...(input.description      !== undefined && { description:        input.description, requirements: input.description }),
          ...(input.salary_min       !== undefined && { salaryMin:          input.salary_min }),
          ...(input.salary_max       !== undefined && { salaryMax:          input.salary_max }),
          ...(input.experience_level !== undefined && { experienceRequired: experienceLevelToYears(input.experience_level) }),
          ...(input.visa_type        !== undefined && { visaSupport:        input.visa_type === "sponsored" }),
        },
      });

      if (skillsChanged && input.required_skill_ids) {
        await tx.jobRequiredSkill.deleteMany({ where: { job_id: job.id } });
        await tx.jobRequiredSkill.createMany({
          data: input.required_skill_ids.map(sid => ({
            job_id:   job.id,
            skill_id: sid,
          })),
          skipDuplicates: true,
        });
      }
    });

    if (skillsChanged) {
      enqueue("scoring.calculateMatchScores", { jobPostId: job.id }).catch(console.error);
    }

    const updated = await prisma.jobPost.findUniqueOrThrow({
      where:  { id: job.id },
      select: EMPLOYER_JOB_SELECT,
    });

    return ok(res, buildJobPayload(updated as JobRow));
  } catch (e) { next(e); }
}

// ── PATCH /api/employer/jobs/:id/status ──────────────────────────────────────

export async function patchEmployerJobStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    if (!await assertSubscription(employerId, res)) return;

    const job = await prisma.jobPost.findUnique({
      where:  { id: req.params.id },
      select: { id: true, employerId: true, status: true, archivedAt: true },
    });
    if (!job)                          return err(res, "Job not found", 404);
    if (job.employerId !== employerId) return err(res, "Forbidden", 403);

    const { status: newStatus } = PatchStatusSchema.parse(req.body);

    const currentClientStatus = toClientStatus(job.status, job.archivedAt);

    // Cannot reopen a closed job
    if (newStatus === "active" && currentClientStatus === "closed") {
      return err(res, "Closed jobs cannot be reopened", 400);
    }

    let dbUpdate: Prisma.JobPostUpdateInput;

    if (newStatus === "active") {
      dbUpdate = { status: "APPROVED" };
    } else if (newStatus === "paused") {
      dbUpdate = { status: "ARCHIVED", archivedAt: null };
    } else {
      // closed — also reject all pending/shortlisted applications inline
      dbUpdate = { status: "ARCHIVED", archivedAt: new Date() };
    }

    await prisma.jobPost.update({ where: { id: job.id }, data: dbUpdate });

    if (newStatus === "closed") {
      await prisma.application.updateMany({
        where: {
          jobId:  job.id,
          status: { in: ["APPLIED", "VIEWED", "SHORTLISTED"] },
        },
        data: {
          status:     "REJECTED",
          rejectedAt: new Date(),
        },
      });
    }

    const updated = await prisma.jobPost.findUniqueOrThrow({
      where:  { id: job.id },
      select: EMPLOYER_JOB_SELECT,
    });

    return ok(res, buildJobPayload(updated as JobRow));
  } catch (e) { next(e); }
}

// ── DELETE /api/employer/jobs/:id ─────────────────────────────────────────────

export async function deleteEmployerJob(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    if (!await assertSubscription(employerId, res)) return;

    const job = await prisma.jobPost.findUnique({
      where:  { id: req.params.id },
      select: { id: true, employerId: true, status: true, archivedAt: true, applicationCount: true },
    });
    if (!job)                          return err(res, "Job not found", 404);
    if (job.employerId !== employerId) return err(res, "Forbidden", 403);

    const clientStatus = toClientStatus(job.status, job.archivedAt);

    if (clientStatus !== "paused") {
      return err(res, "Cannot delete an active job — pause it first", 400);
    }
    if (job.applicationCount > 0) {
      return err(res, "Cannot delete a job with existing applicants", 400);
    }

    // Cascade delete handles job_required_skills via FK onDelete: Cascade
    await prisma.jobPost.delete({ where: { id: job.id } });

    return ok(res, null, "Job deleted");
  } catch (e) { next(e); }
}
