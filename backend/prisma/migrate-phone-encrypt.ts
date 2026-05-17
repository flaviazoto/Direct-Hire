/**
 * One-shot data migration: encrypt existing plaintext phone numbers on the
 * User table for both worker and employer accounts.
 *
 * Phone was stored in plaintext in "phoneEnc" (previously "phone") before
 * encryption was introduced. This script detects unencrypted values and
 * re-encrypts them with EncryptionService.
 *
 * Run once after deploying the schema rename:
 *   npx tsx prisma/migrate-phone-encrypt.ts
 *
 * Safe to re-run: values already in EncryptionService format are skipped.
 */

import "dotenv/config";
import prisma from "../src/lib/prisma";
import { EncryptionService } from "../src/encryption/encryption.service";

// ── Detection ─────────────────────────────────────────────────────────────────
// New-format values are standard base64 (may contain + / =).
// Plaintext phone numbers are short digit/symbol strings that cannot be valid
// base64-encoded AES-GCM output (minimum 44 chars for 16-byte IV + 16-byte tag).

const NEW_FORMAT_MIN_LEN = 44; // base64(16+16+1) = ceil(33*4/3) = 44

function looksLikeNewFormat(value: string): boolean {
  return value.length >= NEW_FORMAT_MIN_LEN && /^[A-Za-z0-9+/]+=*$/.test(value);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const users = await prisma.user.findMany({
    where:  { phoneEnc: { not: null } },
    select: { id: true, role: true, phoneEnc: true },
  });

  console.log(`Found ${users.length} user(s) with a non-null phoneEnc.`);

  let skipped  = 0;
  let migrated = 0;
  let errors   = 0;

  for (const u of users) {
    const value = u.phoneEnc!;

    // Already encrypted in new format → skip
    if (looksLikeNewFormat(value)) {
      try {
        await EncryptionService.decrypt(value);
        console.log(`  User ${u.id} (${u.role}): already in new format — skipped`);
        skipped++;
        continue;
      } catch {
        // Passes the length/charset check but fails to decrypt → treat as plaintext
      }
    }

    // Plaintext (or unrecognised) → encrypt
    try {
      const encrypted = await EncryptionService.encrypt(value);
      await prisma.user.update({
        where: { id: u.id },
        data:  { phoneEnc: encrypted },
      });
      console.log(`  Encrypted phone for user ${u.id} (${u.role})`);
      migrated++;
    } catch (e) {
      console.error(`  User ${u.id}: failed to encrypt —`, e);
      errors++;
    }
  }

  console.log(`\nDone. migrated=${migrated} skipped=${skipped} errors=${errors}`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
