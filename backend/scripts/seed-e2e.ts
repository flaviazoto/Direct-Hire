// backend/scripts/seed-e2e.ts
// Test accounts for browser testing on a LOCAL database only (guarded).
// Idempotent: safe to run repeatedly.
//
// Run: npm run seed:e2e
//
// All accounts use the password E2E_PASSWORD below and *.invalid addresses —
// they exist only in local dev/test databases.

import "dotenv/config";
import bcrypt from "bcryptjs";
import { assertSafeDatabaseTarget } from "../src/lib/db-guard";

export const E2E_PASSWORD = "E2eTest123!";
export const E2E_ACCOUNTS = {
  admin:         "e2e.admin@dev.invalid",
  employer:      "e2e.employer@dev.invalid",
  worker:        "e2e.worker@dev.invalid",
  pendingWorker: "e2e.pending.worker@dev.invalid",
} as const;

async function main() {
  assertSafeDatabaseTarget("seed:e2e");
  const prisma = (await import("../src/lib/prisma")).default;
  const passwordHash = await bcrypt.hash(E2E_PASSWORD, 10);
  const now = new Date();

  async function upsertUser(email: string, role: "ADMIN" | "EMPLOYER" | "WORKER", accountStatus: "VERIFIED" | "PENDING_REVIEW") {
    return prisma.user.upsert({
      where:  { email },
      update: { passwordHash, role, status: "ACTIVE", accountStatus, isEmailVerified: true },
      create: { email, passwordHash, role, status: "ACTIVE", accountStatus, isEmailVerified: true,
                consentAcceptedAt: now, consentPolicyVersion: "2025-01" },
    });
  }
  async function onboarded(userId: string, role: "EMPLOYER" | "WORKER", status: "APPROVED" | "SUBMITTED") {
    const steps = role === "WORKER" ? 7 : 6;
    await prisma.onboardingProgress.upsert({
      where:  { userId },
      update: { isSubmitted: true, onboardingStatus: status, currentStep: steps },
      create: { userId, role, currentStep: steps, completedSteps: Array.from({ length: steps }, (_, i) => i + 1),
                totalSteps: steps, isSubmitted: true, onboardingStatus: status, submittedAt: now },
    });
  }

  await upsertUser(E2E_ACCOUNTS.admin, "ADMIN", "VERIFIED");

  const employer = await upsertUser(E2E_ACCOUNTS.employer, "EMPLOYER", "VERIFIED");
  await prisma.employerProfile.upsert({
    where:  { userId: employer.id },
    update: { companyName: "E2E Test Company", subscriptionStatus: null },
    create: { userId: employer.id, companyName: "E2E Test Company", contactPersonName: "Erin Employer",
              country: "Germany", city: "Berlin", industry: "Construction" },
  });
  await onboarded(employer.id, "EMPLOYER", "APPROVED");

  const worker = await upsertUser(E2E_ACCOUNTS.worker, "WORKER", "VERIFIED");
  await prisma.workerProfile.upsert({
    where:  { userId: worker.id },
    update: { isSearchable: true, documentsVerified: true },
    create: { userId: worker.id, firstName: "Wren", lastName: "Worker", profession: "Electrician",
              countryOfResidence: "Albania", city: "Tirana", yearsExperience: "5", isSearchable: true, documentsVerified: true },
  });
  await onboarded(worker.id, "WORKER", "APPROVED");

  const pending = await upsertUser(E2E_ACCOUNTS.pendingWorker, "WORKER", "PENDING_REVIEW");
  await prisma.workerProfile.upsert({
    where:  { userId: pending.id },
    update: {},
    create: { userId: pending.id, firstName: "Pat", lastName: "Pending", profession: "Welder",
              countryOfResidence: "Kosovo", city: "Pristina", yearsExperience: "3" },
  });
  await onboarded(pending.id, "WORKER", "SUBMITTED");

  const existingJob = await prisma.jobPost.findFirst({ where: { employerId: employer.id, title: "E2E Electrician" } });
  if (!existingJob) {
    await prisma.jobPost.create({ data: {
      employerId: employer.id, title: "E2E Electrician", companyName: "E2E Test Company",
      description: "Install and maintain electrical systems on residential construction sites. ".repeat(3),
      requirements: "Three years' experience, basic German or English.".repeat(2),
      country: "Germany", city: "Berlin", salaryMin: 30000, salaryMax: 42000, contractType: "FULL_TIME",
      experienceRequired: 3, category: "Construction", requiredSkills: ["wiring", "safety"], status: "APPROVED",
    } });
  }

  console.log("E2E accounts ready (password: see E2E_PASSWORD in scripts/seed-e2e.ts):");
  for (const [k, v] of Object.entries(E2E_ACCOUNTS)) console.log(`  ${k.padEnd(14)} ${v}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
