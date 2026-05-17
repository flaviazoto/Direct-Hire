"use client";
// frontend/src/app/(app)/worker/lock/page.tsx
// Explains the current lock state to the worker.
// NEVER surfaces employer name, email, or any identifying detail.

import { useEffect, useRef, useState } from "react";
import { workerApi } from "@/lib/api-client";

// ── Types ─────────────────────────────────────────────────────────────────────

type Outcome = "hired" | "released" | "expired" | "active";

interface ActiveLock {
  locked_at:         string;
  expires_at:        string;
  seconds_remaining: number;
  employer_tier:     string;
}

interface LockHistoryEntry {
  locked_at:   string;
  released_at: string | null;
  outcome:     Outcome;
}

interface LockStatus {
  is_locked:    boolean;
  active_lock:  ActiveLock | null;
  lock_history: LockHistoryEntry[];
}

// ── Palette ───────────────────────────────────────────────────────────────────

const AMBER       = "#EF9F27";
const AMBER_BG    = "#FAEEDA";
const AMBER_DARK  = "#412402";
const TEAL        = "#1D9E75";
const TEAL_DARK   = "#0F6E56";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days  = Math.floor(diff / 86_400_000);
  const weeks = Math.floor(days / 7);
  if (days === 0)       return "today";
  if (days === 1)       return "yesterday";
  if (days < 7)        return `${days} days ago`;
  if (weeks === 1)     return "1 week ago";
  if (weeks < 52)     return `${weeks} weeks ago`;
  return `${Math.floor(weeks / 52)} years ago`;
}

function durationDays(start: string, end: string | null): string {
  if (!end) return "ongoing";
  const days = Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000
  );
  return `${days} day${days !== 1 ? "s" : ""}`;
}

function decompose(totalSecs: number) {
  const s   = Math.max(0, totalSecs);
  const days  = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins  = Math.floor((s % 3600) / 60);
  const secs  = s % 60;
  return { days, hours, mins, secs };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LockIcon({ size = 48, color = AMBER }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
      <circle cx="12" cy="16" r="1.5" fill={color} stroke="none" />
    </svg>
  );
}

// Countdown box: "05 days"
function CountdownBox({ value, label }: { value: number; label: string }) {
  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        background:     "#ffffff",
        border:         `1.5px solid ${AMBER}`,
        borderRadius:   10,
        padding:        "12px 18px",
        minWidth:       72,
      }}
    >
      <span
        style={{
          fontSize:   28,
          fontWeight: 800,
          color:      TEAL_DARK,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {pad(value)}
      </span>
      <span
        style={{
          fontSize:   10,
          fontWeight: 600,
          color:      "#94a3b8",
          marginTop:  4,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
    </div>
  );
}

// Outcome pill
function OutcomePill({ outcome }: { outcome: Outcome }) {
  const map: Record<Outcome, { label: string; bg: string; color: string }> = {
    hired:    { label: "Hired",    bg: "#DCFCE7", color: "#14532D" },
    released: { label: "Released", bg: "#F1F5F9", color: "#475569" },
    expired:  { label: "Expired",  bg: "#F1F5F9", color: "#475569" },
    active:   { label: "Active",   bg: AMBER_BG,  color: AMBER_DARK },
  };
  const { label, bg, color } = map[outcome] ?? map.expired;
  return (
    <span
      style={{
        display:      "inline-flex",
        alignItems:   "center",
        background:   bg,
        color,
        fontSize:     11,
        fontWeight:   700,
        padding:      "2px 9px",
        borderRadius: 100,
        letterSpacing: "0.02em",
        whiteSpace:   "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// History table — shared between locked and unlocked views
function HistoryTable({ history }: { history: LockHistoryEntry[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width:           "100%",
          borderCollapse:  "collapse",
          fontSize:        13,
          color:           "#1e293b",
        }}
      >
        <thead>
          <tr style={{ borderBottom: "1.5px solid #e2e8f0" }}>
            {["Period", "Duration", "Outcome"].map(h => (
              <th
                key={h}
                style={{
                  padding:    "8px 12px",
                  textAlign:  "left",
                  fontWeight: 600,
                  fontSize:   11,
                  color:      "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {history.map((row, i) => (
            <tr
              key={i}
              style={{
                borderBottom: "1px solid #f1f5f9",
                background:   i % 2 === 0 ? "#ffffff" : "#fafafa",
              }}
            >
              <td style={{ padding: "10px 12px", color: "#475569" }}>
                {relativeDate(row.locked_at)}
              </td>
              <td style={{ padding: "10px 12px", color: "#475569" }}>
                {durationDays(row.locked_at, row.released_at)}
              </td>
              <td style={{ padding: "10px 12px" }}>
                <OutcomePill outcome={row.outcome} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Section: active lock ──────────────────────────────────────────────────────

function ActiveLockSection({ lock }: { lock: ActiveLock }) {
  const [secsLeft, setSecsLeft] = useState(lock.seconds_remaining);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSecsLeft(lock.seconds_remaining);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecsLeft(s => Math.max(0, s - 1));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [lock.seconds_remaining]);

  const { days, hours, mins, secs } = decompose(secsLeft);
  const expiryDays = Math.ceil(secsLeft / 86400);

  return (
    <div
      style={{
        background:   "#ffffff",
        borderRadius: 14,
        border:       "1px solid #e2e8f0",
        borderLeft:   `3px solid ${AMBER}`,
        padding:      "28px 32px",
        display:      "flex",
        flexDirection: "column",
        gap:          24,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <LockIcon size={48} color={AMBER} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1
              style={{
                fontSize:   22,
                fontWeight: 800,
                color:      "#08142A",
                margin:     0,
                lineHeight: 1.2,
              }}
            >
              You are under exclusive review
            </h1>
            <span
              style={{
                background:   AMBER,
                color:        AMBER_DARK,
                fontSize:     11,
                fontWeight:   700,
                padding:      "3px 10px",
                borderRadius: 100,
                letterSpacing: "0.02em",
              }}
            >
              Locked
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#64748b", margin: "6px 0 0", lineHeight: 1.5 }}>
            An employer has placed an exclusive review on your profile.
          </p>
        </div>
      </div>

      {/* Explanation bullets */}
      <ul
        style={{
          listStyle:     "none",
          margin:        0,
          padding:       0,
          display:       "flex",
          flexDirection: "column",
          gap:           10,
        }}
      >
        {[
          "Your profile is hidden from other employers while this lock is active",
          `The lock ends automatically in ${expiryDays} day${expiryDays !== 1 ? "s" : ""} if the employer does not hire you`,
          "Being locked usually means the employer is seriously considering you",
        ].map(text => (
          <li
            key={text}
            style={{
              display:    "flex",
              alignItems: "flex-start",
              gap:        10,
              fontSize:   13,
              color:      "#374151",
              lineHeight: 1.55,
            }}
          >
            <span
              style={{
                width:        18,
                height:       18,
                borderRadius: "50%",
                background:   AMBER_BG,
                border:       `1px solid ${AMBER}`,
                display:      "flex",
                alignItems:   "center",
                justifyContent: "center",
                flexShrink:   0,
                marginTop:    1,
              }}
            >
              <svg width={9} height={9} viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 5l2.5 2.5L8 3" stroke={AMBER_DARK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {text}
          </li>
        ))}
      </ul>

      {/* Countdown */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Time remaining
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <CountdownBox value={days}  label="days"  />
          <CountdownBox value={hours} label="hours" />
          <CountdownBox value={mins}  label="min"   />
          <CountdownBox value={secs}  label="sec"   />
        </div>
      </div>
    </div>
  );
}

// ── Section: what happens next ────────────────────────────────────────────────

function WhatHappensNext() {
  const steps = [
    { n: 1, title: "Employer reviews your profile",  desc: "They assess your skills, experience, and fit for their role." },
    { n: 2, title: "Employer makes a decision",       desc: "They will either proceed to hire you or release the lock." },
    { n: 3, title: "Lock ends",                       desc: "Hired or automatically released — your profile becomes visible again." },
  ];

  return (
    <div
      style={{
        background:   "#ffffff",
        borderRadius: 14,
        border:       "1px solid #e2e8f0",
        padding:      "24px 28px",
      }}
    >
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "#08142A", margin: "0 0 18px" }}>
        What happens next
      </h2>
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap:                 0,
        }}
      >
        {steps.map((step, i) => (
          <div
            key={step.n}
            style={{
              display:       "flex",
              flexDirection: "column",
              alignItems:    "flex-start",
              padding:       "0 20px 0 0",
              position:      "relative",
            }}
          >
            {/* Connector line (not on last item) */}
            {i < steps.length - 1 && (
              <div
                aria-hidden="true"
                style={{
                  position:   "absolute",
                  top:        14,
                  right:      0,
                  width:      "calc(100% - 28px)",
                  height:     1.5,
                  background: `linear-gradient(90deg, ${AMBER} 0%, #e2e8f0 100%)`,
                  marginLeft: 28,
                }}
              />
            )}
            {/* Step circle */}
            <div
              style={{
                width:          28,
                height:         28,
                borderRadius:   "50%",
                background:     AMBER_BG,
                border:         `2px solid ${AMBER}`,
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                fontSize:       12,
                fontWeight:     800,
                color:          AMBER_DARK,
                marginBottom:   10,
                zIndex:         1,
                position:       "relative",
              }}
            >
              {step.n}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>
              {step.title}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.55 }}>
              {step.desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section: unlocked, no history ─────────────────────────────────────────────

function WhatIsWorkerLock() {
  return (
    <div
      style={{
        background:   "#ffffff",
        borderRadius: 14,
        border:       "1px solid #e2e8f0",
        padding:      "32px 36px",
        display:      "flex",
        flexDirection: "column",
        gap:          20,
        maxWidth:     560,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width:          48,
            height:         48,
            borderRadius:   "50%",
            background:     AMBER_BG,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            flexShrink:     0,
          }}
        >
          <LockIcon size={24} color={AMBER} />
        </div>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: "#08142A", margin: 0, lineHeight: 1.2 }}>
          What is Worker Lock?
        </h2>
      </div>
      <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.7, margin: 0 }}>
        Worker Lock lets an employer place a temporary exclusive review on your profile.
        While locked, other employers cannot formally hire you — giving the reviewing
        employer focused time to make a hiring decision.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { icon: "✓", text: "It is a strong signal of serious employer interest",           color: TEAL      },
          { icon: "✓", text: "You can still browse and apply to other jobs",                 color: TEAL      },
          { icon: "✓", text: "You pay nothing — the lock fee is paid by the employer",       color: TEAL      },
          { icon: "↺", text: "Locks end automatically if you are not hired within the period", color: "#64748b" },
        ].map(({ icon, text, color }) => (
          <div key={text} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "#374151" }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0, fontSize: 14 }}>{icon}</span>
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkerLockPage() {
  const [status,  setStatus]  = useState<LockStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    workerApi.getLockStatus()
      .then(res => {
        if (res.success) setStatus(res.data as LockStatus);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: "40px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
        {[260, 160, 200].map((h, i) => (
          <div
            key={i}
            style={{
              height:       h,
              borderRadius: 14,
              background:   "linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)",
              backgroundSize: "200% 100%",
              animation:    "shimmer 1.4s infinite",
            }}
          />
        ))}
        <style>{`
          @keyframes shimmer {
            0%   { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>
    );
  }

  // ── Error / no data ────────────────────────────────────────────────────────
  if (!status) {
    return (
      <div style={{ padding: "40px 32px" }}>
        <p style={{ fontSize: 13, color: "#94a3b8" }}>
          Could not load lock status. Please refresh to try again.
        </p>
      </div>
    );
  }

  const { is_locked, active_lock, lock_history } = status;

  // ── Not locked ─────────────────────────────────────────────────────────────
  if (!is_locked) {
    return (
      <div
        style={{
          padding:       "40px 32px",
          maxWidth:      760,
          display:       "flex",
          flexDirection: "column",
          gap:           24,
        }}
      >
        {/* Status pill */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              gap:          6,
              background:   "#F0FDF4",
              color:        "#166534",
              fontSize:     12,
              fontWeight:   700,
              padding:      "4px 12px",
              borderRadius: 100,
            }}
          >
            <span style={{ fontSize: 9 }}>●</span>
            Not currently locked
          </span>
        </div>

        <h1
          style={{
            fontSize:   22,
            fontWeight: 800,
            color:      "#08142A",
            margin:     0,
            lineHeight: 1.2,
          }}
        >
          You are not currently under exclusive review
        </h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.6 }}>
          Your profile is visible to all employers on the platform.
        </p>

        {lock_history.length === 0 ? (
          <WhatIsWorkerLock />
        ) : (
          <div
            style={{
              background:   "#ffffff",
              borderRadius: 14,
              border:       "1px solid #e2e8f0",
              overflow:     "hidden",
            }}
          >
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #f1f5f9" }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", margin: 0 }}>
                Lock history
              </h2>
            </div>
            <HistoryTable history={lock_history} />
          </div>
        )}
      </div>
    );
  }

  // ── Locked ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        padding:       "40px 32px",
        maxWidth:      760,
        display:       "flex",
        flexDirection: "column",
        gap:           24,
      }}
    >
      <ActiveLockSection lock={active_lock!} />
      <WhatHappensNext />

      {lock_history.length > 0 && (
        <div
          style={{
            background:   "#ffffff",
            borderRadius: 14,
            border:       "1px solid #e2e8f0",
            overflow:     "hidden",
          }}
        >
          <div style={{ padding: "18px 20px", borderBottom: "1px solid #f1f5f9" }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", margin: 0 }}>
              Lock history
            </h2>
          </div>
          <HistoryTable history={lock_history} />
        </div>
      )}
    </div>
  );
}
