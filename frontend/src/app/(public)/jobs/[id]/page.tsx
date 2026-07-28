// frontend/src/app/(public)/jobs/[id]/page.tsx
// Public, server-rendered job detail page — the piece that didn't exist
// before: every job on the platform now has a unique, crawlable,
// shareable URL. Pure server component (no "use client") so none of this
// ships as client JS; the only client-side interaction is the two CTA
// links, which are plain <a>/<Link> elements.
//
// ISR, not full SSG: no generateStaticParams() — pages render on first
// visit and are cached for `revalidate` seconds (see getPublicJobServer),
// then served statically until the next revalidation. Full SSG would mean
// re-running `next build` (a Vercel deploy) every time a job is approved;
// pure SSR (revalidate: 0) would hit the backend on every single visit for
// content that rarely changes once live. ISR is the right middle ground
// for a catalog that grows/changes continuously without a rebuild per job.
//
// Known tradeoff: GET /api/public/jobs/:id increments JobPost.viewCount as
// a side effect. Under ISR that only happens once per revalidation window
// (whoever's request triggers the regeneration), not once per real visitor
// — view counts will under-report actual traffic. Not fixed here: splitting
// the read from the increment is a legitimate but separate backend change,
// and viewCount isn't used for anything load-bearing today (display only).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer } from "@/components/Footer";
import { getPublicJobServer, type PublicJobDetail } from "@/lib/jobs-ssr";

export const revalidate = 3600; // 1 hour

const CONTRACT_LABEL: Record<string, string> = {
  FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract",
  TEMPORARY: "Temporary", INTERNSHIP: "Internship", FREELANCE: "Freelance",
};

// schema.org JobPosting employmentType enum doesn't have a FREELANCE value —
// CONTRACTOR is the closest real fit for both CONTRACT and FREELANCE.
const EMPLOYMENT_TYPE_SCHEMA_ORG: Record<string, string> = {
  FULL_TIME: "FULL_TIME", PART_TIME: "PART_TIME", CONTRACT: "CONTRACTOR",
  TEMPORARY: "TEMPORARY", INTERNSHIP: "INTERN", FREELANCE: "CONTRACTOR",
};

function fmtSalary(job: PublicJobDetail): string | null {
  const min = typeof job.salaryMin === "string" ? parseFloat(job.salaryMin) : job.salaryMin;
  const max = typeof job.salaryMax === "string" ? parseFloat(job.salaryMax) : job.salaryMax;
  if (!min || !max) return null;
  return `${job.salaryCurrency} ${min.toLocaleString()} – ${max.toLocaleString()} / mo`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function Chip({ children, color = "gray" }: { children: React.ReactNode; color?: "gray" | "teal" | "blue" | "violet" | "green" }) {
  const s: Record<string, { color: string; bg: string; border: string }> = {
    gray:   { color: "#a1a1aa", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)"  },
    teal:   { color: "#5eead4", bg: "rgba(99,102,241,0.1)",   border: "rgba(99,102,241,0.25)"  },
    blue:   { color: "#93c5fd", bg: "rgba(96,165,250,0.1)",   border: "rgba(96,165,250,0.25)"  },
    violet: { color: "#c4b5fd", bg: "rgba(167,139,250,0.1)",  border: "rgba(167,139,250,0.25)" },
    green:  { color: "#86efac", bg: "rgba(74,222,128,0.1)",   border: "rgba(74,222,128,0.25)"  },
  };
  const c = s[color];
  return (
    <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, fontWeight: 600, color: c.color, background: c.bg, border: `1px solid ${c.border}`, whiteSpace: "nowrap" as const }}>
      {children}
    </span>
  );
}

// ── JSON-LD (schema.org JobPosting) ─────────────────────────────────────────
// Property coverage — see the SEO phase-1 report for the full table.
// Nothing below is fabricated: every value traces to a real, currently-set
// field on the JobPost row, or is omitted entirely when the source field is
// null/unavailable (validThrough, jobBenefits, hiringOrganization.logo/.sameAs).
function buildJobPostingJsonLd(job: PublicJobDetail, appUrl: string) {
  const datePosted = job.approvedAt ?? job.createdAt;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    identifier: {
      "@type": "PropertyValue",
      name: "DirectHire",
      value: job.id,
    },
    datePosted: new Date(datePosted).toISOString(),
    employmentType: EMPLOYMENT_TYPE_SCHEMA_ORG[job.contractType] ?? "OTHER",
    hiringOrganization: {
      "@type": "Organization",
      name: job.companyName,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: job.city || undefined,
        addressCountry: job.country,
      },
    },
    qualifications: job.requirements,
    experienceRequirements: `${job.experienceRequired}+ years`,
    industry: job.category,
    totalJobOpenings: job.positionsAvailable,
    directApply: false,
    url: `${appUrl}/jobs/${job.id}`,
  };

  const minValue = Number(job.salaryMin);
  const maxValue = Number(job.salaryMax);
  if (job.salaryMin != null && job.salaryMax != null && Number.isFinite(minValue) && Number.isFinite(maxValue)) {
    jsonLd.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.salaryCurrency,
      value: {
        "@type": "QuantitativeValue",
        minValue,
        maxValue,
        unitText: "MONTH",
      },
    };
  }
  if (job.applicationDeadline) {
    jsonLd.validThrough = new Date(job.applicationDeadline).toISOString();
  }
  if (job.benefits) {
    jsonLd.jobBenefits = job.benefits;
  }
  if (job.requiredSkills?.length > 0) {
    jsonLd.skills = job.requiredSkills.join(", ");
  }
  if (job.remoteAllowed) {
    jsonLd.jobLocationType = "TELECOMMUTE";
  }

  return jsonLd;
}

// ── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const job = await getPublicJobServer(params.id);
  if (!job) {
    return { title: "Job not found — DirectHire" };
  }

  const location = [job.city, job.country].filter(Boolean).join(", ");
  const title = `${job.title} at ${job.companyName} — DirectHire`;
  const description = job.description.length > 200
    ? `${job.description.slice(0, 197)}...`
    : job.description;

  return {
    title,
    description,
    alternates: { canonical: `/jobs/${job.id}` },
    openGraph: {
      title,
      description: `${job.title} · ${job.companyName} · ${location}`,
      type: "website",
      // No job-specific or default site OG image asset currently exists —
      // omitted rather than pointing at a path that doesn't resolve.
    },
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function PublicJobDetailPage({ params }: { params: { id: string } }) {
  const job = await getPublicJobServer(params.id);
  if (!job) notFound();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://directhire.cc";
  const jsonLd = buildJobPostingJsonLd(job, appUrl);
  const salary = fmtSalary(job);
  const returnTo = `/jobs/${job.id}`;

  return (
    <div style={{ minHeight: "100vh", background: "var(--glass-base)", fontFamily: "var(--font-body)" }}>
      {/* eslint-disable-next-line react/no-danger -- JSON-LD requires raw script injection; escaped below to prevent breaking out of the tag */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 64px" }}>
        {/* Breadcrumb */}
        <Link href="/jobs" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#71717a", textDecoration: "none", marginBottom: 24 }}>
          ← Back to all jobs
        </Link>

        {/* Header card — the job-detail hero; blur is appropriate here per the performance rule */}
        <div className="glass-card" style={{ padding: 32, marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#fff", lineHeight: 1.25, margin: "0 0 8px" }}>{job.title}</h1>
          <p style={{ fontSize: 15, color: "#a1a1aa", margin: "0 0 20px" }}>
            {job.companyName} · {[job.city, job.country].filter(Boolean).join(", ")}
          </p>

          {salary && <div style={{ fontSize: 17, fontWeight: 700, color: "#86efac", marginBottom: 16 }}>{salary}</div>}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            <Chip color="violet">{CONTRACT_LABEL[job.contractType] ?? job.contractType}</Chip>
            {job.remoteAllowed && <Chip color="blue">Remote</Chip>}
            {job.visaSupport && <Chip color="teal">Visa support</Chip>}
            {job.accommodation && <Chip color="blue">Accommodation</Chip>}
            <Chip color="gray">{job.category}</Chip>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, fontSize: 13, color: "#71717a", paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span>Posted {fmtDate(job.approvedAt ?? job.createdAt)}</span>
            <span>{job.experienceRequired}+ years experience</span>
            <span>{job.positionsAvailable} position{job.positionsAvailable !== 1 ? "s" : ""} available</span>
            {job.applicationDeadline && <span>Apply by {fmtDate(job.applicationDeadline)}</span>}
          </div>
        </div>

        {/* CTA card */}
        <div style={{ background: "linear-gradient(135deg, rgba(20,184,166,0.1), rgba(99,102,241,0.06))", border: "1px solid rgba(20,184,166,0.25)", borderRadius: 16, padding: 24, marginBottom: 24, textAlign: "center" as const }}>
          <p style={{ fontSize: 14, color: "#e4e4e7", margin: "0 0 16px" }}>Sign in or create a free account to apply for this role.</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" as const }}>
            <Link
              href={`/login?redirect=${encodeURIComponent(returnTo)}`}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 44, padding: "0 24px", borderRadius: 10, background: "linear-gradient(135deg,#14b8a6,#0d9488)", color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none" }}
            >
              Apply on DirectHire
            </Link>
            <Link
              href={`/register?redirect=${encodeURIComponent(returnTo)}`}
              className="btn-glass"
              style={{ height: 44, padding: "0 24px", fontSize: 14, textDecoration: "none" }}
            >
              Create an account
            </Link>
          </div>
        </div>

        {/* Skills */}
        {job.requiredSkills?.length > 0 && (
          <div className="glass-card" style={{ padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#555", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 12 }}>Required skills</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {job.requiredSkills.map(s => (
                <span key={s} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", color: "#5eead4" }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div className="glass-card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "0 0 12px" }}>About this role</h2>
          <p style={{ fontSize: 14, color: "#a1a1aa", lineHeight: 1.8, margin: 0, whiteSpace: "pre-wrap" as const }}>{job.description}</p>
        </div>

        {/* Requirements */}
        <div className="glass-card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "0 0 12px" }}>Requirements</h2>
          <p style={{ fontSize: 14, color: "#a1a1aa", lineHeight: 1.8, margin: 0, whiteSpace: "pre-wrap" as const }}>{job.requirements}</p>
        </div>

        {/* Benefits */}
        {job.benefits && (
          <div className="glass-card" style={{ padding: 24, marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "0 0 12px" }}>Benefits</h2>
            <p style={{ fontSize: 14, color: "#a1a1aa", lineHeight: 1.8, margin: 0, whiteSpace: "pre-wrap" as const }}>{job.benefits}</p>
          </div>
        )}

        {/* Bottom CTA */}
        <div style={{ textAlign: "center" as const, marginTop: 32 }}>
          <Link
            href={`/login?redirect=${encodeURIComponent(returnTo)}`}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 48, padding: "0 32px", borderRadius: 12, background: "linear-gradient(135deg,#14b8a6,#0d9488)", color: "#fff", fontSize: 15, fontWeight: 700, textDecoration: "none" }}
          >
            Apply on DirectHire
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
