-- Migration: add composite index on job_posts(status, country, category)
-- Used by public job search to filter APPROVED jobs by location and category efficiently.

CREATE INDEX IF NOT EXISTS "job_posts_status_country_category_idx"
ON "job_posts"(status, country, category);
