-- Add JOB_MATCH to EmailType — the email sibling of the existing
-- Notification "JOB_MATCH" bell (services/queue/index.ts's
-- notifyMatchingWorkersForApprovedJob). Kept as its own EmailType rather
-- than reusing GENERAL specifically so it can be marked suppressible
-- (lib/unsubscribe.ts) without also suppressing the many transactional
-- emails that already reuse GENERAL (job moderation, lock lifecycle,
-- posting rights, direct messages) — see the comment on GENERAL in
-- lib/unsubscribe.ts for why that type can't safely be reclassified.
--
-- Additive only — same ALTER TYPE ... ADD VALUE IF NOT EXISTS pattern as
-- 20260711000000_add_upload_superseded_status.

ALTER TYPE "EmailType" ADD VALUE IF NOT EXISTS 'JOB_MATCH';
