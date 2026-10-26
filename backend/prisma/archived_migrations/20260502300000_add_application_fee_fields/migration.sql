-- Add application fee fields to the applications table
ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "application_fee_cents"     INTEGER,
  ADD COLUMN IF NOT EXISTS "application_fee_paid"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id"  TEXT;
