"use client";
// src/app/(app)/employer/workers/[workerId]/page.tsx

import React, { CSSProperties, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { employerApi } from "@/lib/api-client";
import { ToastDisplay, Spinner, type ToastData, ErrorState } from "@/components/ui";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkerDetail {
  id:                  string;
  email:               string;
  phone:               string | null;
  created_at:          string;
  lock_count:          number;
  account_status:      string;
  verification_status: string | null;
  first_name:          string | null;
  last_name:           string | null;
  nationality:         string | null;
  profession:          string | null;
  country:             string | null;
  city:                string | null;
  years_experience:    string | null;
  expected_salary:     string | null;
  bio:                 string | null;
  availability_date:   string | null;
  marital_status:      string | null;
  number_of_children:  number;
  profile_score:       number | null;
  trust_score:         number | null;
  skills:              { skill: string }[];
  languages:           { language: string; proficiencyLevel: string }[];
  target_countries:    { country: string }[];
  documents:                { id: string; file_type: string; file_name: string; file_url: string; uploaded_at: string; review_status: string; is_private: boolean }[];
  document_status:          string;
  documents_verified_badge: boolean;
}

interface LockData {
  id:               string;
  lock_status:      string;
  daily_fee:        number;
  currency:         string;
  total_billed:     number;
  total_days_billed: number;
  lock_start_date:  string;
  lock_expiry_date: string;
  lock_days:        number;
}

interface LockStatus {
  is_locked:    boolean;
  lock_by_me:   boolean;
  lock?:        LockData;
}

interface WorkerApplication {
  id:        string;
  status:    string;
  applied_at: string;
  job_id:    string;
  job_title: string;
}

interface LockRate {
  dailyRateCents: number;
  currency:       string;
  maxDays:        number;
  maxConcurrent:  number;
  rateDisplay:    string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function workerName(w: WorkerDetail | null) {
  if (!w) return "Worker";
  return [w.first_name, w.last_name].filter(Boolean).join(" ") || "Anonymous";
}

function initials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function fmtMonthYear(d: string | Date) {
  return new Date(d).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function daysRemaining(expiry: string) {
  return Math.max(0, Math.ceil((new Date(expiry).getTime() - Date.now()) / (24 * 3600 * 1000)));
}

const APP_STATUS_CFG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  APPLIED:     { label: "Applied",      bg: "rgba(161,161,170,0.1)",  color: "#a1a1aa", border: "rgba(161,161,170,0.25)" },
  VIEWED:      { label: "Viewed",       bg: "rgba(96,165,250,0.1)",   color: "#60a5fa", border: "rgba(96,165,250,0.25)"  },
  SHORTLISTED: { label: "Shortlisted",  bg: "rgba(251,191,36,0.1)",   color: "#fbbf24", border: "rgba(251,191,36,0.25)"  },
  INTERVIEWED: { label: "Interview",    bg: "rgba(0,144,255,0.1)",   color: "#60A5FA", border: "rgba(0,144,255,0.25)"  },
  ACCEPTED:    { label: "Accepted",     bg: "rgba(74,222,128,0.1)",   color: "#4ade80", border: "rgba(74,222,128,0.25)"  },
  REJECTED:    { label: "Not selected", bg: "rgba(248,113,113,0.1)",  color: "#f87171", border: "rgba(248,113,113,0.25)" },
  WITHDRAWN:   { label: "Withdrawn",    bg: "rgba(161,161,170,0.1)",  color: "#a1a1aa", border: "rgba(161,161,170,0.2)"  },
};

const LOCK_PRESETS = [3, 7, 14];

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ padding: "32px 40px", maxWidth: 900, margin: "0 auto" }}>
      {[180, 100, 100].map((h, i) => (
        <div key={i} style={{
          height:       h,
          borderRadius: 12,
          background:   "linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)",
          backgroundSize: "200% 100%",
          animation:    "shimmer 1.5s infinite",
          marginBottom: 16,
        }} />
      ))}
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function WorkerProfileContent() {
  const { workerId } = useParams<{ workerId: string }>();

  const [worker,     setWorker]     = useState<WorkerDetail | null>(null);
  const [lockStatus, setLockStatus] = useState<LockStatus | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<"overview" | "skills" | "experience" | "documents" | "applications">("overview");
  const [apps,       setApps]       = useState<WorkerApplication[] | null>(null);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [toast,      setToast]      = useState<ToastData>(null);

  // Platform lock rate (fetched on load for badge + modal preview)
  const [lockRate, setLockRate] = useState<LockRate | null>(null);

  // Lock modal state
  const [showModal,    setShowModal]    = useState(false);
  const [modalDays,    setModalDays]    = useState(7);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError,   setModalError]   = useState("");
  const [modalPhase,   setModalPhase]   = useState<"configure" | "payment">("configure");
  const [stripeClientSecret,     setStripeClientSecret]     = useState("");
  const [stripePaymentIntentId,  setStripePaymentIntentId]  = useState("");
  const [stripeTotalCents,       setStripeTotalCents]       = useState(0);
  const [stripeDailyRateCents,   setStripeDailyRateCents]   = useState(0);

  // Extend modal state
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendDays,      setExtendDays]      = useState(7);
  const [extendLoading,   setExtendLoading]   = useState(false);
  const [extendError,     setExtendError]     = useState("");
  const [extendPhase,     setExtendPhase]     = useState<"configure" | "payment">("configure");
  const [extendClientSecret,    setExtendClientSecret]    = useState("");
  const [extendPaymentIntentId, setExtendPaymentIntentId] = useState("");
  const [extendAdditionalCents, setExtendAdditionalCents] = useState(0);

  // Release modal state
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [releaseReason,    setReleaseReason]    = useState("");
  const [releaseLoading,   setReleaseLoading]   = useState(false);
  const [releaseError,     setReleaseError]     = useState("");

  // Message modal state
  const [showMsgModal, setShowMsgModal] = useState(false);
  const [msgText,      setMsgText]      = useState("");
  const [msgSending,   setMsgSending]   = useState(false);
  const [msgError,     setMsgError]     = useState("");
  const [msgSent,      setMsgSent]      = useState(false);

  // Fetch worker, lock status, and platform lock rate in parallel
  const loadWorker = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      employerApi.getWorkerDetail(workerId),
      employerApi.getWorkerLockStatus(workerId),
      employerApi.getLockRate(),
    ]).then(([wRes, lRes, rRes]) => {
      if (!wRes.success) { setLoadError(wRes.error ?? "Could not load this worker."); setLoading(false); return; }
      setWorker(wRes.data as WorkerDetail);
      if (lRes.success) setLockStatus(lRes.data as LockStatus);
      if (rRes.success) setLockRate(rRes.data as LockRate);
      setLoading(false);
    }).catch(() => { setLoadError("Network error - check your connection."); setLoading(false); });
  }, [workerId]);

  useEffect(() => { loadWorker(); }, [loadWorker]);

  // Reset lazily-loaded applications when navigating to a different worker —
  // without this, switching workers while already on the "applications" tab
  // would keep showing the previous worker's applications (the lazy-load
  // effect below only fetches when apps is still null).
  useEffect(() => {
    setApps(null);
  }, [workerId]);

  // Lazy-load applications when tab selected
  const loadApps = useCallback(() => {
    setAppsLoading(true);
    setAppsError(null);
    employerApi.getWorkerApplications(workerId).then(res => {
      if (res.success) setApps(res.data as WorkerApplication[]);
      else setAppsError(res.error ?? "Could not load applications.");
      setAppsLoading(false);
    }).catch(() => { setAppsError("Network error - check your connection."); setAppsLoading(false); });
  }, [workerId]);

  useEffect(() => {
    if (activeTab !== "applications" || apps !== null) return;
    loadApps();
  }, [activeTab, apps, loadApps]);

  // Declared here (not further down with the other lock actions) and memoized
  // so the escape-key effect right below can list it as a dependency without
  // resubscribing its keydown listener on every render.
  const closeReserveModal = useCallback(() => {
    if (modalLoading) return;
    setShowModal(false);
    setModalDays(7);
    setModalPhase("configure");
    setModalError("");
    setStripeClientSecret("");
    setStripePaymentIntentId("");
    setStripeTotalCents(0);
    setStripeDailyRateCents(0);
  }, [modalLoading]);

  const closeExtendModal = useCallback(() => {
    if (extendLoading) return;
    setShowExtendModal(false);
    setExtendDays(7);
    setExtendPhase("configure");
    setExtendError("");
    setExtendClientSecret("");
    setExtendPaymentIntentId("");
    setExtendAdditionalCents(0);
  }, [extendLoading]);

  // Escape key + body scroll lock for modals
  const anyModalOpen = showModal || showExtendModal || showReleaseModal || showMsgModal;
  useEffect(() => {
    if (!anyModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showModal        && !modalLoading)   closeReserveModal();
      if (showExtendModal  && !extendLoading)  closeExtendModal();
      if (showReleaseModal && !releaseLoading) setShowReleaseModal(false);
      if (showMsgModal     && !msgSending)     { setShowMsgModal(false); setMsgText(""); setMsgError(""); setMsgSent(false); }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [anyModalOpen, showModal, showExtendModal, showReleaseModal, showMsgModal, modalLoading, extendLoading, releaseLoading, msgSending, closeReserveModal, closeExtendModal]);

  function showToast(msg: string, type: "ok" | "err") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function refetchLock() {
    const res = await employerApi.getWorkerLockStatus(workerId);
    if (res.success) setLockStatus(res.data as LockStatus);
  }

  // ── Lock actions ─────────────────────────────────────────────────────────

  async function handleInitiateReserve() {
    if (modalDays < 1 || modalDays > 14) { setModalError("Duration must be 1–14 days."); return; }
    setModalLoading(true);
    setModalError("");
    const res = await employerApi.lockWorker(workerId, { lock_days: modalDays });
    setModalLoading(false);
    if (res.success) {
      const data = res.data as {
        clientSecret:    string;
        paymentIntentId: string;
        totalCents:      number;
        dailyRateCents:  number;
        lockDays:        number;
      };
      setStripeClientSecret(data.clientSecret);
      setStripePaymentIntentId(data.paymentIntentId);
      setStripeTotalCents(data.totalCents);
      setStripeDailyRateCents(data.dailyRateCents);
      setModalPhase("payment");
    } else {
      const errData = res as unknown as { code?: string; error?: string };
      if (errData.code === "WORKER_LOCKED") {
        closeReserveModal();
        await refetchLock();
        showToast("This worker is already reserved by another employer.", "err");
      } else if (errData.code === "CONCURRENT_LIMIT") {
        setModalError("You've reached the maximum number of concurrent reservations.");
      } else {
        setModalError(res.error ?? "Something went wrong. Please try again.");
      }
    }
  }

  async function handleLockConfirmed() {
    const res = await employerApi.confirmLock(workerId, { paymentIntentId: stripePaymentIntentId });
    if (res.success) {
      closeReserveModal();
      await refetchLock();
      const expiry = (res.data as { lockExpiryDate?: string })?.lockExpiryDate;
      showToast(`Worker reserved${expiry ? " until " + fmtDate(expiry) : ""}`, "ok");
    } else {
      setModalError(res.error ?? "Reservation could not be confirmed. Please contact support.");
      setModalPhase("configure");
    }
  }

  async function handleExtend() {
    if (!lock) return;
    const currentTotal = Math.round(
      (new Date(lock.lock_expiry_date).getTime() - new Date(lock.lock_start_date).getTime()) / (24 * 3600 * 1000)
    );
    if (currentTotal + extendDays > 60) {
      setExtendError(`Cannot exceed 60 days total. You can add up to ${60 - currentTotal} more day(s).`);
      return;
    }
    setExtendLoading(true);
    setExtendError("");
    const res = await employerApi.extendWorkerLock(workerId, { additional_days: extendDays });
    setExtendLoading(false);
    if (res.success) {
      const data = res.data as { clientSecret: string; paymentIntentId: string; additionalCents: number };
      setExtendClientSecret(data.clientSecret);
      setExtendPaymentIntentId(data.paymentIntentId);
      setExtendAdditionalCents(data.additionalCents);
      setExtendPhase("payment");
    } else {
      setExtendError(res.error ?? "Could not extend reservation.");
    }
  }

  async function handleExtendConfirmed() {
    const res = await employerApi.confirmExtendWorkerLock(workerId, { paymentIntentId: extendPaymentIntentId });
    if (res.success) {
      closeExtendModal();
      await refetchLock();
      const newExpiry = (res.data as { lockExpiryDate?: string })?.lockExpiryDate;
      showToast(`Reservation extended${newExpiry ? " to " + fmtDate(newExpiry) : ""}`, "ok");
    } else {
      setExtendError(res.error ?? "Extension could not be confirmed. Please contact support.");
      setExtendPhase("configure");
    }
  }

  async function handleRelease() {
    setReleaseLoading(true);
    setReleaseError("");
    const res = await employerApi.releaseWorkerLock(workerId, releaseReason.trim() ? { reason: releaseReason.trim() } : undefined);
    setReleaseLoading(false);
    if (res.success) {
      setShowReleaseModal(false);
      setReleaseReason("");
      await refetchLock();
      showToast(`${worker?.first_name ?? "Worker"} has been released and is now available`, "ok");
    } else {
      setReleaseError(res.error ?? "Could not release reservation.");
    }
  }

  async function handleSendMessage() {
    if (!msgText.trim()) return;
    setMsgSending(true);
    setMsgError("");
    const res = await employerApi.messageWorker(workerId, msgText.trim());
    setMsgSending(false);
    if (res.success) {
      setMsgSent(true);
    } else {
      setMsgError(res.error ?? "Failed to send message. Please try again.");
    }
  }

  if (loading) return <Skeleton />;
  if (loadError) {
    return (
      <div style={{ maxWidth: 640, margin: "80px auto", padding: "0 20px" }}>
        <ErrorState message={loadError} retry={loadWorker} title="Could not load this worker" />
      </div>
    );
  }
  if (!worker)  return null;

  const name         = workerName(worker);
  const isLocked     = lockStatus?.is_locked ?? false;
  const lockByMe     = lockStatus?.lock_by_me ?? false;
  const lock         = lockStatus?.lock;
  const daysLeft     = lock ? daysRemaining(lock.lock_expiry_date) : 0;
  const usedPct      = lock ? Math.min(100, Math.round((lock.total_days_billed / lock.lock_days) * 100)) : 0;

  // Extend modal computed values
  const extendCurrentTotal = lock
    ? Math.round((new Date(lock.lock_expiry_date).getTime() - new Date(lock.lock_start_date).getTime()) / (24 * 3600 * 1000))
    : 0;
  const extendNewTotal    = extendCurrentTotal + extendDays;
  const extendCapExceeded = extendNewTotal > 60;
  const extendMaxAllowed  = Math.max(0, 60 - extendCurrentTotal);
  const extendNewExpiry   = lock
    ? new Date(new Date(lock.lock_expiry_date).getTime() + extendDays * 24 * 3600 * 1000)
    : null;
  const extendAddedCost   = lock
    ? (extendDays * Number(lock.daily_fee)).toFixed(2)
    : "0.00";

  const TABS = [
    { key: "overview",     label: "Overview" },
    { key: "skills",       label: "Skills" },
    { key: "experience",   label: "Experience" },
    { key: "documents",    label: `Documents${worker.documents?.length ? ` (${worker.documents.length})` : ""}` },
    { key: "applications", label: "Applications" },
  ] as const;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 900, margin: "0 auto" }}>
      <ToastDisplay toast={toast} />

      {/* Back nav */}
      <Link
        href="/employer/workers"
        style={{ fontSize: 13, color: "#64748b", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 20 }}
      >
        ← Back to Find Workers
      </Link>

      {/* ── Profile header card ── */}
      <div style={{
        background:   "white",
        border:       "1px solid #e2e8f0",
        borderRadius: 16,
        padding:      28,
        marginBottom: 20,
        display:      "flex",
        gap:          24,
        flexWrap:     "wrap",
        alignItems:   "flex-start",
      }}>
        {/* Left col */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flex: 1, minWidth: 200 }}>
          {/* Avatar */}
          <div style={{
            width:           72,
            height:          72,
            borderRadius:    "50%",
            background:      "#dbeafe",
            display:         "flex",
            alignItems:      "center",
            justifyContent:  "center",
            fontSize:        24,
            fontWeight:      700,
            color:           "#1d4ed8",
            flexShrink:      0,
            textTransform:   "uppercase",
          }}>
            {initials(name)}
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <h1 style={{ fontSize: 20, fontWeight: 600, color: "#0f172a", margin: 0 }}>{name}</h1>
              {worker.documents_verified_badge && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
                  color: "#15803d", background: "#f0fdf4", border: "1px solid #86efac",
                  flexShrink: 0, whiteSpace: "nowrap",
                }}>
                  ✓ Verified
                </span>
              )}
            </div>
            {worker.profession && (
              <div style={{ fontSize: 14, color: "#475569", marginBottom: 4 }}>{worker.profession}</div>
            )}
            {(worker.country || worker.city) && (
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>
                📍 {[worker.city, worker.country].filter(Boolean).join(", ")}
              </div>
            )}
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              Member since {fmtMonthYear(worker.created_at)}
            </div>
            {worker.lock_count > 0 && (
              <div style={{
                display:      "inline-flex",
                alignItems:   "center",
                gap:          5,
                marginTop:    8,
                padding:      "3px 10px",
                background:   "#f1f5f9",
                border:       "1px solid #e2e8f0",
                borderRadius: 20,
                fontSize:     11,
                color:        "#64748b",
              }}>
                🔒 Reserved {worker.lock_count} time{worker.lock_count !== 1 ? "s" : ""} previously
              </div>
            )}
          </div>
        </div>

        {/* Right col — lock state */}
        <div style={{ minWidth: 280, display: "flex", flexDirection: "column", gap: 10 }}>

          {/* STATE A: not locked */}
          {!isLocked && (
            <>
              {lockRate && (
                <div style={{ fontSize: 12, color: "#64748b", textAlign: "center", padding: "6px 0 2px" }}>
                  Reservation fee: <strong>{lockRate.rateDisplay}/day</strong> · Up to {lockRate.maxDays} days
                </div>
              )}
              <button
                onClick={() => setShowModal(true)}
                style={{
                  width:        "100%",
                  padding:      "12px 20px",
                  background:   "#0d9488",
                  color:        "white",
                  border:       "none",
                  borderRadius: 10,
                  fontSize:     15,
                  fontWeight:   600,
                  cursor:       "pointer",
                  transition:   "background 0.15s",
                }}
                onMouseOver={e => (e.currentTarget.style.background = "#0f766e")}
                onMouseOut={e  => (e.currentTarget.style.background = "#0d9488")}
              >
                Reserve this worker
              </button>
              <button
                onClick={() => setShowMsgModal(true)}
                style={{
                  width:        "100%",
                  padding:      "10px 20px",
                  background:   "white",
                  color:        "#374151",
                  border:       "1px solid #e2e8f0",
                  borderRadius: 10,
                  fontSize:     14,
                  fontWeight:   500,
                  cursor:       "pointer",
                  textAlign:    "center",
                  transition:   "border-color 0.15s",
                }}
                onMouseOver={e => (e.currentTarget.style.borderColor = "#0d9488")}
                onMouseOut={e  => (e.currentTarget.style.borderColor = "#e2e8f0")}
              >
                ✉ Message
              </button>
              <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
                Secure exclusive access during your hiring process
              </div>
            </>
          )}

          {/* STATE B: locked by me */}
          {isLocked && lockByMe && lock && (
            <div style={{
              background:   "#fffbeb",
              border:       "1px solid #fde68a",
              borderRadius: 12,
              padding:      16,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: 13, color: "#92400e" }}>Reserved by you</span>
              </div>
              <hr style={{ border: "none", borderTop: "1px solid #fde68a", margin: "0 0 12px" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginBottom: 12 }}>
                {[
                  { label: "Expires",       value: fmtDate(lock.lock_expiry_date) },
                  { label: "Days left",     value: `${daysLeft} day${daysLeft !== 1 ? "s" : ""}` },
                  { label: "Daily fee",     value: `${lock.currency} ${Number(lock.daily_fee).toFixed(2)}` },
                  { label: "Total billed",  value: `${lock.currency} ${Number(lock.total_billed).toFixed(2)}` },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, color: "#92400e", marginBottom: 1 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#78350f" }}>{value}</div>
                  </div>
                ))}
              </div>
              {/* Progress bar */}
              <div style={{ background: "#fef3c7", borderRadius: 6, height: 6, overflow: "hidden", marginBottom: 4 }}>
                <div style={{ width: `${usedPct}%`, height: "100%", background: "#f59e0b", borderRadius: 6 }} />
              </div>
              <div style={{ fontSize: 11, color: "#92400e", marginBottom: 12 }}>
                {lock.total_days_billed} of {lock.lock_days} days used
              </div>
              {/* Actions */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setShowExtendModal(true)}
                  style={{ flex: 1, padding: "8px 0", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#92400e", cursor: "pointer" }}
                >
                  Extend
                </button>
                <button
                  onClick={() => setShowReleaseModal(true)}
                  style={{ flex: 1, padding: "8px 0", background: "white", border: "1px solid #fca5a5", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#dc2626", cursor: "pointer" }}
                >
                  Release
                </button>
              </div>
              <button
                onClick={() => setShowMsgModal(true)}
                style={{ width: "100%", padding: "8px 0", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontWeight: 500, color: "#475569", cursor: "pointer" }}
              >
                ✉ Message
              </button>
            </div>
          )}

          {/* STATE C: locked by someone else */}
          {isLocked && !lockByMe && (
            <>
              <div style={{
                background:   "#f8fafc",
                border:       "1px solid #e2e8f0",
                borderRadius: 12,
                padding:      16,
                display:      "flex",
                alignItems:   "flex-start",
                gap:          12,
              }}>
                <div style={{ fontSize: 22, flexShrink: 0 }}>🔒</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 4 }}>Currently reserved</div>
                  <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
                    Another employer has reserved this worker.{" "}
                    They will become available when the reservation ends.
                  </div>
                </div>
              </div>
              <button disabled style={{
                width:        "100%",
                padding:      "12px 20px",
                background:   "#f1f5f9",
                color:        "#94a3b8",
                border:       "1px solid #e2e8f0",
                borderRadius: 10,
                fontSize:     15,
                fontWeight:   600,
                cursor:       "not-allowed",
              }}>
                Currently reserved
              </button>
              <button
                onClick={() => setShowMsgModal(true)}
                style={{ width: "100%", padding: "10px 0", background: "white", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 14, fontWeight: 500, color: "#374151", cursor: "pointer" }}
              >
                ✉ Message
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        display:      "flex",
        gap:          4,
        borderBottom: "1px solid #e2e8f0",
        marginBottom: 24,
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding:       "10px 18px",
              background:    "none",
              border:        "none",
              borderBottom:  activeTab === t.key ? "2px solid #0d9488" : "2px solid transparent",
              color:         activeTab === t.key ? "#0d9488" : "#64748b",
              fontWeight:    activeTab === t.key ? 600 : 400,
              fontSize:      14,
              cursor:        "pointer",
              marginBottom:  -1,
              transition:    "color 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}

      {/* OVERVIEW */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Personal details grid */}
          {(worker.nationality || worker.phone || worker.availability_date || worker.marital_status != null) && (
            <Section title="Personal details">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px 24px" }}>
                {worker.nationality && (
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Nationality</div>
                    <div style={{ fontSize: 14, color: "#0f172a", fontWeight: 500 }}>{worker.nationality}</div>
                  </div>
                )}
                {worker.phone && (
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Phone</div>
                    <div style={{ fontSize: 14, color: "#0f172a", fontWeight: 500 }}>{worker.phone}</div>
                  </div>
                )}
                {worker.availability_date && (
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Available from</div>
                    <div style={{ fontSize: 14, color: "#0f172a", fontWeight: 500 }}>{fmtDate(worker.availability_date)}</div>
                  </div>
                )}
                {worker.verification_status && (
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Verification</div>
                    <div style={{
                      display:      "inline-block",
                      padding:      "2px 8px",
                      borderRadius: 12,
                      fontSize:     12,
                      fontWeight:   600,
                      background:   worker.verification_status === "APPROVED" ? "#f0fdf4" : "#f8fafc",
                      color:        worker.verification_status === "APPROVED" ? "#15803d" : "#64748b",
                      border:       `1px solid ${worker.verification_status === "APPROVED" ? "#86efac" : "#e2e8f0"}`,
                    }}>
                      {worker.verification_status === "APPROVED" ? "✓ Verified" : worker.verification_status.toLowerCase()}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}
          {worker.target_countries.length > 0 && (
            <Section title="Countries willing to work in">
              <ChipList items={worker.target_countries.map(t => t.country)} />
            </Section>
          )}
          {worker.languages.length > 0 && (
            <Section title="Languages spoken">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {worker.languages.map(l => (
                  <Chip key={l.language} label={`${l.language} — ${l.proficiencyLevel.replace(/_/g, " ").toLowerCase()}`} />
                ))}
              </div>
            </Section>
          )}
          {worker.bio && (
            <Section title="About">
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.7, margin: 0 }}>{worker.bio}</p>
            </Section>
          )}
          {!worker.nationality && !worker.phone && !worker.availability_date &&
           !worker.target_countries.length && !worker.languages.length && !worker.bio && (
            <EmptyTabMsg text="No overview information available." />
          )}
        </div>
      )}

      {/* SKILLS */}
      {activeTab === "skills" && (
        <Section title="Skills">
          {worker.skills.length > 0
            ? <ChipList items={worker.skills.map(s => s.skill)} />
            : <EmptyTabMsg text="No skills listed." />
          }
        </Section>
      )}

      {/* EXPERIENCE */}
      {activeTab === "experience" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <StatBox label="Years of experience" value={worker.years_experience ?? "—"} />
            <StatBox label="Expected salary" value={worker.expected_salary ?? "—"} />
          </div>
          {(worker.profile_score != null || worker.trust_score != null) && (
            <Section title="Profile scores">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {worker.profile_score != null && (
                  <div>
                    <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Profile score</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${worker.profile_score}%`, height: "100%", background: "#0d9488", borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", minWidth: 36 }}>{worker.profile_score}</span>
                    </div>
                  </div>
                )}
                {worker.trust_score != null && (
                  <div>
                    <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Trust score</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${worker.trust_score}%`, height: "100%", background: "#6366f1", borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", minWidth: 36 }}>{worker.trust_score}</span>
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}
        </div>
      )}

      {/* DOCUMENTS */}
      {activeTab === "documents" && (
        <Section title="Uploaded documents">
          {/* Documents not yet verified by admin */}
          {worker.document_status === "PENDING_REVIEW" && (
            <div style={{
              display:      "flex",
              alignItems:   "center",
              gap:          16,
              padding:      "20px 24px",
              background:   "rgba(251,191,36,0.06)",
              border:       "1px solid rgba(251,191,36,0.2)",
              borderRadius: 12,
            }}>
              <div style={{ fontSize: 28, flexShrink: 0 }}>🔒</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#fbbf24", marginBottom: 4 }}>
                  Documents under review
                </div>
                <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
                  This worker&apos;s documents are being reviewed by our team. They will become visible once approved.
                </div>
              </div>
            </div>
          )}

          {/* Verified badge + document list */}
          {worker.document_status === "VERIFIED" && (
            <>
              <div style={{
                display:      "flex",
                alignItems:   "center",
                gap:          10,
                padding:      "12px 16px",
                background:   "rgba(34,197,94,0.06)",
                border:       "1px solid rgba(34,197,94,0.2)",
                borderRadius: 10,
                marginBottom: 16,
              }}>
                <span style={{ fontSize: 18 }}>✅</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#22c55e" }}>
                  All documents have been verified by DirectHire
                </span>
              </div>

              {!worker.documents?.length ? (
                <EmptyTabMsg text="No documents uploaded yet." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {worker.documents.map(doc => (
                    <div key={doc.id} style={{
                      display:        "flex",
                      alignItems:     "center",
                      justifyContent: "space-between",
                      padding:        "12px 16px",
                      background:     "#f8fafc",
                      border:         "1px solid #e2e8f0",
                      borderRadius:   10,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ fontSize: 20 }}>
                          {doc.file_type === "PROFILE_PHOTO" ? "🖼" :
                           doc.file_type === "WORK_VIDEO" || doc.file_type === "INTRO_VIDEO" ? "🎬" : "📄"}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: "#0f172a", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
                            {doc.file_name}
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 20, padding: "2px 7px", marginLeft: 6 }}>Verified</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#94a3b8" }}>
                            {doc.file_type.replace(/_/g, " ").toLowerCase()} · Uploaded {fmtDate(doc.uploaded_at)}
                          </div>
                        </div>
                      </div>
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding:        "6px 14px",
                          background:     "white",
                          border:         "1px solid #e2e8f0",
                          borderRadius:   8,
                          fontSize:       13,
                          fontWeight:     500,
                          color:          "#374151",
                          textDecoration: "none",
                          whiteSpace:     "nowrap",
                        }}
                      >
                        View ↗
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Fallback: no document_status field (worker not yet migrated) */}
          {!worker.document_status && !worker.documents?.length && (
            <EmptyTabMsg text="No documents uploaded yet." />
          )}
        </Section>
      )}

      {/* APPLICATIONS */}
      {activeTab === "applications" && (
        <Section title="Applications to your jobs">
          {appsLoading && (
            <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
              <Spinner size="md" color="teal" />
            </div>
          )}
          {!appsLoading && appsError && (
            <ErrorState message={appsError} retry={loadApps} title="Could not load applications" />
          )}
          {!appsLoading && !appsError && apps !== null && apps.length === 0 && (
            <EmptyTabMsg text="This worker hasn't applied to your job posts." />
          )}
          {!appsLoading && apps !== null && apps.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {apps.map(a => {
                const cfg = APP_STATUS_CFG[a.status] ?? APP_STATUS_CFG.APPLIED;
                return (
                  <Link
                    key={a.id}
                    href={`/employer/jobs/${a.job_id}/applicants`}
                    style={{ textDecoration: "none" }}
                  >
                    <div style={{
                      display:      "flex",
                      alignItems:   "center",
                      justifyContent: "space-between",
                      padding:      "14px 16px",
                      background:   "white",
                      border:       "1px solid #e2e8f0",
                      borderRadius: 10,
                      marginBottom: 8,
                      cursor:       "pointer",
                      transition:   "border-color 0.15s",
                    }}
                      onMouseOver={e => (e.currentTarget.style.borderColor = "#0d9488")}
                      onMouseOut={e  => (e.currentTarget.style.borderColor = "#e2e8f0")}
                    >
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14, color: "#0f172a", marginBottom: 2 }}>
                          {a.job_title}
                        </div>
                        <div style={{ fontSize: 12, color: "#94a3b8" }}>
                          Applied {fmtDate(a.applied_at)}
                        </div>
                      </div>
                      <div style={{
                        padding:      "3px 10px",
                        borderRadius: 20,
                        fontSize:     12,
                        fontWeight:   600,
                        background:   cfg.bg,
                        color:        cfg.color,
                        border:       `1px solid ${cfg.border}`,
                      }}>
                        {cfg.label}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* ── Reserve modal ── */}
      {showModal && (
        <Modal onClose={closeReserveModal}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>
            Reserve {worker.first_name ?? name}
          </h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>
            Other employers cannot contact or hire this worker during the reservation.
          </p>

          {/* Phase 1: configure duration */}
          {modalPhase === "configure" && (
            <>
              <label style={labelStyle}>Reservation duration</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {LOCK_PRESETS.map(d => (
                  <button
                    key={d}
                    onClick={() => setModalDays(d)}
                    style={{
                      flex:         1,
                      padding:      "8px 0",
                      border:       modalDays === d ? "2px solid #0d9488" : "1px solid #e2e8f0",
                      borderRadius: 8,
                      background:   modalDays === d ? "#f0fdfa" : "white",
                      color:        modalDays === d ? "#0d9488" : "#374151",
                      fontWeight:   modalDays === d ? 700 : 400,
                      fontSize:     13,
                      cursor:       "pointer",
                      transition:   "all 0.1s",
                    }}
                  >
                    {d}d
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                max={14}
                value={modalDays}
                onChange={e => setModalDays(Math.max(1, Math.min(14, parseInt(e.target.value) || 1)))}
                placeholder="Custom days (1–14)"
                style={inputStyle}
              />

              {lockRate ? (
                <div style={{ background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 10, padding: 14, marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0d9488", marginBottom: 8 }}>Pricing</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#374151", marginBottom: 4 }}>
                    <span>Daily rate</span>
                    <span style={{ fontWeight: 600 }}>{lockRate.rateDisplay} / day · platform rate</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#374151", marginBottom: 4 }}>
                    <span>Duration</span>
                    <span style={{ fontWeight: 600 }}>{modalDays} day{modalDays !== 1 ? "s" : ""}</span>
                  </div>
                  <div style={{ borderTop: "1px solid #99f6e4", paddingTop: 8, marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                    <span>Total</span>
                    <span>${((lockRate.dailyRateCents * modalDays) / 100).toFixed(2)} USD</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#0d9488", marginTop: 4 }}>
                    Charged upfront. Unused days are refunded automatically if you release early.
                  </div>
                </div>
              ) : (
                <div style={{ background: "#f8fafc", borderRadius: 10, padding: 14, marginTop: 16 }}>
                  <div style={{ fontSize: 13, color: "#64748b" }}>Loading platform rate…</div>
                </div>
              )}

              {modalError && (
                <div style={{ color: "#dc2626", fontSize: 13, marginTop: 12 }}>{modalError}</div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button onClick={closeReserveModal} disabled={modalLoading} style={{ ...btnSecondaryStyle, flex: 1 }}>
                  Cancel
                </button>
                <button
                  onClick={handleInitiateReserve}
                  disabled={modalLoading}
                  style={{ ...btnPrimaryStyle, flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  {modalLoading && <Spinner size="xs" color="white" />}
                  {lockRate
                    ? `Confirm & Pay $${((lockRate.dailyRateCents * modalDays) / 100).toFixed(2)}`
                    : "Continue to payment"}
                </button>
              </div>
            </>
          )}

          {/* Phase 2: Stripe payment */}
          {modalPhase === "payment" && stripeClientSecret && (
            <>
              {/* Cost summary */}
              <div style={{ background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 10, padding: "12px 14px", marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#0d9488", marginBottom: 6 }}>Reservation summary</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#374151", marginBottom: 3 }}>
                  <span>Duration</span>
                  <span style={{ fontWeight: 600 }}>{modalDays} day{modalDays !== 1 ? "s" : ""}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#374151", marginBottom: 3 }}>
                  <span>Daily rate</span>
                  <span style={{ fontWeight: 600 }}>${(stripeDailyRateCents / 100).toFixed(2)} USD</span>
                </div>
                <div style={{ borderTop: "1px solid #99f6e4", paddingTop: 8, marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                  <span>Total charged today</span>
                  <span>${(stripeTotalCents / 100).toFixed(2)} USD</span>
                </div>
                <div style={{ fontSize: 11, color: "#0d9488", marginTop: 4 }}>
                  Unused days are refunded automatically if you release early.
                </div>
              </div>

              <Elements stripe={stripePromise} options={{ clientSecret: stripeClientSecret, appearance: { theme: "stripe" } }}>
                <PaymentForm
                  paymentIntentId={stripePaymentIntentId}
                  onSuccess={handleLockConfirmed}
                  onCancel={() => { setModalPhase("configure"); setModalError(""); }}
                />
              </Elements>

              {modalError && (
                <div style={{ color: "#dc2626", fontSize: 13, marginTop: 12 }}>{modalError}</div>
              )}
            </>
          )}
        </Modal>
      )}

      {/* ── Extend modal ── */}
      {showExtendModal && lock && (
        <Modal onClose={() => !extendLoading && closeExtendModal()}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>
            Extend reservation — {worker.first_name ?? name}
          </h2>

          {extendPhase === "configure" && (
            <>
              {/* Current status row */}
              <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px", margin: "14px 0 20px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 0" }}>
                {[
                  { label: "Current expiry",   value: fmtDate(lock.lock_expiry_date) },
                  { label: "Lock started",     value: fmtDate(lock.lock_start_date)  },
                  { label: "Days used so far", value: String(lock.total_days_billed) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Additional days */}
              <label style={labelStyle}>Additional days</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {[3, 7, 14].map(d => (
                  <button
                    key={d}
                    onClick={() => setExtendDays(d)}
                    style={{
                      flex:         1,
                      padding:      "8px 0",
                      border:       extendDays === d ? "2px solid #0d9488" : "1px solid #e2e8f0",
                      borderRadius: 8,
                      background:   extendDays === d ? "#f0fdfa" : "white",
                      color:        extendDays === d ? "#0d9488" : "#374151",
                      fontWeight:   extendDays === d ? 700 : 400,
                      fontSize:     13,
                      cursor:       "pointer",
                      transition:   "all 0.1s",
                    }}
                  >
                    {d}d
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                max={30}
                value={extendDays}
                onChange={e => setExtendDays(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))}
                style={inputStyle}
              />

              {/* Cap validator / preview */}
              {extendCapExceeded ? (
                <div style={{ color: "#dc2626", fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
                  Cannot exceed 60 days total.<br />
                  You can add up to {extendMaxAllowed} more day{extendMaxAllowed !== 1 ? "s" : ""}.
                </div>
              ) : (
                <div style={{ marginTop: 10 }}>
                  <div style={{ color: "#059669", fontSize: 13, fontWeight: 600 }}>
                    New expiry: {extendNewExpiry ? fmtDate(extendNewExpiry) : "—"}
                  </div>
                  <div style={{ color: "#64748b", fontSize: 12, marginTop: 3 }}>
                    {extendDays} × {lock.currency} {Number(lock.daily_fee).toFixed(2)} = {lock.currency} {extendAddedCost} additional
                  </div>
                </div>
              )}

              {extendError && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>{extendError}</div>}

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button
                  onClick={closeExtendModal}
                  disabled={extendLoading}
                  style={{ ...btnSecondaryStyle, flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleExtend}
                  disabled={extendLoading || extendCapExceeded}
                  style={{
                    ...btnPrimaryStyle,
                    flex:    2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap:     8,
                    opacity: extendCapExceeded ? 0.5 : 1,
                    cursor:  extendCapExceeded ? "not-allowed" : "pointer",
                  }}
                >
                  {extendLoading && <Spinner size="xs" color="white" />}
                  {extendCapExceeded ? "Confirm extension" : `Confirm & Charge ${lock.currency} ${extendAddedCost}`}
                </button>
              </div>
            </>
          )}

          {/* Phase 2: Stripe payment */}
          {extendPhase === "payment" && extendClientSecret && (
            <>
              <div style={{ background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 10, padding: "12px 14px", margin: "14px 0 20px" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#0d9488", marginBottom: 6 }}>Extension summary</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#374151", marginBottom: 3 }}>
                  <span>Additional days</span>
                  <span style={{ fontWeight: 600 }}>{extendDays} day{extendDays !== 1 ? "s" : ""}</span>
                </div>
                <div style={{ borderTop: "1px solid #99f6e4", paddingTop: 8, marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                  <span>Total charged today</span>
                  <span>${(extendAdditionalCents / 100).toFixed(2)} USD</span>
                </div>
              </div>

              <Elements stripe={stripePromise} options={{ clientSecret: extendClientSecret, appearance: { theme: "stripe" } }}>
                <PaymentForm
                  paymentIntentId={extendPaymentIntentId}
                  onSuccess={handleExtendConfirmed}
                  onCancel={() => { setExtendPhase("configure"); setExtendError(""); }}
                  submitLabel="Pay & confirm extension"
                />
              </Elements>

              {extendError && (
                <div style={{ color: "#dc2626", fontSize: 13, marginTop: 12 }}>{extendError}</div>
              )}
            </>
          )}
        </Modal>
      )}

      {/* ── Message modal ── */}
      {showMsgModal && (
        <Modal onClose={() => { if (!msgSending) { setShowMsgModal(false); setMsgText(""); setMsgError(""); setMsgSent(false); } }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>
            Message {worker.first_name ?? name}
          </h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>
            Your message will be sent to the worker&apos;s email address.
          </p>

          {msgSent ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#0f172a", marginBottom: 6 }}>Message sent!</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
                {worker.first_name ?? name} will receive your message by email.
              </div>
              <button
                onClick={() => { setShowMsgModal(false); setMsgText(""); setMsgSent(false); }}
                style={{ ...btnPrimaryStyle, padding: "10px 32px" }}
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <label style={labelStyle}>Your message</label>
              <textarea
                value={msgText}
                onChange={e => setMsgText(e.target.value.slice(0, 500))}
                placeholder={`Write a message to ${worker.first_name ?? name}...`}
                rows={5}
                style={{
                  ...inputStyle,
                  resize:     "vertical",
                  fontFamily: "inherit",
                  lineHeight: 1.5,
                }}
                autoFocus
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 11, color: msgText.length >= 480 ? "#f59e0b" : "#94a3b8" }}>
                  {msgText.length}/500
                </span>
              </div>

              {msgError && (
                <div style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{msgError}</div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button
                  onClick={() => { setShowMsgModal(false); setMsgText(""); setMsgError(""); }}
                  disabled={msgSending}
                  style={{ ...btnSecondaryStyle, flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={msgSending || !msgText.trim()}
                  style={{
                    ...btnPrimaryStyle,
                    flex:    2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    opacity: !msgText.trim() ? 0.5 : 1,
                    cursor:  !msgText.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {msgSending && <Spinner size="xs" color="white" />}
                  Send message
                </button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* ── Release modal ── */}
      {showReleaseModal && lock && (
        <Modal onClose={() => !releaseLoading && setShowReleaseModal(false)}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 10px" }}>
            Release reservation?
          </h2>

          {/* Amber warning */}
          <div style={{ fontSize: 13, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
            {worker.first_name ?? name} will become available to other employers immediately.
          </div>

          {/* Summary card */}
          <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px", marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 0" }}>
            {[
              { label: "Active since",   value: fmtDate(lock.lock_start_date) },
              { label: "Days billed",    value: String(lock.total_days_billed) },
              { label: "Total charged",  value: `${lock.currency} ${Number(lock.total_billed).toFixed(2)}` },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Optional reason */}
          <label style={labelStyle}>
            Reason <span style={{ fontWeight: 400, color: "#94a3b8" }}>(optional, internal only)</span>
          </label>
          <textarea
            value={releaseReason}
            onChange={e => setReleaseReason(e.target.value.slice(0, 300))}
            placeholder="e.g. Position filled, hired via another channel..."
            rows={3}
            style={{
              ...inputStyle,
              resize:     "vertical",
              fontFamily: "inherit",
              lineHeight: 1.5,
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, marginBottom: 2 }}>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>This reason is not shared with the worker.</span>
            <span style={{ fontSize: 11, color: releaseReason.length >= 280 ? "#f59e0b" : "#94a3b8" }}>
              {releaseReason.length}/300
            </span>
          </div>

          {/* Danger warning */}
          <div style={{ fontSize: 12, color: "#dc2626", marginTop: 10, fontWeight: 500 }}>
            This cannot be undone.
          </div>

          {releaseError && (
            <div style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{releaseError}</div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button
              onClick={() => { setShowReleaseModal(false); setReleaseError(""); setReleaseReason(""); }}
              disabled={releaseLoading}
              style={{ ...btnSecondaryStyle, flex: 1 }}
            >
              Keep reservation
            </button>
            <button
              onClick={handleRelease}
              disabled={releaseLoading}
              style={{
                flex:    2,
                padding: "11px 0",
                background: "#dc2626",
                color:   "white",
                border:  "none",
                borderRadius: 10,
                fontSize:  14,
                fontWeight: 600,
                cursor:  releaseLoading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
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

// ── Stripe PaymentForm (must be rendered inside <Elements>) ──────────────────

function PaymentForm({
  paymentIntentId: _paymentIntentId,
  onSuccess,
  onCancel,
  submitLabel = "Pay & confirm reservation",
}: {
  paymentIntentId: string;
  onSuccess:       () => Promise<void>;
  onCancel:        () => void;
  submitLabel?:    string;
}) {
  const stripe   = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError("");

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: window.location.href,
      },
    });

    if (stripeError) {
      setError(stripeError.message ?? "Payment failed. Please try again.");
      setLoading(false);
      return;
    }

    await onSuccess();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 16 }}>
        <PaymentElement options={{ layout: "tabs" }} />
      </div>

      {error && (
        <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          style={{ ...btnSecondaryStyle, flex: 1 }}
        >
          Back
        </button>
        <button
          type="submit"
          disabled={loading || !stripe || !elements}
          style={{ ...btnPrimaryStyle, flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: !stripe ? 0.6 : 1 }}
        >
          {loading && <Spinner size="xs" color="white" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

// ── Small reusable components ─────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px" }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: "#374151", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {items.map(item => <Chip key={item} label={item} />)}
    </div>
  );
}

function Chip({ label, teal }: { label: string; teal?: boolean }) {
  return (
    <span style={{
      padding:      "4px 12px",
      borderRadius: 20,
      fontSize:     13,
      background:   teal ? "#f0fdfa" : "#f1f5f9",
      color:        teal ? "#0d9488" : "#374151",
      border:       `1px solid ${teal ? "#99f6e4" : "#e2e8f0"}`,
      fontWeight:   teal ? 600 : 400,
    }}>
      {label}
    </span>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px" }}>
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{value}</div>
    </div>
  );
}

function EmptyTabMsg({ text }: { text: string }) {
  return (
    <div style={{ padding: "32px 0", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>{text}</div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus trap
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    first?.focus();
    function onTab(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      if (focusable.length === 0) { e.preventDefault(); return; }
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener("keydown", onTab);
    return () => document.removeEventListener("keydown", onTab);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        style={{ background: "white", borderRadius: 16, padding: "28px 32px", maxWidth: 480, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", outline: "none" }}
        onClick={e => e.stopPropagation()}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}

// ── Shared style objects ──────────────────────────────────────────────────────

const labelStyle: CSSProperties = {
  display:     "block",
  fontSize:    13,
  fontWeight:  600,
  color:       "#374151",
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width:        "100%",
  padding:      "10px 12px",
  border:       "1px solid #e2e8f0",
  borderRadius: 8,
  fontSize:     14,
  color:        "#0f172a",
  background:   "white",
  boxSizing:    "border-box",
  outline:      "none",
};

const btnPrimaryStyle: CSSProperties = {
  padding:      "11px 0",
  background:   "#0d9488",
  color:        "white",
  border:       "none",
  borderRadius: 10,
  fontSize:     14,
  fontWeight:   600,
  cursor:       "pointer",
};

const btnSecondaryStyle: CSSProperties = {
  padding:      "11px 0",
  background:   "white",
  color:        "#374151",
  border:       "1px solid #e2e8f0",
  borderRadius: 10,
  fontSize:     14,
  fontWeight:   500,
  cursor:       "pointer",
};

// ── Export ────────────────────────────────────────────────────────────────────

export default function WorkerProfilePage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <WorkerProfileContent />
    </Suspense>
  );
}
