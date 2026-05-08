"use client";
// src/app/(app)/employer/dashboard/page.tsx

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { userApi, employerApi } from "@/lib/api-client";
import { LoadingPage, ToastDisplay, type ToastData } from "@/components/ui";

/* ─── Types ──────────────────────────────────────────────────────────────────── */

interface EmpProfileData {
  user:         { email: string; status: string };
  profile:      {
    companyName?: string; industry?: string; companySize?: string;
    subscriptionPlan?: string; subscriptionStatus?: string;
    trialEndsAt?: string; isVerified?: boolean; website?: string;
    country?: string; city?: string; businessDescription?: string;
    hiringCountries?: { country: string }[];
    requiredSkills?: { skill: string }[];
  } | null;
  onboarding:   { onboardingStatus: string; isSubmitted: boolean; completedSteps: number[]; totalSteps: number } | null;
  verification: { reviewStatus: string; changesRequested?: string } | null;
  notifications: { id: string; title: string; body: string; isRead: boolean; createdAt: string }[];
}

interface Job {
  id:             string;
  title:          string;
  country?:       string;
  city?:          string;
  status?:        string;
  applicantCount?: number;
  salaryMin?:     number;
  salaryMax?:     number;
  currency?:      string;
  createdAt?:     string;
  skills?:        { skill: string }[];
}

interface Application {
  id:             string;
  status:         string;
  aiMatchScore?:  number;
  matchScore?:    number;
  appliedAt?:     string;
  jobPost?:       { title?: string; country?: string } | null;
  workerProfile?: {
    firstName?: string; lastName?: string;
    countryOfResidence?: string; skills?: { skill: string }[];
  } | null;
}

const STATUS_INFO: Record<string, { label: string; badge: string; desc: string; cta?: string }> = {
  APPROVED:      { label: "Verified & Active", badge: "green", desc: "Your company is active and can post jobs." },
  SUBMITTED:     { label: "Under Review",      badge: "blue",  desc: "We are verifying your company details. 24–48 hours." },
  PENDING_REVIEW:{ label: "Under Review",      badge: "blue",  desc: "We are reviewing your company." },
  NEEDS_CHANGES: { label: "Changes Required",  badge: "amber", desc: "Check your email for details.", cta: "Update Company" },
  REJECTED:      { label: "Not Approved",      badge: "red",   desc: "Contact support for details." },
  DRAFT:         { label: "Incomplete",        badge: "slate", desc: "Complete your company profile to get verified.", cta: "Complete Setup" },
  IN_PROGRESS:   { label: "In Progress",       badge: "cyan",  desc: "Continue your profile.", cta: "Continue Setup" },
};

/* ─── KPI card ───────────────────────────────────────────────────────────────── */

function KpiCard({ label, value, icon, sub }: { label: string; value: string | number; icon: string; sub?: string }) {
  return (
    <div className="bg-navy-2 border border-border rounded-xl p-4 sm:p-5 md:p-6 flex flex-col gap-2 hover:border-teal-500/35 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-xs sm:text-xs font-semibold text-muted uppercase tracking-wider">{label}</span>
        <span className="text-lg sm:text-xl">{icon}</span>
      </div>
      <span className="font-display font-black text-2xl sm:text-3xl md:text-4xl text-white leading-none">{value}</span>
      {sub && <span className="text-xs sm:text-sm text-employer-3 font-body">{sub}</span>}
    </div>
  );
}

/* ─── Job Card ───────────────────────────────────────────────────────────────── */

function JobCard({ job }: { job: Job }) {
  const salary = job.salaryMin
    ? `${job.currency ?? "$"}${(job.salaryMin / 1000).toFixed(0)}K${job.salaryMax ? `–${(job.salaryMax / 1000).toFixed(0)}K` : "+"}`
    : null;
  const skills = job.skills?.slice(0, 3) ?? [];

  return (
    <Link href={`/employer/jobs/${job.id}`} style={{ textDecoration: "none" }}>
      <div style={{
        background: "var(--navy-2)", border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)", padding: "20px",
        display: "flex", flexDirection: "column", gap: 12,
        height: "100%", transition: "border-color 0.2s, transform 0.2s",
      }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(13,148,136,0.4)";
          (e.currentTarget as HTMLDivElement).style.transform   = "translateY(-2px)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
          (e.currentTarget as HTMLDivElement).style.transform   = "translateY(0)";
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, color: "var(--white)" }}>{job.title}</div>
          {job.applicantCount != null && (
            <span style={{
              padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, flexShrink: 0,
              background: "rgba(13,148,136,0.12)", color: "var(--employer-3)",
              border: "1px solid rgba(13,148,136,0.2)",
            }}>{job.applicantCount} applicants</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-body)" }}>
          {[job.city, job.country].filter(Boolean).join(", ") || "Remote"}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {salary && (
            <span style={{ padding: "3px 9px", borderRadius: 999, fontSize: 11, background: "rgba(16,185,129,0.1)", color: "var(--success)", border: "1px solid rgba(16,185,129,0.2)" }}>{salary}</span>
          )}
          {skills.map(s => (
            <span key={s.skill} style={{ padding: "3px 9px", borderRadius: 999, fontSize: 11, background: "rgba(13,148,136,0.1)", color: "var(--employer-3)", border: "1px solid rgba(13,148,136,0.2)" }}>{s.skill}</span>
          ))}
        </div>
      </div>
    </Link>
  );
}

/* ─── Content ────────────────────────────────────────────────────────────────── */

function EmployerDashboardContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [profileData, setProfileData]     = useState<EmpProfileData | null>(null);
  const [jobs, setJobs]                   = useState<Job[]>([]);
  const [topApps, setTopApps]             = useState<Application[]>([]);
  const [activeLockCount, setActiveLockCount] = useState<number | null>(null);
  const [loading, setLoading]             = useState(true);
  const [toast, setToast]                 = useState<ToastData>(null);

  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (searchParams.get("submitted") === "1") showToast("Company profile submitted for review!");
  }, []);

  useEffect(() => {
    Promise.all([
      userApi.getProfile(),
      employerApi.getJobs({ limit: "6" }),
      employerApi.getApplications({ limit: "5" }),
      employerApi.getLocks({ status: "ACTIVE", limit: "1" }),
    ]).then(([pRes, jRes, aRes, lRes]) => {
      if (!pRes.success) { router.push("/login"); return; }
      setProfileData(pRes.data as EmpProfileData);

      if (jRes.success) {
        const raw = jRes.data as { jobs?: Job[] } | Job[];
        setJobs(Array.isArray(raw) ? raw : (raw.jobs ?? []));
      }
      if (aRes.success) {
        const raw = aRes.data as { applications?: Application[] } | Application[];
        const apps = Array.isArray(raw) ? raw : (raw.applications ?? []);
        setTopApps(apps.sort((a, b) => (b.aiMatchScore ?? b.matchScore ?? 0) - (a.aiMatchScore ?? a.matchScore ?? 0)));
      }
      if (lRes.success && lRes.data) {
        const d = lRes.data as { total?: number };
        setActiveLockCount(d.total ?? 0);
      }
      setLoading(false);
    });
  }, [router]);

  if (loading) return <LoadingPage color="blue" />;
  if (!profileData) return null;

  const { user, profile, onboarding, notifications } = profileData;
  const company       = profile?.companyName ?? user.email;
  const onbStatus     = onboarding?.onboardingStatus ?? "DRAFT";
  const statusInfo    = STATUS_INFO[onbStatus] ?? STATUS_INFO.DRAFT;
  const completionPct = onboarding
    ? Math.round((onboarding.completedSteps.length / onboarding.totalSteps) * 100)
    : 0;
  const isActive    = onbStatus === "APPROVED";
  const needsAction = ["DRAFT", "IN_PROGRESS", "NEEDS_CHANGES"].includes(onbStatus);
  const unread      = notifications.filter(n => !n.isRead).length;

  const totalApplicants  = topApps.length;
  const shortlisted      = topApps.filter(a => a.status === "SHORTLISTED").length;
  const interviews       = topApps.filter(a => ["INTERVIEWED", "INTERVIEW"].includes(a.status)).length;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", fontFamily: "var(--font-body)" }}>
      <ToastDisplay toast={toast} />

      {/* ── Welcome hero ─────────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-9 bg-gradient-to-b from-teal-500/5 to-transparent border-b border-border">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6 md:gap-8 flex-wrap">
          <div className="w-full">
            <div className="inline-flex items-center gap-1.5 bg-teal-500/10 border border-teal-500/25 rounded-full px-3 sm:px-4 py-1.5 sm:py-2 mb-2 sm:mb-3 md:mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-employer-primary" />
              <span className="text-xs sm:text-xs font-semibold uppercase tracking-wider text-employer-3">Employer Portal</span>
            </div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl md:text-4xl text-white mb-1.5 sm:mb-2 md:mb-3 tracking-tight">
              Welcome back, {company} 👋
            </h1>
            <p className="text-sm sm:text-base text-muted leading-relaxed max-w-md">
              {isActive
                ? `AI is actively matching candidates to your ${jobs.length} open position${jobs.length !== 1 ? "s" : ""}.`
                : statusInfo.desc}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            {needsAction && (
              <Link href="/employer/onboarding" className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg bg-employer-primary text-white text-sm sm:text-base font-semibold shadow-glow hover:opacity-90 transition-opacity text-center">
                {statusInfo.cta ?? "Continue Setup"} →
              </Link>
            )}
            {isActive && (
              <Link href="/employer/jobs/new" className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg bg-employer-primary text-white text-sm sm:text-base font-semibold shadow-glow hover:opacity-90 transition-opacity text-center">
                + Post a Job
              </Link>
            )}
            <Link href="/employer/workers" className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg border border-border bg-transparent text-white text-sm sm:text-base font-semibold hover:bg-white/5 transition-colors text-center">
              Find Talent
            </Link>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-12 flex flex-col gap-6 md:gap-7">

        {/* ── KPI row ──────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
          <KpiCard label="Active Jobs"         value={jobs.length}       icon="💼" sub="Open positions" />
          <KpiCard label="Total Applicants"    value={totalApplicants}   icon="👥" sub="Across all jobs" />
          <KpiCard label="AI Shortlisted"      value={shortlisted}       icon="⭐" sub="Top matches" />
          <KpiCard label="Interviews Scheduled" value={interviews}        icon="📅" sub={interviews > 0 ? "Check calendar" : "None yet"} />
        </div>

        {/* ── Top AI Candidates ────────────────────────────────────────────────── */}
        {topApps.length > 0 && (
          <div style={{
            background: "var(--navy-2)", border: "1px solid var(--border)",
            borderLeft: "3px solid var(--employer-primary)",
            borderRadius: "var(--r-lg)", overflow: "hidden",
          }}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--white)", margin: 0 }}>
                AI Top Matches
              </h2>
              <Link href="/employer/applications" style={{ fontSize: 13, fontWeight: 600, color: "var(--employer-3)", textDecoration: "none" }}>
                View all →
              </Link>
            </div>

            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "48px 1fr 140px 140px 80px",
              padding: "10px 22px",
              background: "rgba(255,255,255,0.02)",
              borderBottom: "1px solid var(--border)",
            }}>
              {["Rank", "Candidate", "Match Score", "Role", "Actions"].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
              ))}
            </div>

            {topApps.map((app, i) => {
              const name  = [app.workerProfile?.firstName, app.workerProfile?.lastName].filter(Boolean).join(" ") || "Anonymous";
              const score = app.aiMatchScore ?? app.matchScore ?? 0;
              const role  = app.jobPost?.title ?? "—";
              const loc   = app.workerProfile?.countryOfResidence ?? app.jobPost?.country ?? "—";

              return (
                <div key={app.id} style={{
                  display: "grid", gridTemplateColumns: "48px 1fr 140px 140px 80px",
                  padding: "14px 22px", alignItems: "center",
                  borderBottom: "1px solid var(--border)",
                  transition: "background 0.15s",
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Rank */}
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 800,
                    background: i === 0 ? "linear-gradient(135deg, var(--employer-primary), var(--employer-2))" : "rgba(255,255,255,0.06)",
                    color: i === 0 ? "#fff" : "var(--muted)",
                    boxShadow: i === 0 ? "0 0 10px var(--employer-glow)" : "none",
                  }}>{i + 1}</div>

                  {/* Candidate */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                      background: "linear-gradient(135deg, var(--employer-primary), var(--employer-2))",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700, color: "#fff",
                    }}>{name[0]?.toUpperCase() ?? "?"}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--white)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{loc}</div>
                    </div>
                  </div>

                  {/* Match score */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 5, background: "rgba(13,148,136,0.12)", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ width: `${score}%`, height: "100%", background: "linear-gradient(90deg, var(--employer-primary), var(--employer-2))", borderRadius: 999 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--employer-3)", fontFamily: "var(--font-display)", flexShrink: 0 }}>{score}%</span>
                  </div>

                  {/* Role */}
                  <span style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{role}</span>

                  {/* Actions */}
                  <Link href={`/employer/applications?highlight=${app.id}`} style={{
                    padding: "5px 12px", borderRadius: "var(--r-sm)", fontSize: 11, fontWeight: 600,
                    background: "rgba(13,148,136,0.12)", color: "var(--employer-3)",
                    border: "1px solid rgba(13,148,136,0.2)", textDecoration: "none",
                  }}>View</Link>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Active Jobs grid ──────────────────────────────────────────────────── */}
        {jobs.length > 0 && (
          <div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 md:mb-5">
              <h2 className="font-display font-bold text-xl sm:text-2xl text-white">
                Active Jobs
              </h2>
              <Link href="/employer/jobs" className="text-sm font-semibold text-employer-3 hover:text-employer-primary transition-colors">
                Manage all jobs →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
              {jobs.slice(0, 6).map(job => <JobCard key={job.id} job={job} />)}
            </div>
          </div>
        )}

        {/* ── Status + Notifications ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">

          {/* Verification status */}
          <div className="bg-navy-2 border border-border rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
              <h3 className="font-display font-bold text-base sm:text-lg text-white">Verification Status</h3>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { label: "Profile Complete",   done: completionPct === 100 },
                { label: "Submitted",          done: !!onboarding?.isSubmitted },
                { label: "Under Review",       done: ["SUBMITTED", "PENDING_REVIEW", "APPROVED"].includes(onbStatus) },
                { label: "Verified & Active",  done: isActive },
              ].map((step, i) => (
                <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700,
                    background: step.done ? "linear-gradient(135deg, var(--employer-primary), var(--employer-2))" : "rgba(255,255,255,0.05)",
                    color: step.done ? "#fff" : "var(--muted)",
                    border: step.done ? "none" : "1px solid var(--border)",
                    boxShadow: step.done ? "0 0 10px var(--employer-glow)" : "none",
                  }}>{step.done ? "✓" : i + 1}</div>
                  <span style={{ fontSize: 13, color: step.done ? "var(--white)" : "var(--muted)", fontWeight: step.done ? 500 : 400, fontFamily: "var(--font-body)" }}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Notifications */}
          <div style={{
            background: "var(--navy-2)", border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)", overflow: "hidden",
          }}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--white)", margin: 0 }}>Notifications</h3>
              {unread > 0 && (
                <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "var(--employer-primary)", color: "#fff" }}>
                  {unread} new
                </span>
              )}
            </div>
            {notifications.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No notifications yet</div>
            ) : (
              <div>
                {notifications.slice(0, 4).map(n => (
                  <div key={n.id} style={{
                    padding: "13px 22px", borderBottom: "1px solid var(--border)",
                    background: !n.isRead ? "rgba(13,148,136,0.04)" : "transparent",
                    display: "flex", alignItems: "flex-start", gap: 10,
                  }}>
                    {!n.isRead && (
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--employer-primary)", flexShrink: 0, marginTop: 5, boxShadow: "0 0 6px var(--employer-primary)" }} />
                    )}
                    <div style={{ marginLeft: n.isRead ? 17 : 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--white)", marginBottom: 2 }}>{n.title}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{n.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Quick links ───────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
          {[
            { href: "/employer/workers",     icon: "🔍", label: "Find Workers",   sub: "Browse all talent" },
            { href: "/employer/applications",icon: "👥", label: "Applications",   sub: `${totalApplicants} total` },
            { href: "/employer/locks",       icon: "🔒", label: "Reservations",   sub: activeLockCount ? `${activeLockCount} active` : "Manage holds" },
            { href: "/employer/billing",     icon: "💳", label: "Billing",        sub: profile?.subscriptionPlan ?? "Choose a plan" },
          ].map(({ href, icon, label, sub }) => (
            <Link key={href} href={href} className="bg-navy-2 border border-border rounded-xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 no-underline transition-all hover:border-teal-500/35 hover:bg-teal-500/5">
              <div className="w-9 sm:w-10 h-9 sm:h-10 rounded-md bg-teal-500/12 flex items-center justify-center text-lg sm:text-xl flex-shrink-0">{icon}</div>
              <div className="min-w-0">
                <div className="text-sm sm:text-base font-semibold text-white truncate">{label}</div>
                <div className="text-xs sm:text-sm text-muted line-clamp-1">{sub}</div>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}

export default function EmployerDashboardPage() {
  return (
    <Suspense fallback={<LoadingPage color="blue" />}>
      <EmployerDashboardContent />
    </Suspense>
  );
}
