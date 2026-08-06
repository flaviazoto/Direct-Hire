-- Notifications redesign audit finding: two NotificationType enum values
-- were still lowercase (new_job_pending, lock_overridden), inconsistent
-- with every other value. Confirmed zero real Notification rows use either
-- value before this migration, so a straight rename is safe — no dual-value
-- handling needed in application code, and RENAME VALUE remaps any existing
-- rows automatically (there just aren't any to remap).
--
-- Hand-curated from `prisma migrate diff` output — the raw diff also
-- included unrelated pre-existing drift between this DB and schema.prisma,
-- same as every prior migration in this project. Only the statements below
-- are applied.

ALTER TYPE "NotificationType" RENAME VALUE 'new_job_pending' TO 'NEW_JOB_PENDING';
ALTER TYPE "NotificationType" RENAME VALUE 'lock_overridden' TO 'LOCK_OVERRIDDEN';
