-- Reconcile production with schema.prisma after the migration baseline.
--
-- Production was built partly outside the migration history, so it drifted
-- from schema.prisma. This migration brings it in line WITHOUT destroying
-- data. Every statement is idempotent: on a database created from the
-- baseline migration it is a no-op.
--
-- Deliberately NOT done here (see prisma/manual/legacy_cleanup.sql, which
-- needs explicit approval and a backup first): dropping the legacy tables
-- Skill, Subscription, job_required_skills, trust_score_history, the legacy
-- columns Payment.amount_cents/entity_id/entity_type/stripe_payment_intent_id/
-- created_at/updated_at, User.phoneEnc, WorkerProfile.passportNumberEnc,
-- WorkerSkill.skill_id, and the legacy enums.

-- ── 1. Orphan rows (no foreign keys existed, so deleted users left them) ────
-- Rows that only make sense with their user are removed; logs keep their
-- content and lose the dangling user reference, matching ON DELETE SET NULL.
DELETE FROM "Session"                s WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = s."userId");
DELETE FROM "EmailVerificationToken" t WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = t."userId");
DELETE FROM "PasswordResetToken"     t WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = t."userId");
DELETE FROM "OnboardingProgress"     o WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = o."userId");
DELETE FROM "VerificationRecord"     v WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = v."userId");
UPDATE "VerificationRecord" v SET "reviewedById" = NULL
  WHERE v."reviewedById" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = v."reviewedById");
UPDATE "EmailLog" e SET "userId" = NULL
  WHERE e."userId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = e."userId");
UPDATE "AuditLog" a SET "userId" = NULL
  WHERE a."userId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = a."userId");
DELETE FROM "Payment" p WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = p."userId");

-- ── 2. Foreign keys (added NOT VALID, then validated) ───────────────────────
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN SELECT * FROM (VALUES
    ('Session',                'Session_userId_fkey',                'userId',       'CASCADE'),
    ('EmailVerificationToken', 'EmailVerificationToken_userId_fkey', 'userId',       'CASCADE'),
    ('PasswordResetToken',     'PasswordResetToken_userId_fkey',     'userId',       'CASCADE'),
    ('OnboardingProgress',     'OnboardingProgress_userId_fkey',     'userId',       'CASCADE'),
    ('VerificationRecord',     'VerificationRecord_userId_fkey',     'userId',       'CASCADE'),
    ('VerificationRecord',     'VerificationRecord_reviewedById_fkey','reviewedById','SET NULL'),
    ('EmailLog',               'EmailLog_userId_fkey',               'userId',       'SET NULL'),
    ('AuditLog',               'AuditLog_userId_fkey',               'userId',       'SET NULL'),
    ('Payment',                'Payment_userId_fkey',                'userId',       'CASCADE')
  ) AS t(tbl, name, col, on_delete)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.name) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES "User"("id") ON DELETE %s ON UPDATE CASCADE NOT VALID',
        fk.tbl, fk.name, fk.col, fk.on_delete);
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', fk.tbl, fk.name);
    END IF;
  END LOOP;
END $$;

-- ── 3. Payment columns required by the schema (no NULLs in production) ──────
ALTER TABLE "Payment" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "amount" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "currency" SET DEFAULT 'USD';

-- ── 4. Indexes ──────────────────────────────────────────────────────────────
-- Replaced by the unique index below / not declared on a schema column.
DROP INDEX IF EXISTS "EmployerProfile_stripeCustomerId_idx";
DROP INDEX IF EXISTS "Payment_status_idx";

CREATE INDEX        IF NOT EXISTS "AuditLog_createdAt_idx"               ON "AuditLog"("createdAt");
CREATE INDEX        IF NOT EXISTS "EmailVerificationToken_token_idx"     ON "EmailVerificationToken"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "EmployerProfile_stripeCustomerId_key" ON "EmployerProfile"("stripeCustomerId");
CREATE INDEX        IF NOT EXISTS "EmployerProfile_userId_idx"           ON "EmployerProfile"("userId");
CREATE INDEX        IF NOT EXISTS "OnboardingProgress_userId_idx"        ON "OnboardingProgress"("userId");
CREATE INDEX        IF NOT EXISTS "PasswordResetToken_token_idx"         ON "PasswordResetToken"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_stripeInvoiceId_key"          ON "Payment"("stripeInvoiceId");
CREATE INDEX        IF NOT EXISTS "Session_refreshToken_idx"             ON "Session"("refreshToken");
CREATE INDEX        IF NOT EXISTS "User_email_idx"                       ON "User"("email");
CREATE INDEX        IF NOT EXISTS "WorkerProfile_userId_idx"             ON "WorkerProfile"("userId");

ALTER INDEX IF EXISTS "EmployerHiringCountry_profile_country_key" RENAME TO "EmployerHiringCountry_employerProfileId_country_key";
ALTER INDEX IF EXISTS "EmployerRequiredSkill_profile_skill_key"   RENAME TO "EmployerRequiredSkill_employerProfileId_skill_key";
ALTER INDEX IF EXISTS "OnboardingProgress_status_idx"             RENAME TO "OnboardingProgress_onboardingStatus_idx";
ALTER INDEX IF EXISTS "VerificationRecord_status_idx"             RENAME TO "VerificationRecord_reviewStatus_idx";
ALTER INDEX IF EXISTS "WorkerLanguage_profile_lang_key"           RENAME TO "WorkerLanguage_workerProfileId_language_key";
ALTER INDEX IF EXISTS "WorkerSkill_profile_skill_key"             RENAME TO "WorkerSkill_workerProfileId_skill_key";
ALTER INDEX IF EXISTS "WorkerTargetCountry_profile_country_key"   RENAME TO "WorkerTargetCountry_workerProfileId_country_key";

-- ── 5. Column types and defaults (match Prisma; no data loss) ───────────────
-- TIMESTAMP -> TIMESTAMP(3) only rounds to milliseconds. IDs and updatedAt
-- are generated by the application; every raw INSERT supplies its own id.
ALTER TABLE "OnboardingProgress" ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "submittedAt" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "lastSavedAt" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "updatedAt" DROP DEFAULT,
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "PasswordResetToken" ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "usedAt" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "Session" ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "Upload" ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "uploadedAt" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "User" ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "lastLoginAt" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "updatedAt" DROP DEFAULT, ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "posting_rights_revoked_at" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "VerificationRecord" ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "reviewedAt" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "updatedAt" DROP DEFAULT, ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "WorkerLanguage" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "WorkerProfile" ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "dateOfBirth" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "availabilityDate" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3), ALTER COLUMN "updatedAt" DROP DEFAULT,
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "WorkerSkill" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "WorkerTargetCountry" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "applications" ALTER COLUMN "updated_at" DROP DEFAULT,
  ALTER COLUMN "offered_currency" SET DATA TYPE TEXT, ALTER COLUMN "start_date" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "contract_type" SET DATA TYPE TEXT, ALTER COLUMN "hire_confirmed_at" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "external_jobs" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "growth_agent_tasks" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "growth_content_drafts" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "job_posts" ALTER COLUMN "required_skills" DROP DEFAULT,
  ALTER COLUMN "updated_at" DROP DEFAULT, ALTER COLUMN "changes_requested_at" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "resubmitted_at" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "lock_billing_charges" ALTER COLUMN "grace_period_ends_at" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "platform_config" ALTER COLUMN "updated_at" DROP DEFAULT,
  ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);
