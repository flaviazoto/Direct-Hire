-- Phase 1: admin-mediated hiring workflow — additive only.
-- Hand-extracted from `prisma migrate diff` output: the raw diff also
-- contained unrelated pre-existing drift between the live DB and
-- schema.prisma (DROP TABLE "Skill"/"Subscription"/"job_required_skills"/
-- "trust_score_history", DROP COLUMN "phoneEnc"/"passportNumberEnc", an
-- AuditAction enum rebuild, FK/index renames) that predates this task and is
-- NOT included here. Everything below is purely additive: 4 new enums, one
-- new nullable column + index on the existing "applications" table, and 8
-- new tables with their indexes and foreign keys.

-- CreateEnum
CREATE TYPE "AdminWorkflowStatus" AS ENUM ('PENDING_ADMIN_REVIEW', 'APPROVED_QUEUED', 'DOCUMENTS_PENDING', 'DOCUMENTS_APPROVED', 'ADMIN_FEE_DUE', 'ADMIN_FEE_PAID', 'CLEARED_FOR_EMPLOYER');

-- CreateEnum
CREATE TYPE "AdminReviewDecision" AS ENUM ('PENDING', 'APPROVED');

-- CreateEnum
CREATE TYPE "DocumentRequestStatus" AS ENUM ('REQUESTED', 'SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "BulkQuoteStatus" AS ENUM ('REQUESTED', 'QUOTE_PREPARED', 'SENT');

-- AlterTable: additive column only
ALTER TABLE "applications" ADD COLUMN "workflow_status" "AdminWorkflowStatus";

-- CreateIndex
CREATE INDEX "applications_workflow_status_idx" ON "applications"("workflow_status");

-- CreateTable
CREATE TABLE "application_admin_reviews" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "reviewed_by_id" TEXT,
    "decision" "AdminReviewDecision" NOT NULL DEFAULT 'PENDING',
    "decision_notes" TEXT,
    "note_to_worker" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_admin_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_documents" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "file_url" TEXT,
    "status" "DocumentRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "reviewed_by_id" TEXT,
    "review_notes" TEXT,
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_fee_schedules" (
    "id" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "visa_type" TEXT NOT NULL,
    "amount_usd" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_fee_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_fee_charges" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "visa_type" TEXT NOT NULL,
    "amount_usd" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "stripe_payment_intent_id" TEXT,
    "stripe_refund_id" TEXT,
    "total_refunded_cents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),

    CONSTRAINT "admin_fee_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employer_document_requests" (
    "id" TEXT NOT NULL,
    "employer_id" TEXT NOT NULL,
    "application_id" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "status" "DocumentRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "file_url" TEXT,
    "reviewed_by_id" TEXT,
    "review_notes" TEXT,
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "notified_employer_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employer_document_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_groups" (
    "id" TEXT NOT NULL,
    "employer_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_group_members" (
    "id" TEXT NOT NULL,
    "worker_group_id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_quote_requests" (
    "id" TEXT NOT NULL,
    "worker_group_id" TEXT NOT NULL,
    "employer_id" TEXT NOT NULL,
    "worker_count_at_request" INTEGER NOT NULL,
    "status" "BulkQuoteStatus" NOT NULL DEFAULT 'REQUESTED',
    "quote_amount_usd" DECIMAL(10,2),
    "quote_notes" TEXT,
    "prepared_by_id" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quote_prepared_at" TIMESTAMP(3),
    "quote_sent_at" TIMESTAMP(3),

    CONSTRAINT "bulk_quote_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "application_admin_reviews_application_id_key" ON "application_admin_reviews"("application_id");

-- CreateIndex
CREATE INDEX "application_admin_reviews_reviewed_by_id_idx" ON "application_admin_reviews"("reviewed_by_id");

-- CreateIndex
CREATE INDEX "application_admin_reviews_decision_idx" ON "application_admin_reviews"("decision");

-- CreateIndex
CREATE INDEX "application_documents_application_id_idx" ON "application_documents"("application_id");

-- CreateIndex
CREATE INDEX "application_documents_status_idx" ON "application_documents"("status");

-- CreateIndex
CREATE INDEX "application_documents_reviewed_by_id_idx" ON "application_documents"("reviewed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_fee_schedules_country_code_visa_type_key" ON "admin_fee_schedules"("country_code", "visa_type");

-- CreateIndex
CREATE UNIQUE INDEX "admin_fee_charges_application_id_key" ON "admin_fee_charges"("application_id");

-- CreateIndex
CREATE INDEX "admin_fee_charges_worker_id_idx" ON "admin_fee_charges"("worker_id");

-- CreateIndex
CREATE INDEX "admin_fee_charges_status_idx" ON "admin_fee_charges"("status");

-- CreateIndex
CREATE INDEX "employer_document_requests_employer_id_idx" ON "employer_document_requests"("employer_id");

-- CreateIndex
CREATE INDEX "employer_document_requests_application_id_idx" ON "employer_document_requests"("application_id");

-- CreateIndex
CREATE INDEX "employer_document_requests_status_idx" ON "employer_document_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "worker_groups_employer_id_key" ON "worker_groups"("employer_id");

-- CreateIndex
CREATE INDEX "worker_group_members_worker_id_idx" ON "worker_group_members"("worker_id");

-- CreateIndex
CREATE UNIQUE INDEX "worker_group_members_worker_group_id_worker_id_key" ON "worker_group_members"("worker_group_id", "worker_id");

-- CreateIndex
CREATE INDEX "bulk_quote_requests_worker_group_id_idx" ON "bulk_quote_requests"("worker_group_id");

-- CreateIndex
CREATE INDEX "bulk_quote_requests_employer_id_idx" ON "bulk_quote_requests"("employer_id");

-- CreateIndex
CREATE INDEX "bulk_quote_requests_status_idx" ON "bulk_quote_requests"("status");

-- AddForeignKey
ALTER TABLE "application_admin_reviews" ADD CONSTRAINT "application_admin_reviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_admin_reviews" ADD CONSTRAINT "application_admin_reviews_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_fee_schedules" ADD CONSTRAINT "admin_fee_schedules_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_fee_charges" ADD CONSTRAINT "admin_fee_charges_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_fee_charges" ADD CONSTRAINT "admin_fee_charges_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_document_requests" ADD CONSTRAINT "employer_document_requests_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_document_requests" ADD CONSTRAINT "employer_document_requests_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_document_requests" ADD CONSTRAINT "employer_document_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_groups" ADD CONSTRAINT "worker_groups_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_group_members" ADD CONSTRAINT "worker_group_members_worker_group_id_fkey" FOREIGN KEY ("worker_group_id") REFERENCES "worker_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_group_members" ADD CONSTRAINT "worker_group_members_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_quote_requests" ADD CONSTRAINT "bulk_quote_requests_worker_group_id_fkey" FOREIGN KEY ("worker_group_id") REFERENCES "worker_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_quote_requests" ADD CONSTRAINT "bulk_quote_requests_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_quote_requests" ADD CONSTRAINT "bulk_quote_requests_prepared_by_id_fkey" FOREIGN KEY ("prepared_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
