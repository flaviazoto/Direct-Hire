-- Payment table schema drift: these columns were added by an earlier,
-- abandoned schema generation (see PaymentEntityType enum: APPLICATION_FEE,
-- WORKER_LOCK) and were never removed from the underlying table when
-- schema.prisma moved to the current, simpler Payment model. No code path
-- anywhere in the backend reads or writes entity_type, entity_id,
-- stripe_payment_intent_id, amount_cents, or updated_at on Payment — Prisma's
-- current model doesn't declare them, so every prisma.payment.create() call
-- (confirmLock, confirmExtendLock, releaseLock's refund record, the
-- lock-jobs natural-expiry record, both Stripe webhook handlers) has been
-- failing with a NOT NULL violation since these columns were added. The
-- Payment table currently has 0 rows in production as a result.
--
-- This migration only relaxes the constraint (DROP NOT NULL) — it does not
-- drop the columns themselves. That keeps the change reversible and low-risk
-- as a first step; actually dropping the dead columns can follow once this
-- has been verified safe.

ALTER TABLE "Payment" ALTER COLUMN "entity_type" DROP NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "entity_id" DROP NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "stripe_payment_intent_id" DROP NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "amount_cents" DROP NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "updated_at" DROP NOT NULL;
