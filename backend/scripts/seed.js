"use strict";
// scripts/seed.ts
// Seeds the database with an admin user, sample workers, and sample employers.
// Run: npm run db:seed
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log("🌱 Seeding Direct Hire database…");
    // ── Admin user ─────────────────────────────────────────────
    const adminEmail = process.env.ADMIN_SEED_EMAIL ?? "admin@directhire.io";
    const adminPass = process.env.ADMIN_SEED_PASSWORD ?? "Admin123!";
    const admin = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {},
        create: {
            email: adminEmail,
            passwordHash: await bcryptjs_1.default.hash(adminPass, 12),
            role: "ADMIN",
            status: "ACTIVE",
            isEmailVerified: true,
        },
    });
    console.log("✓ Admin created:", adminEmail);
    // ── Sample workers ──────────────────────────────────────────
    const workers = [
        {
            email: "ana.koci@worker.demo",
            firstName: "Ana", lastName: "Koci",
            country: "Albania", city: "Tirana",
            skills: ["Nursing", "Care Assistant", "Elderly Care", "First Aid"],
            languages: [{ language: "English", proficiencyLevel: "B2 – Upper Intermediate" }, { language: "Italian", proficiencyLevel: "A2 – Elementary" }],
            salary: "€1,500–€1,999/mo",
            targetCountries: ["United Kingdom 🇬🇧", "Germany 🇩🇪"],
            experience: "3–5 years",
            status: "APPROVED",
        },
        {
            email: "james.okafor@worker.demo",
            firstName: "James", lastName: "Okafor",
            country: "Nigeria", city: "Lagos",
            skills: ["Civil Engineering", "Construction", "Electrical"],
            languages: [{ language: "English", proficiencyLevel: "C1 – Advanced" }],
            salary: "€2,000–€2,999/mo",
            targetCountries: ["Germany 🇩🇪", "Netherlands 🇳🇱"],
            experience: "5–8 years",
            status: "APPROVED",
        },
        {
            email: "linh.tran@worker.demo",
            firstName: "Linh", lastName: "Tran",
            country: "Vietnam", city: "Ho Chi Minh City",
            skills: ["Software Dev", "IT Support"],
            languages: [{ language: "English", proficiencyLevel: "B1 – Intermediate" }],
            salary: "€2,000–€2,999/mo",
            targetCountries: ["Germany 🇩🇪", "France 🇫🇷"],
            experience: "3–5 years",
            status: "SUBMITTED",
        },
    ];
    for (const w of workers) {
        const user = await prisma.user.upsert({
            where: { email: w.email },
            update: {},
            create: {
                email: w.email,
                passwordHash: await bcryptjs_1.default.hash("Worker123!", 12),
                role: "WORKER",
                status: w.status === "APPROVED" ? "ACTIVE" : "PENDING_VERIFICATION",
                isEmailVerified: true,
            },
        });
        const profile = await prisma.workerProfile.upsert({
            where: { userId: user.id },
            update: {},
            create: {
                userId: user.id,
                firstName: w.firstName,
                lastName: w.lastName,
                countryOfResidence: w.country,
                city: w.city,
                yearsExperience: w.experience,
                expectedSalary: w.salary,
                isSearchable: w.status === "APPROVED",
                trustScore: Math.floor(Math.random() * 30) + 70,
                riskScore: Math.floor(Math.random() * 25),
            },
        });
        // Skills
        for (const skill of w.skills) {
            await prisma.workerSkill.upsert({
                where: { workerProfileId_skill: { workerProfileId: profile.id, skill } },
                update: {},
                create: { workerProfileId: profile.id, skill },
            });
        }
        // Languages
        for (const lang of w.languages) {
            await prisma.workerLanguage.upsert({
                where: { workerProfileId_language: { workerProfileId: profile.id, language: lang.language } },
                update: {},
                create: { workerProfileId: profile.id, ...lang },
            });
        }
        // Target countries
        for (const country of w.targetCountries) {
            await prisma.workerTargetCountry.upsert({
                where: { workerProfileId_country: { workerProfileId: profile.id, country } },
                update: {},
                create: { workerProfileId: profile.id, country },
            });
        }
        // Onboarding progress
        const totalSteps = 7;
        const completedSteps = w.status === "APPROVED" ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4];
        await prisma.onboardingProgress.upsert({
            where: { userId: user.id },
            update: {},
            create: {
                userId: user.id,
                role: "WORKER",
                currentStep: completedSteps.length,
                completedSteps,
                draftData: { firstName: w.firstName, lastName: w.lastName },
                isSubmitted: w.status !== "DRAFT",
                submittedAt: w.status !== "DRAFT" ? new Date() : null,
                totalSteps,
                onboardingStatus: w.status === "APPROVED" ? "APPROVED" : "SUBMITTED",
                lastSavedAt: new Date(),
            },
        });
        // Verification record
        await prisma.verificationRecord.upsert({
            where: { userId: user.id },
            update: {},
            create: {
                userId: user.id,
                reviewStatus: w.status === "APPROVED" ? "APPROVED" : "PENDING",
                reviewedById: w.status === "APPROVED" ? admin.id : null,
                reviewedAt: w.status === "APPROVED" ? new Date() : null,
            },
        });
        console.log(`✓ Worker: ${w.firstName} ${w.lastName} (${w.email})`);
    }
    // ── Sample employer ─────────────────────────────────────────
    const empUser = await prisma.user.upsert({
        where: { email: "hr@caremount.demo" },
        update: {},
        create: {
            email: "hr@caremount.demo",
            passwordHash: await bcryptjs_1.default.hash("Employer123!", 12),
            role: "EMPLOYER",
            status: "ACTIVE",
            isEmailVerified: true,
        },
    });
    const empProfile = await prisma.employerProfile.upsert({
        where: { userId: empUser.id },
        update: {},
        create: {
            userId: empUser.id,
            companyName: "Caremount UK Ltd",
            nipt: "GB123456789",
            industry: "Healthcare & Social Care",
            companySize: "51–200 employees",
            address: "42 Harley Street, London W1G 8PR",
            businessDescription: "Leading care provider operating across the United Kingdom specialising in elderly care, nursing homes, and domiciliary care services.",
            website: "https://caremount.example.com",
            subscriptionPlan: "growth",
            subscriptionStatus: "ACTIVE",
            isVerified: true,
        },
    });
    await prisma.employerHiringCountry.upsert({
        where: { employerProfileId_country: { employerProfileId: empProfile.id, country: "Albania" } },
        update: {},
        create: { employerProfileId: empProfile.id, country: "Albania" },
    });
    await prisma.onboardingProgress.upsert({
        where: { userId: empUser.id },
        update: {},
        create: {
            userId: empUser.id,
            role: "EMPLOYER",
            currentStep: 6,
            completedSteps: [1, 2, 3, 4, 5],
            draftData: { companyName: "Caremount UK Ltd" },
            isSubmitted: true,
            submittedAt: new Date(),
            totalSteps: 6,
            onboardingStatus: "APPROVED",
            lastSavedAt: new Date(),
        },
    });
    await prisma.verificationRecord.upsert({
        where: { userId: empUser.id },
        update: {},
        create: {
            userId: empUser.id,
            reviewStatus: "APPROVED",
            reviewedById: admin.id,
            reviewedAt: new Date(),
        },
    });
    console.log("✓ Employer: Caremount UK Ltd");
    console.log("\n✅ Seed complete!\n");
    console.log("Demo credentials:");
    console.log("  Admin:    admin@directhire.io  /  (see ADMIN_SEED_PASSWORD)");
    console.log("  Worker:   ana.koci@worker.demo   /  Worker123!");
    console.log("  Employer: hr@caremount.demo      /  Employer123!");
}
main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => prisma.$disconnect());
//# sourceMappingURL=seed.js.map