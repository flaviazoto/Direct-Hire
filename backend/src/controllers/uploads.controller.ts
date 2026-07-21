// backend/src/controllers/uploads.controller.ts
import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import { uploadFile as storageUpload, deleteFile, ALLOWED_MIME, MAX_SIZE, SIGNED_URL_EXPIRY_SECONDS } from "../services/storage";
import type { FileType } from "../types";
import { insertAuditLog } from "../lib/audit";

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg':      'jpg',
  'image/png':       'png',
  'image/webp':      'webp',
  'image/svg+xml':   'svg',
  'video/mp4':       'mp4',
  'video/webm':      'webm',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
};

// ── upload ────────────────────────────────────────────────────
export async function uploadFile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId   = req.user!.sub;
    const role     = req.user!.role;
    const fileType = req.body.fileType as FileType;
    const file     = req.file;

    if (!file)     return err(res, "No file provided", 400);
    if (!fileType) return err(res, "fileType is required", 400);

    // Role-based file type guards
    const workerOnly:   FileType[] = ["PROFILE_PHOTO","WORK_VIDEO","INTRO_VIDEO","MEDICAL_CERTIFICATE"];
    const employerOnly: FileType[] = ["BUSINESS_DOCUMENT","COMPANY_LOGO"];
    if (role === "WORKER"   && employerOnly.includes(fileType)) return err(res, "File type not allowed for workers", 403);
    if (role === "EMPLOYER" && workerOnly.includes(fileType))   return err(res, "File type not allowed for employers", 403);

    // Mime + size validation — checked against the ALLOWED list for this
    // SPECIFIC fileType (services/storage/index.ts's ALLOWED_MIME/MAX_SIZE),
    // not a generic image/video-only gate. A prior generic gate here ran
    // first and hard-rejected anything outside image/jpeg|png|webp and
    // video/mp4|webm|quicktime — silently blocking application/pdf for
    // MEDICAL_CERTIFICATE/BUSINESS_DOCUMENT/OTHER and image/svg+xml for
    // COMPANY_LOGO, all of which ALLOWED_MIME already listed as valid but
    // which this per-type check was never reached to confirm.
    const allowed = ALLOWED_MIME[fileType];
    if (!allowed) return err(res, `Unknown file type: ${fileType}`, 400);
    if (!allowed.includes(file.mimetype)) {
      return err(res, `Invalid file type for ${fileType}. Allowed: ${allowed.join(", ")}`, 422);
    }
    const maxSize = MAX_SIZE[fileType];
    if (maxSize && file.size > maxSize) {
      return err(res, `File too large. Max for ${fileType}: ${Math.round(maxSize / 1024 / 1024)} MB`, 422);
    }

    // Safe filename — never trust the original user-provided name
    const ext          = MIME_TO_EXT[file.mimetype] ?? 'bin';
    const safeFileName = `${userId}-${Date.now()}.${ext}`;

    // PROFILE_PHOTO and COMPANY_LOGO stay public per the storage sensitivity
    // split — they render in bulk across browse lists (employer/workers grid,
    // admin/approvals queue) where per-thumbnail signing would mean N signing
    // calls per page load. Everything else a worker/employer uploads is
    // private by default.
    const isPrivate = ["MEDICAL_CERTIFICATE","BUSINESS_DOCUMENT","WORK_VIDEO","INTRO_VIDEO"].includes(fileType);
    const result    = await storageUpload({
      userId, fileType, fileName: safeFileName,
      mimeType: file.mimetype, buffer: file.buffer, isPrivate,
    });

    await insertAuditLog({
      actorId:  userId,
      targetId: userId,
      action:   "FILE_UPLOADED",
      entity:   "Upload",
      entityId: result.id,
      metadata: { fileType, fileName: safeFileName, sizeBytes: file.size },
    });

    // Re-uploading the same fileType creates a new row rather than an
    // upsert — history has value for admin review — so the previous
    // "current" row(s) would otherwise linger at status UPLOADED forever.
    // Mark them SUPERSEDED instead: still listed, no longer read as current.
    await prisma.upload.updateMany({
      where: { userId, fileType, id: { not: result.id }, status: "UPLOADED" },
      data:  { status: "SUPERSEDED" },
    }).catch((e: unknown) => console.error("[uploadFile] Failed to mark previous uploads superseded:", e));

    // Re-review on post-approval document edits (NOT profile text edits —
    // updateProfile in user.controller.ts intentionally never touches
    // documentsVerified; only a new/replaced DOCUMENT re-enters review).
    // Resets documentsVerified so this worker reappears in the admin's
    // default pending-documents queue (admin-documents.controller.ts filters
    // on documentsVerified: false) — a re-upload from an already-verified
    // worker would otherwise never surface there again.
    if (role === "WORKER") {
      const wp = await prisma.workerProfile.findUnique({
        where:  { userId },
        select: { documentsVerified: true },
      });

      if (wp?.documentsVerified) {
        await prisma.workerProfile.update({
          where: { userId },
          data:  { documentsVerified: false },
        });

        const admins = await prisma.user.findMany({
          where:  { role: "ADMIN" },
          select: { id: true },
        });

        Promise.all([
          prisma.notification.create({
            data: {
              userId,
              type:  "DOCUMENT_PENDING",
              title: "Document under review",
              body:  "Your new upload has been received and is being reviewed again before it goes live.",
              link:  "/worker/documents",
            },
          }),
          ...(admins.length > 0
            ? [prisma.notification.createMany({
                data: admins.map((a) => ({
                  userId: a.id,
                  type:   "DOCUMENT_PENDING",
                  title:  "Verified worker re-uploaded a document",
                  body:   `A previously-verified worker uploaded a new ${fileType.toLowerCase().replace(/_/g, " ")} — re-review needed.`,
                  link:   `/admin/document-review/${userId}`,
                })),
              })]
            : []),
        ]).catch((e: unknown) => console.error("[uploadFile re-review notif]", e));
      }
    }

    return ok(res, result, "File uploaded successfully", 201);
  } catch (e) { next(e); }
}

// ── list ──────────────────────────────────────────────────────
export async function listUploads(req: Request, res: Response, next: NextFunction) {
  try {
    const uploads = await prisma.upload.findMany({
      where:   { userId: req.user!.sub, status: { not: "DELETED" } },
      orderBy: { uploadedAt: "desc" },
      select:  { id: true, fileType: true, fileName: true, fileUrl: true, filePath: true,
                 mimeType: true, sizeBytes: true, status: true, isPrivate: true,
                 reviewStatus: true, reviewNotes: true, reviewedAt: true,
                 uploadedAt: true },
    });

    // Sign isPrivate rows the same way every other consumer does (getUploadUrl,
    // admin-documents.controller.ts, admin.controller.ts, employer.controller.ts)
    // — same 3600s expiry, same fallback-to-fileUrl-on-failure pattern. Without
    // this, the worker's own documents list would return an unusable bare
    // filePath (see storage/index.ts's supabaseUpload) for any private file.
    let signed = uploads;
    if (process.env.STORAGE_PROVIDER === "supabase" && uploads.some(u => u.isPrivate && u.filePath)) {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
      signed = await Promise.all(uploads.map(async (u) => {
        if (!u.isPrivate || !u.filePath) return u;
        const { data } = await client.storage
          .from(process.env.SUPABASE_STORAGE_BUCKET!)
          .createSignedUrl(u.filePath, SIGNED_URL_EXPIRY_SECONDS);
        return { ...u, fileUrl: data?.signedUrl ?? u.fileUrl };
      }));
    }

    return ok(res, signed.map(({ filePath, ...rest }) => rest));
  } catch (e) { next(e); }
}

// ── delete ────────────────────────────────────────────────────
export async function deleteUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const userId   = req.user!.sub;
    const uploadId = req.params.id;

    const record = await prisma.upload.findFirst({ where: { id: uploadId, userId } });
    if (!record) return err(res, "File not found", 404);

    await deleteFile(uploadId, userId);
    await insertAuditLog({ actorId: userId, targetId: userId, action: "FILE_DELETED", entity: "Upload", entityId: uploadId });

    return ok(res, null, "File deleted");
  } catch (e) { next(e); }
}

// ── getUploadUrl ─────────────────────────────────────────────
export async function getUploadUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const uploadId = req.params.id;
    const userId   = req.user!.sub;
    const isAdmin  = req.user!.role === "ADMIN";

    const record = await prisma.upload.findFirst({
      where: isAdmin ? { id: uploadId } : { id: uploadId, userId },
    });
    if (!record) return err(res, "File not found", 404);

    let url = record.fileUrl;

    if (record.isPrivate && process.env.STORAGE_PROVIDER === "supabase" && record.filePath) {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
      const { data } = await client.storage
        .from(process.env.SUPABASE_STORAGE_BUCKET!)
        .createSignedUrl(record.filePath, SIGNED_URL_EXPIRY_SECONDS);
      url = data?.signedUrl ?? record.fileUrl;
    }

    return ok(res, { url, fileType: record.fileType, fileName: record.fileName, mimeType: record.mimeType });
  } catch (e) { next(e); }
}
