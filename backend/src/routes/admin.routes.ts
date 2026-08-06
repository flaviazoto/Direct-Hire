// backend/src/routes/admin.routes.ts
import { Router } from "express";
import * as ctrl         from "../controllers/admin.controller";
import * as jobsCtrl     from "../controllers/admin-jobs.controller";
import * as locksCtrl    from "../controllers/admin-locks.controller";
import * as docsCtrl     from "../controllers/admin-documents.controller";
import * as pricingCtrl  from "../controllers/admin-pricing.controller";
import * as configCtrl   from "../controllers/admin-config.controller";
import * as revenueCtrl  from "../controllers/admin-revenue.controller";
import * as externalJobsCtrl from "../controllers/admin-external-jobs.controller";
import * as systemHealthCtrl from "../controllers/admin-system-health.controller";
import * as growthCtrl   from "../controllers/admin-growth.controller";
import * as hiringCtrl   from "../controllers/admin-hiring-workflow.controller";
import * as feeCtrl      from "../controllers/admin-fee.controller";
import * as adminGroupsCtrl from "../controllers/admin-worker-groups.controller";
import * as adminMessagesCtrl from "../controllers/admin-messages.controller";
// Notification handlers are role-agnostic (filter purely by req.user.sub), so
// they're reused as-is — same cross-role-import pattern already used in
// employer.routes.ts for worker-lock.controller.ts / worker-notifications.controller.ts.
import * as notifCtrl    from "../controllers/worker-notifications.controller";
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

// ── External jobs (admin-curated links to jobs hosted elsewhere) ────────────
adminRouter.get(   "/external-jobs",              requireAdmin, externalJobsCtrl.getExternalJobs);
adminRouter.post(  "/external-jobs",               requireAdmin, externalJobsCtrl.createExternalJob);
adminRouter.patch( "/external-jobs/:id",           requireAdmin, externalJobsCtrl.updateExternalJob);
adminRouter.post(  "/external-jobs/:id/archive",   requireAdmin, externalJobsCtrl.archiveExternalJob);
adminRouter.delete("/external-jobs/:id",           requireAdmin, externalJobsCtrl.deleteExternalJob);

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

// ── System health (scheduled-job monitor) ────────────────────────────────────
adminRouter.get("/system-health", requireAdmin, systemHealthCtrl.getSystemHealth);

// ── Growth / Marketing agents (task log + approval workflow) ────────────────
// Static routes before /:id param
adminRouter.get( "/growth/content",              requireAdmin, growthCtrl.getGrowthContentDrafts);
adminRouter.get( "/growth/eligible-jobs",         requireAdmin, growthCtrl.getEligibleJobs);
adminRouter.get( "/growth/eligible-employers",    requireAdmin, growthCtrl.getEligibleEmployers);
adminRouter.post("/growth/tasks/run",            requireAdmin, growthCtrl.runGrowthTask);
adminRouter.get( "/growth/tasks",                requireAdmin, growthCtrl.getGrowthTasks);
adminRouter.get( "/growth/tasks/:id",            requireAdmin, growthCtrl.getGrowthTaskDetail);
adminRouter.post("/growth/tasks/:id/approve",    requireAdmin, growthCtrl.approveGrowthTask);
adminRouter.post("/growth/tasks/:id/reject",     requireAdmin, growthCtrl.rejectGrowthTask);

// ── Notifications ──────────────────────────────────────────────────────────────
adminRouter.get(  "/notifications",              requireAdmin, notifCtrl.getNotifications);
adminRouter.get(  "/notifications/unread-count", requireAdmin, notifCtrl.getUnreadCount);
adminRouter.patch("/notifications/read-all",     requireAdmin, notifCtrl.markAllNotificationsRead);
adminRouter.patch("/notifications/:id/read",     requireAdmin, notifCtrl.markNotificationRead);

// ── Admin-mediated hiring workflow (Phase 2) ────────────────────────────────────
// Static routes before /:applicationId param
adminRouter.get(  "/hiring/review-queue",                              requireAdmin, hiringCtrl.getReviewQueue);
adminRouter.get(  "/hiring/interview-hire-queue",                      requireAdmin, hiringCtrl.getInterviewHireQueue);
adminRouter.post( "/hiring/applications/:applicationId/review/approve", requireAdmin, hiringCtrl.approveApplicationReview);
adminRouter.patch("/hiring/applications/:applicationId/review/notes",   requireAdmin, hiringCtrl.updateApplicationReviewNotes);
adminRouter.get(  "/hiring/document-queue",                             requireAdmin, hiringCtrl.getDocumentQueue);
adminRouter.post( "/hiring/applications/:applicationId/documents",      requireAdmin, hiringCtrl.requestApplicationDocument);
adminRouter.patch("/hiring/documents/:documentId/approve",              requireAdmin, hiringCtrl.approveApplicationDocument);
adminRouter.post( "/hiring/applications/:applicationId/documents/skip", requireAdmin, hiringCtrl.skipDocumentVerification);
adminRouter.patch("/hiring/applications/:applicationId/interview",         requireAdmin, hiringCtrl.recordInterviewNotes);
adminRouter.post( "/hiring/applications/:applicationId/interview/relay",   requireAdmin, hiringCtrl.markInterviewRelayed);
adminRouter.post( "/hiring/applications/:applicationId/not-selected",      requireAdmin, hiringCtrl.markApplicationNotSelected);
adminRouter.post( "/hiring/applications/:applicationId/hire",              requireAdmin, hiringCtrl.confirmHire);

// ── Admin fee schedule + charge (Phase 2 sub-step 3) ────────────────────────────
adminRouter.get(  "/hiring/fee-queue",           requireAdmin, feeCtrl.getFeeQueue);
adminRouter.get(  "/fee-schedules",              requireAdmin, feeCtrl.getFeeSchedules);
adminRouter.post( "/fee-schedules",               requireAdmin, feeCtrl.createFeeSchedule);
adminRouter.patch("/fee-schedules/:id",           requireAdmin, feeCtrl.updateFeeSchedule);
adminRouter.post( "/hiring/applications/:applicationId/fee/create",  requireAdmin, feeCtrl.createFeeCharge);
adminRouter.post( "/hiring/applications/:applicationId/fee/confirm", requireAdmin, feeCtrl.confirmFeeCharge);

// ── Worker groups / bulk quotes — admin side (Phase 2 sub-step 5) ───────────────
adminRouter.get( "/bulk-quotes",              requireAdmin, adminGroupsCtrl.getPendingBulkQuotes);
adminRouter.post("/bulk-quotes/:id/quote",    requireAdmin, adminGroupsCtrl.submitBulkQuote);
adminRouter.post("/bulk-quotes/:id/send",     requireAdmin, adminGroupsCtrl.sendBulkQuote);

// ── Message visibility — read-only (Phase 5, Step 2) ─────────────────────────
adminRouter.get("/messages", requireAdmin, adminMessagesCtrl.getMessagesForUser);
