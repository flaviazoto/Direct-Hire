"use client";
// src/app/(app)/employer/subscription/page.tsx
// Canonical subscription/billing page. This is the hardcoded Stripe checkout
// success/cancel return URL AND the portal return URL (see
// backend/src/controllers/billing.controller.ts createCheckout/createPortal),
// and the target of the SUBSCRIPTION_REQUIRED redirect in api-client.ts — so
// this page is the only place any of those flows can land, regardless of
// where the employer started.

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { employerApi } from "@/lib/api-client";
import { LoadingPage, ErrorState } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubStatus {
  status:           string;
  plan:             string | null;
  currentPeriodEnd: string | null;
  trialEndsAt:      string | null;
  hasCustomer:      boolean;
  cancelAtPeriodEnd: boolean;
  payments: Array<{
    id:              string;
    amount:          number;
    currency:        string;
    status:          string;
    type:            string;
    description:     string | null;
    createdAt:       string;
    stripeInvoiceId: string | null;
  }>;
}

// ── The one real plan — matches the single STRIPE_EMPLOYER_PRICE_ID configured
// server-side. No fake tiers: if a second real plan is ever added in Stripe,
// add it here alongside a second env-configured price ID, not before.
const PLAN = {
  key:      "EMPLOYER_MONTHLY",
  name:     "Employer Monthly",
  price:    "5,000 ALL",
  period:   "/ month",
  accent:   "#818CF8",
  features: [
    "Unlimited access to the verified worker directory",
    "Full contact details once you reserve a worker",
    "Post unlimited job listings",
    "Worker Lock™ reservation system",
    "Priority employer support",
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 2,
  }).format(cents / 100);
}

// ── Cancel confirmation modal ─────────────────────────────────────────────────

function CancelModal({
  periodEnd,
  loading,
  onConfirm,
  onClose,
}: {
  periodEnd: string | null;
  loading:   boolean;
  onConfirm: () => void;
  onClose:   () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}>
      <div style={{ background: "#0F1C35", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 20, padding: 36, maxWidth: 460, width: "100%" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(248,113,113,0.12)", border: "2px solid rgba(248,113,113,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <h3 style={{ fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)", fontSize: 20, fontWeight: 700, color: "#F0F4FF", margin: "0 0 10px", textAlign: "center" }}>Cancel subscription?</h3>
        <p style={{ fontSize: 13, color: "#4A5980", lineHeight: 1.65, textAlign: "center", margin: "0 0 20px" }}>
          Your subscription will remain active until <strong style={{ color: "#8B9CC8" }}>{fmtDate(periodEnd)}</strong>. You will not be charged again after that date.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#8B9CC8", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            Keep subscription
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{ flex: 1, padding: "12px", background: loading ? "rgba(248,113,113,0.1)" : "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, color: "#F87171", fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Canceling…" : "Yes, cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function EmployerSubscriptionContent() {
  const searchParams = useSearchParams();

  const [sub,          setSub]          = useState<SubStatus | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [actionBusy,   setActionBusy]   = useState<string | null>(null);
  const [toast,        setToast]        = useState<{ msg: string; ok: boolean } | null>(null);
  const [showCancel,   setShowCancel]   = useState(false);

  const fromSuccess  = searchParams?.get("success")  === "1";
  const fromCanceled = searchParams?.get("canceled") === "1";

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await employerApi.getSubscriptionStatus();
    if (r.success) setSub(r.data as SubStatus);
    else setError(r.error ?? "Could not load your subscription status.");
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Action handlers ───────────────────────────────────────────────────────

  const handleSubscribe = async () => {
    setActionBusy("checkout");
    const r = await employerApi.createSubscriptionCheckout();
    setActionBusy(null);
    if (r.success) {
      window.location.href = (r.data as { checkoutUrl: string }).checkoutUrl;
    } else {
      showToast(r.error ?? "Failed to start checkout. Try again.", false);
    }
  };

  const handlePortal = async () => {
    setActionBusy("portal");
    const r = await employerApi.getPortalSession();
    setActionBusy(null);
    if (r.success) {
      window.location.href = (r.data as { portalUrl: string }).portalUrl;
    } else {
      showToast(r.error ?? "Failed to open billing portal. Try again.", false);
    }
  };

  const handleCancelConfirm = async () => {
    setActionBusy("cancel");
    const r = await employerApi.cancelSubscription();
    setActionBusy(null);
    setShowCancel(false);
    if (r.success) {
      showToast("Subscription will cancel at end of billing period.", true);
      setSub(prev => prev ? { ...prev, status: "CANCELED", cancelAtPeriodEnd: true } : prev);
    } else {
      showToast(r.error ?? "Failed to cancel subscription.", false);
    }
  };

  if (loading) return <LoadingPage color="blue" />;
  if (error) {
    return (
      <div style={{ maxWidth: 560, margin: "80px auto", padding: "0 20px" }}>
        <ErrorState message={error} retry={load} title="Could not load your subscription" />
      </div>
    );
  }

  const status      = sub?.status ?? "INACTIVE";
  const isActive    = status === "ACTIVE";
  const isPastDue   = status === "PAST_DUE";
  const isInactive  = status === "INACTIVE" || !sub;
  const isCanceled  = status === "CANCELED";
  // Two distinct "trial" values exist: TRIAL is set at onboarding (before ever
  // subscribing); TRIALING comes from an actual Stripe trial subscription.
  const isTrial     = status === "TRIAL" || status === "TRIALING";
  const currentPlan = sub?.plan?.toUpperCase() ?? null;
  const isCurrentPlan = currentPlan === PLAN.key;

  const statusLabel = isActive ? "ACTIVE" : isPastDue ? "PAST DUE" : isTrial ? "TRIAL" : isCanceled ? "CANCELED" : "Inactive";
  const statusColor = isActive ? "#34D399" : isPastDue ? "#FBBF24" : isTrial ? "#FBBF24" : isCanceled ? "#F87171" : "rgba(255,255,255,0.4)";
  const statusBg    = isActive ? "rgba(52,211,153,0.18)" : isPastDue ? "rgba(251,191,36,0.18)" : isTrial ? "rgba(251,191,36,0.18)" : isCanceled ? "rgba(248,113,113,0.18)" : "rgba(255,255,255,0.08)";

  const BTN: React.CSSProperties = {
    padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600,
    cursor: actionBusy ? "not-allowed" : "pointer", transition: "opacity 0.15s",
    opacity: actionBusy ? 0.6 : 1, border: "none", display: "inline-flex",
    alignItems: "center", gap: 6,
  };

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1000, margin: "0 auto" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 9999,
          padding: "14px 20px", borderRadius: 12, fontSize: 13, fontWeight: 600,
          background: toast.ok ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
          color:      toast.ok ? "#34D399" : "#F87171",
          border:     `1px solid ${toast.ok ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`,
          boxShadow: "0 4px 24px rgba(0,0,0,0.3)", maxWidth: 380,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Cancel modal */}
      {showCancel && (
        <CancelModal
          periodEnd={sub?.currentPeriodEnd ?? null}
          loading={actionBusy === "cancel"}
          onConfirm={handleCancelConfirm}
          onClose={() => setShowCancel(false)}
        />
      )}

      {/* URL param banners */}
      {fromSuccess && (
        <div style={{ marginBottom: 24, padding: "16px 20px", borderRadius: 12, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", color: "#34D399", fontSize: 14, fontWeight: 600 }}>
          ✓ Subscription activated! Your plan is now active.
        </div>
      )}
      {fromCanceled && (
        <div style={{ marginBottom: 24, padding: "16px 20px", borderRadius: 12, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", color: "#FBBF24", fontSize: 14, fontWeight: 600 }}>
          ⚠ Checkout was canceled. No charges were made.
        </div>
      )}

      {/* Canceled warning banner */}
      {isCanceled && (
        <div style={{ marginBottom: 24, padding: "14px 20px", borderRadius: 12, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#F87171", fontSize: 13, fontWeight: 600 }}>
          Your subscription ends on {fmtDate(sub?.currentPeriodEnd)}. You can resubscribe below to continue using DirectHire.
        </div>
      )}

      {/* Past-due warning banner */}
      {isPastDue && (
        <div style={{ marginBottom: 24, padding: "14px 20px", borderRadius: 12, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", color: "#FBBF24", fontSize: 13, fontWeight: 600 }}>
          Your last payment failed. Update your payment method via &quot;Manage billing&quot; below to keep your subscription active.
        </div>
      )}

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)", fontWeight: 800, fontSize: 28, color: "#F0F4FF", margin: "0 0 4px", letterSpacing: "-0.03em" }}>
          Subscription &amp; Billing
        </h1>
        <p style={{ fontSize: 14, color: "#4A5980", margin: 0 }}>Manage your plan and payment details</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

        {/* ── Left column: current status hero ─────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          <div style={{
            borderRadius: 20, padding: 28, position: "relative", overflow: "hidden",
            background: "linear-gradient(135deg,#1e1b4b 0%,#312e81 40%,#4338ca 100%)",
            boxShadow: "0 8px 32px rgba(99,102,241,0.25)",
          }}>
            <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: "rgba(129,140,248,0.15)", filter: "blur(40px)", pointerEvents: "none" }} />
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 6 }}>
                Current Plan
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)", fontWeight: 800, fontSize: 28, color: "#ffffff" }}>
                  {isCurrentPlan ? PLAN.name : "No Plan"}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 999, background: statusBg, color: statusColor }}>
                  {statusLabel}
                </span>
              </div>

              {isCurrentPlan && (
                <div style={{ fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)", fontWeight: 800, fontSize: 34, color: "rgba(255,255,255,0.9)", marginBottom: 4 }}>
                  {PLAN.price}
                  <span style={{ fontSize: 14, fontWeight: 400, color: "rgba(255,255,255,0.5)" }}>{PLAN.period}</span>
                </div>
              )}

              {(isActive || isPastDue) && sub?.currentPeriodEnd && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>
                  {isPastDue ? "Payment retrying — renews" : "Renews"} {fmtDate(sub.currentPeriodEnd)}
                </div>
              )}

              {isTrial && sub?.trialEndsAt && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>
                  Trial ends {fmtDate(sub.trialEndsAt)}
                </div>
              )}

              {/* ── Action buttons ── */}
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginTop: 6 }}>

                {isInactive && (
                  <button
                    onClick={handleSubscribe}
                    disabled={!!actionBusy}
                    style={{ ...BTN, background: "rgba(255,255,255,0.95)", color: "#312e81", justifyContent: "center" as const }}
                  >
                    {actionBusy === "checkout"
                      ? <><Spinner />Redirecting to Stripe…</>
                      : `Subscribe — ${PLAN.price} ${PLAN.period.trim()} →`}
                  </button>
                )}

                {(isActive || isPastDue) && (
                  <>
                    <button
                      onClick={handlePortal}
                      disabled={!!actionBusy}
                      style={{ ...BTN, background: "rgba(255,255,255,0.12)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.2)", justifyContent: "center" as const }}
                    >
                      {actionBusy === "portal"
                        ? <><Spinner />Opening portal…</>
                        : "Manage billing →"}
                    </button>
                    {isActive && (
                      <button
                        onClick={() => setShowCancel(true)}
                        disabled={!!actionBusy}
                        style={{ ...BTN, background: "transparent", color: "rgba(248,113,113,0.8)", border: "1px solid rgba(248,113,113,0.2)", fontSize: 12, justifyContent: "center" as const }}
                      >
                        Cancel subscription
                      </button>
                    )}
                  </>
                )}

                {isCanceled && (
                  <button
                    onClick={handleSubscribe}
                    disabled={!!actionBusy}
                    style={{ ...BTN, background: "rgba(255,255,255,0.95)", color: "#312e81", justifyContent: "center" as const }}
                  >
                    {actionBusy === "checkout"
                      ? <><Spinner />Redirecting to Stripe…</>
                      : "Resubscribe →"}
                  </button>
                )}

                {isTrial && (
                  <button
                    onClick={handleSubscribe}
                    disabled={!!actionBusy}
                    style={{ ...BTN, background: "rgba(255,255,255,0.95)", color: "#312e81", justifyContent: "center" as const }}
                  >
                    {actionBusy === "checkout"
                      ? <><Spinner />Redirecting to Stripe…</>
                      : "Subscribe to continue →"}
                  </button>
                )}

              </div>
            </div>
          </div>

          {/* Contact card */}
          <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 16, padding: "20px 24px", textAlign: "center" as const }}>
            <p style={{ fontSize: 13, color: "#4A5980", marginBottom: 6 }}>Questions about billing?</p>
            <a href="mailto:support@directhire.cc" style={{ fontSize: 13, fontWeight: 600, color: "#818CF8", textDecoration: "none" }}>
              support@directhire.cc
            </a>
          </div>
        </div>

        {/* ── Right column ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* The one real plan */}
          <div style={{ fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)", fontWeight: 700, fontSize: 13, color: "#4A5980", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 4 }}>
            Plan
          </div>
          <div style={{
            background: "#0F1C35",
            border: isCurrentPlan ? "1px solid rgba(129,140,248,0.5)" : "1px solid #1E3258",
            borderRadius: 18, padding: 24,
            boxShadow: isCurrentPlan ? "0 0 24px rgba(99,102,241,0.12)" : "none",
            position: "relative",
          }}>
            {isCurrentPlan && (
              <div style={{
                position: "absolute", top: -11, left: 24,
                background: "linear-gradient(135deg,#6366F1,#4F46E5)",
                color: "#F0F4FF", fontSize: 10, fontWeight: 800,
                padding: "4px 12px", borderRadius: 999, letterSpacing: "0.06em",
              }}>
                CURRENT PLAN
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)", fontWeight: 800, fontSize: 18, color: "#F0F4FF" }}>
                {PLAN.name}
              </div>
              <div style={{ textAlign: "right" as const }}>
                <div style={{ fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)", fontWeight: 800, fontSize: 24, color: PLAN.accent }}>
                  {PLAN.price}
                </div>
                <div style={{ fontSize: 12, color: "#4A5980" }}>{PLAN.period}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
              {PLAN.features.map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#8B9CC8" }}>
                  <span style={{ color: "#34D399", fontWeight: 700, flexShrink: 0 }}>✓</span>
                  {f}
                </div>
              ))}
            </div>
          </div>

          {/* Invoice history */}
          <div style={{ background: "#0F1C35", border: "1px solid #1E3258", borderRadius: 20, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #1E3258", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)", fontWeight: 700, fontSize: 14, color: "#F0F4FF" }}>
                Billing History
              </span>
              {sub?.hasCustomer && (
                <button
                  onClick={handlePortal}
                  disabled={!!actionBusy}
                  style={{ background: "none", border: "none", color: "#818CF8", fontSize: 12, fontWeight: 600, cursor: actionBusy ? "not-allowed" : "pointer" }}
                >
                  All invoices →
                </button>
              )}
            </div>

            {(!sub?.payments || sub.payments.length === 0) ? (
              <div style={{ padding: "24px 20px", textAlign: "center" as const, color: "#4A5980", fontSize: 13 }}>
                No invoices yet. They will appear here after your first payment.
              </div>
            ) : (
              sub.payments.map((pmt, i) => (
                <div key={pmt.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 20px",
                  borderBottom: i < sub.payments.length - 1 ? "1px solid #1E3258" : "none",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#F0F4FF", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {pmt.description ?? pmt.type}
                    </div>
                    <div style={{ fontSize: 12, color: "#4A5980", marginTop: 2 }}>
                      {fmtDate(pmt.createdAt)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" as const, flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#F0F4FF", marginBottom: 4 }}>
                      {fmtAmount(pmt.amount, pmt.currency)}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" as const }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                        background: pmt.status === "SUCCEEDED" ? "rgba(52,211,153,0.15)" : "rgba(251,191,36,0.15)",
                        color:      pmt.status === "SUCCEEDED" ? "#34D399" : "#FBBF24",
                      }}>
                        {pmt.status === "SUCCEEDED" ? "PAID" : pmt.status}
                      </span>
                      {pmt.stripeInvoiceId && (
                        <a
                          href={`https://pay.stripe.com/invoices/${pmt.stripeInvoiceId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 11, fontWeight: 600, color: "#818CF8", textDecoration: "none" }}
                        >
                          Download
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span style={{
      display: "inline-block", width: 13, height: 13,
      border: "2px solid rgba(255,255,255,0.25)", borderTopColor: "currentColor",
      borderRadius: "50%", animation: "spin 0.7s linear infinite",
    }} />
  );
}

// ── Page wrapper ──────────────────────────────────────────────────────────────

export default function EmployerSubscriptionPage() {
  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <Suspense fallback={<LoadingPage color="blue" />}>
        <EmployerSubscriptionContent />
      </Suspense>
    </>
  );
}
