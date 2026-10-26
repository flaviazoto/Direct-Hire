-- Part B: admin-mediated screening interview redesign.
--
-- Hand-curated from `prisma migrate diff` output — the raw diff also
-- included unrelated pre-existing drift between this DB and schema.prisma
-- (DROP TABLE "Skill"/"Subscription", DROP COLUMN phoneEnc/passportNumberEnc,
-- an AuditAction enum rebuild, index renames, etc.), same as every prior
-- migration in this project. Only the statements below are applied.

-- CreateEnum
CREATE TYPE "InterviewRecommendation" AS ENUM ('RECOMMEND', 'DOES_NOT_MEET_REQUIREMENTS', 'NEEDS_FOLLOW_UP');

-- AlterEnum
ALTER TYPE "ApplicationStatus" ADD VALUE 'SCREENING';

-- CreateTable
CREATE TABLE "application_interviews" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "request_notes" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conducted_at" TIMESTAMP(3),
    "admin_notes" TEXT,
    "recommendation" "InterviewRecommendation",
    "relayed_by_id" TEXT,
    "relayed_to_employer_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_interviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "application_interviews_application_id_key" ON "application_interviews"("application_id");

-- CreateIndex
CREATE INDEX "application_interviews_requested_by_id_idx" ON "application_interviews"("requested_by_id");

-- AddForeignKey
ALTER TABLE "application_interviews" ADD CONSTRAINT "application_interviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_interviews" ADD CONSTRAINT "application_interviews_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_interviews" ADD CONSTRAINT "application_interviews_relayed_by_id_fkey" FOREIGN KEY ("relayed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
