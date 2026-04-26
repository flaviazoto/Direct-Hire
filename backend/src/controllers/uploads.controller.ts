// backend/src/controllers/uploads.controller.ts
import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import { uploadFile as storageUpload, deleteFile, ALLOWED_MIME, MAX_SIZE } from "../services/storage";
import type { FileType } from "../types";
import { insertAuditLog } from "../lib/audit";

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

const IMAGE_SIZE_LIMIT = 5   * 1024 * 1024; // 5 MB
const VIDEO_SIZE_LIMIT = 100 * 1024 * 1024; // 100 MB

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg':      'jpg',
  'image/png':       'png',
  'image/webp':      'webp',
  'video/mp4':       'mp4',
  'video/webm':      'webm',
  'video/quicktime': 'mov',
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

    // Top-level mime gate — reject anything outside image/video lists
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.mimetype);
    if (!isImage && !isVideo) {
      return err(res, `Unsupported file type. Allowed: ${[...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].join(', ')}`, 400);
    }

    // Type-specific size limits
    const sizeLimit = isImage ? IMAGE_SIZE_LIMIT : VIDEO_SIZE_LIMIT;
    if (file.size > sizeLimit) {
      return err(res, `File too large. ${isImage ? 'Images' : 'Videos'} must be under ${isImage ? 5 : 100} MB`, 400);
    }

    // Role-based file type guards
    const workerOnly:   FileType[] = ["PROFILE_PHOTO","WORK_VIDEO","INTRO_VIDEO","MEDICAL_CERTIFICATE"];
    const employerOnly: FileType[] = ["BUSINESS_DOCUMENT","COMPANY_LOGO"];
    if (role === "WORKER"   && employerOnly.includes(fileType)) return err(res, "File type not allowed for workers", 403);
    if (role === "EMPLOYER" && workerOnly.includes(fileType))   return err(res, "File type not allowed for employers", 403);

    // Per-fileType mime + size validation (second layer)
    const allowed = ALLOWED_MIME[fileType];
    if (allowed && !allowed.includes(file.mimetype)) {
      return err(res, `Invalid file type for ${fileType}. Allowed: ${allowed.join(", ")}`, 422);
    }
    const maxSize = MAX_SIZE[fileType];
    if (maxSize && file.size > maxSize) {
      return err(res, `File too large. Max for ${fileType}: ${Math.round(maxSize / 1024 / 1024)} MB`, 422);
    }

    // Safe filename — never trust the original user-provided name
    const ext          = MIME_TO_EXT[file.mimetype] ?? 'bin';
    const safeFileName = `${userId}-${Date.now()}.${ext}`;

    const isPrivate = ["MEDICAL_CERTIFICATE","BUSINESS_DOCUMENT"].includes(fileType);
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

    return ok(res, result, "File uploaded successfully", 201);
  } catch (e) { next(e); }
}

// ── list ──────────────────────────────────────────────────────
export async function listUploads(req: Request, res: Response, next: NextFunction) {
  try {
    const uploads = await prisma.upload.findMany({
      where:   { userId: req.user!.sub, status: { not: "DELETED" } },
      orderBy: { uploadedAt: "desc" },
      select:  { id: true, fileType: true, fileName: true, fileUrl: true,
                 mimeType: true, sizeBytes: true, status: true, isPrivate: true,
                 reviewStatus: true, reviewNotes: true, reviewedAt: true,
                 uploadedAt: true },
    });
    return ok(res, uploads);
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
        .createSignedUrl(record.filePath, 3600);
      url = data?.signedUrl ?? record.fileUrl;
    }

    return ok(res, { url, fileType: record.fileType, fileName: record.fileName, mimeType: record.mimeType });
  } catch (e) { next(e); }
}
