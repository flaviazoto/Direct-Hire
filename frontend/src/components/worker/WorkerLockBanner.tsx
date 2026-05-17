"use client";
// frontend/src/components/worker/WorkerLockBanner.tsx
// Full-width amber banner shown on all worker pages when a lock is active.
// Receives activeLock from the layout (single fetch, shared state).
// Manages its own per-second countdown from seconds_remaining.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActiveLock {
  locked_at:         string;
  expires_at:        string;
  seconds_remaining: number;
  employer_tier:     string;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#7B3C00"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

// ── Countdown helpers ─────────────────────────────────────────────────────────

function formatCountdown(totalSeconds: number): { days: number; hours: number; minutes: number } {
  const s       = Math.max(0, totalSeconds);
  const days    = Math.floor(s / 86400);
  const hours   = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return { days, hours, minutes };
}

// ── Banner ────────────────────────────────────────────────────────────────────

export default function WorkerLockBanner({ activeLock }: { activeLock: ActiveLock | null }) {
  const [secsLeft, setSecsLeft] = useState<number>(activeLock?.seconds_remaining ?? 0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset countdown when the parent re-fetches (seconds_remaining refreshes every 60 s)
  useEffect(() => {
    if (!activeLock) return;

    setSecsLeft(activeLock.seconds_remaining);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecsLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeLock?.seconds_remaining]);

  if (!activeLock) return null;

  const { days, hours, minutes } = formatCountdown(secsLeft);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "10px 24px",
        background:     "#FAEEDA",
        borderBottom:   "0.5px solid #EF9F27",
        gap:            16,
        flexWrap:       "wrap",
        minHeight:      40,
      }}
    >
      {/* Left: lock icon + headline + pill */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <LockIcon />
        <span
          style={{
            fontSize:   13,
            fontWeight: 600,
            color:      "#412402",
            lineHeight: 1,
          }}
        >
          You are under exclusive review
        </span>
        <span
          style={{
            display:      "inline-flex",
            alignItems:   "center",
            background:   "#EF9F27",
            color:        "#412402",
            fontSize:     11,
            fontWeight:   700,
            padding:      "2px 8px",
            borderRadius: 100,
            lineHeight:   1.4,
            letterSpacing: "0.02em",
          }}
        >
          Locked
        </span>
      </div>

      {/* Centre: live countdown */}
      <div
        style={{
          fontSize:   12,
          fontWeight: 500,
          color:      "#7B3C00",
          whiteSpace: "nowrap",
        }}
      >
        {days}d&nbsp;&nbsp;{hours}h&nbsp;&nbsp;{minutes}min
      </div>

      {/* Right: learn more */}
      <Link
        href="/worker/lock"
        style={{
          fontSize:            12,
          fontWeight:          600,
          color:               "#7B3C00",
          textDecoration:      "underline",
          textDecorationColor: "#EF9F27",
          textUnderlineOffset: 2,
          whiteSpace:          "nowrap",
          flexShrink:          0,
        }}
      >
        Learn more →
      </Link>
    </div>
  );
}
