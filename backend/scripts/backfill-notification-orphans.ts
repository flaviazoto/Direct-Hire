// One-time data fix (NOT a recurring job): Notification.userId was declared
// with onDelete: Cascade in schema.prisma but the live database never
// actually had a foreign-key constraint on that column (confirmed via
// information_schema — see the FK-drift investigation this fix accompanies,
// migration 20260806000000_add_notification_user_fk). Every past user
// deletion — real (deleteAccount()) or ad-hoc — left its Notification rows
// behind instead of cascading, so 12 rows currently point at userIds with
// no matching User. Adding the missing FK constraint will fail against
// these existing violations, so they're cleaned up here first, one time,
// before that migration runs.
//
// Mirrors backfill-workflow-status.ts's discipline: full before-list logged
// or verified before delete, no auto-run guardrails skipped, and safe to
// re-run (a second run finds nothing left to delete).

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const orphans: Array<{ id: string; userId: string; type: string; title: string; createdAt: Date }> =
    await prisma.$queryRawUnsafe(`
      SELECT n.id, n."userId", n.type, n.title, n."createdAt"
      FROM "Notification" n
      LEFT JOIN "User" u ON u.id = n."userId"
      WHERE u.id IS NULL
      ORDER BY n."createdAt" ASC;
    `);

  console.log(`Orphaned Notification rows found (userId with no matching User): ${orphans.length}`);
  if (orphans.length === 0) {
    console.log("Nothing to clean up. Exiting without writing.");
    await prisma.$disconnect();
    return;
  }

  console.log("\n── ORPHANED ROWS (to be deleted) ──────────────────────────────────");
  for (const r of orphans) {
    console.log(`  ${r.id}  userId=${r.userId} (deleted user)  type=${r.type}  title="${r.title}"  createdAt=${r.createdAt.toISOString()}`);
  }

  const ids = orphans.map(r => r.id);
  const result = await prisma.notification.deleteMany({ where: { id: { in: ids } } });
  console.log(`\nDeleted ${result.count} orphaned Notification rows.`);

  const remaining: Array<{ count: bigint }> = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as count
    FROM "Notification" n
    LEFT JOIN "User" u ON u.id = n."userId"
    WHERE u.id IS NULL;
  `);
  console.log(`Remaining orphaned rows after cleanup: ${remaining[0].count}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
