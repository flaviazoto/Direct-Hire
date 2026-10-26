// backend/src/routes/cron.routes.ts
import { Router } from "express";
import { Request, Response } from "express";
import crypto from "crypto";
import { runOnboardingReminders, runVerificationCodeCleanup } from "../services/queue";
import { runLockDailyBilling, runLockExpiryProcessor } from "../services/lock-jobs";
import { runStorageCleanup } from "../services/storage/erasure";

export const cronRouter = Router();

const JOBS: Record<string, () => Promise<void>> = {
  "onboarding-reminders":      runOnboardingReminders,
  "verification-code-cleanup": runVerificationCodeCleanup,
  "lock-daily-billing":        runLockDailyBilling,
  "lock-expiry-processor":     runLockExpiryProcessor,
  "storage-cleanup":           runStorageCleanup,
};

// Constant-time comparison; an unset CRON_SECRET never matches.
function validSecret(given: unknown): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || typeof given !== "string") return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

cronRouter.get("/", async (req: Request, res: Response) => {
  if (!validSecret(req.headers["x-cron-secret"])) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  const job = (req.query.job as string) ?? "all";
  const selected = job === "all" ? Object.keys(JOBS) : [job];
  if (selected.some((name) => !JOBS[name])) {
    return res.status(400).json({ success: false, error: `Unknown job. Valid: all, ${Object.keys(JOBS).join(", ")}` });
  }

  // Each job runs isolated: a failure is reported for that job, never
  // rejected out of the handler (which used to crash the whole API process).
  const results: Record<string, string> = {};
  for (const name of selected) {
    try {
      await JOBS[name]();
      results[name] = "ok";
    } catch (err) {
      console.error(`[cron] ${name} failed:`, err instanceof Error ? err.message : err);
      results[name] = "failed";
    }
  }
  const allOk = Object.values(results).every((r) => r === "ok");
  return res.status(allOk ? 200 : 500).json({ success: allOk, data: results });
});
