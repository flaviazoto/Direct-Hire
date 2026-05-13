// src/common/utils/otp.util.ts
import crypto from "crypto";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/**
 * Generate a cryptographically secure 6-digit OTP string.
 */
export function generateOTP(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Hash an OTP code with bcrypt.
 */
export async function hashOTP(code: string): Promise<string> {
  return bcrypt.hash(code, SALT_ROUNDS);
}

/**
 * Verify a plain OTP code against a bcrypt hash.
 */
export async function verifyOTP(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}
