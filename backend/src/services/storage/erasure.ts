// backend/src/services/storage/erasure.ts
// Removes a deleted account's files from storage, with retries.
//
// Every per-user file lives under "<userId>/" (uploads, application
// documents, employer document requests). Invoices live under
// "invoices/<userId>/" and are deliberately NOT erased here: they are
// financial records kept for accounting.

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import prisma from "../../lib/prisma";

const MAX_ATTEMPTS = 10;
const JOB_NAME = "storage-cleanup";

function storageClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function listAll(client: ReturnType<typeof storageClient>, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: pageSize, offset });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    for (const entry of data ?? []) {
      const full = `${prefix}/${entry.name}`;
      // Folders come back without an id.
      if (entry.id === null) files.push(...await listAll(client, bucket, full));
      else files.push(full);
    }
    if (!data || data.length < pageSize) break;
  }
  return files;
}

/** Deletes every object under the prefix. Safe to call repeatedly. */
export async function removeStoragePrefix(prefix: string): Promise<number> {
  if (!prefix || prefix.includes("..") || prefix.startsWith("/") || prefix.startsWith("invoices")) {
    throw new Error(`Refusing to erase storage prefix "${prefix}"`);
  }
  if (process.env.STORAGE_PROVIDER === "supabase") {
    const client = storageClient();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET!;
    const files = await listAll(client, bucket, prefix);
    for (let i = 0; i < files.length; i += 100) {
      const { error } = await client.storage.from(bucket).remove(files.slice(i, i + 100));
      if (error) throw new Error(`remove: ${error.message}`);
    }
    return files.length;
  }
  const dir = path.join(process.cwd(), ".uploads", prefix);
  if (!fs.existsSync(dir)) return 0;
  const count = fs.readdirSync(dir, { recursive: true }).length;
  await fs.promises.rm(dir, { recursive: true, force: true });
  return count;
}

async function attempt(id: string, prefix: string): Promise<boolean> {
  try {
    await removeStoragePrefix(prefix);
    await prisma.storageDeletion.update({
      where: { id }, data: { completedAt: new Date(), attempts: { increment: 1 }, lastError: null },
    });
    return true;
  } catch (e) {
    await prisma.storageDeletion.update({
      where: { id }, data: { attempts: { increment: 1 }, lastError: (e instanceof Error ? e.message : String(e)).slice(0, 500) },
    });
    return false;
  }
}

/** Queue erasure for a deleted user and try once immediately. Never throws. */
export async function eraseUserStorage(userId: string): Promise<void> {
  try {
    const row = await prisma.storageDeletion.create({ data: { prefix: userId } });
    await attempt(row.id, row.prefix);
  } catch (e) {
    console.error("[storage-erasure] could not queue erasure:", e instanceof Error ? e.message : e);
  }
}

/** Scheduled retry of any erasure that hasn't completed yet. */
export async function runStorageCleanup(): Promise<void> {
  const startedAt = new Date();
  const pending = await prisma.storageDeletion.findMany({
    where: { completedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  let done = 0;
  for (const row of pending) if (await attempt(row.id, row.prefix)) done++;
  const failed = pending.length - done;
  const completedAt = new Date();
  await prisma.jobRunLog.create({
    data: {
      jobName: JOB_NAME,
      status: failed === 0 ? "success" : done > 0 ? "partial" : "failed",
      recordsProcessed: done,
      recordsFailed: failed,
      errorMessage: failed ? `${failed} storage erasure(s) still pending` : null,
      startedAt, completedAt, durationMs: completedAt.getTime() - startedAt.getTime(),
    },
  });
}
