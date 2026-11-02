// backend/src/routes/client-errors.routes.ts
// Browser-side JavaScript errors, reported by the frontend's ErrorReporter so
// they appear in the API logs (and Sentry, when SENTRY_DSN is set) instead of
// vanishing in users' consoles. Rate-limited and size-capped; only the
// message, a short stack, the page path and the build are kept — no request
// bodies, cookies or user data.

import express, { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { captureMessage } from "../lib/error-tracking";

export const clientErrorsRouter = Router();

const limiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

const ReportSchema = z.object({
  message: z.string().max(500),
  stack:   z.string().max(2000).optional(),
  path:    z.string().max(300).optional(),
  kind:    z.enum(["error", "unhandledrejection", "react"]).default("error"),
  build:   z.string().max(64).optional(),
});

clientErrorsRouter.post("/", limiter, express.json({ limit: "8kb" }), (req: Request, res: Response) => {
  const parsed = ReportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(204).end();
  const r = parsed.data;
  // Path only — query strings can carry tokens (e.g. password-reset links).
  const path = (r.path ?? "").split("?")[0];
  const stack = (r.stack ?? "").split("\n").slice(0, 6).join(" | ");
  console.warn("[client-error]", JSON.stringify({ kind: r.kind, message: r.message, path, build: r.build ?? null, stack, requestId: req.id }));
  captureMessage(`[client] ${r.message}`, { kind: r.kind, path, build: r.build, stack });
  res.status(204).end();
});
