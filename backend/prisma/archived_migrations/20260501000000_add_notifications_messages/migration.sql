-- Migration: add_notifications_messages
-- Adds NotificationType enum, converts Notification.type, adds metadata,
-- creates Message table with named relations.

-- Step 1: Create the NotificationType enum
DO $$
BEGIN
  CREATE TYPE "NotificationType" AS ENUM (
    'MESSAGE_RECEIVED',
    'APPLICATION_UPDATE',
    'PROFILE_APPROVED',
    'PROFILE_REJECTED',
    'JOB_MATCH',
    'GENERAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Step 2: Add a new typed column (nullable so existing rows aren't blocked)
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "type_new" "NotificationType";

-- Step 3: Map all existing rows to GENERAL (old string values don't match new enum)
UPDATE "Notification" SET "type_new" = 'GENERAL';

-- Step 4: Drop the old string column
ALTER TABLE "Notification" DROP COLUMN "type";

-- Step 5: Rename new column to type
ALTER TABLE "Notification" RENAME COLUMN "type_new" TO "type";

-- Step 6: Enforce NOT NULL
ALTER TABLE "Notification" ALTER COLUMN "type" SET NOT NULL;

-- Step 7: Add metadata column
ALTER TABLE "Notification" ADD COLUMN "metadata" JSONB;

-- Step 8: Add index on createdAt
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");

-- Step 9: Create Message table
CREATE TABLE IF NOT EXISTS "Message" (
    "id"          TEXT         NOT NULL,
    "senderId"    TEXT         NOT NULL,
    "recipientId" TEXT         NOT NULL,
    "body"        TEXT         NOT NULL,
    "isRead"      BOOLEAN      NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- Step 10: Add foreign keys for Message
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_senderId_fkey"
  FOREIGN KEY ("senderId")
  REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_recipientId_fkey"
  FOREIGN KEY ("recipientId")
  REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 11: Indexes for Message
CREATE INDEX IF NOT EXISTS "Message_recipientId_idx" ON "Message"("recipientId");
CREATE INDEX IF NOT EXISTS "Message_senderId_idx"    ON "Message"("senderId");
CREATE INDEX IF NOT EXISTS "Message_createdAt_idx"   ON "Message"("createdAt");
