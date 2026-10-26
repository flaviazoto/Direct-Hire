-- Profile photos and company logos were stored with a storage "public URL",
-- which does not load because the bucket is private. Point them at the
-- stable /api/media/<id> route, which redirects to a fresh signed URL.
-- Idempotent.
UPDATE "Upload"
SET    "fileUrl" = '/api/media/' || "id"
WHERE  "fileType" IN ('PROFILE_PHOTO', 'COMPANY_LOGO')
  AND  "isPrivate" = false
  AND  "status" = 'UPLOADED'
  AND  "fileUrl" <> '/api/media/' || "id";
