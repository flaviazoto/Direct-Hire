"use client";
// src/app/(auth)/forgot-password/page.tsx

import { useState } from "react";
import Link from "next/link";
import { authApi } from "@/lib/api-client";

// ─── Design tokens ────────────────────────────────────────────────────────────

const font = "'Plus Jakarta Sans', system-ui, sans-serif";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#a1a1aa",
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
    width: "100%",
    background: "#111111",
    border: focusedField === name ? "1px solid #0090FF" : "1px solid rgba(255,255,255,0.08)",
    boxShadow: focusedField === name ? "0 0 0 3px rgba(0,144,255,0.12)" : "none",
    borderRadius: 10,
    padding: "11px 14px",
    fontSize: 14,
    color: "#ffffff",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
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
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh", background: "#0A0A0A", fontFamily: font }}>

        {/* ── Left panel ── */}
        <div
          className="auth-left"
          style={{
            width: "45%",
            minHeight: "100vh",
            flexShrink: 0,
            background: "linear-gradient(135deg, #080808 0%, #0d0d0d 100%)",
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
          <div aria-hidden style={{
            position: "absolute", top: -120, right: -120,
            width: 500, height: 500, borderRadius: "50%",
            background: "rgba(0,144,255,0.07)",
            filter: "blur(120px)", pointerEvents: "none",
          }} />
          <div aria-hidden style={{
            position: "absolute", bottom: -120, left: -120,
            width: 400, height: 400, borderRadius: "50%",
            background: "rgba(124,58,237,0.06)",
            filter: "blur(100px)", pointerEvents: "none",
          }} />

          {/* Top: Logo + heading + features */}
          <div style={{ position: "relative", zIndex: 1 }}>
            {/* Logo */}
            <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", marginBottom: 64 }}>
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

            {/* Heading */}
            <div style={{ fontSize: 40, fontWeight: 800, color: "white", letterSpacing: "-0.04em", lineHeight: 1.1, marginBottom: 16 }}>
              Reset your<br />password.
            </div>
            <p style={{ fontSize: 16, color: "#71717a", lineHeight: 1.6, marginBottom: 36 }}>
              We&apos;ll send a secure link to your inbox.
            </p>

            {/* Features */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {FEATURES.map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: "rgba(0,144,255,0.15)",
                    border: "1px solid rgba(0,144,255,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 10, color: "#0090FF" }}>✓</span>
                  </div>
                  <span style={{ fontSize: 14, color: "#888" }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom: Security note */}
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              padding: "20px 24px",
            }}>
              <div style={{ fontSize: 24, color: "rgba(0,144,255,0.5)", lineHeight: 1, marginBottom: 12 }}>❝</div>
              <p style={{ fontSize: 14, color: "#a1a1aa", lineHeight: 1.7, fontStyle: "italic", marginBottom: 16 }}>
                &quot;Within two weeks I had three interview requests. The AI matched me perfectly.&quot;
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "linear-gradient(135deg, #0090FF, #7C3AED)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700, color: "white",
                }}>A</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>Ana Koci</div>
                  <div style={{ fontSize: 11, color: "#555" }}>Senior Nurse · Albania → Germany</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right form panel ── */}
        <div style={{
          flex: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "40px 32px",
          background: "#0A0A0A",
        }}>
          <div className="auth-fade" style={{ width: "100%", maxWidth: 420 }}>

            {/* Mobile logo */}
            <div className="auth-mobile-logo" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: "linear-gradient(135deg, #0090FF, #0070cc)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white" />
                  <path d="M2 17l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M2 12l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" opacity="0.5" />
                </svg>
              </div>
              <span style={{ fontFamily: font, fontWeight: 800, fontSize: 17, color: "#fff", letterSpacing: "-0.03em" }}>
                Direct<span style={{ color: "#0090FF" }}>Hire</span>
              </span>
            </div>

            {sent ? (
              /* ── Success state ── */
              <div style={{ textAlign: "center" }}>
                {/* Large envelope icon in blue circle */}
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
                <h2 style={{
                  fontFamily: font, fontSize: 24, fontWeight: 800, color: "#fff",
                  letterSpacing: "-0.03em", marginBottom: 10,
                }}>
                  Check your email
                </h2>
                <p style={{ fontSize: 14, color: "#71717a", lineHeight: 1.65, marginBottom: 28, maxWidth: 320, margin: "0 auto 28px" }}>
                  We sent a reset link to{" "}
                  <strong style={{ color: "rgba(255,255,255,0.7)" }}>{email}</strong>.
                  Check your spam folder if it doesn&apos;t arrive.
                </p>
                <Link
                  href="/login"
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "13px 20px",
                    borderRadius: 12,
                    background: "linear-gradient(135deg, #0090FF, #0070cc)",
                    color: "white",
                    fontSize: 15,
                    fontWeight: 700,
                    textDecoration: "none",
                    textAlign: "center",
                    boxShadow: "0 8px 24px rgba(0,144,255,0.3)",
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
                  <p style={{ fontSize: 14, color: "#71717a" }}>
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
                      style={inp("email")}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    style={{
                      width: "100%",
                      padding: "13px 20px",
                      borderRadius: 12,
                      background: "linear-gradient(135deg, #0090FF, #0070cc)",
                      color: "white",
                      fontSize: 15,
                      fontWeight: 700,
                      border: "none",
                      cursor: loading ? "not-allowed" : "pointer",
                      boxShadow: "0 8px 24px rgba(0,144,255,0.3)",
                      fontFamily: font,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      opacity: loading ? 0.7 : 1,
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

                <p style={{ textAlign: "center", fontSize: 14, color: "#71717a", marginTop: 24, fontFamily: font }}>
                  Remember it?{" "}
                  <Link href="/login" style={{ color: "#0090FF", fontWeight: 600, textDecoration: "none" }}>
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
