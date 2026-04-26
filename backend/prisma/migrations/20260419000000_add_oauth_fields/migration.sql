-- Migration: add_oauth_fields
-- Adds Google/LinkedIn OAuth IDs, avatar URL, and onboarding completion flag to User table

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "googleId"           TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS "linkedinId"         TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS "avatarUrl"          TEXT,
  ADD COLUMN IF NOT EXISTS "onboardingComplete" BOOLEAN NOT NULL DEFAULT false;
