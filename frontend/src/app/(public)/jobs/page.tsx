// frontend/src/app/(public)/jobs/page.tsx
// Public job listing — server component. Page 1 results are fetched and
// rendered here, in the initial HTML, so Googlebot (and anyone with JS
// disabled) sees real job cards without waiting on a client-side fetch.
// Filters live in the URL (searchParams); changing a filter in
// JobsFilterClient navigates here with new params, which re-runs this
// Server Component server-side — that navigation *is* the fetch trigger,
// replacing the old debounced client useEffect.
//
// All interactivity (click-to-open slide-over, Apply flow, filter form
// controls, "load more") lives in ./JobsFilterClient.tsx. This file only
// renders presentational card content — title/company/salary/chips/skills
// — and wraps each real job card in <JobCardInteractive> so those client
// islands can attach behavior without owning the markup.

import type { Metadata } from "next";
import Link from "next/link";
import {
  getPublicJobsListServer,
  getPublicJobCategoriesServer,
  getPublicJobCountriesServer,
  type PublicJobsSearchParams,
  type PublicJobListRow,
} from "@/lib/jobs-ssr";
import {
  JobsFilterClient,
  JobsInteractionProvider,
  JobCardInteractive,
  LoadMoreJobs,
  SortBar,
  CONTRACT_LABEL,
  timeAgo,
  fmtSalary,
  fmtExternalSalary,
  type Job,
} from "./JobsFilterClient";

export const revalidate = 3600; // 1 hour

// ── Metadata ─────────────────────────────────────────────────────────────────
// Canonical always points at the clean /jobs URL (no query string) for this
// pass — filtered variants aren't given their own indexable canonical yet,
// to avoid duplicate-content across the very large param combination space.

export async function generateMetadata(
  { searchParams }: { searchParams: PublicJobsSearchParams },
): Promise<Metadata> {
  const country = typeof searchParams.country === "string" ? searchParams.country : undefined;

  const title = country
    ? `Jobs in ${country} — DirectHire`
    : "Browse Jobs — DirectHire";
  const description = country
    ? `Browse verified job openings in ${country} on DirectHire — visa support, relocation assistance, and direct employer applications.`
    : "Browse verified job openings on DirectHire — filter by country, category, contract type, and more. Visa support and relocation assistance available.";

  return {
    title,
    description,
    alternates: { canonical: "/jobs" },
    openGraph: { title, description, type: "website" },
  };
}

// ── Presentational card content (server-rendered) ───────────────────────────
// Duplicated (small) from JobsFilterClient's Chip — that file is a Client
// Component and this file can't import from it without pulling this JSX
// into the client bundle, defeating the point of rendering it server-side.

function Chip({
  children, color = "gray",
}: { children: React.ReactNode; color?: "gray" | "teal" | "blue" | "violet" | "green" | "amber" }) {
  const s: Record<string, { color: string; bg: string; border: string }> = {
    gray:   { color: "#a1a1aa", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)"  },
    teal:   { color: "#5eead4", bg: "rgba(99,102,241,0.1)",  border: "rgba(99,102,241,0.25)"  },
    blue:   { color: "#93c5fd", bg: "rgba(96,165,250,0.1)",   border: "rgba(96,165,250,0.25)"  },
    violet: { color: "#c4b5fd", bg: "rgba(167,139,250,0.1)",  border: "rgba(167,139,250,0.25)" },
    green:  { color: "#86efac", bg: "rgba(74,222,128,0.1)",   border: "rgba(74,222,128,0.25)"  },
    amber:  { color: "#fcd34d", bg: "rgba(251,191,36,0.1)",   border: "rgba(251,191,36,0.25)"  },
  };
  const c = s[color];
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, fontWeight: 600, color: c.color, background: c.bg, border: `1px solid ${c.border}`, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function toClientJob(row: PublicJobListRow): Job {
  return { ...row, salaryMin: row.salaryMin ?? 0, salaryMax: row.salaryMax ?? 0 };
}

function JobCardContent({ job }: { job: PublicJobListRow }) {
  const salary = fmtSalary(job);
  const skills = job.requiredSkills ?? [];
  const visibleSkills = skills.slice(0, 4);
  const extra = skills.length - 4;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
        <div style={{ minWidth: 0 }}>
          {/* The one crawlable link into the SSR detail page — stopPropagation
              keeps a click on the title from also triggering the card's
              open-slide-over handler (attached by the JobCardInteractive
              wrapper around this content). */}
          <Link
            href={`/jobs/${job.id}`}
            onClick={e => e.stopPropagation()}
            style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.3, marginBottom: 4, display: "block", textDecoration: "none" }}
          >
            {job.title}
          </Link>
          <div style={{ fontSize: 12, color: "#71717a" }}>
            {job.companyName} · {[job.city, job.country].filter(Boolean).join(", ")}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#555", whiteSpace: "nowrap", flexShrink: 0, marginTop: 2 }}>{timeAgo(job.createdAt)}</div>
      </div>

      {salary && <div style={{ fontSize: 13, fontWeight: 600, color: "#86efac", marginBottom: 10 }}>{salary}</div>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {job.contractType && <Chip color="violet">{CONTRACT_LABEL[job.contractType] ?? job.contractType}</Chip>}
        {job.remoteAllowed && <Chip color="blue">Remote</Chip>}
        {job.visaSupport && <Chip color="teal">Visa support</Chip>}
        {job.accommodation && <Chip color="blue">Accommodation</Chip>}
      </div>

      {visibleSkills.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
          {visibleSkills.map(s => (
            <span key={s} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#71717a" }}>{s}</span>
          ))}
          {extra > 0 && <span style={{ fontSize: 11, color: "#555", alignSelf: "center" }}>+{extra} more</span>}
        </div>
      )}
    </>
  );
}

function ExternalJobCard({ job }: { job: PublicJobListRow }) {
  const salary = fmtExternalSalary(job);
  return (
    <div style={{ background: "rgba(30,41,59,0.6)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.3, marginBottom: 4 }}>{job.title}</div>
          <div style={{ fontSize: 12, color: "#71717a" }}>{[job.city, job.country].filter(Boolean).join(", ")}</div>
        </div>
        <Chip color="amber">External</Chip>
      </div>
      {salary && <div style={{ fontSize: 13, fontWeight: 600, color: "#86efac", marginBottom: 10 }}>{salary}</div>}
      {job.contractType && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          <Chip color="violet">{CONTRACT_LABEL[job.contractType] ?? job.contractType}</Chip>
        </div>
      )}
      <div style={{ fontSize: 12, color: "#71717a", marginBottom: 14 }}>Hosted on {job.sourceName} — opens in a new tab.</div>
      <a
        href={job.externalUrl}
        target="_blank"
        rel="noopener nofollow sponsored"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 36, padding: "0 18px", borderRadius: 9, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none" }}
      >
        View on {job.sourceName} ↗
      </a>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function JobsPage({
  searchParams,
}: {
  searchParams: PublicJobsSearchParams;
}) {
  const [{ jobs, total, totalPages }, categories, countries] = await Promise.all([
    getPublicJobsListServer(searchParams, 1, 20),
    getPublicJobCategoriesServer(),
    getPublicJobCountriesServer(),
  ]);

  const clientJobs = jobs.map(toClientJob);

  return (
    <div style={{ minHeight: "100vh", background: "var(--glass-base)", fontFamily: "var(--font-body)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 24px 64px" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>Find your next role</h1>
          <p style={{ fontSize: 14, color: "#71717a", margin: 0 }}>
            {total.toLocaleString()} open position{total !== 1 ? "s" : ""}
          </p>
        </div>

        <JobsInteractionProvider>
          <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
            <JobsFilterClient categories={categories} countries={countries} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                <SortBar />
              </div>

              {jobs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "64px 24px", color: "#71717a" }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#a1a1aa", marginBottom: 6 }}>No jobs match your filters</div>
                  <div style={{ fontSize: 13 }}>Try broadening your search or clearing some filters.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {jobs.map((job, i) => job.source === "external" ? (
                    <ExternalJobCard key={job.id} job={job} />
                  ) : (
                    <JobCardInteractive key={job.id} job={clientJobs[i]} allJobs={clientJobs}>
                      <JobCardContent job={job} />
                    </JobCardInteractive>
                  ))}
                </div>
              )}

              {totalPages > 1 && jobs.length < total && (
                <LoadMoreJobs initialCount={jobs.length} total={total} />
              )}
            </div>
          </div>
        </JobsInteractionProvider>
      </div>
    </div>
  );
}
