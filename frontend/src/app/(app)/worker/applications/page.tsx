"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { workerApi } from "@/lib/api-client";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppStatus = "pending" | "shortlisted" | "interview" | "hired" | "rejected" | "withdrawn";

interface AppJob {
  id:           string;
  title:        string;
  company_name: string;
  country:      string;
  salary_min:   number;
  salary_max:   number;
  currency:     string;
  visa_type:    string;
}

interface AppPayment {
  amount_cents: number;
  status:       "pending" | "succeeded" | "failed";
}

interface Application {
  id:          string;
  status:      AppStatus;
  applied_at:  string;
  updated_at:  string;
  match_score: number;
  job:         AppJob;
  payment:     AppPayment | null;
}

interface Summary {
  total:       number;
  pending:     number;
  shortlisted: number;
  interview:   number;
  hired:       number;
  rejected:    number;
}

type FilterTab = "all" | "active" | "hired" | "rejected";

// ─── Constants ────────────────────────────────────────────────────────────────

const TEAL_600 = "#0d9488";
const TEAL_700 = "#0f766e";
const TEAL_800 = "#115e59";
const TEAL_50  = "#f0fdfa";

const TIMELINE_STEPS = ["Applied", "Shortlisted", "Interview", "Hired"] as const;

const STATUS_TO_STEP: Record<AppStatus, number> = {
  pending:     0,
  shortlisted: 1,
  interview:   2,
  hired:       3,
  rejected:    -1, // handled separately
  withdrawn:   -1,
};

const SCORE_ROWS = [
  { key: "S_skill", label: "Skills match", weight: 30 },
  { key: "S_exp",   label: "Experience",   weight: 20 },
  { key: "S_sal",   label: "Salary fit",   weight: 15 },
  { key: "S_loc",   label: "Location",     weight: 15 },
  { key: "S_trust", label: "Trust score",  weight: 15 },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "1 day ago";
  return `${d} days ago`;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const BADGE_STYLES: Record<AppStatus, { bg: string; color: string; label: string }> = {
  pending:     { bg: "#f1f5f9", color: "#64748b", label: "Pending"     },
  shortlisted: { bg: "#dbeafe", color: "#1d4ed8", label: "Shortlisted" },
  interview:   { bg: "#fef9c3", color: "#92400e", label: "Interview"   },
  hired:       { bg: "#dcfce7", color: "#15803d", label: "Hired"       },
  rejected:    { bg: "#fee2e2", color: "#dc2626", label: "Rejected"    },
  withdrawn:   { bg: "#f1f5f9", color: "#94a3b8", label: "Withdrawn"   },
};

function StatusBadge({ status }: { status: AppStatus }) {
  const s = BADGE_STYLES[status] ?? BADGE_STYLES.pending;
  return (
    <span
      style={{
        padding:      "3px 10px",
        borderRadius: 20,
        fontSize:     12,
        fontWeight:   600,
        background:   s.bg,
        color:        s.color,
        whiteSpace:   "nowrap",
        flexShrink:   0,
      }}
    >
      {s.label}
    </span>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function Timeline({ status }: { status: AppStatus }) {
  const currentStep = STATUS_TO_STEP[status];
  const isRejected  = status === "rejected";
  const isWithdrawn = status === "withdrawn";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 12 }}>
      {TIMELINE_STEPS.map((label, i) => {
        const isCompleted = !isRejected && !isWithdrawn && i < currentStep;
        const isCurrent   = !isRejected && !isWithdrawn && i === currentStep;
        const isRejHere   = isRejected && i === 0; // mark rejected at first step since we don't know exact stage

        let dotBg    = "#e2e8f0";
        let dotBorder = "#e2e8f0";
        let textColor = "#94a3b8";

        if (isCompleted) {
          dotBg     = TEAL_600;
          dotBorder = TEAL_600;
          textColor = TEAL_800;
        } else if (isCurrent) {
          dotBg     = "#3b82f6";
          dotBorder = "#3b82f6";
          textColor = "#1d4ed8";
        } else if (isRejHere) {
          dotBg     = "#fee2e2";
          dotBorder = "#ef4444";
          textColor = "#dc2626";
        } else if (isWithdrawn) {
          dotBg     = "#f1f5f9";
          dotBorder = "#cbd5e1";
          textColor = "#cbd5e1";
        }

        return (
          <div key={label} style={{ display: "flex", alignItems: "center", flex: i < 3 ? "1" : "none" }}>
            {/* Dot + label */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width:        14,
                  height:       14,
                  borderRadius: "50%",
                  background:   dotBg,
                  border:       `2px solid ${dotBorder}`,
                  display:      "flex",
                  alignItems:   "center",
                  justifyContent: "center",
                  flexShrink:   0,
                }}
              >
                {isRejHere && (
                  <span style={{ fontSize: 8, color: "#dc2626", fontWeight: 900, lineHeight: 1 }}>✕</span>
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: 500, color: textColor, whiteSpace: "nowrap" }}>
                {label}
              </span>
            </div>

            {/* Connector line (not after last step) */}
            {i < 3 && (
              <div
                style={{
                  flex:       1,
                  height:     2,
                  background: isCompleted ? TEAL_600 : "#e2e8f0",
                  marginBottom: 16, // offset for label below
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Score breakdown ──────────────────────────────────────────────────────────

function ScoreBreakdown({ score }: { score: number }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px" }}>
        Match score — {score}% overall
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SCORE_ROWS.map(row => (
          <div key={row.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "#64748b", width: 90, flexShrink: 0 }}>
              {row.label}
            </span>
            <div
              style={{
                flex:         1,
                height:       6,
                background:   "#f1f5f9",
                borderRadius: 3,
                overflow:     "hidden",
              }}
            >
              <div
                style={{
                  height:       "100%",
                  width:        `${score}%`,
                  background:   `linear-gradient(90deg, ${TEAL_600}, #3b82f6)`,
                  borderRadius: 3,
                  transition:   "width 0.6s ease",
                }}
              />
            </div>
            <span style={{ fontSize: 11, color: "#94a3b8", width: 28, textAlign: "right", flexShrink: 0 }}>
              {row.weight}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Application card ─────────────────────────────────────────────────────────

function AppCard({
  app,
  index,
  expanded,
  onToggle,
  onWithdraw,
  withdrawing,
}: {
  app:        Application;
  index:      number;
  expanded:   boolean;
  onToggle:   () => void;
  onWithdraw: (id: string) => void;
  withdrawing: boolean;
}) {
  const isWithdrawn = app.status === "withdrawn";

  return (
    <div
      style={{
        background:    "#fff",
        border:        `1px solid ${expanded ? TEAL_600 : "#e2e8f0"}`,
        borderRadius:  12,
        overflow:      "hidden",
        cursor:        "pointer",
        transition:    "box-shadow 0.15s, border-color 0.15s",
        animationName: "fadeInUp",
        animationDuration: "0.35s",
        animationDelay:    `${index * 60}ms`,
        animationFillMode: "both",
        animationTimingFunction: "ease-out",
      }}
      onClick={onToggle}
    >
      {/* ── Card header ──────────────────────────────────────────────────── */}
      <div style={{ padding: "16px 18px" }}>
        {/* Row 1: company icon + title + badge */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
          {/* Company avatar */}
          <div
            style={{
              width:          40,
              height:         40,
              borderRadius:   10,
              background:     `linear-gradient(135deg, ${TEAL_700}, #0369a1)`,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              fontSize:       13,
              fontWeight:     800,
              color:          "#fff",
              flexShrink:     0,
              userSelect:     "none",
            }}
          >
            {initials(app.job.company_name)}
          </div>

          {/* Title + company */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                fontSize:       15,
                fontWeight:     700,
                color:          isWithdrawn ? "#94a3b8" : "#0f172a",
                margin:         0,
                textDecoration: isWithdrawn ? "line-through" : "none",
                overflow:       "hidden",
                textOverflow:   "ellipsis",
                whiteSpace:     "nowrap",
              }}
            >
              {app.job.title}
            </h3>
            <p style={{ fontSize: 13, color: "#64748b", margin: "2px 0 0" }}>
              {app.job.company_name}
            </p>
          </div>

          <StatusBadge status={app.status} />
        </div>

        {/* Row 2: location + applied date */}
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#94a3b8" }}>
          <span>📍 {app.job.country}</span>
          <span>·</span>
          <span>Applied {daysAgo(app.applied_at)}</span>
        </div>

        {/* Timeline */}
        {app.status !== "withdrawn" && (
          <Timeline status={app.status} />
        )}
      </div>

      {/* ── Expandable detail ──────────────────────────────────────────── */}
      {expanded && (
        <div
          style={{
            borderTop:  "1px solid #f1f5f9",
            padding:    "16px 18px",
            background: "#fafafa",
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Score breakdown */}
          <ScoreBreakdown score={app.match_score} />

          {/* Fee */}
          {app.payment && (
            <div
              style={{
                display:      "flex",
                alignItems:   "center",
                justifyContent: "space-between",
                marginTop:    16,
                padding:      "10px 14px",
                background:   "#fff",
                border:       "1px solid #e2e8f0",
                borderRadius: 8,
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  Platform fee
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                  {formatCurrency(app.payment.amount_cents)}
                </p>
              </div>
              <span
                style={{
                  fontSize:   12,
                  fontWeight: 600,
                  padding:    "4px 10px",
                  borderRadius: 20,
                  background: app.payment.status === "succeeded"
                    ? "#dcfce7"
                    : app.payment.status === "failed"
                      ? "#fee2e2"
                      : "#fef9c3",
                  color: app.payment.status === "succeeded"
                    ? "#15803d"
                    : app.payment.status === "failed"
                      ? "#dc2626"
                      : "#92400e",
                }}
              >
                {app.payment.status === "succeeded"
                  ? "Paid"
                  : app.payment.status === "failed"
                    ? "Failed"
                    : "Pending"}
              </span>
            </div>
          )}

          {/* Withdraw button */}
          {app.status === "pending" && (
            <button
              onClick={() => onWithdraw(app.id)}
              disabled={withdrawing}
              style={{
                marginTop:    14,
                padding:      "9px 18px",
                borderRadius: 8,
                border:       "1px solid #fca5a5",
                background:   "#fff",
                color:        "#dc2626",
                fontSize:     13,
                fontWeight:   600,
                cursor:       withdrawing ? "not-allowed" : "pointer",
                opacity:      withdrawing ? 0.6 : 1,
                transition:   "all 0.12s",
                width:        "100%",
              }}
              onMouseEnter={e => {
                if (!withdrawing) {
                  e.currentTarget.style.background = "#fee2e2";
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "#fff";
              }}
            >
              {withdrawing ? "Withdrawing…" : "Withdraw application"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkerApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [summary,      setSummary]      = useState<Summary | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState<FilterTab>("all");
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [withdrawing,  setWithdrawing]  = useState<string | null>(null);
  const [confirmId,    setConfirmId]    = useState<string | null>(null);
  const [toast,        setToast]        = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    workerApi.getApplications().then(res => {
      setLoading(false);
      if (!res.success) return;
      const d = res.data as { applications: Application[]; summary: Summary };
      setApplications(d.applications ?? []);
      setSummary(d.summary ?? null);
    });
  }, []);

  // ── Filter ──────────────────────────────────────────────────────────────────
  const ACTIVE_STATUSES: AppStatus[] = ["pending", "shortlisted", "interview"];

  const filtered = applications.filter(app => {
    if (activeTab === "all")      return true;
    if (activeTab === "active")   return ACTIVE_STATUSES.includes(app.status);
    if (activeTab === "hired")    return app.status === "hired";
    if (activeTab === "rejected") return app.status === "rejected" || app.status === "withdrawn";
    return true;
  });

  // ── Withdraw flow ──────────────────────────────────────────────────────────
  function requestWithdraw(id: string) {
    setConfirmId(id);
  }

  async function confirmWithdraw() {
    if (!confirmId) return;
    setWithdrawing(confirmId);
    setConfirmId(null);
    try {
      const res = await workerApi.deleteApplication(confirmId);
      if (res.success) {
        setApplications(prev =>
          prev.map(a => a.id === confirmId ? { ...a, status: "withdrawn" as AppStatus } : a),
        );
        showToast("Application withdrawn", true);
        setExpandedId(null);
      } else {
        showToast((res as { error?: string }).error ?? "Withdrawal failed", false);
      }
    } finally {
      setWithdrawing(null);
    }
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const TABS: { id: FilterTab; label: string; count?: number }[] = [
    { id: "all",      label: "All",      count: summary?.total },
    {
      id: "active", label: "Active",
      count: summary ? summary.pending + summary.shortlisted + summary.interview : undefined,
    },
    { id: "hired",    label: "Hired",    count: summary?.hired },
    { id: "rejected", label: "Rejected", count: summary?.rejected },
  ];

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <div style={{ textAlign: "center", color: "#94a3b8" }}>
          <div
            style={{
              width:          36,
              height:         36,
              border:         "3px solid #e2e8f0",
              borderTopColor: TEAL_600,
              borderRadius:   "50%",
              animation:      "spin 0.7s linear infinite",
              margin:         "0 auto 12px",
            }}
          />
          <p style={{ fontSize: 14 }}>Loading applications…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 28px", maxWidth: 780, margin: "0 auto" }}>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* ── Page title ───────────────────────────────────────────────────────── */}
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "0 0 20px", letterSpacing: "-0.02em" }}>
        My applications
      </h1>

      {/* ── Summary stat cards ───────────────────────────────────────────────── */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total applied",   value: summary.total,                                     color: "#0f172a" },
            { label: "Shortlisted",     value: summary.shortlisted,                               color: "#1d4ed8" },
            { label: "Interview stage", value: summary.interview,                                 color: "#92400e" },
          ].map(card => (
            <div
              key={card.label}
              style={{
                background:   "#fff",
                border:       "1px solid #e2e8f0",
                borderRadius: 12,
                padding:      "16px 18px",
              }}
            >
              <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {card.label}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 800, color: card.color }}>
                {card.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filter tabs ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding:      "7px 16px",
                borderRadius: 20,
                border:       isActive ? "none" : "1px solid #e2e8f0",
                background:   isActive ? TEAL_600 : "#fff",
                color:        isActive ? "#fff" : "#475569",
                fontSize:     13,
                fontWeight:   isActive ? 700 : 500,
                cursor:       "pointer",
                transition:   "all 0.12s",
                whiteSpace:   "nowrap",
                display:      "flex",
                gap:          6,
                alignItems:   "center",
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background  = TEAL_50;
                  e.currentTarget.style.borderColor = TEAL_600;
                  e.currentTarget.style.color       = TEAL_800;
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background  = "#fff";
                  e.currentTarget.style.borderColor = "#e2e8f0";
                  e.currentTarget.style.color       = "#475569";
                }
              }}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  style={{
                    background:   isActive ? "rgba(255,255,255,0.25)" : "#f1f5f9",
                    color:        isActive ? "#fff" : "#64748b",
                    fontSize:     11,
                    fontWeight:   700,
                    borderRadius: 20,
                    padding:      "1px 7px",
                    minWidth:     20,
                    textAlign:    "center",
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Card list ────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div
          style={{
            textAlign:    "center",
            padding:      "72px 20px",
            background:   "#fff",
            border:       "1px solid #e2e8f0",
            borderRadius: 16,
          }}
        >
          <p style={{ fontSize: 40, margin: "0 0 10px" }}>📋</p>
          <p style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>
            {activeTab === "all"
              ? "No applications yet"
              : `No ${activeTab} applications`}
          </p>
          <p style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 20px" }}>
            {activeTab === "all"
              ? "Browse jobs to get started"
              : "Check another filter tab"}
          </p>
          {activeTab === "all" && (
            <Link
              href="/worker/jobs"
              style={{
                display:      "inline-block",
                padding:      "10px 24px",
                borderRadius: 8,
                background:   TEAL_600,
                color:        "#fff",
                fontSize:     14,
                fontWeight:   700,
                textDecoration: "none",
                transition:   "background 0.12s",
              }}
            >
              Browse jobs →
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((app, i) => (
            <AppCard
              key={app.id}
              app={app}
              index={i}
              expanded={expandedId === app.id}
              onToggle={() => setExpandedId(prev => prev === app.id ? null : app.id)}
              onWithdraw={requestWithdraw}
              withdrawing={withdrawing === app.id}
            />
          ))}
        </div>
      )}

      {/* ── Confirm withdraw modal ───────────────────────────────────────────── */}
      {confirmId && (
        <div
          style={{
            position:       "fixed",
            inset:          0,
            zIndex:         100,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            background:     "rgba(0,0,0,0.4)",
          }}
          onClick={() => setConfirmId(null)}
        >
          <div
            style={{
              background:   "#fff",
              borderRadius: 16,
              padding:      "28px 32px",
              maxWidth:     420,
              width:        "calc(100% - 40px)",
              boxShadow:    "0 20px 60px rgba(0,0,0,0.15)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 8px" }}>
              Withdraw application?
            </h2>
            <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 24px", lineHeight: 1.6 }}>
              This action cannot be undone. Your application will be marked as withdrawn.
              Platform fees are non-refundable — your case will be flagged for admin review.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmId(null)}
                style={{
                  flex:         1,
                  padding:      "10px 0",
                  borderRadius: 8,
                  border:       "1px solid #e2e8f0",
                  background:   "#f8fafc",
                  fontSize:     14,
                  fontWeight:   600,
                  color:        "#475569",
                  cursor:       "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmWithdraw}
                style={{
                  flex:         1,
                  padding:      "10px 0",
                  borderRadius: 8,
                  border:       "none",
                  background:   "#dc2626",
                  fontSize:     14,
                  fontWeight:   700,
                  color:        "#fff",
                  cursor:       "pointer",
                }}
              >
                Yes, withdraw
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ────────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          style={{
            position:   "fixed",
            bottom:     32,
            left:       "50%",
            transform:  "translateX(-50%)",
            background: toast.ok ? "#0f172a" : "#dc2626",
            color:      "#fff",
            padding:    "12px 24px",
            borderRadius: 10,
            fontSize:   14,
            fontWeight: 600,
            zIndex:     200,
            boxShadow:  "0 4px 20px rgba(0,0,0,0.2)",
            whiteSpace: "nowrap",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
