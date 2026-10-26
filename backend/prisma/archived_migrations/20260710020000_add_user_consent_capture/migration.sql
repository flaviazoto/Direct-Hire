-- Additive only: GDPR explicit-consent capture at registration.
--
-- consentAcceptedAt   — when the user checked the (required, unchecked-by-
--                        default) "I agree to the Terms of Service and
--                        Privacy Policy" box on the registration form.
-- consentPolicyVersion — which version of the policies they agreed to
--                        (currently "2025-01", matching the "Last updated"
--                        date shown on /terms and /privacy — bump this
--                        constant in auth.controller.ts whenever those pages
--                        change materially).
--
-- Backfill: deliberately NONE. Existing users registered before this column
-- existed have no recorded consent event, and there's no honest way to
-- reconstruct one — fabricating a timestamp would misrepresent what
-- actually happened. Both columns are nullable; NULL means "no consent on
-- record", which is the truthful state for every pre-existing account.
-- Standard remedy (re-prompt these users for consent on next login) is
-- flagged as a follow-up, NOT built in this pass — see the compliance
-- leftovers report for the reasoning.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "consentAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "consentPolicyVersion" TEXT;
