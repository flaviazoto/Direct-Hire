"use client";
// src/app/(app)/employer/jobs/[id]/applicants/page.tsx

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { employerApi } from "@/lib/api-client";
import { LoadingPage, ToastDisplay, type ToastData } from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────────

interface WorkerProfile {
  skills:           { skill: string }[];
  years_experience: number | null;
  expected_salary:  number | string | null;
  country:          string | null;
  city:             string | null;
  languages:        { language: string; proficiencyLevel: string }[];
}

interface Worker {
  id:           string;
  email:        string;
  first_name:   string | null;
  last_name:    string | null;
  is_locked:    boolean;
  locked_by_me: boolean;
  profile:      WorkerProfile;
}

interface Application {
  id:                         string;
  status:                     string;
  created_at:                 string;
  cover_letter:               string | null;
  match_score:                number | string | null;
  interview_contact_unlocked: boolean;
  worker:                     Worker;
}

interface JobDetail {
  id:             string;
  title:          string;
  companyName:    string;
  requiredSkills: string[];
}

// ── Status / tab config ────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; border: string; dot: string; pill: string; pillBg: string; pillBorder: string }> = {
  APPLIED:     { label: "New",          border: "#555",    dot: "#71717a", pill: "#a1a1aa", pillBg: "rgba(161,161,170,0.08)", pillBorder: "rgba(161,161,170,0.2)"  },
  VIEWED:      { label: "Viewed",       border: "#3b82f6", dot: "#60a5fa", pill: "#60a5fa", pillBg: "rgba(96,165,250,0.08)",  pillBorder: "rgba(96,165,250,0.25)"  },
  SHORTLISTED: { label: "Shortlisted",  border: "#f59e0b", dot: "#fbbf24", pill: "#fbbf24", pillBg: "rgba(251,191,36,0.08)",  pillBorder: "rgba(251,191,36,0.25)"  },
  INTERVIEWED: { label: "Interview",    border: "#0090FF", dot: "#60A5FA", pill: "#60A5FA", pillBg: "rgba(0,144,255,0.08)",  pillBorder: "rgba(0,144,255,0.25)"  },
  ACCEPTED:    { label: "Accepted",     border: "#22c55e", dot: "#4ade80", pill: "#4ade80", pillBg: "rgba(74,222,128,0.08)",  pillBorder: "rgba(74,222,128,0.25)"  },
  REJECTED:    { label: "Not selected", border: "#ef4444", dot: "#f87171", pill: "#f87171", pillBg: "rgba(248,113,113,0.08)", pillBorder: "rgba(248,113,113,0.25)" },
};

type TabKey = "ALL" | "NEW" | "SHORTLISTED" | "INTERVIEW" | "ACCEPTED" | "REJECTED";

const TABS: { key: TabKey; label: string; apiStatus?: string; emptyMsg: string }[] = [
  { key: "ALL",         label: "All",         apiStatus: undefined,     emptyMsg: "No one has applied yet. Make sure your job post is live." },
  { key: "NEW",         label: "New",         apiStatus: "APPLIED",     emptyMsg: "No new applications." },
  { key: "SHORTLISTED", label: "Shortlisted", apiStatus: "SHORTLISTED", emptyMsg: "No shortlisted candidates yet." },
  { key: "INTERVIEW",   label: "Interview",   apiStatus: "INTERVIEWED", emptyMsg: "No candidates in the interview stage." },
  { key: "ACCEPTED",    label: "Accepted",    apiStatus: "ACCEPTED",    emptyMsg: "No accepted candidates yet." },
  { key: "REJECTED",    label: "Rejected",    apiStatus: "REJECTED",    emptyMsg: "No rejected candidates." },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function workerName(w: Worker) {
  return [w.first_name, w.last_name].filter(Boolean).join(" ") || "Anonymous";
}

function initials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  { bg: "rgba(0,144,255,0.18)",  color: "#60A5FA" },
  { bg: "rgba(96,165,250,0.18)",  color: "#60a5fa" },
  { bg: "rgba(167,139,250,0.18)", color: "#c4b5fd" },
  { bg: "rgba(251,191,36,0.18)",  color: "#fbbf24" },
  { bg: "rgba(251,113,133,0.18)", color: "#fb7185" },
];

function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function daysAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "1 day ago";
  return `${d} days ago`;
}

function fmtSalary(v: number | string | null) {
  if (v == null) return null;
  const n = Number(v);
  if (!n) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
}

// ── Small atoms ────────────────────────────────────────────────────────────────

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

function Spinner({ size = 18, color = "#0090FF" }: { size?: number; color?: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      border: `2px solid ${color}22`, borderTop: `2px solid ${color}`,
      animation: "spin 0.8s linear infinite", flexShrink: 0,
    }} />
  );
}

function SkeletonCard() {
  return (
    <div style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden", display: "flex" }}>
      <div style={{ width: 3, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />
      <div style={{ padding: "16px 20px", flex: 1, display: "flex", gap: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: "40%", height: 13, background: "rgba(255,255,255,0.07)", borderRadius: 6, marginBottom: 8 }} />
          <div style={{ width: "25%", height: 11, background: "rgba(255,255,255,0.05)", borderRadius: 6, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 6 }}>
            {[70, 90, 60].map(w => <div key={w} style={{ width: w, height: 18, background: "rgba(255,255,255,0.05)", borderRadius: 6 }} />)}
          </div>
        </div>
        <div style={{ width: 70, height: 22, borderRadius: 99, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
      </div>
    </div>
  );
}

// ── Action button helpers ──────────────────────────────────────────────────────

function ActionBtn({
  label, onClick, variant = "secondary", disabled = false, loading = false,
}: {
  label: string; onClick: () => void; variant?: "secondary" | "teal" | "danger" | "amber"; disabled?: boolean; loading?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    secondary: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#a1a1aa" },
    teal:      { background: "rgba(0,144,255,0.1)",   border: "1px solid rgba(0,144,255,0.3)",  color: "#60A5FA" },
    danger:    { background: "rgba(239,68,68,0.08)",   border: "1px solid rgba(239,68,68,0.25)",  color: "#f87171" },
    amber:     { background: "rgba(245,158,11,0.08)",  border: "1px solid rgba(245,158,11,0.25)", color: "#fbbf24" },
  };
  return (
    <button
      onClick={e => { e.stopPropagation(); if (!disabled && !loading) onClick(); }}
      disabled={disabled || loading}
      style={{
        ...styles[variant],
        borderRadius: 8, padding: "5px 13px", cursor: disabled || loading ? "not-allowed" : "pointer",
        fontSize: 11, fontWeight: 700, fontFamily: "inherit",
        display: "inline-flex", alignItems: "center", gap: 6,
        opacity: disabled ? 0.5 : 1, transition: "all 0.15s",
      }}
    >
      {loading && <Spinner size={11} color={variant === "teal" ? "#60A5FA" : "#fff"} />}
      {label}
    </button>
  );
}

// ── Reject modal ───────────────────────────────────────────────────────────────

function RejectModal({
  name, onConfirm, onCancel, loading,
}: {
  name: string; onConfirm: (reason: string) => void; onCancel: () => void; loading: boolean;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 28, maxWidth: 440, width: "100%" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Not moving forward?</div>
        <div style={{ fontSize: 13, color: "#71717a", marginBottom: 18 }}>
          Rejecting <strong style={{ color: "#a1a1aa" }}>{name}</strong>. The candidate will be notified. Add an internal reason (optional — not shared with the candidate).
        </div>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Internal note, e.g. overqualified, location mismatch…"
          rows={3}
          style={{
            width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px",
            color: "#e4e4e7", fontSize: 13, fontFamily: "inherit", lineHeight: 1.6,
            resize: "vertical", outline: "none", marginBottom: 20,
          }}
        />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 18px", color: "#a1a1aa", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={loading}
            style={{ background: loading ? "rgba(239,68,68,0.4)" : "#ef4444", border: "none", borderRadius: 10, padding: "9px 20px", color: "#fff", cursor: loading ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}
          >
            {loading && <Spinner size={13} color="#fff" />}
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Interview modal ────────────────────────────────────────────────────────────

function InterviewModal({
  name, onConfirm, onCancel, loading,
}: {
  name: string; onConfirm: (instructions: string) => void; onCancel: () => void; loading: boolean;
}) {
  const [instructions, setInstructions] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 28, maxWidth: 480, width: "100%" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Invite to interview</div>
        <div style={{ fontSize: 13, color: "#71717a", marginBottom: 18 }}>
          Inviting <strong style={{ color: "#a1a1aa" }}>{name}</strong> to an interview.
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Interview instructions (optional)
        </div>
        <textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder="e.g. Please email us to schedule a video call. Our team is available Mon–Fri 9am–5pm GMT."
          rows={4}
          style={{
            width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px",
            color: "#e4e4e7", fontSize: 13, fontFamily: "inherit", lineHeight: 1.6,
            resize: "vertical", outline: "none", marginBottom: 12,
          }}
        />
        <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5, marginBottom: 22, background: "rgba(0,144,255,0.04)", border: "1px solid rgba(0,144,255,0.15)", borderRadius: 8, padding: "8px 12px" }}>
          The candidate will receive your contact details and these instructions.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 18px", color: "#a1a1aa", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm(instructions.trim())}
            disabled={loading}
            style={{ background: loading ? "rgba(0,144,255,0.4)" : "rgba(0,144,255,0.85)", border: "none", borderRadius: 10, padding: "9px 20px", color: "#fff", cursor: loading ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}
          >
            {loading && <Spinner size={13} color="#fff" />}
            Confirm invitation
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Accept modal ───────────────────────────────────────────────────────────────

function AcceptModal({
  name, jobTitle, onConfirm, onCancel, loading,
}: {
  name: string; jobTitle: string; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 28, maxWidth: 420, width: "100%" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 10 }}>
          Accept {name} for {jobTitle}?
        </div>
        <div style={{ fontSize: 13, color: "#71717a", lineHeight: 1.6, marginBottom: 24 }}>
          You're about to accept this candidate. They'll be notified and their contact details will be available in your dashboard.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 18px", color: "#a1a1aa", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{ background: loading ? "rgba(74,222,128,0.4)" : "rgba(74,222,128,0.8)", border: "none", borderRadius: 10, padding: "9px 20px", color: "#000", cursor: loading ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}
          >
            {loading && <Spinner size={13} color="#000" />}
            Accept candidate
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Profile drawer ─────────────────────────────────────────────────────────────

function ProfileDrawer({
  app, jobTitle, requiredSkills, onClose, onStatusUpdate,
}: {
  app: Application;
  jobTitle: string;
  requiredSkills: Set<string>;
  onClose: () => void;
  onStatusUpdate: (id: string, status: string, extra?: { reason?: string; interview_instructions?: string }) => Promise<void>;
}) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [modal, setModal] = useState<"interview" | "accept" | "reject" | null>(null);
  const name = workerName(app.worker);
  const aColor = avatarColor(name);
  const profile = app.worker.profile;
  const salary = fmtSalary(profile.expected_salary);
  const location = [profile.city, profile.country].filter(Boolean).join(", ");

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !modal) onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, modal]);

  async function doAction(status: string, extra?: { reason?: string; interview_instructions?: string }) {
    setActionLoading(status);
    await onStatusUpdate(app.id, status, extra);
    setActionLoading(null);
    setModal(null);
    onClose();
  }

  const canShortlist  = app.status === "APPLIED" || app.status === "VIEWED";
  const canInterview  = app.status === "SHORTLISTED";
  const canAccept     = app.status === "INTERVIEWED";
  const canReject     = ["APPLIED", "VIEWED", "SHORTLISTED", "INTERVIEWED"].includes(app.status);
  const isTerminal    = app.status === "ACCEPTED" || app.status === "REJECTED" || app.status === "WITHDRAWN";

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: "fixed", inset: 0, zIndex: 8000, background: "rgba(0,0,0,0.5)" }} onClick={() => !modal && onClose()} />

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 8001,
        width: "min(440px, 100vw)", background: "#0e0e0e",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        display: "flex", flexDirection: "column",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.6)",
        animation: "slideIn 0.22s ease",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: aColor.bg, border: `1.5px solid ${aColor.color}33`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: aColor.color }}>
            {initials(name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{name}</div>
            {location && <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>{location}</div>}
            <div style={{ marginTop: 5 }}><StatusPill status={app.status} /></div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
            {profile.years_experience != null && (
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{profile.years_experience}</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>yrs exp</div>
              </div>
            )}
            {salary && (
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#86efac" }}>{salary}</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>expected / mo</div>
              </div>
            )}
            {app.match_score != null && (
              <div style={{ background: "rgba(0,144,255,0.06)", border: "1px solid rgba(0,144,255,0.2)", borderRadius: 10, padding: "10px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#60A5FA" }}>{Number(app.match_score)}%</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>match</div>
              </div>
            )}
          </div>

          {/* Skills */}
          {profile.skills.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Skills</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {profile.skills.map(({ skill }) => {
                  const matched = requiredSkills.has(skill.toLowerCase());
                  return (
                    <span key={skill} style={{
                      fontSize: 12, padding: "4px 10px", borderRadius: 8, fontWeight: matched ? 700 : 500,
                      color: matched ? "#60A5FA" : "#a1a1aa",
                      background: matched ? "rgba(0,144,255,0.1)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${matched ? "rgba(0,144,255,0.3)" : "rgba(255,255,255,0.08)"}`,
                    }}>
                      {matched && <span style={{ marginRight: 4 }}>✓</span>}{skill}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Languages */}
          {profile.languages.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Languages</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {profile.languages.map(l => (
                  <span key={l.language} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8, color: "#a1a1aa", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {l.language} <span style={{ color: "#555" }}>· {l.proficiencyLevel}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Cover letter */}
          {app.cover_letter && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Cover letter</div>
              <div style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.7, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "12px 14px" }}>
                {app.cover_letter}
              </div>
            </div>
          )}

          {/* Applied date */}
          <div style={{ fontSize: 12, color: "#444" }}>Applied {daysAgo(app.created_at)}</div>
        </div>

        {/* Action footer */}
        {!isTerminal && (
          <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canShortlist && (
              <ActionBtn label="Shortlist" variant="amber"
                loading={actionLoading === "SHORTLISTED"}
                onClick={() => doAction("SHORTLISTED")} />
            )}
            {canInterview && (
              <ActionBtn label="Invite to interview" variant="teal"
                loading={actionLoading === "INTERVIEWED"}
                onClick={() => setModal("interview")} />
            )}
            {canAccept && (
              <ActionBtn label="Accept" variant="teal"
                loading={actionLoading === "ACCEPTED"}
                onClick={() => setModal("accept")} />
            )}
            {canReject && (
              <ActionBtn label="Reject" variant="danger"
                loading={actionLoading === "REJECTED"}
                onClick={() => setModal("reject")} />
            )}
          </div>
        )}
      </div>

      {/* Sub-modals (rendered above drawer) */}
      {modal === "interview" && (
        <InterviewModal
          name={name}
          loading={actionLoading === "INTERVIEWED"}
          onConfirm={instructions => doAction("INTERVIEWED", { interview_instructions: instructions })}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === "accept" && (
        <AcceptModal
          name={name} jobTitle={jobTitle}
          loading={actionLoading === "ACCEPTED"}
          onConfirm={() => doAction("ACCEPTED")}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === "reject" && (
        <RejectModal
          name={name}
          loading={actionLoading === "REJECTED"}
          onConfirm={reason => doAction("REJECTED", reason ? { reason } : undefined)}
          onCancel={() => setModal(null)}
        />
      )}
    </>
  );
}

// ── Candidate card ─────────────────────────────────────────────────────────────

function CandidateCard({
  app, job, requiredSkills, onViewProfile, onStatusUpdate,
}: {
  app: Application;
  job: JobDetail;
  requiredSkills: Set<string>;
  onViewProfile: (app: Application) => void;
  onStatusUpdate: (id: string, status: string, extra?: { reason?: string; interview_instructions?: string }) => Promise<void>;
}) {
  const [modal, setModal] = useState<"interview" | "accept" | "reject" | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const name     = workerName(app.worker);
  const aColor   = avatarColor(name);
  const cfg      = STATUS_CFG[app.status] ?? STATUS_CFG.APPLIED;
  const profile  = app.worker.profile;
  const location = [profile.city, profile.country].filter(Boolean).join(", ");
  const salary   = fmtSalary(profile.expected_salary);
  const score    = app.match_score != null ? Number(app.match_score) : null;

  const canShortlist    = app.status === "APPLIED" || app.status === "VIEWED";
  const canInterview    = app.status === "SHORTLISTED";
  const canAccept       = app.status === "INTERVIEWED";
  const canReject       = ["APPLIED", "VIEWED", "SHORTLISTED", "INTERVIEWED"].includes(app.status);
  const isTerminal      = app.status === "ACCEPTED" || app.status === "REJECTED" || app.status === "WITHDRAWN";
  const isLocked        = app.worker.is_locked;
  const lockedByMe      = app.worker.locked_by_me;
  // Accept is blocked when reserved by a different employer and at SHORTLISTED or INTERVIEWED stage
  const acceptBlocked   = isLocked && !lockedByMe && (app.status === "SHORTLISTED" || app.status === "INTERVIEWED");

  async function doAction(status: string, extra?: { reason?: string; interview_instructions?: string }) {
    setActionLoading(status);
    await onStatusUpdate(app.id, status, extra);
    setActionLoading(null);
    setModal(null);
  }

  return (
    <>
      {modal === "interview" && (
        <InterviewModal
          name={name}
          loading={actionLoading === "INTERVIEWED"}
          onConfirm={instructions => doAction("INTERVIEWED", { interview_instructions: instructions })}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === "accept" && (
        <AcceptModal
          name={name} jobTitle={job.title}
          loading={actionLoading === "ACCEPTED"}
          onConfirm={() => doAction("ACCEPTED")}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === "reject" && (
        <RejectModal
          name={name}
          loading={actionLoading === "REJECTED"}
          onConfirm={reason => doAction("REJECTED", reason ? { reason } : undefined)}
          onCancel={() => setModal(null)}
        />
      )}

      <div style={{
        background: "#161616", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 14, overflow: "hidden",
        transition: "border-color 0.15s",
      }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.13)")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)")}
      >
        <div style={{ display: "flex" }}>
          {/* Left status bar */}
          <div style={{ width: 3, background: cfg.border, flexShrink: 0 }} />

          <div style={{ padding: "14px 18px", flex: 1, minWidth: 0 }}>
            {/* Top row */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              {/* Avatar */}
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: aColor.bg, border: `1.5px solid ${aColor.color}33`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: aColor.color }}>
                {initials(name)}
              </div>

              {/* Name + location */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>{name}</div>
                {location && <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{location}</div>}
              </div>

              {/* Lock pill + Status + score */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {isLocked && lockedByMe && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 99, padding: "2px 9px", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fbbf24", flexShrink: 0, display: "inline-block" }} />
                    Reserved by you
                  </span>
                )}
                {isLocked && !lockedByMe && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#71717a", background: "rgba(113,113,122,0.1)", border: "1px solid rgba(113,113,122,0.25)", borderRadius: 99, padding: "2px 9px", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#71717a", flexShrink: 0, display: "inline-block" }} />
                    Reserved
                  </span>
                )}
                {score != null && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#60A5FA", background: "rgba(0,144,255,0.08)", border: "1px solid rgba(0,144,255,0.2)", borderRadius: 99, padding: "2px 8px" }}>
                    {score}% match
                  </span>
                )}
                <StatusPill status={app.status} />
              </div>
            </div>

            {/* Mid row: skills + experience + salary */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, margin: "10px 0 0 48px" }}>
              {profile.skills.slice(0, 6).map(({ skill }) => {
                const matched = requiredSkills.has(skill.toLowerCase());
                return (
                  <span key={skill} style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 6, fontWeight: matched ? 700 : 500,
                    color: matched ? "#60A5FA" : "#71717a",
                    background: matched ? "rgba(0,144,255,0.08)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${matched ? "rgba(0,144,255,0.25)" : "rgba(255,255,255,0.07)"}`,
                  }}>
                    {skill}
                  </span>
                );
              })}
              {profile.skills.length > 6 && (
                <span style={{ fontSize: 11, color: "#555" }}>+{profile.skills.length - 6}</span>
              )}
              {profile.years_experience != null && (
                <span style={{ fontSize: 11, color: "#555", marginLeft: 4 }}>
                  {profile.years_experience} yr{profile.years_experience !== 1 ? "s" : ""} exp
                </span>
              )}
              {salary && (
                <span style={{ fontSize: 11, color: "#86efac", marginLeft: 4 }}>
                  {salary} / mo
                </span>
              )}
            </div>

            {/* Bottom row: date + actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, marginLeft: 48, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "#444", marginRight: 4 }}>Applied {daysAgo(app.created_at)}</span>

              <ActionBtn label="View profile" variant="secondary" onClick={() => onViewProfile(app)} />

              {canShortlist && (
                <ActionBtn label="Shortlist" variant="amber" loading={actionLoading === "SHORTLISTED"}
                  onClick={() => doAction("SHORTLISTED")} />
              )}
              {canInterview && (
                <ActionBtn label="Invite to interview" variant="teal" loading={actionLoading === "INTERVIEWED"}
                  onClick={() => setModal("interview")} />
              )}
              {canAccept && !acceptBlocked && (
                <ActionBtn label="Accept" variant="teal" loading={actionLoading === "ACCEPTED"}
                  onClick={() => setModal("accept")} />
              )}
              {canAccept && acceptBlocked && (
                <span title="This worker is reserved by another employer. You can accept them once the reservation ends." style={{ display: "inline-flex", alignItems: "center" }}>
                  <ActionBtn label="Accept" variant="teal" disabled onClick={() => {}} />
                </span>
              )}
              {canReject && (
                <ActionBtn label="Reject" variant="danger" loading={actionLoading === "REJECTED"}
                  onClick={() => setModal("reject")} />
              )}
              {isTerminal && (
                <span style={{ fontSize: 11, color: "#444" }}>—</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

function ApplicantsContent() {
  const params = useParams<{ id: string }>();
  const jobId  = params.id;

  const [job,          setJob]          = useState<JobDetail | null>(null);
  const [apps,         setApps]         = useState<Application[]>([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [jobLoading,   setJobLoading]   = useState(true);
  const [activeTab,    setActiveTab]    = useState<TabKey>("ALL");
  const [sort,         setSort]         = useState<"newest" | "match">("newest");
  const [page,         setPage]         = useState(1);
  const [toast,        setToast]        = useState<ToastData>(null);
  const [drawer,       setDrawer]       = useState<Application | null>(null);

  const LIMIT = 20;
  const requiredSkills = new Set((job?.requiredSkills ?? []).map(s => s.toLowerCase()));

  function showToast(msg: string, type: "ok" | "err") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  // Fetch job detail for title + required skills
  useEffect(() => {
    if (!jobId) return;
    setJobLoading(true);
    employerApi.getJob(jobId).then(res => {
      if (res.success && res.data) setJob(res.data as unknown as JobDetail);
      setJobLoading(false);
    });
  }, [jobId]);

  const fetchApps = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    const p: Record<string, string> = { page: String(page), limit: String(LIMIT) };
    const tab = TABS.find(t => t.key === activeTab);
    if (tab?.apiStatus) p.status = tab.apiStatus;
    if (sort === "match") p.sort = "match_score";

    const res = await employerApi.getJobApplications(jobId, p);
    if (res.success) {
      setApps((res.data as Application[]) ?? []);
      setTotal((res as unknown as { total: number }).total ?? 0);
    }
    setLoading(false);
  }, [jobId, activeTab, sort, page]);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  function switchTab(key: TabKey) {
    setActiveTab(key);
    setPage(1);
    setApps([]);
  }

  // Derive tab counts from loaded data (when on ALL tab)
  const countByStatus = apps.reduce<Record<string, number>>((acc, a) => {
    // APPLIED apps are auto-marked VIEWED by backend on fetch — count them as NEW
    const key = a.status === "APPLIED" ? "NEW" : a.status;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  // Status update handler (shared by card + drawer)
  async function handleStatusUpdate(
    id: string,
    status: string,
    extra?: { reason?: string; interview_instructions?: string },
  ) {
    const res = await employerApi.updateApplicationStatus(id, status, extra);
    if (!res.success) {
      showToast((res as { error?: string }).error ?? "Action failed", "err");
      return;
    }

    // Update in-place
    setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));

    // Toast messages
    if (status === "SHORTLISTED")  showToast("Candidate shortlisted", "ok");
    if (status === "INTERVIEWED")  showToast("Interview invitation sent — contact details shared", "ok");
    if (status === "ACCEPTED")     showToast("Candidate accepted", "ok");
    if (status === "REJECTED")     showToast("Application rejected", "err");
  }

  const currentTab = TABS.find(t => t.key === activeTab)!;
  const jobTitle   = job?.title ?? "Job";

  return (
    <div style={{ padding: "32px 40px", maxWidth: 900, margin: "0 auto", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>

      <ToastDisplay toast={toast} />

      {/* Profile drawer */}
      {drawer && (
        <ProfileDrawer
          app={drawer}
          jobTitle={jobTitle}
          requiredSkills={requiredSkills}
          onClose={() => setDrawer(null)}
          onStatusUpdate={async (id, status, extra) => {
            await handleStatusUpdate(id, status, extra);
          }}
        />
      )}

      {/* Back link */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/employer/jobs" style={{ fontSize: 13, color: "#555", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
          onMouseEnter={e => (e.currentTarget.style.color = "#a1a1aa")}
          onMouseLeave={e => (e.currentTarget.style.color = "#555")}
        >
          ← {jobLoading ? "Jobs" : jobTitle}
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>Applicants</div>
          {!loading && (
            <span style={{ fontSize: 13, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#555" }}>
              {total}
            </span>
          )}
        </div>

        {/* Sort toggle */}
        <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 3 }}>
          {(["newest", "match"] as const).map(s => (
            <button key={s}
              onClick={() => { setSort(s); setPage(1); }}
              style={{
                background: sort === s ? "#1f1f1f" : "transparent",
                border: "none", borderRadius: 8, padding: "6px 14px",
                fontSize: 12, fontWeight: sort === s ? 700 : 500, fontFamily: "inherit",
                color: sort === s ? "#fff" : "#71717a",
                cursor: "pointer", transition: "all 0.15s",
                boxShadow: sort === s ? "0 1px 4px rgba(0,0,0,0.4)" : "none",
              }}
            >
              {s === "newest" ? "Newest" : "Best match"}
            </button>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex", gap: 2, flexWrap: "wrap",
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12, padding: 4, marginBottom: 24,
      }}>
        {TABS.map(tab => {
          const isActive = tab.key === activeTab;
          const count = tab.key === "ALL" ? (activeTab === "ALL" ? total : undefined) : countByStatus[tab.key === "NEW" ? "NEW" : tab.apiStatus ?? ""];
          return (
            <button
              key={tab.key}
              onClick={() => switchTab(tab.key)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 9, cursor: "pointer",
                fontSize: 12, fontWeight: isActive ? 700 : 500, fontFamily: "inherit",
                border: "none",
                background: isActive ? "#1f1f1f" : "transparent",
                color: isActive ? "#fff" : "#71717a",
                boxShadow: isActive ? "0 1px 4px rgba(0,0,0,0.4)" : "none",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
              {count != null && count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, minWidth: 16, height: 16,
                  borderRadius: 8, display: "flex", alignItems: "center",
                  justifyContent: "center", padding: "0 4px",
                  background: tab.key === "NEW" && isActive ? "rgba(161,161,170,0.15)"
                    : tab.key === "SHORTLISTED" && isActive ? "rgba(251,191,36,0.15)"
                    : tab.key === "INTERVIEW" && isActive ? "rgba(0,144,255,0.15)"
                    : tab.key === "ACCEPTED" && isActive ? "rgba(74,222,128,0.15)"
                    : tab.key === "REJECTED" && isActive ? "rgba(248,113,113,0.15)"
                    : "rgba(255,255,255,0.06)",
                  color: tab.key === "NEW" && isActive ? "#a1a1aa"
                    : tab.key === "SHORTLISTED" && isActive ? "#fbbf24"
                    : tab.key === "INTERVIEW" && isActive ? "#60A5FA"
                    : tab.key === "ACCEPTED" && isActive ? "#4ade80"
                    : tab.key === "REJECTED" && isActive ? "#f87171"
                    : "#555",
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!loading && apps.length === 0 && (
        <div style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "60px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 38, marginBottom: 14 }}>
            {activeTab === "ALL" ? "📭" : activeTab === "ACCEPTED" ? "🎯" : "🔍"}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
            {activeTab === "ALL" ? "No applicants yet" : `No ${currentTab.label.toLowerCase()} candidates`}
          </div>
          <div style={{ fontSize: 13, color: "#71717a", maxWidth: 340, margin: "0 auto" }}>
            {currentTab.emptyMsg}
          </div>
        </div>
      )}

      {/* Applicant list */}
      {!loading && apps.length > 0 && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {apps.map(app => (
              <CandidateCard
                key={app.id}
                app={app}
                job={job!}
                requiredSkills={requiredSkills}
                onViewProfile={setDrawer}
                onStatusUpdate={handleStatusUpdate}
              />
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

export default function EmployerApplicantsPage() {
  return (
    <Suspense fallback={<LoadingPage color="teal" />}>
      <ApplicantsContent />
    </Suspense>
  );
}
