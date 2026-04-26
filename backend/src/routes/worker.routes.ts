// backend/src/routes/worker.routes.ts
import { Router } from "express";
import * as ctrl         from "../controllers/worker.controller";
import * as appCtrl      from "../controllers/worker-applications.controller";
import * as lockCtrl     from "../controllers/worker-lock-status.controller";
import { requireWorker, requireVerifiedWorker } from "../middleware/auth.middleware";

export const workerRouter = Router();

// ── Job browsing & saving (requireWorker — VERIFIED not required to browse) ───
workerRouter.get( "/jobs",                requireWorker,         ctrl.getJobs);
workerRouter.get( "/jobs/countries",      requireWorker,         ctrl.getJobCountries);
workerRouter.get( "/jobs/filter-options", requireWorker,         ctrl.getJobFilterOptions);
workerRouter.get( "/jobs/:id",            requireWorker,         ctrl.getJob);
workerRouter.post("/jobs/:id/save",       requireWorker,         ctrl.saveJob);
workerRouter.delete("/saved-jobs/:jobId", requireWorker,         ctrl.unsaveJob);
workerRouter.get( "/saved-jobs",          requireWorker,         ctrl.getSavedJobs);

// ── Applications (requireVerifiedWorker) ──────────────────────────────────────
workerRouter.post("/jobs/:jobId/apply",          requireVerifiedWorker, appCtrl.applyToJob);
workerRouter.get( "/applications",               requireVerifiedWorker, appCtrl.getMyApplications);
workerRouter.get( "/applications/:id",           requireVerifiedWorker, appCtrl.getApplication);
workerRouter.post("/applications/:id/withdraw",  requireVerifiedWorker, appCtrl.withdrawApplication);
workerRouter.get( "/applications/:id/contact",   requireVerifiedWorker, appCtrl.getContactDetails);

// ── Lock status (requireVerifiedWorker) ───────────────────────────────────────
workerRouter.get("/lock-status",               requireVerifiedWorker, lockCtrl.getMyLockStatus);
workerRouter.get("/lock-history",              requireVerifiedWorker, lockCtrl.getMyLockHistory);
workerRouter.get("/lock-history/:lockId",      requireVerifiedWorker, lockCtrl.getMyLockDetail);
