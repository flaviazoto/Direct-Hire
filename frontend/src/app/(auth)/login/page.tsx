"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";

function EyeOpen() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
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

function LoginPageContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { refresh }  = useAuth();

  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % 3);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const SLIDES = [
    {
      tag: "GLOBAL REACH",
      headline: "Hire from\n190+ Countries",
      metric: "2.4M+",
      metricLabel: "Verified Workers",
      body: "Our AI matches verified global talent with employers across every timezone — instantly.",
      accentColor: "#0090FF",
      secondaryColor: "#6366F1",
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      ),
      stats: [
        { label: "Countries", value: "190+" },
        { label: "Placements/mo", value: "1,400+" },
      ],
    },
    {
      tag: "AI POWERED",
      headline: "Matched in\nMinutes, Not Weeks",
      metric: "92%",
      metricLabel: "Avg Match Score",
      body: "Five-dimension AI scoring finds your perfect candidate before your coffee gets cold.",
      accentColor: "#818cf8",
      secondaryColor: "#0090FF",
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      ),
      stats: [
        { label: "Avg match time", value: "< 24h" },
        { label: "Active jobs", value: "847K" },
      ],
    },
    {
      tag: "TRUSTED PLATFORM",
      headline: "Fraud-Free\nGlobal Hiring",
      metric: "99.2%",
      metricLabel: "Verified Profiles",
      body: "Every profile is AI-screened for authenticity, so you hire with complete confidence.",
      accentColor: "#10d9b5",
      secondaryColor: "#0090FF",
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <polyline points="9 12 11 14 15 10"/>
        </svg>
      ),
      stats: [
        { label: "Fraud rate", value: "< 0.1%" },
        { label: "Profile checks", value: "50+" },
      ],
    },
  ];

  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPw,       setShowPw]       = useState(false);
  const [rememberMe,   setRememberMe]   = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | null>(null);
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
    if (oauthErr === "invalid_state")   { setNoticeType("error"); setNotice("Sign-in request expired or was tampered with. Please try again."); }
  }, [searchParams]);

  const inputStyle = (name: string): React.CSSProperties => ({
    width: "100%",
    padding: "12px 14px",
    minHeight: 48,
    background: "#ffffff",
    border: focusedField === name
      ? "1px solid #0090FF"
      : error && (name === "email" || name === "password")
        ? "1px solid #ef4444"
        : "1px solid #d1d5db",
    borderRadius: 8,
    color: "#111827",
    fontSize: 16,
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
      const d = res.data as { redirectTo?: string; accessToken?: string; token?: string; role?: string; user?: { role?: string } };
      const tok = d.accessToken ?? d.token;
      if (tok) {
        localStorage.setItem("dh_token", tok);
        localStorage.setItem("dh_role", d.role ?? d.user?.role ?? "");
      }
      await refresh();
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

  const handleOAuth = (provider: "google") => {
    setOauthLoading(provider);
    const nonce    = crypto.randomUUID();
    const redirect = searchParams.get("next") ?? "";
    sessionStorage.setItem("oauth_nonce", nonce);
    const state = btoa(JSON.stringify({ nonce, redirect }));
    window.location.href = `/api/auth/${provider}?state=${encodeURIComponent(state)}`;
  };

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 14, fontWeight: 500,
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
          width: 100%; min-height: 48px; padding: 10px 16px;
          background: #ffffff; border: 1px solid #d1d5db;
          border-radius: 8px; display: flex; align-items: center;
          justify-content: center; gap: 8px;
          color: #374151; font-size: 16px; font-weight: 500;
          cursor: pointer; transition: background 0.15s, border-color 0.15s;
          font-family: var(--font-body);
        }
        .login-oauth-btn:hover:not(:disabled) { background: #f9fafb; border-color: #9ca3af; }
        .login-oauth-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .login-right-panel { display: flex; }
        @media (max-width: 768px) {
          .login-shell { min-height: 100dvh !important; height: auto !important; overflow: visible !important; }
          .login-right-panel { display: none !important; }
          .login-left { width: 100% !important; min-height: 100dvh !important; align-items: flex-start !important; padding: 32px 24px !important; }
          .login-left > div { max-width: 440px !important; margin: 0 auto !important; }
        }
        input::placeholder { color: #9ca3af; }
      ` }} />

      <div className="login-shell" style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

        {/* ── LEFT COLUMN ─────────────────────────────────────────────────────── */}
        <div className="login-left" style={{
          width: "45%", background: "#05080f",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "3rem 2rem",
        }}>
          <div style={{ width: "100%", maxWidth: 440 }}>

            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: "linear-gradient(135deg, #0070CC, #0090FF)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 11, color: "#fff" }}>DH</span>
              </div>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "#ffffff", letterSpacing: "-0.3px" }}>
                DirectHire
              </span>
            </div>

            <div style={{ marginTop: "3rem" }}>
              <h1 style={{
                fontFamily: "var(--font-display)", fontSize: "2rem", fontWeight: 700,
                color: "white", letterSpacing: "-0.5px", margin: "0 0 8px",
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
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "white" }}>Remember for 30 days</span>
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
                  width: "100%", height: 52,
                  background: "#0090FF", border: "none", borderRadius: 8,
                  color: "#fff", fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.8 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  transition: "filter 0.15s",
                  marginTop: 8,
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
          background: "linear-gradient(145deg, #050d1a 0%, #0a1628 40%, #0d1f3e 70%, #080f1e 100%)",
          position: "relative",
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {/* Layer 1 — blue orb */}
          <div aria-hidden style={{ position: "absolute", top: -100, right: -100, width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,144,255,0.2) 0%, transparent 65%)", filter: "blur(80px)", pointerEvents: "none" }} />
          {/* Layer 2 — purple orb */}
          <div aria-hidden style={{ position: "absolute", bottom: -80, left: -60, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 65%)", filter: "blur(80px)", pointerEvents: "none" }} />
          {/* Layer 3 — noise texture */}
          <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.008) 2px, rgba(255,255,255,0.008) 4px)", pointerEvents: "none" }} />
          {/* Layer 4 — glowing horizontal line */}
          <div aria-hidden style={{ position: "absolute", top: "40%", left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent 0%, rgba(0,144,255,0.3) 30%, rgba(99,102,241,0.4) 50%, rgba(0,144,255,0.3) 70%, transparent 100%)", filter: "blur(1px)", pointerEvents: "none" }} />
          {/* Layer 5 — corner accent top-left */}
          <div aria-hidden style={{ position: "absolute", top: 0, left: 0, width: 200, height: 200, background: "linear-gradient(135deg, rgba(0,144,255,0.08) 0%, transparent 60%)", borderBottomRightRadius: "100%", pointerEvents: "none" }} />

          {/* Centered carousel */}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2, padding: "0 2.5rem" }}>
            <div style={{ position: "relative", width: "100%", maxWidth: 340 }}>
              {SLIDES.map((slide, i) => (
                <div
                  key={i}
                  style={{
                    position: i === 0 ? "relative" : "absolute",
                    top: 0, left: 0, right: 0,
                    opacity: activeSlide === i ? 1 : 0,
                    transform: activeSlide === i ? "translateY(0)" : "translateY(16px)",
                    transition: "opacity 0.7s ease, transform 0.7s ease",
                    pointerEvents: activeSlide === i ? "auto" : "none",
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${slide.accentColor}33`,
                    borderRadius: 24,
                    padding: "2.25rem 2rem",
                    backdropFilter: "blur(24px)",
                    WebkitBackdropFilter: "blur(24px)",
                    boxShadow: `0 24px 80px rgba(0,0,0,0.5), 0 0 40px ${slide.accentColor}1a, inset 0 1px 0 rgba(255,255,255,0.08)`,
                  }}
                >
                  {/* Tag pill */}
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: `${slide.accentColor}1a`,
                    border: `1px solid ${slide.accentColor}33`,
                    borderRadius: 100, padding: "3px 10px", marginBottom: 20,
                  }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: slide.accentColor }} />
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700, color: slide.accentColor, letterSpacing: "0.12em", textTransform: "uppercase" as const }}>
                      {slide.tag}
                    </span>
                  </div>

                  {/* Icon */}
                  <div style={{ color: slide.accentColor, marginBottom: 16, opacity: 0.9 }}>
                    {slide.icon}
                  </div>

                  {/* Headline */}
                  <h2 style={{
                    fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700,
                    color: "#fff", lineHeight: 1.2, margin: "0 0 20px", letterSpacing: "-0.5px",
                  }}>
                    {slide.headline.split("\n").map((line, j, arr) => (
                      <span key={j}>{line}{j < arr.length - 1 && <br />}</span>
                    ))}
                  </h2>

                  {/* Metric */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{
                      fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 800, lineHeight: 1,
                      background: `linear-gradient(135deg, ${slide.accentColor}, ${slide.secondaryColor})`,
                      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                    }}>
                      {slide.metric}
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
                      {slide.metricLabel}
                    </div>
                  </div>

                  {/* Body */}
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, margin: "0 0 20px" }}>
                    {slide.body}
                  </p>

                  {/* Stats */}
                  <div style={{ display: "flex", gap: 20, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16 }}>
                    {slide.stats.map((stat, j) => (
                      <div key={j}>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, color: slide.accentColor }}>{stat.value}</div>
                        <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{stat.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Progress dots */}
              <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 24 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    height: 3,
                    width: activeSlide === i ? 24 : 6,
                    borderRadius: 2,
                    background: activeSlide === i ? "#0090FF" : "rgba(255,255,255,0.2)",
                    transition: "all 0.4s ease",
                  }} />
                ))}
              </div>
            </div>
          </div>

          {/* Tagline */}
          <div style={{ position: "absolute", bottom: "2rem", left: 0, right: 0, textAlign: "center" as const, pointerEvents: "none" }}>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
              The future of global hiring is here
            </span>
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
