-- Phase 1 — additive-only schema reconciliation.
--
-- Context: production is running an older schema generation (see the full
-- `prisma migrate diff` review). That diff contains destructive statements
-- (DROP TABLE, DROP COLUMN on live data, enum rewrites, a NOT NULL column
-- add with no default that would fail outright) which are explicitly OUT OF
-- SCOPE here. This migration adds ONLY the columns/indexes that current
-- backend code actually reads or writes and that were confirmed missing in
-- production. Nothing is dropped, renamed, or type-changed. Every statement
-- is idempotent (IF NOT EXISTS) so this is safe to re-run.
--
-- Columns intentionally EXCLUDED from this migration even though they
-- appeared in the drift diff's Payment ALTER TABLE block:
--   - Payment.status  — already exists in production (as an enum-typed
--     column being replaced by TEXT upstream); this is a type change, not a
--     missing column, and type changes are explicitly out of scope for
--     Phase 1.
--   - Payment.currency — already exists in production; the diff only wants
--     to change its DEFAULT, which is an ALTER COLUMN, not an ADD COLUMN.

-- ── WorkerProfile.passportNumber ─────────────────────────────────────────────
-- Read: backend/src/controllers/user.controller.ts:29 (decrypt on profile read),
--       :110-121 (encrypt on profile update), :84 (completion score)
-- Read: backend/src/controllers/onboarding.controller.ts:186-207 (encrypt on save)
-- Read: backend/src/controllers/admin.controller.ts:775-776 (admin decrypt view)
-- Read: backend/src/controllers/admin-documents.controller.ts:130,187,225
-- NOTE: production's existing passport data lives under a DIFFERENT column,
-- "passportNumberEnc", encrypted in an incompatible format (see Step 2 —
-- base64 / 16-byte IV / ENCRYPTION_LOCAL_KEY, not this app's base64url /
-- 12-byte IV / ENCRYPTION_KEY format). This ADD COLUMN does NOT recover
-- that data — see the Phase 2 backfill preview for the conversion needed.
ALTER TABLE "WorkerProfile"
  ADD COLUMN IF NOT EXISTS "passportNumber" TEXT;

-- ── EmployerProfile Stripe subscription fields ───────────────────────────────
-- Read: backend/src/middleware/subscription.middleware.ts:15,19-20
-- Read: backend/src/services/stripe/index.ts:23,26,36
-- Read: backend/src/controllers/billing.controller.ts:30-31,75-77,100,102,118,121,126,146,149,154
-- Read: backend/src/controllers/webhook.controller.ts:47,50,65-66
-- Read: backend/src/controllers/worker-lock.controller.ts:74,152,162
ALTER TABLE "EmployerProfile"
  ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionCurrentPeriodEnd" TIMESTAMP(3);

-- schema.prisma declares stripeCustomerId @unique. Adding it as a UNIQUE
-- index here would risk failing (or silently constraining) against whatever
-- pre-existing data shape production has. Created as a plain, non-unique
-- index for now — Phase 2 dedup-checks the column, then promotes this to a
-- real unique index (matching Prisma's expected "EmployerProfile_stripeCustomerId_key").
CREATE INDEX IF NOT EXISTS "EmployerProfile_stripeCustomerId_idx"
  ON "EmployerProfile"("stripeCustomerId");

-- ── Payment reconciliation columns ───────────────────────────────────────────
-- Read (all prisma.payment.create call sites, confirming exactly which
-- fields current code writes):
--   backend/src/controllers/worker-applications.controller.ts:214-223
--     (userId, stripePaymentId, amount, currency, status, type, description)
--   backend/src/services/lock-jobs/index.ts:143-157, :375-389
--     (userId, amount, currency, status, type, description, metadata)
--   backend/src/controllers/worker-lock.controller.ts:325-336, :565-576
--     (userId, stripePaymentId, amount, currency, status, type, description, metadata)
--   backend/src/controllers/webhook.controller.ts:86-95
--     (raw INSERT: id, userId, stripePaymentId, stripeInvoiceId, amount,
--      currency, status, type, description, createdAt)
--   backend/src/controllers/admin-revenue.controller.ts, worker-payments.controller.ts,
--   billing.controller.ts — all read amount/type/status/createdAt/userId via
--   aggregate/findMany/count.
--
-- schema.prisma declares userId and amount as NOT NULL with no default.
-- Production's Payment table almost certainly has existing rows (this app
-- has processed real Stripe payments), so adding either as NOT NULL here
-- would fail outright. Both are added NULLABLE in Phase 1 — schema.prisma
-- temporarily disagrees with the live column on nullability until Phase 2's
-- backfill populates every row, after which a follow-up migration can apply
-- SET NOT NULL.
ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "userId" TEXT,                                   -- NOTE: nullable here; schema.prisma says NOT NULL — tighten in Phase 2 after backfill
  ADD COLUMN IF NOT EXISTS "amount" INTEGER,                                -- NOTE: nullable here; schema.prisma says NOT NULL — tighten in Phase 2 after backfill
  ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'SUBSCRIPTION',     -- safe: schema.prisma already declares this default
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, -- safe: schema.prisma already declares this default
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "stripePaymentId" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeInvoiceId" TEXT;

-- schema.prisma declares stripeInvoiceId @unique — same reasoning as
-- stripeCustomerId above: plain index now, unique constraint in Phase 2
-- after checking for duplicate/NULL collisions.
CREATE INDEX IF NOT EXISTS "Payment_stripeInvoiceId_idx"
  ON "Payment"("stripeInvoiceId");

-- schema.prisma declares a plain (non-unique) @@index([userId]) — safe to
-- create as-is, no Phase 2 follow-up needed for this one.
CREATE INDEX IF NOT EXISTS "Payment_userId_idx"
  ON "Payment"("userId");
