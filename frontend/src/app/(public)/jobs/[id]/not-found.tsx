// frontend/src/app/(public)/jobs/[id]/not-found.tsx
// Segment-level 404 boundary — rendered whenever the job detail page calls
// notFound() (nonexistent id, or a job that isn't APPROVED). Matches the
// site's dark theme instead of falling back to Next's generic 404 page.

import Link from "next/link";

export default function JobNotFound() {
  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>Job not found</h1>
        <p style={{ fontSize: 14, color: "#71717a", lineHeight: 1.6, margin: "0 0 24px" }}>
          This job posting doesn&apos;t exist, or is no longer accepting applications.
        </p>
        <Link
          href="/jobs"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 44, padding: "0 24px", borderRadius: 10, background: "linear-gradient(135deg,#14b8a6,#0d9488)", color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none" }}
        >
          Browse open jobs
        </Link>
      </div>
    </div>
  );
}
