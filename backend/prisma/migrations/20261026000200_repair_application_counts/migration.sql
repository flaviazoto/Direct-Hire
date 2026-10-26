-- Recompute job_posts.application_count (non-withdrawn applications, the
-- definition applyToJob/withdrawApplication maintain). Account deletion used
-- to remove applications without decrementing it; production had 2 jobs off.
-- Idempotent: only rows that differ are touched.
UPDATE "job_posts" j
SET    "application_count" = c.n
FROM  (SELECT jp."id", COUNT(a."id")::int AS n
       FROM "job_posts" jp
       LEFT JOIN "applications" a ON a."job_id" = jp."id" AND a."status" <> 'WITHDRAWN'
       GROUP BY jp."id") c
WHERE  j."id" = c."id" AND j."application_count" <> c.n;
