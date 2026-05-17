// backend/prisma/seed-skills.ts
// Run: npx tsx prisma/seed-skills.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SKILLS: { name: string; category: string }[] = [
  // Technology
  { name: "JavaScript",   category: "Technology" },
  { name: "TypeScript",   category: "Technology" },
  { name: "Python",       category: "Technology" },
  { name: "Java",         category: "Technology" },
  { name: "PHP",          category: "Technology" },
  { name: "SQL",          category: "Technology" },
  { name: "React",        category: "Technology" },
  { name: "Node.js",      category: "Technology" },
  { name: "AWS",          category: "Technology" },
  { name: "Docker",       category: "Technology" },
  { name: "Git",          category: "Technology" },
  { name: "REST APIs",    category: "Technology" },
  { name: "GraphQL",      category: "Technology" },

  // Construction
  { name: "Masonry",      category: "Construction" },
  { name: "Plumbing",     category: "Construction" },
  { name: "Electrical",   category: "Construction" },
  { name: "Carpentry",    category: "Construction" },
  { name: "Welding",      category: "Construction" },
  { name: "Scaffolding",  category: "Construction" },
  { name: "Concrete",     category: "Construction" },
  { name: "Tiling",       category: "Construction" },
  { name: "Painting",     category: "Construction" },
  { name: "HVAC",         category: "Construction" },

  // Healthcare
  { name: "Patient Care",     category: "Healthcare" },
  { name: "Nursing",          category: "Healthcare" },
  { name: "Phlebotomy",       category: "Healthcare" },
  { name: "First Aid",        category: "Healthcare" },
  { name: "Medical Records",  category: "Healthcare" },
  { name: "Pharmacy",         category: "Healthcare" },
  { name: "Physiotherapy",    category: "Healthcare" },

  // Hospitality
  { name: "Cooking",           category: "Hospitality" },
  { name: "Bartending",        category: "Hospitality" },
  { name: "Housekeeping",      category: "Hospitality" },
  { name: "Front Desk",        category: "Hospitality" },
  { name: "Food Safety",       category: "Hospitality" },
  { name: "Event Management",  category: "Hospitality" },
  { name: "Customer Service",  category: "Hospitality" },

  // Transport
  { name: "HGV Driving",          category: "Transport" },
  { name: "Forklift Operation",   category: "Transport" },
  { name: "Logistics",            category: "Transport" },
  { name: "Warehouse Management", category: "Transport" },
  { name: "Route Planning",       category: "Transport" },

  // Agriculture
  { name: "Crop Management", category: "Agriculture" },
  { name: "Irrigation",      category: "Agriculture" },
  { name: "Livestock",       category: "Agriculture" },
  { name: "Harvesting",      category: "Agriculture" },
  { name: "Greenhouse",      category: "Agriculture" },
  { name: "Pest Control",    category: "Agriculture" },

  // Domestic
  { name: "Childcare",         category: "Domestic" },
  { name: "Elderly Care",      category: "Domestic" },
  { name: "Cleaning",          category: "Domestic" },
  { name: "Ironing",           category: "Domestic" },
  { name: "Pet Care",          category: "Domestic" },
  { name: "Personal Shopping", category: "Domestic" },

  // Admin & Finance
  { name: "Accounting",        category: "Admin & Finance" },
  { name: "Payroll",           category: "Admin & Finance" },
  { name: "Data Entry",        category: "Admin & Finance" },
  { name: "Reception",         category: "Admin & Finance" },
  { name: "MS Office",         category: "Admin & Finance" },
  { name: "Bookkeeping",       category: "Admin & Finance" },
  { name: "HR Administration", category: "Admin & Finance" },
];

async function main() {
  console.log(`Seeding ${SKILLS.length} skills across ${new Set(SKILLS.map(s => s.category)).size} categories…`);

  const result = await prisma.skill.createMany({
    data: SKILLS,
    skipDuplicates: true,
  });

  console.log(`✓ Inserted ${result.count} new skills (duplicates skipped).`);

  // Confirmation count
  const total = await prisma.skill.count();
  console.log(`Total skills in database: ${total}`);

  // Print per-category breakdown
  const byCategory = await prisma.skill.groupBy({
    by: ["category"],
    _count: { id: true },
    orderBy: { category: "asc" },
  });
  console.log("\nBreakdown:");
  for (const row of byCategory) {
    console.log(`  ${row.category.padEnd(16)} ${row._count.id} skills`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
