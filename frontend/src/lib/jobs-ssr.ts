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
