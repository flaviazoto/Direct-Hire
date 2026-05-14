// backend/src/routes/admin.routes.ts
import { Router } from "express";
import * as ctrl         from "../controllers/admin.controller";
import * as jobsCtrl     from "../controllers/admin-jobs.controller";
import * as locksCtrl    from "../controllers/admin-locks.controller";
import * as docsCtrl     from "../controllers/admin-documents.controller";
import * as pricingCtrl  from "../controllers/admin-pricing.controller";
import * as configCtrl   from "../controllers/admin-config.controller";
import * as revenueCtrl  from "../controllers/admin-revenue.controller";
import { requireAdmin } from "../middleware/auth.middleware";

export const adminRouter = Router();

adminRouter.get("/stats",                    requireAdmin, ctrl.getStats);
adminRouter.get("/submissions",              requireAdmin, ctrl.getSubmissions);
adminRouter.post("/review",                  requireAdmin, ctrl.review);
adminRouter.get("/jobs",                     requireAdmin, ctrl.getJobs);
adminRouter.patch("/jobs/:id/status",        requireAdmin, ctrl.updateJobStatus);
adminRouter.get("/audit-log",                requireAdmin, ctrl.getAuditLog);
adminRouter.get("/users/counts",             requireAdmin, ctrl.getUserCounts);
adminRouter.get("/users",                    requireAdmin, ctrl.getUsers);
// Static routes must come before /:id
adminRouter.get("/users/pending",            requireAdmin, ctrl.getPendingUsers);
adminRouter.get("/users/:id",                requireAdmin, ctrl.getUserDetail);

// ── Document review ───────────────────────────────────────────────────────────
// Static route before /:id param
adminRouter.get(  "/workers/pending-documents",           requireAdmin, docsCtrl.getPendingDocumentWorkers);
adminRouter.get(  "/workers/:id/documents",               requireAdmin, docsCtrl.getWorkerDocuments);
adminRouter.patch("/workers/:id/documents/review",        requireAdmin, docsCtrl.reviewWorkerDocuments);
adminRouter.patch("/users/:id/suspend",      requireAdmin, ctrl.suspendUser);       // legacy (UserStatus field)
adminRouter.patch("/users/:id/activate",     requireAdmin, ctrl.activateUser);      // legacy (UserStatus field)
adminRouter.post("/users/:id/approve",       requireAdmin, ctrl.approveUser);
adminRouter.post("/users/:id/reject",        requireAdmin, ctrl.rejectUser);
adminRouter.post("/users/:id/suspend",       requireAdmin, ctrl.suspendUserAccount);
adminRouter.post("/users/:id/reinstate",     requireAdmin, ctrl.reinstateUser);
adminRouter.patch("/documents/:id/review",   requireAdmin, ctrl.reviewDocument);

// ── Job moderation (static routes before /:id) ───────────────────────────────
adminRouter.get( "/jobs/counts",              requireAdmin, jobsCtrl.getJobCounts);
adminRouter.get( "/jobs/pending",             requireAdmin, jobsCtrl.getPendingJobs);
adminRouter.get( "/jobs/moderation-history",  requireAdmin, jobsCtrl.getJobModerationHistory);
adminRouter.get( "/jobs/:id/detail",          requireAdmin, jobsCtrl.getAdminJobDetail);
adminRouter.post("/jobs/:id/approve",          requireAdmin, jobsCtrl.approveJob);
adminRouter.post("/jobs/:id/reject",           requireAdmin, jobsCtrl.rejectJob);
adminRouter.post("/jobs/:id/request-changes",  requireAdmin, jobsCtrl.requestJobChanges);
adminRouter.post("/jobs/:id/archive",          requireAdmin, jobsCtrl.archiveJobAdmin);

// ── Employer posting rights ───────────────────────────────────────────────────
adminRouter.post("/employers/:id/revoke-posting-rights",  requireAdmin, jobsCtrl.revokePostingRights);
adminRouter.post("/employers/:id/restore-posting-rights", requireAdmin, jobsCtrl.restorePostingRights);

// ── Lock management ───────────────────────────────────────────────────────────
// Static routes before /:lockId param
adminRouter.get( "/locks/summary",            requireAdmin, locksCtrl.getLocksSummary);
adminRouter.get( "/locks/active",             requireAdmin, locksCtrl.getActiveLocks);
adminRouter.get( "/locks",                    requireAdmin, locksCtrl.getAllLocks);
adminRouter.get( "/locks/:lockId",            requireAdmin, locksCtrl.getLockDetail);
adminRouter.post("/locks/:lockId/override",   requireAdmin, locksCtrl.overrideLock);

// ── Platform config ───────────────────────────────────────────────────────────
// Static sub-paths must come before bare /config to avoid shadowing
adminRouter.get(  "/config/application-fee", requireAdmin, pricingCtrl.getPricingConfig);
adminRouter.patch("/config/application-fee", requireAdmin, pricingCtrl.updatePricingConfig);
adminRouter.patch("/config/lock-rate",       requireAdmin, configCtrl.updateLockRateConfig);
adminRouter.get(  "/config",                 requireAdmin, configCtrl.getConfig);

// ── Revenue dashboard ─────────────────────────────────────────────────────────
adminRouter.get("/revenue/summary",  requireAdmin, revenueCtrl.getRevenueSummary);
adminRouter.get("/revenue/chart",    requireAdmin, revenueCtrl.getRevenueChart);
adminRouter.get("/revenue/payments", requireAdmin, revenueCtrl.getPaymentLog);

// ── Email logs ────────────────────────────────────────────────────────────────
adminRouter.get("/email-logs",  requireAdmin, ctrl.getEmailLogs);
adminRouter.get("/email-stats", requireAdmin, ctrl.getEmailStats);

// ── Email test — DELETE after confirming delivery ─────────────────────────────
adminRouter.get("/test-emails", requireAdmin, ctrl.testEmails);
