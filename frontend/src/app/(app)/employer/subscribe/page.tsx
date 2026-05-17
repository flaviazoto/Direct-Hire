"use client";
// src/app/(app)/employer/subscribe/page.tsx

import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

// Initialise Stripe once at module level
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

// ── Checkout form (must live inside <Elements>) ────────────────────────────────

function CheckoutForm() {
  const stripe   = useStripe();
  const elements = useElements();
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setStripeError(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/employer/subscribe/return`,
      },
    });

    // confirmPayment only returns here on error — success triggers a redirect
    if (error) {
      setStripeError(error.message ?? "Payment failed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 24 }}>
        <PaymentElement options={{ layout: "accordion" }} />
      </div>

      {stripeError && (
        <div style={{
          marginBottom: 16,
          padding: "12px 16px",
          borderRadius: 10,
          background: "rgba(248,113,113,0.08)",
          border: "1px solid rgba(248,113,113,0.25)",
          color: "#F87171",
          fontSize: 13,
          lineHeight: 1.55,
        }}>
          {stripeError}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting}
        style={{
          width: "100%",
          padding: "14px 20px",
          borderRadius: 12,
          border: "none",
          background: submitting || !stripe
            ? "rgba(99,102,241,0.35)"
            : "linear-gradient(135deg,#6366f1,#4f46e5)",
          color: "#ffffff",
          fontSize: 15,
          fontWeight: 700,
          cursor: submitting || !stripe ? "not-allowed" : "pointer",
          letterSpacing: "-0.01em",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          transition: "opacity 0.15s",
          boxShadow: submitting ? "none" : "0 4px 20px rgba(99,102,241,0.35)",
        }}
      >
        {submitting ? <><Spinner />Processing…</> : "Subscribe now →"}
      </button>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SubscribePage() {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [fetchError,   setFetchError]   = useState<string | null>(null);
  const [fetching,     setFetching]     = useState(true);

  useEffect(() => {
    const token = typeof window !== "undefined"
      ? localStorage.getItem("dh_token")
      : null;

    fetch("/api/subscriptions/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: "include",
    })
      .then(r => r.json())
      .then((data: { clientSecret?: string; error?: string }) => {
        if (data.clientSecret) {
          setClientSecret(data.clientSecret);
        } else {
          setFetchError(data.error ?? "Failed to initialise checkout.");
        }
      })
      .catch(() => setFetchError("Network error. Please try again."))
      .finally(() => setFetching(false));
  }, []);

  const appearance = {
    theme: "night" as const,
    variables: {
      colorPrimary:         "#6366f1",
      colorBackground:      "#0d1829",
      colorText:            "#F0F4FF",
      colorDanger:          "#F87171",
      colorTextSecondary:   "#8B9CC8",
      fontFamily:           "'Inter', system-ui, sans-serif",
      borderRadius:         "10px",
      spacingUnit:          "5px",
    },
    rules: {
      ".Input": { border: "1px solid #1E3258" },
      ".Input:focus": {
        border: "1px solid rgba(99,102,241,0.6)",
        boxShadow: "0 0 0 3px rgba(99,102,241,0.15)",
      },
    },
  };

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ padding: "48px 24px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 500 }}>

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: "linear-gradient(135deg,#6366f1,#4f46e5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px",
              boxShadow: "0 8px 32px rgba(99,102,241,0.35)",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
              </svg>
            </div>
            <h1 style={{
              fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)",
              fontSize: 26, fontWeight: 800, color: "#F0F4FF",
              margin: "0 0 8px", letterSpacing: "-0.03em",
            }}>
              Activate your subscription
            </h1>
            <p style={{ fontSize: 14, color: "#4A5980", margin: 0, lineHeight: 1.6 }}>
              Unlock full access to the DirectHire employer platform.
            </p>
          </div>

          {/* ── Card ───────────────────────────────────────────────────────── */}
          <div style={{
            background: "#0F1C35",
            border: "1px solid #1E3258",
            borderRadius: 20,
            padding: 32,
            boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          }}>

            {/* Plan summary row */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 18px", borderRadius: 12,
              background: "rgba(99,102,241,0.06)",
              border: "1px solid rgba(99,102,241,0.14)",
              marginBottom: 24,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#F0F4FF" }}>
                  Employer Monthly
                </div>
                <div style={{ fontSize: 11, color: "#4A5980", marginTop: 2 }}>
                  Billed monthly · Cancel anytime
                </div>
              </div>
              <div style={{
                fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)",
                fontSize: 20, fontWeight: 800, color: "#818CF8",
              }}>
                5,000 ALL
                <span style={{ fontSize: 12, fontWeight: 400, color: "#4A5980" }}>/mo</span>
              </div>
            </div>

            {/* Feature list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 24 }}>
              {[
                "Full verified worker directory access",
                "Worker Lock™ — secure top candidates",
                "Priority job listings with logo placement",
                "Dedicated employer support",
              ].map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#8B9CC8" }}>
                  <span style={{ color: "#34D399", fontWeight: 700, flexShrink: 0 }}>✓</span>
                  {f}
                </div>
              ))}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "#1E3258", marginBottom: 28 }} />

            {/* Payment area */}
            {fetching ? (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: 10, padding: "32px 0", color: "#4A5980", fontSize: 14,
              }}>
                <Spinner />
                <span>Initialising secure checkout…</span>
              </div>
            ) : fetchError ? (
              <div>
                <div style={{
                  padding: "13px 16px", borderRadius: 10, marginBottom: 16,
                  background: "rgba(248,113,113,0.08)",
                  border: "1px solid rgba(248,113,113,0.2)",
                  color: "#F87171", fontSize: 13,
                }}>
                  {fetchError}
                </div>
                <button
                  onClick={() => window.location.reload()}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 10,
                    background: "rgba(99,102,241,0.08)",
                    border: "1px solid rgba(99,102,241,0.2)",
                    color: "#818CF8", fontSize: 14, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Try again
                </button>
              </div>
            ) : clientSecret ? (
              <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
                <CheckoutForm />
              </Elements>
            ) : null}
          </div>

          {/* Security badge */}
          <div style={{
            textAlign: "center", marginTop: 16,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="#4A5980" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span style={{ fontSize: 12, color: "#4A5980" }}>
              Payments secured by Stripe. We never store card details.
            </span>
          </div>

        </div>
      </div>
    </>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span style={{
      display: "inline-block", width: 14, height: 14,
      border: "2px solid rgba(255,255,255,0.2)",
      borderTopColor: "currentColor",
      borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
      flexShrink: 0,
    }} />
  );
}
