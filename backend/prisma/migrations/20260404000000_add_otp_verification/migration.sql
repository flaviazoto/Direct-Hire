-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_EMAIL_VERIFICATION', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VerificationCodeType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- AlterTable: add OTP fields to User
ALTER TABLE "User"
  ADD COLUMN "account_status"                  "AccountStatus" NOT NULL DEFAULT 'PENDING_EMAIL_VERIFICATION',
  ADD COLUMN "email_verification_code_hash"    TEXT,
  ADD COLUMN "email_verification_expires_at"   TIMESTAMP(3),
  ADD COLUMN "email_verification_attempts"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "email_verification_sent_at"      TIMESTAMP(3);

-- CreateTable
CREATE TABLE "verification_codes" (
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
CREATE INDEX "verification_codes_userId_type_idx" ON "verification_codes"("userId", "type");

-- AddForeignKey
ALTER TABLE "verification_codes"
  ADD CONSTRAINT "verification_codes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
