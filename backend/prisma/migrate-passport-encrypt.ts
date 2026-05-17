/**
 * One-shot data migration: re-encrypt passport numbers from the old
 * lib/encrypt.ts format (base64url, 12-byte IV, ENCRYPTION_KEY) to the
 * new EncryptionService format (base64, 16-byte IV, ENCRYPTION_LOCAL_KEY).
 *
 * Run once after deploying the schema rename:
 *   npx tsx prisma/migrate-passport-encrypt.ts
 *
 * Safe to re-run: values already in new format are skipped.
 */

import "dotenv/config";
import crypto from "crypto";
import prisma from "../src/lib/prisma";
import { EncryptionService } from "../src/encryption/encryption.service";

// ── Old decrypt (lib/encrypt.ts format) ──────────────────────────────────────
// Algorithm : aes-256-gcm
// IV length : 12 bytes
// Tag length: 16 bytes
// Encoding  : base64url

const OLD_IV_LEN  = 12;
const OLD_TAG_LEN = 16;
// Minimum length for old format in base64url chars: ceil((12+16+1)*4/3) = 39
const OLD_MIN_LEN = 39;

function oldKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY ?? "";
  if (hex.length !== 64)
    throw new Error("ENCRYPTION_KEY must be 64 hex chars");
  return Buffer.from(hex, "hex");
}

function oldDecrypt(encoded: string): string {
  const buf     = Buffer.from(encoded, "base64url");
  const iv      = buf.subarray(0, OLD_IV_LEN);
  const tag     = buf.subarray(OLD_IV_LEN, OLD_IV_LEN + OLD_TAG_LEN);
  const payload = buf.subarray(OLD_IV_LEN + OLD_TAG_LEN);
  const d = crypto.createDecipheriv("aes-256-gcm", oldKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(payload), d.final()]).toString("utf8");
}

// ── Detection helpers ─────────────────────────────────────────────────────────

function looksLikeOldFormat(value: string): boolean {
  // base64url uses only [A-Za-z0-9-_], no + or /
  return (
    value.length >= OLD_MIN_LEN &&
    /^[A-Za-z0-9_-]+$/.test(value) &&
    !/[+/]/.test(value)
  );
}

async function looksLikeNewFormat(value: string): Promise<boolean> {
  try {
    await EncryptionService.decrypt(value);
    return true;
  } catch {
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const workers = await prisma.workerProfile.findMany({
    where:  { passportNumberEnc: { not: null } },
    select: { userId: true, passportNumberEnc: true },
  });

  console.log(`Found ${workers.length} worker(s) with a non-null passportNumberEnc.`);

  let skipped  = 0;
  let migrated = 0;
  let errors   = 0;

  for (const w of workers) {
    const value = w.passportNumberEnc!;

    // Already in new EncryptionService format → skip
    if (await looksLikeNewFormat(value)) {
      console.log(`  Worker ${w.userId}: already in new format — skipped`);
      skipped++;
      continue;
    }

    let plaintext: string;

    if (looksLikeOldFormat(value)) {
      try {
        plaintext = oldDecrypt(value);
      } catch (e) {
        console.error(`  Worker ${w.userId}: old-format decrypt failed — skipping`, e);
        errors++;
        continue;
      }
    } else {
      // Doesn't match old format either → treat as accidental plaintext
      plaintext = value;
      console.warn(`  Worker ${w.userId}: value looks like plaintext, will encrypt`);
    }

    const encrypted = await EncryptionService.encrypt(plaintext);
    await prisma.workerProfile.update({
      where: { userId: w.userId },
      data:  { passportNumberEnc: encrypted },
    });

    console.log(`  Encrypted passport for worker ${w.userId}`);
    migrated++;
  }

  console.log(`\nDone. migrated=${migrated} skipped=${skipped} errors=${errors}`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
