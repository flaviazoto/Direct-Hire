import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    where: { role: "ADMIN" },
    data: {
      status:          "ACTIVE",
      accountStatus:   "VERIFIED",
      isEmailVerified: true,
    },
  });
  console.log("Updated admin accounts:", result.count);

  const admins = await prisma.user.findMany({
    where:  { role: "ADMIN" },
    select: { id: true, email: true, role: true, status: true, accountStatus: true, isEmailVerified: true },
  });
  console.log("Admin accounts now:", JSON.stringify(admins, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);
