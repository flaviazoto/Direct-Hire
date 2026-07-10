// backend/scripts/sweep-orphaned-profiles.ts
// Deletes WorkerProfile / EmployerProfile / Upload rows whose userId no
// longer matches any User row (orphaned by account deletion — see the
// companion migration 20260710000000_fix_orphaned_profile_upload_fks for the
// root-cause fix: these tables' FK constraints to User/WorkerProfile/
// EmployerProfile were missing from the live DB, despite schema.prisma
// declaring them correctly).
//
// This script's job is only to clean up the orphans that already exist — it
// does not depend on that migration having been deployed first (safe to run
// before or after). It explicitly deletes dependent rows itself rather than
// relying on any live DB cascade, so it works correctly either way:
//   WorkerProfile   -> deletes its WorkerSkill / WorkerLanguage /
//                      WorkerTargetCountry / SavedJob rows first, then the
//                      WorkerProfile row itself
//   EmployerProfile -> deletes its EmployerHiringCountry /
//                      EmployerRequiredSkill rows first, then the
//                      EmployerProfile row itself
//   Upload          -> no dependents (reviewedById is nullable / SET NULL
//                      on the one FK that does exist); deleted directly
//
// Follows the exact pattern proven in reencrypt-passports.ts /
// backfill-worker-phones.ts / flip-video-privacy.ts: pg over DIRECT_URL,
// dry-run by default, explicit --execute flag, verification query after
// writes.
//
// Run:
//   npm run sweep:orphaned-profiles              (dry run — reports counts only)
//   npm run sweep:orphaned-profiles -- --execute  (deletes orphans + dependents)

import "dotenv/config";
import { Client } from "pg";

const EXECUTE = process.argv.includes("--execute") || process.argv.includes("--apply");

interface DeletedCounts {
  skills: number; languages: number; targetCountries: number; savedJobs: number;
  hiringCountries: number; requiredSkills: number;
  workerProfiles: number; employerProfiles: number; uploads: number;
}

async function main() {
  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    console.error("FATAL: DIRECT_URL is not set (expected the non-pooled, port-5432 connection string).");
    process.exit(1);
  }

  console.log(`[sweep-orphaned-profiles] mode: ${EXECUTE ? "EXECUTE (will delete orphans)" : "DRY RUN (no writes)"}`);

  const client = new Client({ connectionString });
  await client.connect();

  const workerOrphans = await client.query<{ id: string }>(`
    SELECT wp.id
      FROM "WorkerProfile" wp
      LEFT JOIN "User" u ON u.id = wp."userId"
     WHERE u.id IS NULL
  `);
  const employerOrphans = await client.query<{ id: string }>(`
    SELECT ep.id
      FROM "EmployerProfile" ep
      LEFT JOIN "User" u ON u.id = ep."userId"
     WHERE u.id IS NULL
  `);
  const uploadOrphans = await client.query<{ id: string }>(`
    SELECT up.id
      FROM "Upload" up
      LEFT JOIN "User" u ON u.id = up."userId"
     WHERE u.id IS NULL
  `);

  console.log(`[sweep-orphaned-profiles] found ${workerOrphans.rowCount} orphaned WorkerProfile row(s)`);
  console.log(`[sweep-orphaned-profiles] found ${employerOrphans.rowCount} orphaned EmployerProfile row(s)`);
  console.log(`[sweep-orphaned-profiles] found ${uploadOrphans.rowCount} orphaned Upload row(s)`);

  if (!EXECUTE) {
    console.log("[sweep-orphaned-profiles] dry run complete — rerun with --execute to delete these rows");
    await client.end();
    return;
  }

  const workerIds   = workerOrphans.rows.map(r => r.id);
  const employerIds = employerOrphans.rows.map(r => r.id);
  const uploadIds   = uploadOrphans.rows.map(r => r.id);

  const deleted: DeletedCounts = {
    skills: 0, languages: 0, targetCountries: 0, savedJobs: 0,
    hiringCountries: 0, requiredSkills: 0,
    workerProfiles: 0, employerProfiles: 0, uploads: 0,
  };

  if (workerIds.length > 0) {
    deleted.skills          = (await client.query(`DELETE FROM "WorkerSkill" WHERE "workerProfileId" = ANY($1::text[])`, [workerIds])).rowCount ?? 0;
    deleted.languages       = (await client.query(`DELETE FROM "WorkerLanguage" WHERE "workerProfileId" = ANY($1::text[])`, [workerIds])).rowCount ?? 0;
    deleted.targetCountries = (await client.query(`DELETE FROM "WorkerTargetCountry" WHERE "workerProfileId" = ANY($1::text[])`, [workerIds])).rowCount ?? 0;
    deleted.savedJobs       = (await client.query(`DELETE FROM "SavedJob" WHERE "workerProfileId" = ANY($1::text[])`, [workerIds])).rowCount ?? 0;
    deleted.workerProfiles  = (await client.query(`DELETE FROM "WorkerProfile" WHERE id = ANY($1::text[])`, [workerIds])).rowCount ?? 0;
  }

  if (employerIds.length > 0) {
    deleted.hiringCountries  = (await client.query(`DELETE FROM "EmployerHiringCountry" WHERE "employerProfileId" = ANY($1::text[])`, [employerIds])).rowCount ?? 0;
    deleted.requiredSkills   = (await client.query(`DELETE FROM "EmployerRequiredSkill" WHERE "employerProfileId" = ANY($1::text[])`, [employerIds])).rowCount ?? 0;
    deleted.employerProfiles = (await client.query(`DELETE FROM "EmployerProfile" WHERE id = ANY($1::text[])`, [employerIds])).rowCount ?? 0;
  }

  if (uploadIds.length > 0) {
    deleted.uploads = (await client.query(`DELETE FROM "Upload" WHERE id = ANY($1::text[])`, [uploadIds])).rowCount ?? 0;
  }

  console.log("[sweep-orphaned-profiles] deleted:", deleted);

  // Verification — re-run the same three orphan queries, expect 0 each
  const [wpAfter, epAfter, upAfter] = await Promise.all([
    client.query<{ c: number }>(`SELECT COUNT(*)::int c FROM "WorkerProfile" wp LEFT JOIN "User" u ON u.id = wp."userId" WHERE u.id IS NULL`),
    client.query<{ c: number }>(`SELECT COUNT(*)::int c FROM "EmployerProfile" ep LEFT JOIN "User" u ON u.id = ep."userId" WHERE u.id IS NULL`),
    client.query<{ c: number }>(`SELECT COUNT(*)::int c FROM "Upload" up LEFT JOIN "User" u ON u.id = up."userId" WHERE u.id IS NULL`),
  ]);
  const remaining = wpAfter.rows[0].c + epAfter.rows[0].c + upAfter.rows[0].c;

  if (remaining === 0) {
    console.log("[sweep-orphaned-profiles] verified — 0 orphaned rows remaining");
  } else {
    console.error(`[sweep-orphaned-profiles] WARNING — ${remaining} orphaned row(s) still remain`);
  }

  await client.end();
  if (remaining !== 0) process.exit(1);
}

main().catch((e) => {
  console.error("[sweep-orphaned-profiles] FATAL:", e);
  process.exit(1);
});
