"use client";
// src/app/(app)/employer/subscribe/return/page.tsx

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";

// ── Return content (needs Suspense because useSearchParams is async) ───────────

function ReturnContent() {
  const searchParams   = useSearchParams();
  const router         = useRouter();
  const redirectStatus = searchParams?.get("redirect_status");

  const [pageStatus, setPageStatus] = useState<
    "loading" | "success" | "processing" | "failed"
  >("loading");
  const [retrying, setRetrying] = useState(false);

  const checkBackendStatus = useCallback(async (): Promise<void> => {
    const token = typeof window !== "undefined"
      ? localStorage.getItem("dh_token")
      : null;

    try {
      const res = await fetch("/api/subscriptions/status", {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });
      const data = (await res.json()) as {
        status?: string;
        subscriptionStatus?: string;
      };

      const sub = data.status ?? data.subscriptionStatus ?? "";
      if (sub === "ACTIVE") {
        setPageStatus("success");
        setTimeout(() => router.push("/employer/dashboard"), 2000);
      } else {
        setPageStatus("processing");
      }
    } catch {
      setPageStatus("processing");
    }
  }, [router]);

  useEffect(() => {
    // Stripe passes redirect_status as a URL param
    if (redirectStatus === "requires_payment_method") {
      setPageStatus("failed");
      return;
    }
    checkBackendStatus();
  }, [redirectStatus, checkBackendStatus]);

  async function handleRetry() {
    setRetrying(true);
    setPageStatus("loading");
    await checkBackendStatus();
    setRetrying(false);
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (pageStatus === "loading") {
    return (
      <CenteredCard>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <BigSpinner color="#6366f1" />
          <p style={{ color: "#8B9CC8", fontSize: 15, margin: 0 }}>
            Confirming your subscription…
          </p>
        </div>
      </CenteredCard>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────────

  if (pageStatus === "success") {
    return (
      <CenteredCard>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "rgba(52,211,153,0.12)",
            border: "2px solid rgba(52,211,153,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
              stroke="#34D399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <div>
            <h2 style={{
              fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)",
              fontSize: 24, fontWeight: 800, color: "#F0F4FF",
              margin: "0 0 8px", letterSpacing: "-0.02em",
            }}>
              Subscription activated!
            </h2>
            <p style={{ color: "#4A5980", fontSize: 14, margin: "0 0 20px", lineHeight: 1.6 }}>
              Your DirectHire employer account is now fully active.
            </p>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            color: "#34D399", fontSize: 13, fontWeight: 600,
          }}>
            <InlineSpinner color="#34D399" />
            Redirecting to your dashboard…
          </div>
        </div>
      </CenteredCard>
    );
  }

  // ── Processing ───────────────────────────────────────────────────────────────

  if (pageStatus === "processing") {
    return (
      <CenteredCard>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "rgba(251,191,36,0.12)",
            border: "2px solid rgba(251,191,36,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
              stroke="#FBBF24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <div>
            <h2 style={{
              fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)",
              fontSize: 24, fontWeight: 800, color: "#F0F4FF",
              margin: "0 0 8px", letterSpacing: "-0.02em",
            }}>
              Payment processing
            </h2>
            <p style={{ color: "#4A5980", fontSize: 14, margin: "0 0 4px", lineHeight: 1.6 }}>
              Your payment is being confirmed by your bank. This usually takes a few seconds.
            </p>
          </div>
          <button
            onClick={handleRetry}
            disabled={retrying}
            style={{
              padding: "12px 28px", borderRadius: 10,
              background: "rgba(251,191,36,0.08)",
              border: "1px solid rgba(251,191,36,0.25)",
              color: "#FBBF24", fontSize: 14, fontWeight: 600,
              cursor: retrying ? "not-allowed" : "pointer",
              opacity: retrying ? 0.65 : 1,
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            {retrying && <InlineSpinner color="#FBBF24" />}
            {retrying ? "Checking…" : "Check status"}
          </button>
          <a
            href="/employer/dashboard"
            style={{ fontSize: 13, color: "#4A5980", textDecoration: "underline" }}
          >
            Go to dashboard anyway
          </a>
        </div>
      </CenteredCard>
    );
  }

  // ── Failed ───────────────────────────────────────────────────────────────────

  return (
    <CenteredCard>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "rgba(248,113,113,0.12)",
          border: "2px solid rgba(248,113,113,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
            stroke="#F87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>
          </svg>
        </div>
        <div>
          <h2 style={{
            fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)",
            fontSize: 24, fontWeight: 800, color: "#F0F4FF",
            margin: "0 0 8px", letterSpacing: "-0.02em",
          }}>
            Payment unsuccessful
          </h2>
          <p style={{ color: "#4A5980", fontSize: 14, margin: "0 0 4px", lineHeight: 1.6 }}>
            Your payment could not be completed. Please try a different card or payment method.
          </p>
        </div>
        <a
          href="/employer/subscribe"
          style={{
            padding: "13px 32px", borderRadius: 10,
            background: "linear-gradient(135deg,#6366f1,#4f46e5)",
            color: "#ffffff", fontSize: 14, fontWeight: 700,
            textDecoration: "none",
            boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
          }}
        >
          Try again
        </a>
        <a
          href="/employer/billing"
          style={{ fontSize: 13, color: "#4A5980", textDecoration: "underline" }}
        >
          Go to billing
        </a>
      </div>
    </CenteredCard>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "64px 24px",
      display: "flex", justifyContent: "center",
    }}>
      <div style={{
        width: "100%", maxWidth: 440,
        background: "#0F1C35",
        border: "1px solid #1E3258",
        borderRadius: 20,
        padding: "48px 40px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }}>
        {children}
      </div>
    </div>
  );
}

function BigSpinner({ color }: { color: string }) {
  return (
    <span style={{
      display: "inline-block", width: 36, height: 36,
      border: `3px solid rgba(255,255,255,0.08)`,
      borderTopColor: color,
      borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
    }} />
  );
}

function InlineSpinner({ color }: { color: string }) {
  return (
    <span style={{
      display: "inline-block", width: 13, height: 13,
      border: "2px solid rgba(255,255,255,0.15)",
      borderTopColor: color,
      borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
      flexShrink: 0,
    }} />
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function SubscribeReturnPage() {
  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <Suspense fallback={
        <div style={{ padding: "64px 24px", display: "flex", justifyContent: "center" }}>
          <div style={{
            width: 36, height: 36,
            border: "3px solid rgba(255,255,255,0.08)",
            borderTopColor: "#6366f1",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }} />
        </div>
      }>
        <ReturnContent />
      </Suspense>
    </>
  );
}
