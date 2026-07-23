"use client";
// src/app/(auth)/reset-password/page.tsx

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

// ─── Password strength ────────────────────────────────────────────────────────

interface StrengthResult {
  score: number;
  label: string;
  color: string;
}

function getPasswordStrength(pw: string): StrengthResult {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8)            score++;
  if (pw.length >= 12)           score++;
  if (/[A-Z]/.test(pw))         score++;
  if (/[0-9]/.test(pw))         score++;
  if (/[^A-Za-z0-9]/.test(pw))  score++;
  if (score <= 1) return { score, label: "Weak",   color: "#f87171" };
  if (score <= 2) return { score, label: "Fair",   color: "#fbbf24" };
  if (score <= 3) return { score, label: "Good",   color: "#818cf8" };
  return              { score, label: "Strong", color: "#4ade80" };
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

function EyeOpen() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  "Use 8+ characters",
  "Mix letters & numbers",
  "Avoid common passwords",
];

// ─── Main content ─────────────────────────────────────────────────────────────

function ResetPasswordPageContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get("token") ?? "";

  const [password,     setPassword]     = useState("");
  const [confirm,      setConfirm]      = useState("");
  const [showPw,       setShowPw]       = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [success,      setSuccess]      = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const strength = getPasswordStrength(password);

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
    if (!token)                     { setError("Invalid reset link"); return; }
    if (password.length < 8)        { setError("Minimum 8 characters"); return; }
    if (!/[A-Z]/.test(password))    { setError("Must include an uppercase letter"); return; }
    if (!/[0-9]/.test(password))    { setError("Must include a number"); return; }
    if (password !== confirm)       { setError("Passwords do not match"); return; }
    setError("");
    setLoading(true);
    const res = await authApi.resetPassword({ token, password, confirmPassword: confirm });
    setLoading(false);
    if (res.success) {
      setSuccess(true);
      setTimeout(() => router.push("/login?reset=1"), 2000);
    } else {
      setError(res.error ?? "Password reset failed. Please try again.");
    }
  };

  // Invalid token state
  if (!token) {
    return (
      <>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{
          minHeight: "100vh", background: "var(--glass-base)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: font, padding: 32,
        }}>
          <div style={{ textAlign: "center", maxWidth: 360 }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 24px",
            }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 10 }}>
              Invalid Reset Link
            </h2>
            <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: 28, lineHeight: 1.6 }}>
              This link is invalid or has expired. Please request a new one.
            </p>
            <Link href="/forgot-password" className="btn-gradient" style={{
              display: "inline-block",
              padding: "12px 28px",
              fontSize: 14,
              textDecoration: "none",
            }}>
              Request a new link →
            </Link>
          </div>
        </div>
      </>
    );
  }

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
              Create a new<br />password.
            </div>
            <p style={{ fontSize: 16, color: "#94a3b8", lineHeight: 1.6, marginBottom: 36 }}>
              Choose a strong, unique password to keep your account secure.
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

          {/* Bottom: Testimonial — page-level panel, blur is fine here (not a scrolling list) */}
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

            {success ? (
              /* ── Success state ── */
              <div style={{ textAlign: "center" }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: "rgba(34,197,94,0.1)",
                  border: "1px solid rgba(34,197,94,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 24px",
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h2 style={{
                  fontFamily: font, fontSize: 24, fontWeight: 800, color: "#fff",
                  letterSpacing: "-0.03em", marginBottom: 10,
                }}>
                  Password updated!
                </h2>
                <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.65, marginBottom: 28 }}>
                  Your password has been changed. Redirecting you to login…
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
                  Go to Login
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
                    Set new password
                  </h1>
                  <p style={{ fontSize: 14, color: "#94a3b8" }}>
                    Choose a strong password for your account.
                  </p>
                </div>

                {/* Error */}
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

                {/* Form fields */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                  {/* New password */}
                  <div>
                    <label style={labelStyle}>New password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPw ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onFocus={() => setFocusedField("password")}
                        onBlur={() => setFocusedField(null)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className="input-glass"
                        style={{ ...inp("password"), paddingRight: 44 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((s) => !s)}
                        aria-label={showPw ? "Hide password" : "Show password"}
                        style={{
                          position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                          background: "none", border: "none", cursor: "pointer",
                          color: "#94a3b8", display: "flex", alignItems: "center", padding: 4,
                        }}
                      >
                        {showPw ? <EyeOff /> : <EyeOpen />}
                      </button>
                    </div>
                    <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, fontFamily: font }}>
                      Min 8 chars · uppercase · number
                    </p>

                    {/* Strength meter */}
                    {password && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                          {[1, 2, 3, 4].map((i) => (
                            <div
                              key={i}
                              style={{
                                flex: 1, height: 4, borderRadius: 999,
                                transition: "background 0.3s",
                                background: i <= strength.score ? strength.color : "rgba(255,255,255,0.1)",
                              }}
                            />
                          ))}
                        </div>
                        {strength.label && (
                          <p style={{ fontSize: 12, fontWeight: 600, color: strength.color, fontFamily: font }}>
                            {strength.label} password
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Confirm password */}
                  <div>
                    <label style={labelStyle}>Confirm password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showConfirm ? "text" : "password"}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        onFocus={() => setFocusedField("confirm")}
                        onBlur={() => setFocusedField(null)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className="input-glass"
                        style={{ ...inp("confirm"), paddingRight: 44 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((s) => !s)}
                        aria-label={showConfirm ? "Hide password" : "Show password"}
                        style={{
                          position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                          background: "none", border: "none", cursor: "pointer",
                          color: "#94a3b8", display: "flex", alignItems: "center", padding: 4,
                        }}
                      >
                        {showConfirm ? <EyeOff /> : <EyeOpen />}
                      </button>
                    </div>
                  </div>

                  {/* Submit */}
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
                      marginTop: 8,
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
                      <>Set New Password <span style={{ opacity: 0.7 }}>→</span></>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

function ResetPasswordFallback() {
  return (
    <div style={{
      minHeight: "100vh", background: "var(--glass-base)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: "50%",
        border: "2px solid rgba(255,255,255,0.1)",
        borderTopColor: "#6366F1",
        animation: "spin 0.7s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}
