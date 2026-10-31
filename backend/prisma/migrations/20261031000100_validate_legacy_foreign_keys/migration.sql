-- Eight foreign keys were added NOT VALID in July 2026
-- (archived 20260710000000_fix_orphaned_profile_upload_fks) because orphan
-- rows existed then. They already block new violations; this validates the
-- existing rows too. A read-only check on 2026-10-31 found 0 violating rows.
-- Idempotent: only constraints that exist and are not yet validated.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname, conrelid::regclass AS tbl FROM pg_constraint
    WHERE contype = 'f' AND NOT convalidated AND conname IN (
      'EmployerHiringCountry_employerProfileId_fkey', 'EmployerProfile_userId_fkey',
      'EmployerRequiredSkill_employerProfileId_fkey', 'Upload_userId_fkey',
      'WorkerLanguage_workerProfileId_fkey', 'WorkerProfile_userId_fkey',
      'WorkerSkill_workerProfileId_fkey', 'WorkerTargetCountry_workerProfileId_fkey')
  LOOP
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;
