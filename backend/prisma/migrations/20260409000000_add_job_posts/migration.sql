-- Migration: add_job_posts
-- Replaces the old "JobPost" table (FK to EmployerProfile, String status)
-- with a new "job_posts" table (FK to User, enum status/contractType).

-- ── 1. New enums ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  CREATE TYPE "JobPostStatus" AS ENUM (
    'DRAFT',
    'PENDING_MODERATION',
    'APPROVED',
    'REJECTED',
    'ARCHIVED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ContractType" AS ENUM (
    'FULL_TIME',
    'PART_TIME',
    'CONTRACT',
    'TEMPORARY',
    'INTERNSHIP',
    'FREELANCE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Clear referencing data before dropping source table ───────────────────
-- Application and SavedJob rows reference old "JobPost" ids that won't exist
-- in the new "job_posts" table. Purge them so FK re-creation succeeds.
-- WorkerLock.jobPostId is nullable — just NULL it out.

DO $$
BEGIN
  DELETE FROM "Application" WHERE "jobPostId" IS NOT NULL;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DELETE FROM "SavedJob";

DO $$
BEGIN
  UPDATE "WorkerLock" SET "jobPostId" = NULL WHERE "jobPostId" IS NOT NULL;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

-- ── 3. Drop old dependent table ───────────────────────────────────────────────
-- JobRequiredSkill has FK → "JobPost", drop it first to avoid constraint errors.

DROP TABLE IF EXISTS "JobRequiredSkill" CASCADE;

-- ── 4. Drop old JobPost table ─────────────────────────────────────────────────
-- CASCADE removes the FK constraints in Application, SavedJob, WorkerLock
-- that reference "JobPost". Rows in those tables are NOT deleted by DDL CASCADE.

DROP TABLE IF EXISTS "JobPost" CASCADE;

-- ── 5. Create new job_posts table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "job_posts" (
  "id"                   TEXT         NOT NULL,
  "employer_id"          TEXT         NOT NULL,

  "title"                TEXT         NOT NULL,
  "company_name"         TEXT         NOT NULL,
  "description"          TEXT         NOT NULL,
  "requirements"         TEXT         NOT NULL,
  "benefits"             TEXT,

  "country"              TEXT         NOT NULL,
  "city"                 TEXT         NOT NULL,
  "remote_allowed"       BOOLEAN      NOT NULL DEFAULT false,

  "salary_min"           DECIMAL(10,2) NOT NULL,
  "salary_max"           DECIMAL(10,2) NOT NULL,
  "salary_currency"      TEXT         NOT NULL DEFAULT 'USD',

  "contract_type"        "ContractType"  NOT NULL,
  "experience_required"  INTEGER      NOT NULL,
  "category"             TEXT         NOT NULL,
  "required_skills"      TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "languages_required"   TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],

  "visa_support"         BOOLEAN      NOT NULL DEFAULT false,
  "accommodation"        BOOLEAN      NOT NULL DEFAULT false,

  "application_deadline" TIMESTAMP(3),
  "positions_available"  INTEGER      NOT NULL DEFAULT 1,

  "status"               "JobPostStatus" NOT NULL DEFAULT 'DRAFT',
  "moderation_notes"     TEXT,
  "approved_by"          TEXT,
  "approved_at"          TIMESTAMP(3),
  "rejected_at"          TIMESTAMP(3),
  "archived_at"          TIMESTAMP(3),

  "view_count"           INTEGER      NOT NULL DEFAULT 0,
  "application_count"    INTEGER      NOT NULL DEFAULT 0,

  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "job_posts_pkey" PRIMARY KEY ("id")
);

-- ── 6. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "job_posts_employer_id_idx" ON "job_posts"("employer_id");
CREATE INDEX IF NOT EXISTS "job_posts_status_idx"      ON "job_posts"("status");
CREATE INDEX IF NOT EXISTS "job_posts_country_idx"     ON "job_posts"("country");
CREATE INDEX IF NOT EXISTS "job_posts_category_idx"    ON "job_posts"("category");
CREATE INDEX IF NOT EXISTS "job_posts_created_at_idx"  ON "job_posts"("created_at");

-- ── 7. FK: job_posts → User ───────────────────────────────────────────────────

ALTER TABLE "job_posts"
  ADD CONSTRAINT "job_posts_employer_id_fkey"
  FOREIGN KEY ("employer_id") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 8. Re-add FK: Application → job_posts ────────────────────────────────────
-- The original "Application_jobPostId_fkey" was dropped by CASCADE above.

ALTER TABLE "Application"
  ADD CONSTRAINT "Application_jobPostId_fkey"
  FOREIGN KEY ("jobPostId") REFERENCES "job_posts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 9. Re-add FK: SavedJob → job_posts ───────────────────────────────────────

ALTER TABLE "SavedJob"
  ADD CONSTRAINT "SavedJob_jobPostId_fkey"
  FOREIGN KEY ("jobPostId") REFERENCES "job_posts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 10. Re-add FK: WorkerLock → job_posts (optional column) ──────────────────

ALTER TABLE "WorkerLock"
  ADD CONSTRAINT "WorkerLock_jobPostId_fkey"
  FOREIGN KEY ("jobPostId") REFERENCES "job_posts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
