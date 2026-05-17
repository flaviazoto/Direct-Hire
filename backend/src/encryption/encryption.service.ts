import crypto from "crypto";
import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from "@aws-sdk/client-kms";

const IV_BYTES       = 16;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES      = 32; // AES-256

// ── Local (dev) helpers ───────────────────────────────────────────────────────

function localKey(): Buffer {
  const hex = process.env.ENCRYPTION_LOCAL_KEY ?? "";
  if (hex.length !== 64)
    throw new Error("ENCRYPTION_LOCAL_KEY must be exactly 64 hex characters (32 bytes)");
  return Buffer.from(hex, "hex");
}

function localEncrypt(plaintext: string): string {
  const key = localKey();
  const iv  = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: iv (16) | authTag (16) | ciphertext
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function localDecrypt(ciphertext: string): string {
  const key = localKey();
  const buf = Buffer.from(ciphertext, "base64");
  const iv       = buf.subarray(0, IV_BYTES);
  const tag      = buf.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const payload  = buf.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(payload) + decipher.final("utf8");
}

// ── KMS (production) helpers ──────────────────────────────────────────────────

let _kmsClient: KMSClient | null = null;

function kmsClient(): KMSClient {
  if (!_kmsClient) {
    _kmsClient = new KMSClient({ region: process.env.AWS_REGION ?? "eu-west-1" });
  }
  return _kmsClient;
}

async function kmsEncrypt(plaintext: string): Promise<string> {
  const keyId = process.env.AWS_KMS_KEY_ID;
  if (!keyId) throw new Error("AWS_KMS_KEY_ID is not set");

  // GenerateDataKey returns a one-time AES-256 key (plaintext + encrypted copy)
  const { Plaintext, CiphertextBlob } = await kmsClient().send(
    new GenerateDataKeyCommand({ KeyId: keyId, KeySpec: "AES_256" }),
  );

  if (!Plaintext || !CiphertextBlob)
    throw new Error("KMS GenerateDataKey returned incomplete response");

  const dataKey = Buffer.from(Plaintext);
  const encDataKey = Buffer.from(CiphertextBlob);

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", dataKey.subarray(0, KEY_BYTES), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Wipe plaintext data key from memory immediately
  dataKey.fill(0);

  // Layout: encDataKey_len (4 BE) | encDataKey | iv (16) | authTag (16) | ciphertext
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(encDataKey.length, 0);

  return Buffer.concat([lenBuf, encDataKey, iv, tag, encrypted]).toString("base64");
}

async function kmsDecrypt(ciphertext: string): Promise<string> {
  const buf = Buffer.from(ciphertext, "base64");

  const encDataKeyLen = buf.readUInt32BE(0);
  let offset = 4;
  const encDataKey = buf.subarray(offset, offset + encDataKeyLen);
  offset += encDataKeyLen;
  const iv      = buf.subarray(offset, offset + IV_BYTES);
  offset += IV_BYTES;
  const tag     = buf.subarray(offset, offset + AUTH_TAG_BYTES);
  offset += AUTH_TAG_BYTES;
  const payload = buf.subarray(offset);

  const { Plaintext } = await kmsClient().send(
    new DecryptCommand({ CiphertextBlob: encDataKey }),
  );

  if (!Plaintext) throw new Error("KMS Decrypt returned no plaintext");

  const dataKey  = Buffer.from(Plaintext);
  const decipher = crypto.createDecipheriv("aes-256-gcm", dataKey.subarray(0, KEY_BYTES), iv);
  decipher.setAuthTag(tag);
  const result = decipher.update(payload) + decipher.final("utf8");

  dataKey.fill(0);
  return result;
}

// ── Public singleton ──────────────────────────────────────────────────────────

function provider(): "local" | "kms" {
  const p = process.env.ENCRYPTION_PROVIDER ?? "local";
  if (p !== "local" && p !== "kms")
    throw new Error(`Unknown ENCRYPTION_PROVIDER: "${p}". Must be "local" or "kms".`);
  return p;
}

export const EncryptionService = {
  async encrypt(plaintext: string): Promise<string> {
    return provider() === "kms" ? kmsEncrypt(plaintext) : localEncrypt(plaintext);
  },

  async decrypt(ciphertext: string): Promise<string> {
    return provider() === "kms" ? kmsDecrypt(ciphertext) : localDecrypt(ciphertext);
  },
};
