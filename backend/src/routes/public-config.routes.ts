// backend/src/routes/public-config.routes.ts
// Mounted at /api/public/config — no auth required on any of these routes.
import { Router } from "express";
import * as ctrl from "../controllers/public-config.controller";

export const publicConfigRouter = Router();

publicConfigRouter.get("/pricing", ctrl.getPublicPricingConfig);
