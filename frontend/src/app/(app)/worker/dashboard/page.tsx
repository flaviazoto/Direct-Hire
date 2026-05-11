"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ClipboardList, Search, User, FolderOpen,
  Briefcase, CheckCircle, AlertTriangle,
  Pencil, Upload, Bell, Bookmark,
} from "lucide-react";
import { userApi, workerApi } from "@/lib/api-client";
import LockStatusBanner from "@/components/worker/LockStatusBanner";
import { LoadingPage, ToastDisplay, type ToastData } from "@/components/ui";

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface ProfileData {
  user: {
    email: string; status: string;
    accountStatus?: string; onboardingComplete?: boolean; isEmailVerified: boolean;
  };
  profile: {
    firstName?: string; lastName?: string; profession?: string;
    countryOfResidence?: string; yearsExperience?: string; expectedSalary?: string;
    trustScore?: number; riskScore?: number; isSearchable?: boolean;
    documentsVerified?: boolean;
    skills?: { skill: string }[];
    languages?: { language: string; proficiencyLevel: string }[];
    targetCountries?: { country: string }[];
  } | null;
  onboarding: {
    currentStep: number; totalSteps: number; onboardingStatus: string;
    isSubmitted: boolean; completedSteps: number[];
  } | null;
  verification: { reviewStatus: string; adminNotes?: string; changesRequested?: string } | null;
  notifications: { id: string; title: string; body: string; type: string; isRead: boolean; createdAt: string }[];
  profileCompletionScore?: number | null;
}

interface Application { id: string; status: string; }

interface Job {
  id: string; title: string; country?: string; city?: string;
  salaryMin?: number; salaryMax?: number; currency?: string;
  skills?: { skill: string }[]; matchScore?: number; createdAt?: string;
  employer?: { companyName?: string };
}

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/* ── Stat card ───────────────────────────────────────────────────────────────── */

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number | string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div style={{
      background: '#0d1424', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 20, padding: '16px',
    }}>
      <Icon size={18} style={{ color, marginBottom: 10 }} />
      <p style={{ fontSize: 26, fontWeight: 800, color: '#f0f4ff', lineHeight: 1, margin: '0 0 4px' }}>{value}</p>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', margin: 0 }}>{label}</p>
    </div>
  );
}

/* ── Quick action card ────────────────────────────────────────────────────────── */

function QuickLink({ href, label, sub, Icon }: {
  href: string; label: string; sub: string; Icon: React.ElementType;
}) {
  return (
    <Link href={href} style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      padding: 16, borderRadius: 20,
      background: '#0d1424', border: '1px solid rgba(255,255,255,0.07)',
      textDecoration: 'none', transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(168,85,247,0.35)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 12,
        background: 'rgba(168,85,247,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} style={{ color: '#c084fc' }} />
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#f0f4ff', margin: '0 0 2px' }}>{label}</p>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', margin: 0 }}>{sub}</p>
      </div>
    </Link>
  );
}

/* ── Job row ─────────────────────────────────────────────────────────────────── */

function JobRow({ job }: { job: Job }) {
  return (
    <Link href={`/worker/jobs/${job.id}`} style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 16px', borderRadius: 20,
      background: '#0d1424', border: '1px solid rgba(255,255,255,0.07)',
      textDecoration: 'none', transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(168,85,247,0.35)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
        background: 'rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Briefcase size={18} style={{ color: 'rgba(255,255,255,0.4)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#f0f4ff', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {job.title}
        </p>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', margin: 0 }}>
          {job.employer?.companyName ?? 'Company'} · {job.city ?? job.country ?? 'Remote'}
        </p>
      </div>
      {(job.matchScore ?? 0) > 0 && (
        <span style={{
          fontSize: 11, fontWeight: 700, flexShrink: 0,
          padding: '3px 10px', borderRadius: 999,
          background: 'rgba(168,85,247,0.15)', color: '#c084fc',
        }}>
          {job.matchScore}% match
        </span>
      )}
    </Link>
  );
}

/* ── Dashboard content ───────────────────────────────────────────────────────── */

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

  const { user, profile, onboarding, verification, notifications, profileCompletionScore } = profileData;

  const firstName = profile?.firstName ?? user.email.split("@")[0];
  const lastName  = profile?.lastName ?? "";
  const initials  = [profile?.firstName?.[0], profile?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || firstName[0]?.toUpperCase() || "?";

  const onbStatus    = onboarding?.onboardingStatus ?? "DRAFT";
  const completePct  = onboarding
    ? Math.round((onboarding.completedSteps.length / onboarding.totalSteps) * 100)
    : 0;
  const pct          = profileCompletionScore ?? completePct;
  const isApproved   = onbStatus === "APPROVED" || user.accountStatus === "VERIFIED";
  const needsChanges = onbStatus === "NEEDS_CHANGES";
  const isVerified   = profile?.documentsVerified || isApproved;

  const appsSent   = applications.length;
  const interviews = applications.filter(a => ["INTERVIEWED", "INTERVIEW"].includes(a.status)).length;
  const unread     = notifications.filter(n => !n.isRead).length;

  return (
    <div style={{ minHeight: '100vh', background: '#05080f', fontFamily: 'var(--font-body)' }}>
      <ToastDisplay toast={toast} />

      <div style={{ maxWidth: 1024, margin: '0 auto', padding: '24px 16px 64px' }}
        className="sm:px-6 md:px-8 md:pt-8"
      >

        {/* Lock banner */}
        <LockStatusBanner />

        {/* ── Section 1: Welcome header ──────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, marginTop: 8 }}>
          <div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 3px' }}>
              {getGreeting()} 👋
            </p>
            <h1 style={{ fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 800, color: '#f0f4ff', margin: 0, letterSpacing: '-0.02em' }}>
              {firstName}{lastName ? ` ${lastName}` : ''}
            </h1>
          </div>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #9333ea, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#fff',
          }}>
            {initials}
          </div>
        </div>

        {/* ── Section 2: Profile completion card ────────────────────────────── */}
        <div style={{
          padding: '20px', borderRadius: 20,
          border: '1px solid rgba(168,85,247,0.22)',
          background: 'rgba(168,85,247,0.06)',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#f0f4ff', margin: '0 0 3px' }}>Profile strength</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                Complete your profile to get more job matches
              </p>
            </div>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#c084fc', lineHeight: 1 }}>{pct}%</span>
          </div>

          {/* Progress bar */}
          <div style={{ width: '100%', background: 'rgba(255,255,255,0.08)', borderRadius: 999, height: 6, marginBottom: 16 }}>
            <div style={{
              width: `${pct}%`, height: 6, borderRadius: 999,
              background: 'linear-gradient(90deg, #9333ea, #6366f1)',
              transition: 'width 0.6s ease',
            }} />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/worker/profile/edit" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 12,
              background: '#9333ea', color: '#fff',
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
              transition: 'opacity 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              <Pencil size={13} /> Edit Profile
            </Link>
            <Link href="/worker/documents" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)',
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
              transition: 'border-color 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
            >
              <Upload size={13} /> Upload Documents
            </Link>
          </div>
        </div>

        {/* ── Section 3: Alert banners ───────────────────────────────────────── */}
        {(isVerified || needsChanges || !isApproved) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {isVerified && (
              <div style={{
                display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 14,
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                alignItems: 'flex-start',
              }}>
                <CheckCircle size={15} style={{ color: '#4ade80', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#4ade80', margin: '0 0 2px' }}>Documents verified</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Your profile is visible to employers</p>
                </div>
              </div>
            )}
            {needsChanges && (
              <div style={{
                display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 14,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                alignItems: 'flex-start',
              }}>
                <AlertTriangle size={15} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24', margin: '0 0 2px' }}>Changes requested</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                    {verification?.changesRequested ?? 'Please check your email for details'}
                  </p>
                </div>
              </div>
            )}
            {!isApproved && !needsChanges && pct < 100 && (
              <div style={{
                display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 14,
                background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)',
                alignItems: 'center', justifyContent: 'space-between',
              }}>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                  Complete your profile to start applying
                </p>
                <Link href="/worker/profile/edit" style={{
                  fontSize: 12, fontWeight: 600, color: '#c084fc',
                  textDecoration: 'none', flexShrink: 0,
                }}>
                  Continue →
                </Link>
              </div>
            )}
          </div>
        )}

        {/* ── Section 4: Stats row ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: 20 }}>
          <StatCard label="Applications"   value={appsSent}    icon={ClipboardList} color="#c084fc" />
          <StatCard label="Notifications"  value={unread}      icon={Bell}          color="#60a5fa" />
          <StatCard label="Job matches"    value={jobs.length} icon={Briefcase}     color="#4ade80" />
          <StatCard label="Interviews"     value={interviews}  icon={Bookmark}      color="#fbbf24" />
        </div>

        {/* ── Section 5: Quick actions grid ────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: 28 }}>
          <QuickLink href="/worker/jobs"           label="Browse Jobs"    sub="Find matches"             Icon={Search}        />
          <QuickLink href="/worker/applications"   label="Applications"   sub={`${appsSent} sent`}       Icon={ClipboardList} />
          <QuickLink href="/worker/profile/edit"   label="Edit Profile"   sub={`${pct}% complete`}       Icon={User}          />
          <QuickLink href="/worker/documents"      label="Documents"      sub="Uploads & IDs"            Icon={FolderOpen}    />
        </div>

        {/* ── Section 6: Recent matches ─────────────────────────────────────── */}
        {jobs.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#f0f4ff', margin: 0 }}>Recent matches</h2>
              <Link href="/worker/jobs" style={{ fontSize: 13, color: '#c084fc', textDecoration: 'none' }}>
                View all
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {jobs.map(job => <JobRow key={job.id} job={job} />)}
            </div>
          </div>
        )}

        {/* ── Recent notifications snippet ───────────────────────────────────── */}
        {notifications.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#f0f4ff', margin: 0 }}>
                Notifications {unread > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#9333ea', color: '#fff', marginLeft: 6 }}>
                    {unread}
                  </span>
                )}
              </h2>
              <Link href="/worker/notifications" style={{ fontSize: 13, color: '#c084fc', textDecoration: 'none' }}>
                View all
              </Link>
            </div>
            <div style={{
              background: '#0d1424', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 20, overflow: 'hidden',
            }}>
              {notifications.slice(0, 3).map((n, i) => (
                <div key={n.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '13px 16px',
                  borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  background: !n.isRead ? 'rgba(168,85,247,0.04)' : 'transparent',
                }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                    background: n.isRead ? 'transparent' : '#9333ea',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#f0f4ff', margin: '0 0 2px' }}>{n.title}</p>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
