-- Phase 4: filePath columns so ApplicationDocument/EmployerDocumentRequest
-- private files can get a fresh signed URL on every read (same convention as
-- Upload.filePath/isPrivate), instead of relying on the one-time fileUrl set
-- at upload time, which expires after SIGNED_URL_EXPIRY_SECONDS.
--
-- Hand-curated from `prisma migrate diff` output — the raw diff also included
-- unrelated pre-existing drift between this DB and schema.prisma (DROP TABLE
-- "Skill"/"Subscription", DROP COLUMN phoneEnc/passportNumberEnc, an
-- AuditAction enum rebuild, index renames, etc.), same as the Phase 1
-- migration. Only the two genuinely additive statements below are applied.

ALTER TABLE "application_documents" ADD COLUMN "file_path" TEXT;
ALTER TABLE "employer_document_requests" ADD COLUMN "file_path" TEXT;
