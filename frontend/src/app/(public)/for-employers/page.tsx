"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Footer } from "@/components/Footer";
import { publicConfigApi } from "@/lib/api-client";

const FAQ = [
  { q: "How does the verification process work?", a: "After registering, you submit your company details including NIPT, QKR number, and administrator ID. Our team verifies the company within 24 hours and activates your account." },
  { q: "How many candidates will I see per job post?", a: "The AI surfaces the top ranked matches for your job post automatically — there's no cap on matches per post." },
  { q: "What is Worker Lock™ and how does it work?", a: "Worker Lock lets you exclusively hold a candidate for review — no other employer can contact them during your lock period. Billing is daily. You can release at any time, convert to a hire, or let it expire." },
  { q: "Can I hire from any country?", a: "Yes. You define which countries you hire from during onboarding. DirectHire currently operates across Albania, Croatia, Germany, and Italy, with verified, screened profiles." },
  { q: "What happens after I post a job?", a: "Immediately after posting, the AI runs your job requirements against our entire worker database and generates a ranked candidate list. Workers are also notified of roles that match their profile." },
];

const FEATURES = [
  { icon: "⚡", title: "AI-ranked candidates instantly", desc: "Post a job and receive a ranked list of the top matching workers — with skill scores, trust ratings, and full profile data — within minutes." },
  { icon: "📊", title: "Score breakdowns you can trust", desc: "Every candidate comes with a full match score breakdown: skills fit, experience level, location preference, salary range, and fraud risk." },
  { icon: "🔒", title: "Worker Lock™", desc: "Found a great candidate? Lock them exclusively while you review. No other employer can contact them during your lock period. Daily billing." },
  { icon: "🌍", title: "Source across our operating countries", desc: "Define which countries you hire from. DirectHire currently operates across Albania, Croatia, Germany, and Italy, with verified, screened, and AI-scored profiles." },
  { icon: "🛡", title: "Fraud protection built-in", desc: "Every worker is screened by our AI fraud detection — duplicate passport detection, velocity anomaly checks, and behavioural risk scoring." },
  { icon: "📱", title: "Full hiring pipeline", desc: "Shortlist, request interviews, mark as hired, or reject with one click. Track your entire pipeline from one dashboard with real-time notifications." },
];

const HOW_STEPS = [
  { num: "1", title: "Register & verify your company",  desc: "Create an account, submit your company details (NIPT, QKR, administrator ID), and upload your business registration. Verification takes 24 hours.", color: "#7C3AED" },
  { num: "2", title: "Start your subscription",         desc: "One DirectHire Employer plan, 5,000 ALL/month, with a 14-day free trial. No credit card charged until the trial ends.", color: "#818cf8" },
  { num: "3", title: "Post your first job",             desc: "Fill in job title, required skills, country, salary range, experience level, and visa type. The AI starts matching immediately after you publish.", color: "#7C3AED" },
  { num: "4", title: "Review AI-ranked candidates",     desc: "See a ranked list of the best matching workers — complete with match scores, skill breakdowns, profile videos, and risk flags. No CV sifting required.", color: "#4F46E5" },
  { num: "5", title: "Lock, interview, hire",           desc: "Use Worker Lock™ to hold top candidates, request interviews, and complete the hire — all from your employer dashboard.", color: "#34D399" },
];

const CANDIDATES = [
  { name: "Elena Rossi",  title: "Full-Stack Dev", score: 96, top: true  },
  { name: "Marcus Chen",  title: "Data Engineer",  score: 91, top: false },
  { name: "Priya Sharma", title: "DevOps Eng",     score: 88, top: false },
];

interface LockRate { dailyRateCents: number; maxDays: number; maxConcurrent: number; rateDisplay: string }

export default function ForEmployersPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [lockRate, setLockRate] = useState<LockRate | null>(null);

  useEffect(() => {
    publicConfigApi.getPricing().then(r => {
      const data = (r as { success: boolean; data?: { lock: LockRate } }).data;
      if ((r as { success: boolean }).success && data) setLockRate(data.lock);
    });
  }, []);

  const lockMaxDaysDisplay = lockRate ? `${lockRate.maxDays} days` : "a limited number of days";

  return (
    <main style={{ background: "var(--glass-base)", minHeight: "100vh", color: "#ffffff", overflowX: "hidden" }}>
      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="pub-hero" style={{ background: "var(--glass-base)", padding: "140px 32px 100px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-10%", right: "0", width: 600, height: 600, borderRadius: "50%", background: "rgba(0,100,220,0.08)", filter: "blur(120px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-20%", left: "-5%", width: 500, height: 500, borderRadius: "50%", background: "rgba(96,165,250,0.05)", filter: "blur(120px)", pointerEvents: "none" }} />

        <div className="container" style={{ position: "relative" }}>
          <div className="hero-split" style={{ display: "flex", alignItems: "center", gap: "4rem" }}>

            {/* Left: copy */}
            <div style={{ flex: "0 0 55%" }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "6px 16px", borderRadius: 999,
                background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
                marginBottom: 28,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#818cf8", letterSpacing: "0.08em", textTransform: "uppercase" as const, fontFamily: "var(--font-body)" }}>For Employers</span>
              </div>

              <h1 className="text-display-lg" style={{ color: "#ffffff", marginBottom: 24, textAlign: "left" as const }}>
                Hire the right people,<br />
                <span className="text-gradient-blue">from anywhere in the world</span>
              </h1>

              <p className="text-body-lg" style={{ maxWidth: 520, marginBottom: 40 }}>
                Stop reviewing hundreds of unqualified CVs. DirectHire&apos;s AI ranks candidates by real compatibility — skills, experience, location, and salary alignment — so you only see workers who actually fit.
              </p>

              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" as const }}>
                <Link href="/register" className="btn-primary">Start Hiring Free →</Link>
                <Link href="/pricing" className="btn-secondary">See Pricing</Link>
              </div>

              <div className="pub-stats" style={{ display: "flex", gap: 32, marginTop: 40, flexWrap: "wrap" as const }}>
                {[
                  { v: "4",       l: "Source countries"      },
                  { v: "24h",     l: "Candidate list ready"  },
                  { v: "14 days", l: "Free trial"            },
                ].map(s => (
                  <div key={s.l}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 28, color: "#4F46E5" }}>{s.v}</div>
                    <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4, fontFamily: "var(--font-body)" }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: AI Candidate Ranking card */}
            <div className="hero-card-panel" style={{ flex: "0 0 45%", display: "flex", justifyContent: "center" }}>
              <div style={{
                width: "100%", maxWidth: 360,
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 20, padding: "2rem",
              }}>
                {/* Card header */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2dd4bf" }} />
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "#2dd4bf" }}>AI Ranked Candidates</span>
                </div>

                {/* Candidate rows */}
                {CANDIDATES.map((c, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: c.top ? "10px 12px" : "10px 0",
                    border: c.top ? "1px solid rgba(45,212,191,0.2)" : "none",
                    borderBottom: i < 2 && !c.top ? "1px solid rgba(255,255,255,0.05)" : undefined,
                    borderRadius: c.top ? 12 : 0,
                    background: c.top ? "rgba(20,184,166,0.06)" : "transparent",
                    marginBottom: c.top ? 8 : 0,
                  }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: c.top ? "linear-gradient(135deg, #14b8a6, #0d9488)" : "rgba(255,255,255,0.06)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700,
                      color: c.top ? "#fff" : "rgba(255,255,255,0.3)", flexShrink: 0,
                    }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "#fff" }}>{c.name}</div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{c.title}</div>
                    </div>
                    <div style={{ textAlign: "right" as const }}>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: "#2dd4bf" }}>{c.score}%</div>
                      <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 4 }}>
                        <div style={{ width: `${c.score}%`, height: "100%", background: "linear-gradient(90deg, #14b8a6, #0d9488)", borderRadius: 2 }} />
                      </div>
                    </div>
                  </div>
                ))}

                {/* Bottom summary row */}
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Matched from the verified worker database</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#34D399", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 999, padding: "3px 10px", fontFamily: "var(--font-body)" }}>Live</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <section className="section" style={{ background: "var(--glass-base)", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <h2 className="text-display-md" style={{ color: "#ffffff", marginBottom: 14 }}>Everything you need to hire globally</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }} className="features-grid">
            {FEATURES.map(f => (
              <div key={f.title} style={{
                position: "relative" as const,
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 16, padding: "28px 24px",
                overflow: "hidden",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(99,102,241,0.3)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 28px rgba(99,102,241,0.1)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.07)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                }}
              >
                {/* Top-left accent bar */}
                <div style={{
                  position: "absolute" as const, top: 0, left: 0,
                  width: 3, height: 40,
                  background: "linear-gradient(180deg, #4F46E5, transparent)",
                  borderRadius: "0 0 2px 2px",
                }} />
                <div style={{
                  width: 46, height: 46, borderRadius: 12,
                  background: "rgba(99,102,241,0.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, marginBottom: 16,
                }}>{f.icon}</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "#ffffff", marginBottom: 8 }}>{f.title}</div>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.65, fontFamily: "var(--font-body)", margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section className="section" style={{ background: "var(--glass-base)", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <h2 className="text-display-md" style={{ color: "#ffffff" }}>How it works for employers</h2>
          </div>
          <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 0 }}>
            {HOW_STEPS.map((s, i) => (
              <div key={i} style={{
                borderLeft: "3px solid rgba(99,102,241,0.2)",
                paddingLeft: 24,
                paddingBottom: i < HOW_STEPS.length - 1 ? 36 : 0,
                position: "relative" as const,
              }}>
                <div style={{
                  position: "absolute" as const, left: -22, top: 0,
                  width: 40, height: 40, borderRadius: "50%",
                  background: `linear-gradient(135deg,${s.color},${s.color}99)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15, color: "#F0F4FF",
                  flexShrink: 0,
                }}>{s.num}</div>
                <div style={{ paddingTop: 6 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "#ffffff", marginBottom: 8 }}>{s.title}</div>
                  <p style={{ fontSize: 15, color: "#94a3b8", lineHeight: 1.65, fontFamily: "var(--font-body)", margin: 0 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WORKER LOCK SPOTLIGHT ────────────────────────────────────────────── */}
      <section className="section-sm" style={{ background: "var(--glass-base)", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="container">
          <div className="glass-card lock-grid" style={{
            padding: "60px",
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", right: -60, top: -60, width: 400, height: 400, borderRadius: "50%", background: "rgba(99,102,241,0.05)", filter: "blur(80px)", pointerEvents: "none" }} />
            <div style={{ position: "relative" }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "5px 14px", borderRadius: 999,
                background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)",
                marginBottom: 24,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#FCD34D", letterSpacing: "0.08em", textTransform: "uppercase" as const, fontFamily: "var(--font-body)" }}>🔒 Premium Feature</span>
              </div>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 38, color: "#ffffff", letterSpacing: "-0.03em", marginBottom: 16 }}>Worker Lock™</h2>
              <p style={{ fontSize: 16, color: "#94a3b8", lineHeight: 1.7, marginBottom: 28, fontFamily: "var(--font-body)" }}>
                Found the right candidate? Lock them exclusively before another employer does. During the lock period, the worker is removed from other employers&apos; search results and cannot receive competing offers.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
                {[
                  "Exclusive hold — no other employer can contact them",
                  "Daily billing — pay only for the days you use",
                  `Up to ${lockMaxDaysDisplay} per lock${lockRate ? `, up to ${lockRate.maxConcurrent} concurrent` : ""}`,
                  "Automatic release on hire, manual release, or expiry",
                ].map(feat => (
                  <div key={feat} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ color: "#34D399", fontWeight: 700 }}>✓</span>
                    <span style={{ fontSize: 14, color: "#cbd5e1", fontFamily: "var(--font-body)" }}>{feat}</span>
                  </div>
                ))}
              </div>
              <Link href="/register" className="btn-primary">Try Worker Lock™ →</Link>
            </div>

            <div className="card-raised" style={{ padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* Pulsing dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", background: "#34D399",
                    animation: "pulseGreen 2s ease-in-out infinite",
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", fontFamily: "var(--font-body)" }}>Active Worker Locks</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#FCD34D", background: "rgba(245,158,11,0.15)", padding: "3px 10px", borderRadius: 999, fontFamily: "var(--font-body)" }}>3 Active</span>
              </div>
              {[
                { name: "Ana Koci",  role: "Senior Nurse",   time: "2d 14h remaining", score: 96 },
                { name: "James O.", role: "Civil Engineer", time: "6d 8h remaining",  score: 91 },
              ].map((w, i) => (
                <div key={i} style={{ padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#ffffff", fontFamily: "var(--font-body)" }}>{w.name}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "var(--font-body)" }}>{w.role}</div>
                    </div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "#34D399" }}>{w.score}</div>
                  </div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", background: "rgba(245,158,11,0.15)", borderRadius: 999 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#FCD34D", fontFamily: "var(--font-body)" }}>🔒 {w.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────────── */}
      <section id="faq" className="section" style={{ background: "var(--glass-base)", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <h2 className="text-display-md" style={{ color: "#ffffff" }}>Employer FAQ</h2>
          </div>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            {FAQ.map((item, i) => (
              <div key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center",
                    padding: "22px 0", background: "none", border: "none", cursor: "pointer",
                    fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "#ffffff",
                    textAlign: "left" as const, gap: 16,
                  }}
                >
                  <span>{item.q}</span>
                  <span style={{ fontSize: 22, color: "rgba(255,255,255,0.3)", flexShrink: 0, lineHeight: 1, fontWeight: 300 }}>
                    {openFaq === i ? "−" : "+"}
                  </span>
                </button>
                {openFaq === i && (
                  <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, fontFamily: "var(--font-body)", paddingBottom: 20, margin: 0 }}>
                    {item.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <section className="section-sm" style={{ background: "var(--glass-base)", borderTop: "1px solid rgba(255,255,255,0.1)", textAlign: "center", overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 600, height: 400, borderRadius: "50%", background: "rgba(99,102,241,0.06)", filter: "blur(80px)", pointerEvents: "none" }} />

        {/* Floating stat cards */}
        <div className="cta-float-card" style={{
          position: "absolute", left: "6%", top: "25%",
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12, padding: "12px 16px",
          animation: "ctaFloat 4s ease-in-out infinite",
        }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#fff", fontWeight: 600 }}>⚡ Candidates in &lt;24h</span>
        </div>
        <div className="cta-float-card" style={{
          position: "absolute", right: "6%", top: "35%",
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12, padding: "12px 16px",
          animation: "ctaFloat 4s ease-in-out infinite",
          animationDelay: "2s",
        }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#fff", fontWeight: 600 }}>🔒 Reserve candidates exclusively</span>
        </div>

        <div className="container" style={{ position: "relative" }}>
          <h2 className="text-display-md" style={{ color: "#ffffff", marginBottom: 16 }}>Start hiring with AI today</h2>
          <p className="text-body-lg" style={{ maxWidth: 440, margin: "0 auto 36px" }}>14-day free trial. No credit card required. Cancel any time.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" as const }}>
            <Link href="/register" className="btn-primary">Start Free Trial →</Link>
            <Link href="/pricing" className="btn-secondary">View Pricing</Link>
          </div>
        </div>
      </section>

      <Footer />

      <style>{`
        @keyframes pulseGreen {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(1.4); }
        }
        @keyframes ctaFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }
        @media (max-width: 900px) {
          .hero-card-panel { display: none !important; }
          .hero-split      { flex-direction: column !important; }
          .features-grid   { grid-template-columns: 1fr !important; }
          .lock-grid       { grid-template-columns: 1fr !important; padding: 32px !important; gap: 32px !important; }
          .cta-float-card  { display: none !important; }
        }
        @media (max-width: 600px) {
          .features-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
