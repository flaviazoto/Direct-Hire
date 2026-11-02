// backend/src/lib/error-tracking.ts
// Optional exception tracking. Does nothing until SENTRY_DSN is set, so the
// app runs identically without an account. No personal data is sent:
// beforeSend strips request headers, bodies, query strings and user info, and
// only what callers pass explicitly (request ID, method, path) is attached.

import * as Sentry from "@sentry/node";

let enabled = false;

/**
 * Strips everything that could carry personal data or secrets from an event
 * before it leaves the process. Exported for tests.
 */
export function scrubEvent<E extends Sentry.ErrorEvent>(event: E): E {
  if (event.request) {
    // Query strings can carry reset/verification tokens; headers carry
    // cookies and Authorization; bodies carry form data.
    event.request = { method: event.request.method, url: event.request.url?.split("?")[0] };
  }
  delete event.user;
  // Outgoing-request breadcrumbs include signed storage URLs.
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.filter((b) => b.category !== "http" && b.category !== "fetch");
  for (const ex of event.exception?.values ?? []) {
    // Prisma messages quote the query's arguments (emails, names…); the last
    // line is the reason ("Unique constraint failed on the fields: (`email`)").
    if (ex.type?.startsWith("PrismaClient") && ex.value) ex.value = ex.value.trim().split("\n").pop()!.slice(0, 300);
  }
  return event;
}

export function initErrorTracking(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    release: (process.env.RAILWAY_GIT_COMMIT_SHA ?? "").slice(0, 7) || undefined,
    tracesSampleRate: 0,
    // The SDK's request integration would otherwise attach the full URL
    // (query strings can carry reset/verification tokens), headers (cookies,
    // Authorization) and bodies. Keep only method + path.
    beforeSend: scrubEvent,
  });
  enabled = true;
  console.log("[error-tracking] Sentry enabled");
}

export function captureException(err: unknown, context: Record<string, unknown> = {}): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    for (const [k, v] of Object.entries(context)) scope.setExtra(k, v);
    Sentry.captureException(err);
  });
}

export function captureMessage(message: string, context: Record<string, unknown> = {}): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    for (const [k, v] of Object.entries(context)) scope.setExtra(k, v);
    Sentry.captureMessage(message, "error");
  });
}
