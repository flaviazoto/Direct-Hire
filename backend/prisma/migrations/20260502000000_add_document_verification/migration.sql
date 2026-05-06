-- Migration: add_document_verification
-- Adds passportStatus + documentsVerified fields to WorkerProfile
-- Adds DOCUMENT_BATCH_REVIEWED to AuditAction enum

-- Step 1: Extend AuditAction enum (PG 13+ supports IF NOT EXISTS)
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DOCUMENT_BATCH_REVIEWED';

-- Step 2: Add document-review fields to WorkerProfile
ALTER TABLE "WorkerProfile"
  ADD COLUMN IF NOT EXISTS "passportStatus"      "DocumentReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "documentsVerified"   BOOLEAN                NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "documentsReviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "documentsReviewedBy" TEXT;

-- Step 3: Index for fast pending-documents queries
CREATE INDEX IF NOT EXISTS "WorkerProfile_documentsVerified_idx"
  ON "WorkerProfile"("documentsVerified");
