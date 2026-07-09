// backend/scripts/backfill-worker-phones.ts
// Phone silent-drop backfill. During onboarding, `phone` was collected and
// required client-side (frontend/src/app/(app)/worker/onboarding/page.tsx)
// but persistWorkerStep never wrote it anywhere queryable — it only ever
// survived inside OnboardingProgress.draftData JSON (see saveStep's merge:
// `{ ...existing, [`step_${step}`]: data, ...data }`, so a phone submitted
// at step 1 exists both flat at draftData.phone and nested at
// draftData.step_1.phone).
//
// This script recovers it: for every WorkerProfile with phone still NULL,
// read the worker's OnboardingProgress.draftData, extract phone if present,
// encrypt it with the current lib/encrypt.ts (same format/key as
// passportNumber on the same table), and write it to WorkerProfile.phone.
//
// Follows the exact pattern proven in reencrypt-passports.ts: pg over
// DIRECT_URL (not Prisma, so this doesn't depend on client regeneration
// timing), dry-run by default, per-row try/catch, no plaintext logged,
// LEFT JOINs throughout (an inner join silently dropped orphaned rows in
// the passport script's first draft — not repeating that here).
//
// Run:
//   npm run backfill:worker-phones              (dry run — no writes)
//   npm run backfill:worker-phones -- --execute  (writes WorkerProfile.phone)

import "dotenv/config";
import { Client } from "pg";
import { encrypt } from "../src/lib/encrypt";

const EXECUTE = process.argv.includes("--execute") || process.argv.includes("--apply");

function isPlausiblePhone(s: string): boolean {
  // Loose on purpose — phone formats vary wildly by country (spaces, +, (),
  // dashes). Just reject empty/absurdly long/obviously-not-a-phone strings.
  return s.length > 0 && s.length < 40 && /^[0-9+()\-.\s]+$/.test(s);
}

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
  id:        string;
  userId:    string;
  email:     string | null;
  draftData: Record<string, unknown> | null;
  phone:     string | null;
}

function extractPhone(draftData: Record<string, unknown> | null): string | undefined {
  if (!draftData) return undefined;
  const flat = draftData.phone;
  if (typeof flat === "string" && flat.trim()) return flat.trim();
  const step1 = draftData.step_1 as Record<string, unknown> | undefined;
  const nested = step1?.phone;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  return undefined;
}

async function main() {
  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    console.error("FATAL: DIRECT_URL is not set (expected the non-pooled, port-5432 connection string).");
    process.exit(1);
  }

  console.log(`[backfill-worker-phones] mode: ${EXECUTE ? "EXECUTE (will write phone)" : "DRY RUN (no writes)"}`);

  const client = new Client({ connectionString });
  await client.connect();

  // LEFT JOINs throughout — a WorkerProfile with no matching User or no
  // OnboardingProgress row must still be considered, not silently dropped.
  const { rows } = await client.query<Row>(
    `SELECT wp.id, wp."userId", u.email, op."draftData", wp.phone
       FROM "WorkerProfile" wp
       LEFT JOIN "User" u ON u.id = wp."userId"
       LEFT JOIN "OnboardingProgress" op ON op."userId" = wp."userId"
      WHERE wp.phone IS NULL
      ORDER BY wp.id`,
  );

  console.log(`[backfill-worker-phones] found ${rows.length} WorkerProfile row(s) with phone still NULL`);

  let foundInDraft   = 0;
  let backfilled     = 0;
  let noPhoneInDraft = 0;
  const failures: { id: string; error: string }[] = [];

  for (const row of rows) {
    const domain = emailDomain(row.email);

    try {
      const phone = extractPhone(row.draftData);

      if (!phone) {
        noPhoneInDraft++;
        console.log(`[backfill-worker-phones] NO-DRAFT-PHONE ${row.id} (${domain})`);
        continue;
      }

      if (!isPlausiblePhone(phone)) {
        throw new Error(`draft value doesn't look like a phone number (length ${phone.length})`);
      }

      foundInDraft++;
      const preview = mask(phone);

      if (!EXECUTE) {
        console.log(`[backfill-worker-phones] OK    ${row.id} (${domain}) — found in draft, preview: ${preview}`);
        continue;
      }

      const encrypted = encrypt(phone);

      await client.query(
        `UPDATE "WorkerProfile" SET "phone" = $1 WHERE id = $2`,
        [encrypted, row.id],
      );

      backfilled++;
      console.log(`[backfill-worker-phones] BACKFILLED ${row.id} (${domain}) — preview: ${preview}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      failures.push({ id: row.id, error: message });
      console.error(`[backfill-worker-phones] FAIL  ${row.id} (${domain}) — ${message}`);
    }
  }

  console.log("");
  console.log(
    `[backfill-worker-phones] ${EXECUTE ? "done" : "dry run complete"} — ` +
    `found-in-draft: ${foundInDraft}, ${EXECUTE ? `backfilled: ${backfilled}, ` : ""}` +
    `no-phone-in-draft: ${noPhoneInDraft}, failed: ${failures.length}`,
  );

  if (failures.length > 0) {
    console.log(`[backfill-worker-phones] failed row ids: ${failures.map(f => f.id).join(", ")}`);
  }

  await client.end();

  if (failures.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[backfill-worker-phones] FATAL:", e);
  process.exit(1);
});
