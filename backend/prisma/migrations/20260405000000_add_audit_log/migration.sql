-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM (
  'USER_APPROVED',
  'USER_REJECTED',
  'USER_SUSPENDED',
  'USER_REINSTATED',
  'JOB_APPROVED',
  'JOB_REJECTED',
  'LOCK_OVERRIDDEN',
  'AI_DECISION_OVERRIDDEN'
);

-- AlterTable: add new user fields
ALTER TABLE "User"
  ADD COLUMN "verification_submitted_at" TIMESTAMP(3),
  ADD COLUMN "approved_at"               TIMESTAMP(3),
  ADD COLUMN "rejected_at"               TIMESTAMP(3),
  ADD COLUMN "rejection_reason"          TEXT,
  ADD COLUMN "suspended_at"              TIMESTAMP(3),
  ADD COLUMN "reviewed_by"               TEXT;

-- CreateTable: audit_log
CREATE TABLE "audit_log" (
  "id"             TEXT         NOT NULL,
  "admin_id"       TEXT         NOT NULL,
  "action"         "AuditAction" NOT NULL,
  "target_user_id" TEXT         NOT NULL,
  "notes"          TEXT,
  "metadata"       JSONB,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_target_user_id_idx" ON "audit_log"("target_user_id");
CREATE INDEX "audit_log_admin_id_idx"       ON "audit_log"("admin_id");
CREATE INDEX "audit_log_created_at_idx"     ON "audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "audit_log"
  ADD CONSTRAINT "audit_log_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_log"
  ADD CONSTRAINT "audit_log_target_user_id_fkey"
  FOREIGN KEY ("target_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
