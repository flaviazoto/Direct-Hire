// backend/tests/privacy.test.ts
// Regression tests for worker privacy and uploads (audit findings C-1,
// EM-02..05, MS-01, M-7, UP-02, plus sensitive-document access logging).

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer, resetDatabase, db, call, login, createUser } from "./helpers/harness";

before(async () => {
  await resetDatabase();
  await startServer();
});
after(stopServer);

type User = Awaited<ReturnType<typeof createUser>>;

async function makeWorker(opts: { searchable?: boolean; accountStatus?: "VERIFIED" | "PENDING_REVIEW" | "SUSPENDED"; docsVerified?: boolean } = {}) {
  const prisma = await db();
  const user = await createUser({ role: "WORKER", accountStatus: opts.accountStatus ?? "VERIFIED" });
  await prisma.workerProfile.update({
    where: { userId: user.id },
    data:  {
      isSearchable: opts.searchable ?? true,
      documentsVerified: opts.docsVerified ?? true,
      profession: "Welder",
      maritalStatus: "MARRIED",
      numberOfChildren: 2,
      phone: null,
    },
  });
  return user;
}

async function makeUpload(user: User, fileType: "PROFILE_PHOTO" | "INTRO_VIDEO" | "MEDICAL_CERTIFICATE" | "OTHER", isPrivate = true) {
  const prisma = await db();
  return prisma.upload.create({
    data: {
      userId: user.id, fileType, fileName: `${fileType}.bin`, fileUrl: `/uploads/${user.id}/${fileType}`,
      filePath: `${user.id}/${fileType}`, mimeType: "application/pdf", sizeBytes: 10, status: "UPLOADED", isPrivate,
    },
  });
}

async function makeApplication(worker: User, employer: User, workflowStatus?: "CLEARED_FOR_EMPLOYER") {
  const prisma = await db();
  const job = await prisma.jobPost.create({
    data: {
      employerId: employer.id, title: "Welder", companyName: "Test Co",
      description: "x".repeat(120), requirements: "x".repeat(60), country: "DE", city: "Berlin",
      salaryMin: 30000, salaryMax: 40000, contractType: "FULL_TIME", experienceRequired: 1,
      category: "Trades", requiredSkills: ["welding"], status: "APPROVED",
    },
  });
  return prisma.application.create({
    data: { workerId: worker.id, jobId: job.id, employerId: employer.id, status: "APPLIED", ...(workflowStatus ? { workflowStatus } : {}) },
  });
}

async function employerSession() {
  const employer = await createUser({ role: "EMPLOYER" });
  return { employer, token: (await login(employer.email)).token! };
}

describe("employer worker directory", () => {
  it("lists only verified, searchable, active workers and never exposes email", async () => {
    const visible     = await makeWorker();
    const unverified  = await makeWorker({ accountStatus: "PENDING_REVIEW" });
    const optedOut    = await makeWorker({ searchable: false });
    const suspended   = await makeWorker({ accountStatus: "SUSPENDED" });
    const { token }   = await employerSession();

    const r = await call("GET", "/api/employer/workers?limit=100", { token });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const ids = r.body.data.map((w: { userId: string }) => w.userId);
    assert.ok(ids.includes(visible.id));
    for (const hidden of [unverified, optedOut, suspended]) assert.ok(!ids.includes(hidden.id), `${hidden.email} should be hidden`);
    assert.ok(!JSON.stringify(r.body).includes("@"), "directory response must not contain email addresses");
  });

  it("cannot be searched by email address", async () => {
    const worker = await makeWorker();
    const { token } = await employerSession();
    const r = await call("GET", `/api/employer/workers?search=${encodeURIComponent(worker.email.split("@")[0])}`, { token });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.filter((w: { userId: string }) => w.userId === worker.id).length, 0);
  });

  it("filters cannot widen the base set", async () => {
    const hidden = await makeWorker({ accountStatus: "PENDING_REVIEW" });
    const { token } = await employerSession();
    const r = await call("GET", "/api/employer/workers?country=&search=Test&limit=100", { token });
    assert.ok(!r.body.data.some((w: { userId: string }) => w.userId === hidden.id));
  });
});

describe("employer worker detail", () => {
  it("hides contact details, family data and sensitive documents", async () => {
    const worker = await makeWorker();
    await makeUpload(worker, "PROFILE_PHOTO", false);
    await makeUpload(worker, "INTRO_VIDEO");
    await makeUpload(worker, "MEDICAL_CERTIFICATE");
    await makeUpload(worker, "OTHER");
    const { token } = await employerSession();

    const r = await call("GET", `/api/employer/workers/${worker.id}`, { token });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const d = r.body.data;
    assert.equal(d.email, null);
    assert.equal(d.phone, null);
    assert.equal(d.contact_released, false);
    assert.equal(d.can_message, false);
    assert.ok(!("marital_status" in d) && !("number_of_children" in d));
    const types = d.documents.map((x: { file_type: string }) => x.file_type).sort();
    assert.deepEqual(types, ["INTRO_VIDEO", "PROFILE_PHOTO"]);
    assert.ok(!JSON.stringify(d).includes(worker.email));
  });

  it("returns 404 for workers who are not discoverable and have no relationship", async () => {
    const { token } = await employerSession();
    for (const w of [await makeWorker({ accountStatus: "PENDING_REVIEW" }), await makeWorker({ searchable: false }), await makeWorker({ accountStatus: "SUSPENDED" })]) {
      assert.equal((await call("GET", `/api/employer/workers/${w.id}`, { token })).status, 404);
    }
    assert.equal((await call("GET", `/api/employer/workers/does-not-exist`, { token })).status, 404);
  });

  it("an applicant is visible to that employer even if not searchable, but not to others", async () => {
    const worker = await makeWorker({ searchable: false });
    const mine = await employerSession();
    const other = await employerSession();
    await makeApplication(worker, mine.employer);
    const r = await call("GET", `/api/employer/workers/${worker.id}`, { token: mine.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.can_message, true);
    assert.equal((await call("GET", `/api/employer/workers/${worker.id}`, { token: other.token })).status, 404);
  });

  it("releases contact details only once the application is CLEARED_FOR_EMPLOYER", async () => {
    const worker = await makeWorker();
    const { employer, token } = await employerSession();
    await makeApplication(worker, employer, "CLEARED_FOR_EMPLOYER");
    const r = await call("GET", `/api/employer/workers/${worker.id}`, { token });
    assert.equal(r.body.data.contact_released, true);
    assert.equal(r.body.data.email, worker.email);
  });

  it("adding a hidden worker to a group does not grant access", async () => {
    const worker = await makeWorker({ accountStatus: "PENDING_REVIEW" });
    const { token } = await employerSession();
    const add = await call("POST", "/api/employer/worker-groups/members", { token, body: { workerId: worker.id } });
    assert.equal(add.status, 404);
    assert.equal((await call("GET", `/api/employer/workers/${worker.id}`, { token })).status, 404);
  });

  it("application and group responses do not include worker emails", async () => {
    const worker = await makeWorker();
    const { employer, token } = await employerSession();
    await makeApplication(worker, employer);
    await call("POST", "/api/employer/worker-groups/members", { token, body: { workerId: worker.id } });
    for (const p of ["/api/employer/applications", "/api/employer/worker-groups/me"]) {
      const r = await call("GET", p, { token });
      assert.equal(r.status, 200, `${p}: ${JSON.stringify(r.body)}`);
      assert.ok(!JSON.stringify(r.body).includes(worker.email), `${p} leaked the worker email`);
    }
  });
});

describe("messaging", () => {
  it("employers can only message workers they are recruiting", async () => {
    const stranger = await makeWorker();
    const applicant = await makeWorker();
    const { employer, token } = await employerSession();
    await makeApplication(applicant, employer);
    const cold = await call("POST", "/api/employer/message-worker", { token, body: { workerId: stranger.id, message: "hi" } });
    assert.equal(cold.status, 403);
    assert.equal(cold.body.code, "NO_RECRUITMENT_RELATIONSHIP");
    const ok = await call("POST", "/api/employer/message-worker", { token, body: { workerId: applicant.id, message: "Hello <b>there</b>" } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
  });

  it("workers can only reply to someone who messaged them first", async () => {
    const worker = await makeWorker();
    const workerToken = (await login(worker.email)).token!;
    const randomUser = await createUser({ role: "EMPLOYER" });
    const cold = await call("POST", `/api/worker/messages/${randomUser.id}/reply`, { token: workerToken, body: { body: "spam" } });
    assert.equal(cold.status, 404);

    const prisma = await db();
    await prisma.message.create({ data: { senderId: randomUser.id, recipientId: worker.id, body: "Are you available?" } });
    const reply = await call("POST", `/api/worker/messages/${randomUser.id}/reply`, { token: workerToken, body: { body: "Yes" } });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
  });

  it("escapes HTML in the employer message email", async () => {
    const { escapeHtml } = await import("../src/lib/html");
    assert.equal(escapeHtml(`<a href="x">Co</a> & 'Sons'`), "&lt;a href=&quot;x&quot;&gt;Co&lt;/a&gt; &amp; &#39;Sons&#39;");
  });
});

describe("upload content validation", () => {
  const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
  const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  function form(fileType: string, buf: Buffer, mime: string, name: string) {
    const f = new FormData();
    f.append("fileType", fileType);
    f.append("file", new Blob([buf], { type: mime }), name);
    return f;
  }
  async function upload(token: string, f: FormData) {
    const r = await fetch(`${process.env.BACKEND_URL}/api/uploads`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: f });
    return { status: r.status, body: await r.json() };
  }

  it("rejects HTML disguised as an image and accepts a real PNG", async () => {
    const worker = await makeWorker();
    const token = (await login(worker.email)).token!;
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    assert.equal((await upload(token, form("PROFILE_PHOTO", html, "image/png", "x.png"))).status, 422);
    const real = await upload(token, form("PROFILE_PHOTO", PNG, "image/png", "p.png"));
    assert.equal(real.status, 201, JSON.stringify(real.body));
  });

  it("rejects a PNG labelled as a PDF and accepts a real PDF", async () => {
    const worker = await makeWorker();
    const token = (await login(worker.email)).token!;
    assert.equal((await upload(token, form("MEDICAL_CERTIFICATE", PNG, "application/pdf", "m.pdf"))).status, 422);
    assert.equal((await upload(token, form("MEDICAL_CERTIFICATE", PDF, "application/pdf", "m.pdf"))).status, 201);
  });

  it("rejects SVG company logos", async () => {
    const employer = await createUser({ role: "EMPLOYER" });
    const token = (await login(employer.email)).token!;
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`);
    assert.equal((await upload(token, form("COMPANY_LOGO", svg, "image/svg+xml", "l.svg"))).status, 422);
  });

  it("other workers and employers cannot fetch a worker's private file", async () => {
    const owner = await makeWorker();
    const file = await makeUpload(owner, "MEDICAL_CERTIFICATE");
    const otherWorker = await makeWorker();
    const { token: employerToken } = await employerSession();
    for (const token of [(await login(otherWorker.email)).token!, employerToken]) {
      assert.equal((await call("GET", `/api/uploads/${file.id}/url`, { token })).status, 404);
    }
  });
});

describe("sensitive document access is audited", () => {
  it("records admin views of a worker's private documents", async () => {
    const worker = await makeWorker();
    const cert = await makeUpload(worker, "MEDICAL_CERTIFICATE");
    const admin = await createUser({ role: "ADMIN" });
    const token = (await login(admin.email)).token!;

    assert.equal((await call("GET", `/api/admin/workers/${worker.id}/documents`, { token })).status, 200);
    assert.equal((await call("GET", `/api/uploads/${cert.id}/url`, { token })).status, 200);

    const prisma = await db();
    const rows = await prisma.auditLog.findMany({ where: { action: "SENSITIVE_DATA_VIEWED", userId: worker.id, actorId: admin.id } });
    const contexts = rows.map((r) => (r.newValue as { context: string }).context).sort();
    assert.deepEqual(contexts, ["admin.workerDocuments", "uploads.getUrl"]);
    assert.ok(rows.every((r) => JSON.stringify(r.newValue).includes(cert.id)));
  });
});

describe("data integrity", () => {
  it("deleting a worker account keeps job application counts correct", async () => {
    const prisma = await db();
    const worker = await makeWorker();
    const { employer } = await employerSession();
    const app = await makeApplication(worker, employer);
    await prisma.jobPost.update({ where: { id: app.jobId }, data: { applicationCount: 1 } });
    const token = (await login(worker.email)).token!;
    assert.equal((await call("DELETE", "/api/auth/account", { token, body: {} })).status, 200);
    assert.equal((await prisma.jobPost.findUniqueOrThrow({ where: { id: app.jobId } })).applicationCount, 0);
  });

  it("the database itself rejects case-variant duplicate emails (CITEXT)", async () => {
    const prisma = await db();
    const user = await createUser();
    await assert.rejects(prisma.user.create({ data: { email: user.email.toUpperCase(), passwordHash: "x", role: "WORKER" } }));
  });
});
