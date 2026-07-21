// backend/src/middleware/subscription.middleware.ts
// Guards routes that require an active employer subscription.
import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";

export async function requireSubscription(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const userId = req.user?.sub;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

    const ep = await prisma.employerProfile.findUnique({
      where:  { userId },
      select: { subscriptionStatus: true, subscriptionCurrentPeriodEnd: true, trialEndsAt: true },
    });

    const isActive = ep?.subscriptionStatus === "ACTIVE";
    const isTrialing = ep?.subscriptionStatus === "TRIAL"
      && ep?.trialEndsAt != null
      && ep.trialEndsAt.getTime() > Date.now();
    const isExpired = ep?.subscriptionCurrentPeriodEnd != null
      && ep.subscriptionCurrentPeriodEnd.getTime() < Date.now();

    if ((isActive || isTrialing) && !isExpired) return next();

    return res.status(403).json({
      success:    false,
      error:      "An active subscription is required to access this feature.",
      code:       "SUBSCRIPTION_REQUIRED",
      redirectTo: "/employer/subscription",
    });
  } catch (e) {
    return next(e);
  }
}
