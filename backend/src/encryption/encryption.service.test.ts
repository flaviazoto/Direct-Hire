import { describe, it, expect, beforeAll, afterAll } from "vitest";

// ── Local mode ────────────────────────────────────────────────────────────────

describe("EncryptionService — local mode", () => {
  const originalProvider = process.env.ENCRYPTION_PROVIDER;
  const originalKey      = process.env.ENCRYPTION_LOCAL_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_PROVIDER  = "local";
    // Fixed 32-byte hex key for deterministic tests
    process.env.ENCRYPTION_LOCAL_KEY = "0".repeat(64);
  });

  afterAll(() => {
    process.env.ENCRYPTION_PROVIDER  = originalProvider;
    process.env.ENCRYPTION_LOCAL_KEY = originalKey;
  });

  // Re-import inside tests so env is already set when module evaluates
  async function getService() {
    const mod = await import("./encryption.service");
    return mod.EncryptionService;
  }

  it("roundtrip — encrypts then decrypts back to original", async () => {
    const svc = await getService();
    const original = "Hello, world!";
    const ct = await svc.encrypt(original);
    const pt = await svc.decrypt(ct);
    expect(pt).toBe(original);
  });

  it("roundtrip — handles empty string", async () => {
    const svc = await getService();
    const ct = await svc.encrypt("");
    const pt = await svc.decrypt(ct);
    expect(pt).toBe("");
  });

  it("roundtrip — handles unicode / passport data", async () => {
    const svc = await getService();
    const original = "Ünïcödé pàssport: 🛂 №1234567";
    const ct = await svc.encrypt(original);
    const pt = await svc.decrypt(ct);
    expect(pt).toBe(original);
  });

  it("roundtrip — handles long strings", async () => {
    const svc = await getService();
    const original = "x".repeat(10_000);
    const ct = await svc.encrypt(original);
    const pt = await svc.decrypt(ct);
    expect(pt).toBe(original);
  });

  it("produces valid base64 output", async () => {
    const svc = await getService();
    const ct = await svc.encrypt("test");
    expect(() => Buffer.from(ct, "base64")).not.toThrow();
  });

  it("produces different ciphertext each call (random IV)", async () => {
    const svc = await getService();
    const ct1 = await svc.encrypt("same plaintext");
    const ct2 = await svc.encrypt("same plaintext");
    expect(ct1).not.toBe(ct2);
  });

  it("throws on wrong key length", async () => {
    process.env.ENCRYPTION_LOCAL_KEY = "tooshort";
    const svc = await getService();
    await expect(svc.encrypt("x")).rejects.toThrow("ENCRYPTION_LOCAL_KEY");
    // Restore
    process.env.ENCRYPTION_LOCAL_KEY = "0".repeat(64);
  });
});
