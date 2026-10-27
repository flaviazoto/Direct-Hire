// frontend/src/lib/blog-ssr.ts
// Server-only fetch helpers for the public blog list/detail pages, the
// sitemap, and generateMetadata — same pattern as jobs-ssr.ts (see its
// header comment for why this can't reuse lib/api-client.ts's browser
// fetchers: a Server Component runs inside the Node process itself, so a
// relative "/api" fetch never reaches next.config.js's rewrite).
// A new sibling file rather than adding to jobs-ssr.ts — that file is
// jobs-specific end to end (its own header comment says so), and blog has
// its own shape (no filters, no categories/countries, just list + detail).

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface PublicBlogListItem {
  id:              string;
  contentType:     string;
  title:           string;
  slug:            string;
  metaDescription: string | null;
  publishedAt:     string;
  createdAt:       string;
}

export interface PublicBlogDetail extends PublicBlogListItem {
  body:          string;
  metaTitle:     string | null;
  targetKeyword: string | null;
}

interface PublicBlogListResult {
  posts:      PublicBlogListItem[];
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
}

// Failure policy: only a real 404 means "not found". Network errors and 5xx
// responses THROW, so ISR keeps serving the last good page instead of caching
// an empty list or a false 404 for an hour, and a build made while the API is
// down fails loudly instead of deploying pages with missing content.
export async function getPublicBlogListServer(page = 1, limit = 20): Promise<PublicBlogListResult> {
  const res = await fetch(`${API_BASE}/api/public/blog?page=${page}&limit=${limit}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Public blog list: API responded ${res.status}`);
  const json = await res.json() as {
    success: boolean; data?: PublicBlogListItem[]; total?: number; totalPages?: number;
  };
  if (!json.success || !json.data) throw new Error("Public blog list: unexpected API response");
  return { posts: json.data, total: json.total ?? 0, page, limit, totalPages: json.totalPages ?? 0 };
}

export async function getPublicBlogPostServer(slug: string): Promise<PublicBlogDetail | null> {
  const res = await fetch(`${API_BASE}/api/public/blog/${slug}`, {
    next: { revalidate: 3600 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Public blog post ${slug}: API responded ${res.status}`);
  const json = await res.json() as { success: boolean; data?: PublicBlogDetail };
  if (!json.success || !json.data) return null;
  return json.data;
}

// Used by sitemap.ts — walks every page of published posts (the list
// endpoint already filters status=APPROVED && publishedAt!==null server-
// side). Exact mirror of jobs-ssr.ts's getAllPublicJobIdsServer: same
// pagination-loop shape and revalidate window. Throws on failure: a sitemap
// silently missing pages would get them dropped from search indexes, while a
// failed regeneration keeps serving the previous sitemap. getPagination()
// caps limit at 100 server-side regardless of what we ask for.
export async function getAllPublishedBlogSlugsServer(): Promise<PublicBlogListItem[]> {
  const all: PublicBlogListItem[] = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const res = await fetch(`${API_BASE}/api/public/blog?page=${page}&limit=${limit}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`Sitemap blog slugs: API responded ${res.status}`);
    const json = await res.json() as { success: boolean; data?: PublicBlogListItem[]; totalPages?: number };
    if (!json.success || !json.data) throw new Error("Sitemap blog slugs: unexpected API response");
    all.push(...json.data);
    if (page >= (json.totalPages ?? 1)) break;
    page++;
  }

  return all;
}
