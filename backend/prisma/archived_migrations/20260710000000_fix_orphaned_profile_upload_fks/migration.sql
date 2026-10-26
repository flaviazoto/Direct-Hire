-- Root-cause fix for orphaned WorkerProfile/EmployerProfile (and their
-- dependent) rows surviving User deletion — found while investigating the
-- passport re-encryption LEFT JOIN necessity.
--
-- DIAGNOSIS (queried live pg_constraint / information_schema directly, not
-- inferred from schema.prisma): schema.prisma correctly declares every
-- relation below with onDelete: Cascade, and the archived initial-schema
-- migration (archived_migrations/20260400000000_initial_schema) DOES create
-- all of these FKs. But the LIVE database currently has NONE of them —
-- same class of drift already documented in
-- 20260704120000_phase1_additive_reconcile ("production is running an older
-- schema generation"). Confirmed empirically:
--   WorkerProfile.userId              -> User   : FK MISSING  (13 orphans found)
--   EmployerProfile.userId            -> User   : FK MISSING  (2 orphans found)
--   Upload.userId                     -> User   : FK MISSING  (8 orphans found)
--   WorkerSkill.workerProfileId       -> WorkerProfile : FK MISSING (0 orphans currently)
--   WorkerLanguage.workerProfileId    -> WorkerProfile : FK MISSING (0 orphans currently)
--   WorkerTargetCountry.workerProfileId -> WorkerProfile : FK MISSING (0 orphans currently)
--   EmployerHiringCountry.employerProfileId -> EmployerProfile : FK MISSING (0 orphans currently)
--   EmployerRequiredSkill.employerProfileId -> EmployerProfile : FK MISSING (0 orphans currently)
-- Already correct, NOT touched here:
--   SavedJob.workerProfileId -> WorkerProfile : CASCADE, present and working
--
-- deleteAccount() (auth.controller.ts) does `prisma.user.delete()` and
-- comments "cascades handle everything else" — accurate against
-- schema.prisma, but wrong against the live DB, because none of these
-- constraints were actually there to cascade. Fixing only the top-level
-- User->WorkerProfile link would have just moved the same bug one level
-- down (WorkerSkill would then survive WorkerProfile deletion instead), so
-- this migration closes the whole chain for the WorkerProfile/EmployerProfile
-- family in one pass.
--
-- OUT OF SCOPE, deliberately NOT touched here: 9 other tables with a userId
-- column also have no FK to User (AuditLog, EmailLog,
-- EmailVerificationToken, Notification, OnboardingProgress,
-- PasswordResetToken, Payment, Session, VerificationRecord).
-- AuditLog is intentionally FK-less by design (deleteAccount anonymizes
-- actorId to "DELETED_USER" rather than relying on cascade/SET NULL). The
-- other 8 were not individually orphan-audited and deserve their own
-- deliberate pass, not a rider on this migration. Also NOT touched:
-- "Subscription" table (references EmployerProfile with RESTRICT) — this
-- table has no corresponding model in schema.prisma at all; it's an
-- unmapped legacy table outside this migration's scope.
--
-- DEPLOYMENT ORDER — every ADD CONSTRAINT below uses NOT VALID, which skips
-- checking EXISTING rows (so this migration succeeds immediately despite
-- the orphans already in these tables) but is FULLY enforced for every new
-- INSERT/UPDATE/DELETE from the moment it applies — i.e. deploying this
-- alone stops any NEW orphans immediately, independent of when the sweep
-- script (scripts/sweep-orphaned-profiles.ts) runs. Run the sweep whenever
-- convenient, then run the VALIDATE CONSTRAINT statements at the bottom
-- (commented out — see note there).

ALTER TABLE "WorkerProfile"
  ADD CONSTRAINT "WorkerProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "EmployerProfile"
  ADD CONSTRAINT "EmployerProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "Upload"
  ADD CONSTRAINT "Upload_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "WorkerSkill"
  ADD CONSTRAINT "WorkerSkill_workerProfileId_fkey"
  FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "WorkerLanguage"
  ADD CONSTRAINT "WorkerLanguage_workerProfileId_fkey"
  FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "WorkerTargetCountry"
  ADD CONSTRAINT "WorkerTargetCountry_workerProfileId_fkey"
  FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "EmployerHiringCountry"
  ADD CONSTRAINT "EmployerHiringCountry_employerProfileId_fkey"
  FOREIGN KEY ("employerProfileId") REFERENCES "EmployerProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "EmployerRequiredSkill"
  ADD CONSTRAINT "EmployerRequiredSkill_employerProfileId_fkey"
  FOREIGN KEY ("employerProfileId") REFERENCES "EmployerProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

-- Run these AFTER scripts/sweep-orphaned-profiles.ts --execute reports zero
-- remaining orphans in WorkerProfile/EmployerProfile/Upload (the three
-- tables the sweep script actually cleans — the dependent tables currently
-- have zero orphans so validating them should be a no-op, but VALIDATE
-- CONSTRAINT re-checks all current rows regardless):
--
--   ALTER TABLE "WorkerProfile"           VALIDATE CONSTRAINT "WorkerProfile_userId_fkey";
--   ALTER TABLE "EmployerProfile"         VALIDATE CONSTRAINT "EmployerProfile_userId_fkey";
--   ALTER TABLE "Upload"                  VALIDATE CONSTRAINT "Upload_userId_fkey";
--   ALTER TABLE "WorkerSkill"             VALIDATE CONSTRAINT "WorkerSkill_workerProfileId_fkey";
--   ALTER TABLE "WorkerLanguage"          VALIDATE CONSTRAINT "WorkerLanguage_workerProfileId_fkey";
--   ALTER TABLE "WorkerTargetCountry"     VALIDATE CONSTRAINT "WorkerTargetCountry_workerProfileId_fkey";
--   ALTER TABLE "EmployerHiringCountry"   VALIDATE CONSTRAINT "EmployerHiringCountry_employerProfileId_fkey";
--   ALTER TABLE "EmployerRequiredSkill"   VALIDATE CONSTRAINT "EmployerRequiredSkill_employerProfileId_fkey";
--
-- Left commented out (not executed by this migration) because VALIDATE
-- CONSTRAINT fails outright if any orphan still exists at deploy time, and
-- this migration must be safe to deploy BEFORE the sweep has necessarily run.
