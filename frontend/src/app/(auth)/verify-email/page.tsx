"use client";
// frontend/src/app/(auth)/verify-email/page.tsx

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api-client";

const font = "'Plus Jakarta Sans', system-ui, sans-serif";

// ─── Icons ────────────────────────────────────────────────────────────────────

function EnvelopeIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0090FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

// ─── Page content ─────────────────────────────────────────────────────────────

function VerifyEmailPageContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get("token") ?? "";

  const [status,  setStatus]  = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token found.");
      return;
    }
    authApi.verifyEmail(token).then((res) => {
      if (res.success) {
        setStatus("success");
        setTimeout(() => router.push("/login?verified=1"), 2500);
      } else {
        setStatus("error");
        setMessage((res as { error?: string }).error ?? "Verification failed.");
      }
    });
  }, [token, router]);

  const isLoading = status === "loading";
  const isSuccess = status === "success";
  const isError   = status === "error";

  const iconBg = isLoading
    ? "rgba(0,144,255,0.1)"
    : isSuccess
      ? "rgba(34,197,94,0.1)"
      : "rgba(239,68,68,0.1)";

  const iconBorder = isLoading
    ? "rgba(0,144,255,0.25)"
    : isSuccess
      ? "rgba(34,197,94,0.25)"
      : "rgba(239,68,68,0.25)";

  const heading = isLoading
    ? "Verifying your email…"
    : isSuccess
      ? "Email verified!"
      : "Verification failed";

  const description = isLoading
    ? "Please wait a moment while we confirm your email address."
    : isSuccess
      ? "Your email has been verified. Redirecting you to login…"
      : message;

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .verify-fade { animation: fadeUp 0.4s ease both; }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: "#0A0A0A",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: font,
        padding: "40px 20px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Background orbs */}
        <div aria-hidden style={{
          position: "absolute", top: -200, right: -200,
          width: 600, height: 600, borderRadius: "50%",
          background: "rgba(0,144,255,0.04)",
          filter: "blur(140px)", pointerEvents: "none",
        }} />
        <div aria-hidden style={{
          position: "absolute", bottom: -200, left: -200,
          width: 500, height: 500, borderRadius: "50%",
          background: "rgba(124,58,237,0.04)",
          filter: "blur(120px)", pointerEvents: "none",
        }} />

        <div className="verify-fade" style={{ width: "100%", maxWidth: 400, textAlign: "center", position: "relative", zIndex: 1 }}>

          {/* Logo */}
          <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", marginBottom: 48 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #0090FF, #0070cc)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 16px rgba(0,144,255,0.35)",
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white" opacity="0.95" />
                <path d="M2 17l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M2 12l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" opacity="0.55" />
              </svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: 18, color: "#fff", letterSpacing: "-0.03em" }}>
              Direct<span style={{ color: "#0090FF" }}>Hire</span>
            </span>
          </a>

          {/* Icon circle */}
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: iconBg,
            border: `1px solid ${iconBorder}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 28px",
          }}>
            {isLoading ? (
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                border: "2.5px solid rgba(0,144,255,0.2)",
                borderTopColor: "#0090FF",
                animation: "spin 0.8s linear infinite",
              }} />
            ) : isSuccess ? (
              <CheckCircleIcon />
            ) : (
              <AlertIcon />
            )}
          </div>

          {/* Heading */}
          <h1 style={{
            fontSize: 26,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "-0.03em",
            marginBottom: 12,
            fontFamily: font,
          }}>
            {heading}
          </h1>

          {/* Description */}
          <p style={{
            fontSize: 15,
            color: "#71717a",
            lineHeight: 1.65,
            marginBottom: 36,
            maxWidth: 320,
            margin: "0 auto 36px",
          }}>
            {description}
          </p>

          {/* Actions — shown when not loading */}
          {!isLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
              <Link
                href="/login"
                style={{
                  display: "inline-block",
                  width: "100%",
                  padding: "13px 20px",
                  borderRadius: 12,
                  background: isSuccess
                    ? "linear-gradient(135deg, #0090FF, #0070cc)"
                    : "rgba(255,255,255,0.04)",
                  border: isSuccess
                    ? "none"
                    : "1px solid rgba(255,255,255,0.08)",
                  color: "white",
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: "none",
                  textAlign: "center",
                  boxShadow: isSuccess ? "0 8px 24px rgba(0,144,255,0.3)" : "none",
                  fontFamily: font,
                  boxSizing: "border-box",
                }}
              >
                Go to Login →
              </Link>

              {isError && (
                <Link
                  href="/register"
                  style={{
                    fontSize: 14,
                    color: "#0090FF",
                    textDecoration: "none",
                    fontWeight: 600,
                    fontFamily: font,
                  }}
                >
                  Create a new account
                </Link>
              )}
            </div>
          )}

          {/* Loading: also show envelope hint */}
          {isLoading && (
            <div style={{ marginTop: 24 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 56, height: 56, borderRadius: 16,
                background: "rgba(0,144,255,0.08)",
                border: "1px solid rgba(0,144,255,0.15)",
              }}>
                <EnvelopeIcon />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

function VerifyEmailFallback() {
  return (
    <div style={{
      minHeight: "100vh", background: "#0A0A0A",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        border: "2px solid rgba(255,255,255,0.1)",
        borderTopColor: "#0090FF",
        animation: "spin 0.7s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailFallback />}>
      <VerifyEmailPageContent />
    </Suspense>
  );
}
