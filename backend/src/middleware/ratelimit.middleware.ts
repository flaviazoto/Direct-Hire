// backend/src/middleware/ratelimit.middleware.ts
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import type { Request } from "express";

// The in-process health monitor calls the public API over HTTP; its requests
// carry X-Internal-Monitor (= CRON_SECRET) so they never consume — or get
// blocked by — the shared rate-limit budget.
export const INTERNAL_MONITOR_HEADER = "x-internal-monitor";
function isInternalMonitor(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const given = req.headers[INTERNAL_MONITOR_HEADER];
  if (!expected || typeof given !== "string") return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000"),
  max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "200"),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, error: "Too many requests. Please slow down." },
  // Media redirects are cheap and a single directory page can load dozens of
  // thumbnails; counting them would starve real API calls.
  skip: (req) => req.path === "/health" || req.path === "/api/health"
    || req.path.startsWith("/api/media/") || isInternalMonitor(req),
});

// Stricter limiter for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      parseInt(process.env.AUTH_RATE_LIMIT_MAX ?? "20"),
  message:  { success: false, error: "Too many auth attempts. Try again in 15 minutes." },
});

// OTP endpoints: 10 requests per 15 min per IP
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.OTP_RATE_LIMIT_MAX ?? "10"),
  standardHeaders: true,
  legacyHeaders:   false,
  message:  { success: false, error: "Too many requests. Try again in 15 minutes." },
});

// Public contact form: 5 per hour per IP
export const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max:      parseInt(process.env.CONTACT_RATE_LIMIT_MAX ?? "5"),
  standardHeaders: true,
  legacyHeaders:   false,
  message:  { success: false, error: "Too many messages. Please try again later." },
});
