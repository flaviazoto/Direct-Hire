// frontend/src/app/(public)/blog/[slug]/page.tsx
// Public blog post detail — server component, mirrors (public)/jobs/[id]/
// page.tsx's structure (glass-card hero, breadcrumb, Footer, notFound()
// for a missing/unpublished slug).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer } from "@/components/Footer";
import { getPublicBlogPostServer } from "@/lib/blog-ssr";

export const revalidate = 3600;

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// ── Metadata ─────────────────────────────────────────────────────────────────
// Exact fallback-first shape as jobs/[id]/page.tsx's confirmed-shipped
// generateMetadata: real SEO fields first, falling back to constructed
// title/description built from data the page already has — not a second,
// different pattern.

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPublicBlogPostServer(params.slug);
  if (!post) {
    return { title: "Post not found — DirectHire" };
  }

  const title = post.metaTitle ?? post.title;
  const description = post.metaDescription ?? (post.body.length > 200
    ? `${post.body.slice(0, 197)}...`
    : post.body);

  return {
    title,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { title, description, type: "website" },
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getPublicBlogPostServer(params.slug);
  if (!post) notFound();

  return (
    <div style={{ minHeight: "100vh", background: "var(--glass-base)", fontFamily: "var(--font-body)" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 64px" }}>
        <Link href="/blog" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#71717a", textDecoration: "none", marginBottom: 24 }}>
          ← Back to blog
        </Link>

        <div className="glass-card" style={{ padding: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#c4b5fd", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 12 }}>
            {post.contentType.replace(/-/g, " ")}
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", lineHeight: 1.25, margin: "0 0 12px" }}>{post.title}</h1>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            Published {fmtDate(post.publishedAt)}
          </div>
          <div style={{ fontSize: 15, color: "#d4d4d8", lineHeight: 1.9, whiteSpace: "pre-wrap" as const }}>
            {post.body}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
