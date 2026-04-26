// backend/src/routes/onboarding.routes.ts
import { Router } from "express";
import * as ctrl from "../controllers/onboarding.controller";
import { requireAuth } from "../middleware/auth.middleware";

export const onboardingRouter = Router();

onboardingRouter.get("/progress",   requireAuth(["WORKER","EMPLOYER"]), ctrl.getProgress);
onboardingRouter.post("/save-step", requireAuth(["WORKER","EMPLOYER"]), ctrl.saveStep);
onboardingRouter.post("/submit",    requireAuth(["WORKER","EMPLOYER"]), ctrl.submit);
