// backend/src/routes/media.routes.ts
// Stable URLs for display images (profile photos, company logos).
//
// The storage bucket is private, so a "public" storage URL doesn't load. Each
// image is stored with the path /api/media/<uploadId> instead; this route
// redirects to a short-lived signed URL, so links never expire in the
// database or in a cached page. Only these two non-sensitive types are served
// — documents and videos stay behind authenticated, ownership-checked routes.

import path from "path";
import { Router, Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { MEDIA_FILE_TYPES, getSignedUrlForPath } from "../services/storage";

export const mediaRouter = Router();

mediaRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const upload = await prisma.upload.findFirst({
      where: {
        id:        req.params.id,
        fileType:  { in: MEDIA_FILE_TYPES },
        isPrivate: false,
        status:    "UPLOADED",
        deletedAt: null,
        user:      { is: { status: { notIn: ["SUSPENDED", "BANNED"] }, accountStatus: { not: "SUSPENDED" } } },
      },
      select: { filePath: true },
    });
    if (!upload?.filePath) return res.status(404).end();

    if (process.env.STORAGE_PROVIDER !== "supabase") {
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.sendFile(path.join(process.cwd(), ".uploads", upload.filePath));
    }

    const signed = await getSignedUrlForPath(upload.filePath);
    // Short browser cache so lists of thumbnails don't re-sign on every render,
    // well inside the signed URL's own lifetime.
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.redirect(302, signed);
  } catch (e) { next(e); }
});
