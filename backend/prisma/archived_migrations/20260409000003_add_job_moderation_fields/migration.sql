-- Migration: add_job_moderation_fields
-- Extends job_posts, users, and AuditAction enum for full moderation workflow.

-- ── 1. AuditAction enum: add missing values (IF NOT EXISTS prevents duplicates) ──

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JOB_CHANGES_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JOB_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JOB_RESUBMITTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMPLOYER_POSTING_RIGHTS_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMPLOYER_POSTING_RIGHTS_RESTORED';

-- ── 2. job_posts: add moderation workflow columns ─────────────────────────────

ALTER TABLE "job_posts"
  ADD COLUMN IF NOT EXISTS "changes_requested_at"    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "changes_requested_by"    TEXT,
  ADD COLUMN IF NOT EXISTS "resubmitted_at"          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "moderation_history"      JSONB,
  ADD COLUMN IF NOT EXISTS "employer_posting_rights" BOOLEAN NOT NULL DEFAULT TRUE;

-- ── 3. users: add posting-rights revocation columns ──────────────────────────

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "posting_rights_revoked"    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "posting_rights_revoked_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "posting_rights_revoked_by" TEXT;
