// backend/src/middleware/ratelimit.middleware.ts
import rateLimit from "express-rate-limit";

export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000"),
  max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "200"),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, error: "Too many requests. Please slow down." },
  skip: (req) => req.path === "/health",
});

// Stricter limiter for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      20,
  message:  { success: false, error: "Too many auth attempts. Try again in 15 minutes." },
});

// OTP endpoints: 10 requests per 15 min per IP
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  standardHeaders: true,
  legacyHeaders:   false,
  message:  { success: false, error: "Too many requests. Try again in 15 minutes." },
});
