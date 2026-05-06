// backend/src/routes/worker.routes.ts
import { Router } from "express";
import * as ctrl         from "../controllers/worker.controller";
import * as appCtrl      from "../controllers/worker-applications.controller";
import * as lockCtrl     from "../controllers/worker-lock-status.controller";
import * as notifCtrl    from "../controllers/worker-notifications.controller";
import { getWorkerPayments } from "../controllers/worker-payments.controller";
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
// Fee preview — must precede /apply so Express matches /apply/confirm correctly
workerRouter.get( "/jobs/:jobId/application-fee",  requireVerifiedWorker, appCtrl.getApplicationFee);
workerRouter.post("/jobs/:jobId/apply/confirm",    requireVerifiedWorker, appCtrl.confirmApplication);
workerRouter.post("/jobs/:jobId/apply",            requireVerifiedWorker, appCtrl.applyToJob);
workerRouter.get( "/applications",                 requireVerifiedWorker, appCtrl.getMyApplications);
workerRouter.get( "/applications/:id",           requireVerifiedWorker, appCtrl.getApplication);
workerRouter.post("/applications/:id/withdraw",  requireVerifiedWorker, appCtrl.withdrawApplication);
workerRouter.get( "/applications/:id/contact",   requireVerifiedWorker, appCtrl.getContactDetails);
workerRouter.get( "/payments",                   requireVerifiedWorker, getWorkerPayments);

// ── Lock status (requireWorker — available regardless of verification status) ──
workerRouter.get("/lock-status",               requireWorker, lockCtrl.getMyLockStatus);
workerRouter.get("/lock-history",              requireWorker, lockCtrl.getMyLockHistory);
workerRouter.get("/lock-history/:lockId",      requireWorker, lockCtrl.getMyLockDetail);

// ── Notifications & messages ──────────────────────────────────────────────────
// Static routes must precede /:id param routes
workerRouter.get(  "/worker/notifications/unread-count", requireWorker, notifCtrl.getUnreadCount);
workerRouter.patch("/worker/notifications/read-all",     requireWorker, notifCtrl.markAllNotificationsRead);
workerRouter.get(  "/worker/notifications",              requireWorker, notifCtrl.getNotifications);
workerRouter.patch("/worker/notifications/:id/read",     requireWorker, notifCtrl.markNotificationRead);
workerRouter.get(  "/worker/messages",                   requireWorker, notifCtrl.getMessages);
workerRouter.patch("/worker/messages/:id/read",          requireWorker, notifCtrl.markMessageRead);
