// backend/scripts/fix-approved-workers.ts
// One-time fix: sync OnboardingProgress and WorkerProfile for workers
// whose accountStatus is VERIFIED but whose onboardingStatus/isSearchable
// were never updated (because approveUser() used to not touch those fields).
//
// Run: cd backend && npx tsx scripts/fix-approved-workers.ts

import prisma from "../src/lib/prisma";

async function main() {
  const verifiedWorkers = await prisma.user.findMany({
    where:  { accountStatus: "VERIFIED", role: "WORKER" },
    select: { id: true, email: true },
  });

  console.log(`Found ${verifiedWorkers.length} VERIFIED worker(s) to fix`);
  if (verifiedWorkers.length === 0) return;

  const ids = verifiedWorkers.map(u => u.id);

  const [profileResult, onboardingResult, userResult] = await Promise.all([
    prisma.workerProfile.updateMany({
      where: { userId: { in: ids } },
      data:  { isSearchable: true },
    }),
    prisma.onboardingProgress.updateMany({
      where: { userId: { in: ids }, onboardingStatus: { not: "APPROVED" } },
      data:  { onboardingStatus: "APPROVED" },
    }),
    prisma.user.updateMany({
      where: { id: { in: ids } },
      data:  { onboardingComplete: true },
    }),
  ]);

  console.log(`  WorkerProfile.isSearchable = true  →  ${profileResult.count} row(s)`);
  console.log(`  OnboardingProgress.onboardingStatus = APPROVED  →  ${onboardingResult.count} row(s)`);
  console.log(`  User.onboardingComplete = true  →  ${userResult.count} row(s)`);

  for (const w of verifiedWorkers) {
    console.log(`  ✓ ${w.email}`);
  }

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
