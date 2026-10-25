// backend/src/lib/db-guard.ts
// Refuses to let local development, tests and destructive scripts touch a
// database that isn't explicitly allowed. Background: the local .env once
// pointed at production Supabase, so `npm run dev` ran the scheduler against
// prod and `prisma migrate dev` created shadow databases there.
//
// A database is allowed when its host is local, or when its exact
// "host|user" pair is listed in DB_GUARD_ALLOW (comma-separated) — use that
// for a staging project. Never add production to DB_GUARD_ALLOW.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal", "postgres", "db"]);

interface Target {
  variable: string;
  host: string;
  user: string;
}

function parseTarget(variable: string, url: string | undefined): Target | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return { variable, host: u.hostname.toLowerCase(), user: decodeURIComponent(u.username) };
  } catch {
    // Unparseable URLs are treated as unsafe rather than silently allowed.
    return { variable, host: "<unparseable>", user: "" };
  }
}

function isAllowed(t: Target): boolean {
  if (LOCAL_HOSTS.has(t.host)) return true;
  const allow = (process.env.DB_GUARD_ALLOW ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(`${t.host}|${t.user.toLowerCase()}`);
}

/** Returns a description of each disallowed database target (host only — never credentials). */
export function unsafeDatabaseTargets(): string[] {
  const targets = [
    parseTarget("DATABASE_URL", process.env.DATABASE_URL),
    parseTarget("DIRECT_URL", process.env.DIRECT_URL),
  ].filter((t): t is Target => t !== null);
  return targets.filter((t) => !isAllowed(t)).map((t) => `${t.variable} → ${t.host}`);
}

/** Throws when DATABASE_URL / DIRECT_URL point anywhere not explicitly allowed. */
export function assertSafeDatabaseTarget(context: string): void {
  const unsafe = unsafeDatabaseTargets();
  if (unsafe.length === 0) return;
  throw new Error(
    `[db-guard] Refusing to run "${context}" against a non-local database (${unsafe.join(", ")}). ` +
      `Point backend/.env at the local dev database (see docs/LOCAL_DEVELOPMENT.md), ` +
      `or add the exact "host|user" pair of a NON-production database to DB_GUARD_ALLOW.`,
  );
}

/** Runtime check for the API process and scripts: enforced only in development and test. */
export function guardRuntimeDatabase(): void {
  const env = process.env.NODE_ENV;
  if (env !== "development" && env !== "test") return;
  assertSafeDatabaseTarget(`NODE_ENV=${env}`);
}
