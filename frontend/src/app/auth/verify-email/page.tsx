"use client";
// src/app/auth/verify-email/page.tsx
// Route: /auth/verify-email?email=user@example.com

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authApi } from "@/lib/api-client";

const font = "'Plus Jakarta Sans', system-ui, sans-serif";

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo() {
  return (
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
      <span style={{ fontWeight: 800, fontSize: 18, color: "#fff", letterSpacing: "-0.03em", fontFamily: font }}>
        Direct<span style={{ color: "#0090FF" }}>Hire</span>
      </span>
    </a>
  );
}

// ─── OTP input ────────────────────────────────────────────────────────────────

interface OtpInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  onComplete?: () => void;
  disabled?: boolean;
}

function OtpInput({ value, onChange, onComplete, disabled }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus first box on mount
  useEffect(() => { refs.current[0]?.focus(); }, []);

  const handleChange = (idx: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    const next = [...value];
    next[idx] = digit;
    onChange(next);
    if (digit && idx < 5) {
      refs.current[idx + 1]?.focus();
    } else if (digit && idx === 5 && next.every(d => d !== "")) {
      onComplete?.();
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (value[idx]) {
        const next = [...value];
        next[idx] = "";
        onChange(next);
      } else if (idx > 0) {
        refs.current[idx - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && idx > 0) {
      refs.current[idx - 1]?.focus();
    } else if (e.key === "ArrowRight" && idx < 5) {
      refs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = [...value];
    for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? "";
    onChange(next);
    const focusIdx = Math.min(pasted.length, 5);
    refs.current[focusIdx]?.focus();
    if (pasted.length === 6) onComplete?.();
  };

  return (
    <div className="otp-row" style={{ display: "flex", gap: 12, justifyContent: "center" }}>
      {[0, 1, 2, 3, 4, 5].map((idx) => (
        <input
          className="otp-digit"
          key={idx}
          ref={(el) => { refs.current[idx] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[idx]}
          disabled={disabled}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          style={{
            width: 56,
            height: 64,
            textAlign: "center",
            fontSize: 28,
            fontWeight: 700,
            fontFamily: "'Courier New', Courier, monospace",
            color: value[idx] ? "#ffffff" : "#444",
            background: value[idx] ? "rgba(0,144,255,0.08)" : "#111111",
            border: value[idx] ? "1px solid rgba(0,144,255,0.4)" : "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            outline: "none",
            transition: "border-color 0.15s, background 0.15s",
            cursor: disabled ? "not-allowed" : "text",
            caretColor: "#0090FF",
          }}
        />
      ))}
    </div>
  );
}

// ─── Page content ─────────────────────────────────────────────────────────────

const RESEND_COOLDOWN = 60;

function VerifyEmailOtpContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const email        = searchParams.get("email") ?? "";

  const [digits,    setDigits]    = useState<string[]>(["", "", "", "", "", ""]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState("");
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);

  const code      = digits.join("");
  const allFilled = code.length === 6;

  // Auto-send code on mount so user always has a fresh code when they arrive
  useEffect(() => {
    if (email) {
      authApi.sendVerificationCode(email).catch(console.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Forwarded from /register when the user arrived there with ?redirect=
  // (e.g. a public job page's CTA) — see register/page.tsx's handleSubmit
  // for why this chain intentionally ends at pending-review and isn't
  // chased any further (onboarding + admin verification still stand
  // between here and being able to actually apply to anything).
  const redirectParam = searchParams.get("redirect");
  const isSafeRedirect = !!redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//");

  const handleVerify = useCallback(async () => {
    if (!allFilled || loading) return;
    setError("");
    setLoading(true);
    const res = await authApi.verifyEmailCode(email, code);
    setLoading(false);
    if (res.success) {
      router.push(isSafeRedirect ? `/auth/pending-review?redirect=${encodeURIComponent(redirectParam!)}` : "/auth/pending-review");
    } else {
      setError((res as { error?: string }).error ?? "Verification failed. Please try again.");
    }
  }, [allFilled, loading, email, code, router, isSafeRedirect, redirectParam]);

  // Allow Enter key to submit when all digits filled
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && allFilled && !loading) handleVerify();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [allFilled, loading, handleVerify]);

  const handleResend = async () => {
    if (countdown > 0) return;
    setError("");
    setSuccess("");
    await authApi.sendVerificationCode(email);
    setSuccess("Code resent!");
    setCountdown(RESEND_COOLDOWN);
    setTimeout(() => setSuccess(""), 3000);
    // Clear digits for new code
    setDigits(["", "", "", "", "", ""]);
  };

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .otp-fade { animation: fadeUp 0.4s ease both; }
        input[type="text"]:focus {
          border-color: #0090FF !important;
          box-shadow: 0 0 0 3px rgba(0,144,255,0.15) !important;
        }
        @media (max-width: 600px) {
          .otp-row { gap: 8px !important; }
          .otp-digit { width: 48px !important; height: 56px !important; font-size: 22px !important; }
        }
        @media (max-width: 420px) {
          .otp-row { gap: 6px !important; }
          .otp-digit {
            width: min(48px, calc((100vw - 48px - 30px) / 6)) !important;
            height: 56px !important;
            font-size: 20px !important;
            border-radius: 10px !important;
          }
          .otp-fade > div:last-of-type { padding: 32px 20px !important; border-radius: 16px !important; }
        }
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

        <div className="otp-fade" style={{
          width: "100%",
          maxWidth: 420,
          position: "relative",
          zIndex: 1,
        }}>
          {/* Logo */}
          <div style={{ textAlign: "center" }}>
            <Logo />
          </div>

          {/* Card */}
          <div style={{
            background: "#111111",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 20,
            padding: "40px 36px",
          }}>
            {/* Icon */}
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "rgba(0,144,255,0.1)",
              border: "1px solid rgba(0,144,255,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 24px",
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0090FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>

            {/* Heading */}
            <h1 style={{
              textAlign: "center",
              fontSize: 24,
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: "-0.03em",
              marginBottom: 10,
              fontFamily: font,
            }}>
              Check your email
            </h1>

            {/* Subtext */}
            <p style={{
              textAlign: "center",
              fontSize: 14,
              color: "#71717a",
              lineHeight: 1.65,
              marginBottom: 32,
            }}>
              We sent a 6-digit code to{" "}
              <span style={{ color: "#a1a1aa", fontWeight: 600, wordBreak: "break-all" }}>
                {email || "your email address"}
              </span>
              . Enter it below.
            </p>

            {/* OTP inputs */}
            <div style={{ marginBottom: 24 }}>
              <OtpInput value={digits} onChange={setDigits} onComplete={handleVerify} disabled={loading} />
            </div>

            {/* Error */}
            {error && (
              <div style={{
                marginBottom: 16,
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 10,
                padding: "11px 14px",
                fontSize: 13,
                color: "#f87171",
                textAlign: "center",
                fontFamily: font,
              }}>
                {error}
              </div>
            )}

            {/* Success (resend) */}
            {success && (
              <div style={{
                marginBottom: 16,
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.2)",
                borderRadius: 10,
                padding: "11px 14px",
                fontSize: 13,
                color: "#4ade80",
                textAlign: "center",
                fontFamily: font,
              }}>
                {success}
              </div>
            )}

            {/* Verify button */}
            <button
              type="button"
              onClick={handleVerify}
              disabled={!allFilled || loading}
              style={{
                width: "100%",
                height: 52,
                borderRadius: 12,
                background: allFilled
                  ? "linear-gradient(135deg, #0090FF, #0070cc)"
                  : "rgba(255,255,255,0.04)",
                color: "white",
                fontSize: 16,
                fontWeight: 700,
                border: allFilled ? "none" : "1px solid rgba(255,255,255,0.08)",
                cursor: allFilled && !loading ? "pointer" : "not-allowed",
                opacity: loading ? 0.7 : allFilled ? 1 : 0.5,
                boxShadow: allFilled ? "0 8px 24px rgba(0,144,255,0.25)" : "none",
                transition: "all 0.2s",
                fontFamily: font,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {loading ? (
                <div style={{
                  width: 20, height: 20, borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  animation: "spin 0.7s linear infinite",
                }} />
              ) : (
                <>Verify <span style={{ opacity: 0.7 }}>→</span></>
              )}
            </button>

            {/* Resend */}
            <div style={{ textAlign: "center", marginTop: 20 }}>
              {countdown > 0 ? (
                <span style={{ fontSize: 13, color: "#555", fontFamily: font }}>
                  Resend in <span style={{ color: "#888", fontWeight: 600 }}>{countdown}s</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: 13,
                    color: "#0090FF",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: font,
                    padding: 0,
                  }}
                >
                  Resend code
                </button>
              )}
            </div>
          </div>

          {/* Back to login */}
          <p style={{ textAlign: "center", fontSize: 13, color: "#555", marginTop: 24, fontFamily: font }}>
            Wrong email?{" "}
            <a href="/login" style={{ color: "#0090FF", fontWeight: 600, textDecoration: "none" }}>
              Back to login
            </a>
          </p>
        </div>
      </div>
    </>
  );
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

function Fallback() {
  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        width: 24, height: 24, borderRadius: "50%",
        border: "2px solid rgba(255,255,255,0.1)",
        borderTopColor: "#0090FF",
        animation: "spin 0.7s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function VerifyEmailOtpPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <VerifyEmailOtpContent />
    </Suspense>
  );
}
