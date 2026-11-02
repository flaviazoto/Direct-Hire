// backend/src/lib/error-tracking.ts
// Optional exception tracking. Does nothing until SENTRY_DSN is set, so the
// app runs identically without an account. No personal data is sent: the
// SDK does not collect it by default, and only what callers pass explicitly
// (request ID, method, path) is attached.

import * as Sentry from "@sentry/node";

let enabled = false;

export function initErrorTracking(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    release: (process.env.RAILWAY_GIT_COMMIT_SHA ?? "").slice(0, 7) || undefined,
    tracesSampleRate: 0,
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
