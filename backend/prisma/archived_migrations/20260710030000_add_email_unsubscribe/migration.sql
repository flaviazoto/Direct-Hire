-- Additive only: per-user email suppression + unsubscribe token.
--
-- emailUnsubscribedAt — NULL means subscribed (default for everyone,
--                        including every existing account — no backfill
--                        needed, NULL is the correct "never unsubscribed"
--                        state for pre-existing users).
-- unsubscribeToken     — random, stored (not a signed/stateless JWT) so it
--                        can be looked up directly by a WHERE clause with no
--                        secret-verification step, same shape as this app's
--                        existing PasswordResetToken/EmailVerificationToken
--                        pattern, but as a plain column since this token
--                        never expires and is 1:1 with the user (a separate
--                        table would just be a table with one row per user).
--                        Generated lazily — at registration for new users,
--                        or on first non-transactional email send for
--                        existing users (see lib/unsubscribe.ts) — so no
--                        backfill migration is needed here either.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailUnsubscribedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "unsubscribeToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_unsubscribeToken_key" ON "User"("unsubscribeToken");
