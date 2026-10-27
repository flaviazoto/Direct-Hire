// backend/src/routes/csp-report.routes.ts
// Receives Content-Security-Policy violation reports from browsers. The
// frontend ships its CSP in report-only mode first; these log lines show what
// would break before the policy is enforced.

import express, { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";

export const cspReportRouter = Router();

const limiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
const parse = express.json({ type: ["application/csp-report", "application/reports+json", "application/json"], limit: "16kb" });

function pathOnly(url: unknown): string {
  if (typeof url !== "string") return "";
  try { const u = new URL(url); return u.origin + u.pathname; } catch { return url.slice(0, 200); }
}

cspReportRouter.post("/", limiter, parse, (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown> | Record<string, unknown>[];
  // Legacy report-uri format: { "csp-report": {...} }; Reporting API: [{ body: {...} }]
  const reports = Array.isArray(body)
    ? body.map((r) => (r as { body?: Record<string, unknown> }).body ?? {})
    : [((body as Record<string, unknown>)["csp-report"] ?? body) as Record<string, unknown>];
  for (const r of reports.slice(0, 10)) {
    console.warn("[csp-report]", JSON.stringify({
      directive: r["violated-directive"] ?? r["effectiveDirective"] ?? r["effective-directive"],
      blocked:   pathOnly(r["blocked-uri"] ?? r["blockedURL"]),
      page:      pathOnly(r["document-uri"] ?? r["documentURL"]),
    }));
  }
  res.status(204).end();
});
