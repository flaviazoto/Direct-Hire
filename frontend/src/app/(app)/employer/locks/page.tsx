"use client";
// src/app/(app)/employer/locks/page.tsx

import React, { CSSProperties, Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { employerApi } from "@/lib/api-client";
import { ToastDisplay, Spinner, type ToastData } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LockWorker {
  id:         string;
  first_name: string | null;
  last_name:  string | null;
  country:    string | null;
  city:       string | null;
}

interface Lock {
  id:               string;
  lock_status:      "ACTIVE" | "EXPIRED" | "RELEASED" | "OVERRIDDEN";
  daily_fee:        number;
  currency:         string;
  total_billed:     number;
  total_days_billed: number;
  lock_start_date:  string;
  lock_expiry_date: string;
  lock_days:        number;
  release_reason:   string | null;
  created_at:       string;
  worker:           LockWorker;
}

type TabKey = "ACTIVE" | "EXPIRED" | "RELEASED" | "ALL";

// ── Helpers ───────────────────────────────────────────────────────────────────

function workerName(w: LockWorker) {
  return [w.first_name, w.last_name].filter(Boolean).join(" ") || "Anonymous";
}

function initials(name: string) {
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateLong(d: string | Date) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function daysRemaining(expiry: string) {
  return Math.max(0, Math.ceil((new Date(expiry).getTime() - Date.now()) / (24 * 3600 * 1000)));
}

function currentTotalDays(lock: Lock) {
  return Math.round(
    (new Date(lock.lock_expiry_date).getTime() - new Date(lock.lock_start_date).getTime()) / (24 * 3600 * 1000)
  );
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG = {
  ACTIVE:     { label: "Active",          border: "#EF9F27", pillBg: "rgba(239,159,39,0.12)",  pillColor: "#EF9F27",  pillBorder: "rgba(239,159,39,0.3)"  },
  EXPIRED:    { label: "Expired",         border: "#B4B2A9", pillBg: "rgba(180,178,169,0.1)",  pillColor: "#B4B2A9",  pillBorder: "rgba(180,178,169,0.25)" },
  RELEASED:   { label: "Released",        border: "#1D9E75", pillBg: "rgba(29,158,117,0.12)",  pillColor: "#1D9E75",  pillBorder: "rgba(29,158,117,0.3)"   },
  OVERRIDDEN: { label: "Ended by admin",  border: "#E24B4A", pillBg: "rgba(226,75,74,0.12)",   pillColor: "#E24B4A",  pillBorder: "rgba(226,75,74,0.3)"    },
} as const;

const EXTEND_PRESETS = [3, 7, 14];

// ── Modal (shared, with focus trap + Escape) ──────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
    );
    focusable[0]?.focus();
    function onTab(e: KeyboardEvent) {
      if (e.key !== "Tab" || focusable.length === 0) { if (e.key === "Tab") e.preventDefault(); return; }
      if (e.shiftKey) { if (document.activeElement === focusable[0]) { e.preventDefault(); focusable[focusable.length - 1]?.focus(); } }
      else            { if (document.activeElement === focusable[focusable.length - 1]) { e.preventDefault(); focusable[0]?.focus(); } }
    }
    document.addEventListener("keydown", onTab);
    return () => document.removeEventListener("keydown", onTab);
  }, []);

  return (
    <div role="dialog" aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}
      onClick={onClose}
    >
      <div ref={panelRef} tabIndex={-1}
        style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "28px 32px", maxWidth: 480, width: "100%", boxShadow: "0 24px 64px rgba(0,0,0,0.6)", outline: "none" }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ padding: "32px 40px", maxWidth: 900, margin: "0 auto" }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      {[100, 120, 140, 120].map((h, i) => (
        <div key={i} style={{
          height: h, borderRadius: 12, marginBottom: 12,
          background: "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
        }} />
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

function LocksContent() {
  const router = useRouter();

  const [locks,       setLocks]       = useState<Lock[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [page,        setPage]        = useState(1);
  const [hasMore,     setHasMore]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab,   setActiveTab]   = useState<TabKey>("ACTIVE");
  const [toast,       setToast]       = useState<ToastData>(null);

  // Extend modal
  const [extendLock,    setExtendLock]    = useState<Lock | null>(null);
  const [extendDays,    setExtendDays]    = useState(7);
  const [extendLoading, setExtendLoading] = useState(false);
  const [extendError,   setExtendError]   = useState("");

  // Release modal
  const [releaseLock,    setReleaseLock]    = useState<Lock | null>(null);
  const [releaseReason,  setReleaseReason]  = useState("");
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseError,   setReleaseError]   = useState("");

  const anyModal = !!extendLock || !!releaseLock;

  // Body scroll lock + Escape handler
  useEffect(() => {
    if (!anyModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (extendLock  && !extendLoading)  { setExtendLock(null);  setExtendError(""); }
      if (releaseLock && !releaseLoading) { setReleaseLock(null); setReleaseError(""); setReleaseReason(""); }
    }
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [anyModal, extendLock, releaseLock, extendLoading, releaseLoading]);

  const fetchLocks = useCallback(async (p: number, append = false) => {
    const res = await employerApi.getLocks({ page: String(p), limit: "20" });
    if (!res.success) { if (p === 1) router.push("/employer/dashboard"); return; }
    const d = res as unknown as { data: Lock[]; total: number; page: number; limit: number; success: boolean };
    const rows = d.data ?? [];
    setLocks(prev => append ? [...prev, ...rows] : rows);
    setHasMore((p * 20) < (d.total ?? 0));
  }, [router]);

  useEffect(() => {
    fetchLocks(1).then(() => setLoading(false));
  }, [fetchLocks]);

  async function loadMore() {
    const next = page + 1;
    setLoadingMore(true);
    await fetchLocks(next, true);
    setPage(next);
    setLoadingMore(false);
  }

  function showToast(msg: string, type: "ok" | "err") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Extend ────────────────────────────────────────────────────────────────

  async function handleExtend() {
    if (!extendLock) return;
    const total = currentTotalDays(extendLock) + extendDays;
    if (total > 60) { setExtendError(`Cannot exceed 60 days total. Max additional: ${60 - currentTotalDays(extendLock)} days.`); return; }
    setExtendLoading(true);
    setExtendError("");
    const res = await employerApi.extendWorkerLock(extendLock.worker.id, { additional_days: extendDays });
    setExtendLoading(false);
    if (res.success) {
      const expiry = (res.data as { lockExpiryDate?: string })?.lockExpiryDate;
      setExtendLock(null);
      setExtendDays(7);
      await fetchLocks(1);
      showToast(`Reservation extended${expiry ? " to " + fmtDateLong(expiry) : ""}`, "ok");
    } else {
      setExtendError(res.error ?? "Could not extend reservation.");
    }
  }

  // ── Release ────────────────────────────────────────────────────────────────

  async function handleRelease() {
    if (!releaseLock) return;
    setReleaseLoading(true);
    setReleaseError("");
    const res = await employerApi.releaseWorkerLock(releaseLock.worker.id, releaseReason.trim() ? { reason: releaseReason.trim() } : undefined);
    setReleaseLoading(false);
    if (res.success) {
      setReleaseLock(null);
      setReleaseReason("");
      await fetchLocks(1);
      showToast(`${releaseLock.worker.first_name ?? "Worker"} has been released`, "ok");
    } else {
      setReleaseError(res.error ?? "Could not release reservation.");
    }
  }

  if (loading) return <Skeleton />;

  // ── Derived counts ────────────────────────────────────────────────────────

  const counts = {
    ACTIVE:   locks.filter(l => l.lock_status === "ACTIVE").length,
    EXPIRED:  locks.filter(l => l.lock_status === "EXPIRED").length,
    RELEASED: locks.filter(l => l.lock_status === "RELEASED").length,
    ALL:      locks.length,
  };

  const visible = activeTab === "ALL"
    ? locks
    : locks.filter(l => l.lock_status === activeTab);

  const TABS: { key: TabKey; label: string }[] = [
    { key: "ACTIVE",   label: `Active (${counts.ACTIVE})`   },
    { key: "EXPIRED",  label: `Expired (${counts.EXPIRED})` },
    { key: "RELEASED", label: `Released (${counts.RELEASED})` },
    { key: "ALL",      label: `All (${counts.ALL})`         },
  ];

  // Extend modal computed
  const extendCurrentTotal = extendLock ? currentTotalDays(extendLock) : 0;
  const extendCapExceeded  = extendCurrentTotal + extendDays > 60;
  const extendMaxAllowed   = Math.max(0, 60 - extendCurrentTotal);
  const extendNewExpiry    = extendLock
    ? new Date(new Date(extendLock.lock_expiry_date).getTime() + extendDays * 24 * 3600 * 1000)
    : null;
  const extendAddedCost    = extendLock
    ? (extendDays * Number(extendLock.daily_fee)).toFixed(2)
    : "0.00";

  return (
    <div style={{ padding: "32px 40px", maxWidth: 900, margin: "0 auto", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <ToastDisplay toast={toast} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#ffffff", margin: 0, letterSpacing: "-0.02em" }}>
            Worker reservations
          </h1>
          <p style={{ fontSize: 13, color: "#71717a", margin: "4px 0 0" }}>
            Manage your exclusive worker holds
          </p>
        </div>
        {counts.ACTIVE > 0 && (
          <div style={{
            padding:      "3px 10px",
            borderRadius: 20,
            fontSize:     12,
            fontWeight:   700,
            background:   "rgba(239,159,39,0.15)",
            color:        "#EF9F27",
            border:       "1px solid rgba(239,159,39,0.3)",
            marginLeft:   4,
          }}>
            {counts.ACTIVE} active
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 24 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding:      "9px 16px",
              background:   "none",
              border:       "none",
              borderBottom: activeTab === t.key ? "2px solid #14b8a6" : "2px solid transparent",
              color:        activeTab === t.key ? "#14b8a6" : "#71717a",
              fontWeight:   activeTab === t.key ? 700 : 400,
              fontSize:     13,
              cursor:       "pointer",
              marginBottom: -1,
              transition:   "color 0.15s",
              fontFamily:   "inherit",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Lock list */}
      {visible.length === 0 ? (
        <EmptyState tab={activeTab} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visible.map(lock => (
            <LockCard
              key={lock.id}
              lock={lock}
              onExtend={() => { setExtendLock(lock); setExtendDays(7); setExtendError(""); }}
              onRelease={() => { setReleaseLock(lock); setReleaseReason(""); setReleaseError(""); }}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
          <button
            onClick={loadMore}
            disabled={loadingMore}
            style={{
              padding:      "10px 28px",
              background:   "rgba(255,255,255,0.04)",
              border:       "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              color:        "#a1a1aa",
              fontSize:     13,
              fontWeight:   500,
              cursor:       loadingMore ? "not-allowed" : "pointer",
              display:      "flex",
              alignItems:   "center",
              gap:          8,
              fontFamily:   "inherit",
            }}
          >
            {loadingMore && <Spinner size="xs" color="white" />}
            Load more
          </button>
        </div>
      )}

      {/* ── Extend modal ── */}
      {extendLock && (
        <Modal onClose={() => !extendLoading && (setExtendLock(null), setExtendError(""))}>
          <h2 style={mTitle}>Extend reservation — {extendLock.worker.first_name ?? workerName(extendLock.worker)}</h2>

          {/* Current status */}
          <div style={mInfoBox}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 0" }}>
              {[
                { label: "Current expiry",   value: fmtDateLong(extendLock.lock_expiry_date) },
                { label: "Lock started",     value: fmtDateLong(extendLock.lock_start_date)  },
                { label: "Days used so far", value: String(extendLock.total_days_billed)      },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={mInfoLabel}>{label}</div>
                  <div style={mInfoValue}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Presets */}
          <label style={mLabel}>Additional days</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {EXTEND_PRESETS.map(d => (
              <button key={d} onClick={() => setExtendDays(d)} style={{
                flex:         1,
                padding:      "8px 0",
                border:       extendDays === d ? "2px solid #14b8a6" : "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                background:   extendDays === d ? "rgba(0,144,255,0.1)" : "rgba(255,255,255,0.03)",
                color:        extendDays === d ? "#14b8a6" : "#a1a1aa",
                fontWeight:   extendDays === d ? 700 : 400,
                fontSize:     13, cursor: "pointer", transition: "all 0.1s", fontFamily: "inherit",
              }}>{d}d</button>
            ))}
          </div>
          <input
            type="number" min={1} max={30} value={extendDays}
            onChange={e => setExtendDays(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))}
            style={mInput}
          />

          {/* Cap/preview */}
          {extendCapExceeded ? (
            <div style={{ color: "#f87171", fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
              Cannot exceed 60 days total.<br />
              You can add up to {extendMaxAllowed} more day{extendMaxAllowed !== 1 ? "s" : ""}.
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <div style={{ color: "#4ade80", fontSize: 13, fontWeight: 600 }}>
                New expiry: {extendNewExpiry ? fmtDateLong(extendNewExpiry) : "—"}
              </div>
              <div style={{ color: "#71717a", fontSize: 12, marginTop: 3 }}>
                {extendDays} × {extendLock.currency} {Number(extendLock.daily_fee).toFixed(2)} = {extendLock.currency} {extendAddedCost} additional
              </div>
            </div>
          )}

          {extendError && <div style={{ color: "#f87171", fontSize: 13, marginTop: 10 }}>{extendError}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button onClick={() => { setExtendLock(null); setExtendError(""); }} disabled={extendLoading} style={{ ...mBtnSecondary, flex: 1 }}>
              Cancel
            </button>
            <button
              onClick={handleExtend}
              disabled={extendLoading || extendCapExceeded}
              style={{ ...mBtnPrimary, flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: extendCapExceeded ? 0.5 : 1, cursor: extendCapExceeded ? "not-allowed" : "pointer" }}
            >
              {extendLoading && <Spinner size="xs" color="white" />}
              Confirm extension
            </button>
          </div>
        </Modal>
      )}

      {/* ── Release modal ── */}
      {releaseLock && (
        <Modal onClose={() => !releaseLoading && (setReleaseLock(null), setReleaseError(""), setReleaseReason(""))}>
          <h2 style={mTitle}>Release reservation?</h2>

          <div style={{ fontSize: 13, color: "#92400e", background: "rgba(239,159,39,0.1)", border: "1px solid rgba(239,159,39,0.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
            {releaseLock.worker.first_name ?? workerName(releaseLock.worker)} will become available to other employers immediately.
          </div>

          <div style={mInfoBox}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 0" }}>
              {[
                { label: "Active since",  value: fmtDateLong(releaseLock.lock_start_date)          },
                { label: "Days billed",   value: String(releaseLock.total_days_billed)               },
                { label: "Total charged", value: `${releaseLock.currency} ${Number(releaseLock.total_billed).toFixed(2)}` },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={mInfoLabel}>{label}</div>
                  <div style={mInfoValue}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          <label style={mLabel}>
            Reason <span style={{ fontWeight: 400, color: "#555" }}>(optional, internal only)</span>
          </label>
          <textarea
            value={releaseReason}
            onChange={e => setReleaseReason(e.target.value.slice(0, 300))}
            placeholder="e.g. Position filled, hired via another channel..."
            rows={3}
            style={{ ...mInput, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "#555" }}>This reason is not shared with the worker.</span>
            <span style={{ fontSize: 11, color: releaseReason.length >= 280 ? "#f59e0b" : "#555" }}>
              {releaseReason.length}/300
            </span>
          </div>

          <div style={{ fontSize: 12, color: "#f87171", marginTop: 10, fontWeight: 500 }}>This cannot be undone.</div>

          {releaseError && <div style={{ color: "#f87171", fontSize: 13, marginTop: 8 }}>{releaseError}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button onClick={() => { setReleaseLock(null); setReleaseError(""); setReleaseReason(""); }} disabled={releaseLoading} style={{ ...mBtnSecondary, flex: 1 }}>
              Keep reservation
            </button>
            <button
              onClick={handleRelease}
              disabled={releaseLoading}
              style={{ flex: 2, padding: "11px 0", background: "#dc2626", color: "white", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: releaseLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}
            >
              {releaseLoading && <Spinner size="xs" color="white" />}
              Release
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Lock card ─────────────────────────────────────────────────────────────────

function LockCard({
  lock,
  onExtend,
  onRelease,
}: {
  lock:      Lock;
  onExtend:  () => void;
  onRelease: () => void;
}) {
  const cfg      = STATUS_CFG[lock.lock_status] ?? STATUS_CFG.EXPIRED;
  const name     = workerName(lock.worker);
  const isActive = lock.lock_status === "ACTIVE";
  const dLeft    = isActive ? daysRemaining(lock.lock_expiry_date) : 0;
  const usedPct  = Math.min(100, Math.round((lock.total_days_billed / Math.max(lock.lock_days, 1)) * 100));

  const expiryDate    = new Date(lock.lock_expiry_date);
  const now           = Date.now();
  const hoursToExpiry = (expiryDate.getTime() - now) / 3600000;
  const expiryColor   = !isActive ? undefined : hoursToExpiry < 0 ? "#f87171" : hoursToExpiry < 48 ? "#f59e0b" : undefined;

  const endDate = lock.lock_status === "RELEASED" || lock.lock_status === "EXPIRED" || lock.lock_status === "OVERRIDDEN"
    ? lock.lock_expiry_date
    : null;

  return (
    <div style={{
      background:   "#161616",
      border:       "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12,
      overflow:     "hidden",
      borderLeft:   `3px solid ${cfg.border}`,
    }}>
      <div style={{ padding: "16px 20px" }}>

        {/* Top row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Avatar */}
            <div style={{
              width:          40,
              height:         40,
              borderRadius:   "50%",
              background:     "#1e3a5f",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              fontSize:       14,
              fontWeight:     700,
              color:          "#60a5fa",
              flexShrink:     0,
              textTransform:  "uppercase" as const,
            }}>
              {initials(name)}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#ffffff" }}>{name}</div>
              {(lock.worker.city || lock.worker.country) && (
                <div style={{ fontSize: 12, color: "#71717a", marginTop: 1 }}>
                  {[lock.worker.city, lock.worker.country].filter(Boolean).join(", ")}
                </div>
              )}
            </div>
          </div>

          {/* Status pill */}
          <div style={{
            padding:      "3px 10px",
            borderRadius: 20,
            fontSize:     11,
            fontWeight:   700,
            background:   cfg.pillBg,
            color:        cfg.pillColor,
            border:       `1px solid ${cfg.pillBorder}`,
            flexShrink:   0,
          }}>
            {cfg.label}
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px 12px", marginTop: 14 }}>
          {[
            { label: "Started",  value: fmtDate(lock.lock_start_date), color: undefined },
            { label: "Expires",  value: fmtDate(lock.lock_expiry_date), color: expiryColor },
            { label: "Days",     value: `${lock.lock_days} total`, color: undefined },
            { label: "Billed",   value: `${lock.currency} ${Number(lock.total_billed).toFixed(2)}`, color: undefined },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: color ?? "#a1a1aa" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Progress bar — ACTIVE only */}
        {isActive && (
          <div style={{ marginTop: 12 }}>
            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 999, height: 6, overflow: "hidden" }}>
              <div style={{ width: `${usedPct}%`, height: "100%", background: "#EF9F27", borderRadius: 999, transition: "width 0.4s" }} />
            </div>
            <div style={{ fontSize: 11, color: "#71717a", marginTop: 4 }}>
              {lock.total_days_billed} of {lock.lock_days} days used
            </div>
          </div>
        )}

        {/* Countdown — ACTIVE only */}
        {isActive && (
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: dLeft > 3 ? "#14b8a6" : dLeft >= 1 ? "#f59e0b" : "#f87171" }}>
            {dLeft > 3  ? `${dLeft} days remaining`
             : dLeft >= 1 ? `${dLeft} day${dLeft !== 1 ? "s" : ""} remaining — expiring soon`
             : "Expiring today"}
          </div>
        )}

        {/* Action row — ACTIVE only */}
        {isActive && (
          <div style={{ display: "flex", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <Link
              href={`/employer/workers/${lock.worker.id}`}
              style={{ flex: 1, padding: "7px 0", textAlign: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12, fontWeight: 500, color: "#a1a1aa", textDecoration: "none", transition: "border-color 0.15s" }}
              onMouseOver={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)")}
              onMouseOut={e  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
            >
              View worker →
            </Link>
            <button onClick={onExtend} style={{
              flex: 1, padding: "7px 0", background: "rgba(239,159,39,0.08)", border: "1px solid rgba(239,159,39,0.2)", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#EF9F27", cursor: "pointer", fontFamily: "inherit",
            }}>
              Extend
            </button>
            <button onClick={onRelease} style={{
              flex: 1, padding: "7px 0", background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#f87171", cursor: "pointer", fontFamily: "inherit",
            }}>
              Release
            </button>
          </div>
        )}

        {/* Footer — EXPIRED / RELEASED / OVERRIDDEN */}
        {!isActive && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: 12, color: "#555" }}>
              {endDate ? `Ended ${fmtDate(endDate)}` : ""}
            </span>
            <Link href={`/employer/workers/${lock.worker.id}`} style={{ fontSize: 12, color: "#14b8a6", textDecoration: "none", fontWeight: 500 }}>
              View worker →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Empty states ──────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: TabKey }) {
  const configs: Record<TabKey, { icon: string; title: string; sub: string; cta?: { label: string; href: string } }> = {
    ACTIVE:   { icon: "🔒", title: "No active reservations",      sub: "Browse workers to reserve talent",   cta: { label: "Browse workers", href: "/employer/workers" } },
    EXPIRED:  { icon: "⏰", title: "No expired reservations yet", sub: "" },
    RELEASED: { icon: "🔓", title: "No released reservations",    sub: "" },
    ALL:      { icon: "🔒", title: "No reservations yet",         sub: "Find workers to get started",        cta: { label: "Find workers",   href: "/employer/workers" } },
  };
  const c = configs[tab];
  return (
    <div style={{ textAlign: "center", padding: "64px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>{c.icon}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#ffffff", marginBottom: 8 }}>{c.title}</div>
      {c.sub && <div style={{ fontSize: 13, color: "#71717a", marginBottom: 20 }}>{c.sub}</div>}
      {c.cta && (
        <Link href={c.cta.href} style={{
          display:      "inline-flex",
          alignItems:   "center",
          padding:      "10px 20px",
          background:   "#0d9488",
          color:        "white",
          borderRadius: 10,
          fontSize:     13,
          fontWeight:   600,
          textDecoration: "none",
        }}>
          {c.cta.label} →
        </Link>
      )}
    </div>
  );
}

// ── Shared modal styles ───────────────────────────────────────────────────────

const mTitle: CSSProperties = { fontSize: 18, fontWeight: 700, color: "#ffffff", margin: "0 0 16px" };

const mInfoBox: CSSProperties = {
  background:   "rgba(255,255,255,0.03)",
  border:       "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  padding:      "12px 14px",
  marginBottom: 20,
};

const mInfoLabel: CSSProperties = { fontSize: 11, color: "#555", marginBottom: 2 };
const mInfoValue: CSSProperties = { fontSize: 13, fontWeight: 600, color: "#a1a1aa" };

const mLabel: CSSProperties = {
  display:      "block",
  fontSize:     13,
  fontWeight:   600,
  color:        "#a1a1aa",
  marginBottom: 6,
};

const mInput: CSSProperties = {
  width:        "100%",
  padding:      "10px 12px",
  border:       "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  fontSize:     14,
  color:        "#ffffff",
  background:   "rgba(255,255,255,0.04)",
  boxSizing:    "border-box",
  outline:      "none",
};

const mBtnPrimary: CSSProperties = {
  padding:      "11px 0",
  background:   "#0d9488",
  color:        "white",
  border:       "none",
  borderRadius: 10,
  fontSize:     14,
  fontWeight:   600,
  cursor:       "pointer",
  fontFamily:   "inherit",
};

const mBtnSecondary: CSSProperties = {
  padding:      "11px 0",
  background:   "rgba(255,255,255,0.04)",
  color:        "#a1a1aa",
  border:       "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  fontSize:     14,
  fontWeight:   500,
  cursor:       "pointer",
  fontFamily:   "inherit",
};

// ── Export ────────────────────────────────────────────────────────────────────

export default function LocksPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <LocksContent />
    </Suspense>
  );
}
