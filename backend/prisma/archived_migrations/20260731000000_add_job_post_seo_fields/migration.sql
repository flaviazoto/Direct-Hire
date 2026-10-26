ALTER TABLE "job_posts"
  ADD COLUMN IF NOT EXISTS "seo_meta_title" VARCHAR(70),
  ADD COLUMN IF NOT EXISTS "seo_meta_description" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "seo_intro" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_generated_at" TIMESTAMP(3);
