"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api-client";

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

function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>
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

interface StrengthResult { score: number; barLevel: number; label: string; color: string; }

function getPasswordStrength(pw: string): StrengthResult {
  if (!pw) return { score: 0, barLevel: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8)           score++;
  if (pw.length >= 12)          score++;
  if (/[A-Z]/.test(pw))        score++;
  if (/[0-9]/.test(pw))        score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, barLevel: 1, label: "Weak",       color: "#ef4444" };
  if (score <= 2) return { score, barLevel: 2, label: "Fair",       color: "#f59e0b" };
  if (score <= 3) return { score, barLevel: 3, label: "Strong",     color: "#3b82f6" };
  return              { score, barLevel: 4, label: "Very strong", color: "#10b981" };
}

export default function RegisterPage() {
  const router = useRouter();

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

  const [role,          setRole]          = useState<"WORKER" | "EMPLOYER">("WORKER");
  const [firstName,     setFirstName]     = useState("");
  const [lastName,      setLastName]      = useState("");
  const [email,         setEmail]         = useState("");
  const [password,      setPassword]      = useState("");
  const [confirm,       setConfirm]       = useState("");
  const [showPw,        setShowPw]        = useState(false);
  const [showConfirm,   setShowConfirm]   = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [oauthLoading,  setOauthLoading]  = useState<"google" | null>(null);
  const [errors,        setErrors]        = useState<Record<string, string>>({});
  const [serverErr,     setServerErr]     = useState("");
  const [focusedField,  setFocusedField]  = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const strength = getPasswordStrength(password);

  const inputStyle = (name: string): React.CSSProperties => ({
    width: "100%",
    padding: "12px 14px",
    minHeight: 48,
    background: errors[name] ? "#fff5f5" : "#ffffff",
    border: errors[name]
      ? "1px solid #fca5a5"
      : focusedField === name
        ? "1px solid #0090FF"
        : "1px solid #d1d5db",
    borderRadius: 8,
    color: "#111827",
    fontSize: 16,
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    boxSizing: "border-box" as const,
    fontFamily: "var(--font-body)",
    boxShadow: focusedField === name && !errors[name] ? "0 0 0 3px rgba(0,144,255,0.1)" : "none",
  });

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 14, fontWeight: 500,
    color: "#374151", marginBottom: 6, fontFamily: "var(--font-body)",
  };

  const errStyle: React.CSSProperties = {
    fontSize: 13, color: "#dc2626", marginTop: 4, fontFamily: "var(--font-body)",
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!firstName.trim())                        e.firstName = "First name is required";
    if (!lastName.trim())                         e.lastName  = "Last name is required";
    if (!email || !/\S+@\S+\.\S+/.test(email))   e.email     = "Valid email required";
    if (!password || password.length < 8)         e.password  = "Minimum 8 characters";
    else if (!/[A-Z]/.test(password))             e.password  = "Must include an uppercase letter";
    else if (!/[0-9]/.test(password))             e.password  = "Must include a number";
    if (password !== confirm)                     e.confirm   = "Passwords do not match";
    if (!acceptedTerms)                           e.terms     = "You must accept terms and privacy policy";
    return e;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({}); setServerErr(""); setLoading(true);
    const res = await authApi.register({ firstName: firstName.trim(), lastName: lastName.trim(), email, password, confirmPassword: confirm, role });
    setLoading(false);
    if (res.success) {
      router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
    } else {
      setServerErr(res.error ?? "Registration failed. Please try again.");
    }
  };

  const handleOAuth = (provider: "google") => {
    setOauthLoading(provider);
    const nonce = crypto.randomUUID();
    sessionStorage.setItem("oauth_nonce", nonce);
    const state = btoa(JSON.stringify({ nonce, redirect: "" }));
    window.location.href = `/api/auth/${provider}?state=${encodeURIComponent(state)}`;
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes float  { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
        @keyframes float2 { 0%,100% { transform: translateY(-10px); } 50% { transform: translateY(0px); } }
        .reg-left { overflow-y: auto; scrollbar-width: thin; scrollbar-color: #e5e7eb transparent; }
        .reg-left::-webkit-scrollbar { width: 4px; }
        .reg-left::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 2px; }
        .reg-oauth-btn {
          width: 100%; min-height: 48px; padding: 10px 16px;
          background: #ffffff; border: 1px solid #d1d5db;
          border-radius: 8px; display: flex; align-items: center;
          justify-content: center; gap: 8px;
          color: #374151; font-size: 16px; font-weight: 500;
          cursor: pointer; transition: background 0.15s, border-color 0.15s;
          font-family: var(--font-body);
        }
        .reg-oauth-btn:hover:not(:disabled) { background: #f9fafb; border-color: #9ca3af; }
        .reg-oauth-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .reg-right-panel { display: flex; }
        @media (max-width: 768px) {
          .reg-shell { min-height: 100dvh !important; height: auto !important; overflow: visible !important; }
          .reg-right-panel { display: none !important; }
          .reg-left { width: 100% !important; min-height: 100dvh !important; padding: 32px 24px !important; }
          .reg-left > div { max-width: 440px !important; margin: 0 auto !important; }
          .reg-name-grid { grid-template-columns: 1fr !important; }
        }
        input::placeholder { color: #9ca3af; }
      ` }} />

      <div className="reg-shell" style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

        {/* ── LEFT COLUMN ─────────────────────────────────────────────────────── */}
        <div className="reg-left" style={{
          width: "45%", background: "#05080f",
          display: "flex", justifyContent: "center",
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
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "white", letterSpacing: "-0.3px" }}>
                DirectHire
              </span>
            </div>

            {/* H1 + subtext */}
            <div style={{ marginTop: "2rem" }}>
              <h1 style={{
                fontFamily: "var(--font-display)", fontSize: "2rem", fontWeight: 700,
                color: "white", letterSpacing: "-0.5px", margin: "0 0 8px",
              }}>
                Create your account
              </h1>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#64748b", margin: 0 }}>
                Already have an account?{" "}
                <Link href="/login" style={{ color: "#0090FF", fontWeight: 500, textDecoration: "none" }}>
                  Sign in.
                </Link>
              </p>
            </div>

            {/* Role toggle */}
            <div style={{ display: "flex", gap: 8, marginTop: "1.5rem" }}>
              {(["WORKER", "EMPLOYER"] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  style={{
                    flex: 1, height: 48, borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    fontSize: 14, fontWeight: 600, cursor: "pointer",
                    transition: "all 0.2s", fontFamily: "var(--font-body)",
                    background: role === r ? "#0090FF" : "#ffffff",
                    color: role === r ? "#ffffff" : "#374151",
                    border: role === r ? "1px solid transparent" : "1px solid #d1d5db",
                  }}
                >
                  {r === "WORKER" ? <PersonIcon /> : <BuildingIcon />}
                  {r === "WORKER" ? "Worker" : "Employer"}
                </button>
              ))}
            </div>

            {/* Server error */}
            {serverErr && (
              <div style={{
                marginTop: "1rem",
                background: "#fef2f2", border: "1px solid #fecaca",
                borderRadius: 8, padding: "10px 14px",
                fontSize: 13, lineHeight: 1.5, color: "#dc2626",
                fontFamily: "var(--font-body)",
              }}>
                {serverErr}
              </div>
            )}

            {/* Form */}
            <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Name row */}
              <div className="reg-name-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <input
                    type="text" value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    onFocus={() => setFocusedField("firstName")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="First name"
                    autoComplete="given-name"
                    style={inputStyle("firstName")}
                  />
                  {errors.firstName && <p style={errStyle}>{errors.firstName}</p>}
                </div>
                <div>
                  <input
                    type="text" value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    onFocus={() => setFocusedField("lastName")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Last name"
                    autoComplete="family-name"
                    style={inputStyle("lastName")}
                  />
                  {errors.lastName && <p style={errStyle}>{errors.lastName}</p>}
                </div>
              </div>

              {/* Email */}
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  style={inputStyle("email")}
                />
                {errors.email && <p style={errStyle}>{errors.email}</p>}
              </div>

              {/* Password */}
              <div>
                <label style={labelStyle}>Password</label>
                <div style={{ position: "relative",color: " white",}}>
                  <input
                    type={showPw ? "text" : "password"} value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                    style={{ ...inputStyle("password"), paddingRight: 44 ,}}
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
                {password && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} style={{
                          flex: 1, height: 3, borderRadius: 2,
                          background: i <= strength.barLevel ? strength.color : "#e5e7eb",
                          transition: "background 0.3s",
                        }} />
                      ))}
                    </div>
                    {strength.label && (
                      <p style={{ fontSize: 11, textAlign: "right", marginTop: 4, color: "white", fontFamily: "var(--font-body)" }}>
                        {strength.label}
                      </p>
                    )}
                  </div>
                )}
                {errors.password && <p style={errStyle}>{errors.password}</p>}
              </div>

              {/* Confirm password */}
              <div>
                <label style={labelStyle}>Confirm password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showConfirm ? "text" : "password"} value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    onFocus={() => setFocusedField("confirm")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    style={{ ...inputStyle("confirm"), paddingRight: 44 }}
                  />
                  <button type="button" onClick={() => setShowConfirm(s => !s)}
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                    style={{
                      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer", color: "#9ca3af",
                      display: "flex", alignItems: "center", padding: 4, transition: "color 0.15s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#6b7280"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af"; }}
                  >
                    {showConfirm ? <EyeOff /> : <EyeOpen />}
                  </button>
                </div>
                {errors.confirm && <p style={errStyle}>{errors.confirm}</p>}
              </div>

              {/* Terms checkbox */}
              <div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div
                    onClick={() => setAcceptedTerms(s => !s)}
                    style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 2,
                      border: acceptedTerms ? "1px solid #0090FF" : errors.terms ? "1px solid #fca5a5" : "1px solid #d1d5db",
                      background: acceptedTerms ? "#0090FF" : "#ffffff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    {acceptedTerms && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </div>
                  <label
                    onClick={() => setAcceptedTerms(s => !s)}
                    style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, cursor: "pointer", fontFamily: "var(--font-body)", userSelect: "none" as const }}
                  >
                    I agree to the{" "}
                    <Link href="/terms" onClick={e => e.stopPropagation()} style={{ color: "#0090FF", textDecoration: "none" }}>Terms of Service</Link>
                    {" "}and{" "}
                    <Link href="/privacy" onClick={e => e.stopPropagation()} style={{ color: "#0090FF", textDecoration: "none" }}>Privacy Policy</Link>
                  </label>
                </div>
                {errors.terms && <p style={{ ...errStyle, marginTop: 6 }}>{errors.terms}</p>}
              </div>

              {/* Create account button */}
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
                  : "Create account"
                }
              </button>

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
                <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#9ca3af", whiteSpace: "nowrap" }}>or</span>
                <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
              </div>

              {/* OAuth buttons */}
              <button type="button" className="reg-oauth-btn" onClick={() => handleOAuth("google")} disabled={!!oauthLoading || loading}>
                {oauthLoading === "google"
                  ? <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid #d1d5db", borderTopColor: "#4285F4", animation: "spin 0.7s linear infinite" }} />
                  : <GoogleIcon />
                }
                Sign up with Google
              </button>
            </div>

            {/* Bottom link */}
            <p style={{
              textAlign: "center", marginTop: "1.5rem",
              fontSize: 12, color: "#9ca3af", fontFamily: "var(--font-body)", lineHeight: 1.6,
            }}>
              Already have an account?{" "}
              <Link href="/login" style={{ color: "#0090FF", fontWeight: 500, textDecoration: "none" }}>
                Sign in
              </Link>
            </p>

          </div>
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────────────── */}
        <div className="reg-right-panel" style={{
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
