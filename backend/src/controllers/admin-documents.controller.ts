// backend/src/controllers/admin-documents.controller.ts
import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";
import { decrypt } from "../lib/encrypt";
import { insertAdminAuditLog } from "../lib/audit";
import { sendEmail } from "../services/email";

const BatchReviewSchema = z.object({
  photoStatus:    z.enum(["APPROVED", "REJECTED", "PENDING"]),
  videoStatus:    z.enum(["APPROVED", "REJECTED", "PENDING"]),
  passportStatus: z.enum(["APPROVED", "REJECTED", "PENDING"]),
  notes:          z.string().max(2000).optional(),
});

// ── GET /api/admin/workers/pending-documents ──────────────────────────────────
// Workers who have uploaded at least one document but documentsVerified = false
export async function getPendingDocumentWorkers(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { tab = "pending" } = req.query as Record<string, string>;

    // "pending" tab: workers with documentsVerified=false who have ≥1 upload
    // "all" tab: all workers regardless of status
    const whereUploads = tab === "pending"
      ? { some: { status: { not: "DELETED" as const } } }
      : undefined;

    // Build WHERE for User
    const whereUser =
      tab === "pending"
        ? {
            role: "WORKER" as const,
            workerProfile: {
              documentsVerified: false,
            },
            uploads: whereUploads,
          }
        : { role: "WORKER" as const };

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where: whereUser,
        skip,
        take: limit,
        orderBy: [{ createdAt: "desc" }],
        select: {
          id:            true,
          email:         true,
          accountStatus: true,
          createdAt:     true,
          workerProfile: {
            select: {
              firstName:          true,
              lastName:           true,
              passportStatus:     true,
              documentsVerified:  true,
              documentsReviewedAt: true,
            },
          },
          uploads: {
            where:   { status: { not: "DELETED" } },
            select:  { id: true, fileType: true, reviewStatus: true, uploadedAt: true },
            orderBy: { uploadedAt: "desc" },
          },
        },
      }),
      prisma.user.count({ where: whereUser }),
    ]);

    const enriched = rows.map(u => {
      const p = u.workerProfile;
      const photo   = u.uploads.find(x => x.fileType === "PROFILE_PHOTO");
      const video   = u.uploads.find(x => x.fileType === "WORK_VIDEO" || x.fileType === "INTRO_VIDEO");
      const allApproved =
        (photo?.reviewStatus === "APPROVED" || !photo) &&
        (video?.reviewStatus === "APPROVED" || !video) &&
        (p?.passportStatus  === "APPROVED");

      const hasRejection =
        photo?.reviewStatus === "REJECTED" ||
        video?.reviewStatus === "REJECTED" ||
        p?.passportStatus   === "REJECTED";

      return {
        userId:              u.id,
        email:               u.email,
        accountStatus:       u.accountStatus,
        createdAt:           u.createdAt,
        name:                p ? [p.firstName, p.lastName].filter(Boolean).join(" ") || u.email : u.email,
        documentsVerified:   p?.documentsVerified ?? false,
        documentsReviewedAt: p?.documentsReviewedAt ?? null,
        photoStatus:         photo?.reviewStatus  ?? "NONE",
        videoStatus:         video?.reviewStatus  ?? "NONE",
        passportStatus:      p?.passportStatus    ?? "PENDING",
        uploadCount:         u.uploads.length,
        overallStatus:       p?.documentsVerified
          ? "VERIFIED"
          : hasRejection
          ? "HAS_REJECTIONS"
          : "PENDING",
      };
    });

    return paginated(res, enriched, total, page, limit);
  } catch (e) { next(e); }
}

// ── GET /api/admin/workers/:id/documents ──────────────────────────────────────
export async function getWorkerDocuments(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where:  { id, role: "WORKER" },
      select: {
        id:            true,
        email:         true,
        accountStatus: true,
        createdAt:     true,
        workerProfile: {
          select: {
            firstName:           true,
            lastName:            true,
            passportNumber:      true,
            passportStatus:      true,
            documentsVerified:   true,
            documentsReviewedAt: true,
            documentsReviewedBy: true,
          },
        },
        uploads: {
          where:   { status: { not: "DELETED" } },
          orderBy: { uploadedAt: "desc" },
          select:  {
            id:           true,
            fileType:     true,
            fileName:     true,
            fileUrl:      true,
            filePath:     true,
            mimeType:     true,
            sizeBytes:    true,
            reviewStatus: true,
            reviewNotes:  true,
            reviewedAt:   true,
            uploadedAt:   true,
            isPrivate:    true,
          },
        },
      },
    });

    if (!user || !user.workerProfile) return err(res, "Worker not found", 404);

    const p = user.workerProfile;

    // Generate signed URLs for private uploads
    let uploads = user.uploads.map(u => ({ ...u, signedUrl: u.fileUrl }));
    if (process.env.STORAGE_PROVIDER === "supabase") {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
      uploads = await Promise.all(user.uploads.map(async u => {
        if (u.isPrivate && u.filePath) {
          const { data } = await sb.storage
            .from(process.env.SUPABASE_STORAGE_BUCKET!)
            .createSignedUrl(u.filePath, 3600);
          return { ...u, signedUrl: data?.signedUrl ?? u.fileUrl };
        }
        return { ...u, signedUrl: u.fileUrl };
      }));
    }

    const photo   = uploads.find(x => x.fileType === "PROFILE_PHOTO");
    const video   = uploads.find(x => x.fileType === "WORK_VIDEO" || x.fileType === "INTRO_VIDEO");

    let passportNumber: string | null = null;
    if (p.passportNumber) {
      try { passportNumber = decrypt(p.passportNumber); } catch { passportNumber = null; }
    }

    return ok(res, {
      userId:              user.id,
      email:               user.email,
      accountStatus:       user.accountStatus,
      createdAt:           user.createdAt,
      name:                [p.firstName, p.lastName].filter(Boolean).join(" ") || user.email,
      passportNumber,
      passportStatus:      p.passportStatus,
      documentsVerified:   p.documentsVerified,
      documentsReviewedAt: p.documentsReviewedAt,
      documentsReviewedBy: p.documentsReviewedBy,
      photo:   photo  ? { id: photo.id,  url: photo.signedUrl,  reviewStatus: photo.reviewStatus,  reviewNotes: photo.reviewNotes,  uploadedAt: photo.uploadedAt  } : null,
      video:   video  ? { id: video.id,  url: video.signedUrl,  reviewStatus: video.reviewStatus,  reviewNotes: video.reviewNotes,  uploadedAt: video.uploadedAt  } : null,
      allUploads: uploads.map(u => ({
        id:           u.id,
        fileType:     u.fileType,
        fileName:     u.fileName,
        url:          u.signedUrl,
        mimeType:     u.mimeType,
        sizeBytes:    u.sizeBytes,
        reviewStatus: u.reviewStatus,
        reviewNotes:  u.reviewNotes,
        uploadedAt:   u.uploadedAt,
      })),
    });
  } catch (e) { next(e); }
}

// ── PATCH /api/admin/workers/:id/documents/review ─────────────────────────────
export async function reviewWorkerDocuments(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const adminId  = req.user!.sub;
    const { id }   = req.params;
    const body     = BatchReviewSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where:  { id, role: "WORKER" },
      select: {
        id:            true,
        email:         true,
        accountStatus: true,
        workerProfile: {
          select: { id: true, firstName: true, passportNumber: true },
        },
        uploads: {
          where:   { status: { not: "DELETED" } },
          select:  { id: true, fileType: true },
          orderBy: { uploadedAt: "desc" },
        },
      },
    });

    if (!user || !user.workerProfile) return err(res, "Worker not found", 404);

    const photo = user.uploads.find(x => x.fileType === "PROFILE_PHOTO");
    const video = user.uploads.find(x => x.fileType === "WORK_VIDEO" || x.fileType === "INTRO_VIDEO");

    const now             = new Date();
    const documentsVerified =
      body.photoStatus    === "APPROVED" &&
      body.videoStatus    === "APPROVED" &&
      body.passportStatus === "APPROVED";

    // Update upload reviewStatus for photo and video in parallel
    await Promise.all([
      photo ? prisma.upload.update({
        where: { id: photo.id },
        data:  { reviewStatus: body.photoStatus, reviewedById: adminId, reviewedAt: now, reviewNotes: body.notes ?? null },
      }) : Promise.resolve(),
      video ? prisma.upload.update({
        where: { id: video.id },
        data:  { reviewStatus: body.videoStatus, reviewedById: adminId, reviewedAt: now, reviewNotes: body.notes ?? null },
      }) : Promise.resolve(),
    ]);

    // Update WorkerProfile — use raw SQL in case Prisma client is stale after generate
    await prisma.$executeRawUnsafe(
      `UPDATE "WorkerProfile"
       SET "passportStatus"      = $1::"DocumentReviewStatus",
           "documentsVerified"   = $2,
           "documentsReviewedAt" = $3,
           "documentsReviewedBy" = $4
       WHERE "userId" = $5`,
      body.passportStatus,
      documentsVerified,
      documentsVerified ? now : null,
      documentsVerified ? adminId : null,
      id,
    );

    // If all docs verified AND user account is already approved → make profile searchable
    if (documentsVerified && (user as any).accountStatus === "VERIFIED") {
      await Promise.all([
        prisma.$executeRawUnsafe(
          `UPDATE "WorkerProfile" SET "isSearchable" = true WHERE "userId" = $1`,
          id,
        ),
        prisma.onboardingProgress.updateMany({
          where: { userId: id },
          data:  { onboardingStatus: "APPROVED" },
        }),
        prisma.user.update({
          where: { id },
          data:  { onboardingComplete: true },
        }),
      ]);
    }

    // Worker notification
    const rejectedDocs: string[] = [];
    if (body.photoStatus    === "REJECTED") rejectedDocs.push("profile photo");
    if (body.videoStatus    === "REJECTED") rejectedDocs.push("video");
    if (body.passportStatus === "REJECTED") rejectedDocs.push("passport");

    const notifTitle = documentsVerified ? "Documents verified" : "Documents need attention";
    const notifBody  = documentsVerified
      ? "Your documents have been reviewed and verified. Your profile is now visible to employers."
      : `The following document${rejectedDocs.length !== 1 ? "s" : ""} need attention: ${rejectedDocs.join(", ")}. Please re-upload.`;

    // Persist notification via raw SQL (safe with stale Prisma client)
    await prisma.$executeRaw`
      INSERT INTO "Notification" ("id", "userId", "type", "title", "body", "isRead", "link", "createdAt")
      VALUES (gen_random_uuid()::text, ${id}, 'GENERAL'::"NotificationType", ${notifTitle}, ${notifBody}, false, '/worker/documents', NOW())
    `;

    // Send email
    const firstName = user.workerProfile.firstName ?? "there";
    await sendEmail({
      userId:    adminId,
      to:        user.email,
      emailType: "GENERAL",
      subject:   documentsVerified
        ? "Your documents have been verified on DirectHire"
        : "Action required: some documents need attention on DirectHire",
      html: documentsVerified
        ? `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0;background:#f7f9ff;font-family:'Helvetica Neue',Arial,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
              <tr><td align="center">
                <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
                  <tr><td style="background:#08142a;padding:24px 32px;"><span style="font-size:18px;font-weight:800;color:#fff;">DirectHire</span></td></tr>
                  <tr><td style="padding:32px;">
                    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">Hi ${firstName},</h1>
                    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Great news — your documents have been <strong style="color:#16a34a;">verified</strong> by our team. Your profile is now visible to employers on DirectHire.</p>
                    <p style="margin:0;font-size:13px;color:#64748b;">Log in to view your profile and start receiving opportunities.</p>
                  </td></tr>
                  <tr><td style="background:#f7f9ff;padding:20px 32px;border-top:1px solid #e2e8f0;">
                    <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">&copy; ${new Date().getFullYear()} DirectHire.</p>
                  </td></tr>
                </table>
              </td></tr>
            </table></body></html>`
        : `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0;background:#f7f9ff;font-family:'Helvetica Neue',Arial,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
              <tr><td align="center">
                <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
                  <tr><td style="background:#08142a;padding:24px 32px;"><span style="font-size:18px;font-weight:800;color:#fff;">DirectHire</span></td></tr>
                  <tr><td style="padding:32px;">
                    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">Hi ${firstName},</h1>
                    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">Our team reviewed your documents. The following item${rejectedDocs.length !== 1 ? "s" : ""} need attention:</p>
                    <ul style="margin:0 0 20px;padding-left:20px;font-size:15px;color:#374151;line-height:1.8;">${rejectedDocs.map(d => `<li><strong>${d}</strong></li>`).join("")}</ul>
                    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">Please log in, re-upload the affected document${rejectedDocs.length !== 1 ? "s" : ""}, and resubmit for review.${body.notes ? ` Note from reviewer: <em>${body.notes}</em>` : ""}</p>
                    <p style="margin:0;font-size:13px;color:#64748b;">If you have questions, contact support.</p>
                  </td></tr>
                  <tr><td style="background:#f7f9ff;padding:20px 32px;border-top:1px solid #e2e8f0;">
                    <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">&copy; ${new Date().getFullYear()} DirectHire.</p>
                  </td></tr>
                </table>
              </td></tr>
            </table></body></html>`,
      text: documentsVerified
        ? `Hi ${firstName},\n\nYour documents have been verified. Your profile is now visible to employers.\n\nLog in to DirectHire to view your profile.`
        : `Hi ${firstName},\n\nThe following documents need attention: ${rejectedDocs.join(", ")}. Please re-upload and resubmit.\n\n${body.notes ? `Note from reviewer: ${body.notes}` : ""}`,
    });

    // Audit log
    await insertAdminAuditLog({
      actorId:  adminId,
      targetId: id,
      action:   "DOCUMENT_BATCH_REVIEWED",
      notes:    body.notes ?? null,
      metadata: {
        photoStatus:    body.photoStatus,
        videoStatus:    body.videoStatus,
        passportStatus: body.passportStatus,
        documentsVerified,
        photoUploadId:  photo?.id ?? null,
        videoUploadId:  video?.id ?? null,
      },
    });

    return ok(res, {
      documentsVerified,
      photoStatus:    body.photoStatus,
      videoStatus:    body.videoStatus,
      passportStatus: body.passportStatus,
    }, documentsVerified ? "All documents verified" : "Documents reviewed");
  } catch (e) { next(e); }
}
