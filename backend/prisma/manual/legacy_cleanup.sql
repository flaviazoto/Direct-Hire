-- Legacy schema cleanup — NOT a migration, never applied automatically.
--
-- Removes production-only objects that no code uses and that schema.prisma
-- doesn't declare. Run only after:
--   1. a verified backup that has been restored successfully;
--   2. exporting the tables below if their contents must be kept
--      (Skill: 61 rows, trust_score_history: 3 rows at 2026-10-26);
--   3. confirming the legacy encrypted columns hold nothing still needed
--      (User.phoneEnc: 4 rows, WorkerProfile.passportNumberEnc: 1 row —
--      see scripts/retire-passportNumberEnc.sql for the passport check).
-- Afterwards, `prisma migrate diff --from-url <db> --to-schema-datamodel`
-- should report no differences.

BEGIN;

ALTER TABLE "WorkerSkill"         DROP CONSTRAINT IF EXISTS "WorkerSkill_skill_id_fkey";
ALTER TABLE "job_required_skills" DROP CONSTRAINT IF EXISTS "job_required_skills_job_id_fkey";
ALTER TABLE "job_required_skills" DROP CONSTRAINT IF EXISTS "job_required_skills_skill_id_fkey";
ALTER TABLE "trust_score_history" DROP CONSTRAINT IF EXISTS "trust_score_history_worker_id_fkey";
ALTER TABLE "Subscription"        DROP CONSTRAINT IF EXISTS "Subscription_employer_id_fkey";

DROP INDEX IF EXISTS "Payment_entity_id_entity_type_idx";
DROP INDEX IF EXISTS "Payment_stripe_payment_intent_id_key";
DROP INDEX IF EXISTS "WorkerSkill_skill_id_idx";

ALTER TABLE "Payment"
  DROP COLUMN IF EXISTS "amount_cents",
  DROP COLUMN IF EXISTS "created_at",
  DROP COLUMN IF EXISTS "entity_id",
  DROP COLUMN IF EXISTS "entity_type",
  DROP COLUMN IF EXISTS "stripe_payment_intent_id",
  DROP COLUMN IF EXISTS "updated_at";
ALTER TABLE "User"          DROP COLUMN IF EXISTS "phoneEnc";
ALTER TABLE "WorkerProfile" DROP COLUMN IF EXISTS "passportNumberEnc";
ALTER TABLE "WorkerSkill"   DROP COLUMN IF EXISTS "skill_id";

DROP TABLE IF EXISTS "job_required_skills";
DROP TABLE IF EXISTS "trust_score_history";
DROP TABLE IF EXISTS "Subscription";
DROP TABLE IF EXISTS "Skill";

DROP TYPE IF EXISTS "PaymentEntityType";
DROP TYPE IF EXISTS "PaymentStatus";
DROP TYPE IF EXISTS "SubscriptionStatus";

COMMIT;
