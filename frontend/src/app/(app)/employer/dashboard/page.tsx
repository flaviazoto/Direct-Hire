"use client";
// src/app/(app)/employer/dashboard/page.tsx
// Redesigned around the real hiring-workflow pipeline (AdminWorkflowStatus)
// rather than the old generic application-status stats: priority banner +
// 3 KPI cards + candidates-ready/jobs panels + demoted quick links. Built
// against employer-theme.ts's shared violet glass tokens (Phase 3 system),
// not the older teal-labelled `--employer-*` CSS variables this file used
// to reference — those actually resolve to teal in design-system.css
// (`--employer-3: #5eead4`), a legacy naming mismatch from before the
// worker/employer/admin = teal/violet/gold convention was established.

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { userApi, employerApi } from "@/lib/api-client";
import { LoadingPage, EmptyState, ToastDisplay, type ToastData } from "@/components/ui";
import { C, card } from "@/lib/employer-theme";

/* ─── Types ──────────────────────────────────────────────────────────────────── */

interface EmpProfileData {
  user:    { email: string; status: string };
  profile: { companyName?: string } | null;
  onboarding: { onboardingStatus: string; isSubmitted: boolean; completedSteps: number[]; totalSteps: number } | null;
}

interface Job {
  id:                  string;
  title:               string;
  country?:            string;
  city?:               string;
  status?:             string;
  applicationCount?:   number;
  applicationDeadline?: string | null;
}

interface CandidateApp {
  id:             string;
  status:         string;
  workflowStatus: string | null;
  worker: { workerProfile: { firstName: string | null; lastName: string | null } | null };
  job:    { id: string; title: string; companyName: string };
}

const STATUS_INFO: Record<string, { label: string; desc: string; cta?: string }> = {
  APPROVED:       { label: "Verified & active", desc: "Here's what needs your attention today." },
  SUBMITTED:      { label: "Under review",      desc: "We're verifying your company details. 24–48 hours." },
  PENDING_REVIEW: { label: "Under review",      desc: "We're reviewing your company." },
  NEEDS_CHANGES:  { label: "Changes required",  desc: "Check your email for details.", cta: "Update company" },
  REJECTED:       { label: "Not approved",      desc: "Contact support for details." },
  DRAFT:          { label: "Incomplete",        desc: "Complete your company profile to get verified.", cta: "Complete setup" },
  IN_PROGRESS:    { label: "In progress",       desc: "Continue your profile.", cta: "Continue setup" },
};

function candidateName(app: CandidateApp) {
  return [app.worker.workerProfile?.firstName, app.worker.workerProfile?.lastName].filter(Boolean).join(" ") || "Candidate";
}

/* ─── KPI card ───────────────────────────────────────────────────────────────── */

function KpiCard({ label, value, sub, flag }: { label: string; value: number; sub: string; flag?: boolean }) {
  return (
    <div style={card({ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 8, minHeight: 104 })}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
        {flag && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
            color: C.warning, background: "rgba(234,88,12,0.12)", border: "1px solid rgba(234,88,12,0.3)",
            whiteSpace: "nowrap",
          }}>
            Action needed
          </span>
        )}
      </div>
      <span style={{ fontFamily: "var(--font-display, inherit)", fontWeight: 800, fontSize: 32, color: C.text, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 12, color: C.muted }}>{sub}</span>
    </div>
  );
}

/* ─── Candidate row (left panel) ──────────────────────────────────────────────── */

function CandidateRow({ app }: { app: CandidateApp }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      padding: "14px 18px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{candidateName(app)}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{app.job.title}</div>
      </div>
      <Link href="/employer/interviews" style={{
        flexShrink: 0, padding: "0 18px", borderRadius: 8, fontSize: 12, fontWeight: 700,
        color: C.accent, background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)",
        textDecoration: "none", minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        Review
      </Link>
    </div>
  );
}

/* ─── Job row (right panel) ───────────────────────────────────────────────────── */

function JobRow({ job }: { job: Job }) {
  return (
    <Link href="/employer/jobs" style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      padding: "13px 18px", borderBottom: `1px solid ${C.border}`, textDecoration: "none",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.title}</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{[job.city, job.country].filter(Boolean).join(", ") || "Remote"}</div>
      </div>
      <span style={{
        flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
        color: C.accent, background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", whiteSpace: "nowrap",
      }}>
        {job.applicationCount ?? 0} applicant{job.applicationCount === 1 ? "" : "s"}
      </span>
    </Link>
  );
}

/* ─── Quick link card ──────────────────────────────────────────────────────────── */

function QuickLink({ href, icon, label, sub, accentBg, subColor }: {
  href: string; icon: string; label: string; sub: string; accentBg?: string; subColor?: string;
}) {
  return (
    <Link href={href} style={{
      ...card({ padding: 14 }),
      display: "flex", alignItems: "center", gap: 12,
      textDecoration: "none", minHeight: 60, transition: "border-color 0.15s, background 0.15s",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHover; e.currentTarget.style.background = C.cardHover; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.card; }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: accentBg ?? "rgba(167,139,250,0.12)",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
      }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        <div style={{ fontSize: 11, color: subColor ?? C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      </div>
    </Link>
  );
}

/* ─── Content ────────────────────────────────────────────────────────────────── */

function EmployerDashboardContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [profileData, setProfileData] = useState<EmpProfileData | null>(null);
  const [jobs, setJobs]               = useState<Job[]>([]);
  const [jobsTotal, setJobsTotal]     = useState(0);
  const [candidates, setCandidates]   = useState<CandidateApp[]>([]);
  const [readyCount, setReadyCount]       = useState(0);
  const [inProcessCount, setInProcessCount] = useState(0);
  const [activeLockCount, setActiveLockCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState<ToastData>(null);
  const [subStatus, setSubStatus] = useState<{ status: string; currentPeriodEnd: string | null; trialEndsAt: string | null } | null>(null);

  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (searchParams.get("submitted") === "1") showToast("Company profile submitted for review");
  }, [searchParams, showToast]);

  useEffect(() => {
    Promise.all([
      userApi.getProfile(),
      employerApi.getJobs({ status: "APPROVED", limit: "50" }),
      employerApi.getMyInterviews(),
      employerApi.getLocks({ status: "ACTIVE", limit: "1" }),
      employerApi.getSubscriptionStatus(),
    ]).then(([pRes, jRes, iRes, lRes, sRes]) => {
      if (!pRes.success) { router.push("/login"); return; }
      setProfileData(pRes.data as EmpProfileData);

      if (jRes.success) {
        const raw = jRes.data as Job[] | undefined;
        setJobs(raw ?? []);
        setJobsTotal((jRes as unknown as { total?: number }).total ?? (raw?.length ?? 0));
      }
      if (iRes.success) {
        setCandidates((iRes.data as unknown as CandidateApp[]) ?? []);
        const stats = (iRes as unknown as { stats?: { readyCount: number; inProcessCount: number } }).stats;
        if (stats) { setReadyCount(stats.readyCount); setInProcessCount(stats.inProcessCount); }
      }
      if (lRes.success && lRes.data) {
        setActiveLockCount((lRes.data as { total?: number }).total ?? 0);
      }
      if (sRes.success && sRes.data) {
        setSubStatus(sRes.data as { status: string; currentPeriodEnd: string | null; trialEndsAt: string | null });
      }
      setLoading(false);
    });
  }, [router]);

  if (loading) return <LoadingPage color="violet" />;
  if (!profileData) return null;

  const { user, profile, onboarding } = profileData;
  const company    = profile?.companyName ?? user.email;
  const onbStatus  = onboarding?.onboardingStatus ?? "DRAFT";
  const statusInfo = STATUS_INFO[onbStatus] ?? STATUS_INFO.DRAFT;
  const isActive    = onbStatus === "APPROVED";
  const needsAction = ["DRAFT", "IN_PROGRESS", "NEEDS_CHANGES"].includes(onbStatus);

  const daysUntil = (iso: string | null) => iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)) : null;
  const subState = subStatus?.status ?? "INACTIVE";
  const billingSub =
    subState === "ACTIVE"   ? "Active" :
    subState === "PAST_DUE" ? "Payment failed" :
    subState === "CANCELED" ? `Ends in ${daysUntil(subStatus?.currentPeriodEnd ?? null) ?? "—"}d` :
    (subState === "TRIAL" || subState === "TRIALING") ? `Trial · ${daysUntil(subStatus?.trialEndsAt ?? null) ?? "—"}d left` :
    "Subscribe to unlock";

  const acceptingCount = jobs.filter(j => !j.applicationDeadline || new Date(j.applicationDeadline) > new Date()).length;
  const readyCandidates = candidates.filter(c => c.workflowStatus === "DOCUMENTS_APPROVED");

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 4px" }}>
      <ToastDisplay toast={toast} />

      <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 flex flex-col gap-6 md:gap-7">

        {/* ── Welcome header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 style={{ fontWeight: 800, fontSize: 26, color: C.text, margin: 0, letterSpacing: "-0.02em" }}>
              Welcome back, {company}
            </h1>
            <p style={{ fontSize: 14, color: C.muted, margin: "6px 0 0" }}>
              {isActive ? "Here's what needs your attention today." : statusInfo.desc}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {needsAction && (
              <Link href="/employer/onboarding" style={{
                padding: "10px 20px", borderRadius: 10, background: C.accent, color: "#1a0b3d",
                fontSize: 14, fontWeight: 700, textDecoration: "none", textAlign: "center", minHeight: 44,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>
                {statusInfo.cta ?? "Continue setup"} →
              </Link>
            )}
            {isActive && (
              <Link href="/employer/jobs/new" style={{
                padding: "10px 20px", borderRadius: 10, background: C.accent, color: "#1a0b3d",
                fontSize: 14, fontWeight: 700, textDecoration: "none", textAlign: "center", minHeight: 44,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>
                Post a job
              </Link>
            )}
          </div>
        </div>

        {/* ── Priority banner (conditional — omitted entirely when nothing needs action) ── */}
        {readyCount > 0 && (
          <Link href="/employer/interviews" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
            padding: "14px 20px", borderRadius: 12, textDecoration: "none",
            background: "rgba(234,88,12,0.08)", border: "1px solid rgba(234,88,12,0.3)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.warning, flexShrink: 0, boxShadow: `0 0 6px ${C.warning}` }} />
              <span style={{ fontSize: 13, color: C.secondary }}>
                <strong style={{ color: C.text }}>{readyCount} candidate{readyCount === 1 ? "" : "s"}</strong> ready for an interview or hire decision
              </span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.warning, flexShrink: 0 }}>Review now →</span>
          </Link>
        )}

        {/* ── KPI row ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCard label="Active jobs" value={jobsTotal} sub={`${acceptingCount} accepting applications`} />
          <KpiCard label="Candidates ready" value={readyCount} sub="Awaiting your decision" flag={readyCount > 0} />
          <KpiCard label="In process" value={inProcessCount} sub="Documents, hire and fee stages" />
        </div>

        {/* ── Two-column panel row ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">

          {/* Candidates ready for you */}
          <div style={card({ overflow: "hidden" })}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontWeight: 700, fontSize: 15, color: C.text, margin: 0 }}>Candidates ready for you</h2>
              <Link href="/employer/interviews" style={{ fontSize: 12, fontWeight: 600, color: C.accent, textDecoration: "none" }}>View all →</Link>
            </div>
            {readyCandidates.length === 0 ? (
              <div style={{ padding: "32px 20px" }}>
                <EmptyState
                  icon="🎙️"
                  title="No candidates ready yet"
                  description="Candidates appear here once their documents are approved."
                />
              </div>
            ) : (
              <div>
                {readyCandidates.slice(0, 6).map(app => <CandidateRow key={app.id} app={app} />)}
              </div>
            )}
          </div>

          {/* Your jobs */}
          <div style={card({ overflow: "hidden" })}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontWeight: 700, fontSize: 15, color: C.text, margin: 0 }}>Your jobs</h2>
              <Link href="/employer/jobs" style={{ fontSize: 12, fontWeight: 600, color: C.accent, textDecoration: "none" }}>View all →</Link>
            </div>
            {jobs.length === 0 ? (
              <div style={{ padding: "28px 20px" }}>
                <EmptyState
                  icon="💼"
                  title="No jobs posted yet"
                  description="Post your first job to start receiving applications."
                  action={
                    <Link href="/employer/jobs/new" style={{
                      display: "inline-flex", padding: "0 18px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                      color: "#1a0b3d", background: C.accent, textDecoration: "none", marginTop: 10, minHeight: 44, alignItems: "center", justifyContent: "center",
                    }}>
                      Post a job
                    </Link>
                  }
                />
              </div>
            ) : (
              <div>
                {jobs.slice(0, 6).map(job => <JobRow key={job.id} job={job} />)}
              </div>
            )}
          </div>
        </div>

        {/* ── Quick links ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickLink href="/employer/jobs/new" icon="➕" label="Post a job" sub="Create a listing" />
          <QuickLink href="/employer/workers"  icon="🔍" label="Find talent" sub="Browse candidates" />
          <QuickLink href="/employer/locks"    icon="🔒" label="Reservations" sub={activeLockCount ? `${activeLockCount} active` : "Manage holds"} />
          <QuickLink
            href="/employer/subscription" icon="💳" label="Billing" sub={billingSub}
            subColor={subState === "PAST_DUE" ? C.danger : undefined}
          />
        </div>

      </div>
    </div>
  );
}

export default function EmployerDashboardPage() {
  return (
    <Suspense fallback={<LoadingPage color="violet" />}>
      <EmployerDashboardContent />
    </Suspense>
  );
}
