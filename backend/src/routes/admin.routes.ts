// backend/src/routes/admin.routes.ts
import { Router } from "express";
import * as ctrl      from "../controllers/admin.controller";
import * as jobsCtrl  from "../controllers/admin-jobs.controller";
import * as locksCtrl from "../controllers/admin-locks.controller";
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
