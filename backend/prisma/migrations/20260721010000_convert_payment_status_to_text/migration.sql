-- Payment.status is a real Postgres enum ("PaymentStatus": PENDING, SUCCEEDED,
-- FAILED, REFUNDED) but schema.prisma has always declared it as a plain
-- String (status String @default("PENDING")) — the same design already used
-- for Payment.type (String @default("SUBSCRIPTION")) in this same model, with
-- allowed values documented in a comment rather than enforced by a Prisma
-- enum. That mismatch between the DB's real enum type and Prisma's String
-- model causes Prisma's query engine to fail marshaling the value before the
-- query even reaches Postgres ("Error converting field 'status' ... found
-- incompatible value") on every prisma.payment.create() call.
--
-- Confirmed safe: every status value written anywhere in the codebase
-- (worker-lock.controller.ts, worker-applications.controller.ts,
-- lock-jobs/index.ts, webhook.controller.ts's raw INSERT, and schema.prisma's
-- own @default) is one of PENDING/SUCCEEDED/FAILED/REFUNDED, matching the
-- enum's labels exactly — no other value is ever written. The Payment table
-- has 0 rows, so there is no existing data to reconcile either way.
--
-- Converting to TEXT (rather than adding a matching Prisma enum) keeps
-- Payment.status consistent with Payment.type's existing plain-string
-- design in this same model, and requires no schema.prisma or application
-- code changes — schema.prisma already matches this shape.
--
-- Sequenced after 20260721000000_drop_payment_legacy_notnull — both are
-- pending in this same deploy, so `prisma migrate deploy` applies them
-- together in one pass; Payment.create() is unblocked by both fixes at once.

ALTER TABLE "Payment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "Payment" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- The "PaymentStatus" enum type itself is now unused by any column (verified
-- via information_schema.columns) but is intentionally left in place rather
-- than dropped — same conservative, reversible-first-step stance as the
-- NOT-NULL migration. Safe to DROP TYPE "PaymentStatus" later as a separate,
-- deliberate cleanup once this conversion has been verified in production.
