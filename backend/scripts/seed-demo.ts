// backend/scripts/seed-demo.ts
//
// Demo seed script — populates the platform with realistic, CLEARLY-FICTIONAL
// data for buyer demonstrations. Every worker and company named below is
// invented for this script; any resemblance to real persons or businesses is
// coincidental.
//
// HONESTY MARKING: every seeded User's email is on the @demo.directhire.cc
// subdomain (demo-worker-1@demo.directhire.cc … demo-worker-18@…,
// demo-employer-1@… … demo-employer-4@…, demo-admin@demo.directhire.cc).
// There is no schema column marking rows as demo data on purpose — adding one
// would mean a migration for a marker only this script needs. The email
// pattern IS the marker: it is unmistakable in any admin list, is trivially
// filterable (`WHERE email LIKE '%@demo.directhire.cc'`), and is exactly what
// --clean keys off. Do not seed demo rows under any other email domain.
//
// SHAPE: this script writes through Prisma using the same field conventions,
// statuses, and encrypted columns (phone/passportNumber via lib/encrypt.ts)
// as the real onboarding/application/lock write paths — see
// onboarding.controller.ts, worker-applications.controller.ts,
// employer-applications.controller.ts, worker-lock.controller.ts,
// admin.controller.ts::approveUser. It intentionally does NOT go through
// those controllers/routes: it writes the same rows those functions would
// write, but skips every email send (sendXEmail / enqueue calls) so seeding
// never triggers a real email — see the "NO EMAILS" note below the flag
// definitions.
//
// SAFETY RAILS:
//  - dry run by default — no writes without --execute
//  - --execute refuses to run if @demo.directhire.cc rows already exist
//    (prints the count and tells you to run --clean first)
//  - --clean deletes ONLY rows reachable from a @demo.directhire.cc User,
//    verified by a re-count afterward; never touches any other row
//  - requires DEMO_SEED_PASSWORD in the environment for --execute; refuses
//    to run without it, never hardcodes a password
//  - per-row try/catch during writes; a single failure doesn't abort the run
//
// Run:
//   npm run seed:demo                  (dry run — prints the full creation plan)
//   npm run seed:demo -- --execute     (writes the rows)
//   npm run seed:demo -- --clean       (deletes every @demo.directhire.cc row)

import "dotenv/config";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import prisma from "../src/lib/prisma";
import { encrypt } from "../src/lib/encrypt";
import { calculateMatchScore, type ScoringWorker, type ScoringJob } from "../src/services/matching";

const EXECUTE = process.argv.includes("--execute");
const CLEAN   = process.argv.includes("--clean");
const DEMO_EMAIL_DOMAIN = "@demo.directhire.cc";
const CONSENT_POLICY_VERSION = "2025-01"; // mirrors CURRENT_CONSENT_POLICY_VERSION in auth.controller.ts

// ── NO EMAILS ──────────────────────────────────────────────────────────────
// Every real write path this script mirrors (onboarding submit, application
// create, status-change, admin approve, worker-lock confirm) fires a
// sendXEmail(...) or enqueue("email....", ...) call alongside its DB writes.
// This script calls neither — it only ever calls prisma.<model>.create /
// update / upsert directly, the same way sweep-orphaned-profiles.ts and
// backfill-worker-phones.ts write without going through the HTTP layer. No
// Prisma middleware or DB trigger in this codebase sends email on insert
// (checked: lib/prisma.ts has no $use()/$extends() side effects), so this is
// structurally guaranteed, not just "we didn't call it this time."

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function fail(msg: string): never {
  console.error(`[seed-demo] FATAL: ${msg}`);
  process.exit(1);
}

// ── Fictional name pools (STEP 2: plausible Albanian names, generated here — no real people) ──

const MALE_FIRST_NAMES   = ["Arben", "Bledar", "Dritan", "Elton", "Fatmir", "Gentian", "Ilir", "Klodian", "Sokol", "Taulant"];
const FEMALE_FIRST_NAMES = ["Blerina", "Elira", "Fatjona", "Griselda", "Jonida", "Lorena", "Mira", "Pranvera", "Rudina", "Teuta"];
const LAST_NAMES = ["Hoxha", "Krasniqi", "Berisha", "Gashi", "Shehu", "Meta", "Kelmendi", "Prifti", "Dervishi", "Rama", "Cela", "Kola", "Leka", "Doda", "Ismaili", "Bytyqi", "Toska", "Vata"];

function workerName(i: number): { firstName: string; lastName: string } {
  const isFemale = i % 2 === 1;
  const pool = isFemale ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES;
  return { firstName: pool[i % pool.length], lastName: LAST_NAMES[i % LAST_NAMES.length] };
}

// ── Fictional European companies (STEP 3) ───────────────────────────────────

interface EmployerSpec {
  companyName: string;
  contactPersonName: string;
  industry: string;
  country: string;
  city: string;
  companySize: string;
  active: boolean; // ACTIVE Stripe subscription (only employer #1, per spec)
}

const EMPLOYERS: EmployerSpec[] = [
  { companyName: "Bergmann Bau GmbH",        contactPersonName: "Heike Bergmann",  industry: "Construction",    country: "Germany", city: "Berlin",  companySize: "51-200",   active: true  },
  { companyName: "Isola Grande Hotels S.r.l.", contactPersonName: "Marco Ferrara",  industry: "Hospitality",     country: "Italy",   city: "Rome",    companySize: "201-1000", active: false },
  { companyName: "NordFracht Logistik GmbH",  contactPersonName: "Sabine Wolter",   industry: "Transportation",  country: "Germany", city: "Hamburg", companySize: "51-200",   active: false },
  { companyName: "Agro Dalmacija d.o.o.",     contactPersonName: "Ivan Horvat",     industry: "Agriculture",     country: "Croatia", city: "Split",   companySize: "11-50",    active: false },
];

// ── Worker archetypes (STEP 3: 18 workers, varied skills/experience/languages) ──

const EXPERIENCE_BUCKETS = ["Less than 1 year", "1–2 years", "3–5 years", "5–8 years", "8–12 years", "12+ years"];
const SALARY_RANGES = ["€500–€999/mo", "€1,000–€1,499/mo", "€1,500–€1,999/mo", "€2,000–€2,999/mo", "€3,000–€3,999/mo", "€4,000+/mo"];

// Target-country pool weighted Germany/Italy/Croatia as instructed. Germany
// and Italy use the exact "Country FLAG" strings the real onboarding UI's
// TARGET_COUNTRIES list produces (worker/onboarding/page.tsx) so this stays
// indistinguishable from an organic submission. Croatia is NOT currently in
// that hardcoded list (checked) — included anyway per this task's explicit
// instruction, using the same "Country FLAG" format for consistency; flagged
// here rather than silently dropped.
const TARGET_COUNTRY_POOL = [
  "Germany 🇩🇪", "Germany 🇩🇪", "Germany 🇩🇪",
  "Italy 🇮🇹", "Italy 🇮🇹",
  "Croatia 🇭🇷", "Croatia 🇭🇷",
  "United Kingdom 🇬🇧",
];

interface WorkerCategory {
  name: string;
  skills: string[];       // drawn from the real onboarding SKILLS list
  expectedSalary: string;
}

// Skill strings copied verbatim from the real SKILLS constant in
// worker/onboarding/page.tsx. "Logistics" is not a literal entry there — the
// closest real-list skill for that category is "Driving", folded in below
// alongside the dedicated "driving" category per the task's own grouping.
const CATEGORIES: WorkerCategory[] = [
  { name: "construction", skills: ["Construction", "Civil Engineering", "Electrical", "Welding"], expectedSalary: SALARY_RANGES[3] },
  { name: "hospitality",  skills: ["Hospitality", "Hotel Management", "Cooking"],                 expectedSalary: SALARY_RANGES[2] },
  { name: "logistics",    skills: ["Driving", "Security"],                                        expectedSalary: SALARY_RANGES[3] },
  { name: "care",         skills: ["Nursing", "Care Assistant", "Elderly Care", "First Aid", "Childcare"], expectedSalary: SALARY_RANGES[2] },
  { name: "agriculture",  skills: ["Agriculture"],                                                 expectedSalary: SALARY_RANGES[1] },
];

// 18 workers: 3 construction, 3 hospitality, 4 logistics, 4 care, 4 agriculture
const WORKER_CATEGORY_PLAN: string[] = [
  ...Array(3).fill("construction"),
  ...Array(3).fill("hospitality"),
  ...Array(4).fill("logistics"),
  ...Array(4).fill("care"),
  ...Array(4).fill("agriculture"),
];

interface WorkerSpec {
  index: number;
  email: string;
  firstName: string;
  lastName: string;
  category: WorkerCategory;
  skills: string[];
  languages: { language: string; proficiencyLevel: string }[];
  targetCountries: string[];
  yearsExperience: string;
  expectedSalary: string;
  trustScore: number;
  additionalNotes?: string;
  availabilityDate?: Date;
  numberOfChildren: number;
  submittedDaysAgo: number;
}

function buildWorkerSpecs(): WorkerSpec[] {
  return WORKER_CATEGORY_PLAN.map((catName, i) => {
    const cat = CATEGORIES.find(c => c.name === catName)!;
    const { firstName, lastName } = workerName(i);

    // Skill count varies 2–4 (not every worker lists every skill in the category)
    const skillCount = 2 + (i % 3);
    const skills = cat.skills.slice(0, Math.min(skillCount, cat.skills.length));
    if (skills.length === 0) skills.push(cat.skills[0]);

    // Languages: Albanian native + 1–2 of German/Italian/English at varied levels
    const langPool = [
      { language: "German",  proficiencyLevel: "A2 – Elementary" },
      { language: "German",  proficiencyLevel: "B1 – Intermediate" },
      { language: "Italian", proficiencyLevel: "A2 – Elementary" },
      { language: "Italian", proficiencyLevel: "B2 – Upper Intermediate" },
      { language: "English", proficiencyLevel: "B1 – Intermediate" },
      { language: "English", proficiencyLevel: "C1 – Advanced" },
    ];
    const languages = [
      { language: "Albanian", proficiencyLevel: "Native" },
      langPool[i % langPool.length],
      ...(i % 3 === 0 ? [langPool[(i + 3) % langPool.length]] : []),
    ];

    // Target countries: 1–2 drawn from the weighted pool
    const targetCountries = Array.from(new Set([
      TARGET_COUNTRY_POOL[i % TARGET_COUNTRY_POOL.length],
      ...(i % 2 === 0 ? [TARGET_COUNTRY_POOL[(i + 4) % TARGET_COUNTRY_POOL.length]] : []),
    ]));

    // Experience spread 1–15 yrs across the 6 real buckets
    const yearsExperience = EXPERIENCE_BUCKETS[(i + 1) % EXPERIENCE_BUCKETS.length];

    // Trust score spread 55–95
    const trustScore = 55 + Math.round((i / (WORKER_CATEGORY_PLAN.length - 1)) * 40);

    // Profile completeness NOT uniform — every 3rd worker skips notes, every
    // 4th skips availability date, matching how real profiles look partial.
    const additionalNotes = i % 3 === 0 ? undefined : "Available to relocate; own tools/equipment where applicable.";
    const availabilityDate = i % 4 === 0 ? undefined : daysAgo(-14 - (i % 20)); // a future date

    return {
      index: i,
      email: `demo-worker-${i + 1}${DEMO_EMAIL_DOMAIN}`,
      firstName, lastName,
      category: cat,
      skills,
      languages,
      targetCountries,
      yearsExperience,
      expectedSalary: cat.expectedSalary,
      trustScore,
      additionalNotes,
      availabilityDate,
      numberOfChildren: i % 5 === 0 ? 1 : 0,
      // Spread submissions over the past 45 days, oldest first
      submittedDaysAgo: 45 - Math.round((i / (WORKER_CATEGORY_PLAN.length - 1)) * 40),
    };
  });
}

// ── Job posts (STEP 3: 10 jobs spread across the 4 employers) ──────────────

interface JobSpec {
  employerIndex: number;
  title: string;
  category: string;
  requiredSkills: string[];
  languagesRequired: string[];
  country: string;
  city: string;
  salaryMin: number;
  salaryMax: number;
  experienceRequired: number;
  contractType: string;
  visaSupport: boolean;
  accommodation: boolean;
  postedDaysAgo: number;
}

const JOBS: JobSpec[] = [
  { employerIndex: 0, title: "Construction Site Worker",       category: "Construction",   requiredSkills: ["Construction", "Civil Engineering"], languagesRequired: ["German"],  country: "Germany", city: "Berlin",  salaryMin: 2200, salaryMax: 2800, experienceRequired: 2, contractType: "FULL_TIME", visaSupport: true,  accommodation: true,  postedDaysAgo: 40 },
  { employerIndex: 0, title: "Electrician",                    category: "Construction",   requiredSkills: ["Electrical"],                        languagesRequired: ["German"],  country: "Germany", city: "Berlin",  salaryMin: 2400, salaryMax: 3000, experienceRequired: 3, contractType: "FULL_TIME", visaSupport: true,  accommodation: false, postedDaysAgo: 33 },
  { employerIndex: 0, title: "Welder",                         category: "Construction",   requiredSkills: ["Welding"],                           languagesRequired: ["German"],  country: "Germany", city: "Berlin",  salaryMin: 2300, salaryMax: 2900, experienceRequired: 3, contractType: "CONTRACT",  visaSupport: true,  accommodation: true,  postedDaysAgo: 27 },
  { employerIndex: 1, title: "Hotel Housekeeper",               category: "Hospitality",    requiredSkills: ["Hospitality"],                       languagesRequired: ["Italian"], country: "Italy",   city: "Rome",    salaryMin: 1400, salaryMax: 1800, experienceRequired: 1, contractType: "FULL_TIME", visaSupport: false, accommodation: true,  postedDaysAgo: 38 },
  { employerIndex: 1, title: "Front Desk Agent",                category: "Hospitality",    requiredSkills: ["Hospitality", "Hotel Management"],   languagesRequired: ["Italian", "English"], country: "Italy", city: "Rome", salaryMin: 1500, salaryMax: 1900, experienceRequired: 2, contractType: "FULL_TIME", visaSupport: false, accommodation: false, postedDaysAgo: 22 },
  { employerIndex: 1, title: "Hotel Cook",                      category: "Hospitality",    requiredSkills: ["Cooking"],                           languagesRequired: ["Italian"], country: "Italy",   city: "Rome",    salaryMin: 1600, salaryMax: 2000, experienceRequired: 2, contractType: "FULL_TIME", visaSupport: false, accommodation: true,  postedDaysAgo: 15 },
  { employerIndex: 2, title: "Truck Driver (EU License)",       category: "Transportation", requiredSkills: ["Driving"],                           languagesRequired: ["German"],  country: "Germany", city: "Hamburg", salaryMin: 2500, salaryMax: 3100, experienceRequired: 2, contractType: "FULL_TIME", visaSupport: true,  accommodation: false, postedDaysAgo: 30 },
  { employerIndex: 2, title: "Warehouse Logistics Operative",   category: "Transportation", requiredSkills: ["Driving", "Security"],               languagesRequired: ["German"],  country: "Germany", city: "Hamburg", salaryMin: 2100, salaryMax: 2600, experienceRequired: 1, contractType: "FULL_TIME", visaSupport: true,  accommodation: false, postedDaysAgo: 18 },
  { employerIndex: 3, title: "Agricultural Field Worker",       category: "Agriculture",    requiredSkills: ["Agriculture"],                       languagesRequired: [],          country: "Croatia", city: "Split",   salaryMin: 1100, salaryMax: 1400, experienceRequired: 0, contractType: "TEMPORARY", visaSupport: true,  accommodation: true,  postedDaysAgo: 25 },
  { employerIndex: 3, title: "Farm Equipment Operator",         category: "Agriculture",    requiredSkills: ["Agriculture"],                       languagesRequired: [],          country: "Croatia", city: "Split",   salaryMin: 1300, salaryMax: 1700, experienceRequired: 2, contractType: "FULL_TIME", visaSupport: true,  accommodation: true,  postedDaysAgo: 10 },
];

// ── Applications (STEP 3: 25 across all statuses) ───────────────────────────
// [workerIndex, jobIndex, status, createdDaysAgo] — hand-picked so each
// worker only ever applies to a job matching (or plausibly near) their skill
// category, same as a real applicant would.

type AppStatus = "APPLIED" | "VIEWED" | "SHORTLISTED" | "INTERVIEWED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";

interface ApplicationSpec {
  workerIndex: number;
  jobIndex: number;
  status: AppStatus;
  createdDaysAgo: number;
  interviewResponse?: "ACCEPTED" | "DECLINED"; // only for INTERVIEWED rows
  interviewResponseMessage?: string;
}

const APPLICATIONS: ApplicationSpec[] = [
  // construction workers (0,1,2) -> jobs 0,1,2
  { workerIndex: 0, jobIndex: 0, status: "ACCEPTED",    createdDaysAgo: 35 },
  { workerIndex: 1, jobIndex: 1, status: "INTERVIEWED", createdDaysAgo: 28, interviewResponse: "ACCEPTED", interviewResponseMessage: "Thank you — Tuesday 10am works well for me." },
  { workerIndex: 2, jobIndex: 2, status: "REJECTED",    createdDaysAgo: 24 },
  { workerIndex: 0, jobIndex: 1, status: "WITHDRAWN",   createdDaysAgo: 20 },
  { workerIndex: 2, jobIndex: 0, status: "APPLIED",     createdDaysAgo: 6  },

  // hospitality workers (3,4,5) -> jobs 3,4,5
  { workerIndex: 3, jobIndex: 3, status: "SHORTLISTED", createdDaysAgo: 33 },
  { workerIndex: 4, jobIndex: 4, status: "INTERVIEWED", createdDaysAgo: 19, interviewResponse: "DECLINED", interviewResponseMessage: "I've accepted another offer, thank you for the opportunity." },
  { workerIndex: 5, jobIndex: 5, status: "APPLIED",     createdDaysAgo: 12 },
  { workerIndex: 3, jobIndex: 4, status: "VIEWED",      createdDaysAgo: 9  },
  { workerIndex: 5, jobIndex: 3, status: "REJECTED",    createdDaysAgo: 30 },

  // logistics/driving workers (6,7,8,9) -> jobs 6,7
  { workerIndex: 6, jobIndex: 6, status: "ACCEPTED",    createdDaysAgo: 27 },
  { workerIndex: 7, jobIndex: 6, status: "REJECTED",    createdDaysAgo: 26 },
  { workerIndex: 8, jobIndex: 7, status: "SHORTLISTED", createdDaysAgo: 16 },
  { workerIndex: 9, jobIndex: 7, status: "APPLIED",     createdDaysAgo: 5  },
  { workerIndex: 6, jobIndex: 7, status: "VIEWED",      createdDaysAgo: 14 },
  { workerIndex: 9, jobIndex: 6, status: "INTERVIEWED", createdDaysAgo: 8  }, // pending — no worker response yet

  // care workers (10,11,12,13) -> no job posts in this corridor set; they
  // apply cross-category to logistics/hospitality postings, same as a real
  // worker broadening their search would.
  { workerIndex: 10, jobIndex: 4, status: "APPLIED",     createdDaysAgo: 4  },
  { workerIndex: 11, jobIndex: 3, status: "VIEWED",      createdDaysAgo: 11 },
  { workerIndex: 12, jobIndex: 5, status: "SHORTLISTED", createdDaysAgo: 17 },
  { workerIndex: 13, jobIndex: 4, status: "REJECTED",    createdDaysAgo: 21 },

  // agriculture workers (14,15,16,17) -> jobs 8,9
  { workerIndex: 14, jobIndex: 8, status: "ACCEPTED",    createdDaysAgo: 22 },
  { workerIndex: 15, jobIndex: 9, status: "SHORTLISTED", createdDaysAgo: 9  },
  { workerIndex: 16, jobIndex: 8, status: "APPLIED",     createdDaysAgo: 3  },
  { workerIndex: 17, jobIndex: 9, status: "VIEWED",      createdDaysAgo: 7  },
  { workerIndex: 12, jobIndex: 4, status: "APPLIED",     createdDaysAgo: 2  },
];

// ── Lock (STEP 3: 1 active WorkerLock — subscribed employer locks a worker) ─
// Bergmann Bau (employer 0, the ACTIVE subscription) reserves worker 0
// (construction, already ACCEPTED at their site) — started 3 days ago.
const LOCK_EMPLOYER_INDEX = 0;
const LOCK_WORKER_INDEX   = 2; // a different construction worker than the ACCEPTED one, so the lock reads as "reserving a candidate", not a redundant hire
const LOCK_DAYS = 14;
const LOCK_DAILY_FEE = 2.0; // USD — matches the platform's default lock_daily_rate_cents (200) in admin-pricing.controller.ts

async function main() {
  if (CLEAN) return runClean();

  if (EXECUTE && !process.env.DEMO_SEED_PASSWORD) {
    fail("DEMO_SEED_PASSWORD is not set. Set it in the environment before running --execute (never hardcoded).");
  }

  const workers = buildWorkerSpecs();

  console.log(`[seed-demo] mode: ${EXECUTE ? "EXECUTE (will write rows)" : "DRY RUN (no writes)"}`);
  console.log("");
  console.log("── Creation plan ────────────────────────────────────────────");
  console.log(`Admin:          1  (${`demo-admin${DEMO_EMAIL_DOMAIN}`})`);
  console.log(`Workers:        ${workers.length}  (VERIFIED, trustScore 55–95, categories: ${CATEGORIES.map(c => c.name).join(", ")})`);
  console.log(`Employers:      ${EMPLOYERS.length}  (1 ACTIVE subscription: ${EMPLOYERS.find(e => e.active)?.companyName})`);
  console.log(`Job posts:      ${JOBS.length}  (all APPROVED)`);
  console.log(`Applications:   ${APPLICATIONS.length}`);
  const statusCounts = APPLICATIONS.reduce<Record<string, number>>((acc, a) => { acc[a.status] = (acc[a.status] ?? 0) + 1; return acc; }, {});
  console.log(`  by status:    ${Object.entries(statusCounts).map(([s, n]) => `${s}=${n}`).join(", ")}`);
  console.log(`  interviewed w/ responses: 1 ACCEPTED, 1 DECLINED, 1 pending (no response)`);
  console.log(`Worker locks:   1  (${EMPLOYERS[LOCK_EMPLOYER_INDEX].companyName} -> demo-worker-${LOCK_WORKER_INDEX + 1}, started 3 days ago, ${LOCK_DAYS}d)`);
  const notifPlan = JOBS.length /* job approved */ + APPLICATIONS.length /* application received */
    + APPLICATIONS.filter(a => a.status !== "APPLIED" && a.status !== "VIEWED" && a.status !== "WITHDRAWN").length /* worker status-change */
    + APPLICATIONS.filter(a => a.status === "ACCEPTED").length /* employer accepted-notice */;
  console.log(`Notifications:  ~${notifPlan}  (application received, status changes, job approved)`);
  console.log(`Timestamps:     spread across the past 45 days`);
  console.log("──────────────────────────────────────────────────────────────");
  console.log("");

  if (!EXECUTE) {
    console.log("[seed-demo] dry run complete — rerun with --execute to write these rows");
    await prisma.$disconnect();
    return;
  }

  // ── Pre-flight: refuse if demo data already exists ────────────────────────
  const existingCount = await prisma.user.count({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN } } });
  if (existingCount > 0) {
    fail(`${existingCount} @demo.directhire.cc row(s) already exist. Run with --clean first, then --execute again.`);
  }

  const password = process.env.DEMO_SEED_PASSWORD!;
  const passwordHash = await bcrypt.hash(password, 12);

  const failures: { row: string; error: string }[] = [];
  const tryStep = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`[seed-demo] OK    ${label}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      failures.push({ row: label, error: message });
      console.error(`[seed-demo] FAIL  ${label} — ${message}`);
    }
  };

  // ── Admin ──────────────────────────────────────────────────────────────────
  const adminEmail = `demo-admin${DEMO_EMAIL_DOMAIN}`;
  let adminId = "";
  await tryStep(`admin ${adminEmail}`, async () => {
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
        accountStatus: "VERIFIED",
        isEmailVerified: true,
        onboardingComplete: true,
        consentAcceptedAt: daysAgo(45),
        consentPolicyVersion: CONSENT_POLICY_VERSION,
      },
    });
    adminId = admin.id;
  });
  if (!adminId) fail("Admin creation failed — cannot continue (workers/employers need adminId as reviewer).");

  // ── Workers ────────────────────────────────────────────────────────────────
  const workerUserIds: string[] = [];
  const workerProfileIds: string[] = [];

  for (const w of workers) {
    await tryStep(`worker ${w.email} (${w.firstName} ${w.lastName}, ${w.category.name})`, async () => {
      const submittedAt = daysAgo(w.submittedDaysAgo);
      const encPhone = encrypt(`+355 6${(70000000 + w.index * 1111).toString().slice(0, 8)}`);
      const encPassport = encrypt(`AL${(1000000 + w.index * 137).toString()}`);

      const user = await prisma.user.create({
        data: {
          email: w.email,
          passwordHash,
          role: "WORKER",
          status: "ACTIVE",
          accountStatus: "VERIFIED",
          isEmailVerified: true,
          onboardingComplete: true,
          approvedAt: daysAgo(w.submittedDaysAgo - 2),
          reviewedById: adminId,
          consentAcceptedAt: submittedAt,
          consentPolicyVersion: CONSENT_POLICY_VERSION,
          createdAt: daysAgo(w.submittedDaysAgo + 1),
        },
      });
      workerUserIds.push(user.id);

      const profile = await prisma.workerProfile.create({
        data: {
          userId: user.id,
          firstName: w.firstName,
          lastName: w.lastName,
          dateOfBirth: new Date(1985 + (w.index % 20), (w.index % 12), 10 + (w.index % 15)),
          nationality: "Albanian",
          countryOfResidence: "Albania",
          city: ["Tirana", "Durrës", "Vlorë", "Shkodër", "Elbasan"][w.index % 5],
          passportNumber: encPassport,
          phone: encPhone,
          maritalStatus: w.index % 3 === 0 ? "Married" : "Single",
          fatherName: `${MALE_FIRST_NAMES[(w.index + 2) % MALE_FIRST_NAMES.length]} ${w.lastName}`,
          motherName: `${FEMALE_FIRST_NAMES[(w.index + 5) % FEMALE_FIRST_NAMES.length]} ${w.lastName}`,
          hasSpouse: w.index % 3 === 0,
          numberOfChildren: w.numberOfChildren,
          profession: w.category.name.charAt(0).toUpperCase() + w.category.name.slice(1),
          yearsExperience: w.yearsExperience,
          expectedSalary: w.expectedSalary,
          availabilityDate: w.availabilityDate,
          additionalNotes: w.additionalNotes,
          profileScore: 60 + (w.index % 35),
          trustScore: w.trustScore,
          riskScore: 5 + (w.index % 15),
          isSearchable: true,
          passportStatus: "APPROVED",
          documentsVerified: false, // no uploads seeded — see script header
          createdAt: daysAgo(w.submittedDaysAgo + 1),
        },
      });
      workerProfileIds.push(profile.id);

      await prisma.workerSkill.createMany({ data: w.skills.map(skill => ({ workerProfileId: profile.id, skill })) });
      await prisma.workerLanguage.createMany({ data: w.languages.map(l => ({ workerProfileId: profile.id, ...l })) });
      await prisma.workerTargetCountry.createMany({
        data: w.targetCountries.map(country => ({ workerProfileId: profile.id, country, visaTypePreference: "Work Visa" })),
      });

      const completedSteps = [1, 2, 3, 4, 5, 6];
      await prisma.onboardingProgress.create({
        data: {
          userId: user.id,
          role: "WORKER",
          currentStep: 7,
          completedSteps,
          totalSteps: 7,
          draftData: { firstName: w.firstName, lastName: w.lastName },
          isSubmitted: true,
          submittedAt,
          onboardingStatus: "APPROVED",
          lastSavedAt: submittedAt,
          createdAt: daysAgo(w.submittedDaysAgo + 1),
        },
      });

      await prisma.verificationRecord.create({
        data: {
          userId: user.id,
          reviewStatus: "APPROVED",
          reviewedById: adminId,
          reviewedAt: daysAgo(w.submittedDaysAgo - 2),
          createdAt: daysAgo(w.submittedDaysAgo + 1),
        },
      });
    });
  }

  // ── Employers ──────────────────────────────────────────────────────────────
  const employerUserIds: string[] = [];

  for (let i = 0; i < EMPLOYERS.length; i++) {
    const e = EMPLOYERS[i];
    const email = `demo-employer-${i + 1}${DEMO_EMAIL_DOMAIN}`;
    const setupDaysAgo = 44 - i * 2;

    await tryStep(`employer ${email} (${e.companyName})`, async () => {
      const encPhone = encrypt(`+49 30 ${(1000000 + i * 4321).toString()}`);

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          role: "EMPLOYER",
          status: "ACTIVE",
          accountStatus: "VERIFIED",
          isEmailVerified: true,
          onboardingComplete: true,
          approvedAt: daysAgo(setupDaysAgo - 1),
          reviewedById: adminId,
          consentAcceptedAt: daysAgo(setupDaysAgo),
          consentPolicyVersion: CONSENT_POLICY_VERSION,
          createdAt: daysAgo(setupDaysAgo + 1),
        },
      });
      employerUserIds.push(user.id);

      await prisma.employerProfile.create({
        data: {
          userId: user.id,
          companyName: e.companyName,
          contactPersonName: e.contactPersonName,
          nipt: `DEMO${(100000000 + i).toString()}`,
          phone: encPhone,
          industry: e.industry,
          companySize: e.companySize,
          country: e.country,
          city: e.city,
          address: `${e.city} Business District, ${e.country}`,
          businessDescription: `${e.companyName} is a fictional demo company used for platform demonstrations only.`,
          website: undefined, // no real website to fabricate
          // Stripe fields left null — never fabricate Stripe customer/subscription IDs (see header).
          subscriptionPlan: e.active ? "growth" : (i === 1 ? "starter" : undefined),
          subscriptionStatus: e.active ? "ACTIVE" : (i === 1 ? "TRIAL" : undefined),
          trialEndsAt: !e.active && i === 1 ? daysAgo(-10) : undefined,
          isVerified: true,
          createdAt: daysAgo(setupDaysAgo + 1),
        },
      });

      const profile = await prisma.employerProfile.findUniqueOrThrow({ where: { userId: user.id } });
      await prisma.employerHiringCountry.create({ data: { employerProfileId: profile.id, country: "Albania" } });
      const jobsForThisEmployer = JOBS.filter(j => j.employerIndex === i);
      const skillSet = Array.from(new Set(jobsForThisEmployer.flatMap(j => j.requiredSkills)));
      await prisma.employerRequiredSkill.createMany({ data: skillSet.map(skill => ({ employerProfileId: profile.id, skill })) });

      await prisma.onboardingProgress.create({
        data: {
          userId: user.id,
          role: "EMPLOYER",
          currentStep: 4,
          completedSteps: [1, 2, 3],
          totalSteps: 4,
          draftData: { companyName: e.companyName },
          isSubmitted: true,
          submittedAt: daysAgo(setupDaysAgo),
          onboardingStatus: "APPROVED",
          lastSavedAt: daysAgo(setupDaysAgo),
          createdAt: daysAgo(setupDaysAgo + 1),
        },
      });

      await prisma.verificationRecord.create({
        data: {
          userId: user.id,
          reviewStatus: "APPROVED",
          reviewedById: adminId,
          reviewedAt: daysAgo(setupDaysAgo - 1),
          createdAt: daysAgo(setupDaysAgo + 1),
        },
      });
    });
  }

  if (workerUserIds.length !== workers.length || employerUserIds.length !== EMPLOYERS.length) {
    console.error("[seed-demo] one or more worker/employer rows failed — skipping jobs/applications/lock that depend on them");
  } else {
    // ── Job posts ──────────────────────────────────────────────────────────
    const jobIds: string[] = [];
    for (let i = 0; i < JOBS.length; i++) {
      const j = JOBS[i];
      const employer = EMPLOYERS[j.employerIndex];
      await tryStep(`job "${j.title}" @ ${employer.companyName}`, async () => {
        const job = await prisma.jobPost.create({
          data: {
            employerId: employerUserIds[j.employerIndex],
            title: j.title,
            companyName: employer.companyName,
            description: `${employer.companyName} is hiring a ${j.title.toLowerCase()} for our ${j.city} site. This is a fictional demo listing.`,
            requirements: `${j.experienceRequired}+ years relevant experience. ${j.languagesRequired.length ? `Working knowledge of ${j.languagesRequired.join(", ")}.` : "No language requirement."}`,
            benefits: j.accommodation ? "Accommodation provided; relocation support available." : "Relocation support available.",
            country: j.country,
            city: j.city,
            remoteAllowed: false,
            salaryMin: j.salaryMin,
            salaryMax: j.salaryMax,
            salaryCurrency: "EUR",
            contractType: j.contractType as "FULL_TIME" | "PART_TIME" | "CONTRACT" | "TEMPORARY" | "INTERNSHIP" | "FREELANCE",
            experienceRequired: j.experienceRequired,
            category: j.category,
            requiredSkills: j.requiredSkills,
            languagesRequired: j.languagesRequired,
            visaSupport: j.visaSupport,
            accommodation: j.accommodation,
            positionsAvailable: 1 + (i % 3),
            status: "APPROVED",
            approvedBy: adminId,
            approvedAt: daysAgo(j.postedDaysAgo - 1),
            createdAt: daysAgo(j.postedDaysAgo),
          },
        });
        jobIds.push(job.id);

        await prisma.notification.create({
          data: {
            userId: employerUserIds[j.employerIndex],
            title: `Job approved — ${job.title}`,
            body: `"${job.title}" has been approved and is now live for workers to see.`,
            type: "ADMIN_JOB_MODERATION",
            link: "/employer/jobs",
            isRead: true,
            createdAt: daysAgo(j.postedDaysAgo - 1),
          },
        });
      });
    }

    if (jobIds.length !== JOBS.length) {
      console.error("[seed-demo] one or more job posts failed — skipping applications/lock");
    } else {
      // ── Applications (matchScore via the real matching service) ──────────
      for (const a of APPLICATIONS) {
        const w = workers[a.workerIndex];
        const j = JOBS[a.jobIndex];
        await tryStep(`application demo-worker-${a.workerIndex + 1} -> "${j.title}" [${a.status}]`, async () => {
          const scoringWorker: ScoringWorker = {
            skills: w.skills.map(skill => ({ skill })),
            yearsExperience: w.yearsExperience,
            expectedSalary: w.expectedSalary,
            targetCountries: w.targetCountries.map(country => ({ country })),
            countryOfResidence: "Albania",
            trustScore: w.trustScore,
          };
          const scoringJob: ScoringJob = {
            requiredSkills: j.requiredSkills,
            salaryMin: j.salaryMin,
            salaryMax: j.salaryMax,
            country: j.country,
            experienceRequired: j.experienceRequired,
          };
          const matchScore = calculateMatchScore(scoringWorker, scoringJob);

          const createdAt = daysAgo(a.createdDaysAgo);
          const seen = a.status !== "APPLIED";

          const data: Record<string, unknown> = {
            workerId: workerUserIds[a.workerIndex],
            jobId: jobIds[a.jobIndex],
            employerId: employerUserIds[j.employerIndex],
            status: a.status,
            coverLetter: `I am writing to apply for the ${j.title} position. I believe my background in ${w.category.name} makes me a strong fit.`,
            workerNote: null,
            matchScore,
            // No fee fields set — never fabricate Stripe payment activity (see header).
            applicationFeeCents: null,
            applicationFeePaid: false,
            stripePaymentIntentId: null,
            viewedAt: seen ? daysAgo(a.createdDaysAgo - 1) : null,
            createdAt,
          };

          if (a.status === "SHORTLISTED" || a.status === "INTERVIEWED" || a.status === "ACCEPTED") {
            data.shortlistedAt = daysAgo(a.createdDaysAgo - 2);
          }
          if (a.status === "INTERVIEWED" || a.status === "ACCEPTED") {
            data.interviewedAt = daysAgo(a.createdDaysAgo - 4);
            data.interviewContactUnlocked = true;
            data.companyContactVisibleAt = daysAgo(a.createdDaysAgo - 4);
            data.interviewInstructions = "Please join the video call link sent to your email at the scheduled time.";
          }
          if (a.status === "INTERVIEWED" && a.interviewResponse) {
            data.interviewResponse = a.interviewResponse;
            data.interviewResponseMessage = a.interviewResponseMessage ?? null;
            data.interviewRespondedAt = daysAgo(a.createdDaysAgo - 5);
          }
          if (a.status === "ACCEPTED") {
            data.acceptedAt = daysAgo(a.createdDaysAgo - 6);
            data.hireConfirmedAt = daysAgo(a.createdDaysAgo - 6);
            data.offeredSalary = j.salaryMin;
            data.offeredCurrency = "EUR";
            data.startDate = daysAgo(-14);
            data.contractType = j.contractType;
          }
          if (a.status === "REJECTED") {
            data.rejectedAt = daysAgo(a.createdDaysAgo - 3);
            data.rejectionReason = "We've decided to move forward with another candidate whose experience more closely matches this role.";
          }

          const application = await prisma.application.create({ data: data as Parameters<typeof prisma.application.create>[0]["data"] });

          await prisma.jobPost.update({ where: { id: jobIds[a.jobIndex] }, data: { applicationCount: { increment: 1 } } });

          // Notification: application received (employer) — every application
          await prisma.notification.create({
            data: {
              userId: employerUserIds[j.employerIndex],
              title: `New applicant for ${j.title}`,
              body: `A new candidate has applied for ${j.title} at ${EMPLOYERS[j.employerIndex].companyName}.`,
              type: "GENERAL",
              link: `/employer/jobs/${jobIds[a.jobIndex]}/applicants`,
              isRead: true,
              createdAt,
            },
          });

          // Notifications: status changes (worker-facing), mirroring
          // employer-applications.controller.ts's exact copy per status.
          if (a.status === "SHORTLISTED") {
            await prisma.notification.create({
              data: {
                userId: workerUserIds[a.workerIndex],
                type: "APPLICATION_UPDATE",
                title: `You've been shortlisted for ${j.title}`,
                body: `Good news! You've been shortlisted for "${j.title}" at ${EMPLOYERS[j.employerIndex].companyName}.`,
                link: `/worker/applications/${application.id}`,
                createdAt: data.shortlistedAt as Date,
              },
            });
          }
          if (a.status === "INTERVIEWED") {
            await prisma.notification.create({
              data: {
                userId: workerUserIds[a.workerIndex],
                type: "APPLICATION_UPDATE",
                title: `Interview invitation — ${j.title} at ${EMPLOYERS[j.employerIndex].companyName}`,
                body: `Congratulations! You've been selected for an interview for "${j.title}" at ${EMPLOYERS[j.employerIndex].companyName}.`,
                link: `/worker/applications/${application.id}`,
                createdAt: data.interviewedAt as Date,
              },
            });
          }
          if (a.status === "ACCEPTED") {
            await prisma.notification.create({
              data: {
                userId: workerUserIds[a.workerIndex],
                type: "APPLICATION_UPDATE",
                title: `Application accepted — ${j.title}`,
                body: `Congratulations! ${EMPLOYERS[j.employerIndex].companyName} has accepted your application for "${j.title}".`,
                link: `/worker/applications/${application.id}`,
                createdAt: data.acceptedAt as Date,
              },
            });
            await prisma.notification.create({
              data: {
                userId: employerUserIds[j.employerIndex],
                type: "APPLICATION_UPDATE",
                title: `You accepted ${w.firstName} ${w.lastName}'s application`,
                body: `You've accepted ${w.firstName} ${w.lastName}'s application for "${j.title}". Their contact details are in your dashboard.`,
                link: `/employer/applications/${application.id}`,
                createdAt: data.acceptedAt as Date,
              },
            });
          }
          if (a.status === "REJECTED") {
            await prisma.notification.create({
              data: {
                userId: workerUserIds[a.workerIndex],
                type: "APPLICATION_UPDATE",
                title: `Update on your application — ${j.title}`,
                body: `Thank you for your interest in "${j.title}" at ${EMPLOYERS[j.employerIndex].companyName}. We will not be moving forward at this time.`,
                link: `/worker/applications/${application.id}`,
                createdAt: data.rejectedAt as Date,
              },
            });
          }
        });
      }

      // ── Worker lock ──────────────────────────────────────────────────────
      await tryStep(`worker lock ${EMPLOYERS[LOCK_EMPLOYER_INDEX].companyName} -> demo-worker-${LOCK_WORKER_INDEX + 1}`, async () => {
        const lockStart = daysAgo(3);
        const lockExpiry = new Date(lockStart.getTime() + LOCK_DAYS * 24 * 3600 * 1000);
        await prisma.$transaction([
          prisma.workerLock.create({
            data: {
              workerId: workerUserIds[LOCK_WORKER_INDEX],
              employerId: employerUserIds[LOCK_EMPLOYER_INDEX],
              lockStatus: "ACTIVE",
              dailyFee: LOCK_DAILY_FEE,
              currency: "USD",
              lockStartDate: lockStart,
              lockExpiryDate: lockExpiry,
              lockDays: LOCK_DAYS,
              // First day billed immediately, same as confirmLock() — but no
              // LockBillingCharge row and no stripePaymentIntentId, since we
              // never ran a real Stripe charge for demo data (see header).
              totalBilled: LOCK_DAILY_FEE,
              totalDaysBilled: 1,
              stripePaymentIntentId: null,
              createdAt: lockStart,
            },
          }),
          prisma.user.update({
            where: { id: workerUserIds[LOCK_WORKER_INDEX] },
            data: {
              isLocked: true,
              lockedByEmployerId: employerUserIds[LOCK_EMPLOYER_INDEX],
              lockedUntil: lockExpiry,
              lockCount: { increment: 1 },
            },
          }),
        ]);
      });
    }
  }

  console.log("");
  console.log(`[seed-demo] done — ${failures.length === 0 ? "all rows written successfully" : `${failures.length} failure(s)`}`);
  if (failures.length > 0) {
    console.log("[seed-demo] failures:");
    for (const f of failures) console.log(`  - ${f.row}: ${f.error}`);
  }
  console.log("");
  console.log("Demo credentials (all accounts share DEMO_SEED_PASSWORD):");
  console.log(`  Admin:     ${adminEmail}`);
  console.log(`  Worker:    demo-worker-1${DEMO_EMAIL_DOMAIN} … demo-worker-${workers.length}${DEMO_EMAIL_DOMAIN}`);
  console.log(`  Employer:  demo-employer-1${DEMO_EMAIL_DOMAIN} … demo-employer-${EMPLOYERS.length}${DEMO_EMAIL_DOMAIN}`);

  await prisma.$disconnect();
  if (failures.length > 0) process.exit(1);
}

// ── --clean ──────────────────────────────────────────────────────────────
// Raw pg over DIRECT_URL, same style as sweep-orphaned-profiles.ts: explicit
// deletes in dependency order (not relying on live-DB cascade config),
// scoped ONLY to rows reachable from a @demo.directhire.cc User, verified by
// a re-count afterward.

async function runClean() {
  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) fail("DIRECT_URL is not set (expected the non-pooled, port-5432 connection string).");

  const client = new Client({ connectionString });
  await client.connect();

  const { rows: demoUsers } = await client.query<{ id: string }>(
    `SELECT id FROM "User" WHERE email LIKE $1`,
    [`%${DEMO_EMAIL_DOMAIN}`],
  );
  const demoIds = demoUsers.map(r => r.id);

  console.log(`[seed-demo --clean] found ${demoIds.length} @demo.directhire.cc User row(s)`);
  if (demoIds.length === 0) {
    console.log("[seed-demo --clean] nothing to do");
    await client.end();
    return;
  }

  console.log("[seed-demo --clean] deleting dependent rows…");

  await client.query(`DELETE FROM "Notification" WHERE "userId" = ANY($1::text[])`, [demoIds]);
  await client.query(`DELETE FROM "applications" WHERE "worker_id" = ANY($1::text[]) OR "employer_id" = ANY($1::text[])`, [demoIds]);
  await client.query(`DELETE FROM "worker_locks" WHERE "worker_id" = ANY($1::text[]) OR "employer_id" = ANY($1::text[])`, [demoIds]);
  await client.query(`DELETE FROM "job_posts" WHERE "employer_id" = ANY($1::text[])`, [demoIds]);

  await client.query(`DELETE FROM "WorkerSkill" WHERE "workerProfileId" IN (SELECT id FROM "WorkerProfile" WHERE "userId" = ANY($1::text[]))`, [demoIds]);
  await client.query(`DELETE FROM "WorkerLanguage" WHERE "workerProfileId" IN (SELECT id FROM "WorkerProfile" WHERE "userId" = ANY($1::text[]))`, [demoIds]);
  await client.query(`DELETE FROM "WorkerTargetCountry" WHERE "workerProfileId" IN (SELECT id FROM "WorkerProfile" WHERE "userId" = ANY($1::text[]))`, [demoIds]);
  await client.query(`DELETE FROM "SavedJob" WHERE "workerProfileId" IN (SELECT id FROM "WorkerProfile" WHERE "userId" = ANY($1::text[]))`, [demoIds]);
  await client.query(`DELETE FROM "WorkerProfile" WHERE "userId" = ANY($1::text[])`, [demoIds]);

  await client.query(`DELETE FROM "EmployerHiringCountry" WHERE "employerProfileId" IN (SELECT id FROM "EmployerProfile" WHERE "userId" = ANY($1::text[]))`, [demoIds]);
  await client.query(`DELETE FROM "EmployerRequiredSkill" WHERE "employerProfileId" IN (SELECT id FROM "EmployerProfile" WHERE "userId" = ANY($1::text[]))`, [demoIds]);
  await client.query(`DELETE FROM "EmployerProfile" WHERE "userId" = ANY($1::text[])`, [demoIds]);

  await client.query(`DELETE FROM "OnboardingProgress" WHERE "userId" = ANY($1::text[])`, [demoIds]);
  await client.query(`DELETE FROM "VerificationRecord" WHERE "userId" = ANY($1::text[])`, [demoIds]);

  const { rowCount: usersDeleted } = await client.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [demoIds]);
  console.log(`[seed-demo --clean] deleted ${usersDeleted ?? 0} User row(s) and all dependents`);

  const { rows: remaining } = await client.query<{ c: number }>(
    `SELECT COUNT(*)::int c FROM "User" WHERE email LIKE $1`,
    [`%${DEMO_EMAIL_DOMAIN}`],
  );
  if (remaining[0].c === 0) {
    console.log("[seed-demo --clean] verified — 0 @demo.directhire.cc rows remaining");
  } else {
    console.error(`[seed-demo --clean] WARNING — ${remaining[0].c} @demo.directhire.cc row(s) still remain`);
  }

  await client.end();
  if (remaining[0].c !== 0) process.exit(1);
}

main().catch((e) => {
  console.error("[seed-demo] FATAL:", e);
  process.exit(1);
});
