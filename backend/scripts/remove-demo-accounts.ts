// backend/scripts/remove-demo-accounts.ts
// Removes the demo accounts (every user @demo.directhire.cc, created by
// seed-demo.ts) and everything that depends on them, in ONE transaction:
// any failure rolls the whole thing back. Their storage folders are queued
// in storage_deletions for the hourly storage-cleanup job.
//
// Dry run (default) only reports what would go:
//   npx tsx --env-file=.env.production scripts/remove-demo-accounts.ts
// Remove:
//   npx tsx --env-file=.env.production scripts/remove-demo-accounts.ts --confirm
//
// Take a backup first. Real users' own accounts and payments are untouched;
// their applications to demo jobs go with those jobs (the dry run counts them).

import "dotenv/config";
import prisma from "../src/lib/prisma";

const DOMAIN = "@demo.directhire.cc";
const CONFIRM = process.argv.includes("--confirm");

async function counts(ids: string[]) {
  const one = async (sql: string) => Number(((await prisma.$queryRawUnsafe<{ n: bigint }[]>(sql, ids))[0]?.n) ?? 0);
  const apps = `SELECT id FROM applications WHERE worker_id = ANY($1) OR employer_id = ANY($1)
                OR job_id IN (SELECT id FROM job_posts WHERE employer_id = ANY($1))`;
  return {
    jobs:                    await one(`SELECT count(*) n FROM job_posts WHERE employer_id = ANY($1)`),
    applications:            await one(`SELECT count(*) n FROM (${apps}) a`),
    realWorkersApplications: await one(`SELECT count(*) n FROM applications WHERE id IN (${apps}) AND NOT (worker_id = ANY($1))`),
    adminFeeCharges:         await one(`SELECT count(*) n FROM admin_fee_charges WHERE worker_id = ANY($1) OR application_id IN (${apps})`),
    payments:                await one(`SELECT count(*) n FROM "Payment" WHERE "userId" = ANY($1)`),
    uploads:                 await one(`SELECT count(*) n FROM "Upload" WHERE "userId" = ANY($1)`),
    messages:                await one(`SELECT count(*) n FROM "Message" WHERE "senderId" = ANY($1) OR "recipientId" = ANY($1)`),
    auditEntries:            await one(`SELECT count(*) n FROM audit_log WHERE target_user_id = ANY($1) OR admin_id = ANY($1)`),
  };
}

async function main() {
  const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return "?"; } })();
  console.log(`Database host: ${host}`);

  const users = await prisma.user.findMany({
    where: { email: { endsWith: DOMAIN } },
    select: { id: true, email: true, role: true },
    orderBy: { email: "asc" },
  });
  if (users.length === 0) { console.log(`No ${DOMAIN} accounts — nothing to do.`); return; }
  // Belt and braces: never touch anything that isn't a demo address.
  if (users.some(u => !u.email.toLowerCase().endsWith(DOMAIN))) throw new Error("Unexpected non-demo address in selection");
  if (users.some(u => u.role === "ADMIN")) throw new Error("A demo address has the ADMIN role — refusing");

  const ids = users.map(u => u.id);
  console.log(`Demo accounts (${users.length}):`);
  for (const u of users) console.log(`  ${u.role.padEnd(8)} ${u.email}`);
  console.log("Would also remove:", await counts(ids));

  if (!CONFIRM) { console.log("\nDry run only. Re-run with --confirm to remove them."); return; }

  await prisma.$transaction(async (tx) => {
    const run = (sql: string) => tx.$executeRawUnsafe(sql, ids);
    const apps = `SELECT id FROM applications WHERE worker_id = ANY($1) OR employer_id = ANY($1)
                  OR job_id IN (SELECT id FROM job_posts WHERE employer_id = ANY($1))`;
    await run(`INSERT INTO storage_deletions (id, prefix) SELECT 'demo_' || u, u FROM unnest($1::text[]) u ON CONFLICT DO NOTHING`);
    await run(`DELETE FROM "Message" WHERE "senderId" = ANY($1) OR "recipientId" = ANY($1)`);
    await run(`DELETE FROM admin_fee_charges WHERE worker_id = ANY($1) OR application_id IN (${apps})`);
    await run(`DELETE FROM application_interviews WHERE requested_by_id = ANY($1) OR application_id IN (${apps})`);
    await run(`DELETE FROM bulk_quote_requests WHERE employer_id = ANY($1)`);
    await run(`DELETE FROM applications WHERE id IN (${apps})`);
    await run(`DELETE FROM audit_log WHERE target_user_id = ANY($1) OR admin_id = ANY($1)`);
    const deleted = await run(`DELETE FROM "User" WHERE id = ANY($1)`); // cascades to profiles, jobs, uploads, payments…
    if (deleted !== ids.length) throw new Error(`Expected to delete ${ids.length} users, deleted ${deleted} — rolled back`);
  }, { timeout: 120_000 });

  const left = await prisma.user.count({ where: { email: { endsWith: DOMAIN } } });
  console.log(left === 0 ? `Removed ${users.length} demo accounts. Their files are queued for deletion.` : `WARNING: ${left} remain`);
}

main()
  .catch((e) => { console.error("Nothing was changed:", e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => prisma.$disconnect());
