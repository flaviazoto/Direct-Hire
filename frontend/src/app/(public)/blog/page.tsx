// frontend/src/app/(public)/blog/page.tsx
// Public blog listing — server component, mirrors (public)/jobs/page.tsx's
// SSR-first approach (revalidate: 3600, real HTML on first response, no
// client-side fetch needed for Googlebot or no-JS visitors). Simpler than
// jobs: no filter sidebar, just a paginated list of published
// GrowthContentDraft rows — "published" is a Level 1 human-gated step
// (status === APPROVED && publishedAt !== null), separate from approval;
// see admin-growth.controller.ts's publish/unpublish endpoints.

import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { getPublicBlogListServer } from "@/lib/blog-ssr";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Blog — DirectHire",
  description: "Career guides, country and visa guides, and hiring insights from DirectHire.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Blog — DirectHire",
    description: "Career guides, country and visa guides, and hiring insights from DirectHire.",
    type: "website",
  },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default async function BlogPage({ searchParams }: { searchParams: { page?: string } }) {
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const { posts, total, totalPages } = await getPublicBlogListServer(page, 20);

  return (
    <div style={{ minHeight: "100vh", background: "var(--glass-base)", fontFamily: "var(--font-body)" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 64px" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>Blog</h1>
          <p style={{ fontSize: 14, color: "#71717a", margin: 0 }}>
            {total.toLocaleString()} article{total !== 1 ? "s" : ""}
          </p>
        </div>

        {posts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 24px", color: "#71717a" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#a1a1aa", marginBottom: 6 }}>No articles yet</div>
            <div style={{ fontSize: 13 }}>Check back soon.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {posts.map(post => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="glass-card"
                style={{ display: "block", padding: 24, textDecoration: "none" }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: "#c4b5fd", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>
                  {post.contentType.replace(/-/g, " ")}
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 8px", lineHeight: 1.3 }}>{post.title}</h2>
                {post.metaDescription && (
                  <p style={{ fontSize: 14, color: "#a1a1aa", lineHeight: 1.6, margin: "0 0 10px" }}>{post.metaDescription}</p>
                )}
                <div style={{ fontSize: 12, color: "#555" }}>{fmtDate(post.publishedAt)}</div>
              </Link>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 32 }}>
            {page > 1 ? (
              <Link href={`/blog?page=${page - 1}`} className="btn-glass" style={{ height: 40, padding: "0 20px", display: "inline-flex", alignItems: "center", fontSize: 13, textDecoration: "none" }}>
                ← Previous
              </Link>
            ) : <span />}
            <span style={{ fontSize: 13, color: "#71717a" }}>Page {page} of {totalPages}</span>
            {page < totalPages ? (
              <Link href={`/blog?page=${page + 1}`} className="btn-glass" style={{ height: 40, padding: "0 20px", display: "inline-flex", alignItems: "center", fontSize: 13, textDecoration: "none" }}>
                Next →
              </Link>
            ) : <span />}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
