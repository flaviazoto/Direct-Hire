-- Added for production readiness:
-- 1) Per-document review workflow metadata on Upload
-- 2) Saved jobs model for workers
-- 3) Job filter columns and indexes

DO $$
BEGIN
  CREATE TYPE "DocumentReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Upload"
    ADD COLUMN IF NOT EXISTS "reviewStatus" "DocumentReviewStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT,
    ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
    ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Upload"
    ADD CONSTRAINT "Upload_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS "Upload_reviewStatus_idx" ON "Upload"("reviewStatus");
  CREATE INDEX IF NOT EXISTS "Upload_reviewedById_idx" ON "Upload"("reviewedById");
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'JobPost') THEN
    ALTER TABLE "JobPost"
      ADD COLUMN IF NOT EXISTS "category" TEXT,
      ADD COLUMN IF NOT EXISTS "workType" TEXT,
      ADD COLUMN IF NOT EXISTS "visaSupport" BOOLEAN NOT NULL DEFAULT false;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'JobPost') THEN
    CREATE INDEX IF NOT EXISTS "JobPost_category_idx" ON "JobPost"("category");
    CREATE INDEX IF NOT EXISTS "JobPost_workType_idx" ON "JobPost"("workType");
    CREATE INDEX IF NOT EXISTS "JobPost_visaSupport_idx" ON "JobPost"("visaSupport");
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SavedJob" (
  "id" TEXT NOT NULL,
  "workerProfileId" TEXT NOT NULL,
  "jobPostId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'SavedJob')
    AND EXISTS (SELECT 1 FROM pg_class WHERE relname = 'WorkerProfile') THEN
    ALTER TABLE "SavedJob"
      ADD CONSTRAINT "SavedJob_workerProfileId_fkey"
      FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'SavedJob')
    AND EXISTS (SELECT 1 FROM pg_class WHERE relname = 'JobPost') THEN
    ALTER TABLE "SavedJob"
      ADD CONSTRAINT "SavedJob_jobPostId_fkey"
      FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'SavedJob') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "SavedJob_workerProfileId_jobPostId_key"
      ON "SavedJob"("workerProfileId", "jobPostId");
    CREATE INDEX IF NOT EXISTS "SavedJob_workerProfileId_idx" ON "SavedJob"("workerProfileId");
    CREATE INDEX IF NOT EXISTS "SavedJob_jobPostId_idx" ON "SavedJob"("jobPostId");
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;
