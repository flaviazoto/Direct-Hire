-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "AccountStatus" AS ENUM ('PENDING_EMAIL_VERIFICATION', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "VerificationCodeType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: add OTP fields to User
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "account_status"                  "AccountStatus" NOT NULL DEFAULT 'PENDING_EMAIL_VERIFICATION',
  ADD COLUMN IF NOT EXISTS "email_verification_code_hash"    TEXT,
  ADD COLUMN IF NOT EXISTS "email_verification_expires_at"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "email_verification_attempts"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "email_verification_sent_at"      TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "verification_codes" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "type"       "VerificationCodeType" NOT NULL,
    "code_hash"  TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at"    TIMESTAMP(3),
    "attempts"   INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "verification_codes_userId_type_idx" ON "verification_codes"("userId", "type");

-- AddForeignKey
ALTER TABLE "verification_codes"
  ADD CONSTRAINT "verification_codes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
