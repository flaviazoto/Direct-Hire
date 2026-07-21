// backend/src/routes/employer.routes.ts
import { Router } from "express";
import * as ctrl      from "../controllers/employer.controller";
import * as jobsCtrl  from "../controllers/employer-jobs.controller";
import * as appCtrl   from "../controllers/employer-applications.controller";
import * as lockCtrl  from "../controllers/worker-lock.controller";
import * as billing   from "../controllers/billing.controller";
// Notification handlers are role-agnostic (filter purely by req.user.sub), so
// they're reused as-is rather than duplicated — same cross-role-import pattern
// already used above for worker-lock.controller.ts.
import * as notifCtrl from "../controllers/worker-notifications.controller";
import { requireEmployer, requireVerifiedEmployer } from "../middleware/auth.middleware";
import { requireSubscription } from "../middleware/subscription.middleware";

export const employerRouter = Router();

// ── Job posts (verified employer only) ───────────────────────────────────────
// Create/update/publish/archive/delete require an active subscription; reading
// your own job posts does not (lapsed employers can still see their history).
employerRouter.post(  "/jobs",                          requireVerifiedEmployer, requireSubscription, jobsCtrl.createJob);
employerRouter.get(   "/jobs",                          requireVerifiedEmployer,                      jobsCtrl.getEmployerJobs);
employerRouter.get(   "/jobs/:id",                      requireVerifiedEmployer,                      jobsCtrl.getEmployerJob);
employerRouter.put(   "/jobs/:id",                      requireVerifiedEmployer, requireSubscription, jobsCtrl.updateJob);
employerRouter.post(  "/jobs/:id/submit",               requireVerifiedEmployer, requireSubscription, jobsCtrl.submitJob);
employerRouter.post(  "/jobs/:id/archive",              requireVerifiedEmployer, requireSubscription, jobsCtrl.archiveJob);
employerRouter.delete("/jobs/:id",                      requireVerifiedEmployer, requireSubscription, jobsCtrl.deleteJob);

// ── Applications (verified employer only) ────────────────────────────────────
// Reviewing/acting on applications (status changes) requires a subscription;
// reading your own received applications does not.
employerRouter.get("/jobs/:jobId/applications",         requireVerifiedEmployer,                      appCtrl.getJobApplications);
employerRouter.get("/applications",                     requireVerifiedEmployer,                      appCtrl.getEmployerApplications);
employerRouter.get("/applications/:id",                 requireVerifiedEmployer,                      appCtrl.getApplicationDetail);
employerRouter.put("/applications/:id/status",          requireVerifiedEmployer, requireSubscription, appCtrl.updateApplicationStatus);

// ── Worker locks (verified employer only) ────────────────────────────────────
// Creating/extending a lock requires a subscription; releasing one does not —
// a lapsed employer must still be able to release a worker they've reserved.
// NOTE: lockCtrl.lockWorker (worker-lock.controller.ts) already has its own inline
// ACTIVE-or-unexpired-TRIAL check (FIX 1, ~line 86). That check is redundant
// with this router-level gate — kept in place, but must stay in sync with it
// (both now accept TRIAL, not just ACTIVE) rather than being allowed to drift.
employerRouter.get( "/locks",                           requireVerifiedEmployer,                      lockCtrl.getMyLocks);
employerRouter.post("/workers/:workerId/lock",          requireVerifiedEmployer, requireSubscription, lockCtrl.lockWorker);
employerRouter.post("/workers/:workerId/lock/confirm",  requireVerifiedEmployer, requireSubscription, lockCtrl.confirmLock);
employerRouter.post("/workers/:workerId/extend-lock",         requireVerifiedEmployer, requireSubscription, lockCtrl.extendLock);
employerRouter.post("/workers/:workerId/extend-lock/confirm", requireVerifiedEmployer, requireSubscription, lockCtrl.confirmExtendLock);
employerRouter.post("/workers/:workerId/release-lock",  requireVerifiedEmployer,                      lockCtrl.releaseLock);
employerRouter.get( "/workers/:workerId/lock-status",   requireVerifiedEmployer,                      lockCtrl.getLockStatus);

// ── Platform rate (no param — must come before /:workerId routes) ────────────
employerRouter.get("/lock-rate", requireVerifiedEmployer, lockCtrl.getLockRate);

// ── Worker search + billing ───────────────────────────────────────────────────
// /workers (no param) = search/browse; must come before /workers/:workerId
employerRouter.get(  "/workers",                                 requireVerifiedEmployer, requireSubscription, ctrl.getCandidates);
// Keep /candidates as a deprecated alias so any cached client code doesn't 404
employerRouter.get(  "/candidates",                              requireVerifiedEmployer, requireSubscription, ctrl.getCandidates);
employerRouter.get(  "/billing",                                 requireEmployer,                              ctrl.getBilling);

// ── Worker detail (must come after /workers/:workerId/lock-status etc.) ───────
// getWorkerDetail is the single endpoint that returns profile + contact email +
// signed document/video URLs, so gating it covers "profile", "contact details",
// and "videos/documents" browsing in one place — there's no separate route for those.
employerRouter.get(  "/workers/:workerId",                       requireVerifiedEmployer, requireSubscription, ctrl.getWorkerDetail);
employerRouter.get(  "/workers/:workerId/applications",          requireVerifiedEmployer,                      ctrl.getWorkerApplications);

// ── Message worker ────────────────────────────────────────────────────────────
employerRouter.post("/message-worker", requireVerifiedEmployer, requireSubscription, ctrl.messageWorker);

// ── Subscription (Stripe) ─────────────────────────────────────────────────────
employerRouter.get( "/subscription/status",   requireEmployer, billing.getSubscriptionStatus);
employerRouter.post("/subscription/checkout", requireEmployer, billing.createCheckout);
employerRouter.post("/subscription/cancel",   requireEmployer, billing.cancelEmployerSubscription);
employerRouter.post("/subscription/portal",   requireEmployer, billing.createPortal);

// ── Notifications (verified employer only — NOT subscription-gated: a lapsed
// employer must still be able to see "your job was approved") ────────────────
employerRouter.get( "/notifications",              requireVerifiedEmployer, notifCtrl.getNotifications);
employerRouter.get( "/notifications/unread-count", requireVerifiedEmployer, notifCtrl.getUnreadCount);
employerRouter.post("/notifications/read-all",     requireVerifiedEmployer, notifCtrl.markAllNotificationsRead);
employerRouter.post("/notifications/:id/read",     requireVerifiedEmployer, notifCtrl.markNotificationRead);

// ── Messages (received-message inbox, reusing the same role-agnostic handlers
// as the worker side — Message.recipientId/senderId already generic) ─────────
employerRouter.get( "/messages",          requireVerifiedEmployer, notifCtrl.getMessages);
employerRouter.post("/messages/:id/read", requireVerifiedEmployer, notifCtrl.markMessageRead);
