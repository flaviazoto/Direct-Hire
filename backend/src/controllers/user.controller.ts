// backend/src/controllers/user.controller.ts
import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import { decrypt } from "../lib/encrypt";

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const role   = req.user!.role;

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, email: true, role: true, phone: true,
                status: true, isEmailVerified: true, createdAt: true },
    });
    if (!user) return err(res, "User not found", 404);

    let profile = null;
    if (role === "WORKER") {
      const raw = await prisma.workerProfile.findUnique({
        where:   { userId },
        include: { skills: true, languages: true, targetCountries: true },
      });
      if (raw) {
        profile = {
          ...raw,
          passportNumber: raw.passportNumber ? decrypt(raw.passportNumber) : null,
        };
      }
    } else if (role === "EMPLOYER") {
      const raw = await prisma.employerProfile.findUnique({
        where:   { userId },
        include: { hiringCountries: true, requiredSkills: true },
      });
      if (raw) {
        profile = {
          ...raw,
          administratorId: (raw as any).administratorId
            ? decrypt((raw as any).administratorId)
            : null,
        };
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

    return ok(res, { user, profile, onboarding, verification, notifications,
                     unreadNotifications: notifications.filter(n => !n.isRead).length });
  } catch (e) { next(e); }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const role = req.user!.role;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const phone = asTrimmedString(body.phone);
    if (phone !== undefined) {
      await prisma.user.update({ where: { id: userId }, data: { phone } });
    }

    if (role === "WORKER") {
      const data = {
        firstName:          asTrimmedString(body.firstName),
        lastName:           asTrimmedString(body.lastName),
        profession:         asTrimmedString(body.profession),
        countryOfResidence: asTrimmedString(body.countryOfResidence),
        city:               asTrimmedString(body.city),
        yearsExperience:    asTrimmedString(body.yearsExperience),
        expectedSalary:     asTrimmedString(body.expectedSalary),
        additionalNotes:    asTrimmedString(body.additionalNotes),
      };

      const updateData = stripUndefined(data);
      if (Object.keys(updateData).length > 0) {
        await prisma.workerProfile.update({
          where: { userId },
          data: updateData,
        });
      }
    }

    if (role === "EMPLOYER") {
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
