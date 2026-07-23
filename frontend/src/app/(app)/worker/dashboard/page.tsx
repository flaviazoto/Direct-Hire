"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ClipboardList, Search, User, FolderOpen,
  Briefcase, CheckCircle, AlertTriangle,
  Pencil, Upload, Bell, Bookmark,
} from "lucide-react";
import { userApi, workerApi } from "@/lib/api-client";
import LockStatusBanner from "@/components/worker/LockStatusBanner";
import { LoadingPage, ToastDisplay, type ToastData, ErrorState } from "@/components/ui";

// DirectHire design system — worker role = teal. Numeric values (stat
// counts, match %, profile %) use font-mono/tabular-nums per the design
// system's "IBM Plex Mono for all numerics" rule.

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface ProfileData {
  user: {
    email: string; status: string;
    accountStatus?: string; onboardingComplete?: boolean; isEmailVerified: boolean;
    rejectionReason?: string | null;
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

function StatCard({ label, value, icon: Icon }: {
  label: string; value: number | string;
  icon: React.ElementType;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10, padding: '16px', boxShadow: '0 1px 2px rgba(11,17,32,0.04)',
    }}>
      <Icon size={18} style={{ color: '#0D9488', marginBottom: 10 }} />
      <p style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 26, fontWeight: 600, color: '#ffffff', lineHeight: 1, margin: '0 0 4px' }}>{value}</p>
      <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>{label}</p>
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
      padding: 16, borderRadius: 10,
      background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.1)',
      textDecoration: 'none', transition: 'border-color 0.15s', boxShadow: '0 1px 2px rgba(11,17,32,0.04)',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(20,184,166,0.4)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: 'rgba(20,184,166,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} style={{ color: '#0D9488' }} />
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#ffffff', margin: '0 0 2px' }}>{label}</p>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>{sub}</p>
      </div>
    </Link>
  );
}

/* ── Job row ─────────────────────────────────────────────────────────────────── */

function JobRow({ job }: { job: Job }) {
  return (
    <Link href="/worker/jobs" style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 16px', borderRadius: 10,
      background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.1)',
      textDecoration: 'none', transition: 'border-color 0.15s', boxShadow: '0 1px 2px rgba(11,17,32,0.04)',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(20,184,166,0.4)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: 'rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Briefcase size={18} style={{ color: '#94a3b8' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#ffffff', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {job.title}
        </p>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
          {job.employer?.companyName ?? 'Company'} · {job.city ?? job.country ?? 'Remote'}
        </p>
      </div>
      {(job.matchScore ?? 0) > 0 && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
          fontSize: 11, fontWeight: 600, flexShrink: 0,
          padding: '4px 10px', borderRadius: 6,
          background: 'rgba(13,148,136,0.10)', color: '#0D9488',
        }}>
          {job.matchScore}% match
        </span>
      )}
    </Link>
  );
}

/* ── Dashboard content ───────────────────────────────────────────────────────── */

function WorkerDashboardContent() {
  const searchParams = useSearchParams();

  const [profileData, setProfileData]   = useState<ProfileData | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [jobs, setJobs]                 = useState<Job[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [toast, setToast]               = useState<ToastData>(null);

  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (searchParams.get("submitted") === "1") showToast("Application submitted! We'll review within 24–48 hours.");
  }, [searchParams, showToast]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      userApi.getProfile(),
      workerApi.getApplications({ limit: "100" }),
      workerApi.getJobs({ limit: "3" }),
    ]).then(([pRes, aRes, jRes]) => {
      if (!pRes.success) { setError(pRes.error ?? "Could not load your dashboard."); setLoading(false); return; }
      setProfileData(pRes.data as ProfileData);
      if (aRes.success) {
        const raw = aRes.data as { applications?: Application[] } | Application[];
        setApplications(Array.isArray(raw) ? raw : (raw.applications ?? []));
      } else {
        console.error("[dashboard] applications fetch failed:", aRes.error);
      }
      if (jRes.success) {
        const raw = jRes.data as { jobs?: Job[] } | Job[];
        setJobs(Array.isArray(raw) ? raw : (raw.jobs ?? []));
      } else {
        console.error("[dashboard] jobs fetch failed:", jRes.error);
      }
      setLoading(false);
    }).catch(() => {
      setError("Network error - check your connection.");
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingPage color="teal" />;
  if (error) {
    return (
      <div style={{ maxWidth: 600, margin: "80px auto", padding: "0 20px" }}>
        <ErrorState message={error} retry={load} title="Could not load your dashboard" />
      </div>
    );
  }
  if (!profileData) return null;

  const { user, profile, onboarding, verification, notifications, profileCompletionScore } = profileData;

  const firstName = profile?.firstName ?? user.email.split("@")[0];
  const lastName  = profile?.lastName ?? "";
  const initials  = [profile?.firstName?.[0], profile?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || firstName[0]?.toUpperCase() || "?";

  const onbStatus    = onboarding?.onboardingStatus ?? "DRAFT";
  const completePct  = onboarding
    ? Math.round(((onboarding.completedSteps?.length ?? 0) / onboarding.totalSteps) * 100)
    : 0;
  const pct          = profileCompletionScore ?? completePct;
  const isApproved   = onbStatus === "APPROVED" || user.accountStatus === "VERIFIED";
  const needsChanges = onbStatus === "NEEDS_CHANGES";
  const isVerified   = profile?.documentsVerified || isApproved;
  const isRejected   = user.accountStatus === "REJECTED";

  const appsSent   = applications.length;
  const interviews = applications.filter(a => ["INTERVIEWED", "INTERVIEW"].includes(a.status)).length;
  const unread     = notifications.filter(n => !n.isRead).length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--glass-base)', fontFamily: 'var(--font-body)' }}>
      <ToastDisplay toast={toast} />

      <div style={{ maxWidth: 1024, margin: '0 auto', padding: '24px 16px 64px' }}
        className="sm:px-6 md:px-8 md:pt-8"
      >

        {/* Lock banner */}
        <LockStatusBanner />

        {/* ── Section 1: Welcome header ──────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, marginTop: 8 }}>
          <div>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 3px' }}>
              {getGreeting()}
            </p>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 700, color: '#ffffff', margin: 0, letterSpacing: '-0.02em' }}>
              {firstName}{lastName ? ` ${lastName}` : ''}
            </h1>
          </div>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
            background: '#0D9488',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700, color: '#fff',
          }}>
            {initials}
          </div>
        </div>

        {/* ── Section 2: Profile completion card ────────────────────────────── */}
        <div style={{
          padding: '20px', borderRadius: 10,
          border: '1px solid rgba(20,184,166,0.3)',
          background: 'rgba(20,184,166,0.08)',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#ffffff', margin: '0 0 3px' }}>Profile strength</p>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                Complete your profile to get more job matches
              </p>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 26, fontWeight: 600, color: '#0D9488', lineHeight: 1 }}>{pct}%</span>
          </div>

          {/* Progress bar — thin horizontal bar, worker-500 fill per the design system */}
          <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', borderRadius: 999, height: 6, marginBottom: 16 }}>
            <div style={{
              width: `${pct}%`, height: 6, borderRadius: 999,
              background: '#14B8A6',
              transition: 'width 0.6s ease',
            }} />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/worker/profile/edit" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10,
              background: '#0D9488', color: '#fff',
              fontSize: 13, fontWeight: 500, textDecoration: 'none',
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#0F766E')}
              onMouseLeave={e => (e.currentTarget.style.background = '#0D9488')}
            >
              <Pencil size={13} /> Edit profile
            </Link>
            <Link href="/worker/documents" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10,
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#ffffff',
              fontSize: 13, fontWeight: 500, textDecoration: 'none',
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <Upload size={13} /> Upload documents
            </Link>
          </div>
        </div>

        {/* ── Section 3: Alert banners — semantic colors, not the role color ── */}
        {(isVerified || needsChanges || isRejected || !isApproved) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {isRejected && (
              <div style={{
                display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 10,
                background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.2)',
                alignItems: 'flex-start',
              }}>
                <AlertTriangle size={15} style={{ color: '#DC2626', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', margin: '0 0 2px' }}>Application not approved</p>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 6px' }}>
                    {user.rejectionReason ?? 'Your application did not meet our verification requirements.'}
                  </p>
                  {/* No self-service resubmit path exists for a REJECTED account
                      (confirmed: onboarding.controller.ts has no reset-and-resubmit
                      flow, unlike NEEDS_CHANGES) — contact support is the only
                      honest next step, not a re-submit CTA we can't back up. */}
                  <a href="mailto:support@directhire.cc" style={{ fontSize: 12, fontWeight: 600, color: '#DC2626', textDecoration: 'underline' }}>
                    Contact support →
                  </a>
                </div>
              </div>
            )}
            {isVerified && (
              <div style={{
                display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 10,
                background: 'rgba(22,163,74,0.05)', border: '1px solid rgba(22,163,74,0.2)',
                alignItems: 'flex-start',
              }}>
                <CheckCircle size={15} style={{ color: '#16A34A', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#16A34A', margin: '0 0 2px' }}>Documents verified</p>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Your profile is visible to employers</p>
                </div>
              </div>
            )}
            {needsChanges && (
              <div style={{
                display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 10,
                background: 'rgba(234,88,12,0.05)', border: '1px solid rgba(234,88,12,0.2)',
                alignItems: 'flex-start',
              }}>
                <AlertTriangle size={15} style={{ color: '#EA580C', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#EA580C', margin: '0 0 2px' }}>Changes requested</p>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                    {verification?.changesRequested ?? 'Please check your email for details'}
                  </p>
                </div>
              </div>
            )}
            {!isApproved && !needsChanges && pct < 100 && (
              <div style={{
                display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 10,
                background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.3)',
                alignItems: 'center', justifyContent: 'space-between',
              }}>
                <p style={{ fontSize: 13, color: '#cbd5e1', margin: 0 }}>
                  Complete your profile to start applying
                </p>
                <Link href="/worker/profile/edit" style={{
                  fontSize: 12, fontWeight: 600, color: '#0D9488',
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
          <StatCard label="Applications"   value={appsSent}    icon={ClipboardList} />
          <StatCard label="Notifications"  value={unread}      icon={Bell}          />
          <StatCard label="Job matches"    value={jobs.length} icon={Briefcase}     />
          <StatCard label="Interviews"     value={interviews}  icon={Bookmark}      />
        </div>

        {/* ── Section 5: Quick actions grid ────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: 28 }}>
          <QuickLink href="/worker/jobs"           label="Browse jobs"    sub="Find matches"             Icon={Search}        />
          <QuickLink href="/worker/applications"   label="Applications"   sub={`${appsSent} sent`}       Icon={ClipboardList} />
          <QuickLink href="/worker/profile/edit"   label="Edit profile"   sub={`${pct}% complete`}       Icon={User}          />
          <QuickLink href="/worker/documents"      label="Documents"      sub="Uploads & IDs"            Icon={FolderOpen}    />
        </div>

        {/* ── Section 6: Recent matches ─────────────────────────────────────── */}
        {jobs.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#ffffff', margin: 0 }}>Recent matches</h2>
              <Link href="/worker/jobs" style={{ fontSize: 13, color: '#0D9488', textDecoration: 'none' }}>
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
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#ffffff', margin: 0 }}>
                Notifications {unread > 0 && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 6, background: '#0D9488', color: '#fff', marginLeft: 6 }}>
                    {unread}
                  </span>
                )}
              </h2>
              <Link href="/worker/notifications" style={{ fontSize: 13, color: '#0D9488', textDecoration: 'none' }}>
                View all
              </Link>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(11,17,32,0.04)',
            }}>
              {notifications.slice(0, 3).map((n, i) => (
                <div key={n.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '13px 16px',
                  borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                  background: !n.isRead ? 'rgba(20,184,166,0.08)' : 'transparent',
                }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                    background: n.isRead ? 'transparent' : '#0D9488',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#ffffff', margin: '0 0 2px' }}>{n.title}</p>
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</p>
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
    <Suspense fallback={<LoadingPage color="teal" />}>
      <WorkerDashboardContent />
    </Suspense>
  );
}
