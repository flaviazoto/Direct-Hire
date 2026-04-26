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
    <div style={{
      background: "var(--navy-2)", border: "1px solid var(--border)",
      borderLeft: "3px solid var(--employer-primary)",
      borderRadius: "var(--r-lg)", padding: "18px 20px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-body)" }}>{label}</span>
        <span style={{ fontSize: 18 }}>{icon}</span>
      </div>
      <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, color: "var(--white)", lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: "var(--employer-3)", fontFamily: "var(--font-body)" }}>{sub}</span>}
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
      <div style={{
        padding: "36px 40px 32px",
        background: "radial-gradient(ellipse 80% 120% at 70% 0%, rgba(13,148,136,0.1) 0%, transparent 65%)",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(13,148,136,0.1)", border: "1px solid rgba(13,148,136,0.25)", borderRadius: 20, padding: "5px 13px", marginBottom: 14 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--employer-primary)" }} />
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--employer-3)", fontFamily: "var(--font-body)" }}>Employer Portal</span>
            </div>
            <h1 style={{
              fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(22px, 3vw, 30px)",
              color: "var(--white)", margin: "0 0 10px", letterSpacing: "-1px",
            }}>Welcome back, {company} 👋</h1>
            <p style={{ fontSize: 14, color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
              {isActive
                ? `AI is actively matching candidates to your ${jobs.length} open position${jobs.length !== 1 ? "s" : ""}.`
                : statusInfo.desc}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {needsAction && (
              <Link href="/employer/onboarding" style={{
                padding: "11px 24px", borderRadius: 10,
                background: "var(--employer-primary)", color: "#fff",
                fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600,
                textDecoration: "none", boxShadow: "0 4px 18px var(--employer-glow)",
              }}>{statusInfo.cta ?? "Continue Setup"} →</Link>
            )}
            {isActive && (
              <Link href="/employer/jobs/new" style={{
                padding: "11px 24px", borderRadius: 10,
                background: "var(--employer-primary)", color: "#fff",
                fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600,
                textDecoration: "none", boxShadow: "0 4px 18px var(--employer-glow)",
              }}>+ Post a Job</Link>
            )}
            <Link href="/employer/workers" style={{
              padding: "11px 24px", borderRadius: 10, border: "1px solid var(--border)",
              background: "transparent", color: "var(--white)",
              fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, textDecoration: "none",
            }}>Find Talent</Link>
          </div>
        </div>
      </div>

      <div style={{ padding: "28px 40px 48px", display: "flex", flexDirection: "column", gap: 28 }}>

        {/* ── KPI row ──────────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--white)", margin: 0 }}>
                Active Jobs
              </h2>
              <Link href="/employer/jobs" style={{ fontSize: 13, fontWeight: 600, color: "var(--employer-3)", textDecoration: "none" }}>
                Manage all jobs →
              </Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {jobs.slice(0, 6).map(job => <JobCard key={job.id} job={job} />)}
            </div>
          </div>
        )}

        {/* ── Status + Notifications ────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* Verification status */}
          <div style={{
            background: "var(--navy-2)", border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)", overflow: "hidden",
          }}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--white)", margin: 0 }}>Verification Status</h3>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { href: "/employer/workers",     icon: "🔍", label: "Find Workers",   sub: "Browse all talent" },
            { href: "/employer/applications",icon: "👥", label: "Applications",   sub: `${totalApplicants} total` },
            { href: "/employer/locks",       icon: "🔒", label: "Reservations",   sub: activeLockCount ? `${activeLockCount} active` : "Manage holds" },
            { href: "/employer/billing",     icon: "💳", label: "Billing",        sub: profile?.subscriptionPlan ?? "Choose a plan" },
          ].map(({ href, icon, label, sub }) => (
            <Link key={href} href={href} style={{
              background: "var(--navy-2)", border: "1px solid var(--border)",
              borderRadius: "var(--r-lg)", padding: "16px 18px",
              display: "flex", alignItems: "center", gap: 12,
              textDecoration: "none", transition: "border-color 0.15s, background 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(13,148,136,0.4)"; e.currentTarget.style.background = "rgba(13,148,136,0.04)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--navy-2)"; }}
            >
              <div style={{ width: 38, height: 38, borderRadius: "var(--r-sm)", background: "rgba(13,148,136,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--white)", fontFamily: "var(--font-body)" }}>{label}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{sub}</div>
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
