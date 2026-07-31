// frontend/src/app/(public)/jobs/job-format.ts
// Pure, side-effect-free formatting helpers shared by both page.tsx (Server
// Component) and JobsFilterClient.tsx (Client Component). Deliberately NOT
// in JobsFilterClient.tsx despite being used there too: that file has
// "use client", and Next's RSC webpack loader wraps every export of a
// "use client" module — including plain non-component functions/data, not
// just components — into a client reference when a Server Component imports
// it. page.tsx was calling these directly (fmtSalary(job), not <fmtSalary/>),
// which crashed in production with "fmtSalary is not a function" /
// "fmtExternalSalary is not a function" (readable only after deobfuscating
// the minified prod bundle — dev mode didn't surface it the same way). This
// file has no "use client" directive, so both sides can import the real
// function/object, not a client-reference proxy.

export const CONTRACT_LABEL: Record<string, string> = {
  FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract",
  TEMPORARY: "Temporary", INTERNSHIP: "Internship", FREELANCE: "Freelance",
};

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30)  return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export function fmtSalary(job: { salaryMin?: number | string | null; salaryMax?: number | string | null; salaryCurrency: string }): string | null {
  const min = typeof job.salaryMin === "string" ? parseFloat(job.salaryMin) : job.salaryMin;
  const max = typeof job.salaryMax === "string" ? parseFloat(job.salaryMax) : job.salaryMax;
  if (!min || !max) return null;
  return `${job.salaryCurrency} ${min.toLocaleString()} – ${max.toLocaleString()} / mo`;
}

// External jobs may have only one of salaryMin/salaryMax (whatever the
// source board disclosed) — fmtSalary above requires both, so this is a
// separate, more permissive formatter rather than loosening fmtSalary's
// contract for every real job everywhere.
export function fmtExternalSalary(job: { salaryMin?: number | string | null; salaryMax?: number | string | null; salaryCurrency?: string }): string | null {
  const min = typeof job.salaryMin === "string" ? parseFloat(job.salaryMin) : job.salaryMin;
  const max = typeof job.salaryMax === "string" ? parseFloat(job.salaryMax) : job.salaryMax;
  if (!min && !max) return null;
  const cur = job.salaryCurrency ?? "";
  if (min && max) return `${cur} ${min.toLocaleString()} – ${max.toLocaleString()}`.trim();
  return `${cur} ${(min ?? max)!.toLocaleString()}`.trim();
}
