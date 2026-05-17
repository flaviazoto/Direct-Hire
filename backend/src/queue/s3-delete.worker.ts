/**
 * storage.fileDelete BullMQ worker
 *
 * Processes deferred file deletion jobs queued by erasure.service.ts.
 * Supports Supabase Storage and AWS S3 based on the job payload provider.
 *
 * Run (production):
 *   npx tsx backend/src/queue/s3-delete.worker.ts
 */

import "dotenv/config";
import { Worker, Job } from "bullmq";
import type { JobPayload } from "../services/queue";

type DeletePayload = JobPayload["storage.fileDelete"];

async function deleteFromSupabase(filePath: string): Promise<void> {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error } = await client.storage
    .from(process.env.SUPABASE_STORAGE_BUCKET!)
    .remove([filePath]);
  if (error) throw new Error(`Supabase remove failed: ${error.message}`);
}

async function deleteFromS3(filePath: string): Promise<void> {
  const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region: process.env.AWS_REGION ?? "eu-west-1" });
  await client.send(
    new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key:    filePath,
    }),
  );
}

async function deleteFromLocal(filePath: string): Promise<void> {
  const fs   = await import("fs/promises");
  const path = await import("path");
  const fullPath = path.join(process.cwd(), ".uploads", filePath);
  await fs.unlink(fullPath).catch(() => {});
}

const redis = { url: process.env.REDIS_URL! };

const worker = new Worker(
  "directhire",
  async (job: Job) => {
    // This worker shares the queue with other job types — skip non-storage jobs.
    if (job.name !== "storage.fileDelete") return;

    const { uploadId, filePath, provider } = job.data as DeletePayload;
    console.log(`[s3-delete] upload=${uploadId} provider=${provider} path=${filePath}`);

    switch (provider) {
      case "supabase": await deleteFromSupabase(filePath); break;
      case "local":    await deleteFromLocal(filePath);    break;
      default:         await deleteFromS3(filePath);       break;
    }

    console.log(`[s3-delete] Deleted upload ${uploadId}`);
  },
  { connection: redis },
);

worker.on("completed", (job) => {
  if (job.name === "storage.fileDelete") {
    console.log(`[s3-delete] Job ${job.id} completed.`);
  }
});

worker.on("failed", (job, err) => {
  if (job?.name === "storage.fileDelete") {
    console.error(`[s3-delete] Job ${job.id} failed (attempt ${job.attemptsMade}):`, err.message);
  }
});

process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});

console.log("[s3-delete] Worker listening for storage.fileDelete jobs...");
