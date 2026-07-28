// backend/src/services/growth/agents/technical-seo-agent.ts
// Technical SEO Agent — read-only diagnostic. Queries JobPost for a handful
// of known SEO/data-quality problems and reports them; makes no writes of
// its own (the caller, runGrowthAgent, is what writes the result back onto
// the GrowthAgentTask row). No Anthropic API calls, no content generation —
// that's a separate agent for a later pass.

import type { GrowthAgentTask } from "@prisma/client";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const SAMPLE_LIMIT = 20;

interface ExpiredNotArchivedResult {
  count:  number;
  sample: { id: string; title: string }[];
}

interface DuplicateGroup {
  employerId: string;
  title:      string;
  country:    string;
  count:      number;
}

interface DuplicatesResult {
  count:  number;
  sample: DuplicateGroup[];
}

interface MissingRequiredFieldsResult {
  count: number;
}

interface StaleZeroViewsResult {
  count:  number;
  sample: string[];
}

interface SitemapCheckResult {
  status: "skipped" | "ok" | "issue";
  note:   string;
}

export interface TechnicalSeoAuditOutput {
  expiredNotArchived:    ExpiredNotArchivedResult;
  duplicates:            DuplicatesResult;
  missingRequiredFields: MissingRequiredFieldsResult;
  staleZeroViews:        StaleZeroViewsResult;
  sitemapCheck:          SitemapCheckResult;
}

export async function runTechnicalSeoAudit(
  _task: GrowthAgentTask,
): Promise<{ summary: string; outputData: TechnicalSeoAuditOutput }> {
  const prisma = (await import("../../../lib/prisma")).default;
  const now = new Date();

  // a) Expired but not archived — still APPROVED and publicly listed past
  // its own applicationDeadline, but nobody archived it.
  const expiredWhere = {
    status:              "APPROVED" as const,
    applicationDeadline:  { lt: now },
    archivedAt:           null,
  };
  const [expiredCount, expiredSample] = await Promise.all([
    prisma.jobPost.count({ where: expiredWhere }),
    prisma.jobPost.findMany({
      where:   expiredWhere,
      select:  { id: true, title: true },
      orderBy: { applicationDeadline: "asc" },
      take:    SAMPLE_LIMIT,
    }),
  ]);

  // b) Duplicate listings — same employer, title, and country, more than
  // once, both still APPROVED (i.e. actually live duplicates a worker could
  // see side by side, not just historical resubmissions).
  const dupGroupsRaw = await prisma.jobPost.groupBy({
    by:     ["employerId", "title", "country"],
    where:  { status: "APPROVED" },
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
  });
  const duplicatesCount = dupGroupsRaw.length;
  const duplicatesSample: DuplicateGroup[] = dupGroupsRaw
    .slice(0, SAMPLE_LIMIT)
    .map(g => ({ employerId: g.employerId, title: g.title, country: g.country, count: g._count.id }));

  // c) Missing required fields — category/country are non-nullable String
  // columns, so "missing" here means an empty string slipped through
  // whatever validation was in place at creation time, not a null.
  const missingCount = await prisma.jobPost.count({
    where: { OR: [{ category: "" }, { country: "" }] },
  });

  // d) Stale approved posts — live for 90+ days with zero views. Not
  // necessarily broken, but a signal something (visibility, ranking,
  // pricing) is off for these listings.
  const staleWhere = {
    status:    "APPROVED" as const,
    createdAt: { lt: new Date(now.getTime() - NINETY_DAYS_MS) },
    viewCount: 0,
  };
  const [staleCount, staleRows] = await Promise.all([
    prisma.jobPost.count({ where: staleWhere }),
    prisma.jobPost.findMany({
      where:   staleWhere,
      select:  { id: true },
      orderBy: { createdAt: "asc" },
      take:    SAMPLE_LIMIT,
    }),
  ]);
  const staleSample = staleRows.map(r => r.id);

  // e) Sitemap sanity — getAllPublicJobIdsServer() lives in
  // frontend/src/lib/jobs-ssr.ts, a separate Next.js deployable this
  // backend process has no access to (different repo root, different
  // runtime, no shared build). Not attempting to cross that boundary here.
  const sitemapCheck: SitemapCheckResult = {
    status: "skipped",
    note:   "Sitemap check requires frontend-side audit — skipped (getAllPublicJobIdsServer lives in frontend/src/lib/jobs-ssr.ts, not accessible from the backend process).",
  };

  const outputData: TechnicalSeoAuditOutput = {
    expiredNotArchived:    { count: expiredCount, sample: expiredSample },
    duplicates:            { count: duplicatesCount, sample: duplicatesSample },
    missingRequiredFields: { count: missingCount },
    staleZeroViews:        { count: staleCount, sample: staleSample },
    sitemapCheck,
  };

  const summary =
    `Found ${expiredCount} expired listing${expiredCount === 1 ? "" : "s"} still live, ` +
    `${duplicatesCount} duplicate group${duplicatesCount === 1 ? "" : "s"}, ` +
    `${missingCount} job${missingCount === 1 ? "" : "s"} missing required fields, and ` +
    `${staleCount} stale zero-view post${staleCount === 1 ? "" : "s"}. ` +
    `Sitemap check was skipped (frontend-only logic).`;

  return { summary, outputData };
}
