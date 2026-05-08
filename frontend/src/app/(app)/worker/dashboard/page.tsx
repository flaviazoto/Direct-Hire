"use client";
// src/app/(app)/worker/dashboard/page.tsx

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { userApi, workerApi } from "@/lib/api-client";
import LockStatusBanner from "@/components/worker/LockStatusBanner";
import { LoadingPage, ToastDisplay, type ToastData } from "@/components/ui";

/* ─── Types ──────────────────────────────────────────────────────────────────── */

interface ProfileData {
  user:         { email: string; status: string; accountStatus?: string; onboardingComplete?: boolean; isEmailVerified: boolean };
  profile:      {
    firstName?: string; lastName?: string; profession?: string;
    countryOfResidence?: string; yearsExperience?: string; expectedSalary?: string;
    trustScore?: number; riskScore?: number; isSearchable?: boolean; documentsVerified?: boolean;
    skills?: { skill: string }[]; languages?: { language: string; proficiencyLevel: string }[];
    targetCountries?: { country: string }[];
  } | null;
  onboarding:   { currentStep: number; totalSteps: number; onboardingStatus: string; isSubmitted: boolean; completedSteps: number[] } | null;
  verification: { reviewStatus: string; adminNotes?: string; changesRequested?: string } | null;
  notifications: { id: string; title: string; body: string; type: string; isRead: boolean; createdAt: string }[];
  profileCompletionScore?: number | null;
}

interface Application {
  id:     string;
  status: string;
}

interface Job {
  id:        string;
  title:     string;
  country?:  string;
  city?:     string;
  salaryMin?: number;
  salaryMax?: number;
  currency?:  string;
  salaryPeriod?: string;
  skills?:   { skill: string }[];
  matchScore?: number;
  createdAt?: string;
  employer?: { companyName?: string };
}

const STATUS_INFO: Record<string, { label: string; cta?: string; desc: string }> = {
  APPROVED:      { label: "Approved",      desc: "Your profile is live and searchable." },
  SUBMITTED:     { label: "Under Review",  desc: "Our team is reviewing your application. Usually 24–48 hours." },
  PENDING_REVIEW:{ label: "Under Review",  desc: "Our team is reviewing your application." },
  NEEDS_CHANGES: { label: "Action Needed", desc: "Changes requested. Check your email for details.", cta: "Update Profile" },
  REJECTED:      { label: "Not Approved",  desc: "Your application was not approved. See your email." },
  DRAFT:         { label: "Draft",         desc: "Complete your profile to get reviewed.", cta: "Continue Onboarding" },
  IN_PROGRESS:   { label: "In Progress",   desc: "Keep filling in your profile steps.", cta: "Continue Onboarding" },
};

/* ─── Circular SVG Score Ring ─────────────────────────────────────────────────── */

function ScoreRing({ score, size = 160 }: { score: number; size?: number }) {
  const r       = size / 2 - 12;
  const circ    = 2 * Math.PI * r;
  const filled  = (score / 100) * circ;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(124,58,237,0.12)" strokeWidth={10} />
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="url(#wring)" strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
        <defs>
          <linearGradient id="wring" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="var(--worker-primary)" />
            <stop offset="100%" stopColor="var(--worker-2)" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{
          fontFamily: "var(--font-display)", fontWeight: 800, fontSize: size * 0.22,
          color: "var(--white)", lineHeight: 1,
        }}>{score}%</span>
        <span style={{ fontSize: size * 0.08, color: "var(--muted)", marginTop: 4, fontFamily: "var(--font-body)" }}>Score</span>
      </div>
    </div>
  );
}

/* ─── KPI Card ───────────────────────────────────────────────────────────────── */

function KpiCard({
  label, value, icon, sub,
}: { label: string; value: string | number; icon: string; sub?: string }) {
  return (
    <div className="bg-navy-2 border border-border rounded-xl p-4 sm:p-5 md:p-6 flex flex-col gap-2 hover:border-purple-500/35 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-xs sm:text-xs font-semibold text-muted uppercase tracking-wider">{label}</span>
        <span className="text-lg sm:text-xl">{icon}</span>
      </div>
      <span className="font-display font-black text-2xl sm:text-3xl md:text-4xl text-white leading-none">{value}</span>
      {sub && <span className="text-xs sm:text-sm text-worker-3 font-body">{sub}</span>}
    </div>
  );
}

/* ─── Job Card ───────────────────────────────────────────────────────────────── */

function JobCard({ job }: { job: Job }) {
  const salary = job.salaryMin && job.salaryMax
    ? `${job.currency ?? "$"}${(job.salaryMin / 1000).toFixed(0)}K–${(job.salaryMax / 1000).toFixed(0)}K`
    : job.salaryMin
    ? `${job.currency ?? "$"}${(job.salaryMin / 1000).toFixed(0)}K`
    : null;

  const initials = (job.employer?.companyName ?? "?")[0].toUpperCase();
  const score    = job.matchScore ?? 0;
  const skills   = job.skills?.slice(0, 3) ?? [];
  const postedAt = job.createdAt ? new Date(job.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : null;

  return (
    <div style={{
      background: "var(--navy-2)", border: "1px solid var(--border)",
      borderRadius: "var(--r-lg)", padding: "22px", display: "flex", flexDirection: "column", gap: 14,
      transition: "border-color 0.2s, transform 0.2s",
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(124,58,237,0.35)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 42, height: 42, borderRadius: "var(--r-sm)", flexShrink: 0,
          background: "linear-gradient(135deg, var(--worker-primary), var(--worker-2))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "#fff",
        }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, color: "var(--white)", marginBottom: 2 }}>{job.title}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-body)" }}>
            {job.employer?.companyName ?? "Company"} · {job.city ?? job.country ?? "Remote"}
          </div>
        </div>
        {score > 0 && (
          <span style={{
            padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, flexShrink: 0,
            background: "var(--worker-primary)", color: "#fff",
          }}>{score}%</span>
        )}
      </div>

      {/* Salary + skills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {salary && (
          <span style={{
            padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
            background: "rgba(16,185,129,0.1)", color: "var(--success)",
            border: "1px solid rgba(16,185,129,0.2)", fontFamily: "var(--font-body)",
          }}>{salary}</span>
        )}
        {skills.map(s => (
          <span key={s.skill} style={{
            padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500,
            background: "rgba(124,58,237,0.1)", color: "var(--worker-3)",
            border: "1px solid rgba(124,58,237,0.2)", fontFamily: "var(--font-body)",
          }}>{s.skill}</span>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
        <Link href={`/worker/jobs/${job.id}`} style={{
          display: "inline-block", padding: "9px 20px", borderRadius: 10,
          background: "var(--worker-primary)", color: "#fff",
          fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600,
          textDecoration: "none", boxShadow: "0 4px 14px var(--worker-glow)",
          transition: "opacity 0.2s",
        }}
          onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
        >Apply Now</Link>
        {postedAt && <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-body)" }}>{postedAt}</span>}
      </div>
    </div>
  );
}

/* ─── Greeting ───────────────────────────────────────────────────────────────── */

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/* ─── Dashboard content ──────────────────────────────────────────────────────── */

function WorkerDashboardContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [profileData, setProfileData]   = useState<ProfileData | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [jobs, setJobs]                 = useState<Job[]>([]);
  const [loading, setLoading]           = useState(true);
  const [toast, setToast]               = useState<ToastData>(null);

  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (searchParams.get("submitted") === "1") showToast("Application submitted! We'll review within 24–48 hours.");
  }, []);

  useEffect(() => {
    Promise.all([
      userApi.getProfile(),
      workerApi.getApplications({ limit: "100" }),
      workerApi.getJobs({ limit: "3" }),
    ]).then(([pRes, aRes, jRes]) => {
      if (!pRes.success) { router.push("/login"); return; }
      setProfileData(pRes.data as ProfileData);
      if (aRes.success) {
        const raw = aRes.data as { applications?: Application[] } | Application[];
        setApplications(Array.isArray(raw) ? raw : (raw.applications ?? []));
      }
      if (jRes.success) {
        const raw = jRes.data as { jobs?: Job[] } | Job[];
        setJobs(Array.isArray(raw) ? raw : (raw.jobs ?? []));
      }
      setLoading(false);
    });
  }, [router]);

  if (loading) return <LoadingPage color="blue" />;
  if (!profileData) return null;

  const { user, profile, onboarding, notifications, profileCompletionScore } = profileData;
  const firstName   = profile?.firstName ?? user.email.split("@")[0];
  const onbStatus   = onboarding?.onboardingStatus ?? "DRAFT";
  const statusInfo  = STATUS_INFO[onbStatus] ?? STATUS_INFO.DRAFT;
  const completePct = onboarding
    ? Math.round((onboarding.completedSteps.length / onboarding.totalSteps) * 100)
    : 0;
  const profileScore = profileCompletionScore ?? profile?.trustScore ?? completePct;
  const isApproved   = onbStatus === "APPROVED" || user.accountStatus === "VERIFIED";
  const needsAction  = ["DRAFT", "IN_PROGRESS", "NEEDS_CHANGES"].includes(onbStatus) && user.accountStatus !== "VERIFIED";

  const appsSent       = applications.length;
  const interviewCount = applications.filter(a => a.status === "INTERVIEWED" || a.status === "INTERVIEW").length;
  const unread         = notifications.filter(n => !n.isRead).length;

  /* Score breakdown (mock weighted from profile completeness) */
  const breakdowns = [
    { label: "Skills Match",  pct: Math.min(100, profileScore + 7) },
    { label: "Experience",    pct: Math.max(0,   profileScore - 2) },
    { label: "Salary Align",  pct: Math.max(0,   profileScore - 8) },
    { label: "Location Fit",  pct: Math.min(100, profileScore + 9) },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", fontFamily: "var(--font-body)" }}>
      <ToastDisplay toast={toast} />

      {/* ── Welcome hero ─────────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-9 bg-gradient-to-b from-purple-500/5 to-transparent border-b border-border">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6 md:gap-8 flex-wrap">
          <div className="w-full">
            {/* Pill badge */}
            <div className="inline-flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/25 rounded-full px-3 sm:px-4 py-1.5 sm:py-2 mb-2 sm:mb-3 md:mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-worker-primary shadow-glow" />
              <span className="text-xs sm:text-xs font-semibold uppercase tracking-wider text-worker-3">Worker Portal</span>
            </div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl md:text-4xl text-white mb-1.5 sm:mb-2 md:mb-3 tracking-tight">
              {greeting()}, {firstName} 👋
            </h1>
            <p className="text-sm sm:text-base text-muted leading-relaxed max-w-md">
              {isApproved
                ? "Your AI engine is actively matching you to global opportunities."
                : statusInfo.desc}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            {needsAction && (
              <Link href="/worker/onboarding" className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg bg-worker-primary text-white text-sm sm:text-base font-semibold shadow-glow hover:opacity-90 transition-opacity">
                {statusInfo.cta ?? "Continue Setup"} →
              </Link>
            )}
            {isApproved && (
              <Link href="/worker/jobs" className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg bg-worker-primary text-white text-sm sm:text-base font-semibold shadow-glow hover:opacity-90 transition-opacity">
                Browse Job Matches →
              </Link>
            )}
            <Link href="/worker/profile" className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg border border-border bg-transparent text-white text-sm sm:text-base font-semibold hover:bg-white/5 transition-colors">
              View Profile
            </Link>
          </div>
        </div>
      </div>

      {/* ── Lock banner ──────────────────────────────────────────────────────── */}
      <div style={{ padding: "0 40px" }}>
        <LockStatusBanner />
      </div>

      <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-12 flex flex-col gap-6 md:gap-7">

        {/* ── KPI row ──────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
          <KpiCard label="Profile Score"      value={`${profileScore}%`} icon="⭐" sub={profileScore >= 80 ? "Excellent" : "Keep improving"} />
          <KpiCard label="Applications Sent"  value={appsSent}           icon="📋" sub={appsSent > 0 ? "Track in Applications" : "Start applying"} />
          <KpiCard label="Interview Requests" value={interviewCount}     icon="📅" sub={interviewCount > 0 ? "Check your schedule" : "Keep applying"} />
          <KpiCard label="New Matches Today"  value={jobs.length > 0 ? `${jobs.length}+` : "—"} icon="✨" sub="AI-curated for you" />
        </div>

        {/* ── AI Profile Score card ─────────────────────────────────────────────── */}
        <div style={{
          background: "var(--navy-2)", border: "1px solid var(--border)",
          borderLeft: "3px solid var(--worker-primary)",
          borderRadius: "var(--r-lg)", padding: "28px 32px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 40, flexWrap: "wrap" }}>

            {/* Score ring */}
            <ScoreRing score={profileScore} size={160} />

            {/* Breakdown bars */}
            <div style={{ flex: 1, minWidth: 240 }}>
              <h2 style={{
                fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18,
                color: "var(--white)", margin: "0 0 6px",
              }}>Your AI Profile Score</h2>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 22px", lineHeight: 1.5 }}>
                Calculated across 4 dimensions. Improve your score to rank higher in search results.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {breakdowns.map(b => (
                  <div key={b.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--white)", fontFamily: "var(--font-body)" }}>{b.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--worker-3)", fontFamily: "var(--font-display)" }}>{b.pct}%</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(124,58,237,0.12)", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{
                        width: `${b.pct}%`, height: "100%",
                        background: "linear-gradient(90deg, var(--worker-primary), var(--worker-2))",
                        borderRadius: 999, transition: "width 0.8s ease",
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 160 }}>
              <Link href="/worker/profile" style={{
                padding: "10px 18px", borderRadius: 10,
                background: "rgba(124,58,237,0.12)", color: "var(--worker-3)",
                border: "1px solid rgba(124,58,237,0.25)",
                fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600,
                textDecoration: "none", textAlign: "center",
              }}>Edit Profile</Link>
              <Link href="/worker/documents" style={{
                padding: "10px 18px", borderRadius: 10,
                background: "transparent", color: "var(--muted)",
                border: "1px solid var(--border)",
                fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600,
                textDecoration: "none", textAlign: "center",
              }}>Documents</Link>
            </div>
          </div>
        </div>

        {/* ── Recommended Jobs ─────────────────────────────────────────────────── */}
        {jobs.length > 0 && (
          <div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 md:mb-5">
              <h2 className="font-display font-bold text-xl sm:text-2xl text-white">
                Recommended Jobs
              </h2>
              <Link href="/worker/jobs" className="text-sm font-semibold text-worker-3 hover:text-worker-primary transition-colors">
                View all matches →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
              {jobs.map(job => <JobCard key={job.id} job={job} />)}
            </div>
          </div>
        )}

        {/* ── Status + Notifications two-col ──────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">

          {/* Application status timeline */}
          <div className="bg-navy-2 border border-border rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
              <h3 className="font-display font-bold text-base sm:text-lg text-white">
                Application Status
              </h3>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { label: "Profile Complete",  done: completePct === 100 },
                { label: "Submitted",         done: !!onboarding?.isSubmitted },
                { label: "Under Review",      done: ["SUBMITTED", "PENDING_REVIEW", "APPROVED"].includes(onbStatus) },
                { label: "Approved & Active", done: isApproved },
              ].map((step, i) => (
                <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700,
                    background: step.done ? "linear-gradient(135deg, var(--worker-primary), var(--worker-2))" : "rgba(255,255,255,0.05)",
                    color: step.done ? "#fff" : "var(--muted)",
                    border: step.done ? "none" : "1px solid var(--border)",
                    boxShadow: step.done ? "0 0 10px var(--worker-glow)" : "none",
                  }}>{step.done ? "✓" : i + 1}</div>
                  <span style={{ fontSize: 13, color: step.done ? "var(--white)" : "var(--muted)", fontWeight: step.done ? 500 : 400, fontFamily: "var(--font-body)" }}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent notifications */}
          <div style={{
            background: "var(--navy-2)", border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)", overflow: "hidden",
          }}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--white)", margin: 0 }}>
                Notifications
              </h3>
              {unread > 0 && (
                <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "var(--worker-primary)", color: "#fff" }}>
                  {unread} new
                </span>
              )}
            </div>
            {notifications.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                No notifications yet
              </div>
            ) : (
              <div>
                {notifications.slice(0, 4).map(n => (
                  <div key={n.id} style={{
                    padding: "13px 22px",
                    borderBottom: "1px solid var(--border)",
                    background: !n.isRead ? "rgba(124,58,237,0.04)" : "transparent",
                    display: "flex", alignItems: "flex-start", gap: 10,
                  }}>
                    {!n.isRead && (
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--worker-primary)", flexShrink: 0, marginTop: 5, boxShadow: "0 0 6px var(--worker-primary)" }} />
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
            { href: "/worker/jobs",         icon: "💼", label: "Browse Jobs",    sub: "Find new matches" },
            { href: "/worker/applications", icon: "📋", label: "My Applications",sub: `${appsSent} sent` },
            { href: "/worker/profile",      icon: "👤", label: "My Profile",     sub: `${completePct}% complete` },
            { href: "/worker/documents",    icon: "📁", label: "Documents",      sub: "Uploads & IDs" },
          ].map(({ href, icon, label, sub }) => (
            <Link key={href} href={href} className="bg-navy-2 border border-border rounded-xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 no-underline transition-all hover:border-purple-500/35 hover:bg-purple-500/5">
              <div className="w-9 sm:w-10 h-9 sm:h-10 rounded-md bg-purple-500/12 flex items-center justify-center text-lg sm:text-xl flex-shrink-0">{icon}</div>
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

export default function WorkerDashboardPage() {
  return (
    <Suspense fallback={<LoadingPage color="blue" />}>
      <WorkerDashboardContent />
    </Suspense>
  );
}
