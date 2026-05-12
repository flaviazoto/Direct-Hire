// backend/src/server.ts
import "dotenv/config";

// ── Startup env guard ─────────────────────────────────────────
const REQUIRED_ENV = [
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "DATABASE_URL",
  "ENCRYPTION_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "FRONTEND_URL",
  "BACKEND_URL",
  "CRON_SECRET",
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import path from "path";

import { authRouter }        from "./routes/auth.routes";
import { onboardingRouter }  from "./routes/onboarding.routes";
import { uploadsRouter }     from "./routes/uploads.routes";
import { userRouter }        from "./routes/user.routes";
import { adminRouter }       from "./routes/admin.routes";
import { cronRouter }        from "./routes/cron.routes";
import { workerRouter }      from "./routes/worker.routes";
import { employerRouter }    from "./routes/employer.routes";
import { publicJobsRouter }  from "./routes/public-jobs.routes";
import { contactRouter }      from "./routes/contact.routes";
import { stripeWebhook }     from "./controllers/webhook.controller";
import { errorHandler }      from "./middleware/error.middleware";
import { rateLimiter }       from "./middleware/ratelimit.middleware";
import { runVerificationCodeCleanup } from "./services/queue";
import { startScheduler } from "./services/scheduler";

const app  = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT ?? 4000;
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);
const CORS_OPTIONS: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Cron-Secret"],
  exposedHeaders: ["Set-Cookie"],
};

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors(CORS_OPTIONS));
app.options("*", cors(CORS_OPTIONS));
app.use(cookieParser());

// Stripe webhook needs raw body for signature verification — MUST be before express.json()
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhook);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(rateLimiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "directhire-api", timestamp: new Date().toISOString() });
});

if (process.env.NODE_ENV !== "production") {
  app.use("/uploads", express.static(path.join(process.cwd(), ".uploads")));
}

app.use("/api/auth",        authRouter);
app.use("/api/onboarding",  onboardingRouter);
app.use("/api/uploads",     uploadsRouter);
app.use("/api/user",        userRouter);
app.use("/api/admin",       adminRouter);
app.use("/api/cron",        cronRouter);
app.use("/api/contact",     contactRouter);    // public contact form
app.use("/api/public/jobs", publicJobsRouter); // public job search — no auth required
app.use("/api/employer",    employerRouter);  // /api/employer/* — must precede generic /api
app.use("/api",             workerRouter);    // /api/jobs (auth), /api/applications

app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n🚀 Direct Hire API running at http://localhost:${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV}`);
  console.log(`   Frontend URL: ${FRONTEND_URL}`);
  console.log(`   Health check: http://localhost:${PORT}/health\n`);

  // Verification code cleanup every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  runVerificationCodeCleanup().catch(console.error); // run once on boot
  setInterval(() => runVerificationCodeCleanup().catch(console.error), SIX_HOURS);

  // Lock billing + expiry scheduler
  startScheduler().catch(console.error);
});

export default app;
