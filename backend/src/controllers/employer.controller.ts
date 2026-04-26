// backend/src/controllers/employer.controller.ts
import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";

// Job CRUD is handled by employer-jobs.controller.ts

// GET /api/employer/workers  (replaces /candidates — shows all role=WORKER accounts)
export async function getCandidates(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { search, country, available_only } = req.query as Record<string, string>;

    const ep = await prisma.employerProfile.findUnique({ where: { userId } });
    if (!ep) return err(res, "Employer profile not found", 404);

    // Base: every user with the WORKER role (regardless of isSearchable or accountStatus)
    const where: Prisma.UserWhereInput = { role: "WORKER" };

    if (available_only === "true") where.isLocked = false;

    // Country filter: only applies when a workerProfile exists with that country
    if (country) {
      where.workerProfile = {
        countryOfResidence: { contains: country, mode: "insensitive" },
      };
    }

    // Search across profile fields + email fallback
    if (search) {
      where.OR = [
        { workerProfile: { firstName:  { contains: search, mode: "insensitive" } } },
        { workerProfile: { lastName:   { contains: search, mode: "insensitive" } } },
        { workerProfile: { profession: { contains: search, mode: "insensitive" } } },
        { workerProfile: { skills: { some: { skill: { contains: search, mode: "insensitive" } } } } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: "desc" }],
        select: {
          id:            true,
          email:         true,
          isLocked:      true,
          accountStatus: true,
          workerProfile: {
            select: {
              firstName:          true,
              lastName:           true,
              profession:         true,
              countryOfResidence: true,
              yearsExperience:    true,
              profileScore:       true,
              trustScore:         true,
              skills:             { select: { skill: true } },
              languages:          { select: { language: true, proficiencyLevel: true } },
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    // Build employer skill set for AI match scoring
    const empSkills = await prisma.employerRequiredSkill.findMany({
      where: { employerProfileId: ep.id },
    });
    const empSkillSet = new Set(empSkills.map(s => s.skill.toLowerCase()));

    const enriched = rows.map(u => {
      const p         = u.workerProfile;
      const skills    = p?.skills ?? [];
      const languages = p?.languages ?? [];
      const cSkills   = skills.map((s: { skill: string }) => s.skill.toLowerCase());
      const matched   = cSkills.filter((s: string) => empSkillSet.has(s)).length;
      const aiMatchScore = empSkillSet.size > 0
        ? Math.round((matched / empSkillSet.size) * 100)
        : undefined;

      return {
        userId:             u.id,
        name:               p ? ([p.firstName, p.lastName].filter(Boolean).join(" ") || u.email) : u.email,
        profession:         p?.profession         ?? null,
        countryOfResidence: p?.countryOfResidence ?? null,
        yearsExperience:    p?.yearsExperience    ?? null,
        profileScore:       p?.profileScore       ?? null,
        trustScore:         p?.trustScore         ?? null,
        account_status:     u.accountStatus,
        is_locked:          u.isLocked,
        has_profile:        p !== null,
        skills,
        languages,
        aiMatchScore,
      };
    });

    return paginated(res, enriched, total, page, limit);
  } catch (e) { next(e); }
}

// Lock endpoints moved to worker-lock.controller.ts

// GET /api/employer/billing
export async function getBilling(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const ep = await prisma.employerProfile.findUnique({ where: { userId } });
    if (!ep) return ok(res, { currentPlan: null, status: null, invoices: [] });

    return ok(res, {
      currentPlan:  ep.subscriptionPlan,
      status:       ep.subscriptionStatus,
      trialEndsAt:  ep.trialEndsAt,
      invoices:     [],
    });
  } catch (e) { next(e); }
}

// ── GET /api/employer/workers/:workerId ───────────────────────────────────────

export async function getWorkerDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { workerId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: workerId },
      select: {
        id:            true,
        email:         true,
        phone:         true,
        createdAt:     true,
        lockCount:     true,
        accountStatus: true,
        workerProfile: {
          select: {
            firstName:          true,
            lastName:           true,
            nationality:        true,
            profession:         true,
            countryOfResidence: true,
            city:               true,
            yearsExperience:    true,
            expectedSalary:     true,
            additionalNotes:    true,
            availabilityDate:   true,
            maritalStatus:      true,
            numberOfChildren:   true,
            profileScore:       true,
            trustScore:         true,
            skills:             { select: { skill: true } },
            languages:          { select: { language: true, proficiencyLevel: true } },
            targetCountries:    { select: { country: true } },
          },
        },
        verificationRecord: {
          select: { reviewStatus: true },
        },
        uploads: {
          where:   { deletedAt: null, reviewStatus: "APPROVED" },
          select:  { id: true, fileType: true, fileName: true, fileUrl: true, uploadedAt: true },
          orderBy: { uploadedAt: "desc" },
        },
      },
    });

    if (!user || !user.workerProfile) return err(res, "Worker not found", 404);

    const p = user.workerProfile;
    return ok(res, {
      id:                user.id,
      email:             user.email,
      phone:             user.phone ?? null,
      created_at:        user.createdAt,
      lock_count:        user.lockCount,
      account_status:    user.accountStatus,
      verification_status: user.verificationRecord?.reviewStatus ?? null,
      first_name:        p.firstName,
      last_name:         p.lastName,
      nationality:       p.nationality ?? null,
      profession:        p.profession,
      country:           p.countryOfResidence,
      city:              p.city,
      years_experience:  p.yearsExperience,
      expected_salary:   p.expectedSalary,
      bio:               p.additionalNotes,
      availability_date: p.availabilityDate ?? null,
      marital_status:    p.maritalStatus ?? null,
      number_of_children: p.numberOfChildren,
      profile_score:     p.profileScore ?? null,
      trust_score:       p.trustScore ?? null,
      skills:            p.skills,
      languages:         p.languages,
      target_countries:  p.targetCountries,
      documents:         user.uploads.map(u => ({
        id:          u.id,
        file_type:   u.fileType,
        file_name:   u.fileName,
        file_url:    u.fileUrl,
        uploaded_at: u.uploadedAt,
      })),
    });
  } catch (e) { next(e); }
}

// ── GET /api/employer/workers/:workerId/applications ──────────────────────────

export async function getWorkerApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { workerId } = req.params;

    const apps = await prisma.application.findMany({
      where:   { workerId, employerId },
      orderBy: { createdAt: "desc" },
      select: {
        id:        true,
        status:    true,
        createdAt: true,
        job: { select: { id: true, title: true } },
      },
    });

    return ok(res, apps.map(a => ({
      id:        a.id,
      status:    a.status,
      applied_at: a.createdAt,
      job_id:    a.job.id,
      job_title: a.job.title,
    })));
  } catch (e) { next(e); }
}

// Application management has been moved to employer-applications.controller.ts
