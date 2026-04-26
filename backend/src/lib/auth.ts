// backend/src/lib/auth.ts
import { SignJWT, jwtVerify } from "jose";
import { Request, Response } from "express";
import crypto from "crypto";

export type Role = "WORKER" | "EMPLOYER" | "ADMIN";

export interface JwtPayload {
  sub:   string;
  email: string;
  role:  Role;
  iat?:  number;
  exp?:  number;
}

const accessSecret  = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET!);
const refreshSecret = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!);

const ACCESS_EXP  = process.env.JWT_ACCESS_EXPIRES_IN  ?? "15m";
const REFRESH_EXP = process.env.JWT_REFRESH_EXPIRES_IN ?? "30d";

export const COOKIE_ACCESS  = "dh_access";
export const COOKIE_REFRESH = "dh_refresh";

type CookieSameSite = "lax" | "strict" | "none";

function getCookiePolicy(): { sameSite: CookieSameSite; secure: boolean } {
  const isProd = process.env.NODE_ENV === "production";
  const envSameSite = process.env.COOKIE_SAMESITE?.toLowerCase();
  const sameSite: CookieSameSite =
    envSameSite === "none" || envSameSite === "strict" || envSameSite === "lax"
      ? envSameSite
      : "lax";
  const envSecure = process.env.COOKIE_SECURE;
  const secure = sameSite === "none"
    ? true
    : envSecure !== undefined
      ? envSecure === "true"
      : isProd;

  return { sameSite, secure };
}

// ── Token signing ─────────────────────────────────────────────
export async function signAccessToken(payload: Omit<JwtPayload, "iat" | "exp">): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXP)
    .sign(accessSecret);
}

export async function signRefreshToken(payload: Omit<JwtPayload, "iat" | "exp">): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_EXP)
    .sign(refreshSecret);
}

// ── Token verification ────────────────────────────────────────
export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, accessSecret);
  return payload as unknown as JwtPayload;
}

export async function verifyRefreshToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, refreshSecret);
  return payload as unknown as JwtPayload;
}

// ── Cookie helpers ────────────────────────────────────────────
export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const { sameSite, secure } = getCookiePolicy();

  res.cookie(COOKIE_ACCESS, accessToken, {
    httpOnly: true,
    sameSite,
    secure,
    maxAge:   15 * 60 * 1000,
  });

  res.cookie(COOKIE_REFRESH, refreshToken, {
    httpOnly: true,
    sameSite,
    secure,
    maxAge:   30 * 24 * 60 * 60 * 1000,
    path:     "/api/auth/refresh",
  });
}

export function clearAuthCookies(res: Response) {
  const { sameSite, secure } = getCookiePolicy();

  res.clearCookie(COOKIE_ACCESS, {
    httpOnly: true,
    sameSite,
    secure,
  });

  res.clearCookie(COOKIE_REFRESH, {
    httpOnly: true,
    sameSite,
    secure,
    path:     "/api/auth/refresh",
  });
}
// ── Handoff token (short-lived JWT for OAuth URL redirect) ────
export async function issueHandoffToken(payload: Omit<JwtPayload, "iat" | "exp">): Promise<string> {
  return new SignJWT({ ...payload as Record<string, unknown>, handoff: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(accessSecret);
}

export async function verifyHandoffToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, accessSecret);
  if (!(payload as Record<string, unknown>).handoff) throw new Error("Not a handoff token");
  return payload as unknown as JwtPayload;
}

// ── Crypto helpers ────────────────────────────────────────────
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function tokenExpiresAt(hours: number): Date {
  return new Date(Date.now() + hours * 3_600_000);
}
