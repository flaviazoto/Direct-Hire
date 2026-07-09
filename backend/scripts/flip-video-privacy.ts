// backend/scripts/flip-video-privacy.ts
// Storage security rollout, code phase — flips existing WORK_VIDEO / INTRO_VIDEO
// Upload rows from public to private now that uploads.controller.ts's isPrivate
// gate covers these file types for new uploads. Rows created before that change
// still have isPrivate = false and need a one-time backfill.
//
// Deliberately leaves fileUrl untouched on flipped rows (audit section 2 flagged
// it as a "bare filePath copy" oddity for already-private types, but every
// consumer that reads fileUrl for an isPrivate row only falls back to it when
// createSignedUrl() fails — see uploads.controller.ts's getUploadUrl/listUploads
// and the equivalent sites in admin.controller.ts, admin-documents.controller.ts,
// employer.controller.ts. A stale *public* URL succeeding silently would be worse
// than a bare path failing loudly, so fileUrl is not rewritten here.
//
// Follows the exact pattern proven in reencrypt-passports.ts /
// backfill-worker-phones.ts: pg over DIRECT_URL (not Prisma), dry-run by
// default, explicit --execute flag, verification query after writes.
//
// Run:
//   npm run flip-video-privacy              (dry run — reports count only)
//   npm run flip-video-privacy -- --execute (flips isPrivate = true)

import "dotenv/config";
import { Client } from "pg";

const EXECUTE = process.argv.includes("--execute") || process.argv.includes("--apply");

const COUNT_QUERY = `
  SELECT COUNT(*)::int AS count
    FROM "Upload"
   WHERE "fileType" IN ('WORK_VIDEO', 'INTRO_VIDEO')
     AND "isPrivate" = false
`;

async function main() {
  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    console.error("FATAL: DIRECT_URL is not set (expected the non-pooled, port-5432 connection string).");
    process.exit(1);
  }

  console.log(`[flip-video-privacy] mode: ${EXECUTE ? "EXECUTE (will flip isPrivate)" : "DRY RUN (no writes)"}`);

  const client = new Client({ connectionString });
  await client.connect();

  const before = await client.query<{ count: number }>(COUNT_QUERY);
  const matching = before.rows[0].count;

  console.log(`[flip-video-privacy] found ${matching} WORK_VIDEO/INTRO_VIDEO row(s) with isPrivate = false`);

  if (!EXECUTE) {
    console.log("[flip-video-privacy] dry run complete — rerun with --execute to flip these rows");
    await client.end();
    return;
  }

  if (matching === 0) {
    console.log("[flip-video-privacy] nothing to do");
    await client.end();
    return;
  }

  const result = await client.query(
    `UPDATE "Upload"
        SET "isPrivate" = true
      WHERE "fileType" IN ('WORK_VIDEO', 'INTRO_VIDEO')
        AND "isPrivate" = false`,
  );

  console.log(`[flip-video-privacy] flipped ${result.rowCount} row(s) to isPrivate = true`);

  const after = await client.query<{ count: number }>(COUNT_QUERY);
  const remaining = after.rows[0].count;

  if (remaining === 0) {
    console.log("[flip-video-privacy] verified — 0 rows remaining with isPrivate = false");
  } else {
    console.error(`[flip-video-privacy] WARNING — ${remaining} row(s) still isPrivate = false after update`);
  }

  await client.end();

  if (remaining !== 0) process.exit(1);
}

main().catch((e) => {
  console.error("[flip-video-privacy] FATAL:", e);
  process.exit(1);
});
