"use client";

import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

const VALUES = [
  { icon: "🌍", title: "Global by default",   body: "Every product decision is made with cross-border hiring in mind first." },
  { icon: "🔍", title: "Transparent",          body: "Workers know their match scores. Employers see rejection reasons. No black boxes." },
  { icon: "🛡️", title: "Safe",                body: "Fraud detection, document review, and session security on every account." },
  { icon: "⚡", title: "Fast",                body: "From job post to shortlisted candidates in hours, not weeks." },
];

const PILLARS = [
  { title: "AI-first matching", color: "#0090FF", body: "Five-dimension scoring that gets smarter with every hire." },
  { title: "Fraud protection",  color: "#60A5FA", body: "Pattern detection and risk scoring on every profile." },
  { title: "Worker dignity",    color: "#FBBF24", body: "Workers never pay to apply. Employers pay for quality." },
  { title: "Admin oversight",   color: "#34D399", body: "Every user, job, and transaction reviewed by humans." },
];

const STATS = [
  { n: "2.4M+",   l: "Workers registered"  },
  { n: "94",      l: "Countries"            },
  { n: "12,000+", l: "Employers"            },
  { n: "78%",     l: "Lock-to-hire rate"    },
];

export default function AboutPage() {
  return (
    <main style={{ background: "var(--navy-950,#060B18)", minHeight: "100vh", color: "var(--text-primary,#F0F4FF)" }}>
      <Nav />

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{
        minHeight: "80vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--navy-950,#060B18)",
        position: "relative", overflow: "hidden",
        paddingTop: 120, paddingBottom: 100,
      }}>
        {/* Radial glow */}
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          width: 700, height: 500,
          background: "radial-gradient(ellipse, rgba(0,144,255,0.1) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Decorative large numbers */}
        <div style={{
          position: "absolute", left: "4%", top: "50%", transform: "translateY(-50%)",
          fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(120px,14vw,200px)",
          color: "#fff", opacity: 0.03, lineHeight: 1, pointerEvents: "none", userSelect: "none",
        }}>10</div>
        <div style={{
          position: "absolute", right: "4%", top: "50%", transform: "translateY(-50%)",
          fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(120px,14vw,200px)",
          color: "#fff", opacity: 0.03, lineHeight: 1, pointerEvents: "none", userSelect: "none",
        }}>+</div>

        <div className="container" style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <p style={{
            color: "#60A5FA", fontWeight: 600, fontSize: "0.8rem",
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
            background: "linear-gradient(90deg, #0090FF, #6366F1)",
            borderRadius: 2,
          }} />
        </div>
      </section>

      {/* ── WHY WE BUILT THIS ────────────────────────────────────────────────── */}
      <section className="section" style={{ background: "var(--navy-900,#0A1628)", borderTop: "1px solid var(--surface-border,#1E3258)" }}>
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
                borderLeft: "4px solid #0090FF",
                borderRadius: "0 12px 12px 0",
                padding: "1rem 1.5rem",
                margin: "2rem 0 0",
                background: "rgba(0,144,255,0.04)",
              }}>
                <p style={{
                  fontSize: 20, fontStyle: "italic",
                  color: "rgba(255,255,255,0.6)",
                  fontFamily: "var(--font-body)", lineHeight: 1.55, margin: 0,
                }}>
                  "We didn't build another job board. We built employment infrastructure."
                </p>
              </blockquote>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {PILLARS.map(v => (
                <div key={v.title} className="card-surface"
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
      <section className="section" style={{ background: "var(--navy-950,#060B18)" }}>
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
                  el.style.borderColor = "rgba(0,144,255,0.3)";
                  el.style.boxShadow = "0 0 24px rgba(0,144,255,0.08)";
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
                  background: "rgba(0,144,255,0.08)",
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
        <div className="container">
          <div className="stats-row" style={{ display: "flex", justifyContent: "center", gap: 0 }}>
            {STATS.map((s, i) => (
              <div key={s.l} style={{
                flex: 1, textAlign: "center", padding: "0 2rem",
                borderRight: i < STATS.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none",
              }}>
                <div style={{
                  fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 40,
                  background: "linear-gradient(135deg, #0090FF, #6366F1)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  lineHeight: 1, marginBottom: 10,
                }}>{s.n}</div>
                <div style={{
                  fontSize: 13, color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase" as const, letterSpacing: "0.08em",
                  fontFamily: "var(--font-body)",
                }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <section className="section-sm" style={{
        background: "var(--navy-900,#0A1628)",
        borderTop: "1px solid var(--surface-border,#1E3258)",
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

      <style>{`
        @media (max-width: 768px) {
          .stats-row { flex-wrap: wrap !important; gap: 2rem !important; }
          .stats-row > div { border-right: none !important; flex: 0 0 calc(50% - 1rem) !important; }
        }
      `}</style>
    </main>
  );
}
