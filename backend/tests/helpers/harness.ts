// backend/tests/helpers/harness.ts
// Starts the real API (child process) against the local dh_test database and
// gives tests small helpers. Never runs against anything but a local dh_test.
//
// Run all API tests: npm run test:api

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://directhire:directhire_local_only@localhost:5434/dh_test";
const PORT = Number(process.env.TEST_API_PORT ?? 4200);
export const API = `http://localhost:${PORT}`;

// Fixed secrets so tests can mint tokens with specific claims (e.g. an old authTime).
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  PORT: String(PORT),
  DATABASE_URL: TEST_DB_URL,
  DIRECT_URL: TEST_DB_URL,
  JWT_ACCESS_SECRET: "test-access-secret-" + "a".repeat(48),
  JWT_REFRESH_SECRET: "test-refresh-secret-" + "b".repeat(48),
  ENCRYPTION_KEY: "0".repeat(64),
  CRON_SECRET: "test-cron-secret",
  FRONTEND_URL: "http://localhost:3000",
  BACKEND_URL: `http://localhost:${PORT}`,
  ALLOWED_ORIGINS: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "test",
  EMAIL_PROVIDER: "console",
  STORAGE_PROVIDER: "local",
  OWNER_EMAIL: "owner@test.invalid",
  JOBS_INLINE_MODE: "true",
  DISABLE_SCHEDULER: "true",
  PAYMENTS_ENABLED: "false",
  AUTH_RATE_LIMIT_MAX: "100000",
  OTP_RATE_LIMIT_MAX: "100000",
  RATE_LIMIT_MAX_REQUESTS: "100000",
};

// Point this process (Prisma client used for fixtures) at the same database.
Object.assign(process.env, TEST_ENV);

function assertLocalTestDb() {
  const u = new URL(TEST_DB_URL);
  if (!["localhost", "127.0.0.1", "::1"].includes(u.hostname) || u.pathname !== "/dh_test") {
    throw new Error(`Refusing to run API tests against ${u.hostname}${u.pathname} — only a local dh_test is allowed.`);
  }
}

// Imported lazily so process.env is set before the Prisma client initializes.
export async function db() {
  return (await import("../../src/lib/prisma")).default;
}

export async function resetDatabase() {
  assertLocalTestDb();
  const prisma = await db();
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
  }
}

let server: ChildProcess | undefined;
let serverLog = "";

export async function startServer() {
  assertLocalTestDb();
  const backendRoot = path.resolve(__dirname, "..", "..");
  server = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: backendRoot,
    env: { ...process.env, ...TEST_ENV, DOTENV_CONFIG_PATH: path.join(backendRoot, "tests", ".env.none") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (d) => { serverLog += d; });
  server.stderr?.on("data", (d) => { serverLog += d; });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`API exited early:\n${serverLog}`);
    try {
      const r = await fetch(`${API}/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`API did not start within 60s:\n${serverLog}`);
}

export async function stopServer() {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((r) => server!.once("exit", r));
  }
  const prisma = await db();
  await prisma.$disconnect();
}

export function getServerLog() { return serverLog; }

// ── HTTP ──────────────────────────────────────────────────────
export interface CallResult {
  status: number;
  body: any;
  setCookies: string[];
}

export async function call(
  method: string,
  p: string,
  opts: { token?: string; body?: unknown; cookie?: string } = {},
): Promise<CallResult> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(API + p, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return { status: r.status, body, setCookies: r.headers.getSetCookie() };
}

/** "dh_refresh=<value>" from a response, or "" */
export function refreshCookie(setCookies: string[]): string {
  return (setCookies.find((c) => c.startsWith("dh_refresh=") && !c.startsWith("dh_refresh=;")) ?? "").split(";")[0];
}

// ── Fixtures ──────────────────────────────────────────────────
export const PASSWORD = "TestPass123";
let counter = 0;

export function uniqueEmail(tag: string) {
  return `${tag}.${Date.now().toString(36)}${(counter++).toString(36)}@test.invalid`;
}

type Role = "WORKER" | "EMPLOYER" | "ADMIN";
type AccountStatus = "PENDING_EMAIL_VERIFICATION" | "PENDING_REVIEW" | "VERIFIED" | "REJECTED" | "SUSPENDED";

export async function createUser(opts: { role?: Role; accountStatus?: AccountStatus; email?: string } = {}) {
  const prisma = await db();
  const role = opts.role ?? "WORKER";
  const user = await prisma.user.create({
    data: {
      email: opts.email ?? uniqueEmail(role.toLowerCase()),
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role,
      status: "ACTIVE",
      accountStatus: opts.accountStatus ?? "VERIFIED",
      isEmailVerified: (opts.accountStatus ?? "VERIFIED") !== "PENDING_EMAIL_VERIFICATION",
      ...(role === "WORKER" ? { workerProfile: { create: { firstName: "Test", lastName: "Worker" } } } : {}),
      ...(role === "EMPLOYER" ? { employerProfile: { create: { companyName: "Test Co", contactPersonName: "Test Employer", subscriptionStatus: "ACTIVE" } } } : {}),
    },
  });
  return user;
}

export async function login(email: string, password = PASSWORD) {
  const r = await call("POST", "/api/auth/login", { body: { email, password } });
  return { ...r, token: r.body?.data?.accessToken as string | undefined, refresh: refreshCookie(r.setCookies) };
}

/** Mint an access token directly, e.g. one whose sign-in happened long ago. */
export async function mintAccessToken(
  user: { id: string; email: string; role: string },
  claims: Record<string, unknown> = {},
) {
  return new SignJWT({ sub: user.id, email: user.email, role: user.role, ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(TEST_ENV.JWT_ACCESS_SECRET));
}
