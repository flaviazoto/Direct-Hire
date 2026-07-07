// backend/scripts/reencrypt-passports.ts
// Phase 2 Part A — populate WorkerProfile.passportNumber from the legacy
// passportNumberEnc column.
//
// CORRECTED UNDERSTANDING (from the --inspect/--try-current-format diagnostic
// run against production): passportNumberEnc is NOT in some divergent-branch
// format. It's already ciphertext in the CURRENT, live backend/src/lib/encrypt.ts
// format — base64url, 12-byte IV, ENCRYPTION_KEY — identical to passportNumber
// itself. All 4 production rows decrypted cleanly with the current decrypt().
// There is no legacy format to convert from in this database. The
// divergent-branch EncryptionService/localEncrypt format (base64, 16-byte IV,
// ENCRYPTION_LOCAL_KEY) that earlier turns assumed was never actually written
// to this database — that one-shot migration script evidently ran somewhere
// else, not here.
//
// So the migration is now a same-format round trip, not a format conversion:
//   plaintext       = decrypt(passportNumberEnc)   -- lib/encrypt.ts, as-is
//   passportNumber  = encrypt(plaintext)            -- fresh IV, same format
//
// Uses raw `pg` (not Prisma) because passportNumberEnc is a legacy column
// Prisma's client doesn't know about (same reasoning as export-db-backup.ts).
//
// Safety: idempotent (skips rows that already have passportNumber set),
// dry-run by default, per-row try/catch (one bad row never aborts the
// batch), never prints full passport numbers or full email addresses,
// never touches or drops passportNumberEnc (it remains a second backup).
//
// Run:
//   npm run reencrypt:passports                (dry run — decrypts + validates + sanity report only)
//   npm run reencrypt:passports -- --execute   (writes passportNumber, then verifies)
//   npm run reencrypt:passports -- --apply     (alias for --execute)

import "dotenv/config";
import { Client } from "pg";
import { encrypt, decrypt } from "../src/lib/encrypt";

const EXECUTE = process.argv.includes("--execute") || process.argv.includes("--apply");

// ── Validation ────────────────────────────────────────────────────────────────
// Plausible passport string: non-empty, printable ASCII, under 30 chars.
function isPlausiblePassport(s: string): boolean {
  return s.length > 0 && s.length < 30 && /^[\x20-\x7E]+$/.test(s);
}

// ── Masking — never log full passport numbers or full email addresses ───────
function mask(s: string): string {
  if (s.length <= 4) return "*".repeat(s.length);
  return s.slice(0, 2) + "*".repeat(s.length - 4) + s.slice(-2);
}

function emailDomain(email: string | null): string {
  if (email == null) return "(orphaned — no matching User row)";
  const at = email.indexOf("@");
  return at === -1 ? "(no @)" : email.slice(at);
}

interface Row {
  id:                string;
  userId:            string;
  email:             string | null; // null when the WorkerProfile is orphaned (no matching User row)
  passportNumberEnc: string;
  passportNumber:    string | null;
}

async function main() {
  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    console.error("FATAL: DIRECT_URL is not set (expected the non-pooled, port-5432 connection string).");
    process.exit(1);
  }

  console.log(`[reencrypt-passports] mode: ${EXECUTE ? "EXECUTE (will write passportNumber)" : "DRY RUN (no writes)"}`);

  const client = new Client({ connectionString });
  await client.connect();

  // LEFT JOIN, not JOIN — a handful of WorkerProfile rows are orphaned (their
  // User row no longer exists) and must still be migrated; an inner join
  // would silently drop them from this query entirely.
  const { rows } = await client.query<Row>(
    `SELECT wp.id, wp."userId", u.email, wp."passportNumberEnc", wp."passportNumber"
       FROM "WorkerProfile" wp
       LEFT JOIN "User" u ON u.id = wp."userId"
      WHERE wp."passportNumberEnc" IS NOT NULL
      ORDER BY wp.id`,
  );

  console.log(`[reencrypt-passports] found ${rows.length} row(s) with a non-null passportNumberEnc`);

  let migrated = 0;
  let skipped  = 0;
  const failures: { id: string; error: string }[] = [];
  // Kept in memory only for the distinct-value sanity check below — never
  // logged, never written anywhere except as a re-encrypted passportNumber.
  const decryptedValues: string[] = [];

  for (const row of rows) {
    const domain = emailDomain(row.email);

    if (row.passportNumber != null) {
      skipped++;
      console.log(`[reencrypt-passports] SKIP  ${row.id} (${domain}) — passportNumber already set`);
      continue;
    }

    try {
      const plaintext = decrypt(row.passportNumberEnc);

      if (!isPlausiblePassport(plaintext)) {
        throw new Error(`decrypted value doesn't look like a passport number (length ${plaintext.length})`);
      }

      decryptedValues.push(plaintext);
      const preview = mask(plaintext);

      if (!EXECUTE) {
        console.log(`[reencrypt-passports] OK    ${row.id} (${domain}) — decrypt succeeded, preview: ${preview}`);
        continue;
      }

      const reEncrypted = encrypt(plaintext);

      await client.query(
        `UPDATE "WorkerProfile" SET "passportNumber" = $1 WHERE id = $2`,
        [reEncrypted, row.id],
      );

      migrated++;
      console.log(`[reencrypt-passports] MIGRATED ${row.id} (${domain}) — preview: ${preview}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      failures.push({ id: row.id, error: message });
      console.error(`[reencrypt-passports] FAIL  ${row.id} (${domain}) — ${message}`);
    }
  }

  // ── Data-sanity report — counts only, never the values themselves ─────────
  if (decryptedValues.length > 0) {
    const distinct = new Set(decryptedValues).size;
    console.log("");
    console.log(`[reencrypt-passports] data sanity: ${decryptedValues.length} value(s) decrypted, ${distinct} distinct`);
    if (distinct < decryptedValues.length) {
      console.log(
        `[reencrypt-passports] ⚠ ${decryptedValues.length} workers share only ${distinct} distinct passport number(s) — ` +
        `almost certainly seed/test data, not real production PII. Verify before treating this as a real user-data migration.`,
      );
    }
  }

  console.log("");
  console.log(`[reencrypt-passports] ${EXECUTE ? "done" : "dry run complete"} — ` +
    `${EXECUTE ? `migrated: ${migrated}, ` : ""}skipped: ${skipped}, failed: ${failures.length}`);

  if (failures.length > 0) {
    console.log(`[reencrypt-passports] failed row ids: ${failures.map(f => f.id).join(", ")}`);
  }

  if (EXECUTE) {
    const { rows: verifyRows } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM "WorkerProfile"
        WHERE "passportNumberEnc" IS NOT NULL
          AND "passportNumber" IS NULL`,
    );
    const remaining = parseInt(verifyRows[0]?.count ?? "0", 10);
    console.log(`[reencrypt-passports] verification: ${remaining} row(s) still missing passportNumber ` +
      `(expected: 0, or ${failures.length} if some rows failed decryption)`);
  }

  await client.end();

  if (failures.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[reencrypt-passports] FATAL:", e);
  process.exit(1);
});
