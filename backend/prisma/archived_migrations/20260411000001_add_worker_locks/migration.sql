-- Migration: add_worker_locks
-- Adds worker lock system: worker_locks table, lock_billing_charges table,
-- ChargeStatus enum, updated LockStatus enum, new AuditAction values,
-- and lock-related columns on the User table.

-- ── 1. Add ChargeStatus enum ──────────────────────────────────────────────────
DO $$
BEGIN
  CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'CHARGED', 'FAILED', 'WAIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Add new AuditAction values ────────────────────────────────────────────
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WORKER_LOCKED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WORKER_LOCK_EXTENDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WORKER_LOCK_RELEASED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WORKER_LOCK_EXPIRED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WORKER_LOCK_OVERRIDDEN';

-- ── 3. Drop old WorkerLock table (frees LockStatus enum for alteration) ──────
DROP TABLE IF EXISTS "WorkerLock" CASCADE;

-- ── 4. Swap LockStatus enum: remove CONVERTED_TO_HIRE, add OVERRIDDEN ────────
BEGIN;
DO $$
BEGIN
  CREATE TYPE "LockStatus_new" AS ENUM ('ACTIVE', 'EXPIRED', 'RELEASED', 'OVERRIDDEN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
ALTER TYPE "LockStatus" RENAME TO "LockStatus_old";
ALTER TYPE "LockStatus_new" RENAME TO "LockStatus";
DROP TYPE "LockStatus_old";
COMMIT;

-- ── 5. Add lock columns to User ───────────────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "is_locked"             BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "locked_by_employer_id" TEXT,
  ADD COLUMN IF NOT EXISTS "locked_until"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lock_count"            INTEGER      NOT NULL DEFAULT 0;

-- ── 6. Create worker_locks ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "worker_locks" (
    "id"                  TEXT          NOT NULL,
    "worker_id"           TEXT          NOT NULL,
    "employer_id"         TEXT          NOT NULL,
    "lock_status"         "LockStatus"  NOT NULL DEFAULT 'ACTIVE',
    "daily_fee"           DECIMAL(10,2) NOT NULL,
    "currency"            TEXT          NOT NULL DEFAULT 'USD',
    "lock_start_date"     TIMESTAMP(3)  NOT NULL,
    "lock_expiry_date"    TIMESTAMP(3)  NOT NULL,
    "lock_days"           INTEGER       NOT NULL,
    "total_billed"        DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_days_billed"   INTEGER       NOT NULL DEFAULT 0,
    "release_reason"      TEXT,
    "admin_override_by"   TEXT,
    "admin_override_at"   TIMESTAMP(3),
    "admin_override_note" TEXT,
    "expiry_warning_sent" BOOLEAN       NOT NULL DEFAULT false,
    "created_at"          TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3)  NOT NULL,

    CONSTRAINT "worker_locks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "worker_locks"
  ADD CONSTRAINT "worker_locks_worker_id_fkey"
    FOREIGN KEY ("worker_id")   REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "worker_locks_employer_id_fkey"
    FOREIGN KEY ("employer_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "worker_locks_worker_id_lock_status_idx" ON "worker_locks"("worker_id", "lock_status");
CREATE INDEX IF NOT EXISTS "worker_locks_employer_id_idx"           ON "worker_locks"("employer_id");
CREATE INDEX IF NOT EXISTS "worker_locks_lock_expiry_date_idx"      ON "worker_locks"("lock_expiry_date");

-- ── 7. Create lock_billing_charges ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "lock_billing_charges" (
    "id"            TEXT           NOT NULL,
    "lock_id"       TEXT           NOT NULL,
    "employer_id"   TEXT           NOT NULL,
    "worker_id"     TEXT           NOT NULL,
    "amount"        DECIMAL(10,2)  NOT NULL,
    "currency"      TEXT           NOT NULL DEFAULT 'USD',
    "charge_date"   TIMESTAMP(3)   NOT NULL,
    "charge_status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "invoice_id"    TEXT,
    "created_at"    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lock_billing_charges_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "lock_billing_charges"
  ADD CONSTRAINT "lock_billing_charges_lock_id_fkey"
    FOREIGN KEY ("lock_id") REFERENCES "worker_locks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "lock_billing_charges_lock_id_idx"     ON "lock_billing_charges"("lock_id");
CREATE INDEX IF NOT EXISTS "lock_billing_charges_employer_id_idx" ON "lock_billing_charges"("employer_id");
