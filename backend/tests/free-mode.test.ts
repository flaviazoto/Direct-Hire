// backend/tests/free-mode.test.ts
// The platform running free (PAYMENTS_ENABLED=false, set by the test harness):
// permitted workflows need no subscription or payment, while authorization
// and abuse limits still hold.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer, resetDatabase, db, call, login, createUser } from "./helpers/harness";

before(async () => {
  await resetDatabase();
  await startServer();
});
after(stopServer);

/** An employer with no subscription at all — the normal state on a free platform. */
async function freeEmployer() {
  const prisma = await db();
  const employer = await createUser({ role: "EMPLOYER" });
  await prisma.employerProfile.update({ where: { userId: employer.id }, data: { subscriptionStatus: null, trialEndsAt: null } });
  return { employer, token: (await login(employer.email)).token! };
}

async function discoverableWorker() {
  const prisma = await db();
  const worker = await createUser({ role: "WORKER" });
  await prisma.workerProfile.update({ where: { userId: worker.id }, data: { isSearchable: true } });
  return worker;
}

async function approvedJob(employerId: string) {
  const prisma = await db();
  return prisma.jobPost.create({
    data: {
      employerId, title: "Electrician", companyName: "Free Co", description: "x".repeat(120), requirements: "x".repeat(60),
      country: "DE", city: "Berlin", salaryMin: 30000, salaryMax: 40000, contractType: "FULL_TIME",
      experienceRequired: 1, category: "Trades", requiredSkills: ["wiring"], status: "APPROVED",
    },
  });
}

describe("free platform: employers", () => {
  it("public config reports payments disabled", async () => {
    const r = await call("GET", "/api/public/config/pricing");
    assert.equal(r.status, 200);
    assert.equal(r.body.data.paymentsEnabled, false);
  });

  it("an employer without a subscription can browse candidates and post a job", async () => {
    const { token } = await freeEmployer();
    assert.equal((await call("GET", "/api/employer/workers", { token })).status, 200);
    const job = await call("POST", "/api/employer/jobs?submit=false", {
      token,
      body: {
        title: "Free Mode Job", companyName: "Free Co", description: "x".repeat(120), requirements: "x".repeat(60),
        country: "DE", city: "Berlin", salaryMin: 30000, salaryMax: 40000, contractType: "FULL_TIME",
        experienceRequired: 1, category: "Trades", requiredSkills: ["wiring"],
      },
    });
    assert.ok([200, 201].includes(job.status), JSON.stringify(job.body));
  });

  it("checkout is refused; nothing can start a new subscription", async () => {
    const { token } = await freeEmployer();
    const r = await call("POST", "/api/employer/subscription/checkout", { token, body: {} });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, "PAYMENTS_DISABLED");
  });
});

describe("free platform: reservations", () => {
  it("reserving is immediate and free — no PaymentIntent, charge or payment record", async () => {
    const { employer, token } = await freeEmployer();
    const worker = await discoverableWorker();
    const r = await call("POST", `/api/employer/workers/${worker.id}/lock`, { token, body: { lock_days: 5 } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data.requiresPayment, false);
    const prisma = await db();
    const lock = await prisma.workerLock.findFirstOrThrow({ where: { workerId: worker.id, employerId: employer.id } });
    assert.equal(lock.lockStatus, "ACTIVE");
    assert.equal(Number(lock.dailyFee), 0);
    assert.equal(lock.stripePaymentIntentId, null);
    assert.equal(await prisma.payment.count({ where: { userId: employer.id } }), 0);
    assert.equal(await prisma.lockBillingCharge.count({ where: { lockId: lock.id } }), 0);
    const w = await prisma.user.findUniqueOrThrow({ where: { id: worker.id } });
    assert.equal(w.isLocked, true);
    assert.equal(w.lockedByEmployerId, employer.id);
  });

  it("two employers reserving the same worker at once: exactly one wins", async () => {
    const worker = await discoverableWorker();
    const a = await freeEmployer();
    const b = await freeEmployer();
    const results = await Promise.all([a, b, a, b].map((e) =>
      call("POST", `/api/employer/workers/${worker.id}/lock`, { token: e.token, body: { lock_days: 3 } })));
    assert.equal(results.filter((r) => r.status === 201).length, 1, JSON.stringify(results.map((r) => r.status)));
    const prisma = await db();
    assert.equal(await prisma.workerLock.count({ where: { workerId: worker.id, lockStatus: "ACTIVE" } }), 1);
  });

  it("the concurrent-reservation limit holds under parallel requests", async () => {
    const prisma = await db();
    await prisma.platformConfig.upsert({
      where: { key: "lock_max_concurrent" }, update: { value: "2" }, create: { key: "lock_max_concurrent", value: "2" },
    });
    try {
      const { employer, token } = await freeEmployer();
      const workers = await Promise.all(Array.from({ length: 5 }, () => discoverableWorker()));
      await Promise.all(workers.map((w) =>
        call("POST", `/api/employer/workers/${w.id}/lock`, { token, body: { lock_days: 2 } })));
      assert.ok(await prisma.workerLock.count({ where: { employerId: employer.id, lockStatus: "ACTIVE" } }) <= 2);
      // Workers that weren't reserved must not be left flagged as locked.
      const stranded = await prisma.user.count({
        where: { id: { in: workers.map((w) => w.id) }, isLocked: true, workerLocksAsWorker: { none: { lockStatus: "ACTIVE" } } },
      });
      assert.equal(stranded, 0);
    } finally {
      await prisma.platformConfig.delete({ where: { key: "lock_max_concurrent" } });
    }
  });

  it("extensions are free and capped at the platform maximum duration", async () => {
    const { token } = await freeEmployer();
    const worker = await discoverableWorker();
    assert.equal((await call("POST", `/api/employer/workers/${worker.id}/lock`, { token, body: { lock_days: 7 } })).status, 201);
    const ok = await call("POST", `/api/employer/workers/${worker.id}/extend-lock`, { token, body: { additional_days: 7 } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.data.requiresPayment, false);
    const tooLong = await call("POST", `/api/employer/workers/${worker.id}/extend-lock`, { token, body: { additional_days: 1 } });
    assert.equal(tooLong.status, 400);
    assert.equal(tooLong.body.code, "MAX_DURATION");
  });

  it("re-reserving the same worker right after releasing is blocked by the cooldown", async () => {
    const { token } = await freeEmployer();
    const worker = await discoverableWorker();
    assert.equal((await call("POST", `/api/employer/workers/${worker.id}/lock`, { token, body: { lock_days: 2 } })).status, 201);
    const rel = await call("POST", `/api/employer/workers/${worker.id}/release-lock`, { token, body: {} });
    assert.equal(rel.status, 200, JSON.stringify(rel.body));
    const again = await call("POST", `/api/employer/workers/${worker.id}/lock`, { token, body: { lock_days: 2 } });
    assert.equal(again.status, 429);
    assert.equal(again.body.code, "RELOCK_COOLDOWN");
  });

  it("reservations still require a worker the employer may see", async () => {
    const prisma = await db();
    const { token } = await freeEmployer();
    const hidden = await createUser({ role: "WORKER" }); // VERIFIED but not searchable, no relationship
    await prisma.workerProfile.update({ where: { userId: hidden.id }, data: { isSearchable: false } });
    assert.equal((await call("POST", `/api/employer/workers/${hidden.id}/lock`, { token, body: { lock_days: 2 } })).status, 404);
  });
});

describe("free platform: workers", () => {
  it("applying to a job needs no payment", async () => {
    const { employer } = await freeEmployer();
    const job = await approvedJob(employer.id);
    const worker = await discoverableWorker();
    const token = (await login(worker.email)).token!;
    const r = await call("POST", `/api/jobs/${job.id}/apply`, { token, body: {} });
    assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
    assert.equal(r.body.data.requiresPayment, false);
    const prisma = await db();
    const app = await prisma.application.findFirstOrThrow({ where: { workerId: worker.id, jobId: job.id } });
    assert.equal(app.stripePaymentIntentId, null);
  });
});

describe("free platform: emails", () => {
  it("the cancellation email does not threaten loss of access", async () => {
    const { subscriptionCanceledTemplate } = await import("../src/services/email/templates");
    const t = subscriptionCanceledTemplate({ name: "Ana", accessUntil: new Date() });
    assert.ok(!/view-only|resubscribe/i.test(t.html + t.text), t.text);
    assert.match(t.text, /free/i);
  });
});
