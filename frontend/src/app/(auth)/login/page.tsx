"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api-client";

function EyeOpen() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

function LoginPageContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPw,       setShowPw]       = useState(false);
  const [rememberMe,   setRememberMe]   = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "linkedin" | null>(null);
  const [error,        setError]        = useState("");
  const [errorType,    setErrorType]    = useState<"red" | "amber">("red");
  const [errorExtra,   setErrorExtra]   = useState<React.ReactNode>(null);
  const [notice,       setNotice]       = useState("");
  const [noticeType,   setNoticeType]   = useState<"success" | "error">("success");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("session") === "expired")   { setNoticeType("error");   setNotice("Your session expired. Please sign in again."); }
    if (searchParams.get("verified") === "1")        { setNoticeType("success"); setNotice("Email verified! You can now log in."); }
    if (searchParams.get("reset") === "1")           { setNoticeType("success"); setNotice("Password reset successfully. Please log in."); }
    const oauthErr = searchParams.get("error");
    if (oauthErr === "google_failed")   { setNoticeType("error"); setNotice("Google sign-in failed. Please try again."); }
    if (oauthErr === "linkedin_failed") { setNoticeType("error"); setNotice("LinkedIn sign-in failed. Please try again."); }
    if (oauthErr === "invalid_state")   { setNoticeType("error"); setNotice("Sign-in request expired or was tampered with. Please try again."); }
  }, [searchParams]);

  const inputStyle = (name: string): React.CSSProperties => ({
    width: "100%",
    padding: "10px 14px",
    background: "#ffffff",
    border: focusedField === name
      ? "1px solid #0090FF"
      : error && (name === "email" || name === "password")
        ? "1px solid #ef4444"
        : "1px solid #d1d5db",
    borderRadius: 8,
    color: "#111827",
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    boxSizing: "border-box" as const,
    fontFamily: "var(--font-body)",
    boxShadow: focusedField === name ? "0 0 0 3px rgba(0,144,255,0.1)" : "none",
  });

  const handleSubmit = async () => {
    if (!email || !password) { setError("Email and password are required"); setErrorType("red"); setErrorExtra(null); return; }
    setError(""); setErrorExtra(null); setLoading(true);
    const res = await authApi.login({ email, password });
    setLoading(false);
    if (res.success) {
      const d = res.data as { redirectTo?: string };
      router.push(d.redirectTo ?? "/worker/dashboard");
    } else {
      const raw = res as { error?: string; accountStatus?: string };
      const status = raw.accountStatus;
      if (status === "PENDING_EMAIL_VERIFICATION") {
        setErrorType("amber"); setError("Please verify your email first.");
        setErrorExtra(<a href={`/auth/verify-email?email=${encodeURIComponent(email)}`} style={{ display: "inline-block", marginTop: 6, color: "#d97706", fontWeight: 700, textDecoration: "underline", fontSize: 13 }}>Verify your email →</a>);
      } else if (status === "PENDING_REVIEW") {
        setErrorType("amber"); setError("Your account is currently under review. We'll email you when approved."); setErrorExtra(null);
      } else if (status === "REJECTED") {
        setErrorType("red"); setError("Your account application was not approved. Contact support if you believe this is an error."); setErrorExtra(null);
      } else if (status === "SUSPENDED") {
        setErrorType("red"); setError("Your account has been suspended. Contact support."); setErrorExtra(null);
      } else {
        setErrorType("red"); setError(raw.error ?? "Login failed. Please try again."); setErrorExtra(null);
      }
    }
  };

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") handleSubmit(); };

  const handleOAuth = (provider: "google" | "linkedin") => {
    setOauthLoading(provider);
    const nonce    = crypto.randomUUID();
    const redirect = searchParams.get("next") ?? "";
    sessionStorage.setItem("oauth_nonce", nonce);
    const state = btoa(JSON.stringify({ nonce, redirect }));
    window.location.href = `/api/auth/${provider}?state=${encodeURIComponent(state)}`;
  };

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 13, fontWeight: 500,
    color: "#374151", marginBottom: 6, fontFamily: "var(--font-body)",
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
        @keyframes float2 { 0%,100% { transform: translateY(-10px); } 50% { transform: translateY(0px); } }
        .login-left { overflow-y: auto; }
        .login-left::-webkit-scrollbar { width: 4px; }
        .login-left::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 2px; }
        .login-oauth-btn {
          width: 100%; padding: 10px 16px;
          background: #ffffff; border: 1px solid #d1d5db;
          border-radius: 8px; display: flex; align-items: center;
          justify-content: center; gap: 8px;
          color: #374151; font-size: 14px; font-weight: 500;
          cursor: pointer; transition: background 0.15s, border-color 0.15s;
          font-family: var(--font-body);
        }
        .login-oauth-btn:hover:not(:disabled) { background: #f9fafb; border-color: #9ca3af; }
        .login-oauth-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .login-right-panel { display: flex; }
        @media (max-width: 768px) { .login-right-panel { display: none !important; } .login-left { width: 100% !important; } }
        input::placeholder { color: #9ca3af; }
      ` }} />

      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

        {/* ── LEFT COLUMN ─────────────────────────────────────────────────────── */}
        <div className="login-left" style={{
          width: "45%", background: "#f8fafc",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "3rem 2rem",
        }}>
          <div style={{ width: "100%", maxWidth: 400 }}>

            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: "linear-gradient(135deg, #0070CC, #0090FF)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 11, color: "#fff" }}>DH</span>
              </div>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "#0f172a", letterSpacing: "-0.3px" }}>
                DirectHire
              </span>
            </div>

            <div style={{ marginTop: "3rem" }}>
              <h1 style={{
                fontFamily: "var(--font-display)", fontSize: "2rem", fontWeight: 700,
                color: "#0f172a", letterSpacing: "-0.5px", margin: "0 0 8px",
              }}>
                Welcome back
              </h1>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#64748b", margin: 0 }}>
                New to DirectHire?{" "}
                <Link href="/register" style={{ color: "#0090FF", fontWeight: 500, textDecoration: "none" }}>
                  Create an account.
                </Link>
              </p>
            </div>

            {/* Notice banner */}
            {notice && (
              <div style={{
                marginTop: "1.25rem",
                background: noticeType === "success" ? "#f0fdf4" : "#fef2f2",
                border: noticeType === "success" ? "1px solid #bbf7d0" : "1px solid #fecaca",
                borderRadius: 8, padding: "10px 14px",
                fontSize: 13, lineHeight: 1.5,
                color: noticeType === "success" ? "#166534" : "#dc2626",
                fontFamily: "var(--font-body)",
              }}>
                {notice}
              </div>
            )}

            {/* Form */}
            <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Email */}
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={handleKey}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  style={inputStyle("email")}
                />
              </div>

              {/* Password */}
              <div>
                <label style={labelStyle}>Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPw ? "text" : "password"} value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={handleKey}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    style={{ ...inputStyle("password"), paddingRight: 44 }}
                  />
                  <button type="button" onClick={() => setShowPw(s => !s)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    style={{
                      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer", color: "#9ca3af",
                      display: "flex", alignItems: "center", padding: 4, transition: "color 0.15s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#6b7280"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af"; }}
                  >
                    {showPw ? <EyeOff /> : <EyeOpen />}
                  </button>
                </div>
              </div>

              {/* Remember me + Forgot password */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <div
                    onClick={() => setRememberMe(s => !s)}
                    style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      border: rememberMe ? "1px solid #0090FF" : "1px solid #d1d5db",
                      background: rememberMe ? "#0090FF" : "#ffffff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    {rememberMe && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </div>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#374151" }}>Remember for 30 days</span>
                </label>
                <Link href="/forgot-password" style={{
                  fontFamily: "var(--font-body)", fontSize: 13, color: "#0090FF", textDecoration: "none", fontWeight: 500,
                }}>
                  Forgot password?
                </Link>
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  background: errorType === "amber" ? "#fffbeb" : "#fef2f2",
                  border: errorType === "amber" ? "1px solid #fde68a" : "1px solid #fecaca",
                  borderRadius: 8, padding: "10px 14px",
                  fontSize: 13, lineHeight: 1.5,
                  color: errorType === "amber" ? "#92400e" : "#dc2626",
                  fontFamily: "var(--font-body)",
                }}>
                  {error}{errorExtra}
                </div>
              )}

              {/* Sign in button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  width: "100%", padding: "11px",
                  background: "#0090FF", border: "none", borderRadius: 8,
                  color: "#fff", fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.8 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  transition: "filter 0.15s",
                  marginTop: 4,
                }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.1)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1)"; }}
              >
                {loading
                  ? <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite" }} />
                  : "Sign in"
                }
              </button>

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
                <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#9ca3af", whiteSpace: "nowrap" }}>or</span>
                <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
              </div>

              {/* OAuth buttons */}
              <button type="button" className="login-oauth-btn" onClick={() => handleOAuth("google")} disabled={!!oauthLoading || loading}>
                {oauthLoading === "google"
                  ? <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid #d1d5db", borderTopColor: "#4285F4", animation: "spin 0.7s linear infinite" }} />
                  : <GoogleIcon />
                }
                Sign in with Google
              </button>
              <button type="button" className="login-oauth-btn" onClick={() => handleOAuth("linkedin")} disabled={!!oauthLoading || loading}>
                {oauthLoading === "linkedin"
                  ? <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid #d1d5db", borderTopColor: "#0A66C2", animation: "spin 0.7s linear infinite" }} />
                  : <LinkedInIcon />
                }
                Sign in with LinkedIn
              </button>
            </div>

            {/* Terms */}
            <p style={{
              textAlign: "center", marginTop: "1.5rem",
              fontSize: 12, color: "#9ca3af", fontFamily: "var(--font-body)", lineHeight: 1.6,
            }}>
              By signing in you agree to our{" "}
              <Link href="/terms" style={{ color: "#64748b", textDecoration: "underline" }}>Terms</Link>
              {" "}and{" "}
              <Link href="/privacy" style={{ color: "#64748b", textDecoration: "underline" }}>Privacy Policy</Link>
            </p>

          </div>
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────────────── */}
        <div className="login-right-panel" style={{
          width: "55%",
          background: "linear-gradient(145deg, #0a0a1a 0%, #0d1b3e 40%, #1a0a3e 100%)",
          position: "relative",
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {/* Blurred ellipses */}
          <div aria-hidden style={{ position: "absolute", top: -100, right: -100, width: 600, height: 400, borderRadius: "50%", background: "rgba(0,144,255,0.3)", filter: "blur(60px)", opacity: 0.4, transform: "rotate(-20deg)", pointerEvents: "none" }} />
          <div aria-hidden style={{ position: "absolute", bottom: -150, left: -50, width: 500, height: 500, borderRadius: "50%", background: "rgba(79,70,229,0.25)", filter: "blur(60px)", opacity: 0.4, pointerEvents: "none" }} />
          <div aria-hidden style={{ position: "absolute", top: "40%", right: "5%", width: 300, height: 300, borderRadius: "50%", background: "rgba(0,200,255,0.15)", filter: "blur(60px)", opacity: 0.4, pointerEvents: "none" }} />

          {/* Grid overlay */}
          <div aria-hidden style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }} />

          {/* Floating card 1 — Platform Stats */}
          <div style={{
            position: "absolute", top: "15%", left: "8%",
            background: "#ffffff", borderRadius: 16,
            padding: "1.25rem 1.5rem", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            minWidth: 200,
            animation: "float 4s ease-in-out infinite",
          }}>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Active Workers</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, color: "#111827", lineHeight: 1 }}>2.4M+</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#10b981", marginTop: 6 }}>↑ 12.5% this month</div>
            <div style={{
              marginTop: 12, width: 48, height: 48,
              borderRadius: "50%",
              border: "4px solid #0090FF",
              borderRightColor: "transparent",
              display: "inline-block",
              transform: "rotate(-45deg)",
            }} />
          </div>

          {/* Floating card 2 — Jobs Matched */}
          <div style={{
            position: "absolute", top: "42%", right: "6%",
            background: "#ffffff", borderRadius: 16,
            padding: "1.25rem 1.5rem", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            minWidth: 210,
            animation: "float2 4s ease-in-out infinite",
            animationDelay: "2s",
          }}>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Jobs Matched</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, color: "#111827", lineHeight: 1 }}>847K</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#10b981", marginTop: 4 }}>↑ +3.89% this week</div>
            {/* Mini bar chart */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginTop: 12, height: 32 }}>
              {[0.45, 0.65, 0.5, 0.8, 1].map((h, i) => (
                <div key={i} style={{
                  flex: 1, borderRadius: 3,
                  background: `rgba(0,144,255,${0.4 + h * 0.6})`,
                  height: `${h * 100}%`,
                }} />
              ))}
            </div>
          </div>

          {/* Card 3 — Countries */}
          <div style={{
            position: "absolute", bottom: "12%", left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 16, padding: "1.5rem 2rem",
            maxWidth: 340, width: "max-content",
            textAlign: "center",
          }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
              190+ Countries Connected
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
              AI-powered matching across every timezone
            </div>
          </div>

          {/* Dot indicators */}
          <div style={{
            position: "absolute", bottom: "1.5rem", left: "50%", transform: "translateX(-50%)",
            display: "flex", gap: 6,
          }}>
            {[true, false, false, false].map((active, i) => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: "50%",
                background: active ? "#fff" : "rgba(255,255,255,0.3)",
              }} />
            ))}
          </div>
        </div>

      </div>
    </>
  );
}

function LoginFallback() {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid #e5e7eb", borderTopColor: "#0090FF", animation: "spin 0.7s linear infinite" }} />
      <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } }` }} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
