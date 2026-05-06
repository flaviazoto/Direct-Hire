"use client";
// src/components/worker/LockStatusBanner.tsx
// Fetches its own lock status; re-fetches every 5 minutes.
// Returns null when not locked — safe to drop anywhere.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { workerApi } from "@/lib/api-client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LockStatusData {
  is_locked: boolean;
  lock?: {
    id:               string;
    lock_status:      string;
    lock_start_date:  string;
    lock_expiry_date: string;
    lock_days:        number;
    days_remaining:   number;
    employer:         { company_name: string };
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtLong(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "long",
    month:   "long",
    day:     "numeric",
    year:    "numeric",
  });
}

function fmtShort(d: string | Date) {
  return new Date(d).toLocaleDateString("en-GB", {
    day:   "numeric",
    month: "short",
    year:  "numeric",
  });
}

function daysRemaining(expiry: string) {
  return Math.max(0, Math.ceil((new Date(expiry).getTime() - Date.now()) / (24 * 3600 * 1000)));
}

// ── Explainer modal ───────────────────────────────────────────────────────────

function LockExplainerModal({ onClose }: { onClose: () => void }) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sections = [
    {
      heading: "What is a reservation?",
      body: "When an employer reserves your profile, they get exclusive access to proceed with hiring you for a set period. Other employers cannot formally hire you through DirectHire while the reservation is active.",
    },
    {
      heading: "Can I still apply for jobs?",
      body: "Yes — you can browse and apply to as many jobs as you like. However, other employers cannot accept your application while you are reserved.",
    },
    {
      heading: "When does it end?",
      body: "Reservations end automatically on the expiry date shown in your banner. The employer can also choose to release you earlier.",
    },
    {
      heading: "Do I pay anything?",
      body: "No. The reservation fee is paid by the employer. You owe nothing.",
    },
    {
      heading: "What if I have concerns?",
      body: (
        <>
          Contact our support team at{" "}
          <a href="mailto:support@directhire.io" style={{ color: "#d97706", textDecoration: "underline" }}>
            support@directhire.io
          </a>
        </>
      ),
    },
  ];

  return (
    <div
      style={{
        position:       "fixed",
        inset:          0,
        background:     "rgba(0,0,0,0.5)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        zIndex:         1000,
        padding:        16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background:   "white",
          borderRadius: 16,
          padding:      "32px 36px",
          maxWidth:     480,
          width:        "100%",
          boxShadow:    "0 24px 64px rgba(0,0,0,0.2)",
          maxHeight:    "90vh",
          overflowY:    "auto",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{
            width:          36,
            height:         36,
            borderRadius:   "50%",
            background:     "#FEF3C7",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            flexShrink:     0,
          }}>
            <LockIcon size={18} color="#D97706" />
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#08142A", margin: 0 }}>
            About profile reservations
          </h2>
        </div>

        {/* Sections */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {sections.map(s => (
            <div key={s.heading}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1c1917", marginBottom: 4 }}>
                {s.heading}
              </div>
              <div style={{ fontSize: 13, color: "#57534e", lineHeight: 1.65 }}>
                {s.body}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 24 }}>
          <button
            onClick={onClose}
            style={{
              padding:      "10px 24px",
              background:   "#1c1917",
              color:        "white",
              border:       "none",
              borderRadius: 8,
              fontSize:     14,
              fontWeight:   600,
              cursor:       "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lock icon ─────────────────────────────────────────────────────────────────

function LockIcon({ size = 20, color = "#92400E" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
      <circle cx="12" cy="16" r="1.5" fill={color} stroke="none" />
    </svg>
  );
}

// ── Banner ────────────────────────────────────────────────────────────────────

export default function LockStatusBanner() {
  const [status,      setStatus]      = useState<LockStatusData | null>(null);
  const [showModal,   setShowModal]   = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchStatus() {
    try {
      const res = await workerApi.getLockStatus();
      if (res.success) setStatus(res.data as LockStatusData);
    } catch {
      // silently ignore — banner simply won't show
    }
  }

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 5 * 60 * 1000); // 5 min
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  if (!status?.is_locked || !status.lock) return null;

  const daysLeft   = daysRemaining(status.lock.lock_expiry_date);
  const expiryStr  = fmtLong(status.lock.lock_expiry_date);
  const sinceStr   = status.lock.lock_start_date ? fmtShort(status.lock.lock_start_date) : null;
  const companyName = status.lock.employer?.company_name ?? "An employer";

  return (
    <>
      <div style={{
        display:      "flex",
        alignItems:   "flex-start",
        gap:          12,
        padding:      16,
        background:   "#FFFBEB",
        border:       "1px solid #FDE68A",
        borderLeft:   "4px solid #FBBF24",
        borderRadius: 10,
        marginBottom: 20,
      }}>
        {/* Lock icon */}
        <div style={{ flexShrink: 0, marginTop: 1 }}>
          <LockIcon size={20} color="#92400E" />
        </div>

        {/* Text */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#78350F" }}>
            Your profile is currently reserved
          </div>
          <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.6 }}>
            <strong>{companyName}</strong> has reserved your profile until{" "}
            <strong>{expiryStr}</strong>.{" "}
            Other employers cannot proceed with hiring you during this time.
          </div>
          {/* Countdown row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginTop: 2 }}>
            <span style={{ fontWeight: 700, color: "#D97706" }}>
              {daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining
            </span>
            {sinceStr && (
              <>
                <span style={{ color: "#D97706", opacity: 0.4 }}>•</span>
                <span style={{ color: "#92400E", opacity: 0.7 }}>
                  Reserved since {sinceStr}
                </span>
              </>
            )}
          </div>
          <Link
            href={`/worker/reservation/${status.lock.id}`}
            style={{
              fontSize: 12,
              color: "#B45309",
              fontWeight: 600,
              textDecoration: "underline",
              marginTop: 4,
              display: "inline-block",
            }}
          >
            View reservation details →
          </Link>
        </div>

        {/* CTA */}
        <button
          onClick={() => setShowModal(true)}
          style={{
            background:     "none",
            border:         "none",
            color:          "#B45309",
            fontSize:       12,
            fontWeight:     600,
            cursor:         "pointer",
            textDecoration: "underline",
            whiteSpace:     "nowrap",
            flexShrink:     0,
            padding:        0,
          }}
        >
          What does this mean?
        </button>
      </div>

      {showModal && <LockExplainerModal onClose={() => setShowModal(false)} />}
    </>
  );
}
