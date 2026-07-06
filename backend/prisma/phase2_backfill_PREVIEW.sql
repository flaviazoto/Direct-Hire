-- ============================================================================
-- PHASE 2 BACKFILL PREVIEW — DO NOT RUN AUTOMATICALLY
-- ============================================================================
-- This file lives OUTSIDE prisma/migrations/ on purpose: `prisma migrate
-- deploy` only executes folders under prisma/migrations/, so this file is
-- inert as far as that command is concerned. It is a preview for manual
-- review only. Nothing here has been executed against any database.
--
-- Prerequisite: Phase 1 (prisma/migrations/20260704120000_phase1_additive_reconcile)
-- must already be applied — this backfill assumes the new nullable columns
-- (WorkerProfile.passportNumber, Payment.userId/amount/stripeInvoiceId/
-- stripePaymentId) already exist.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PART A — WorkerProfile.passportNumberEnc -> passportNumber
-- ----------------------------------------------------------------------------
-- THIS CANNOT BE DONE AS PLAIN SQL. Per Step 2's finding, the two columns
-- use genuinely incompatible AES-256-GCM encodings:
--
--   passportNumberEnc (current prod data):
--     format   : base64 (standard, with +/ and padding)
--     IV length: 16 bytes
--     key      : process.env.ENCRYPTION_LOCAL_KEY
--     source   : backend/src/encryption/encryption.service.ts (EncryptionService),
--                introduced on branch `railway/code-change-d2hB2S`
--                (commit b071fdc, not merged into main), written by the
--                one-shot script backend/prisma/migrate-passport-encrypt.ts
--                on that branch.
--
--   passportNumber (what current main's code reads via lib/encrypt.ts):
--     format   : base64url (no +/, no padding)
--     IV length: 12 bytes
--     key      : process.env.ENCRYPTION_KEY
--
-- Both env vars happen to hold the SAME 64-hex-char key value in the current
-- backend/.env, but the IV length and base64 variant differ, so a byte-for-
-- byte column copy will NOT decrypt correctly under lib/encrypt.ts — the
-- fixed 12-byte IV/16-byte tag offsets will slice a 16-byte-IV ciphertext at
-- the wrong boundaries and GCM authentication will fail (decrypt() will throw).
--
-- Required approach: a Node/TS script (NOT SQL) that, per WorkerProfile row:
--   1. reads passportNumberEnc
--   2. decrypts it using the OLD format (base64, 16-byte IV, ENCRYPTION_LOCAL_KEY)
--      — see backend/prisma/migrate-passport-encrypt.ts on branch
--      railway/code-change-d2hB2S for a reference implementation of this
--      exact decrypt (oldDecrypt / EncryptionService.decrypt there is
--      actually the NEW format in that branch's naming — re-verify field
--      names carefully against whichever script is adapted, do not assume).
--   3. re-encrypts the plaintext using CURRENT main's encrypt() from
--      backend/src/lib/encrypt.ts (base64url, 12-byte IV, ENCRYPTION_KEY)
--   4. UPDATEs the row's new "passportNumber" column with that result
--
-- Sketch (illustrative only, not a runnable script as-is):
--
--   import prisma from "../src/lib/prisma";
--   import { encrypt } from "../src/lib/encrypt";          // current main format
--   import crypto from "crypto";
--
--   function decryptOldFormat(encoded: string): string {
--     const key = Buffer.from(process.env.ENCRYPTION_LOCAL_KEY!, "hex");
--     const buf = Buffer.from(encoded, "base64");           // NOT base64url
--     const iv  = buf.subarray(0, 16);                      // NOT 12
--     const tag = buf.subarray(16, 32);
--     const ct  = buf.subarray(32);
--     const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
--     d.setAuthTag(tag);
--     return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
--   }
--
--   async function main() {
--     const rows = await prisma.workerProfile.findMany({
--       where:  { passportNumberEnc: { not: null }, passportNumber: null },
--       select: { userId: true, passportNumberEnc: true },
--     });
--     for (const r of rows) {
--       try {
--         const plaintext = decryptOldFormat(r.passportNumberEnc!);
--         await prisma.workerProfile.update({
--           where: { userId: r.userId },
--           data:  { passportNumber: encrypt(plaintext) },
--         });
--       } catch (e) {
--         console.error(`FAILED userId=${r.userId}:`, e);   // do not silently skip — review failures individually
--       }
--     }
--   }
--
-- This needs to be written properly, tested against a staging copy of
-- production data, and run out-of-band — it is explicitly NOT part of this
-- preview's "run later" SQL below.


-- ----------------------------------------------------------------------------
-- PART B — Payment: old snake_case columns -> new camelCase columns
-- ----------------------------------------------------------------------------
-- This part genuinely IS plain SQL (no crypto involved). Still NOT executed —
-- review the caveats below, especially on userId, before ever running this.

-- B1. amount_cents -> amount  (straightforward 1:1 copy, same unit: smallest
--     currency unit / cents)
UPDATE "Payment"
SET "amount" = "amount_cents"
WHERE "amount" IS NULL
  AND "amount_cents" IS NOT NULL;

-- B2. stripe_payment_intent_id -> stripePaymentId  (straightforward 1:1 copy)
UPDATE "Payment"
SET "stripePaymentId" = "stripe_payment_intent_id"
WHERE "stripePaymentId" IS NULL
  AND "stripe_payment_intent_id" IS NOT NULL;

-- B3. created_at -> createdAt  (Phase 1 defaulted createdAt to CURRENT_TIMESTAMP
--     at ADD COLUMN time, which is wrong for historical rows — this restores
--     the real original timestamp)
UPDATE "Payment"
SET "createdAt" = "created_at"
WHERE "created_at" IS NOT NULL;

-- B4. entity_id / entity_type -> userId  — CAVEAT, NOT VERIFIED AGAINST LIVE DATA
-- The old schema's entity_id/entity_type pair was a polymorphic reference
-- (dropped enum "PaymentEntityType" suggests entity_type could point at more
-- than one kind of entity — e.g. a user, an employer profile, a job, etc.).
-- The new schema's userId assumes every payment maps directly to a User.id.
-- These are NOT guaranteed to be the same shape. The mapping below only
-- covers the case where entity_type explicitly marks the row as already
-- referencing a User id directly — every other entity_type value is left
-- alone (userId stays NULL) rather than guessed at.
--
-- BEFORE running this in any real environment: inspect the actual distinct
-- entity_type values in production first, e.g.:
--   SELECT entity_type, COUNT(*) FROM "Payment" GROUP BY entity_type;
-- and confirm which values (if any) mean "entity_id IS a User.id" versus
-- values that point at some other table (EmployerProfile, WorkerProfile,
-- JobPost, etc.), which would need an additional JOIN to resolve to a
-- User.id rather than a direct copy.
UPDATE "Payment"
SET "userId" = "entity_id"
WHERE "userId" IS NULL
  AND "entity_type" = 'USER'   -- PLACEHOLDER VALUE — replace with the real
                               -- enum member(s) confirmed to mean "User" after
                               -- inspecting production data; do not run as-is.
  AND EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "Payment"."entity_id");

-- Any Payment rows where userId is still NULL after B4 need manual
-- investigation before a follow-up migration can safely add
-- `ALTER TABLE "Payment" ALTER COLUMN "userId" SET NOT NULL` — that
-- constraint tightening is intentionally not included here.
