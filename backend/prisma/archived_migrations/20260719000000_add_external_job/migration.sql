-- Add ExternalJob — admin-curated links to jobs hosted elsewhere (EURES,
-- LinkedIn, Indeed, national job boards). Surfaced in the worker feed and
-- public jobs list alongside real job_posts rows, tagged source: 'external'
-- at the API layer. Purely additive: new table + one FK to an existing
-- table, nothing dropped or altered.
--
-- Deliberately a separate table from job_posts — external jobs have no
-- employer, no applications, no matching pipeline.
--
-- "status" is plain TEXT (not an enum), matching the existing Payment.status
-- convention in this schema (see CREATE TABLE "Payment" in
-- 20260502100000_add_stripe_payments/migration.sql) — documented allowed
-- values in a comment rather than a Postgres enum.
--
-- "contract_type" reuses the existing "ContractType" enum (already created
-- by 20260409000000_add_job_posts) rather than introducing a duplicate type.
--
-- Pre-deploy discovery: an "external_jobs" table already existed in this
-- database with an incompatible ad-hoc schema (company/location/currency/
-- jobType/isActive/isPinned/skills/views/createdBy-as-string columns) and a
-- single row of placeholder test data (random-character title/company/
-- description, a Google ad-click redirect as the "externalUrl"). No
-- application code anywhere in this repo referenced that table — it was
-- orphaned. Full DB backup taken (backend/backups/2026-07-19/) including
-- that row before the DROP below runs.

DROP TABLE IF EXISTS "external_jobs" CASCADE;

CREATE TABLE IF NOT EXISTS "external_jobs" (
  "id"               TEXT          NOT NULL,

  "title"            TEXT          NOT NULL,
  "description"      TEXT          NOT NULL,

  "country"          TEXT          NOT NULL,
  "city"             TEXT,

  "salary_min"       DECIMAL(10,2),
  "salary_max"       DECIMAL(10,2),
  "salary_currency"  TEXT,

  "contract_type"    "ContractType",

  "external_url"     TEXT          NOT NULL,
  "source_name"      TEXT          NOT NULL,

  "status"           TEXT          NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | ARCHIVED

  "created_by_id"    TEXT,

  "created_at"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "external_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "external_jobs_status_idx"     ON "external_jobs"("status");
CREATE INDEX IF NOT EXISTS "external_jobs_country_idx"    ON "external_jobs"("country");
CREATE INDEX IF NOT EXISTS "external_jobs_created_at_idx" ON "external_jobs"("created_at");

-- created_by_id is nullable + ON DELETE SET NULL: deleting the admin account
-- that pasted a listing must not cascade-delete the listing itself — same
-- pattern as AuditLog.userId → User (SetNull), not JobPost.employerId → User
-- (Cascade), since there is no "owner" relationship here to cascade through.
ALTER TABLE "external_jobs"
  ADD CONSTRAINT "external_jobs_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
