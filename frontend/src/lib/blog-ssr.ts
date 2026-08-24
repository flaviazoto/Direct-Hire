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

export async function getPublicBlogListServer(page = 1, limit = 20): Promise<PublicBlogListResult> {
  const empty: PublicBlogListResult = { posts: [], total: 0, page, limit, totalPages: 0 };
  try {
    const res = await fetch(`${API_BASE}/api/public/blog?page=${page}&limit=${limit}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return empty;
    const json = await res.json() as {
      success: boolean; data?: PublicBlogListItem[]; total?: number; totalPages?: number;
    };
    if (!json.success || !json.data) return empty;
    return { posts: json.data, total: json.total ?? 0, page, limit, totalPages: json.totalPages ?? 0 };
  } catch {
    return empty;
  }
}

export async function getPublicBlogPostServer(slug: string): Promise<PublicBlogDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/api/public/blog/${slug}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json() as { success: boolean; data?: PublicBlogDetail };
    if (!json.success || !json.data) return null;
    return json.data;
  } catch {
    return null;
  }
}
