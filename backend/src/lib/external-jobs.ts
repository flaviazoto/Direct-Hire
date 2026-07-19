// backend/src/lib/external-jobs.ts
// Shared helper for interleaving ExternalJob rows into the worker feed
// (worker.controller.ts::getJobs) and the public jobs list
// (public-jobs.controller.ts::getPublicJobs). Both callers append these
// AFTER their own (already paginated/sorted) real-job page — see the
// "real jobs always outrank external in match sort" rule in each caller.
//
// Deliberately NOT full cross-table pagination: external jobs are fetched
// once, capped at EXTERNAL_JOB_FEED_LIMIT, and only appended on page 1 of
// the real-job listing. Doing true offset-consistent pagination across two
// tables would need a merged/materialized feed — out of scope for an
// admin-curated table that will hold, at most, a few hundred rows.

import prisma from "./prisma";

export const EXTERNAL_JOB_FEED_LIMIT = 12;

export interface ExternalJobFeedFilters {
  country?: string;
  search?: string;
}

export async function getActiveExternalJobsForFeed(filters: ExternalJobFeedFilters) {
  const and: Record<string, unknown>[] = [];
  if (filters.country) and.push({ country: { contains: filters.country, mode: "insensitive" } });
  if (filters.search)  and.push({ title:   { contains: filters.search,  mode: "insensitive" } });

  const where = { status: "ACTIVE", ...(and.length ? { AND: and } : {}) };

  const rows = await prisma.externalJob.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: EXTERNAL_JOB_FEED_LIMIT,
  });

  return rows.map((job) => ({ ...job, source: "external" as const }));
}
