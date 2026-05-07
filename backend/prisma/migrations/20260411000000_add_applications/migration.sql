-- Migration: add_applications
-- Replaces old Application table (workerProfileId-based) with new applications table
-- (worker_id/job_id/employer_id as direct User FKs).
-- Updates ApplicationStatus enum values.
-- Adds APPLICATION_SUBMITTED, APPLICATION_STATUS_CHANGED, CONTACT_DETAILS_ACCESSED to AuditAction.

-- ── Step 1: Drop old Application table (holds old ApplicationStatus column) ──
-- The old table relates to WorkerProfile; the new one relates directly to User.
DROP TABLE IF EXISTS "Application" CASCADE;

-- ── Step 2: Drop any pre-existing applications table (from prior db push) ────
DROP TABLE IF EXISTS "applications";

-- ── Step 3: Replace ApplicationStatus enum ───────────────────────────────────
-- PostgreSQL cannot remove enum values in-place; create a new type, drop the
-- old one (safe now that both tables using it are gone), then rename.
DO $$
BEGIN
  CREATE TYPE "ApplicationStatus_new" AS ENUM (
    'APPLIED',
    'VIEWED',
    'SHORTLISTED',
    'INTERVIEWED',
    'ACCEPTED',
    'REJECTED',
    'WITHDRAWN'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP TYPE IF EXISTS "ApplicationStatus";
ALTER TYPE "ApplicationStatus_new" RENAME TO "ApplicationStatus";

-- ── Step 4: Add new AuditAction values ───────────────────────────────────────
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_SUBMITTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CONTACT_DETAILS_ACCESSED';

-- ── Step 5: Create applications table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "applications" (
  "id"                         TEXT        NOT NULL,
  "worker_id"                  TEXT        NOT NULL,
  "job_id"                     TEXT        NOT NULL,
  "employer_id"                TEXT        NOT NULL,
  "status"                     "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
  "cover_letter"               TEXT,
  "worker_note"                TEXT,
  "interview_contact_unlocked" BOOLEAN     NOT NULL DEFAULT false,
  "company_contact_visible_at" TIMESTAMP(3),
  "viewed_at"                  TIMESTAMP(3),
  "shortlisted_at"             TIMESTAMP(3),
  "interviewed_at"             TIMESTAMP(3),
  "accepted_at"                TIMESTAMP(3),
  "rejected_at"                TIMESTAMP(3),
  "rejection_reason"           TEXT,
  "interview_instructions"     TEXT,
  "match_score"                DECIMAL(5,2),
  "created_at"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- ── Step 6: Unique constraint ─────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "applications_worker_id_job_id_key"
  ON "applications"("worker_id", "job_id");

-- ── Step 7: Indexes ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "applications_worker_id_idx"   ON "applications"("worker_id");
CREATE INDEX IF NOT EXISTS "applications_job_id_idx"      ON "applications"("job_id");
CREATE INDEX IF NOT EXISTS "applications_employer_id_idx" ON "applications"("employer_id");
CREATE INDEX IF NOT EXISTS "applications_status_idx"      ON "applications"("status");
CREATE INDEX IF NOT EXISTS "applications_created_at_idx"  ON "applications"("created_at");

-- ── Step 8: Foreign key constraints ──────────────────────────────────────────
ALTER TABLE "applications"
  ADD CONSTRAINT "applications_worker_id_fkey"
  FOREIGN KEY ("worker_id") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "applications"
  ADD CONSTRAINT "applications_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "job_posts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "applications"
  ADD CONSTRAINT "applications_employer_id_fkey"
  FOREIGN KEY ("employer_id") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
