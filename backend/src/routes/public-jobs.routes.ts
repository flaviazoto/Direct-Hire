// backend/src/routes/public-jobs.routes.ts
// Mounted at /api/public/jobs — no auth required on any of these routes.
import { Router } from "express";
import * as ctrl from "../controllers/public-jobs.controller";

export const publicJobsRouter = Router();

// Static routes MUST come before /:id to avoid being swallowed by the param route
publicJobsRouter.get("/categories", ctrl.getJobCategories);
publicJobsRouter.get("/countries",  ctrl.getJobCountries);
publicJobsRouter.get("/",           ctrl.getPublicJobs);
publicJobsRouter.get("/:id",        ctrl.getPublicJob);
