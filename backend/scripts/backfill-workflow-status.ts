// One-time data backfill (NOT a recurring job): 28 applications created
// before the 20260731010000_add_admin_mediated_hiring_workflow migration
// have workflowStatus = null and are invisible to every admin-workflow
// query. Non-terminal applications (APPLIED/VIEWED/SHORTLISTED/INTERVIEWED)
// get backfilled to PENDING_ADMIN_REVIEW; terminal ones (ACCEPTED/REJECTED/
// WITHDRAWN) are left untouched — they already resolved through the old
// process, and pulling them into an active admin queue would be meaningless.
//
// Run once against the dev DB this project has used throughout. Not
// idempotent-by-design as a recurring job: re-running after the first
// successful run is a no-op (there will be nothing left with workflowStatus
// = null among applications that predate the migration), so it's safe to
// re-run if needed, but it's not meant to be scheduled or repeated.

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const TERMINAL_STATUSES = ["ACCEPTED", "REJECTED", "WITHDRAWN"] as const;
const NON_TERMINAL_STATUSES = ["APPLIED", "VIEWED", "SHORTLISTED", "INTERVIEWED"] as const;

async function main() {
  const nullRows = await prisma.application.findMany({
    where: { workflowStatus: null },
    select: {
      id: true, status: true, createdAt: true,
      worker: { select: { email: true } },
      job:    { select: { title: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const terminal    = nullRows.filter(r => (TERMINAL_STATUSES as readonly string[]).includes(r.status));
  const nonTerminal = nullRows.filter(r => (NON_TERMINAL_STATUSES as readonly string[]).includes(r.status));
  const unexpected  = nullRows.filter(r =>
    !(TERMINAL_STATUSES as readonly string[]).includes(r.status) &&
    !(NON_TERMINAL_STATUSES as readonly string[]).includes(r.status),
  );

  console.log(`Total workflowStatus=null rows found: ${nullRows.length}`);
  console.log(`  Terminal (left untouched):     ${terminal.length}`);
  console.log(`  Non-terminal (to backfill):    ${nonTerminal.length}`);
  if (unexpected.length > 0) {
    console.log(`  UNEXPECTED status values (not in either list — aborting): ${unexpected.length}`);
    for (const r of unexpected) console.log(`    ${r.id}  status=${r.status}`);
    throw new Error("Aborting: found Application rows with a status outside the known ApplicationStatus set.");
  }

  console.log("\n── TERMINAL (untouched) ──────────────────────────────────────────");
  for (const r of terminal) {
    console.log(`  ${r.id}  status=${r.status}  createdAt=${r.createdAt.toISOString()}  worker=${r.worker.email}  job="${r.job.title}"`);
  }

  console.log("\n── NON-TERMINAL (backfilling to PENDING_ADMIN_REVIEW) ────────────");
  for (const r of nonTerminal) {
    console.log(`  ${r.id}  status=${r.status}  createdAt=${r.createdAt.toISOString()}  worker=${r.worker.email}  job="${r.job.title}"`);
  }

  if (nonTerminal.length === 0) {
    console.log("\nNothing to backfill. Exiting without writing.");
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.application.updateMany({
    where: { id: { in: nonTerminal.map(r => r.id) } },
    data:  { workflowStatus: "PENDING_ADMIN_REVIEW" },
  });

  console.log(`\nBackfilled ${result.count} rows to workflowStatus = PENDING_ADMIN_REVIEW.`);

  // ── Post-write verification ──────────────────────────────────────────────
  const stillNullNonTerminal = await prisma.application.count({
    where: { workflowStatus: null, status: { in: [...NON_TERMINAL_STATUSES] } },
  });
  const terminalWithWorkflowStatus = await prisma.application.count({
    where: { workflowStatus: { not: null }, status: { in: [...TERMINAL_STATUSES] } },
  });
  const pendingAdminReviewCount = await prisma.application.count({
    where: { workflowStatus: "PENDING_ADMIN_REVIEW" },
  });

  console.log(`\nPost-write checks:`);
  console.log(`  Non-terminal rows still null (expect 0): ${stillNullNonTerminal}`);
  console.log(`  Terminal rows now non-null   (expect 0): ${terminalWithWorkflowStatus}`);
  console.log(`  Total rows now PENDING_ADMIN_REVIEW:      ${pendingAdminReviewCount}`);

  if (stillNullNonTerminal !== 0 || terminalWithWorkflowStatus !== 0) {
    throw new Error("Post-write verification FAILED — see counts above.");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\nBACKFILL FAILED:", e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
