// frontend/src/lib/jobs-ssr.ts
// Server-only fetch helpers for the public job detail page, sitemap, and
// generateMetadata. NOT the same code path as lib/api-client.ts's browser
// fetchers — those use a relative "/api" prefix that only resolves via
// next.config.js's rewrite when the request originates from a browser tab.
// A Next.js Server Component/route handler runs inside the Node process
// itself, so a relative fetch never reaches the rewrite — it must call the
// backend's real URL directly.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface PublicJobDetail {
  id: string;
  title: string;
  companyName: string;
  country: string;
  city: string;
  remoteAllowed: boolean;
  salaryMin: string | number;
  salaryMax: string | number;
  salaryCurrency: string;
  contractType: string;
  experienceRequired: number;
  category: string;
  requiredSkills: string[];
  languagesRequired: string[];
  visaSupport: boolean;
  accommodation: boolean;
  applicationDeadline: string | null;
  positionsAvailable: number;
  viewCount: number;
  applicationCount: number;
  createdAt: string;
  approvedAt: string | null;
  description: string;
  requirements: string;
  benefits: string | null;
}

export interface PublicJobListItem {
  id: string;
  createdAt: string;
  applicationDeadline: string | null;
}

// List-shaped job (matches backend's JOB_LIST_SELECT in
// public-jobs.controller.ts) — narrower than PublicJobDetail: no
// description/requirements/benefits, since the list endpoint never selects
// those. Used by the server-rendered /jobs listing page.
export interface PublicJobListRow {
  id: string;
  title: string;
  companyName: string;
  country: string;
  city: string;
  remoteAllowed: boolean;
  salaryMin: string | number | null;
  salaryMax: string | number | null;
  salaryCurrency: string;
  contractType: string;
  experienceRequired: number;
  category: string;
  requiredSkills: string[];
  languagesRequired: string[];
  visaSupport: boolean;
  accommodation: boolean;
  applicationDeadline: string | null;
  positionsAvailable: number;
  viewCount: number;
  applicationCount: number;
  createdAt: string;
  // External jobs (admin-pasted links) share this same list response,
  // tagged source: "external" — see backend/src/lib/external-jobs.ts.
  source: "jobpost" | "external";
  sourceName?: string;
  externalUrl?: string;
}

export interface PublicJobsListResult {
  jobs: PublicJobListRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Used by the [id] page and generateMetadata — Next's fetch cache dedupes
// identical calls within one request, so calling this from both costs one
// network round trip, not two. Returns null on any failure (404, network
// error) — callers are responsible for calling notFound().
export async function getPublicJobServer(id: string): Promise<PublicJobDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/api/public/jobs/${id}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json() as { success: boolean; data?: PublicJobDetail };
    return json.success && json.data ? json.data : null;
  } catch {
    return null;
  }
}

// Next.js page-component searchParams shape (App Router hands this to
// page.tsx automatically — values are a single string, an array for
// repeated keys, or undefined if absent).
export type PublicJobsSearchParams = Record<string, string | string[] | undefined>;

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// Same query param names buildWhere() in backend/src/controllers/
// public-jobs.controller.ts expects, and the same names the client's
// filtersToParams() has always sent — this just moves that translation
// server-side so both the SSR fetch and any client-side "load more" fetch
// agree on the wire format.
export function jobsSearchParamsToQuery(sp: PublicJobsSearchParams): Record<string, string> {
  const q: Record<string, string> = {};
  const search       = firstParam(sp.search);
  const country      = firstParam(sp.country);
  const category     = firstParam(sp.category);
  const contractType = firstParam(sp.contract_type);
  const salaryMin    = firstParam(sp.salary_min);
  const salaryMax    = firstParam(sp.salary_max);
  const visaSupport  = firstParam(sp.visa_support);
  const remote       = firstParam(sp.remote);
  const skills       = firstParam(sp.skills);
  const sort         = firstParam(sp.sort);

  if (search)       q.search        = search;
  if (country)      q.country       = country;
  if (category)     q.category      = category;
  if (contractType) q.contract_type = contractType;
  if (salaryMin)     q.salary_min    = salaryMin;
  if (salaryMax)     q.salary_max    = salaryMax;
  if (visaSupport === "true") q.visa_support = "true";
  if (remote === "true")      q.remote       = "true";
  if (skills)        q.skills = skills;
  q.sort = sort ?? "newest";
  return q;
}

// Server-rendered /jobs listing page — same /api/public/jobs endpoint the
// browser client (publicJobsApi.getJobs) and the sitemap
// (getAllPublicJobIdsServer, below) already use. includeExternal is only
// passed for page 1, mirroring the client's existing behavior (see
// public-jobs.controller.ts's getPublicJobs comment on why external jobs
// are opt-in and page-1-only).
export async function getPublicJobsListServer(
  searchParams: PublicJobsSearchParams,
  page = 1,
  limit = 20,
): Promise<PublicJobsListResult> {
  const query = jobsSearchParamsToQuery(searchParams);
  query.page = String(page);
  query.limit = String(limit);
  if (page === 1) query.includeExternal = "true";

  const empty: PublicJobsListResult = { jobs: [], total: 0, page, limit, totalPages: 0 };
  try {
    const res = await fetch(`${API_BASE}/api/public/jobs?${new URLSearchParams(query)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return empty;
    const json = await res.json() as {
      success: boolean; data?: PublicJobListRow[]; total?: number; totalPages?: number;
    };
    if (!json.success || !json.data) return empty;
    return {
      jobs: json.data,
      total: json.total ?? 0,
      page,
      limit,
      totalPages: json.totalPages ?? 0,
    };
  } catch {
    return empty;
  }
}

export async function getPublicJobCategoriesServer(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/api/public/jobs/categories`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const json = await res.json() as { success: boolean; data?: string[] };
    return json.success && json.data ? json.data : [];
  } catch {
    return [];
  }
}

export async function getPublicJobCountriesServer(): Promise<{ country: string; count: number }[]> {
  try {
    const res = await fetch(`${API_BASE}/api/public/jobs/countries`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const json = await res.json() as { success: boolean; data?: { country: string; count: number }[] };
    return json.success && json.data ? json.data : [];
  } catch {
    return [];
  }
}

// Used by sitemap.ts — walks every page of APPROVED jobs (the list endpoint
// already filters status=APPROVED server-side, same guarantee as the detail
// endpoint). getPagination() caps limit at 100 server-side regardless of
// what we ask for.
export async function getAllPublicJobIdsServer(): Promise<PublicJobListItem[]> {
  const all: PublicJobListItem[] = [];
  let page = 1;
  const limit = 100;

  while (true) {
    let json: { success: boolean; data?: PublicJobListItem[]; totalPages?: number };
    try {
      const res = await fetch(`${API_BASE}/api/public/jobs?page=${page}&limit=${limit}`, {
        next: { revalidate: 3600 },
      });
      if (!res.ok) break;
      json = await res.json();
    } catch {
      break;
    }
    if (!json.success || !json.data) break;
    all.push(...json.data);
    if (page >= (json.totalPages ?? 1)) break;
    page++;
  }

  return all;
}
