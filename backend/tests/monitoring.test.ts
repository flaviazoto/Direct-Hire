// backend/tests/monitoring.test.ts
// Phase 10 monitoring: the health-monitor checks flag the failures they are
// meant to (and stay quiet otherwise), browser errors are accepted without
// echoing data back, and the admin test-alert goes through the real alert path.

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer, resetDatabase, db, call, login, createUser, getServerLog } from "./helpers/harness";
import {
  checkScheduledJobs, checkUploadFailures, checkEmailDelivery, checkRestarts,
  checkDatabaseLatency, checkDatabaseConnections, checkMemory, PROCESS_START_JOB,
} from "../src/services/health-monitor/checks";
import { EXPECTED_INTERVAL_MINUTES } from "../src/lib/job-schedule";

before(async () => {
  await resetDatabase();
  await startServer();
});
after(stopServer);

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

async function logRun(jobName: string, startedAt: Date, status = "success", errorMessage?: string) {
  const prisma = await db();
  await prisma.jobRunLog.create({
    data: { jobName, status, recordsProcessed: 0, recordsFailed: 0, errorMessage, startedAt, completedAt: startedAt, durationMs: 1 },
  });
}

/** Every scheduled job (except those listed) ran just now and succeeded. */
async function allJobsFresh(except: string[] = []) {
  for (const job of Object.keys(EXPECTED_INTERVAL_MINUTES)) if (!except.includes(job)) await logRun(job, minutesAgo(1));
}

it("the API records its own start (runs before the checks clear the table)", async () => {
  const prisma = await db();
  let n = 0;
  for (let i = 0; i < 20 && n === 0; i++) {
    n = await prisma.jobRunLog.count({ where: { jobName: PROCESS_START_JOB } });
    if (n === 0) await new Promise((r) => setTimeout(r, 100)); // written just after listen()
  }
  assert.ok(n >= 1);
});

describe("health-monitor checks", () => {
  beforeEach(async () => {
    const prisma = await db();
    await prisma.jobRunLog.deleteMany({});
    await prisma.emailLog.deleteMany({});
    await prisma.upload.deleteMany({});
  });

  it("scheduled jobs: ok when every job ran on time", async () => {
    await allJobsFresh();
    const r = await checkScheduledJobs();
    assert.equal(r.ok, true, r.error);
  });

  it("scheduled jobs: flags a job that never ran", async () => {
    const r = await checkScheduledJobs();
    assert.equal(r.ok, false);
    assert.match(r.error!, /storage-cleanup: never ran/);
  });

  it("scheduled jobs: flags an hourly job that stopped, but not a daily job run 10 hours ago", async () => {
    await allJobsFresh(["lock-expiry-processor", "match-score-recalc"]);
    await logRun("lock-expiry-processor", minutesAgo(3 * 60));
    await logRun("match-score-recalc", minutesAgo(10 * 60));
    const r = await checkScheduledJobs();
    assert.equal(r.ok, false);
    assert.match(r.error!, /lock-expiry-processor: last ran 180 min ago/);
    assert.doesNotMatch(r.error!, /match-score-recalc/);
  });

  it("scheduled jobs: flags a job whose latest run failed", async () => {
    await allJobsFresh();
    await logRun("storage-cleanup", new Date(), "failed", "bucket unreachable");
    const r = await checkScheduledJobs();
    assert.equal(r.ok, false);
    assert.match(r.error!, /storage-cleanup: last run failed — bucket unreachable/);
  });

  it("upload failures: flags a failed upload in the last hour only", async () => {
    const prisma = await db();
    const user = await createUser({ role: "WORKER" });
    const base = { userId: user.id, fileType: "PROFILE_PHOTO" as const, fileName: "a.jpg", fileUrl: "x", filePath: "x", mimeType: "image/jpeg", sizeBytes: 1 };
    await prisma.upload.create({ data: { ...base, status: "FAILED", uploadedAt: minutesAgo(120) } });
    assert.equal((await checkUploadFailures()).ok, true);
    await prisma.upload.create({ data: { ...base, status: "FAILED" } });
    const r = await checkUploadFailures();
    assert.equal(r.ok, false);
    assert.match(r.error!, /1 failed upload/);
  });

  it("email delivery: flags repeated failures, ignoring the alert emails themselves", async () => {
    const prisma = await db();
    const row = { toAddress: "x@test.invalid", subject: "s", status: "FAILED" as const };
    for (let i = 0; i < 5; i++) await prisma.emailLog.create({ data: { ...row, emailType: "SYSTEM_HEALTH_ALERT" } });
    for (let i = 0; i < 2; i++) await prisma.emailLog.create({ data: { ...row, emailType: "WELCOME" } });
    assert.equal((await checkEmailDelivery()).ok, true, "2 failures is under the default threshold of 3");
    await prisma.emailLog.create({ data: { ...row, emailType: "PASSWORD_RESET", status: "BOUNCED" } });
    const r = await checkEmailDelivery();
    assert.equal(r.ok, false);
    assert.match(r.error!, /3 failed or bounced/);
  });

  it("restarts: flags a crash loop", async () => {
    for (let i = 0; i < 3; i++) await logRun(PROCESS_START_JOB, minutesAgo(i * 5));
    assert.equal((await checkRestarts()).ok, true);
    await logRun(PROCESS_START_JOB, minutesAgo(1));
    const r = await checkRestarts();
    assert.equal(r.ok, false);
    assert.match(r.error!, /started 4 times/);
  });

  it("database latency, connections and memory pass on a healthy local setup", async () => {
    for (const r of [await checkDatabaseLatency(), await checkDatabaseConnections(), await checkMemory()]) {
      assert.equal(r.ok, true, `${r.name}: ${r.error}`);
    }
  });
});

describe("POST /api/client-errors", () => {
  it("accepts a report and logs the path without its query string", async () => {
    const r = await call("POST", "/api/client-errors", {
      body: { kind: "error", message: "TypeError: x is undefined", stack: "at a\nat b", path: "/reset-password?token=SECRET123", build: "abc1234" },
    });
    assert.equal(r.status, 204);
    await new Promise((res) => setTimeout(res, 100));
    const log = getServerLog();
    assert.match(log, /\[client-error\].*TypeError: x is undefined/);
    assert.doesNotMatch(log, /SECRET123/);
  });

  it("silently drops malformed or oversized reports", async () => {
    assert.equal((await call("POST", "/api/client-errors", { body: { nope: true } })).status, 204);
    assert.equal((await call("POST", "/api/client-errors", { body: { message: "x".repeat(600) } })).status, 204);
    const big = await call("POST", "/api/client-errors", { body: { message: "m", stack: "s".repeat(20_000) } });
    assert.ok([204, 413].includes(big.status), `got ${big.status}`);
  });
});

describe("POST /api/admin/system/test-alert", () => {
  it("is admin-only", async () => {
    const worker = await createUser({ role: "WORKER" });
    const { token } = await login(worker.email);
    assert.equal((await call("POST", "/api/admin/system/test-alert", { token })).status, 403);
    assert.equal((await call("POST", "/api/admin/system/test-alert")).status, 401);
  });

  it("sends one alert email to the owner and writes an audit entry", async () => {
    const prisma = await db();
    const admin = await createUser({ role: "ADMIN" });
    const { token } = await login(admin.email);
    const before = await prisma.emailLog.count({ where: { emailType: "SYSTEM_HEALTH_ALERT" } });
    const r = await call("POST", "/api/admin/system/test-alert", { token });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await prisma.emailLog.count({ where: { emailType: "SYSTEM_HEALTH_ALERT" } }), before + 1);
    const audit = await prisma.auditLog.findFirst({ where: { action: "MONITORING_TEST_ALERT", actorId: admin.id } });
    assert.ok(audit, "audit entry written");
  });
});

describe("error-tracking scrubber", () => {
  it("removes query strings, headers, bodies, user info, breadcrumbs and Prisma arguments", async () => {
    const { scrubEvent } = await import("../src/lib/error-tracking");
    const event: any = {
      type: undefined,
      request: { method: "POST", url: "https://api.directhire.cc/api/auth/reset?token=SECRET", headers: { cookie: "dh_refresh=SECRET" }, data: { password: "SECRET" }, query_string: "token=SECRET" },
      user: { email: "someone@test.invalid", ip_address: "1.2.3.4" },
      breadcrumbs: [{ category: "http", data: { url: "https://x.supabase.co/sign?token=SECRET" } }, { category: "console", message: "email: SECRET" }],
      exception: { values: [{ type: "PrismaClientKnownRequestError", value: "Invalid `prisma.user.create()` invocation:\n  email: \"someone@test.invalid\"\nUnique constraint failed on the fields: (`email`)" }] },
    };
    const out = JSON.stringify(scrubEvent(event));
    assert.doesNotMatch(out, /SECRET|someone@test\.invalid|1\.2\.3\.4/);
    assert.match(out, /api\/auth\/reset/);
    assert.match(out, /Unique constraint failed/);
  });
});
