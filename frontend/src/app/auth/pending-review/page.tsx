"use client";
// src/app/auth/pending-review/page.tsx
// Route: /auth/pending-review

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

const font = "'Plus Jakarta Sans', system-ui, sans-serif";

function PendingReviewContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .pr-fade { animation: fadeUp 0.4s ease both; }
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

        <div className="pr-fade" style={{
          width: "100%",
          maxWidth: 440,
          position: "relative",
          zIndex: 1,
          textAlign: "center",
        }}>
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
            <span style={{ fontWeight: 800, fontSize: 18, color: "#fff", letterSpacing: "-0.03em", fontFamily: font }}>
              Direct<span style={{ color: "#0090FF" }}>Hire</span>
            </span>
          </a>

          {/* Icon */}
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 28px",
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>

          {/* Heading */}
          <h1 style={{
            fontSize: 28,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "-0.03em",
            marginBottom: 12,
            fontFamily: font,
          }}>
            You&apos;re in the queue
          </h1>

          {/* Body */}
          <p style={{
            fontSize: 15,
            color: "#71717a",
            lineHeight: 1.7,
            marginBottom: 32,
            maxWidth: 360,
            margin: "0 auto 32px",
          }}>
            Your email has been verified. Our team is reviewing your account
            and will notify you by email once approved.
          </p>

          {/* Email pill */}
          {email && (
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 99,
              padding: "8px 16px",
              marginBottom: 32,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2" strokeLinecap="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <span style={{ fontSize: 13, color: "#a1a1aa", fontFamily: font }}>{email}</span>
            </div>
          )}

          {/* Steps */}
          <div style={{
            background: "#111111",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 16,
            padding: "24px 28px",
            textAlign: "left",
            marginBottom: 32,
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16, fontFamily: font }}>
              What happens next
            </p>
            {[
              { icon: "✅", text: "Email verified" },
              { icon: "🔍", text: "Manual review by our team (24–48 hrs)" },
              { icon: "📧", text: "You'll receive an approval email" },
              { icon: "🚀", text: "Profile goes live upon approval" },
            ].map(({ icon, text }) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
                <span style={{ fontSize: 14, color: "#71717a", fontFamily: font }}>{text}</span>
              </div>
            ))}
          </div>

          {/* Back to login */}
          <a
            href="/login"
            style={{
              display: "inline-block",
              padding: "12px 32px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#a1a1aa",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              fontFamily: font,
              transition: "border-color 0.15s, color 0.15s",
            }}
          >
            Back to login
          </a>
        </div>
      </div>
    </>
  );
}

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

export default function PendingReviewPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <PendingReviewContent />
    </Suspense>
  );
}
