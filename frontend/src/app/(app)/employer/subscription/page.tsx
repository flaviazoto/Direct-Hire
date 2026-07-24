"use client";
// src/app/(app)/employer/subscription/page.tsx
// Canonical subscription/billing page. This is the hardcoded Stripe checkout
// success/cancel return URL AND the portal return URL (see
// backend/src/controllers/billing.controller.ts createCheckout/createPortal),
// and the target of the SUBSCRIPTION_REQUIRED redirect in api-client.ts — so
// this page is the only place any of those flows can land, regardless of
// where the employer started.
//
// Employer role = violet, per the design system — subscriptions/Worker Lock
// are explicitly called out as the "premium feature" surface that color is
// for, so the current-plan hero below is a deliberate solid violet block
// (not a gradient — the system disallows decorative gradients) rather than
// the flat white-card resting state used everywhere else on this page.

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
    invoice:         { id: string; invoiceNumber: string } | null;
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
    <div className="glass-scrim" style={{ display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}>
      <div className="glass-modal" style={{ padding: 36, maxWidth: 460, width: "100%" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(220,38,38,0.1)", border: "2px solid rgba(220,38,38,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <h3 style={{ fontFamily: "var(--font-display,'Manrope',system-ui,sans-serif)", fontSize: 20, fontWeight: 700, color: "#ffffff", margin: "0 0 10px", textAlign: "center" }}>Cancel subscription?</h3>
        <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.65, textAlign: "center", margin: "0 0 20px" }}>
          Your subscription will remain active until <strong style={{ color: "#cbd5e1" }}>{fmtDate(periodEnd)}</strong>. You will not be charged again after that date.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#cbd5e1", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            Keep subscription
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{ flex: 1, padding: "12px", background: "#DC2626", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
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
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

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

  const handleDownloadInvoice = async (invoiceId: string) => {
    setDownloadingInvoiceId(invoiceId);
    try {
      const r = await employerApi.getInvoiceUrl(invoiceId);
      if (r.success) {
        window.open((r.data as { url: string }).url, "_blank", "noopener,noreferrer");
      } else {
        showToast(r.error ?? "Could not open invoice.", false);
      }
    } finally {
      setDownloadingInvoiceId(null);
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

  if (loading) return <LoadingPage color="violet" />;
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

  // Semantic status colors — never the role (violet) color.
  const statusLabel = isActive ? "ACTIVE" : isPastDue ? "PAST DUE" : isTrial ? "TRIAL" : isCanceled ? "CANCELED" : "Inactive";
  const statusColor = isActive ? "#4ade80" : isPastDue ? "#fb923c" : isTrial ? "#fb923c" : isCanceled ? "#f87171" : "rgba(255,255,255,0.5)";
  const statusBg    = isActive ? "rgba(22,163,74,0.18)" : isPastDue ? "rgba(234,88,12,0.18)" : isTrial ? "rgba(234,88,12,0.18)" : isCanceled ? "rgba(220,38,38,0.18)" : "rgba(255,255,255,0.12)";

  const BTN: React.CSSProperties = {
    padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500,
    cursor: actionBusy ? "not-allowed" : "pointer", transition: "background 0.15s",
    opacity: actionBusy ? 0.6 : 1, border: "none", display: "inline-flex",
    alignItems: "center", gap: 6,
  };

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1000, margin: "0 auto", background: "var(--glass-base)", minHeight: "100vh" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 9999,
          padding: "14px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500,
          background: "rgba(30,41,59,0.9)",
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          color:      toast.ok ? "#4ade80" : "#f87171",
          borderLeft: `3px solid ${toast.ok ? "#16A34A" : "#DC2626"}`,
          border:     "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 12px 32px rgba(0,0,0,0.4)", maxWidth: 380,
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
        <div style={{ marginBottom: 24, padding: "16px 20px", borderRadius: 10, background: "rgba(22,163,74,0.06)", border: "1px solid rgba(22,163,74,0.2)", color: "#4ade80", fontSize: 14, fontWeight: 600 }}>
          Subscription activated — your plan is now active.
        </div>
      )}
      {fromCanceled && (
        <div style={{ marginBottom: 24, padding: "16px 20px", borderRadius: 10, background: "rgba(234,88,12,0.06)", border: "1px solid rgba(234,88,12,0.2)", color: "#fb923c", fontSize: 14, fontWeight: 600 }}>
          Checkout was canceled. No charges were made.
        </div>
      )}

      {/* Canceled warning banner */}
      {isCanceled && (
        <div style={{ marginBottom: 24, padding: "14px 20px", borderRadius: 10, background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.2)", color: "#f87171", fontSize: 13, fontWeight: 600 }}>
          Your subscription ends on {fmtDate(sub?.currentPeriodEnd)}. You can resubscribe below to continue using DirectHire.
        </div>
      )}

      {/* Past-due warning banner */}
      {isPastDue && (
        <div style={{ marginBottom: 24, padding: "14px 20px", borderRadius: 10, background: "rgba(234,88,12,0.05)", border: "1px solid rgba(234,88,12,0.2)", color: "#fb923c", fontSize: 13, fontWeight: 600 }}>
          Your last payment failed. Update your payment method via &quot;Manage billing&quot; below to keep your subscription active.
        </div>
      )}

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display,'Manrope',system-ui,sans-serif)", fontWeight: 700, fontSize: 24, color: "#ffffff", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
          Subscription &amp; billing
        </h1>
        <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>Manage your plan and payment details</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

        {/* ── Left column: current status hero ─────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Deliberate violet-glass premium panel — see file header note */}
          <div style={{
            borderRadius: 16, padding: 28,
            background: "linear-gradient(135deg, rgba(124,58,237,0.35), rgba(109,40,217,0.35))",
            backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(139,92,246,0.4)",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5), 0 8px 32px rgba(139,92,246,0.15)",
          }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 6 }}>
              Current plan
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontFamily: "var(--font-display,'Manrope',system-ui,sans-serif)", fontWeight: 700, fontSize: 24, color: "#ffffff" }}>
                {isCurrentPlan ? PLAN.name : "No plan"}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: statusBg, color: statusColor }}>
                {statusLabel}
              </span>
            </div>

            {isCurrentPlan && (
              <div style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 30, color: "#ffffff", marginBottom: 4 }}>
                {PLAN.price}
                <span style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 400, color: "rgba(255,255,255,0.6)" }}>{PLAN.period}</span>
              </div>
            )}

            {(isActive || isPastDue) && sub?.currentPeriodEnd && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 14 }}>
                {isPastDue ? "Payment retrying — renews" : "Renews"} {fmtDate(sub.currentPeriodEnd)}
              </div>
            )}

            {isTrial && sub?.trialEndsAt && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 14 }}>
                Trial ends {fmtDate(sub.trialEndsAt)}
              </div>
            )}

            {/* ── Action buttons ── */}
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginTop: 6 }}>

              {isInactive && (
                <button
                  onClick={handleSubscribe}
                  disabled={!!actionBusy}
                  style={{ ...BTN, background: "#ffffff", color: "#6D28D9", justifyContent: "center" as const, fontWeight: 600 }}
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
                    style={{ ...BTN, background: "rgba(255,255,255,0.15)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.25)", justifyContent: "center" as const }}
                  >
                    {actionBusy === "portal"
                      ? <><Spinner />Opening portal…</>
                      : "Manage billing →"}
                  </button>
                  {isActive && (
                    <button
                      onClick={() => setShowCancel(true)}
                      disabled={!!actionBusy}
                      style={{ ...BTN, background: "transparent", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.25)", fontSize: 12, justifyContent: "center" as const }}
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
                  style={{ ...BTN, background: "#ffffff", color: "#6D28D9", justifyContent: "center" as const, fontWeight: 600 }}
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
                  style={{ ...BTN, background: "#ffffff", color: "#6D28D9", justifyContent: "center" as const, fontWeight: 600 }}
                >
                  {actionBusy === "checkout"
                    ? <><Spinner />Redirecting to Stripe…</>
                    : "Subscribe to continue →"}
                </button>
              )}

            </div>
          </div>

          {/* Contact card */}
          <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 10, padding: "20px 24px", textAlign: "center" as const }}>
            <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 6 }}>Questions about billing?</p>
            <a href="mailto:support@directhire.cc" style={{ fontSize: 13, fontWeight: 600, color: "#A78BFA", textDecoration: "none" }}>
              support@directhire.cc
            </a>
          </div>
        </div>

        {/* ── Right column ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* The one real plan */}
          <div style={{ fontFamily: "var(--font-display,'Manrope',system-ui,sans-serif)", fontWeight: 700, fontSize: 13, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 4 }}>
            Plan
          </div>
          <div style={{
            background: "rgba(255,255,255,0.05)",
            border: isCurrentPlan ? "1px solid rgba(139,92,246,0.4)" : "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10, padding: 24,
            boxShadow: "0 1px 2px rgba(11,17,32,0.04)",
            position: "relative",
          }}>
            {isCurrentPlan && (
              <div style={{
                position: "absolute", top: -11, left: 24,
                background: "#7C3AED",
                color: "#ffffff", fontSize: 10, fontWeight: 700,
                padding: "4px 12px", borderRadius: 6, letterSpacing: "0.06em",
              }}>
                CURRENT PLAN
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontFamily: "var(--font-display,'Manrope',system-ui,sans-serif)", fontWeight: 700, fontSize: 18, color: "#ffffff" }}>
                {PLAN.name}
              </div>
              <div style={{ textAlign: "right" as const }}>
                <div style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 20, color: "#A78BFA" }}>
                  {PLAN.price}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{PLAN.period}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
              {PLAN.features.map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#cbd5e1" }}>
                  <span style={{ color: "#4ade80", fontWeight: 700, flexShrink: 0 }}>✓</span>
                  {f}
                </div>
              ))}
            </div>
          </div>

          {/* Invoice history */}
          <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-display,'Manrope',system-ui,sans-serif)", fontWeight: 600, fontSize: 14, color: "#ffffff" }}>
                Billing history
              </span>
              {sub?.hasCustomer && (
                <button
                  onClick={handlePortal}
                  disabled={!!actionBusy}
                  style={{ background: "none", border: "none", color: "#A78BFA", fontSize: 12, fontWeight: 600, cursor: actionBusy ? "not-allowed" : "pointer" }}
                >
                  All invoices →
                </button>
              )}
            </div>

            {(!sub?.payments || sub.payments.length === 0) ? (
              <div style={{ padding: "24px 20px", textAlign: "center" as const, color: "#94a3b8", fontSize: 13 }}>
                No invoices yet. They will appear here after your first payment.
              </div>
            ) : (
              sub.payments.map((pmt, i) => (
                <div key={pmt.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 20px",
                  borderBottom: i < sub.payments.length - 1 ? "1px solid rgba(255,255,255,0.1)" : "none",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#ffffff", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {pmt.description ?? pmt.type}
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                      {fmtDate(pmt.createdAt)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" as const, flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 14, color: "#ffffff", marginBottom: 4 }}>
                      {fmtAmount(pmt.amount, pmt.currency)}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" as const }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                        background: pmt.status === "SUCCEEDED" ? "rgba(22,163,74,0.1)" : "rgba(234,88,12,0.1)",
                        color:      pmt.status === "SUCCEEDED" ? "#4ade80" : "#fb923c",
                      }}>
                        {pmt.status === "SUCCEEDED" ? "PAID" : pmt.status}
                      </span>
                      {pmt.invoice && (
                        <button
                          onClick={() => handleDownloadInvoice(pmt.invoice!.id)}
                          disabled={downloadingInvoiceId === pmt.invoice.id}
                          style={{
                            fontSize: 11, fontWeight: 600, color: "#A78BFA", background: "none", border: "none",
                            padding: 0, cursor: downloadingInvoiceId === pmt.invoice.id ? "not-allowed" : "pointer",
                          }}
                        >
                          {downloadingInvoiceId === pmt.invoice.id ? "Preparing…" : "Download invoice"}
                        </button>
                      )}
                      {pmt.stripeInvoiceId && (
                        <a
                          href={`https://pay.stripe.com/invoices/${pmt.stripeInvoiceId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 11, fontWeight: 600, color: "#A78BFA", textDecoration: "none" }}
                        >
                          Stripe receipt
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
      border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "currentColor",
      borderRadius: "50%", animation: "spin 0.7s linear infinite",
    }} />
  );
}

// ── Page wrapper ──────────────────────────────────────────────────────────────

export default function EmployerSubscriptionPage() {
  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <Suspense fallback={<LoadingPage color="violet" />}>
        <EmployerSubscriptionContent />
      </Suspense>
    </>
  );
}
