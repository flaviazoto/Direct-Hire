"use client";

import Link from "next/link";
import { Footer } from "@/components/Footer";

const VALUES = [
  { icon: "🌍", title: "Global by default",   body: "Every product decision is made with cross-border hiring in mind first." },
  { icon: "🔍", title: "Transparent",          body: "Workers know their match scores. Employers see rejection reasons. No black boxes." },
  { icon: "🛡️", title: "Safe",                body: "Fraud detection, document review, and session security on every account." },
  { icon: "⚡", title: "Fast",                body: "From job post to shortlisted candidates in hours, not weeks." },
];

const PILLARS = [
  { title: "AI-first matching", color: "#4F46E5", body: "Five-dimension AI scoring: skills, experience, location, salary compatibility, and trust." },
  { title: "Fraud protection",  color: "#818cf8", body: "Pattern detection and risk scoring on every profile." },
  { title: "Worker access",     color: "#FBBF24", body: "Creating a profile and receiving AI matches is always free for workers. A small fee applies only when you apply to a specific role." },
  { title: "Admin oversight",   color: "#34D399", body: "Every worker and employer profile is reviewed before going live, with human oversight on flagged activity." },
];

export default function AboutPage() {
  return (
    <main style={{ background: "var(--glass-base)", minHeight: "100vh", color: "#ffffff", overflowX: "hidden" }}>
      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{
        minHeight: "80vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--glass-base)",
        position: "relative", overflow: "hidden",
        paddingTop: 120, paddingBottom: 100,
      }}>
        {/* Radial glow */}
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          width: 700, height: 500,
          background: "radial-gradient(ellipse, rgba(99,102,241,0.1) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div className="container" style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <p style={{
            color: "#818cf8", fontWeight: 600, fontSize: "0.8rem",
            letterSpacing: "0.08em", textTransform: "uppercase" as const,
            fontFamily: "var(--font-body)", marginBottom: 20,
          }}>
            Our mission
          </p>
          <h1 style={{
            fontFamily: "var(--font-display)", fontWeight: 900,
            fontSize: "clamp(3rem,6vw,5rem)", letterSpacing: "-3px",
            color: "#F0F4FF", lineHeight: 1.05, marginBottom: 24,
          }}>
            Work should have<br />
            <span className="text-gradient-blue">no borders.</span>
          </h1>
          <p className="text-body-lg" style={{ maxWidth: 580, margin: "0 auto" }}>
            DirectHire was built to solve a real problem: connecting skilled workers in underserved markets with employers who need their talent — safely, transparently, and at scale.
          </p>
          {/* Horizontal rule accent */}
          <div style={{
            width: 80, height: 2, margin: "2rem auto 0",
            background: "linear-gradient(90deg, var(--glass-indigo), var(--glass-purple))",
            borderRadius: 2,
          }} />
        </div>
      </section>

      {/* ── WHY WE BUILT THIS ────────────────────────────────────────────────── */}
      <section className="section" style={{ background: "var(--glass-base)", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="container">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
            <div>
              <h2 className="text-display-md" style={{ color: "#F0F4FF", marginBottom: 24 }}>
                Why we built this
              </h2>
              <p className="text-body" style={{ marginBottom: 16 }}>
                Traditional recruitment platforms were never designed for cross-border hiring. They lack fraud detection for international profiles, have no visa or accommodation workflows, and charge workers fees they can&apos;t afford.
              </p>
              <p className="text-body" style={{ marginBottom: 16 }}>
                We built DirectHire from the ground up for this specific use case — an AI-powered infrastructure platform that handles matching, verification, dynamic pricing, and communication in one place.
              </p>
              <p className="text-body" style={{ marginBottom: 0 }}>
                Every feature exists because a real worker or employer needed it. Not because a designer thought it looked good.
              </p>

              {/* Quote callout */}
              <blockquote style={{
                borderLeft: "4px solid #4F46E5",
                borderRadius: "0 12px 12px 0",
                padding: "1rem 1.5rem",
                margin: "2rem 0 0",
                background: "rgba(99,102,241,0.04)",
              }}>
                <p style={{
                  fontSize: 20, fontStyle: "italic",
                  color: "rgba(255,255,255,0.6)",
                  fontFamily: "var(--font-body)", lineHeight: 1.55, margin: 0,
                }}>
                  &quot;We didn&apos;t build another job board. We built employment infrastructure.&quot;
                </p>
              </blockquote>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {PILLARS.map(v => (
                <div key={v.title} className="glass-card"
                  style={{ padding: "20px 24px", display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{ width: 3, borderRadius: 99, background: v.color, alignSelf: "stretch", flexShrink: 0 }} />
                  <div>
                    <h4 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.95rem", color: "#F0F4FF", marginBottom: 4 }}>
                      {v.title}
                    </h4>
                    <p style={{ fontSize: "0.875rem", color: "#4A5980", fontFamily: "var(--font-body)", lineHeight: 1.5, margin: 0 }}>
                      {v.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── VALUES ───────────────────────────────────────────────────────────── */}
      <section className="section" style={{ background: "var(--glass-base)" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 className="text-display-md" style={{ color: "#F0F4FF" }}>
              What we stand for
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
            {VALUES.map(v => (
              <div key={v.title}
                className="card-raised"
                style={{
                  padding: 28, textAlign: "center",
                  transition: "border-color 0.2s, box-shadow 0.2s, transform 0.2s",
                  cursor: "default",
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = "rgba(99,102,241,0.3)";
                  el.style.boxShadow = "0 0 24px rgba(99,102,241,0.08)";
                  el.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = "";
                  el.style.boxShadow = "";
                  el.style.transform = "translateY(0)";
                }}
              >
                {/* Icon with background circle */}
                <div style={{
                  width: 60, height: 60, borderRadius: "50%",
                  background: "rgba(99,102,241,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px",
                }}>
                  <span style={{ fontSize: "2.5rem", lineHeight: 1 }}>{v.icon}</span>
                </div>
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.05rem", color: "#F0F4FF", marginBottom: 10 }}>
                  {v.title}
                </h3>
                <p style={{ fontSize: "0.875rem", color: "#4A5980", fontFamily: "var(--font-body)", lineHeight: 1.6, margin: 0 }}>
                  {v.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ────────────────────────────────────────────────────────────── */}
      <section style={{ background: "rgba(255,255,255,0.012)", padding: "4rem 0", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="container" style={{ textAlign: "center" as const }}>
          <span style={{
            fontFamily: "var(--font-body)", fontSize: 15, color: "rgba(255,255,255,0.5)", fontWeight: 500,
          }}>
            Now active across Albania, Croatia, Germany, and Italy — expanding as we grow.
          </span>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <section className="section-sm" style={{
        background: "var(--glass-base)",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        textAlign: "center",
      }}>
        <div className="container">
          <h2 className="text-display-md" style={{ color: "#F0F4FF", marginBottom: 16 }}>
            Be part of the future of work
          </h2>
          <p className="text-body-lg" style={{ maxWidth: 440, margin: "0 auto 36px" }}>
            Whether you are a worker seeking opportunity or an employer seeking talent — DirectHire is built for you.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" as const }}>
            <Link href="/register" className="btn-primary">
              Create your account
            </Link>
            <Link href="/contact" className="btn-secondary">
              Get in touch
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
