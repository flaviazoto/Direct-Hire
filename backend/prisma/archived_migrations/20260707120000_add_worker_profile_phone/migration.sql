-- Additive only: adds an encrypted phone column to WorkerProfile.
-- Fixes the onboarding silent-drop bug — phone was collected client-side and
-- required at onboarding, but never persisted anywhere queryable (it only
-- ever survived inside OnboardingProgress.draftData JSON).
--
-- WorkerProfile has no @map/@@map anywhere in schema.prisma (unlike
-- Application/Payment) — table and columns are native camelCase, so this
-- follows that same convention. Stored encrypted via lib/encrypt.ts, exactly
-- like passportNumber on the same table.

ALTER TABLE "WorkerProfile"
  ADD COLUMN IF NOT EXISTS "phone" TEXT;
