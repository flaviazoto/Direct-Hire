-- Add Stripe customer + subscription period fields to EmployerProfile
ALTER TABLE "EmployerProfile"
  ADD COLUMN IF NOT EXISTS "stripeCustomerId"             TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionId"         TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionCurrentPeriodEnd" TIMESTAMP(3);

-- Payment records table
CREATE TABLE IF NOT EXISTS "Payment" (
  "id"              TEXT         NOT NULL,
  "userId"          TEXT         NOT NULL,
  "stripePaymentId" TEXT,
  "stripeInvoiceId" TEXT,
  "amount"          INTEGER      NOT NULL,
  "currency"        TEXT         NOT NULL DEFAULT 'USD',
  "status"          TEXT         NOT NULL DEFAULT 'PENDING',
  "type"            TEXT         NOT NULL DEFAULT 'SUBSCRIPTION',
  "description"     TEXT,
  "metadata"        JSONB,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_stripeInvoiceId_key" UNIQUE ("stripeInvoiceId")
);

CREATE INDEX IF NOT EXISTS "Payment_userId_idx"         ON "Payment"("userId");
CREATE INDEX IF NOT EXISTS "Payment_stripeInvoiceId_idx" ON "Payment"("stripeInvoiceId");

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
