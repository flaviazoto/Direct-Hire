// backend/src/controllers/onboarding.controller.ts
import { Request, Response, NextFunction } from "express";
import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import { encrypt } from "../lib/encrypt";
import { enqueue } from "../services/queue";
import { z } from "zod";
import { insertAuditLog } from "../lib/audit";

const SaveStepSchema = z.object({
  step:       z.number().int().min(0),
  data:       z.record(z.unknown()),
  isLastStep: z.boolean().optional(),
});

const WORKER_REQUIRED_UPLOADS = {
  profilePhoto: "PROFILE_PHOTO",
  workVideo: "WORK_VIDEO",
  introVideo: "INTRO_VIDEO",
} as const;

const EMPLOYER_REQUIRED_UPLOADS = {
  businessDocument: "BUSINESS_DOCUMENT",
} as const;

// ── getProgress ───────────────────────────────────────────────
export async function getProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;

    const progress = await prisma.onboardingProgress.findUnique({ where: { userId } });
    if (!progress) return err(res, "Onboarding record not found", 404);

    const uploads = await prisma.upload.findMany({
      where:  { userId, status: "UPLOADED" },
      select: { id: true, fileType: true, fileName: true, fileUrl: true, sizeBytes: true, uploadedAt: true },
    });

    const completionPct = Math.round(
      (progress.completedSteps.length / progress.totalSteps) * 100
    );

    return ok(res, {
      currentStep:      progress.currentStep,
      completedSteps:   progress.completedSteps,
      draftData:        progress.draftData,
      isSubmitted:      progress.isSubmitted,
      onboardingStatus: progress.onboardingStatus,
      totalSteps:       progress.totalSteps,
      completionPct,
      lastSavedAt:      progress.lastSavedAt,
      uploads,
    });
  } catch (e) { next(e); }
}

// ── saveStep ──────────────────────────────────────────────────
export async function saveStep(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const role   = req.user!.role;
    const input  = SaveStepSchema.parse(req.body);

    const progress = await prisma.onboardingProgress.findUnique({ where: { userId } });
    if (!progress)          return err(res, "Onboarding record not found", 404);
    if (progress.isSubmitted) return err(res, "Onboarding already submitted", 400);

    // Merge step data into draft
    const existing      = (progress.draftData as Record<string, unknown>) ?? {};
    const merged        = { ...existing, [`step_${input.step}`]: input.data, ...input.data };
    const completedSteps = Array.from(new Set([...progress.completedSteps, input.step])).sort((a, b) => a - b);
    const nextStep       = Math.max(progress.currentStep, input.step + 1);

    // Persist to profile tables
    if (role === "WORKER") {
      await persistWorkerStep(userId, input.step, input.data as Record<string, unknown>);
    } else if (role === "EMPLOYER") {
      await persistEmployerStep(userId, input.step, input.data as Record<string, unknown>);
    }

    const updated = await prisma.onboardingProgress.update({
      where: { userId },
      data: {
        currentStep:      nextStep,
        completedSteps,
        draftData:        merged as Prisma.InputJsonValue,
        lastSavedAt:      new Date(),
        onboardingStatus: completedSteps.length > 0 ? "IN_PROGRESS" : "DRAFT",
      },
    });

    return ok(res, {
      currentStep:    updated.currentStep,
      completedSteps: updated.completedSteps,
      lastSavedAt:    updated.lastSavedAt,
      completionPct:  Math.round((completedSteps.length / progress.totalSteps) * 100),
    });
  } catch (e) { next(e); }
}

// ── submit ────────────────────────────────────────────────────
export async function submit(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const role   = req.user!.role;

    const progress = await prisma.onboardingProgress.findUnique({ where: { userId } });
    if (!progress)            return err(res, "Onboarding record not found", 404);
    if (progress.isSubmitted) return err(res, "Already submitted", 400);

    const minSteps = role === "WORKER" ? 5 : 4;
    if (progress.completedSteps.length < minSteps) {
      return err(res, `Complete at least ${minSteps} steps before submitting`, 400);
    }

    // Enforce required verification uploads before submission
    const uploaded = await prisma.upload.findMany({
      where: { userId, status: "UPLOADED", deletedAt: null },
      select: { fileType: true },
    });
    const uploadedTypes = new Set(uploaded.map((u) => u.fileType));

    if (role === "WORKER") {
      const hasProfilePhoto = uploadedTypes.has(WORKER_REQUIRED_UPLOADS.profilePhoto);
      const hasAnyVideo =
        uploadedTypes.has(WORKER_REQUIRED_UPLOADS.workVideo) ||
        uploadedTypes.has(WORKER_REQUIRED_UPLOADS.introVideo);

      if (!hasProfilePhoto || !hasAnyVideo) {
        return err(
          res,
          "Worker submission requires a profile photo and at least one video document.",
          400
        );
      }
    }

    if (role === "EMPLOYER") {
      const hasBusinessDocument = uploadedTypes.has(EMPLOYER_REQUIRED_UPLOADS.businessDocument);
      if (!hasBusinessDocument) {
        return err(res, "Employer submission requires a business document upload.", 400);
      }
    }

    // Get display name
    const user = await prisma.user.findUnique({ where: { id: userId } });
    let displayName = user?.email ?? userId;
    if (role === "WORKER") {
      const wp = await prisma.workerProfile.findUnique({ where: { userId } });
      displayName = [wp?.firstName, wp?.lastName].filter(Boolean).join(" ") || displayName;
    } else {
      const ep = await prisma.employerProfile.findUnique({ where: { userId } });
      displayName = ep?.companyName ?? displayName;
    }

    await prisma.$transaction([
      prisma.onboardingProgress.update({
        where: { userId },
        data: { isSubmitted: true, submittedAt: new Date(), onboardingStatus: "SUBMITTED" },
      }),
      prisma.user.update({ where: { id: userId }, data: { status: "PENDING_VERIFICATION" } }),
      prisma.verificationRecord.update({ where: { userId }, data: { reviewStatus: "PENDING" } }),
    ]);

    await insertAuditLog({ actorId: userId, targetId: userId, action: "ONBOARDING_SUBMITTED", entity: "OnboardingProgress", entityId: progress.id });

    await enqueue("email.onboardingSubmitted", {
      userId, to: user!.email, name: displayName, role: role as "WORKER" | "EMPLOYER",
    });
    await enqueue("email.adminNewSubmission", {
      submitterEmail: user!.email, submitterRole: role, submitterName: displayName,
    });

    return ok(res, {
      status: "SUBMITTED",
      redirectTo: `/${role.toLowerCase()}/dashboard`,
    }, "Application submitted! We will review it within 24–48 hours.");
  } catch (e) { next(e); }
}

// ── Worker step persisters ────────────────────────────────────
async function persistWorkerStep(userId: string, step: number, data: Record<string, unknown>) {
  switch (step) {
    case 1: {
      const passportNumber = data.passportNumber
        ? await encrypt(data.passportNumber as string)
        : undefined;
      await prisma.workerProfile.upsert({
        where: { userId },
        update: {
          firstName:          data.firstName as string,
          lastName:           data.lastName  as string,
          dateOfBirth:        data.dateOfBirth ? new Date(data.dateOfBirth as string) : undefined,
          countryOfResidence: data.countryOfResidence as string,
          city:               data.city as string,
          passportNumber,
          maritalStatus:      data.maritalStatus as string | undefined,
        },
        create: {
          userId,
          firstName:          data.firstName as string,
          lastName:           data.lastName  as string,
          dateOfBirth:        data.dateOfBirth ? new Date(data.dateOfBirth as string) : undefined,
          countryOfResidence: data.countryOfResidence as string,
          city:               data.city as string,
          passportNumber,
          maritalStatus:      data.maritalStatus as string | undefined,
        },
      });
      await prisma.user.update({ where: { id: userId }, data: { phone: data.phone as string } });
      break;
    }
    case 2: {
      await prisma.workerProfile.upsert({
        where: { userId },
        update: {
          fatherName:       data.fatherName as string,
          motherName:       data.motherName as string,
          hasSpouse:        data.hasSpouse  as boolean,
          spouseName:       data.spouseName as string | undefined,
          numberOfChildren: data.numberOfChildren as number,
        },
        create: {
          userId,
          fatherName:       data.fatherName as string,
          motherName:       data.motherName as string,
          hasSpouse:        data.hasSpouse  as boolean,
          spouseName:       data.spouseName as string | undefined,
          numberOfChildren: data.numberOfChildren as number,
        },
      });
      break;
    }
    case 3: {
      const profile = await prisma.workerProfile.findUnique({ where: { userId } });
      if (!profile) break;
      await prisma.workerSkill.deleteMany({ where: { workerProfileId: profile.id } });
      await prisma.workerSkill.createMany({
        data: (data.skills as string[]).map(skill => ({ workerProfileId: profile.id, skill })),
      });
      await prisma.workerLanguage.deleteMany({ where: { workerProfileId: profile.id } });
      await prisma.workerLanguage.createMany({
        data: (data.languages as { language: string; proficiencyLevel: string }[]).map(l => ({
          workerProfileId: profile.id, language: l.language, proficiencyLevel: l.proficiencyLevel,
        })),
      });
      await prisma.workerProfile.upsert({
        where: { userId },
        update: { yearsExperience: data.yearsExperience as string },
        create: { userId, yearsExperience: data.yearsExperience as string },
      });
      break;
    }
    case 4: {
      const profile = await prisma.workerProfile.findUnique({ where: { userId } });
      if (!profile) break;
      await prisma.workerTargetCountry.deleteMany({ where: { workerProfileId: profile.id } });
      await prisma.workerTargetCountry.createMany({
        data: (data.targetCountries as string[]).map(country => ({
          workerProfileId: profile.id, country, visaTypePreference: data.visaTypePreference as string,
        })),
      });
      await prisma.workerProfile.upsert({
        where: { userId },
        update: {
          expectedSalary:   data.expectedSalary  as string,
          additionalNotes:  data.additionalNotes as string | undefined,
          availabilityDate: data.availabilityDate ? new Date(data.availabilityDate as string) : undefined,
        },
        create: {
          userId,
          expectedSalary:   data.expectedSalary  as string,
          additionalNotes:  data.additionalNotes as string | undefined,
          availabilityDate: data.availabilityDate ? new Date(data.availabilityDate as string) : undefined,
        },
      });
      break;
    }
  }
}

// ── Employer step persisters ──────────────────────────────────
async function persistEmployerStep(userId: string, step: number, data: Record<string, unknown>) {
  switch (step) {
    case 1: {
      const administratorId = data.administratorId ? await encrypt(data.administratorId as string) : undefined;
      await prisma.employerProfile.upsert({
        where: { userId },
        update: {
          companyName:     data.companyName as string,
          nipt:            data.nipt as string,
          qkr:             data.qkr as string | undefined,
          administratorId,
          website:         data.website as string | undefined,
        },
        create: {
          userId,
          companyName:     data.companyName as string,
          nipt:            data.nipt as string,
          qkr:             data.qkr as string | undefined,
          administratorId,
          website:         data.website as string | undefined,
        },
      });
      break;
    }
    case 2: {
      await prisma.employerProfile.upsert({
        where: { userId },
        update: {
          industry:            data.industry            as string,
          companySize:         data.companySize         as string,
          address:             data.address             as string,
          businessDescription: data.businessDescription as string,
        },
        create: {
          userId,
          industry:            data.industry            as string,
          companySize:         data.companySize         as string,
          address:             data.address             as string,
          businessDescription: data.businessDescription as string,
        },
      });
      await prisma.user.update({ where: { id: userId }, data: { phone: data.phone as string } });
      break;
    }
    case 3: {
      const profile = await prisma.employerProfile.findUnique({ where: { userId } });
      if (!profile) break;
      await prisma.employerHiringCountry.deleteMany({ where: { employerProfileId: profile.id } });
      await prisma.employerHiringCountry.createMany({
        data: (data.hiringCountries as string[]).map(country => ({ employerProfileId: profile.id, country })),
      });
      await prisma.employerRequiredSkill.deleteMany({ where: { employerProfileId: profile.id } });
      await prisma.employerRequiredSkill.createMany({
        data: (data.requiredSkills as string[]).map(skill => ({ employerProfileId: profile.id, skill })),
      });
      break;
    }
    case 4: {
      const trialEnd = new Date(Date.now() + 14 * 24 * 3600 * 1000);
      await prisma.employerProfile.upsert({
        where: { userId },
        update: { subscriptionPlan: data.subscriptionPlan as string, subscriptionStatus: "TRIAL", trialEndsAt: trialEnd },
        create: { userId, subscriptionPlan: data.subscriptionPlan as string, subscriptionStatus: "TRIAL", trialEndsAt: trialEnd },
      });
      break;
    }
  }
}
