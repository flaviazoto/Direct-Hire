// backend/src/lib/encrypt.ts
// AES-256-GCM encryption for sensitive DB fields (passport numbers, admin IDs)
import crypto from "crypto";

const ALG       = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be 64 hex chars (32 bytes). Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv  = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv(12) + tag(16) + ciphertext — all base64url encoded
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decrypt(encoded: string): string {
  const key  = getKey();
  const data = Buffer.from(encoded, "base64url");
  const iv   = data.subarray(0, IV_LENGTH);
  const tag  = data.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ct   = data.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function maskSensitive(value: string | null | undefined): string {
  if (!value) return "—";
  return "••••••" + value.slice(-3);
}
