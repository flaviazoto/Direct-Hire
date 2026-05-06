// backend/src/routes/employer.routes.ts
import { Router } from "express";
import * as ctrl      from "../controllers/employer.controller";
import * as jobsCtrl  from "../controllers/employer-jobs.controller";
import * as appCtrl   from "../controllers/employer-applications.controller";
import * as lockCtrl  from "../controllers/worker-lock.controller";
import * as billing   from "../controllers/billing.controller";
import { requireEmployer, requireVerifiedEmployer } from "../middleware/auth.middleware";

export const employerRouter = Router();

// ── Job posts (verified employer only) ───────────────────────────────────────
employerRouter.post(  "/jobs",                          requireVerifiedEmployer, jobsCtrl.createJob);
employerRouter.get(   "/jobs",                          requireVerifiedEmployer, jobsCtrl.getEmployerJobs);
employerRouter.get(   "/jobs/:id",                      requireVerifiedEmployer, jobsCtrl.getEmployerJob);
employerRouter.put(   "/jobs/:id",                      requireVerifiedEmployer, jobsCtrl.updateJob);
employerRouter.post(  "/jobs/:id/submit",               requireVerifiedEmployer, jobsCtrl.submitJob);
employerRouter.post(  "/jobs/:id/archive",              requireVerifiedEmployer, jobsCtrl.archiveJob);
employerRouter.delete("/jobs/:id",                      requireVerifiedEmployer, jobsCtrl.deleteJob);

// ── Applications (verified employer only) ────────────────────────────────────
employerRouter.get("/jobs/:jobId/applications",         requireVerifiedEmployer, appCtrl.getJobApplications);
employerRouter.get("/applications",                     requireVerifiedEmployer, appCtrl.getEmployerApplications);
employerRouter.get("/applications/:id",                 requireVerifiedEmployer, appCtrl.getApplicationDetail);
employerRouter.put("/applications/:id/status",          requireVerifiedEmployer, appCtrl.updateApplicationStatus);

// ── Worker locks (verified employer only) ────────────────────────────────────
employerRouter.get( "/locks",                           requireVerifiedEmployer, lockCtrl.getMyLocks);
employerRouter.post("/workers/:workerId/lock",          requireVerifiedEmployer, lockCtrl.lockWorker);
employerRouter.post("/workers/:workerId/lock/confirm",  requireVerifiedEmployer, lockCtrl.confirmLock);
employerRouter.post("/workers/:workerId/extend-lock",   requireVerifiedEmployer, lockCtrl.extendLock);
employerRouter.post("/workers/:workerId/release-lock",  requireVerifiedEmployer, lockCtrl.releaseLock);
employerRouter.get( "/workers/:workerId/lock-status",   requireVerifiedEmployer, lockCtrl.getLockStatus);

// ── Platform rate (no param — must come before /:workerId routes) ────────────
employerRouter.get("/lock-rate", requireVerifiedEmployer, lockCtrl.getLockRate);

// ── Worker search + billing ───────────────────────────────────────────────────
// /workers (no param) = search/browse; must come before /workers/:workerId
employerRouter.get(  "/workers",                                 requireVerifiedEmployer, ctrl.getCandidates);
// Keep /candidates as a deprecated alias so any cached client code doesn't 404
employerRouter.get(  "/candidates",                              requireVerifiedEmployer, ctrl.getCandidates);
employerRouter.get(  "/billing",                                 requireEmployer,         ctrl.getBilling);

// ── Worker detail (must come after /workers/:workerId/lock-status etc.) ───────
employerRouter.get(  "/workers/:workerId",                       requireVerifiedEmployer, ctrl.getWorkerDetail);
employerRouter.get(  "/workers/:workerId/applications",          requireVerifiedEmployer, ctrl.getWorkerApplications);

// ── Message worker ────────────────────────────────────────────────────────────
employerRouter.post("/message-worker", requireVerifiedEmployer, ctrl.messageWorker);

// ── Subscription (Stripe) ─────────────────────────────────────────────────────
employerRouter.get( "/subscription/status",   requireEmployer, billing.getSubscriptionStatus);
employerRouter.post("/subscription/checkout", requireEmployer, billing.createCheckout);
employerRouter.post("/subscription/cancel",   requireEmployer, billing.cancelEmployerSubscription);
employerRouter.post("/subscription/portal",   requireEmployer, billing.createPortal);
