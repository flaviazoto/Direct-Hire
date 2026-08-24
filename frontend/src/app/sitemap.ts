// frontend/src/app/sitemap.ts
// Dynamic sitemap (App Router convention — served at /sitemap.xml).
// Static public marketing pages + every APPROVED job's detail page +
// every published blog post.

import type { MetadataRoute } from "next";
import { getAllPublicJobIdsServer } from "@/lib/jobs-ssr";
import { getAllPublishedBlogSlugsServer } from "@/lib/blog-ssr";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://directhire.cc";

const STATIC_PATHS: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
  { path: "/",              changeFrequency: "weekly",  priority: 1.0 },
  { path: "/jobs",          changeFrequency: "hourly",  priority: 0.9 },
  { path: "/blog",          changeFrequency: "weekly",  priority: 0.6 },
  { path: "/for-workers",   changeFrequency: "monthly", priority: 0.6 },
  { path: "/for-employers", changeFrequency: "monthly", priority: 0.6 },
  { path: "/pricing",       changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact",       changeFrequency: "monthly", priority: 0.3 },
  { path: "/terms",         changeFrequency: "yearly",  priority: 0.2 },
  { path: "/privacy",       changeFrequency: "yearly",  priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map(({ path, changeFrequency, priority }) => ({
    url: `${APP_URL}${path}`,
    changeFrequency,
    priority,
  }));

  const jobs = await getAllPublicJobIdsServer();
  const now = Date.now();
  const jobEntries: MetadataRoute.Sitemap = jobs
    .filter(job => !job.applicationDeadline || new Date(job.applicationDeadline).getTime() >= now)
    .map(job => ({
      url: `${APP_URL}/jobs/${job.id}`,
      lastModified: job.createdAt,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

  const posts = await getAllPublishedBlogSlugsServer();
  const blogEntries: MetadataRoute.Sitemap = posts.map(post => ({
    url: `${APP_URL}/blog/${post.slug}`,
    // publishedAt (not createdAt) is when the post actually went live —
    // same "use the went-public timestamp, not the drafted one" reasoning
    // as the job detail page's approvedAt/JobPosting.datePosted.
    lastModified: post.publishedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...jobEntries, ...blogEntries];
}
