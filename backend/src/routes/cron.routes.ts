// backend/src/routes/cron.routes.ts
import { Router } from "express";
import { Request, Response } from "express";
import { runOnboardingReminders, runVerificationCodeCleanup } from "../services/queue";
import { runLockDailyBilling, runLockExpiryProcessor } from "../services/lock-jobs";

export const cronRouter = Router();

cronRouter.get("/", async (req: Request, res: Response) => {
  const secret = req.headers["x-cron-secret"];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  const job = (req.query.job as string) ?? "all";
  const results: Record<string, string> = {};

  if (job === "all" || job === "onboarding-reminders") {
    await runOnboardingReminders();
    results["onboarding-reminders"] = "ok";
  }
  if (job === "all" || job === "verification-code-cleanup") {
    await runVerificationCodeCleanup();
    results["verification-code-cleanup"] = "ok";
  }
  if (job === "all" || job === "lock-daily-billing") {
    await runLockDailyBilling();
    results["lock-daily-billing"] = "ok";
  }
  if (job === "all" || job === "lock-expiry-processor") {
    await runLockExpiryProcessor();
    results["lock-expiry-processor"] = "ok";
  }

  return res.json({ success: true, data: results });
});
