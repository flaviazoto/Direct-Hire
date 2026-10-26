-- Additive-only: worker's response to an interview invitation.
-- Independent of Application.status (status stays INTERVIEWED regardless of
-- the worker's answer; the employer still separately decides ACCEPTED/REJECTED).
-- Same discipline as this week's other migrations: ADD COLUMN IF NOT EXISTS,
-- nothing dropped, nothing renamed, all nullable.

ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "interview_response"         TEXT,
  ADD COLUMN IF NOT EXISTS "interview_response_message" TEXT,
  ADD COLUMN IF NOT EXISTS "interview_responded_at"     TIMESTAMP(3);
