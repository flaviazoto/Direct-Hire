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
  user:         { email: string; status: string; isEmailVerified: boolean };
  profile:      {
    firstName?: string; lastName?: string; profession?: string;
    countryOfResidence?: string; yearsExperience?: string; expectedSalary?: string;
    trustScore?: number; riskScore?: number; isSearchable?: boolean;
    skills?: { skill: string }[]; languages?: { language: string; proficiencyLevel: string }[];
    targetCountries?: { country: string }[];
  } | null;
  onboarding:   { currentStep: number; totalSteps: number; onboardingStatus: string; isSubmitted: boolean; completedSteps: number[] } | null;
  verification: { reviewStatus: string; adminNotes?: string; changesRequested?: string } | null;
  notifications: { id: string; title: string; body: string; type: string; isRead: boolean; createdAt: string }[];
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
    <div style={{
      background: "var(--navy-2)",
      border: "1px solid var(--border)",
      borderLeft: "3px solid var(--worker-primary)",
      borderRadius: "var(--r-lg)",
      padding: "18px 20px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-body)" }}>{label}</span>
        <span style={{ fontSize: 18 }}>{icon}</span>
      </div>
      <span style={{
        fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30,
        color: "var(--white)", lineHeight: 1,
      }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: "var(--worker-3)", fontFamily: "var(--font-body)" }}>{sub}</span>}
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

  const { user, profile, onboarding, notifications } = profileData;
  const firstName   = profile?.firstName ?? user.email.split("@")[0];
  const onbStatus   = onboarding?.onboardingStatus ?? "DRAFT";
  const statusInfo  = STATUS_INFO[onbStatus] ?? STATUS_INFO.DRAFT;
  const completePct = onboarding
    ? Math.round((onboarding.completedSteps.length / onboarding.totalSteps) * 100)
    : 0;
  const profileScore = profile?.trustScore ?? completePct;
  const isApproved   = onbStatus === "APPROVED";
  const needsAction  = ["DRAFT", "IN_PROGRESS", "NEEDS_CHANGES"].includes(onbStatus);

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
      <div style={{
        padding: "36px 40px 32px",
        background: "radial-gradient(ellipse 80% 120% at 70% 0%, rgba(124,58,237,0.12) 0%, transparent 65%)",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
          <div>
            {/* Pill badge */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: 20, padding: "5px 13px", marginBottom: 14 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--worker-primary)", boxShadow: "0 0 8px var(--worker-primary)" }} />
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--worker-3)", fontFamily: "var(--font-body)" }}>Worker Portal</span>
            </div>
            <h1 style={{
              fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(24px, 3vw, 32px)",
              color: "var(--white)", margin: "0 0 10px", letterSpacing: "-1px",
            }}>{greeting()}, {firstName} 👋</h1>
            <p style={{ fontSize: 14, color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
              {isApproved
                ? "Your AI engine is actively matching you to global opportunities."
                : statusInfo.desc}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            {needsAction && (
              <Link href="/worker/onboarding" style={{
                padding: "11px 24px", borderRadius: 10,
                background: "var(--worker-primary)", color: "#fff",
                fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600,
                textDecoration: "none", boxShadow: "0 4px 18px var(--worker-glow)",
              }}>{statusInfo.cta ?? "Continue Setup"} →</Link>
            )}
            {isApproved && (
              <Link href="/worker/jobs" style={{
                padding: "11px 24px", borderRadius: 10,
                background: "var(--worker-primary)", color: "#fff",
                fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600,
                textDecoration: "none", boxShadow: "0 4px 18px var(--worker-glow)",
              }}>Browse Job Matches →</Link>
            )}
            <Link href="/worker/profile" style={{
              padding: "11px 24px", borderRadius: 10, border: "1px solid var(--border)",
              background: "transparent", color: "var(--white)",
              fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600,
              textDecoration: "none",
            }}>View Profile</Link>
          </div>
        </div>
      </div>

      {/* ── Lock banner ──────────────────────────────────────────────────────── */}
      <div style={{ padding: "0 40px" }}>
        <LockStatusBanner />
      </div>

      <div style={{ padding: "28px 40px 48px", display: "flex", flexDirection: "column", gap: 28 }}>

        {/* ── KPI row ──────────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{
                fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18,
                color: "var(--white)", margin: 0,
              }}>Recommended Jobs</h2>
              <Link href="/worker/jobs" style={{
                fontSize: 13, fontWeight: 600, color: "var(--worker-3)",
                textDecoration: "none", fontFamily: "var(--font-body)",
              }}>View all matches →</Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {jobs.map(job => <JobCard key={job.id} job={job} />)}
            </div>
          </div>
        )}

        {/* ── Status + Notifications two-col ──────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* Application status timeline */}
          <div style={{
            background: "var(--navy-2)", border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)", overflow: "hidden",
          }}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--white)", margin: 0 }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { href: "/worker/jobs",         icon: "💼", label: "Browse Jobs",    sub: "Find new matches" },
            { href: "/worker/applications", icon: "📋", label: "My Applications",sub: `${appsSent} sent` },
            { href: "/worker/profile",      icon: "👤", label: "My Profile",     sub: `${completePct}% complete` },
            { href: "/worker/documents",    icon: "📁", label: "Documents",      sub: "Uploads & IDs" },
          ].map(({ href, icon, label, sub }) => (
            <Link key={href} href={href} style={{
              background: "var(--navy-2)", border: "1px solid var(--border)",
              borderRadius: "var(--r-lg)", padding: "16px 18px",
              display: "flex", alignItems: "center", gap: 12,
              textDecoration: "none", transition: "border-color 0.15s, background 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(124,58,237,0.35)"; e.currentTarget.style.background = "rgba(124,58,237,0.04)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--navy-2)"; }}
            >
              <div style={{ width: 38, height: 38, borderRadius: "var(--r-sm)", background: "rgba(124,58,237,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icon}</div>
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

export default function WorkerDashboardPage() {
  return (
    <Suspense fallback={<LoadingPage color="blue" />}>
      <WorkerDashboardContent />
    </Suspense>
  );
}
