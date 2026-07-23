"use client";
// src/app/(auth)/forgot-password/page.tsx

import { useState } from "react";
import Link from "next/link";
import { authApi } from "@/lib/api-client";

// ─── Design tokens ────────────────────────────────────────────────────────────
// Uses the currently-loaded UI font (var(--font-body) → Inter, via next/font
// in layout.tsx) rather than the previous 'Plus Jakarta Sans' reference,
// which was never actually loaded and silently fell back to system-ui.

const font = "var(--font-body)";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 500,
  color: "#cbd5e1",
  marginBottom: 6,
  letterSpacing: "0.01em",
  fontFamily: font,
};

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  "Secure link sent to your email",
  "Link expires in 30 minutes",
  "No account access needed",
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ForgotPasswordPage() {
  const [email,        setEmail]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [sent,         setSent]         = useState(false);
  const [error,        setError]        = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const inp = (name: string): React.CSSProperties => ({
    minHeight: 48,
    border: focusedField === name ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.1)",
    boxShadow: focusedField === name ? "0 0 0 3px rgba(99,102,241,0.15)" : "none",
    padding: "12px 14px",
    fontSize: 16,
    outline: "none",
    boxSizing: "border-box" as const,
    fontFamily: font,
  });

  const handleSubmit = async () => {
    if (!email || !/\S+@\S+\.\S+/.test(email)) { setError("Enter a valid email address"); return; }
    setError("");
    setLoading(true);
    const res = await authApi.forgotPassword({ email });
    setLoading(false);
    if (res.success) setSent(true);
    else setError(res.error ?? "Unable to send reset link right now");
  };

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .auth-fade { animation: fadeUp 0.45s ease both; }
        @media (max-width: 768px) { .auth-left { display: none !important; } }
        @media (min-width: 769px) { .auth-mobile-logo { display: none !important; } }
        @media (max-width: 640px) { .auth-form-panel { padding: 32px 24px !important; } }
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh", background: "var(--glass-base)", fontFamily: font }}>

        {/* ── Left panel ── */}
        <div
          className="auth-left"
          style={{
            width: "45%",
            minHeight: "100vh",
            flexShrink: 0,
            background: "var(--glass-base)",
            borderRight: "1px solid rgba(255,255,255,0.06)",
            position: "relative",
            overflow: "hidden",
            padding: "56px 52px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          {/* Gradient orbs */}
          <div aria-hidden className="glass-glow" style={{ top: -120, right: -120, width: 500, height: 500, background: "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)" }} />
          <div aria-hidden className="glass-glow" style={{ bottom: -120, left: -120, width: 400, height: 400, background: "radial-gradient(circle, rgba(147,51,234,0.08) 0%, transparent 70%)" }} />

          {/* Top: Logo + heading + features */}
          <div style={{ position: "relative", zIndex: 1 }}>
            {/* Logo */}
            <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", marginBottom: 64 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "linear-gradient(135deg, var(--glass-indigo), var(--glass-purple))",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white" opacity="0.95" />
                  <path d="M2 17l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M2 12l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" opacity="0.55" />
                </svg>
              </div>
              <span style={{ fontWeight: 800, fontSize: 18, color: "#fff", letterSpacing: "-0.03em", fontFamily: font }}>
                Direct<span style={{ color: "#818cf8" }}>Hire</span>
              </span>
            </a>

            {/* Heading */}
            <div style={{ fontSize: 40, fontWeight: 800, color: "white", letterSpacing: "-0.04em", lineHeight: 1.1, marginBottom: 16 }}>
              Reset your<br />password.
            </div>
            <p style={{ fontSize: 16, color: "#94a3b8", lineHeight: 1.6, marginBottom: 36 }}>
              We&apos;ll send a secure link to your inbox.
            </p>

            {/* Features */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {FEATURES.map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: "rgba(99,102,241,0.15)",
                    border: "1px solid rgba(99,102,241,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 10, color: "#818cf8" }}>✓</span>
                  </div>
                  <span style={{ fontSize: 14, color: "#94a3b8" }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom: Security note — page-level panel, blur is fine here (not a scrolling list) */}
          <div style={{ position: "relative", zIndex: 1 }}>
            <div className="glass-card" style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: 24, color: "rgba(99,102,241,0.5)", lineHeight: 1, marginBottom: 12 }}>❝</div>
              <p style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.7, fontStyle: "italic", marginBottom: 16 }}>
                &quot;Within two weeks I had three interview requests. The AI matched me perfectly.&quot;
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "linear-gradient(135deg, var(--glass-indigo), var(--glass-purple))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700, color: "white",
                }}>A</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>Ana Koci</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Senior Nurse · Albania → Germany</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right form panel ── */}
        <div className="auth-form-panel" style={{
          flex: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "40px 32px",
          background: "var(--glass-base)",
        }}>
          <div className="auth-fade" style={{ width: "100%", maxWidth: 440 }}>

            {/* Mobile logo */}
            <div className="auth-mobile-logo" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: "linear-gradient(135deg, var(--glass-indigo), var(--glass-purple))",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white" />
                  <path d="M2 17l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M2 12l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" opacity="0.5" />
                </svg>
              </div>
              <span style={{ fontFamily: font, fontWeight: 800, fontSize: 17, color: "#fff", letterSpacing: "-0.03em" }}>
                Direct<span style={{ color: "#818cf8" }}>Hire</span>
              </span>
            </div>

            {sent ? (
              /* ── Success state ── */
              <div style={{ textAlign: "center" }}>
                {/* Large envelope icon in indigo circle */}
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: "rgba(99,102,241,0.1)",
                  border: "1px solid rgba(99,102,241,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 24px",
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <h2 style={{
                  fontFamily: font, fontSize: 24, fontWeight: 800, color: "#fff",
                  letterSpacing: "-0.03em", marginBottom: 10,
                }}>
                  Check your email
                </h2>
                <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.65, marginBottom: 28, maxWidth: 320, margin: "0 auto 28px" }}>
                  We sent a reset link to{" "}
                  <strong style={{ color: "#cbd5e1" }}>{email}</strong>.
                  Check your spam folder if it doesn&apos;t arrive.
                </p>
                <Link
                  href="/login"
                  className="btn-gradient"
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "13px 20px",
                    fontSize: 15,
                    textDecoration: "none",
                    textAlign: "center",
                    fontFamily: font,
                  }}
                >
                  Back to Login
                </Link>
              </div>
            ) : (
              /* ── Form state ── */
              <>
                <div style={{ marginBottom: 28 }}>
                  <h1 style={{
                    fontFamily: font, fontSize: 26, fontWeight: 800,
                    color: "#ffffff", letterSpacing: "-0.03em", marginBottom: 6,
                  }}>
                    Reset your password
                  </h1>
                  <p style={{ fontSize: 14, color: "#94a3b8" }}>
                    Enter your email and we&apos;ll send you a reset link.
                  </p>
                </div>

                {error && (
                  <div style={{
                    marginBottom: 16,
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    borderRadius: 10,
                    padding: "12px 16px",
                    fontSize: 13,
                    color: "#f87171",
                    fontFamily: font,
                  }}>
                    {error}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Email address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                      onFocus={() => setFocusedField("email")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      className="input-glass"
                      style={inp("email")}
                    />
                  </div>

                  <button
                    type="button"
                    className="btn-gradient"
                    onClick={handleSubmit}
                    disabled={loading}
                    style={{
                      width: "100%",
                      height: 52,
                      fontSize: 16,
                      fontFamily: font,
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
                      <>Send Reset Link <span style={{ opacity: 0.7 }}>→</span></>
                    )}
                  </button>
                </div>

                <p style={{ textAlign: "center", fontSize: 14, color: "#94a3b8", marginTop: 24, fontFamily: font }}>
                  Remember it?{" "}
                  <Link href="/login" style={{ color: "#818cf8", fontWeight: 600, textDecoration: "none" }}>
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
