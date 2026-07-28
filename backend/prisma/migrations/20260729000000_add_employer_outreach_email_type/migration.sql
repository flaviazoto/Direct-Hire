-- Add EMPLOYER_OUTREACH to EmailType — added ahead of the Employer
-- Acquisition Agent (growth-agent system, see docs/ARCHITECTURE.md §11) so
-- that agent's outreach/re-engagement sends can be classified suppressible
-- (lib/unsubscribe.ts's NON_TRANSACTIONAL_EMAIL_TYPES) from day one, rather
-- than reusing GENERAL and permanently losing the ability to gate it by
-- type alone — same reasoning as JOB_MATCH (see
-- 20260719190000_add_job_match_email_type/migration.sql). Not wired to any
-- send call site yet; that's a separate, later pass.
--
-- Additive only — same ALTER TYPE ... ADD VALUE IF NOT EXISTS pattern as
-- every other EmailType addition in this history (e.g.
-- 20260722100000_add_system_health_alert_email_type). Kept in its own
-- migration because Postgres forbids using a newly-added enum value in the
-- same transaction that added it.

ALTER TYPE "EmailType" ADD VALUE IF NOT EXISTS 'EMPLOYER_OUTREACH';
