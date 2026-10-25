// backend/src/lib/auth.ts
import { SignJWT, jwtVerify } from "jose";
import { Request, Response } from "express";
import crypto from "crypto";

export type Role = "WORKER" | "EMPLOYER" | "ADMIN";

export interface JwtPayload {
  sub:   string;
  email: string;
  role:  Role;
  // Unix seconds of the last interactive sign-in (password or OAuth). Refresh
  // carries it forward unchanged, so it ages even while the session is renewed.
  authTime?: number;
  iat?:  number;
  exp?:  number;
}

const accessSecret  = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET!);
const refreshSecret = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!);

const ACCESS_EXP  = process.env.JWT_ACCESS_EXPIRES_IN  ?? "15m";
const REFRESH_EXP = process.env.JWT_REFRESH_EXPIRES_IN ?? "30d";

export const COOKIE_ACCESS  = "dh_access";
export const COOKIE_REFRESH = "dh_refresh";

const REFRESH_COOKIE_PATH        = "/api/auth";
// Cookies issued before the path change; cleared alongside the current one.
const LEGACY_REFRESH_COOKIE_PATH = "/api/auth/refresh";

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
// Every token gets a random jti: two tokens minted for the same user in the
// same second would otherwise be byte-identical and collide on the unique
// Session.refreshToken column.
export async function signAccessToken(payload: Omit<JwtPayload, "iat" | "exp">): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXP)
    .sign(accessSecret);
}

export async function signRefreshToken(payload: Omit<JwtPayload, "iat" | "exp">): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(REFRESH_EXP)
    .sign(refreshSecret);
}

/** Payload for a fresh interactive sign-in. */
export function freshAuthPayload(user: { id: string; email: string; role: string }): Omit<JwtPayload, "iat" | "exp"> {
  return { sub: user.id, email: user.email, role: user.role as Role, authTime: Math.floor(Date.now() / 1000) };
}

/** True when the token holder signed in interactively within maxAgeSeconds. */
export function isRecentAuth(payload: JwtPayload, maxAgeSeconds: number): boolean {
  return typeof payload.authTime === "number" && Date.now() / 1000 - payload.authTime <= maxAgeSeconds;
}

// ── Token verification ────────────────────────────────────────
export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, accessSecret);
  // OAuth handoff tokens share the access secret; they may only be exchanged
  // via /auth/oauth/complete, never used as a bearer token.
  if ((payload as Record<string, unknown>).handoff) throw new Error("Handoff token is not an access token");
  return payload as unknown as JwtPayload;
}

export async function verifyRefreshToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, refreshSecret);
  return payload as unknown as JwtPayload;
}

// ── Cookie helpers ────────────────────────────────────────────
// Only dh_refresh is set as a cookie — the access token travels in the JSON
// response body / Authorization header only. Setting just one cookie means
// each auth response carries exactly one Set-Cookie header, avoiding proxy
// layers (e.g. the Next.js rewrite bridging directhire.cc -> api.directhire.cc)
// that mishandle/coalesce multiple Set-Cookie headers on one response.
export function setAuthCookies(res: Response, _accessToken: string, refreshToken: string) {
  const { sameSite, secure } = getCookiePolicy();

  res.cookie(COOKIE_REFRESH, refreshToken, {
    httpOnly: true,
    sameSite,
    secure,
    maxAge:   30 * 24 * 60 * 60 * 1000,
    // /api/auth (not /api/auth/refresh) so the browser also sends it to
    // /api/auth/logout, which needs it to revoke the server-side session.
    path:     REFRESH_COOKIE_PATH,
  });
}

export function clearAuthCookies(res: Response) {
  const { sameSite, secure } = getCookiePolicy();

  for (const path of [REFRESH_COOKIE_PATH, LEGACY_REFRESH_COOKIE_PATH]) {
    res.clearCookie(COOKIE_REFRESH, { httpOnly: true, sameSite, secure, path });
  }
}
/**
 * Every dh_refresh value the browser sent. During the cookie-path migration a
 * browser can hold both the legacy /api/auth/refresh cookie and the current
 * /api/auth one; cookie-parser keeps only the first (the more specific, stale
 * path), so callers try each candidate instead.
 */
export function readRefreshTokens(req: Request): string[] {
  const header = req.headers.cookie ?? "";
  const values = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE_REFRESH}=`))
    .map((part) => {
      const raw = part.slice(COOKIE_REFRESH.length + 1);
      try { return decodeURIComponent(raw); } catch { return raw; }
    })
    .filter(Boolean);
  return [...new Set(values)];
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
