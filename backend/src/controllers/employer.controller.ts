// backend/src/controllers/employer.controller.ts
import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";
import { sendEmail } from "../services/email";

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
              documentsVerified:  true,
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
        documents_verified: (p as any)?.documentsVerified === true,
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
        createdAt:     true,
        lockCount:     true,
        accountStatus: true,
        workerProfile: {
          select: {
            firstName:           true,
            lastName:            true,
            nationality:         true,
            profession:          true,
            countryOfResidence:  true,
            city:                true,
            yearsExperience:     true,
            expectedSalary:      true,
            additionalNotes:     true,
            availabilityDate:    true,
            maritalStatus:       true,
            numberOfChildren:    true,
            profileScore:        true,
            trustScore:          true,
            documentsVerified:   true,
            skills:             { select: { skill: true } },
            languages:          { select: { language: true, proficiencyLevel: true } },
            targetCountries:    { select: { country: true } },
          },
        },
        verificationRecord: {
          select: { reviewStatus: true },
        },
        uploads: {
          where:   { deletedAt: null },
          select:  {
            id:           true,
            fileType:     true,
            fileName:     true,
            fileUrl:      true,
            mimeType:     true,
            sizeBytes:    true,
            reviewStatus: true,
            uploadedAt:   true,
            isPrivate:    true,
            filePath:     true,
          },
          orderBy: { uploadedAt: "desc" },
        },
      },
    });

    if (!user || !user.workerProfile) return err(res, "Worker not found", 404);

    const p               = user.workerProfile;
    const docsVerified    = (p as any).documentsVerified === true;
    const documentStatus  = docsVerified ? "VERIFIED" : "PENDING_REVIEW";

    // Only generate signed URLs and expose documents after admin has verified them
    const documents = docsVerified
      ? await Promise.all(user.uploads.map(async u => {
          let fileUrl = u.fileUrl;
          if (u.isPrivate && process.env.STORAGE_PROVIDER === "supabase" && u.filePath) {
            const { createClient } = await import("@supabase/supabase-js");
            const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
            const { data } = await client.storage
              .from(process.env.SUPABASE_STORAGE_BUCKET!)
              .createSignedUrl(u.filePath, 3600);
            fileUrl = data?.signedUrl ?? u.fileUrl;
          }
          return {
            id:            u.id,
            file_type:     u.fileType,
            file_name:     u.fileName,
            file_url:      fileUrl,
            uploaded_at:   u.uploadedAt,
            review_status: u.reviewStatus,
            is_private:    u.isPrivate,
          };
        }))
      : [];

    return ok(res, {
      id:                user.id,
      email:             user.email,
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
      document_status:           documentStatus,
      documents_verified_badge:  docsVerified,
      documents,
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

// ── messageWorker ─────────────────────────────────────────────
// POST /api/employer/message-worker
// Sends an email to the worker on behalf of the employer.
// The worker's email address is never returned in the response.
const MessageWorkerSchema = z.object({
  workerId: z.string().cuid(),
  message:  z.string().min(1, "Message cannot be empty").max(500, "Message must be 500 characters or fewer"),
});

export async function messageWorker(req: Request, res: Response, next: NextFunction) {
  try {
    const employerId = req.user!.sub;
    const { workerId, message } = MessageWorkerSchema.parse(req.body);

    const [worker, employer] = await Promise.all([
      prisma.user.findUnique({
        where: { id: workerId, role: "WORKER" },
        select: {
          email:         true,
          workerProfile: { select: { firstName: true } },
        },
      }),
      prisma.user.findUnique({
        where:  { id: employerId },
        select: {
          employerProfile: { select: { contactPersonName: true, companyName: true } },
        },
      }),
    ]);

    if (!worker) return err(res, "Worker not found", 404);

    const employerName =
      employer?.employerProfile?.contactPersonName ??
      employer?.employerProfile?.companyName ??
      "An employer";
    const workerFirstName = worker.workerProfile?.firstName ?? "there";
    const safeMessage     = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const notifBody  = message.slice(0, 100) + (message.length > 100 ? "…" : "");
    const notifTitle = `New message from ${employerName}`;

    // Persist message + notification — non-fatal: if the DB write fails (e.g. table not yet
    // migrated), log the error but still send the email and return 200.
    try {
      await Promise.all([
        prisma.$executeRaw`
          INSERT INTO "Message" ("id", "senderId", "recipientId", "body", "isRead", "createdAt")
          VALUES (gen_random_uuid()::text, ${employerId}, ${workerId}, ${message}, false, NOW())
        `,
        prisma.$executeRaw`
          INSERT INTO "Notification" ("id", "userId", "type", "title", "body", "isRead", "link", "createdAt")
          VALUES (
            gen_random_uuid()::text,
            ${workerId},
            'MESSAGE_RECEIVED'::"NotificationType",
            ${notifTitle},
            ${notifBody},
            false,
            '/worker/messages',
            NOW()
          )
        `,
      ]);
    } catch (dbErr) {
      console.error("[messageWorker] DB write failed:", dbErr instanceof Error ? dbErr.message : dbErr);
    }

    await sendEmail({
      userId:    employerId,
      to:        worker.email,
      emailType: "GENERAL",
      subject:   "An employer has messaged you on DirectHire",
      html: `
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8"/></head>
        <body style="margin:0;padding:0;background:#f7f9ff;font-family:'Helvetica Neue',Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0"
                     style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
                <tr>
                  <td style="background:#08142a;padding:24px 32px;">
                    <span style="font-size:18px;font-weight:800;color:#fff;">DirectHire</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;">
                    <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#0d9488;text-transform:uppercase;letter-spacing:0.05em;">New message</p>
                    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">Hi ${workerFirstName},</h1>
                    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
                      <strong>${employerName}</strong> has sent you a message on DirectHire:
                    </p>
                    <div style="background:#f8fafc;border-left:3px solid #0d9488;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
                      <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;white-space:pre-line;">${safeMessage}</p>
                    </div>
                    <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
                      Log in to DirectHire to view your profile and respond to this employer.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f7f9ff;padding:20px 32px;border-top:1px solid #e2e8f0;">
                    <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
                      &copy; ${new Date().getFullYear()} DirectHire. You received this because an employer messaged you.
                    </p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body></html>
      `,
      text: `Hi ${workerFirstName},\n\n${employerName} sent you a message on DirectHire:\n\n${message}\n\nLog in to DirectHire to view your profile and respond.`,
    });

    return ok(res, null, "Message sent");
  } catch (e) { next(e); }
}
