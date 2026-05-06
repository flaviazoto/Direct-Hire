-- ── CHANGE 1: Add missing NotificationType enum values ────────────────────────
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WORKER_LOCKED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WORKER_LOCK_EXTENDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WORKER_LOCK_RELEASED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LOCK_EXPIRY_WARNING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LOCK_EXPIRED';

-- ── CHANGE 2: Add Stripe fields to worker_locks ───────────────────────────────
ALTER TABLE "worker_locks"
  ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_refund_id"          TEXT,
  ADD COLUMN IF NOT EXISTS "total_refunded_cents"      INTEGER NOT NULL DEFAULT 0;

-- ── CHANGE 3: Add Stripe fields to lock_billing_charges ──────────────────────
ALTER TABLE "lock_billing_charges"
  ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_charge_id"         TEXT,
  ADD COLUMN IF NOT EXISTS "failure_reason"           TEXT,
  ADD COLUMN IF NOT EXISTS "retry_count"              INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "grace_period_ends_at"     TIMESTAMPTZ;

-- ── CHANGE 4: Create platform_config table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "platform_config" (
  "id"          TEXT        NOT NULL,
  "key"         TEXT        NOT NULL,
  "value"       TEXT        NOT NULL,
  "description" TEXT,
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_by"  TEXT,

  CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_config_key_key" ON "platform_config"("key");

-- ── Seed platform_config ──────────────────────────────────────────────────────
INSERT INTO "platform_config" ("id", "key", "value", "description", "updated_at")
VALUES
  (gen_random_uuid(), 'lock_daily_rate_cents',      '200',  'Worker lock daily rate in cents (USD)',           now()),
  (gen_random_uuid(), 'lock_max_concurrent',         '5',    'Max concurrent worker locks per employer',        now()),
  (gen_random_uuid(), 'lock_max_duration_days',      '14',   'Max lock duration in days',                       now()),
  (gen_random_uuid(), 'lock_grace_period_hours',     '24',   'Grace period hours before failed lock expires',   now()),
  (gen_random_uuid(), 'application_fee_enabled',     'true', 'Whether application fees are charged',            now()),
  (gen_random_uuid(), 'application_base_fee_cents',  '300',  'Base application fee in cents',                   now())
ON CONFLICT ("key") DO NOTHING;
