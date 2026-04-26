// backend/src/routes/uploads.routes.ts
import { Router } from "express";
import multer from "multer";
import * as ctrl from "../controllers/uploads.controller";
import { requireAnyAuth } from "../middleware/auth.middleware";

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 100 * 1024 * 1024 }, // hard ceiling — controller enforces per-type limits
});

export const uploadsRouter = Router();

uploadsRouter.post("/",        requireAnyAuth, upload.single("file"), ctrl.uploadFile);
uploadsRouter.get("/",         requireAnyAuth, ctrl.listUploads);
uploadsRouter.get("/:id/url",  requireAnyAuth, ctrl.getUploadUrl);
uploadsRouter.delete("/:id",   requireAnyAuth, ctrl.deleteUpload);
