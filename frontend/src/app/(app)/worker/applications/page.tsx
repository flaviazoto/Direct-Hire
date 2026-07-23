"use client";
// src/app/(app)/worker/applications/page.tsx

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { workerApi } from "@/lib/api-client";
import { LoadingPage, ErrorState } from "@/components/ui";
import LockStatusBanner from "@/components/worker/LockStatusBanner";
import { useVisibilityPoll } from "@/hooks/useVisibilityPoll";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ApplicationJob {
  id:             string;
  title:          string;
  companyName:    string;
  country:        string;
  city:           string;
  salaryMin:      number | string | null;
  salaryMax:      number | string | null;
  salaryCurrency: string;
  contractType:   string;
}

interface Application {
  id:                       string;
  status:                   string;
  createdAt:                string;
  updatedAt:                string;
  coverLetter:              string | null;
  interviewContactUnlocked: boolean;
  interviewInstructions:    string | null;
  interviewResponse:        string | null;
  interviewResponseMessage: string | null;
  interviewRespondedAt:     string | null;
  matchScore:               number | string | null;
  job:                      ApplicationJob;
}

interface ContactDetails {
  contact_name:           string | null;
  contact_email:          string;
  contact_phone:          string | null;
  company_name:           string;
  interview_instructions: string | null;
}

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; border: string; dot: string; pill: string; pillBg: string; pillBorder: string }> = {
  APPLIED:     { label: "Applied",      border: "#555",    dot: "#71717a", pill: "#a1a1aa", pillBg: "rgba(161,161,170,0.08)", pillBorder: "rgba(161,161,170,0.2)"  },
  VIEWED:      { label: "Viewed",       border: "#3b82f6", dot: "#60a5fa", pill: "#60a5fa", pillBg: "rgba(96,165,250,0.08)",  pillBorder: "rgba(96,165,250,0.25)"  },
  SHORTLISTED: { label: "Shortlisted",  border: "#f59e0b", dot: "#fbbf24", pill: "#fbbf24", pillBg: "rgba(251,191,36,0.08)",  pillBorder: "rgba(251,191,36,0.25)"  },
  INTERVIEWED: { label: "Interview",    border: "#14b8a6", dot: "#2dd4bf", pill: "#2dd4bf", pillBg: "rgba(0,144,255,0.08)",  pillBorder: "rgba(0,144,255,0.25)"  },
  ACCEPTED:    { label: "Accepted",     border: "#22c55e", dot: "#4ade80", pill: "#4ade80", pillBg: "rgba(74,222,128,0.08)",  pillBorder: "rgba(74,222,128,0.25)"  },
  REJECTED:    { label: "Not selected", border: "#ef4444", dot: "#f87171", pill: "#f87171", pillBg: "rgba(248,113,113,0.08)", pillBorder: "rgba(248,113,113,0.25)" },
  WITHDRAWN:   { label: "Withdrawn",    border: "#555",    dot: "#71717a", pill: "#71717a", pillBg: "rgba(113,113,122,0.08)", pillBorder: "rgba(113,113,122,0.2)"  },
};

const TAB_STATUSES = ["ALL", "APPLIED", "VIEWED", "SHORTLISTED", "INTERVIEWED", "ACCEPTED", "REJECTED"] as const;
type TabStatus = typeof TAB_STATUSES[number];

const CONTRACT_LABELS: Record<string, string> = {
  FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract",
  TEMPORARY: "Temporary", INTERNSHIP: "Internship", FREELANCE: "Freelance",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "1 day ago";
  return `${d} days ago`;
}

function fmtSalary(min: number | string | null, max: number | string | null, currency: string) {
  const lo = min != null ? Number(min) : null;
  const hi = max != null ? Number(max) : null;
  if (!lo && !hi) return null;
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
  if (lo && hi) return `${currency} ${fmt(lo)}–${fmt(hi)}`;
  if (lo) return `${currency} ${fmt(lo)}+`;
  return null;
}

// ── Small UI atoms ─────────────────────────────────────────────────────────────

function Chip({ children, color = "#555", bg = "rgba(255,255,255,0.05)", border = "rgba(255,255,255,0.08)" }: {
  children: React.ReactNode; color?: string; bg?: string; border?: string;
}) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 11, fontWeight: 600, padding: "2px 8px",
      borderRadius: 6, color, background: bg, border: `1px solid ${border}`,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.APPLIED;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 700, padding: "3px 10px",
      borderRadius: 99, whiteSpace: "nowrap",
      color: cfg.pill, background: cfg.pillBg, border: `1px solid ${cfg.pillBorder}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

function Spinner({ size = 20, color = "#14b8a6" }: { size?: number; color?: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      border: `2px solid ${color}22`, borderTop: `2px solid ${color}`,
      animation: "spin 0.8s linear infinite", flexShrink: 0,
    }} />
  );
}

// ── Skeleton card ──────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      background: "#161616", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 14, overflow: "hidden", display: "flex",
    }}>
      <div style={{ width: 3, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
      <div style={{ padding: "16px 20px", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ width: "45%", height: 14, background: "rgba(255,255,255,0.07)", borderRadius: 6 }} />
          <div style={{ width: 72, height: 20, background: "rgba(255,255,255,0.07)", borderRadius: 99 }} />
        </div>
        <div style={{ width: "30%", height: 11, background: "rgba(255,255,255,0.05)", borderRadius: 6, marginBottom: 10 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {[60, 80, 70].map(w => (
            <div key={w} style={{ width: w, height: 18, background: "rgba(255,255,255,0.05)", borderRadius: 6 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Interview contact section ──────────────────────────────────────────────────

function InterviewContactPanel({ appId, jobTitle }: { appId: string; jobTitle: string }) {
  const [contact, setContact] = useState<ContactDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    workerApi.getApplicationContact(appId).then(res => {
      if (res.success) setContact(res.data as ContactDetails);
      else setError((res as { error?: string }).error ?? "Contact details unavailable");
      setLoading(false);
    });
  }, [appId]);

  function copy(text: string, which: "email" | "phone") {
    navigator.clipboard.writeText(text).then(() => {
      if (which === "email") { setCopiedEmail(true); setTimeout(() => setCopiedEmail(false), 2000); }
      else                   { setCopiedPhone(true); setTimeout(() => setCopiedPhone(false), 2000); }
    });
  }

  return (
    <div style={{
      marginTop: 16,
      background: "rgba(0,144,255,0.05)",
      border: "1px solid rgba(0,144,255,0.25)",
      borderRadius: 12, padding: "16px 18px",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#2dd4bf", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Interview stage — contact the employer
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
          <Spinner size={16} />
          <span style={{ fontSize: 12, color: "#71717a" }}>Loading contact details…</span>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 13, color: "#f87171" }}>{error}</div>
      )}

      {contact && !loading && (
        <>
          {contact.contact_name && (
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 10 }}>
              {contact.contact_name}
            </div>
          )}

          {/* Email row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#a1a1aa", minWidth: 50 }}>Email</span>
            <span style={{ fontSize: 13, color: "#e4e4e7", fontFamily: "monospace" }}>{contact.contact_email}</span>
            <button
              onClick={() => copy(contact.contact_email, "email")}
              style={{ background: copiedEmail ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.06)", border: `1px solid ${copiedEmail ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.1)"}`, borderRadius: 6, padding: "3px 10px", color: copiedEmail ? "#4ade80" : "#a1a1aa", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s" }}
            >
              {copiedEmail ? "✓ Copied" : "Copy"}
            </button>
            <a
              href={`mailto:${contact.contact_email}?subject=Interview - ${encodeURIComponent(jobTitle)}`}
              style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: "rgba(0,144,255,0.12)", border: "1px solid rgba(0,144,255,0.3)", color: "#2dd4bf", textDecoration: "none" }}
            >
              Send email
            </a>
          </div>

          {/* Phone row */}
          {contact.contact_phone && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "#a1a1aa", minWidth: 50 }}>Phone</span>
              <span style={{ fontSize: 13, color: "#e4e4e7", fontFamily: "monospace" }}>{contact.contact_phone}</span>
              <button
                onClick={() => copy(contact.contact_phone!, "phone")}
                style={{ background: copiedPhone ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.06)", border: `1px solid ${copiedPhone ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.1)"}`, borderRadius: 6, padding: "3px 10px", color: copiedPhone ? "#4ade80" : "#a1a1aa", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s" }}
              >
                {copiedPhone ? "✓ Copied" : "Copy"}
              </button>
            </div>
          )}

          {/* Interview instructions */}
          {contact.interview_instructions && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                Instructions
              </div>
              <div style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.6, background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "10px 12px" }}>
                {contact.interview_instructions}
              </div>
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 11, color: "#555", lineHeight: 1.5 }}>
            This contact was shared because you have been selected for an interview.
          </div>
        </>
      )}
    </div>
  );
}

// ── Interview response panel ────────────────────────────────────────────────────

function InterviewResponsePanel({
  appId,
  interviewResponse,
  interviewResponseMessage,
  onResponded,
}: {
  appId:                     string;
  interviewResponse:         string | null;
  interviewResponseMessage:  string | null;
  onResponded:               (id: string, response: string, message: string | null) => void;
}) {
  const [message,   setMessage]   = useState("");
  const [sending,   setSending]   = useState<"ACCEPTED" | "DECLINED" | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  async function respond(response: "ACCEPTED" | "DECLINED") {
    setSending(response);
    setError(null);
    const res = await workerApi.respondToInterview(appId, {
      response,
      message: message.trim() || undefined,
    });
    setSending(null);
    if (!res.success) {
      setError((res as { error?: string }).error ?? "Failed to send response");
      return;
    }
    onResponded(appId, response, message.trim() || null);
  }

  if (interviewResponse) {
    const accepted = interviewResponse === "ACCEPTED";
    return (
      <div style={{
        marginTop: 12,
        background: accepted ? "rgba(74,222,128,0.06)" : "rgba(248,113,113,0.06)",
        border: `1px solid ${accepted ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
        borderRadius: 10, padding: "12px 16px",
        fontSize: 13, color: accepted ? "#86efac" : "#f87171", lineHeight: 1.6,
      }}>
        {accepted ? "✓ You accepted this interview invitation." : "You declined this interview invitation."}
        {interviewResponseMessage && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#a1a1aa", fontStyle: "italic" }}>
            {`"${interviewResponseMessage}"`}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      marginTop: 12,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 10, padding: "14px 16px",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#e4e4e7", marginBottom: 8 }}>
        Respond to this interview invitation
      </div>
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="Optional: share your availability or a short note…"
        maxLength={500}
        rows={2}
        style={{
          width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#e4e4e7",
          fontFamily: "inherit", resize: "vertical", marginBottom: 10, boxSizing: "border-box",
        }}
      />
      {error && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => respond("ACCEPTED")}
          disabled={sending !== null}
          style={{
            flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(74,222,128,0.3)",
            background: "rgba(74,222,128,0.12)", color: "#4ade80", fontWeight: 600, fontSize: 13,
            cursor: sending ? "not-allowed" : "pointer", opacity: sending ? 0.6 : 1,
          }}
        >
          {sending === "ACCEPTED" ? "Sending…" : "Accept"}
        </button>
        <button
          onClick={() => respond("DECLINED")}
          disabled={sending !== null}
          style={{
            flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(248,113,113,0.3)",
            background: "rgba(248,113,113,0.1)", color: "#f87171", fontWeight: 600, fontSize: 13,
            cursor: sending ? "not-allowed" : "pointer", opacity: sending ? 0.6 : 1,
          }}
        >
          {sending === "DECLINED" ? "Sending…" : "Decline"}
        </button>
      </div>
    </div>
  );
}

// ── Withdraw modal ─────────────────────────────────────────────────────────────

function WithdrawModal({ jobTitle, onConfirm, onCancel, loading }: {
  jobTitle: string; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="glass-scrim" style={{
      zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="glass-modal" style={{ padding: 28, maxWidth: 400, width: "100%" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
          Withdraw application?
        </div>
        <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, marginBottom: 24 }}>
          Withdraw your application for <strong style={{ color: "#cbd5e1" }}>{jobTitle}</strong>?
          This cannot be undone.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            className="btn-glass"
            style={{ padding: "9px 18px", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{ background: loading ? "rgba(239,68,68,0.5)" : "#ef4444", border: "none", borderRadius: 10, padding: "9px 18px", color: "#fff", cursor: loading ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}
          >
            {loading && <Spinner size={13} color="#fff" />}
            Withdraw
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Application card ───────────────────────────────────────────────────────────

function ApplicationCard({
  app,
  onWithdrawn,
  onInterviewResponded,
}: {
  app: Application;
  onWithdrawn: (id: string) => void;
  onInterviewResponded: (id: string, response: string, message: string | null) => void;
}) {
  const [expanded,       setExpanded]       = useState(false);
  const [showCover,      setShowCover]      = useState(false);
  const [withdrawModal,  setWithdrawModal]  = useState(false);
  const [withdrawing,    setWithdrawing]    = useState(false);
  const [withdrawError,  setWithdrawError]  = useState<string | null>(null);

  const cfg      = STATUS_CFG[app.status] ?? STATUS_CFG.APPLIED;
  const salary   = fmtSalary(app.job.salaryMin, app.job.salaryMax, app.job.salaryCurrency);
  const contract = CONTRACT_LABELS[app.job.contractType] ?? app.job.contractType;
  const location = [app.job.city, app.job.country].filter(Boolean).join(", ");
  const score    = app.matchScore != null ? Number(app.matchScore) : null;

  const canWithdraw = app.status === "APPLIED" || app.status === "VIEWED";

  // Status timeline derived from current status
  const STATUS_ORDER = ["APPLIED", "VIEWED", "SHORTLISTED", "INTERVIEWED", "ACCEPTED", "REJECTED", "WITHDRAWN"];
  const reachedIdx   = STATUS_ORDER.indexOf(app.status);
  const timelineSteps = STATUS_ORDER
    .slice(0, reachedIdx + 1)
    .filter(s => !["REJECTED", "WITHDRAWN"].includes(s) || s === app.status);

  async function handleWithdraw() {
    setWithdrawing(true);
    setWithdrawError(null);
    const res = await workerApi.withdrawApplication(app.id);
    setWithdrawing(false);
    if (!res.success) {
      setWithdrawError((res as { error?: string }).error ?? "Failed to withdraw");
      return;
    }
    setWithdrawModal(false);
    onWithdrawn(app.id);
  }

  return (
    <>
      {withdrawModal && (
        <WithdrawModal
          jobTitle={app.job.title}
          onConfirm={handleWithdraw}
          onCancel={() => { setWithdrawModal(false); setWithdrawError(null); }}
          loading={withdrawing}
        />
      )}

      <div style={{
        background: "#161616",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 14,
        overflow: "hidden",
        transition: "border-color 0.15s",
      }}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.13)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.07)"; }}
      >
        {/* Left status bar + main content */}
        <div
          style={{ display: "flex", cursor: "pointer" }}
          onClick={() => setExpanded(v => !v)}
        >
          {/* Status bar */}
          <div style={{ width: 3, background: cfg.border, flexShrink: 0 }} />

          {/* Card body */}
          <div style={{ padding: "15px 18px", flex: 1, minWidth: 0 }}>
            {/* Top row */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {app.job.title}
                </div>
                <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>{app.job.companyName}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {score != null && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 99, padding: "2px 8px" }}>
                    {score}% match
                  </span>
                )}
                <StatusPill status={app.status} />
                <span style={{ fontSize: 12, color: "#555", marginLeft: 2 }}>{expanded ? "▲" : "▼"}</span>
              </div>
            </div>

            {/* Mid row */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {location && <Chip>{location}</Chip>}
              {contract  && <Chip>{contract}</Chip>}
              {salary    && (
                <Chip color="#86efac" bg="rgba(74,222,128,0.06)" border="rgba(74,222,128,0.18)">
                  {salary}
                </Chip>
              )}
            </div>

            {/* Bottom row */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10, fontSize: 12, color: "#555" }}>
              <span>Applied {daysAgo(app.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Expanded panel */}
        {expanded && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "16px 21px" }}>

            {/* Status timeline */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                Application history
              </div>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0 }}>
                {timelineSteps.map((step, i) => {
                  const sCfg    = STATUS_CFG[step] ?? STATUS_CFG.APPLIED;
                  const isCurrent = step === app.status;
                  return (
                    <div key={step} style={{ display: "flex", alignItems: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: "50%",
                          background: isCurrent ? sCfg.dot : "#333",
                          boxShadow: isCurrent ? `0 0 6px ${sCfg.dot}88` : "none",
                          border: isCurrent ? `1.5px solid ${sCfg.dot}` : "1.5px solid #444",
                        }} />
                        <span style={{ fontSize: 10, color: isCurrent ? sCfg.pill : "#555", fontWeight: isCurrent ? 700 : 400, whiteSpace: "nowrap" }}>
                          {sCfg.label}
                        </span>
                      </div>
                      {i < timelineSteps.length - 1 && (
                        <div style={{ width: 28, height: 1, background: "rgba(255,255,255,0.1)", margin: "0 4px", marginBottom: 14 }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cover letter */}
            {app.coverLetter && (
              <div style={{ marginBottom: 14 }}>
                <button
                  onClick={e => { e.stopPropagation(); setShowCover(v => !v); }}
                  style={{ background: "none", border: "none", color: "#60a5fa", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", padding: 0, marginBottom: 8 }}
                >
                  {showCover ? "▲ Hide cover letter" : "▼ View cover letter"}
                </button>
                {showCover && (
                  <div style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.7, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.06)" }}>
                    {app.coverLetter}
                  </div>
                )}
              </div>
            )}

            {/* INTERVIEWED — contact panel + response */}
            {app.status === "INTERVIEWED" && (
              <>
                <InterviewContactPanel appId={app.id} jobTitle={app.job.title} />
                <InterviewResponsePanel
                  appId={app.id}
                  interviewResponse={app.interviewResponse}
                  interviewResponseMessage={app.interviewResponseMessage}
                  onResponded={onInterviewResponded}
                />
              </>
            )}

            {/* ACCEPTED — congratulations */}
            {app.status === "ACCEPTED" && (
              <div style={{
                background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.2)",
                borderRadius: 10, padding: "12px 16px",
                fontSize: 13, color: "#86efac", lineHeight: 1.6,
              }}>
                🎉 <strong>Your application has been accepted.</strong> The employer will contact you directly to finalise the next steps.
              </div>
            )}

            {/* REJECTED — professional note, no reason */}
            {app.status === "REJECTED" && (
              <div style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 10, padding: "12px 16px",
                fontSize: 13, color: "#71717a", lineHeight: 1.6,
              }}>
                Thank you for applying. This employer has decided not to move forward at this time.
              </div>
            )}

            {/* Withdraw error */}
            {withdrawError && (
              <div style={{ fontSize: 12, color: "#f87171", marginBottom: 8 }}>{withdrawError}</div>
            )}

            {/* Withdraw button */}
            {canWithdraw && (
              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={e => { e.stopPropagation(); setWithdrawModal(true); }}
                  style={{
                    background: "transparent", border: "1px solid rgba(239,68,68,0.3)",
                    borderRadius: 9, padding: "7px 16px", color: "#f87171",
                    cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.08)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  Withdraw application
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

function ApplicationsContent() {
  const [apps,         setApps]       = useState<Application[]>([]);
  const [total,        setTotal]      = useState(0);
  const [loading,      setLoading]    = useState(true);
  const [error,        setError]      = useState<string | null>(null);
  const [activeTab,    setActiveTab]  = useState<TabStatus>("ALL");
  const [page,         setPage]       = useState(1);
  const LIMIT = 20;

  const fetchApps = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) { setLoading(true); setError(null); }
    const params: Record<string, string> = { page: String(page), limit: String(LIMIT) };
    if (activeTab !== "ALL") params.status = activeTab;
    const res = await workerApi.getApplications(params);
    if (res.success) {
      setApps((res.data as Application[]) ?? []);
      setTotal((res as unknown as { total: number }).total ?? 0);
    } else if (!opts?.silent) {
      setError(res.error ?? "Could not load applications.");
    }
    if (!opts?.silent) setLoading(false);
  }, [activeTab, page]);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  // Background refresh so status changes / interview responses show up without
  // a manual reload — silent (no spinner), preserves scroll position and each
  // ApplicationCard's expanded state (React keeps that local state as long as
  // the app.id keys stay stable across the re-render).
  useVisibilityPoll(useCallback(() => fetchApps({ silent: true }), [fetchApps]), 60_000);

  // Reset page when tab changes
  function switchTab(tab: TabStatus) {
    setActiveTab(tab);
    setPage(1);
    setApps([]);
  }

  function handleWithdrawn(id: string) {
    setApps(prev => prev.map(a => a.id === id ? { ...a, status: "WITHDRAWN" } : a));
  }

  function handleInterviewResponded(id: string, response: string, message: string | null) {
    setApps(prev => prev.map(a => a.id === id
      ? { ...a, interviewResponse: response, interviewResponseMessage: message, interviewRespondedAt: new Date().toISOString() }
      : a));
  }

  // Derive tab counts from currently loaded data (all-tab load gives full counts)
  const countByStatus = apps.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  const TAB_LABELS: Record<TabStatus, string> = {
    ALL: "All", APPLIED: "Applied", VIEWED: "Viewed",
    SHORTLISTED: "Shortlisted", INTERVIEWED: "Interview",
    ACCEPTED: "Accepted", REJECTED: "Rejected",
  };

  return (
    <div className="min-h-screen px-4 sm:px-6 pt-6 pb-8 md:px-8" style={{ maxWidth: 860, margin: "0 auto", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Lock status banner */}
      <LockStatusBanner />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>My applications</div>
          <div style={{ fontSize: 13, color: "#71717a", marginTop: 4 }}>
            {!loading && `${total} total application${total !== 1 ? "s" : ""}`}
          </div>
        </div>
        <Link
          href="/worker/jobs"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 10, background: "rgba(0,144,255,0.1)", border: "1px solid rgba(0,144,255,0.25)", color: "#2dd4bf", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
        >
          Browse jobs
        </Link>
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex", gap: 2, flexWrap: "wrap",
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12, padding: 4, marginBottom: 24,
      }}>
        {TAB_STATUSES.map(tab => {
          const isActive = tab === activeTab;
          const count = tab === "ALL" ? total : countByStatus[tab];
          const cfg = tab !== "ALL" ? STATUS_CFG[tab] : null;
          return (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 9, cursor: "pointer",
                fontSize: 12, fontWeight: isActive ? 700 : 500,
                fontFamily: "inherit", border: "none",
                background: isActive ? "#1f1f1f" : "transparent",
                color: isActive ? "#fff" : "#71717a",
                boxShadow: isActive ? "0 1px 4px rgba(0,0,0,0.4)" : "none",
                transition: "all 0.15s",
              }}
            >
              {TAB_LABELS[tab]}
              {count != null && count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, minWidth: 16, height: 16,
                  borderRadius: 8, display: "flex", alignItems: "center",
                  justifyContent: "center", padding: "0 4px",
                  background: isActive && cfg ? cfg.pillBg : "rgba(255,255,255,0.06)",
                  color: isActive && cfg ? cfg.pill : "#555",
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <ErrorState message={error} retry={() => fetchApps()} title="Could not load applications" />
      )}

      {/* Empty state */}
      {!loading && !error && apps.length === 0 && (
        <div style={{
          background: "#161616", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 16, padding: "60px 32px", textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>📬</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
            {activeTab === "ALL" ? "No applications yet" : `No ${TAB_LABELS[activeTab].toLowerCase()} applications`}
          </div>
          <div style={{ fontSize: 13, color: "#71717a", marginBottom: 24 }}>
            {activeTab === "ALL"
              ? "Start applying to jobs to track your progress here."
              : "No applications in this category."}
          </div>
          {activeTab === "ALL" && (
            <Link
              href="/worker/jobs"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 22px", borderRadius: 10, background: "rgba(0,144,255,0.1)", border: "1px solid rgba(0,144,255,0.3)", color: "#2dd4bf", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
            >
              Browse open jobs →
            </Link>
          )}
        </div>
      )}

      {/* Application list */}
      {!loading && apps.length > 0 && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {apps.map(app => (
              <ApplicationCard key={app.id} app={app} onWithdrawn={handleWithdrawn} onInterviewResponded={handleInterviewResponded} />
            ))}
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 28 }}>
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "7px 14px", color: page === 1 ? "#444" : "#a1a1aa", cursor: page === 1 ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600 }}
              >
                ← Prev
              </button>
              <span style={{ fontSize: 12, color: "#555" }}>
                Page {page} of {Math.ceil(total / LIMIT)}
              </span>
              <button
                disabled={page >= Math.ceil(total / LIMIT)}
                onClick={() => setPage(p => p + 1)}
                style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "7px 14px", color: page >= Math.ceil(total / LIMIT) ? "#444" : "#a1a1aa", cursor: page >= Math.ceil(total / LIMIT) ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600 }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function WorkerApplicationsPage() {
  return (
    <Suspense fallback={<LoadingPage color="teal" />}>
      <ApplicationsContent />
    </Suspense>
  );
}
