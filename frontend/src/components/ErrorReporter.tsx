"use client";
// frontend/src/components/ErrorReporter.tsx
// Sends uncaught browser errors to the API (/api/client-errors) so they show
// up in the server logs instead of only in users' consoles. Throttled to a few
// reports per page load; sends the message, a short stack, the page path (no
// query string) and the build — never form values, cookies or user data.

import { useEffect } from "react";

const BUILD = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || undefined;
const MAX_REPORTS = 5;

export function ErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const seen = new Set<string>();

    function report(kind: "error" | "unhandledrejection", message: string, stack?: string) {
      if (sent >= MAX_REPORTS || !message) return;
      // Browser extensions and third-party scripts produce noise we can't fix.
      if (/^Script error\.?$/.test(message) || /extension:\/\//.test(stack ?? "")) return;
      const key = kind + message;
      if (seen.has(key)) return;
      seen.add(key);
      sent++;
      const body = JSON.stringify({
        kind,
        message: message.slice(0, 500),
        stack:   stack?.slice(0, 2000),
        path:    window.location.pathname,
        build:   BUILD,
      });
      try {
        // Same-origin, like api-client.ts — Next rewrites /api/* to the API.
        fetch("/api/client-errors", {
          method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "omit",
        }).catch(() => {});
      } catch { /* reporting must never throw */ }
    }

    const onError = (e: ErrorEvent) => report("error", e.message, e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      report("unhandledrejection", r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
