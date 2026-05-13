import crypto from "crypto";
import { redis } from "./redis";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

function tokenKey(token: string) {
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return `token_blocklist:${hash}`;
}

function userRevokedAfterKey(userId: string) {
  return `user_tokens_revoked_after:${userId}`;
}

export async function blocklistToken(token: string, ttlSeconds = REFRESH_TOKEN_TTL_SECONDS): Promise<void> {
  if (!token) return;
  await redis.set(tokenKey(token), "1", "EX", ttlSeconds);
}

export async function blocklistTokens(tokens: string[], ttlSeconds = REFRESH_TOKEN_TTL_SECONDS): Promise<void> {
  await Promise.all(tokens.filter(Boolean).map((token) => blocklistToken(token, ttlSeconds)));
}

export async function isTokenBlocklisted(token: string): Promise<boolean> {
  if (!token) return false;
  return (await redis.get(tokenKey(token))) === "1";
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  const revokedAfter = Math.floor(Date.now() / 1000);
  await redis.set(userRevokedAfterKey(userId), String(revokedAfter), "EX", REFRESH_TOKEN_TTL_SECONDS);
}

export async function isUserTokenRevoked(userId: string, issuedAt?: number): Promise<boolean> {
  if (!issuedAt) return false;
  const revokedAfter = await redis.get(userRevokedAfterKey(userId));
  if (!revokedAfter) return false;
  return issuedAt < parseInt(revokedAfter, 10);
}

export { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS };
