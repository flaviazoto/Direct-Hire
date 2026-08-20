// backend/src/controllers/public-blog.controller.ts
// Public blog — no auth required. Mirrors public-jobs.controller.ts's shape.
// CRITICAL: always filters status = APPROVED && publishedAt !== null (Level 1
// human-gated publish — see admin-growth.controller.ts's publish/unpublish).
// A GrowthContentDraft being APPROVED alone is NOT enough to be public here;
// approving only clears it for a human to explicitly publish afterward.

import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";

// ── Safe field selection ────────────────────────────────────────────────────
// Nothing on this model is sensitive, but excluding internal-only fields
// (status, sourceTaskId) a public reader has no use for — same "select only
// what's meant to be public" discipline as JOB_LIST_SELECT/JOB_DETAIL_SELECT.

const BLOG_LIST_SELECT = {
  id:              true,
  contentType:     true,
  title:           true,
  slug:            true,
  metaDescription: true,
  publishedAt:     true,
  createdAt:       true,
} as const;

const BLOG_DETAIL_SELECT = {
  ...BLOG_LIST_SELECT,
  body:          true,
  metaTitle:     true,
  targetKeyword: true,
} as const;

const PUBLISHED_WHERE = { status: "APPROVED", publishedAt: { not: null } } as const;

// ── GET /api/public/blog ─────────────────────────────────────────────────────

export async function getPublicBlogPosts(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { contentType } = req.query as Record<string, string>;

    const where: Record<string, unknown> = { ...PUBLISHED_WHERE };
    if (contentType) where.contentType = contentType;

    const [rows, total] = await Promise.all([
      prisma.growthContentDraft.findMany({
        where, skip, take: limit,
        orderBy: { publishedAt: "desc" },
        select:  BLOG_LIST_SELECT,
      }),
      prisma.growthContentDraft.count({ where }),
    ]);

    return paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
}

// ── GET /api/public/blog/:slug ───────────────────────────────────────────────

export async function getPublicBlogPost(req: Request, res: Response, next: NextFunction) {
  try {
    const { slug } = req.params;

    const post = await prisma.growthContentDraft.findFirst({
      where:  { slug, ...PUBLISHED_WHERE },
      select: BLOG_DETAIL_SELECT,
    });
    if (!post) return err(res, "Post not found", 404);

    return ok(res, post);
  } catch (e) { next(e); }
}
