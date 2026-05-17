/**
 * Key rotation service.
 *
 * Intended as a one-off admin script, not an HTTP endpoint:
 *   npx tsx -e "require('./src/encryption/key-rotation.service').reEncryptAll()"
 *   npx tsx -e "require('./src/encryption/key-rotation.service').reEncryptAll('arn:aws:kms:eu-west-1:...')"
 *
 * What it does:
 *   - Fetches all WorkerProfile rows in batches of 100
 *   - Decrypts passportNumberEnc and phoneEnc using the CURRENT configured key
 *   - Re-encrypts both using the NEW key (newKeyArn → KMS, or current configured key if omitted)
 *   - Updates the DB row atomically per worker
 *   - On any per-worker failure: logs the error and continues — never aborts mid-run
 *   - Writes a KEY_ROTATION_COMPLETE entry to AuditLog with success/failure counts
 *
 * Note: employer-only phoneEnc values (users with role=EMPLOYER who are not
 * in WorkerProfile) are NOT covered here. If employers also need rotation,
 * run a separate pass over prisma.user.findMany({ where: { role: 'EMPLOYER' } }).
 */

import "dotenv/config";
import crypto from "crypto";
import { KMSClient, GenerateDataKeyCommand } from "@aws-sdk/client-kms";
import prisma from "../lib/prisma";
import { EncryptionService } from "./encryption.service";

const BATCH_SIZE    = 100;
const IV_BYTES      = 16;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES     = 32;

// ── New-key encryptor ─────────────────────────────────────────────────────────
// Used when rotating to a different KMS CMK (newKeyArn is provided).
// Mirrors kmsEncrypt() in encryption.service.ts but targets an explicit key ARN
// so the current AWS_KMS_KEY_ID env var doesn't need to be changed first.

async function encryptWithNewKmsKey(plaintext: string, keyArn: string): Promise<string> {
  const client = new KMSClient({ region: process.env.AWS_REGION ?? "eu-west-1" });

  const { Plaintext, CiphertextBlob } = await client.send(
    new GenerateDataKeyCommand({ KeyId: keyArn, KeySpec: "AES_256" }),
  );

  if (!Plaintext || !CiphertextBlob)
    throw new Error("KMS GenerateDataKey returned incomplete response");

  const dataKey    = Buffer.from(Plaintext);
  const encDataKey = Buffer.from(CiphertextBlob);

  const iv      = crypto.randomBytes(IV_BYTES);
  const cipher  = crypto.createCipheriv("aes-256-gcm", dataKey.subarray(0, KEY_BYTES), iv);
  const payload = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag     = cipher.getAuthTag();

  dataKey.fill(0); // wipe plaintext key material from memory

  // Layout: encDataKey_len (4 BE) | encDataKey | iv (16) | authTag (16) | ciphertext
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(encDataKey.length, 0);

  return Buffer.concat([lenBuf, encDataKey, iv, tag, payload]).toString("base64");
}

// ── Main rotation function ────────────────────────────────────────────────────

/**
 * @param newKeyArn  KMS ARN of the new CMK.
 *                   - Provided  → decrypt with current key, re-encrypt with newKeyArn (KMS).
 *                   - Omitted   → re-encrypt with the currently configured EncryptionService
 *                                 (useful after updating ENCRYPTION_LOCAL_KEY or for format
 *                                 migration between local and KMS modes).
 */
export async function reEncryptAll(newKeyArn?: string): Promise<void> {
  const encryptFn = newKeyArn
    ? (pt: string) => encryptWithNewKmsKey(pt, newKeyArn)
    : (pt: string) => EncryptionService.encrypt(pt);

  console.log(
    `[KEY_ROTATION] Starting. Target key: ${newKeyArn ?? "(current configured key)"}`,
  );

  let successCount = 0;
  let failCount    = 0;
  let skip         = 0;

  while (true) {
    const batch = await prisma.workerProfile.findMany({
      skip,
      take: BATCH_SIZE,
      select: {
        userId:            true,
        passportNumberEnc: true,
        user: { select: { id: true, phoneEnc: true } },
      },
    });

    if (batch.length === 0) break;

    for (const worker of batch) {
      try {
        let newPassportEnc: string | undefined;
        let newPhoneEnc:    string | undefined;

        if (worker.passportNumberEnc) {
          const plain  = await EncryptionService.decrypt(worker.passportNumberEnc);
          newPassportEnc = await encryptFn(plain);
        }

        if (worker.user.phoneEnc) {
          const plain = await EncryptionService.decrypt(worker.user.phoneEnc);
          newPhoneEnc = await encryptFn(plain);
        }

        // Atomic update: both fields succeed or neither is written
        await prisma.$transaction([
          ...(newPassportEnc !== undefined
            ? [prisma.workerProfile.update({
                where: { userId: worker.userId },
                data:  { passportNumberEnc: newPassportEnc },
              })]
            : []),
          ...(newPhoneEnc !== undefined
            ? [prisma.user.update({
                where: { id: worker.user.id },
                data:  { phoneEnc: newPhoneEnc },
              })]
            : []),
        ]);

        console.log(`[KEY_ROTATION]   ✓ worker ${worker.userId}`);
        successCount++;
      } catch (err) {
        // Never abort mid-run — log and move on
        console.error(`[KEY_ROTATION]   ✗ worker ${worker.userId}:`, err);
        failCount++;
      }
    }

    skip += batch.length;
    if (batch.length < BATCH_SIZE) break; // last page
  }

  // ── Audit log entry ───────────────────────────────────────────────────────
  // Written to the general AuditLog table (free-form actions, no FK constraints)
  // so this system-level event doesn't require an admin user ID.
  const notes = `Re-encrypted ${successCount} workers, ${failCount} failures`;
  try {
    await prisma.auditLog.create({
      data: {
        action:   "KEY_ROTATION_COMPLETE",
        entity:   "System",
        newValue: {
          successCount,
          failCount,
          newKeyArn:   newKeyArn ?? null,
          completedAt: new Date().toISOString(),
        },
      },
    });
  } catch (auditErr) {
    console.error("[KEY_ROTATION] Failed to write audit log:", auditErr);
  }

  console.log(`[KEY_ROTATION] ${notes}`);

  if (failCount > 0) {
    console.warn(
      `[KEY_ROTATION] ${failCount} worker(s) could not be re-encrypted. ` +
      "Inspect the errors above and re-run for those rows before retiring the old key.",
    );
  }
}
