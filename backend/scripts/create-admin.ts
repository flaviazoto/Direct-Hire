// backend/scripts/create-admin.ts
// Creates an admin account without anyone choosing, seeing or sending a
// password: the account gets a random password that is immediately thrown
// away, and the owner sets their own with "Forgot password" on the sign-in
// page (a reset link goes to the admin's inbox).
//
//   npx tsx --env-file=.env.production scripts/create-admin.ts you@example.com
//
// Refuses to turn an existing worker/employer account into an admin.

import "dotenv/config";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import prisma from "../src/lib/prisma";
import { userEmailWhere } from "../src/lib/email-normalize";
import { insertAuditLog } from "../src/lib/audit";

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Usage: npx tsx --env-file=.env.production scripts/create-admin.ts <email>");
    process.exit(1);
  }

  const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return "?"; } })();
  console.log(`Database host: ${host}`);

  const existing = await prisma.user.findFirst({ where: userEmailWhere(email), select: { id: true, role: true } });
  if (existing?.role === "ADMIN") {
    console.log(`${email} is already an admin. To set its password, use "Forgot password" on the sign-in page.`);
    return;
  }
  if (existing) {
    console.error(`${email} already exists as a ${existing.role} account. Not changing it into an admin.`);
    process.exit(1);
  }

  // Random, never printed, never stored anywhere but as a hash.
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("base64url"), 12);
  const admin = await prisma.user.create({
    data: { email, passwordHash, role: "ADMIN", status: "ACTIVE", accountStatus: "VERIFIED", isEmailVerified: true },
    select: { id: true },
  });
  await insertAuditLog({ actorId: admin.id, targetId: admin.id, action: "ADMIN_CREATED_BY_SCRIPT", entity: "User", entityId: admin.id });

  console.log(`Created admin ${email}.`);
  console.log(`Next: open the sign-in page, click "Forgot password", enter ${email}, and set your password from the email.`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => prisma.$disconnect());
