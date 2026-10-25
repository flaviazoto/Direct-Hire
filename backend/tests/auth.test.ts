// backend/tests/auth.test.ts
// Regression tests for the authentication and access-control repairs
// (audit findings H-1, L-2, M-1, M-5, L-3, M-6, GD-02, L-1, L-5, OAuth role).

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  startServer, stopServer, resetDatabase, db, call, login, createUser,
  mintAccessToken, refreshCookie, uniqueEmail, PASSWORD,
} from "./helpers/harness";

before(async () => {
  await resetDatabase();
  await startServer();
});
after(stopServer);

describe("suspension", () => {
  it("blocks existing access tokens, refresh and new logins, and reinstatement restores access", async () => {
    const admin  = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });
    const adminToken = (await login(admin.email)).token!;
    const before = await login(worker.email);
    assert.equal(before.status, 200);
    assert.equal((await call("GET", "/api/user/profile", { token: before.token })).status, 200);

    const susp = await call("POST", `/api/admin/users/${worker.id}/suspend`, { token: adminToken, body: { reason: "regression test" } });
    assert.equal(susp.status, 200, JSON.stringify(susp.body));

    const oldToken = await call("GET", "/api/user/profile", { token: before.token });
    assert.equal(oldToken.status, 403, "existing access token must stop working immediately");
    assert.equal(oldToken.body.accountStatus, "SUSPENDED");

    const refreshed = await call("POST", "/api/auth/refresh", { cookie: before.refresh });
    assert.ok([401, 403].includes(refreshed.status), `refresh must fail, got ${refreshed.status}`);

    const relogin = await login(worker.email);
    assert.equal(relogin.status, 403);
    assert.equal(relogin.token, undefined);

    const reinstate = await call("POST", `/api/admin/users/${worker.id}/reinstate`, { token: adminToken, body: {} });
    assert.equal(reinstate.status, 200);
    const after = await login(worker.email);
    assert.equal(after.status, 200);
    assert.equal((await call("GET", "/api/user/profile", { token: after.token })).status, 200);
  });

  it("admins cannot suspend themselves or another admin", async () => {
    const admin  = await createUser({ role: "ADMIN" });
    const other  = await createUser({ role: "ADMIN" });
    const token  = (await login(admin.email)).token!;
    assert.equal((await call("POST", `/api/admin/users/${admin.id}/suspend`, { token, body: { reason: "self" } })).status, 400);
    assert.equal((await call("POST", `/api/admin/users/${other.id}/suspend`, { token, body: { reason: "admin" } })).status, 400);
  });

  it("the legacy PATCH suspend endpoint is gone", async () => {
    const admin  = await createUser({ role: "ADMIN" });
    const worker = await createUser();
    const token  = (await login(admin.email)).token!;
    const r = await call("PATCH", `/api/admin/users/${worker.id}/suspend`, { token });
    assert.equal(r.status, 404);
  });
});

describe("email verification", () => {
  it("registration issues no token, session or refresh cookie", async () => {
    const email = uniqueEmail("reg");
    const r = await call("POST", "/api/auth/register", {
      body: { firstName: "Reg", lastName: "Test", email, password: PASSWORD, confirmPassword: PASSWORD, role: "WORKER", acceptedTerms: true },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data.accessToken, undefined);
    assert.equal(r.body.data.token, undefined);
    assert.equal(refreshCookie(r.setCookies), "");
    const prisma = await db();
    const user = await prisma.user.findFirstOrThrow({ where: { email } });
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
  });

  it("a token held by an unverified account cannot reach protected routes", async () => {
    const user  = await createUser({ accountStatus: "PENDING_EMAIL_VERIFICATION" });
    const token = await mintAccessToken(user); // e.g. issued by the old register flow
    const r = await call("GET", "/api/user/profile", { token });
    assert.equal(r.status, 403);
    assert.equal(r.body.accountStatus, "PENDING_EMAIL_VERIFICATION");
  });
});

describe("logout and sessions", () => {
  it("sets the refresh cookie on /api/auth so logout receives it", async () => {
    const user = await createUser();
    const l = await login(user.email);
    const cookie = l.setCookies.find((c) => c.startsWith("dh_refresh="))!;
    assert.match(cookie, /Path=\/api\/auth(;|$)/);
    assert.match(cookie, /HttpOnly/);
  });

  it("logout revokes the server session so the refresh token is dead", async () => {
    const user = await createUser();
    const l = await login(user.email);
    const out = await call("POST", "/api/auth/logout", { cookie: l.refresh });
    assert.equal(out.status, 200);
    const prisma = await db();
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
    const r = await call("POST", "/api/auth/refresh", { cookie: l.refresh });
    assert.equal(r.status, 401);
  });

  it("refresh works when the browser also sends a stale legacy-path cookie", async () => {
    const user = await createUser();
    const l = await login(user.email);
    const stale = "dh_refresh=stale.legacy.token";
    const r = await call("POST", "/api/auth/refresh", { cookie: `${stale}; ${l.refresh}` });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.data.accessToken);
  });

  it("a rotated refresh token cannot be reused", async () => {
    const user = await createUser();
    const l = await login(user.email);
    assert.equal((await call("POST", "/api/auth/refresh", { cookie: l.refresh })).status, 200);
    assert.equal((await call("POST", "/api/auth/refresh", { cookie: l.refresh })).status, 401);
  });

  it("several logins in the same second all succeed with distinct sessions", async () => {
    const user = await createUser();
    const results = await Promise.all([login(user.email), login(user.email), login(user.email)]);
    assert.deepEqual(results.map((r) => r.status), [200, 200, 200]);
    assert.equal(new Set(results.map((r) => r.refresh)).size, 3);
    const prisma = await db();
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 3);
  });
});

describe("OTP endpoints do not reveal which emails have accounts", () => {
  async function timed(fn: () => Promise<unknown>) {
    const t = performance.now(); await fn(); return performance.now() - t;
  }
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];

  it("verify-email-code: same status and body for unknown and existing emails, similar timing", async () => {
    const existing = await createUser({ accountStatus: "PENDING_EMAIL_VERIFICATION" });
    await call("POST", "/api/auth/send-verification-code", { body: { email: existing.email } });
    const unknown = uniqueEmail("nobody");

    const a = await call("POST", "/api/auth/verify-email-code", { body: { email: unknown, code: "000000" } });
    const b = await call("POST", "/api/auth/verify-email-code", { body: { email: existing.email, code: "000000" } });
    assert.equal(a.status, b.status);
    assert.deepEqual(a.body, b.body);
    assert.equal(a.status, 400);

    const ta: number[] = [], tb: number[] = [];
    for (let i = 0; i < 3; i++) {
      ta.push(await timed(() => call("POST", "/api/auth/verify-email-code", { body: { email: unknown, code: "000001" } })));
      tb.push(await timed(() => call("POST", "/api/auth/verify-email-code", { body: { email: existing.email, code: "000001" } })));
    }
    assert.ok(Math.abs(median(ta) - median(tb)) < 150, `timing gap too large: ${median(ta).toFixed(0)}ms vs ${median(tb).toFixed(0)}ms`);
  });

  it("send-verification-code: same response for unknown, already-verified and unverified emails", async () => {
    const verified   = await createUser();
    const unverified = await createUser({ accountStatus: "PENDING_EMAIL_VERIFICATION" });
    const rs = await Promise.all([uniqueEmail("nobody"), verified.email, unverified.email]
      .map((email) => call("POST", "/api/auth/send-verification-code", { body: { email } })));
    for (const r of rs) {
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, rs[0].body);
    }
  });

  it("caps verification attempts even under concurrent guesses", async () => {
    const user = await createUser({ accountStatus: "PENDING_EMAIL_VERIFICATION" });
    await call("POST", "/api/auth/send-verification-code", { body: { email: user.email } });
    await Promise.all(Array.from({ length: 12 }, (_, i) =>
      call("POST", "/api/auth/verify-email-code", { body: { email: user.email, code: String(100000 + i) } })));
    const prisma = await db();
    const code = await prisma.verificationCode.findFirstOrThrow({ where: { userId: user.id, usedAt: null } });
    assert.ok(code.attempts <= 5, `attempts=${code.attempts}`);
  });
});

describe("email normalization", () => {
  it("stores emails lowercased and rejects case-variant duplicates", async () => {
    const base  = uniqueEmail("CaseTest");
    const mixed = base.replace(/^c/, "C").replace("@test", "@TEST");
    const body  = (email: string) => ({ firstName: "C", lastName: "T", email, password: PASSWORD, confirmPassword: PASSWORD, role: "WORKER", acceptedTerms: true });
    const first = await call("POST", "/api/auth/register", { body: body(mixed) });
    assert.equal(first.status, 201);
    assert.equal(first.body.data.email, mixed.toLowerCase());
    const dup = await call("POST", "/api/auth/register", { body: body(mixed.toLowerCase()) });
    assert.equal(dup.status, 409);
  });

  it("legacy mixed-case rows can still sign in with any casing", async () => {
    const stored = uniqueEmail("Legacy").replace(/^l/, "L");
    const user = await createUser({ email: stored });
    assert.equal((await login(stored.toLowerCase())).status, 200);
    assert.equal((await login(stored.toUpperCase())).status, 200);
    assert.ok(user.email !== user.email.toLowerCase());
  });
});

describe("account deletion requires recent authentication", () => {
  it("an old session alone cannot delete the account", async () => {
    const user  = await createUser();
    const token = await mintAccessToken(user, { authTime: Math.floor(Date.now() / 1000) - 3600 });
    const r = await call("DELETE", "/api/auth/account", { token, body: {} });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, "REAUTH_REQUIRED");
    const legacy = await mintAccessToken(user); // tokens issued before authTime existed
    assert.equal((await call("DELETE", "/api/auth/account", { token: legacy, body: {} })).status, 401);
    const prisma = await db();
    assert.ok(await prisma.user.findUnique({ where: { id: user.id } }));
  });

  it("a wrong password is rejected; the right one deletes", async () => {
    const user  = await createUser();
    const token = await mintAccessToken(user, { authTime: Math.floor(Date.now() / 1000) - 3600 });
    assert.equal((await call("DELETE", "/api/auth/account", { token, body: { password: "Wrong12345" } })).status, 401);
    assert.equal((await call("DELETE", "/api/auth/account", { token, body: { password: PASSWORD } })).status, 200);
    const prisma = await db();
    assert.equal(await prisma.user.findUnique({ where: { id: user.id } }), null);
  });

  it("a fresh sign-in (e.g. Google, no password) may delete without a password", async () => {
    const user = await createUser();
    const { token } = await login(user.email);
    assert.equal((await call("DELETE", "/api/auth/account", { token, body: {} })).status, 200);
  });

  it("authTime survives refresh unchanged, so refreshing does not count as re-authentication", async () => {
    const user = await createUser();
    const l = await login(user.email);
    const r = await call("POST", "/api/auth/refresh", { cookie: l.refresh });
    const decode = (t: string) => JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());
    assert.equal(decode(r.body.data.accessToken).authTime, decode(l.token!).authTime);
  });
});

describe("token types", () => {
  it("an OAuth handoff token is not accepted as an access token", async () => {
    const user  = await createUser();
    const token = await mintAccessToken(user, { handoff: true });
    assert.equal((await call("GET", "/api/user/profile", { token })).status, 401);
  });
});

describe("OAuth role escalation", () => {
  it("selfServiceRole never yields ADMIN", async () => {
    const { selfServiceRole } = await import("../src/routes/oauth.handler");
    for (const raw of ["admin", "ADMIN", "Admin", "", undefined, "superuser"]) assert.equal(selfServiceRole(raw), "WORKER");
    assert.equal(selfServiceRole("employer"), "EMPLOYER");
    assert.equal(selfServiceRole("WORKER"), "WORKER");
  });

  it("a new OAuth user requested as admin is created as a worker", async () => {
    const { findOrCreateOAuthUser } = await import("../src/routes/oauth.handler");
    const email = uniqueEmail("Oauth").replace(/^o/, "O");
    const user = await findOrCreateOAuthUser({
      provider: "google", providerId: `g-${Date.now()}`, email, emailVerified: true, firstName: "O", lastName: "A", role: "admin" as never,
    });
    assert.equal(user.role, "WORKER");
    assert.equal(user.email, email.toLowerCase());
  });
});

describe("email matching is exact (no LIKE wildcards)", () => {
  it("_ and % in a login email do not match other accounts", async () => {
    const user = await createUser({ email: uniqueEmail("axb") });
    const wildcard = user.email.replace(/^axb/, "a_b");
    assert.equal((await login(wildcard)).status, 401);
    assert.equal((await login(user.email)).status, 200);
  });

  it("an OAuth email containing wildcards does not link to an existing account", async () => {
    const { findOrCreateOAuthUser } = await import("../src/routes/oauth.handler");
    const victim = await createUser({ email: uniqueEmail("victim") });
    const crafted = victim.email.replace(/^victim/, "v_ctim");
    const created = await findOrCreateOAuthUser({
      provider: "google", providerId: `g-wild-${Date.now()}`, email: crafted, emailVerified: true, firstName: "X", lastName: "Y",
    });
    assert.notEqual(created.id, victim.id);
    const prisma = await db();
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: victim.id } })).googleId, null);
  });

  it("OAuth refuses an email the provider has not verified", async () => {
    const { findOrCreateOAuthUser, OAuthEmailUnverifiedError } = await import("../src/routes/oauth.handler");
    const existing = await createUser();
    await assert.rejects(
      findOrCreateOAuthUser({ provider: "linkedin", providerId: `li-${Date.now()}`, email: existing.email, emailVerified: false, firstName: "A", lastName: "B" }),
      OAuthEmailUnverifiedError,
    );
    const prisma = await db();
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: existing.id } })).linkedinId, null);
  });
});
