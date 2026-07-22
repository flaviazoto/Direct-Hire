// backend/src/services/storage/index.ts
import path from "path";
import fs   from "fs";
import { createClient } from "@supabase/supabase-js";
import prisma from "../../lib/prisma";
import type { FileType, UploadParams, UploadResult } from "../../types";

export const ALLOWED_MIME: Record<FileType, string[]> = {
  PROFILE_PHOTO:       ["image/jpeg","image/png","image/webp"],
  WORK_VIDEO:          ["video/mp4","video/quicktime","video/webm"],
  INTRO_VIDEO:         ["video/mp4","video/quicktime","video/webm"],
  MEDICAL_CERTIFICATE: ["image/jpeg","image/png","application/pdf"],
  BUSINESS_DOCUMENT:   ["application/pdf","image/jpeg","image/png"],
  COMPANY_LOGO:        ["image/jpeg","image/png","image/svg+xml","image/webp"],
  OTHER:               ["application/pdf","image/jpeg","image/png"],
};

export const MAX_SIZE: Record<FileType, number> = {
  PROFILE_PHOTO:       5  * 1024 * 1024,
  WORK_VIDEO:          100 * 1024 * 1024,
  INTRO_VIDEO:         100 * 1024 * 1024,
  MEDICAL_CERTIFICATE: 10 * 1024 * 1024,
  BUSINESS_DOCUMENT:   10 * 1024 * 1024,
  COMPANY_LOGO:        2  * 1024 * 1024,
  OTHER:               20 * 1024 * 1024,
};

// Shared by every createSignedUrl() call site (uploads.controller.ts,
// admin-documents.controller.ts, admin.controller.ts, employer.controller.ts).
// Tightening per file-type class (e.g. shorter for medical certs) is a later
// tuning decision — this pass only removes the duplicated magic number.
export const SIGNED_URL_EXPIRY_SECONDS = 3600;

// ── Supabase client — service role, bypasses RLS ──────────────
function getStorageClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession:   false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
      },
    }
  );
}

// ── Local storage provider ─────────────────────────────────────
async function localUpload(buffer: Buffer, filePath: string): Promise<string> {
  const dir      = path.join(process.cwd(), ".uploads", path.dirname(filePath));
  const fullPath = path.join(process.cwd(), ".uploads", filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(fullPath, buffer);
  const appUrl = process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
  return `${appUrl}/uploads/${filePath}`;
}

async function localDelete(filePath: string): Promise<void> {
  const fullPath = path.join(process.cwd(), ".uploads", filePath);
  await fs.promises.unlink(fullPath).catch(() => {});
}

// ── Supabase provider ─────────────────────────────────────────
async function supabaseUpload(buffer: Buffer, filePath: string, mimeType: string, isPrivate: boolean): Promise<string> {
  const client = getStorageClient();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET!;

  const { data, error } = await client.storage
    .from(bucket)
    .upload(filePath, buffer, { contentType: mimeType, upsert: true });

  if (error) {
    console.error("Storage upload failed:", {
      message:    error.message,
      bucket,
      filePath,
      supabaseUrl: process.env.SUPABASE_URL,
      keyPrefix:   process.env.SUPABASE_SERVICE_KEY?.substring(0, 30),
    });
    throw new Error(`Supabase upload: ${error.message}`);
  }

  if (isPrivate) return filePath;
  const { data: urlData } = client.storage.from(bucket).getPublicUrl(filePath);
  return urlData.publicUrl;
}

// ── Main upload function ──────────────────────────────────────
export async function uploadFile(params: UploadParams): Promise<UploadResult> {
  const { userId, fileType, fileName, mimeType, buffer, isPrivate = false } = params;
  const sizeBytes = buffer.length;

  const record = await prisma.upload.create({
    data: { userId, fileType, fileName, fileUrl: "", filePath: "", mimeType, sizeBytes, status: "UPLOADING", isPrivate },
  });

  const ext      = fileName.split(".").pop() ?? "bin";
  const filePath = `${userId}/${fileType.toLowerCase()}/${record.id}.${ext}`;

  try {
    let url: string;
    if (process.env.STORAGE_PROVIDER === "supabase") {
      url = await supabaseUpload(buffer, filePath, mimeType, isPrivate);
    } else {
      url = await localUpload(buffer, filePath);
    }

    const updated = await prisma.upload.update({
      where: { id: record.id },
      data:  { fileUrl: url, filePath, status: "UPLOADED" },
    });

    return { id: updated.id, fileUrl: updated.fileUrl, filePath: updated.filePath,
             fileType: updated.fileType as FileType, fileName: updated.fileName, sizeBytes: updated.sizeBytes };
  } catch (e) {
    await prisma.upload.update({ where: { id: record.id }, data: { status: "FAILED" } });
    throw e;
  }
}

// ── Raw buffer upload — for storage consumers that don't fit the Upload model ─
// Invoices aren't a worker/employer-uploaded document (no FileType, no MIME
// validation, no review workflow) — they're a generated file the server
// itself writes and needs to store + later sign a URL for. Reuses the exact
// same supabaseUpload/localUpload provider branch as uploadFile() below,
// just without creating an Upload row for it.
export async function uploadRawBuffer(
  filePath: string, buffer: Buffer, mimeType: string, isPrivate: boolean,
): Promise<string> {
  if (process.env.STORAGE_PROVIDER === "supabase") {
    return supabaseUpload(buffer, filePath, mimeType, isPrivate);
  }
  return localUpload(buffer, filePath);
}

// ── Signed URL for a private raw-buffer file (e.g. an Invoice.filePath) ──────
// Same SIGNED_URL_EXPIRY_SECONDS constant every other signed-URL call site in
// this codebase already shares (uploads.controller.ts, admin-documents.
// controller.ts, admin.controller.ts, employer.controller.ts) — this is the
// sixth, kept in sync rather than hardcoding a new expiry.
export async function getSignedUrlForPath(filePath: string): Promise<string> {
  if (process.env.STORAGE_PROVIDER === "supabase") {
    const client = getStorageClient();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET!;
    const { data, error } = await client.storage.from(bucket).createSignedUrl(filePath, SIGNED_URL_EXPIRY_SECONDS);
    if (error || !data?.signedUrl) throw new Error(`Failed to sign URL for ${filePath}: ${error?.message ?? "unknown error"}`);
    return data.signedUrl;
  }
  const appUrl = process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
  return `${appUrl}/uploads/${filePath}`;
}

// ── Health check — cheap Supabase connectivity probe ──────────────────────────
// Used by services/health-monitor. `.list("", { limit: 1 })` is the cheapest
// real round-trip available on the storage client — it confirms the service
// key, project URL, and bucket name all resolve, without uploading/reading
// any actual file content. Throws on failure; callers decide what to do with
// that (this module never sends alerts itself).
export async function checkStorageConnectivity(): Promise<void> {
  const client = getStorageClient();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET!;
  const { error } = await client.storage.from(bucket).list("", { limit: 1 });
  if (error) throw new Error(`Supabase storage list failed: ${error.message}`);
}

export async function deleteFile(uploadId: string, userId: string): Promise<void> {
  const record = await prisma.upload.findFirst({ where: { id: uploadId, userId } });
  if (!record) throw new Error("File not found");

  if (process.env.STORAGE_PROVIDER === "supabase") {
    const client = getStorageClient();
    await client.storage.from(process.env.SUPABASE_STORAGE_BUCKET!).remove([record.filePath]);
  } else {
    await localDelete(record.filePath);
  }

  await prisma.upload.update({ where: { id: uploadId }, data: { status: "DELETED", deletedAt: new Date() } });
}
