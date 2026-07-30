"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Footer } from "@/components/Footer";
import { publicJobsApi } from "@/lib/api-client";

const FAQ = [
  { q: "Is it free to register as a worker?", a: "Yes. Creating your profile and getting matched to jobs is completely free. You only pay a small application fee when you apply to a specific position, which varies by region and salary." },
  { q: "What documents do I need?", a: "Your passport number (text entry only — no scanned document required), a profile photo, a short work video, a 30-second introduction video, and a medical certificate. All documents are stored encrypted." },
  { q: "How does the AI matching work?", a: "Our engine scores your profile against every live job post across 5 dimensions: skills, experience, location preferences, salary compatibility, and trust score. You see ranked matches instantly." },
  { q: "How long does verification take?", a: "Profile review typically takes 24–48 hours after you submit. You'll receive an email as soon as a decision is made." },
  { q: "Can I apply to jobs in multiple countries?", a: "Yes. You can select up to as many target countries as you like in your preferences, and you'll receive AI-ranked matches for all of them." },
];

const BENEFITS = [
  { icon: "⚡", title: "AI job matching — not searching", desc: "Stop scrolling through irrelevant listings. Our AI scores your profile against every live job post and surfaces ranked matches that actually fit you." },
  { icon: "🌍", title: "One profile, every operating country", desc: "Build your profile once. Get matched to opportunities across Albania, Croatia, Germany, and Italy — expanding as we grow." },
  { icon: "📊", title: "Transparent match scores", desc: "See exactly why you were matched to each job — skill fit, experience rating, location compatibility, and salary alignment all broken down clearly." },
  { icon: "🛡", title: "Verified & trusted employers", desc: "Every employer on the platform goes through company verification, NIPT validation, and admin review before they can contact workers." },
  { icon: "🔔", title: "Real-time status updates", desc: "Track every application in real time. Get notified instantly when an employer shortlists you, requests an interview, or makes an offer." },
  { icon: "🔒", title: "Your data is encrypted", desc: "Sensitive information like your passport number is AES-256 encrypted at rest. Your data is never sold and never shared without your consent." },
];

const HOW_STEPS = [
  { num: "1", title: "Create your profile", desc: "Register free and complete your structured onboarding — personal details, skills, experience, language proficiency, and target countries. Estimated time: 8–12 minutes.", color: "#4F46E5" },
  { num: "2", title: "Upload verification documents", desc: "Add a profile photo, a 30-second work video, an intro video, and a medical certificate. Passport number is text entry only — no scan required.", color: "#7C3AED" },
  { num: "3", title: "Get reviewed & approved", desc: "Our team reviews your profile within 24–48 hours. Once approved, your profile becomes searchable and our AI begins matching you.", color: "#818cf8" },
  { num: "4", title: "Receive ranked job matches", desc: "The AI immediately surfaces your top matches, ranked by compatibility score. Browse, filter by country, and see detailed score breakdowns for each role.", color: "#4F46E5" },
  { num: "5", title: "Apply and track", desc: "Apply with one click. Track your application pipeline — Pending → Shortlisted → Interview Requested → Hired. Get email and dashboard notifications at every stage.", color: "#34D399" },
];

// Only countries DirectHire actually operates in today. Job counts are
// fetched live from GET /api/public/jobs/countries (real APPROVED JobPost
// rows) rather than hardcoded, so this can never drift into a fabricated
// number the way the old 8-country list did.
const REAL_COUNTRIES = [
  { flag: "🇩🇪", name: "Germany" },
  { flag: "🇮🇹", name: "Italy"   },
  { flag: "🇦🇱", name: "Albania" },
  { flag: "🇭🇷", name: "Croatia" },
];

const SCORE_BARS = [
  { label: "Skills match",  pct: 94 },
  { label: "Experience",    pct: 88 },
  { label: "Location fit",  pct: 79 },
];

export default function ForWorkersPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [jobCounts, setJobCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    publicJobsApi.getCountries().then(r => {
      const data = (r as { success: boolean; data?: { country: string; count: number }[] }).data;
      if ((r as { success: boolean }).success && data) {
        setJobCounts(Object.fromEntries(data.map(d => [d.country, d.count])));
      }
    });
  }, []);

  return (
    <main style={{ background: "var(--glass-base)", minHeight: "100vh", color: "#ffffff", overflowX: "hidden" }}>
      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="pub-hero" style={{ background: "var(--glass-base)", padding: "140px 32px 100px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-10%", right: "0", width: 600, height: 600, borderRadius: "50%", background: "rgba(0,100,220,0.08)", filter: "blur(120px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-20%", left: "-5%", width: 500, height: 500, borderRadius: "50%", background: "rgba(99,102,241,0.05)", filter: "blur(120px)", pointerEvents: "none" }} />

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
                <span style={{ fontSize: 11, fontWeight: 700, color: "#818cf8", letterSpacing: "0.08em", textTransform: "uppercase" as const, fontFamily: "var(--font-body)" }}>For Workers</span>
              </div>

              <h1 className="text-display-lg" style={{ color: "#ffffff", marginBottom: 24, textAlign: "left" as const }}>
                Your skills deserve<br />
                <span className="text-gradient-blue">global opportunities</span>
              </h1>

              <p className="text-body-lg" style={{ maxWidth: 520, marginBottom: 40 }}>
                Build your profile once, get matched to top international employers automatically. No cold applications, no middlemen — just AI-powered connections that fit your skills.
              </p>

              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" as const }}>
                <Link href="/register" className="btn-primary">Create Free Profile →</Link>
                <Link href="/login" className="btn-secondary">Sign In</Link>
              </div>

              <div className="pub-stats" style={{ display: "flex", gap: 32, marginTop: 40, flexWrap: "wrap" as const }}>
                {[
                  { v: "4",    l: "Countries hiring"   },
                  { v: "Free", l: "To create profile"  },
                ].map(s => (
                  <div key={s.l}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 28, color: "#4F46E5" }}>{s.v}</div>
                    <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4, fontFamily: "var(--font-body)" }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: AI Profile Score card */}
            <div className="hero-card-panel" style={{ flex: "0 0 45%", display: "flex", justifyContent: "center" }}>
              <div style={{
                width: "100%", maxWidth: 360,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 20, padding: "2rem",
              }}>
                {/* Card header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontFamily: "var(--font-body)" }}>
                    AI Profile Score
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#34D399", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 999, padding: "3px 10px", fontFamily: "var(--font-body)" }}>
                    Live
                  </span>
                </div>

                {/* Score + ring */}
                <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginBottom: "1.75rem" }}>
                  <div style={{ position: "relative" as const, flexShrink: 0 }}>
                    <div style={{
                      width: 120, height: 120, borderRadius: "50%",
                      border: "8px solid rgba(99,102,241,0.15)",
                      borderTopColor: "#4F46E5",
                      borderRightColor: "#6366F1",
                      animation: "rotateSlow 4s linear infinite",
                    }} />
                    <div style={{
                      position: "absolute" as const, inset: 0,
                      display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{
                        fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 32,
                        background: "linear-gradient(135deg,var(--glass-indigo),var(--glass-purple))",
                        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                        lineHeight: 1,
                      }}>87</span>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontFamily: "var(--font-body)", marginTop: 2 }}>/100</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "#F0F4FF", marginBottom: 4 }}>Great match</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>Strong compatibility with your target roles</div>
                  </div>
                </div>

                {/* Score breakdown bars */}
                <div style={{ display: "flex", flexDirection: "column" as const, gap: "0.9rem", marginBottom: "1.5rem" }}>
                  {SCORE_BARS.map(bar => (
                    <div key={bar.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", fontFamily: "var(--font-body)" }}>{bar.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#F0F4FF", fontFamily: "var(--font-body)" }}>{bar.pct}%</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,0.06)" }}>
                        <div style={{
                          height: "100%", borderRadius: 999, width: `${bar.pct}%`,
                          background: "linear-gradient(90deg,var(--glass-indigo),var(--glass-purple))",
                        }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Approved badge */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.18)",
                  borderRadius: 10, padding: "10px 14px",
                }}>
                  <span style={{ fontSize: 14, color: "#34D399" }}>✓</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#34D399", fontFamily: "var(--font-body)" }}>Profile approved · Ready to match</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── BENEFITS ─────────────────────────────────────────────────────────── */}
      <section className="section" style={{ background: "var(--glass-base)", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: 72 }}>
            <h2 className="text-display-md" style={{ color: "#ffffff", marginBottom: 14 }}>Why workers choose DirectHire</h2>
            <p className="text-body-lg" style={{ maxWidth: 500, margin: "0 auto" }}>Everything you need to find a great international job — in one place.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 20 }} className="benefits-grid">
            {BENEFITS.map(b => (
              <div key={b.title} className="benefit-card" style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 16, padding: "28px 24px",
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
                <div style={{
                  width: 46, height: 46, borderRadius: 12,
                  background: "rgba(99,102,241,0.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, marginBottom: 16, flexShrink: 0,
                }}>{b.icon}</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "#ffffff", marginBottom: 8 }}>{b.title}</div>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.65, fontFamily: "var(--font-body)", margin: 0 }}>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section className="section" style={{ background: "var(--glass-base)", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <h2 className="text-display-md" style={{ color: "#ffffff" }}>How it works for workers</h2>
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

      {/* ── COUNTRIES ────────────────────────────────────────────────────────── */}
      <section className="section" style={{ background: "var(--glass-base)", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 className="text-display-md" style={{ color: "#ffffff", marginBottom: 12 }}>Current destinations</h2>
            <p className="text-body" style={{ color: "#94a3b8" }}>Active job openings in our operating countries right now</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }} className="countries-grid">
            {REAL_COUNTRIES.map(c => (
              <Link key={c.name} href={`/jobs?country=${encodeURIComponent(c.name)}`}
                className="country-card"
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14, padding: "16px 20px",
                  textDecoration: "none",
                  transition: "border-color 0.2s, transform 0.2s, box-shadow 0.2s",
                  position: "relative" as const,
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.borderColor = "rgba(99,102,241,0.3)";
                  el.style.transform = "translateY(-2px)";
                  el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.2)";
                  const arrow = el.querySelector(".country-arrow") as HTMLElement | null;
                  if (arrow) arrow.style.opacity = "1";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.borderColor = "rgba(255,255,255,0.07)";
                  el.style.transform = "translateY(0)";
                  el.style.boxShadow = "none";
                  const arrow = el.querySelector(".country-arrow") as HTMLElement | null;
                  if (arrow) arrow.style.opacity = "0";
                }}
              >
                <span style={{ fontSize: 28 }}>{c.flag}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#ffffff", fontFamily: "var(--font-body)", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                  <div style={{ fontSize: 13, color: "#94a3b8", fontFamily: "var(--font-body)" }}>{jobCounts[c.name] ?? "—"} open roles</div>
                </div>
                <span className="country-arrow" style={{ fontSize: 16, color: "rgba(99,102,241,0.6)", opacity: 0, transition: "opacity 0.2s", flexShrink: 0 }}>→</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────────── */}
      <section id="faq" className="section" style={{ background: "var(--glass-base)", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <h2 className="text-display-md" style={{ color: "#ffffff" }}>Frequently asked questions</h2>
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
                  <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, fontFamily: "var(--font-body)", paddingTop: 0, paddingBottom: 20, margin: 0 }}>
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
        <div className="container" style={{ position: "relative" }}>

          {/* What working with DirectHire looks like */}
          <blockquote style={{
            borderLeft: "3px solid #4F46E5",
            paddingLeft: 16,
            margin: "0 auto 2rem",
            maxWidth: 520,
            textAlign: "left" as const,
          }}>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.6)", fontFamily: "var(--font-body)", lineHeight: 1.6, margin: 0 }}>
              AI-matched roles, fraud-verified employers, and transparent application tracking from first match to hire.
            </p>
          </blockquote>

          <h2 className="text-display-md" style={{ color: "#ffffff", marginBottom: 16 }}>Start your international career today</h2>
          <p className="text-body-lg" style={{ maxWidth: 480, margin: "0 auto 36px" }}>Free to register. Profile takes about 10 minutes. Our AI matches you to jobs across our operating countries.</p>
          <Link href="/register" className="btn-primary">Create Free Profile →</Link>
        </div>
      </section>

      <Footer />

      <style>{`
        @keyframes rotateSlow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @media (max-width: 900px) {
          .hero-card-panel { display: none !important; }
          .hero-split { flex-direction: column !important; }
          .benefits-grid { grid-template-columns: 1fr !important; }
          .countries-grid { grid-template-columns: repeat(2,1fr) !important; }
        }
        @media (max-width: 480px) {
          .countries-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
