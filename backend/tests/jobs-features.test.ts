// backend/tests/jobs-features.test.ts
// Regression tests for background jobs and broken features (audit H-3, H-4,
// H-5, H-6, M-4, M-11, L-4 and the cron crash).

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startServer, stopServer, resetDatabase, db, call, login, createUser, API, TEST_ENV } from "./helpers/harness";

before(async () => {
  await resetDatabase();
  await startServer();
});
after(stopServer);

const UPLOAD_ROOT = path.resolve(__dirname, "..", ".uploads");
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function upload(token: string, fileType: string, buf: Buffer, mime: string) {
  const f = new FormData();
  f.append("fileType", fileType);
  f.append("file", new Blob([buf], { type: mime }), "f");
  const r = await fetch(`${API}/api/uploads`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: f });
  return { status: r.status, body: await r.json() };
}
const cron = (job: string, secret = TEST_ENV.CRON_SECRET) =>
  fetch(`${API}/api/cron?job=${job}`, { headers: { "X-Cron-Secret": secret } }).then(async (r) => ({ status: r.status, body: await r.json() }));

describe("cron route", () => {
  it("rejects a wrong secret and unknown jobs", async () => {
    assert.equal((await cron("onboarding-reminders", "wrong")).status, 401);
    assert.equal((await cron("not-a-job")).status, 400);
  });

  it("a failing job is reported, not fatal: the API stays up", async () => {
    const prisma = await db();
    // A prefix the erasure service refuses — the cleanup run fails for that row.
    await prisma.storageDeletion.create({ data: { prefix: "invoices/x" } });
    const r = await cron("storage-cleanup");
    assert.equal(r.status, 200);
    const log = await prisma.jobRunLog.findFirstOrThrow({ where: { jobName: "storage-cleanup" }, orderBy: { startedAt: "desc" } });
    assert.equal(log.status, "failed");
    assert.equal((await call("GET", "/health")).status, 200);
    await prisma.storageDeletion.deleteMany({});
  });
});

describe("onboarding reminders", () => {
  it("sends once per user, skips unsubscribed users, and logs every run", async () => {
    const prisma = await db();
    const stale = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    const active = await createUser({ accountStatus: "PENDING_REVIEW" });
    const unsubscribed = await createUser({ accountStatus: "PENDING_REVIEW" });
    await prisma.user.update({ where: { id: unsubscribed.id }, data: { emailUnsubscribedAt: new Date() } });
    for (const u of [active, unsubscribed]) {
      await prisma.onboardingProgress.create({
        data: { userId: u.id, role: "WORKER", currentStep: 1, completedSteps: [1], totalSteps: 7, isSubmitted: false, onboardingStatus: "IN_PROGRESS", lastSavedAt: stale },
      });
    }
    assert.equal((await cron("onboarding-reminders")).status, 200);
    assert.equal((await cron("onboarding-reminders")).status, 200); // retry / second run
    const sent = await prisma.emailLog.count({ where: { emailType: "ONBOARDING_REMINDER", userId: active.id } });
    assert.equal(sent, 1, "exactly one reminder despite two runs");
    assert.equal(await prisma.emailLog.count({ where: { emailType: "ONBOARDING_REMINDER", userId: unsubscribed.id } }), 0);
    const runs = await prisma.jobRunLog.count({ where: { jobName: "onboarding-reminders", status: "success" } });
    assert.ok(runs >= 2, `expected 2 logged runs, got ${runs}`);
  });
});

describe("profile photos and logos", () => {
  it("are stored with a stable media URL that serves the image", async () => {
    const worker = await createUser();
    const token = (await login(worker.email)).token!;
    const up = await upload(token, "PROFILE_PHOTO", PNG, "image/png");
    assert.equal(up.status, 201, JSON.stringify(up.body));
    const prisma = await db();
    const row = await prisma.upload.findUniqueOrThrow({ where: { id: up.body.data.id } });
    assert.equal(row.fileUrl, `/api/media/${row.id}`);
    const img = await fetch(`${API}${row.fileUrl}`);
    assert.equal(img.status, 200);
    assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);
  });

  it("never serve private documents, and stop for suspended owners", async () => {
    const worker = await createUser();
    const token = (await login(worker.email)).token!;
    const cert = await upload(token, "MEDICAL_CERTIFICATE", PDF, "application/pdf");
    assert.equal((await fetch(`${API}/api/media/${cert.body.data.id}`)).status, 404);
    const photo = await upload(token, "PROFILE_PHOTO", PNG, "image/png");
    const prisma = await db();
    await prisma.user.update({ where: { id: worker.id }, data: { accountStatus: "SUSPENDED" } });
    assert.equal((await fetch(`${API}/api/media/${photo.body.data.id}`)).status, 404);
  });
});

describe("account deletion erases stored files", () => {
  it("removes the user's storage folder and records completion", async () => {
    const worker = await createUser();
    const token = (await login(worker.email)).token!;
    assert.equal((await upload(token, "PROFILE_PHOTO", PNG, "image/png")).status, 201);
    assert.equal((await upload(token, "MEDICAL_CERTIFICATE", PDF, "application/pdf")).status, 201);
    const folder = path.join(UPLOAD_ROOT, worker.id);
    assert.ok(fs.existsSync(folder), "files were written");
    assert.equal((await call("DELETE", "/api/auth/account", { token, body: {} })).status, 200);
    assert.ok(!fs.existsSync(folder), "user folder removed");
    const prisma = await db();
    const row = await prisma.storageDeletion.findFirstOrThrow({ where: { prefix: worker.id } });
    assert.ok(row.completedAt);
  });
});

describe("contact form abuse protection", () => {
  const body = (over: Record<string, unknown> = {}) => ({ name: "Ana Koci", email: `c${Date.now()}${Math.random()}@test.invalid`, message: "Hello there", ...over });

  it("rejects names carrying links or markup", async () => {
    for (const name of ["Visit http://evil.example", "<a href=x>win</a>", "www.evil.example"]) {
      assert.equal((await call("POST", "/api/contact", { body: body({ name }) })).status, 422, name);
    }
  });

  it("silently drops honeypot submissions", async () => {
    const b = body({ website: "http://spam.example" });
    const r = await call("POST", "/api/contact", { body: b });
    assert.equal(r.status, 200);
    await new Promise((res) => setTimeout(res, 300));
    const prisma = await db();
    assert.equal(await prisma.emailLog.count({ where: { toAddress: b.email as string } }), 0);
  });

  it("sends at most one confirmation per address per day", async () => {
    const b = body();
    assert.equal((await call("POST", "/api/contact", { body: b })).status, 200);
    await new Promise((res) => setTimeout(res, 300));
    assert.equal((await call("POST", "/api/contact", { body: b })).status, 200);
    await new Promise((res) => setTimeout(res, 300));
    const prisma = await db();
    assert.equal(await prisma.emailLog.count({ where: { toAddress: b.email as string, templateId: "contact_confirmation" } }), 1);
  });
});

describe("email templates escape user input", () => {
  it("renders names as text, not HTML", async () => {
    const { contactConfirmationTemplate } = await import("../src/services/email/templates");
    const t = contactConfirmationTemplate({ name: `<a href="https://evil.example">Ana</a>` });
    assert.ok(!t.html.includes(`<a href="https://evil.example">`));
    assert.ok(t.html.includes("&lt;a href=&quot;https://evil.example&quot;&gt;"));
  });
});

describe("error responses", () => {
  it("every response carries a request ID", async () => {
    const r = await fetch(`${API}/api/public/jobs?limit=1`);
    assert.match(r.headers.get("x-request-id") ?? "", /^[A-Za-z0-9-]{8,64}$/);
  });

  it("malformed JSON is a 400, not a 500", async () => {
    const r = await fetch(`${API}/api/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
    assert.equal(r.status, 400);
  });

  it("a disallowed CORS origin is a 403, not a 500", async () => {
    const r = await fetch(`${API}/api/public/jobs`, { headers: { Origin: "https://evil.example" } });
    assert.equal(r.status, 403);
  });

  it("unexpected errors return a generic message plus request ID", async () => {
    const { errorHandler } = await import("../src/middleware/error.middleware");
    let status = 0; let json: Record<string, unknown> = {};
    const res = { status(c: number) { status = c; return this; }, json(b: Record<string, unknown>) { json = b; return this; } };
    const orig = console.error; console.error = () => {};
    try {
      errorHandler(new Error("Invalid API Key provided: sk_test_secret"), { id: "req-12345678", method: "GET", originalUrl: "/x" } as never, res as never, () => {});
    } finally { console.error = orig; }
    assert.equal(status, 500);
    assert.equal(json.requestId, "req-12345678");
    assert.ok(!JSON.stringify(json).includes("sk_test"), "internal message leaked");
  });
});

describe("identity changes trigger document re-review", () => {
  it("changing a verified worker's name resets document verification; other edits don't", async () => {
    const prisma = await db();
    const worker = await createUser();
    await prisma.workerProfile.update({ where: { userId: worker.id }, data: { documentsVerified: true } });
    const token = (await login(worker.email)).token!;

    const city = await call("PATCH", "/api/user/profile", { token, body: { city: "Tirana" } });
    assert.equal(city.status, 200);
    assert.equal((await prisma.workerProfile.findUniqueOrThrow({ where: { userId: worker.id } })).documentsVerified, true);

    const name = await call("PATCH", "/api/user/profile", { token, body: { lastName: "Different" } });
    assert.equal(name.status, 200);
    assert.equal(name.body.data.reReviewRequired, true);
    assert.equal((await prisma.workerProfile.findUniqueOrThrow({ where: { userId: worker.id } })).documentsVerified, false);
    assert.equal(await prisma.auditLog.count({ where: { userId: worker.id, action: "IDENTITY_CHANGED_REREVIEW" } }), 1);
  });
});
