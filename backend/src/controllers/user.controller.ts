// backend/src/controllers/user.controller.ts
import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import { decrypt, encrypt } from "../lib/encrypt";

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const role   = req.user!.role;

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, email: true, role: true,
                status: true, accountStatus: true, onboardingComplete: true,
                isEmailVerified: true, createdAt: true,
                rejectionReason: true },
    });
    if (!user) return err(res, "User not found", 404);

    let profile = null;
    if (role === "WORKER") {
      const raw = await prisma.workerProfile.findUnique({
        where:   { userId },
        include: { skills: true, languages: true, targetCountries: true },
      });
      if (raw) {
        // try/catch-null so one bad row (malformed ciphertext, key rotation,
        // etc.) can never turn into a 500 for the whole profile fetch.
        let passportNumber: string | null = null;
        if (raw.passportNumber) {
          try { passportNumber = decrypt(raw.passportNumber); } catch { passportNumber = null; }
        }
        let phone: string | null = null;
        if (raw.phone) {
          try { phone = decrypt(raw.phone); } catch { phone = null; }
        }
        profile = { ...raw, passportNumber, phone };
      }
    } else if (role === "EMPLOYER") {
      const raw = await prisma.employerProfile.findUnique({
        where:   { userId },
        include: { hiringCountries: true, requiredSkills: true },
      });
      if (raw) {
        // try/catch-null — same guard as the worker branch above. This is the
        // exact site originally diagnosed as a 500 (malformed/legacy
        // administratorId ciphertext threw uncaught here).
        let administratorId: string | null = null;
        if ((raw as any).administratorId) {
          try { administratorId = decrypt((raw as any).administratorId); } catch { administratorId = null; }
        }
        let phone: string | null = null;
        if (raw.phone) {
          try { phone = decrypt(raw.phone); } catch { phone = null; }
        }
        profile = { ...raw, administratorId, phone };
      }
    }

    const onboarding = await prisma.onboardingProgress.findUnique({
      where:  { userId },
      select: { currentStep: true, completedSteps: true, onboardingStatus: true,
                isSubmitted: true, totalSteps: true, lastSavedAt: true },
    });

    const verification = await prisma.verificationRecord.findUnique({
      where:  { userId },
      select: { reviewStatus: true, adminNotes: true, changesRequested: true },
    });

    const notifications = await prisma.notification.findMany({
      where:   { userId },
      orderBy: { createdAt: "desc" },
      take:    20,
    });

    // Compute live profile completion score for workers
    let profileCompletionScore: number | null = null;
    if (role === "WORKER" && profile) {
      const p = profile as any;
      const uploads = await prisma.upload.findMany({
        where:  { userId, status: { not: "DELETED" } },
        select: { fileType: true },
      });
      const hasPhoto = uploads.some((u: { fileType: string }) => u.fileType === "PROFILE_PHOTO");
      const hasVideo = uploads.some((u: { fileType: string }) =>
        u.fileType === "WORK_VIDEO" || u.fileType === "INTRO_VIDEO",
      );
      let score = 0;
      if (p.firstName)                   score += 5;
      if (p.lastName)                    score += 5;
      if (p.profession)                  score += 5;
      if (p.countryOfResidence)          score += 5;
      if (p.city)                        score += 5;
      if (p.yearsExperience)             score += 5;
      if (p.expectedSalary)              score += 5;
      if (p.passportNumber)              score += 5;
      if ((p.skills?.length   ?? 0) > 0) score += 10;
      if ((p.languages?.length ?? 0) > 0)       score += 5;
      if ((p.targetCountries?.length ?? 0) > 0) score += 5;
      if (hasPhoto)                      score += 10;
      if (hasVideo)                      score += 10;
      if (p.documentsVerified === true)  score += 15;
      if ((user as any).accountStatus === "VERIFIED") score += 10;
      profileCompletionScore = score;
    }

    return ok(res, {
      user, profile, onboarding, verification, notifications,
      unreadNotifications: notifications.filter(n => !n.isRead).length,
      profileCompletionScore,
    });
  } catch (e) { next(e); }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const role = req.user!.role;
    const body = (req.body ?? {}) as Record<string, unknown>;

    if (role === "WORKER") {
      const rawPassport = asTrimmedString(body.passportNumber);
      const rawPhone    = asTrimmedString(body.phone);
      const data = {
        firstName:          asTrimmedString(body.firstName),
        lastName:           asTrimmedString(body.lastName),
        nationality:        asTrimmedString(body.nationality),
        profession:         asTrimmedString(body.profession),
        countryOfResidence: asTrimmedString(body.countryOfResidence),
        city:               asTrimmedString(body.city),
        yearsExperience:    asTrimmedString(body.yearsExperience),
        expectedSalary:     asTrimmedString(body.expectedSalary),
        additionalNotes:    asTrimmedString(body.additionalNotes),
        passportNumber:     rawPassport !== undefined ? encrypt(rawPassport) : undefined,
        phone:              rawPhone    !== undefined ? encrypt(rawPhone)    : undefined,
      };

      const updateData = stripUndefined(data);
      if (Object.keys(updateData).length > 0) {
        await prisma.workerProfile.upsert({
          where:  { userId },
          create: { userId, ...updateData },
          update: updateData,
        });
      }
    }

    if (role === "EMPLOYER") {
      const rawPhone = asTrimmedString(body.phone);
      const data = {
        companyName:         asTrimmedString(body.companyName),
        contactPersonName:   asTrimmedString(body.contactPersonName),
        industry:            asTrimmedString(body.industry),
        companySize:         asTrimmedString(body.companySize),
        website:             asTrimmedString(body.website),
        country:             asTrimmedString(body.country),
        city:                asTrimmedString(body.city),
        address:             asTrimmedString(body.address),
        businessDescription: asTrimmedString(body.businessDescription),
        phone:               rawPhone !== undefined ? encrypt(rawPhone) : undefined,
      };

      const updateData = stripUndefined(data);
      if (Object.keys(updateData).length > 0) {
        await prisma.employerProfile.update({
          where: { userId },
          data: updateData,
        });
      }
    }

    return ok(res, null, "Profile updated");
  } catch (e) { next(e); }
}

export async function getNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const notifications = await prisma.notification.findMany({
      where:   { userId: req.user!.sub },
      orderBy: { createdAt: "desc" },
      take:    50,
    });
    return ok(res, notifications);
  } catch (e) { next(e); }
}

export async function markNotificationRead(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.sub },
      data:  { isRead: true },
    });
    return ok(res, null, "Marked as read");
  } catch (e) { next(e); }
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const v = value.trim();
  return v.length > 0 ? v : undefined;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}
