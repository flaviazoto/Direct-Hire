// backend/src/routes/user.routes.ts
import { Router } from "express";
import * as ctrl from "../controllers/user.controller";
import { requireAnyAuth } from "../middleware/auth.middleware";

export const userRouter = Router();
userRouter.get("/profile",    requireAnyAuth, ctrl.getProfile);
userRouter.patch("/profile",  requireAnyAuth, ctrl.updateProfile);
userRouter.get("/notifications", requireAnyAuth, ctrl.getNotifications);
userRouter.patch("/notifications/:id/read", requireAnyAuth, ctrl.markNotificationRead);
