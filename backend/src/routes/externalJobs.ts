// backend/src/routes/externalJobs.ts
import { Router, Request, Response } from "express";
import { requireAdmin, requireAnyAuth } from "../middleware/auth.middleware";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";

export const externalJobsRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/external-jobs/admin
 * Returns all external jobs ordered by isPinned desc, createdAt desc.
 */
externalJobsRouter.get("/admin", requireAdmin, async (req: Request, res: Response) => {
  try {
    const jobs = await prisma.externalJob.findMany({
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      include: { admin: { select: { id: true, email: true } } },
    });

    return ok(res, { jobs });
  } catch (error) {
    console.error("Error fetching external jobs:", error);
    return err(res, "Internal server error", 500);
  }
});

/**
 * POST /api/external-jobs/admin
 * Create a new external job (admin only)
 */
externalJobsRouter.post("/admin", requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      title,
      company,
      location,
      externalUrl,
      country = "",
      salaryMin,
      salaryMax,
      currency = "USD",
      jobType = "Full-time",
      description,
      source,
      isPinned = false,
      skills = [],
    } = req.body;

    // Validate required fields
    if (!title || !company || !location || !externalUrl) {
      return err(res, "Missing required fields: title, company, location, externalUrl", 400);
    }

    // Validate URL
    try {
      new URL(externalUrl);
    } catch {
      return err(res, "Invalid externalUrl — must be a valid URL", 400);
    }

    const job = await prisma.externalJob.create({
      data: {
        title,
        company,
        location,
        externalUrl,
        country,
        salaryMin: salaryMin ? parseInt(salaryMin) : null,
        salaryMax: salaryMax ? parseInt(salaryMax) : null,
        currency,
        jobType,
        description,
        source,
        isPinned,
        skills: Array.isArray(skills) ? skills : [],
        createdBy: req.user!.sub,
      },
      include: { admin: { select: { id: true, email: true } } },
    });

    return ok(res, { job }, undefined, 201);
  } catch (error) {
    console.error("Error creating external job:", error);
    return err(res, "Internal server error", 500);
  }
});

/**
 * PATCH /api/external-jobs/admin/:id
 * Partial update of an external job
 */
externalJobsRouter.patch("/admin/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if job exists
    const existingJob = await prisma.externalJob.findUnique({ where: { id } });
    if (!existingJob) {
      return err(res, "Not found", 404);
    }

    // Validate URL if provided
    if (updateData.externalUrl) {
      try {
        new URL(updateData.externalUrl);
      } catch {
        return err(res, "Invalid externalUrl — must be a valid URL", 400);
      }
    }

    // Prepare update data, handling type conversions
    const data: any = {};
    for (const [key, value] of Object.entries(updateData)) {
      if (key === "salaryMin" || key === "salaryMax") {
        data[key] = value ? parseInt(String(value)) : null;
      } else {
        data[key] = value;
      }
    }

    const job = await prisma.externalJob.update({
      where: { id },
      data,
      include: { admin: { select: { id: true, email: true } } },
    });

    return ok(res, { job });
  } catch (error) {
    console.error("Error updating external job:", error);
    return err(res, "Internal server error", 500);
  }
});

/**
 * DELETE /api/external-jobs/admin/:id
 * Hard delete an external job
 */
externalJobsRouter.delete("/admin/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if job exists
    const existingJob = await prisma.externalJob.findUnique({ where: { id } });
    if (!existingJob) {
      return err(res, "Not found", 404);
    }

    await prisma.externalJob.delete({ where: { id } });

    return ok(res, { success: true });
  } catch (error) {
    console.error("Error deleting external job:", error);
    return err(res, "Internal server error", 500);
  }
});

/**
 * PATCH /api/external-jobs/admin/:id/toggle
 * Toggle isActive boolean
 */
externalJobsRouter.patch("/admin/:id/toggle", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if job exists
    const existingJob = await prisma.externalJob.findUnique({ where: { id } });
    if (!existingJob) {
      return err(res, "Not found", 404);
    }

    const job = await prisma.externalJob.update({
      where: { id },
      data: { isActive: !existingJob.isActive },
      include: { admin: { select: { id: true, email: true } } },
    });

    return ok(res, { job });
  } catch (error) {
    console.error("Error toggling external job:", error);
    return err(res, "Internal server error", 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC/EMPLOYER ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/external-jobs/browse
 * Get active external jobs with search, filtering, and pagination
 */
externalJobsRouter.get("/browse", requireAnyAuth, async (req: Request, res: Response) => {
  try {
    const {
      search = "",
      country = "",
      jobType = "",
      page = "1",
      limit = "20",
    } = req.query;

    const pageNum = parseInt(String(page)) || 1;
    const limitNum = parseInt(String(limit)) || 20;
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = { isActive: true };

    // Search: filter title, company, description (case insensitive contains)
    if (search) {
      where.OR = [
        { title: { contains: String(search), mode: "insensitive" } },
        { company: { contains: String(search), mode: "insensitive" } },
        { description: { contains: String(search), mode: "insensitive" } },
      ];
    }

    // Filter by country (case insensitive)
    if (country) {
      where.country = { contains: String(country), mode: "insensitive" };
    }

    // Filter by jobType (exact match)
    if (jobType) {
      where.jobType = String(jobType);
    }

    // Fetch jobs with pagination
    const [jobs, total] = await Promise.all([
      prisma.externalJob.findMany({
        where,
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        skip,
        take: limitNum,
      }),
      prisma.externalJob.count({ where }),
    ]);

    // Increment views for returned jobs (fire and forget, do not await)
    if (jobs.length > 0) {
      const jobIds = jobs.map((j) => j.id);
      prisma.externalJob
        .updateMany({
          where: { id: { in: jobIds } },
          data: { views: { increment: 1 } },
        })
        .catch((error) => console.error("Error incrementing views:", error));
    }

    const pages = Math.ceil(total / limitNum);

    return ok(res, { jobs, total, page: pageNum, pages });
  } catch (error) {
    console.error("Error fetching external jobs:", error);
    return err(res, "Internal server error", 500);
  }
});

export default externalJobsRouter;
