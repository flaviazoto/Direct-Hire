/**
 * GDPR Art. 17 — Right to Erasure
 *
 * Pseudonymises a worker's personal data without deleting the User row.
 * The UUID and all relational records (applications, payments, audit log)
 * remain intact for referential integrity and legal hold.
 *
 * Fields nulled / overwritten:
 *   User           — email, phoneEnc, status → BANNED
 *   WorkerProfile  — firstName, lastName, dateOfBirth, city, address,
 *                    passportNumberEnc, fatherName, motherName, spouseName
 *   OnboardingProgress — draftData cleared
 *   Upload rows    — soft-deleted (deletedAt set); actual file removal queued
 *
 * NOT erased (pseudonymised by the email → erased_<id>@deleted.invalid):
 *   AuditLog / AdminAuditLog entries — required for compliance audit trail
 *   Applications, Payments          — required for financial records
 */

import prisma from "../lib/prisma";
import { enqueue } from "../services/queue";
import { insertAdminAuditLog } from "../lib/audit";

const ERASURE_PLACEHOLDER_EMAIL = (id: string) => `erased_${id}@deleted.invalid`;

export async function eraseWorker(workerId: string, requestingAdminId: string): Promise<void> {
  // 1. Fetch uploads before the transaction so we can queue deletions after commit.
  const uploads = await prisma.upload.findMany({
    where: {
      userId:    workerId,
      deletedAt: null,
      fileType:  { in: ["PROFILE_PHOTO", "WORK_VIDEO", "INTRO_VIDEO", "MEDICAL_CERTIFICATE"] },
    },
    select: { id: true, filePath: true, fileUrl: true },
  });

  const storageProvider =
    (process.env.STORAGE_PROVIDER === "supabase" ? "supabase" : "local") as
      "supabase" | "local";

  // 2. All PII field overwrites in one transaction.
  await prisma.$transaction(async (tx) => {
    // User row — anonymise email, wipe phone, lock account
    await tx.user.update({
      where: { id: workerId },
      data: {
        email:    ERASURE_PLACEHOLDER_EMAIL(workerId),
        phoneEnc: null,
        status:   "BANNED",
      },
    });

    // WorkerProfile — wipe personal and family fields
    await tx.workerProfile.update({
      where: { userId: workerId },
      data: {
        firstName:         "ERASED",
        lastName:          "ERASED",
        dateOfBirth:       null,
        city:              null,
        address:           null,
        passportNumberEnc: null,
        fatherName:        null,
        motherName:        null,
        spouseName:        null,
      },
    });

    // OnboardingProgress — clear draft data that may hold PII
    await tx.onboardingProgress.updateMany({
      where: { userId: workerId },
      data:  { draftData: {} },
    });

    // Soft-delete uploads so they stop appearing in any worker DTO
    if (uploads.length > 0) {
      await tx.upload.updateMany({
        where: { id: { in: uploads.map(u => u.id) } },
        data:  { deletedAt: new Date(), status: "DELETED" },
      });
    }
  });

  // 3. Queue file deletion jobs after the transaction commits.
  //    Failures here are non-fatal — the DB is already anonymised.
  for (const upload of uploads) {
    await enqueue("storage.fileDelete", {
      uploadId: upload.id,
      userId:   workerId,
      filePath: upload.filePath,
      provider: storageProvider,
    }).catch((err: unknown) =>
      console.error(`[GDPR] Failed to queue file deletion for upload ${upload.id}:`, err),
    );
  }

  // 4. Audit log entry — written outside the transaction so it always persists,
  //    even if file-deletion queuing fails.
  await insertAdminAuditLog({
    actorId:  requestingAdminId,
    targetId: workerId,
    action:   "WORKER_ERASED",
    notes:    "GDPR Art.17 erasure",
    metadata: { uploadCount: uploads.length },
  });

  console.log(
    `[GDPR] Worker ${workerId} erased by admin ${requestingAdminId}. ` +
    `${uploads.length} file deletion job(s) queued.`,
  );
}
