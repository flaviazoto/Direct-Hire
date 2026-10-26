-- Additive only: adds an encrypted phone column to EmployerProfile.
-- Same silent-drop bug as WorkerProfile.phone (20260707120000): the employer
-- onboarding frontend already collects and required "Contact Phone" at step
-- 2 (frontend/src/app/(app)/employer/onboarding/page.tsx sends
-- `phone: vals.contactPhone` in that step's payload), but
-- persistEmployerStep's case 2 never wrote it anywhere queryable.
--
-- EmployerProfile has no @map/@@map anywhere in schema.prisma — table and
-- columns are native camelCase, same convention as WorkerProfile.phone.
-- Stored encrypted via lib/encrypt.ts, exactly like WorkerProfile.phone and
-- EmployerProfile.administratorId on the same table.

ALTER TABLE "EmployerProfile"
  ADD COLUMN IF NOT EXISTS "phone" TEXT;
