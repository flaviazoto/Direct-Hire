// frontend/src/app/robots.ts
// Dynamic robots.txt (App Router convention — served at /robots.txt).
// No robots.txt existed before this — nothing was explicitly blocking
// crawlers, but nothing was explicitly pointing them at the sitemap either.
// Authenticated app sections are disallowed (they 401/redirect for a
// crawler anyway, but keeping crawl budget off them is still correct) —
// the public marketing site and job pages are what we want indexed.

import type { MetadataRoute } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://directhire.cc";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/worker/", "/employer/", "/admin/", "/api/", "/auth/"],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
