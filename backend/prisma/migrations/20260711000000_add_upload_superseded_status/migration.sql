-- Upload.status is a Prisma enum (FileStatus), not a plain string column —
-- adding SUPERSEDED requires this migration rather than a code-only change.
--
-- Context: uploadFile() (uploads.controller.ts) creates a brand-new Upload
-- row on every re-upload of the same fileType — deliberately NOT an upsert,
-- since the row history has value for admin document review. But the
-- previous row was left at status='UPLOADED' forever, so a worker with 3
-- re-uploaded profile photos showed 3 "current" rows. This value lets the
-- app mark the old ones SUPERSEDED (set by uploadFile() right after a
-- successful new upload of the same fileType) without deleting or upserting
-- them — still listed, just visually de-emphasized in admin document review.
--
-- Uses the same ALTER TYPE ... ADD VALUE IF NOT EXISTS pattern already
-- proven in this repo (20260502200000_add_application_email_notification_types).

ALTER TYPE "FileStatus" ADD VALUE IF NOT EXISTS 'SUPERSEDED';
