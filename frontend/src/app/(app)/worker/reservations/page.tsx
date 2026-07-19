"use client";
// src/app/(app)/worker/reservations/page.tsx
// Worker-facing lock history — shows all reservations placed on this worker.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { workerApi } from "@/lib/api-client";
import { LoadingPage, ErrorState } from "@/components/ui";
import LockStatusBanner from "@/components/worker/LockStatusBanner";

// ── Types ──────────────────────────────────────────────────────────────────────

interface LockRecord {
  id:               string;
  lock_status:      "ACTIVE" | "EXPIRED" | "RELEASED" | "OVERRIDDEN";
  lock_start_date:  string;
  lock_expiry_date: string;
  lock_days:        number;
  employer:         { company_name: string };
}

interface LockHistoryResponse {
  data:  LockRecord[];
  total: number;
  page:  number;
  limit: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day:   "numeric",
    month: "short",
    year:  "numeric",
  });
}

function daysRemaining(expiry: string) {
  return Math.max(0, Math.ceil((new Date(expiry).getTime() - Date.now()) / (24 * 3600 * 1000)));
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  ACTIVE:     { label: "Active",    color: "#fbbf24", bg: "rgba(251,191,36,0.1)",   border: "rgba(251,191,36,0.3)"  },
  EXPIRED:    { label: "Expired",   color: "#71717a", bg: "rgba(113,113,122,0.08)", border: "rgba(113,113,122,0.2)" },
  RELEASED:   { label: "Released",  color: "#22c55e", bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.2)"   },
  OVERRIDDEN: { label: "Overridden",color: "#71717a", bg: "rgba(113,113,122,0.08)", border: "rgba(113,113,122,0.2)" },
};

// ── Lock card ─────────────────────────────────────────────────────────────────

function LockCard({ lock }: { lock: LockRecord }) {
  const cfg      = STATUS_CFG[lock.lock_status] ?? STATUS_CFG.EXPIRED;
  const daysLeft = lock.lock_status === "ACTIVE" ? daysRemaining(lock.lock_expiry_date) : null;

  return (
    <div style={{
      background:   "rgba(255,255,255,0.03)",
      border:       "1px solid rgba(255,255,255,0.08)",
      borderLeft:   `3px solid ${cfg.color}`,
      borderRadius: 12,
      padding:      "20px 24px",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Initials avatar */}
          <div style={{
            width:          38,
            height:         38,
            borderRadius:   "50%",
            background:     "rgba(255,255,255,0.06)",
            border:         "1px solid rgba(255,255,255,0.1)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            fontSize:       14,
            fontWeight:     700,
            color:          "#a1a1aa",
            flexShrink:     0,
          }}>
            {lock.employer?.company_name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#e4e4e7" }}>{lock.employer?.company_name || "Employer"}</div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 1 }}>
              Reserved on {fmtDate(lock.lock_start_date)}
            </div>
          </div>
        </div>

        {/* Status pill */}
        <span style={{
          display:      "inline-flex",
          alignItems:   "center",
          gap:          5,
          padding:      "4px 10px",
          borderRadius: 20,
          fontSize:     11,
          fontWeight:   700,
          color:        cfg.color,
          background:   cfg.bg,
          border:       `1px solid ${cfg.border}`,
          flexShrink:   0,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, display: "inline-block" }} />
          {cfg.label}
        </span>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "Reserved from", value: fmtDate(lock.lock_start_date) },
          { label: "Reserved until", value: fmtDate(lock.lock_expiry_date) },
          { label: "Duration", value: `${lock.lock_days} day${lock.lock_days !== 1 ? "s" : ""}` },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background:   "rgba(255,255,255,0.03)",
            border:       "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
            padding:      "10px 14px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#e4e4e7" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Footer row */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {lock.lock_status === "ACTIVE" && daysLeft !== null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24" }}>
              {daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining
            </span>
            <span style={{ color: "#333", fontSize: 12 }}>—</span>
            <span style={{ fontSize: 12, color: "#71717a" }}>
              Expires {fmtDate(lock.lock_expiry_date)}
            </span>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#555" }}>
            {lock.lock_status === "RELEASED"
              ? `Released on ${fmtDate(lock.lock_expiry_date)}`
              : `Ended ${fmtDate(lock.lock_expiry_date)}`}
          </div>
        )}
        <Link
          href={`/worker/reservation/${lock.id}`}
          style={{
            fontSize:    12,
            color:       "#0090FF",
            textDecoration: "none",
            fontWeight:  600,
            marginLeft:  "auto",
            display:     "inline-flex",
            alignItems:  "center",
            gap:         4,
          }}
        >
          View details →
        </Link>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{
      textAlign:  "center",
      padding:    "64px 24px",
      color:      "#555",
    }}>
      <div style={{
        width:          64,
        height:         64,
        borderRadius:   "50%",
        background:     "rgba(255,255,255,0.04)",
        border:         "1px solid rgba(255,255,255,0.08)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        margin:         "0 auto 16px",
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 018 0v4" />
          <circle cx="12" cy="16" r="1.5" fill="#555" stroke="none" />
        </svg>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#71717a", marginBottom: 6 }}>
        No reservations yet
      </div>
      <div style={{ fontSize: 13, color: "#555", maxWidth: 320, margin: "0 auto", lineHeight: 1.6 }}>
        When an employer reserves your profile, it will appear here.
      </div>
    </div>
  );
}

// ── Page content ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

function ReservationsContent() {
  const [locks,   setLocks]   = useState<LockRecord[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchPage(pageNum: number, append = false) {
    if (pageNum === 1) { setLoading(true); setError(null); } else setLoadingMore(true);
    try {
      const res = await workerApi.getLockHistory({ page: String(pageNum), limit: String(PAGE_SIZE) });
      if (res.success && res.data) {
        const d = res.data as LockHistoryResponse;
        setLocks(prev => append ? [...prev, ...d.data] : d.data);
        setTotal(d.total);
        setHasMore(pageNum * PAGE_SIZE < d.total);
      } else if (pageNum === 1) {
        setError(res.error ?? "Could not load reservations.");
      } else {
        console.error("Lock history API failed:", res.error, res);
      }
    } catch (err) {
      if (pageNum === 1) setError("Network error - check your connection.");
      console.error("Lock history fetch error:", err);
    } finally {
      if (pageNum === 1) setLoading(false); else setLoadingMore(false);
    }
  }

  useEffect(() => { fetchPage(1); }, []);

  function loadMore() {
    const next = page + 1;
    setPage(next);
    fetchPage(next, true);
  }

  if (loading) return <LoadingPage color="blue" />;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 860, margin: "0 auto" }}>
      {/* Lock status banner (shows only when actively reserved) */}
      <LockStatusBanner />

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>My reservations</div>
        <div style={{ fontSize: 13, color: "#71717a", marginTop: 4 }}>
          {total > 0
            ? `${total} reservation${total !== 1 ? "s" : ""} on record`
            : "No reservations on record"}
        </div>
      </div>

      {/* What is a reservation? info box */}
      <div style={{
        background:   "rgba(255,255,255,0.02)",
        border:       "1px solid rgba(255,255,255,0.07)",
        borderRadius: 10,
        padding:      "14px 18px",
        marginBottom: 24,
        fontSize:     13,
        color:        "#71717a",
        lineHeight:   1.6,
      }}>
        <strong style={{ color: "#a1a1aa" }}>What is a reservation?</strong>{" "}
        When an employer reserves your profile, they get exclusive access to proceed with hiring you for a set period.
        Other employers cannot formally hire you through DirectHire while the reservation is active.
        You can still browse and apply to jobs freely.
      </div>

      {/* Lock list */}
      {error ? (
        <ErrorState message={error} retry={() => fetchPage(1)} title="Could not load reservations" />
      ) : locks.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {locks.map(lock => <LockCard key={lock.id} lock={lock} />)}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <button
            onClick={loadMore}
            disabled={loadingMore}
            style={{
              padding:      "10px 28px",
              background:   "rgba(255,255,255,0.05)",
              border:       "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color:        "#a1a1aa",
              fontSize:     13,
              fontWeight:   600,
              cursor:       loadingMore ? "not-allowed" : "pointer",
              opacity:      loadingMore ? 0.5 : 1,
            }}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ReservationsPage() {
  return (
    <Suspense fallback={<LoadingPage color="blue" />}>
      <ReservationsContent />
    </Suspense>
  );
}
