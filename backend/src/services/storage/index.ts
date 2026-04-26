// backend/src/services/storage/index.ts
import path from "path";
import fs   from "fs";
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
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const bucket = process.env.SUPABASE_STORAGE_BUCKET!;
  const { error } = await client.storage.from(bucket).upload(filePath, buffer, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`Supabase upload: ${error.message}`);
  if (isPrivate) return filePath;
  const { data } = client.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
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

export async function deleteFile(uploadId: string, userId: string): Promise<void> {
  const record = await prisma.upload.findFirst({ where: { id: uploadId, userId } });
  if (!record) throw new Error("File not found");

  if (process.env.STORAGE_PROVIDER === "supabase") {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    await client.storage.from(process.env.SUPABASE_STORAGE_BUCKET!).remove([record.filePath]);
  } else {
    await localDelete(record.filePath);
  }

  await prisma.upload.update({ where: { id: uploadId }, data: { status: "DELETED", deletedAt: new Date() } });
}
