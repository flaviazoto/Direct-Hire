-- Major resequencing: DOCUMENTS_APPROVED no longer transitions directly to
-- ADMIN_FEE_DUE. A new employer-hire + worker-confirm gate sits between them.
--
-- Hand-curated from `prisma migrate diff` output — the raw diff also
-- included unrelated pre-existing drift between this DB and schema.prisma,
-- same as every prior migration in this project. Only the statement below
-- is applied.

-- AlterEnum
ALTER TYPE "AdminWorkflowStatus" ADD VALUE 'HIRE_PENDING_WORKER_CONFIRMATION';
