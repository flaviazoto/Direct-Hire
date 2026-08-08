"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Footer } from "@/components/Footer";

const InteractiveGlobe = dynamic(
  () => import("@/components/globe/InteractiveGlobe"),
  { ssr: false, loading: () => <GlobePlaceholder /> },
);

// ── Globe fallback ────────────────────────────────────────────────────────────

function GlobePlaceholder() {
  // Must match InteractiveGlobe.tsx's real root exactly (className there:
  // "relative w-full aspect-square max-w-[340px] sm:max-w-[480px]
  // md:max-w-[600px] mx-auto touch-none") — this placeholder previously used
  // a fixed maxWidth:540 with no responsive breakpoints, so swapping to the
  // real component on mobile (340px cap there vs 540px here) shifted the
  // whole hero-globe-col layout, including the absolutely-positioned glow
  // div behind it. That's the exact CLS regression (0.00 -> 0.044) traced
  // back to when the deferred-mount fix shipped — confirmed via the
  // archived Lighthouse "layout-shifts" audit, which named this glow div by
  // its bounding rect. Identical dimensions at every breakpoint = zero size
  // change on swap = zero shift.
  return (
    <div className="relative w-full aspect-square max-w-[340px] sm:max-w-[480px] md:max-w-[600px] mx-auto" style={{ flexShrink: 0 }}>
      <div style={{
        width: "100%", height: "100%", borderRadius: "50%",
        background: "radial-gradient(circle at 35% 35%, #1e54b7 0%, #0b1120 60%, #0B1121 100%)",
        position: "relative", overflow: "hidden",
        boxShadow: "0 0 80px rgba(30,84,183,0.2), 0 0 160px rgba(99,102,241,0.08)",
      }}>
        {[-120, -60, 0, 60, 120].map((offset, i) => (
          <div key={i} style={{
            position: "absolute", top: `${50 + offset * 0.22}%`,
            left: "5%", width: "90%", height: 1,
            background: "rgba(96,165,250,0.08)",
          }} />
        ))}
        {GLOBE_DOTS.map((dot, i) => (
          <div key={i} style={{ position: "absolute", top: dot.top, left: dot.left }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%", background: "#818cf8",
              boxShadow: "0 0 6px rgba(129,140,248,0.8)",
              animation: "dotPulse 2s ease-in-out infinite",
              animationDelay: `${i * 0.25}s`,
            }} />
          </div>
        ))}
      </div>
      {GLOBE_DOTS.filter(d => d.label).map((dot, i) => (
        <div key={i} style={{
          position: "absolute", top: `calc(${dot.top} - 26px)`, left: dot.left,
          background: "rgba(1,9,19,0.9)", border: "1px solid rgba(99,102,241,0.25)",
          borderRadius: 20, padding: "3px 9px", fontSize: 10, color: "#a5b4fc",
          whiteSpace: "nowrap", fontFamily: "var(--font-body)", fontWeight: 600,
          transform: "translateX(-50%)",
        }}>
          {dot.label}
        </div>
      ))}
      <style>{`@keyframes dotPulse { 0%,100% { box-shadow: 0 0 6px rgba(129,140,248,0.8); } 50% { box-shadow: 0 0 12px rgba(129,140,248,0.4), 0 0 0 6px rgba(129,140,248,0.1); } }`}</style>
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────

const GLOBE_DOTS = [
  { top: "22%", left: "48%", label: null },
  { top: "18%", left: "22%", label: null },
  { top: "24%", left: "55%", label: null },
  { top: "35%", left: "62%", label: null },
  { top: "65%", left: "80%", label: null },
  { top: "45%", left: "30%", label: null },
  { top: "55%", left: "50%", label: null },
  { top: "30%", left: "70%", label: null },
  { top: "70%", left: "40%", label: null },
  { top: "15%", left: "60%", label: null },
];

const AI_FEATURES = [
  { icon: "🧠", title: "AI Match Engine",     desc: "Skill similarity, experience depth, and salary alignment scored in real-time against live job postings." },
  { icon: "🛡️", title: "Fraud Detection",     desc: "Pattern anomaly detection, duplicate profile flagging, and risk scoring on every submission." },
  { icon: "💰", title: "Dynamic Pricing",      desc: "Region demand signals and conversion probability drive optimized pricing for maximum hire rate." },
  { icon: "🔔", title: "Smart Notifications", desc: "Behavioral reminders and drop-off recovery sequences keep candidates engaged through the funnel." },
  { icon: "⭐", title: "Trust Scoring",        desc: "Verified profiles, employer history ratings, and hire completion scores build a transparent marketplace." },
  { icon: "🔧", title: "Admin Override",       desc: "Full human control sits above every AI decision — approve, reject, or adjust any outcome instantly." },
];

const HOW_STEPS = [
  { n: "01", title: "Register & Verify",  desc: "Upload your profile, video introduction, and ID. Our AI scores your profile instantly — no waiting." },
  { n: "02", title: "AI Match Engine",    desc: "Our algorithm ranks you against open roles across our growing network of countries in real-time, 24/7." },
  { n: "03", title: "Get Hired",          desc: "Receive offers, schedule interviews, and track your applications in a premium dashboard." },
];

const WORKER_FEATURES = [
  { title: "AI Profile Scoring",  desc: "Get an instant score showing how competitive you are globally." },
  { title: "Smart Job Matching",  desc: "Matched to jobs by skill, salary, location and experience weight." },
  { title: "Application Tracker", desc: "See every application status in real-time, one dashboard." },
  { title: "Visa Guidance",       desc: "Country-specific visa and work permit requirements surfaced instantly." },
  { title: "Direct Contact",      desc: "Employers can reach you directly once you pass their AI threshold." },
];

const EMPLOYER_FEATURES = [
  { title: "AI Candidate Ranking",    desc: "Top 20 matches ranked automatically the moment you post a job." },
  { title: "Fraud-Verified Profiles", desc: "Every worker profile is AI-scored for authenticity and risk." },
  { title: "Dynamic Pricing",         desc: "Application fees optimized by region, demand, and conversion probability." },
  { title: "Instant Shortlisting",    desc: "Accept, reject, or shortlist candidates in one click." },
];

const PRICING_PLANS = [
  {
    name: "For Workers", price: "Free", period: "", cta: "Get started free", featured: false,
    href: "/register?role=worker",
    desc: "Create a profile and get AI-matched to open roles.",
    features: ["AI-powered job matching", "Fraud-verified employers", "Application tracking", "Pay only when you apply — $1 to $25 per application, based on role and demand"],
  },
  {
    name: "For Employers", price: "5,000 ALL", period: "/month", cta: "Start free trial", featured: false,
    href: "/register?role=employer",
    desc: "Post jobs and access AI-ranked candidates.",
    features: ["Unlimited job posts", "AI-ranked candidates", "Fraud detection suite", "Worker Lock — $1/day per reserved candidate (up to 5 concurrent, 14-day max)", "14-day free trial, no credit card required"],
  },
];

const TRUST_ITEMS = ["Built with GDPR principles", "AI-Verified Profiles"];

const PRICING_FAQ = [
  { q: "Is there a free trial?",               a: "Employers get a 14-day free trial, no credit card required. Worker accounts are free — no trial needed." },
  { q: "Can workers use DirectHire for free?", a: "Yes. Registering and receiving AI matches is completely free for workers. A small fee applies only when applying to specific roles." },
  { q: "What currency do you charge in?",      a: "Employer subscriptions are billed in Albanian Lek (ALL). Application fees and Worker Lock reservations are charged in USD." },
  { q: "Can I cancel anytime?",                a: "Yes — cancel anytime from your billing dashboard. Your subscription stays active through the end of the period you've already paid for, with no early-termination penalty." },
];

// ── Shared styles ─────────────────────────────────────────────────────────────
// CARD/FLOAT_CARD mirror the .glass-card token's exact recipe (globals.css) —
// kept as local objects rather than switching every spread usage below to
// className, but the values are identical, not reinvented. Both are page-
// level/hero decorative panels (a handful of static content cards and 2-3
// floating badges), not a scrolling list, so backdrop-blur is appropriate
// here per the performance rule.

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 16,
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5), 0 8px 32px rgba(99,102,241,0.1)",
};

const FLOAT_CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(99,102,241,0.2)",
  borderRadius: 16,
  padding: "16px 20px",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5), 0 8px 32px rgba(99,102,241,0.1)",
};

// ── Check icon ────────────────────────────────────────────────────────────────

function Check() {
  return (
    <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LandingPage() {
  const pageRef = useRef<HTMLDivElement>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("is-visible"); obs.unobserve(e.target); } }),
      { threshold: 0.08 },
    );
    el.querySelectorAll(".dh-reveal").forEach(n => obs.observe(n));
    return () => obs.disconnect();
  }, []);

  // ── Defer the InteractiveGlobe mount (Fix 1 — see InteractiveGlobe.tsx's
  // own header comment for the full TBT investigation this addresses) ──────────
  // The globe sits in the hero, above the fold, so it's essentially always
  // "in view" on load — IntersectionObserver alone wouldn't defer anything
  // here. The actual lever is requestIdleCallback: the static GlobePlaceholder
  // (below) renders immediately so the hero never looks empty, but the real
  // dynamic-imported component — and the WebGL/texture/geometry work it does
  // on mount — doesn't start until the browser reports it's idle (i.e. after
  // hydration and initial interactivity are already handled), so it no longer
  // competes with the window Lighthouse measures for Total Blocking Time.
  // IntersectionObserver is still layered on top for correctness (skips the
  // work entirely if the hero somehow isn't in view yet) rather than because
  // it's expected to defer much on this specific page.
  const globeMountRef = useRef<HTMLDivElement>(null);
  const [loadGlobe, setLoadGlobe] = useState(false);

  useEffect(() => {
    const el = globeMountRef.current;
    if (!el) return;

    let idleHandle: number | null = null;
    const scheduleLoad = () => {
      const ric = (window as typeof window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) {
        idleHandle = ric(() => setLoadGlobe(true), { timeout: 2000 });
      } else {
        idleHandle = window.setTimeout(() => setLoadGlobe(true), 300);
      }
    };

    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { scheduleLoad(); obs.unobserve(e.target); } }),
      { threshold: 0.01 },
    );
    obs.observe(el);

    return () => {
      obs.disconnect();
      if (idleHandle !== null) {
        const cic = (window as typeof window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
        if (cic) cic(idleHandle); else window.clearTimeout(idleHandle);
      }
    };
  }, []);

  return (
    <div ref={pageRef} style={{ background: "#0B1121", minHeight: "100vh", overflowX: "hidden" }}>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="relative flex items-center bg-[#0B1121] overflow-hidden pt-20 pb-16 lg:pt-32 lg:pb-24 min-h-auto">
        {/* Blue orb top-left */}
        <div aria-hidden className="absolute -top-48 -left-32 sm:-left-40 md:-left-48 w-96 h-96 sm:w-[36rem] sm:h-[36rem] md:w-[56rem] md:h-[56rem] rounded-full pointer-events-none" style={{
          background: "radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)",
          filter: "blur(80px)",
        }} />
        {/* Purple orb top-right */}
        <div aria-hidden className="absolute -top-24 -right-20 sm:-right-28 md:-right-32 w-64 h-64 sm:w-80 sm:h-80 md:w-[30rem] md:h-[30rem] rounded-full pointer-events-none" style={{
          background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)",
          filter: "blur(80px)",
        }} />
        <div className="hero-grid relative z-1 w-full max-w-6xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-center">

          {/* LEFT: text — below globe on mobile, left column on desktop */}
          <div className="order-2 md:order-1 max-w-2xl md:max-w-xl">
            {/* H1 */}
            <h1 className="dh-reveal hero-h1 font-display font-black leading-tight tracking-tighter text-white mb-4 sm:mb-6 md:mb-8">
              Find World-Class Talent<br />
              <span style={{
                background: "linear-gradient(135deg, var(--glass-indigo) 0%, #818cf8 50%, var(--glass-purple) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>
                Anywhere on Earth
              </span>
            </h1>

            {/* Subheadline */}
            <p className="dh-reveal hero-sub text-white/60 leading-relaxed max-w-sm md:max-w-md mb-6 md:mb-8">
              DirectHire&apos;s AI matches verified workers with employers across a growing network of countries — including Albania, Croatia, Germany, and Italy — intelligently, securely, and built to scale.
            </p>

            {/* CTA buttons */}
            <div className="dh-reveal hero-cta-row" style={{ display: "flex", gap: 16, flexWrap: "wrap" as const, marginBottom: 52 }}>
              <Link href="/register?role=employer" style={{
                display: "inline-flex", alignItems: "center",
                padding: "14px 28px",
                background: "linear-gradient(135deg, var(--glass-indigo), var(--glass-purple))",
                boxShadow: "0 0 40px rgba(99,102,241,0.4)",
                borderRadius: 12, color: "#fff",
                fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700,
                textDecoration: "none", transition: "filter 0.2s",
                border: "none",
              }}
                onMouseEnter={e => { e.currentTarget.style.filter = "brightness(1.12)"; }}
                onMouseLeave={e => { e.currentTarget.style.filter = "brightness(1)"; }}
              >
                Find talent →
              </Link>
              <Link href="/register?role=worker" style={{
                display: "inline-flex", alignItems: "center",
                padding: "14px 28px",
                background: "rgba(255,255,255,0.05)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 12, color: "rgba(255,255,255,0.85)",
                fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600,
                textDecoration: "none", transition: "all 0.2s",
              }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.24)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)"; }}
              >
                Find work
              </Link>
            </div>

            {/* Trust badge pills */}
            <div className="dh-reveal" style={{ display: "flex", flexWrap: "wrap" as const, gap: 8, marginBottom: 32 }}>
              {TRUST_ITEMS.map(item => (
                <span key={item} style={{
                  fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
                  color: "rgba(255,255,255,0.45)", letterSpacing: "0.04em",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 999, padding: "4px 12px",
                  whiteSpace: "nowrap" as const,
                }}>
                  {item}
                </span>
              ))}
            </div>

            {/* Stats row */}
            <div className="dh-reveal" style={{ paddingTop: "2rem", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
                Now active across Albania, Croatia, Germany, and Italy — expanding as we grow.
              </span>
            </div>
          </div>

          {/* RIGHT: Globe + floating cards — above text on mobile, right column on desktop */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }} className="hero-globe-col order-1 md:order-2">
            {/* Glow behind globe */}
            <div aria-hidden style={{
              position: "absolute", width: 600, height: 600, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 65%)",
              pointerEvents: "none", zIndex: 0,
            }} />
            {/* Globe — see the deferred-mount effect above: placeholder shows
                immediately, the real dynamic-imported component (and its
                WebGL/texture work) only mounts once the browser is idle. */}
            <div ref={globeMountRef} style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {loadGlobe ? <InteractiveGlobe /> : <GlobePlaceholder />}
            </div>

          </div>
        </div>

        <style>{`
          @keyframes ping {
            0%    { box-shadow: 0 0 0 0 rgba(129,140,248,0.4); }
            70%   { box-shadow: 0 0 0 6px rgba(129,140,248,0); }
            100%  { box-shadow: 0 0 0 0 rgba(129,140,248,0); }
          }
          .hero-h1  { font-size: clamp(28px, 5vw, 64px) !important; }
          .hero-sub { font-size: clamp(16px, 2vw, 22px) !important; }
          @media (max-width: 900px) {
            .hero-grid { grid-template-columns: 1fr !important; }
          }
          @media (max-width: 640px) {
            .globe-float-card { display: none !important; }
          }
          @media (max-width: 640px) {
            .hero-cta-row { flex-direction: column !important; }
            .hero-cta-row > a { width: 100% !important; justify-content: center !important; }
          }
        `}</style>
      </section>

      {/* ── TRUST BAR ────────────────────────────────────────────────────────── */}
      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ background: "#0B1121", overflowX: "hidden" }}>
        <div className="lp-container" style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div className="dh-reveal" style={{ textAlign: "center" as const, marginBottom: "5rem" }}>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: "#6366f1", marginBottom: 16 }}>
              Simple. Intelligent. Global.
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.25rem, 3.5vw, 3rem)", fontWeight: 800, letterSpacing: "-1.5px", color: "#fff", margin: 0 }}>
              Hiring redefined in three steps
            </h2>
          </div>

          {/* Cards + connector line */}
          <div style={{ position: "relative" as const }}>
            <div className="how-line" aria-hidden style={{
              position: "absolute", top: 38, left: "16.66%", right: "16.66%",
              borderTop: "1px dashed rgba(99,102,241,0.2)", zIndex: 0,
            }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem", position: "relative" as const, zIndex: 1 }} className="how-grid">
              {HOW_STEPS.map((step, i) => (
                <div key={i} className="dh-reveal" style={{
                  ...CARD, padding: "2.5rem 2rem",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(99,102,241,0.35)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 32px rgba(99,102,241,0.12)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
                >
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: "#818cf8" }}>{step.n}</span>
                  </div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700, color: "#fff", margin: "1.5rem 0 0.75rem" }}>
                    {step.title}
                  </h3>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.75, margin: 0 }}>
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ textAlign: "right" as const, marginTop: "1.5rem" }}>
            <Link href="/for-workers" style={{
              fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "#818cf8",
              textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4,
              transition: "gap 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.gap = "8px"; e.currentTarget.style.color = "#a5b4fc"; }}
              onMouseLeave={e => { e.currentTarget.style.gap = "4px"; e.currentTarget.style.color = "#818cf8"; }}
            >
              View full guide →
            </Link>
          </div>
        </div>

        <style>{`
          @media (max-width: 900px) {
            .how-grid { grid-template-columns: repeat(2, 1fr) !important; }
            .how-line { display: none !important; }
          }
          @media (max-width: 640px) {
            .how-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </section>

      {/* ── AI FEATURES ──────────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ background: "rgba(255,255,255,0.012)", overflowX: "hidden" }}>
        <div className="lp-container" style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div className="dh-reveal" style={{ marginBottom: "3.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: "#6366f1", marginBottom: 16 }}>
                Powered by AI
              </div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.25rem, 3.5vw, 3rem)", fontWeight: 800, letterSpacing: "-1.5px", color: "#fff", margin: "0 0 1rem" }}>
                Intelligence built into everything
              </h2>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "rgba(255,255,255,0.5)", lineHeight: 1.75, maxWidth: 520, margin: 0 }}>
                Six AI-powered systems working in concert — from fraud detection to dynamic pricing — so every hire is faster, safer, and smarter.
              </p>
            </div>
            <Link href="/for-employers" className="ai-see-all" style={{
              fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, color: "#818cf8",
              textDecoration: "none", flexShrink: 0, marginLeft: 32, paddingBottom: 4,
              transition: "color 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.color = "#a5b4fc"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#818cf8"; }}
            >
              See all features →
            </Link>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.25rem" }} className="ai-features-grid">
            {AI_FEATURES.map((f, i) => (
              <div key={i} className="dh-reveal" style={{
                ...CARD, padding: "2rem",
                transition: "border-color 0.2s, box-shadow 0.2s, transform 0.2s",
              }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = "rgba(99,102,241,0.3)";
                  el.style.boxShadow = "0 0 28px rgba(99,102,241,0.1)";
                  el.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = "rgba(255,255,255,0.07)";
                  el.style.boxShadow = "none";
                  el.style.transform = "translateY(0)";
                }}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.18)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                }}>
                  {f.icon}
                </div>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "#fff", margin: "1.25rem 0 0.5rem" }}>
                  {f.title}
                </h3>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.75, margin: 0 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

      </section>

      {/* ── FOR WORKERS ──────────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ background: "#0B1121", overflowX: "hidden" }}>
        <div className="lp-container alt-grid" style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6rem", alignItems: "center" }}>
          {/* LEFT: text */}
          <div style={{ maxWidth: 480 }}>
            <div className="dh-reveal" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: "#6366f1", fontFamily: "var(--font-body)", marginBottom: 16 }}>
              For Workers
            </div>
            <h2 className="dh-reveal" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.85rem, 2.5vw, 2.75rem)", fontWeight: 800, letterSpacing: "-1px", color: "#fff", margin: "0 0 1rem" }}>
              Built for ambitious global talent
            </h2>
            <p className="dh-reveal" style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "rgba(255,255,255,0.5)", lineHeight: 1.8, margin: "0 0 2rem", maxWidth: 460 }}>
              Create a verified profile, get matched by AI to thousands of international jobs, and manage every application in one dashboard.
            </p>
            <div className="dh-reveal" style={{ display: "flex", flexDirection: "column" as const, gap: "0.875rem", marginBottom: "2rem" }}>
              {WORKER_FEATURES.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <Check />
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 15, color: "rgba(255,255,255,0.75)" }}>{f.title}</span>
                </div>
              ))}
            </div>

            <Link href="/for-workers" className="dh-reveal" style={{
              fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 600, color: "#818cf8",
              textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4,
              transition: "gap 0.15s, color 0.15s", marginTop: "0.5rem",
            }}
              onMouseEnter={e => { e.currentTarget.style.gap = "8px"; e.currentTarget.style.color = "#a5b4fc"; }}
              onMouseLeave={e => { e.currentTarget.style.gap = "4px"; e.currentTarget.style.color = "#818cf8"; }}
            >
              Explore for workers →
            </Link>
          </div>

          {/* RIGHT: worker profile card */}
          <div className="dh-reveal" style={{ ...CARD, padding: "2rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed, #6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "#fff", flexShrink: 0 }}>RM</div>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600, color: "#fff" }}>Rohan Mehta</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Senior Backend Engineer</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>📍 India → 🇩🇪 Germany</div>
              </div>
              <div style={{ marginLeft: "auto", background: "rgba(16,185,129,0.1)", color: "#34d399", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-body)", whiteSpace: "nowrap" as const }}>Available</div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>AI Match Score</span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "#818cf8" }}>92%</span>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: "92%", height: "100%", background: "linear-gradient(90deg, var(--glass-indigo), var(--glass-purple))", borderRadius: 3 }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
              {["Node.js", "PostgreSQL", "TypeScript", "AWS"].map(s => (
                <span key={s} style={{ padding: "4px 12px", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 20, fontFamily: "var(--font-body)", fontSize: 12, color: "#a5b4fc", fontWeight: 500 }}>{s}</span>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {[["8 yrs", "Experience"], ["4.9★", "Rating"], ["12", "Placements"]].map(([v, l]) => (
                <div key={l} style={{ textAlign: "center" as const }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "#fff" }}>{v}</div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </section>

      {/* ── FOR EMPLOYERS ────────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ background: "rgba(255,255,255,0.012)", overflowX: "hidden" }}>
        <div className="lp-container alt-grid" style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6rem", alignItems: "center" }}>

          {/* LEFT: AI ranked candidates card */}
          <div className="dh-reveal" style={{ ...CARD, padding: "2rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2dd4bf" }} />
              <span style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "#2dd4bf" }}>AI Ranked Candidates</span>
            </div>
            {[
              { name: "Elena Rossi",  title: "Full-Stack Dev", score: 96, top: true  },
              { name: "Marcus Chen",  title: "Data Engineer",  score: 91, top: false },
              { name: "Sofia Almeida", title: "DevOps Eng",     score: 88, top: false },
            ].map((c, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: c.top ? "10px 12px" : "10px 0",
                border: c.top ? "1px solid rgba(45,212,191,0.2)" : "none",
                borderBottom: i < 2 && !c.top ? "1px solid rgba(255,255,255,0.05)" : undefined,
                borderRadius: c.top ? 12 : 0,
                background: c.top ? "rgba(20,184,166,0.06)" : "transparent",
                marginBottom: c.top ? 8 : 0,
              }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.top ? "linear-gradient(135deg, #14b8a6, #0d9488)" : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, color: c.top ? "#fff" : "rgba(255,255,255,0.3)", flexShrink: 0 }}>{i + 1}</div>
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
          </div>

          {/* RIGHT: text */}
          <div style={{ maxWidth: 480 }}>
            <div className="dh-reveal" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: "#6366f1", fontFamily: "var(--font-body)", marginBottom: 16 }}>
              For Employers
            </div>
            <h2 className="dh-reveal" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.85rem, 2.5vw, 2.75rem)", fontWeight: 800, letterSpacing: "-1px", color: "#fff", margin: "0 0 1rem" }}>
              Hire smarter, hire faster
            </h2>
            <p className="dh-reveal" style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "rgba(255,255,255,0.5)", lineHeight: 1.8, margin: "0 0 2rem" }}>
              Post a job and receive AI-ranked candidates within minutes. Every profile is fraud-verified, every match is scored to your exact requirements.
            </p>
            <div className="dh-reveal" style={{ display: "flex", flexDirection: "column" as const, gap: "0.875rem", marginBottom: "1.75rem" }}>
              {EMPLOYER_FEATURES.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <Check />
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 15, color: "rgba(255,255,255,0.75)" }}>{f.title}</span>
                </div>
              ))}
            </div>

            <Link href="/for-employers" className="dh-reveal" style={{
              fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 600, color: "#818cf8",
              textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4,
              transition: "gap 0.15s, color 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.gap = "8px"; e.currentTarget.style.color = "#a5b4fc"; }}
              onMouseLeave={e => { e.currentTarget.style.gap = "4px"; e.currentTarget.style.color = "#818cf8"; }}
            >
              Explore for employers →
            </Link>
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ background: "#0B1121", overflowX: "hidden" }}>
        <div className="lp-container" style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="dh-reveal" style={{ textAlign: "center" as const, marginBottom: "4rem" }}>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: "#6366f1", marginBottom: 16 }}>Pricing</div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem,3.5vw,3rem)", fontWeight: 800, letterSpacing: "-1.5px", color: "#fff", margin: "0 0 1rem" }}>
              Transparent global pricing
            </h2>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "rgba(255,255,255,0.45)", margin: 0 }}>
              Start free. Scale when you hire.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "1.5rem", alignItems: "start", maxWidth: 720, margin: "0 auto" }} className="pricing-grid">
            {PRICING_PLANS.map((plan, i) => (
              <div key={i} className="dh-reveal" style={{ position: "relative" as const }}>
                {plan.featured && (
                  <div style={{ textAlign: "center" as const, marginBottom: 10 }}>
                    <span style={{ display: "inline-block", background: "linear-gradient(135deg, var(--glass-indigo), var(--glass-purple))", color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-body)", padding: "4px 16px", borderRadius: 999, letterSpacing: "0.06em" }}>
                      Most popular
                    </span>
                  </div>
                )}
                <div style={{
                  ...(plan.featured ? {
                    background: "linear-gradient(#0B1121, #0B1121) padding-box, linear-gradient(135deg, var(--glass-indigo), var(--glass-purple)) border-box",
                    border: "1px solid transparent",
                    boxShadow: "0 0 48px rgba(99,102,241,0.2), 0 0 96px rgba(99,102,241,0.1)",
                  } : CARD),
                  borderRadius: 20,
                  padding: "2.5rem 2rem",
                  transform: plan.featured ? "scale(1.03)" : "none",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{plan.name}</div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 24, lineHeight: 1.6 }}>{plan.desc}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 28 }}>
                    <span style={{
                      fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 900,
                      letterSpacing: "-2px", lineHeight: 1,
                      ...(plan.featured ? {
                        background: "linear-gradient(135deg, var(--glass-indigo), var(--glass-purple))",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      } : { color: "#fff" }),
                    }}>{plan.price}</span>
                    {plan.period && <span style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "rgba(255,255,255,0.4)" }}>/month</span>}
                  </div>
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column" as const, gap: 12 }}>
                    {plan.features.map(f => (
                      <li key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Check />
                        <span style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "rgba(255,255,255,0.7)" }}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={plan.href} style={{
                    display: "block", textAlign: "center" as const, textDecoration: "none",
                    padding: "13px 0", borderRadius: 10, fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700,
                    ...(plan.featured ? {
                      background: "linear-gradient(135deg, var(--glass-indigo), var(--glass-purple))",
                      color: "#fff",
                      boxShadow: "0 0 24px rgba(99,102,241,0.3)",
                    } : {
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "rgba(255,255,255,0.75)",
                    }),
                    transition: "filter 0.2s",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.filter = "brightness(1.12)"; }}
                    onMouseLeave={e => { e.currentTarget.style.filter = "brightness(1)"; }}
                  >
                    {plan.cta}
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* FAQ accordion */}
          <div className="dh-reveal" style={{ marginTop: "4rem" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-1px", color: "#fff", margin: "0 0 2rem" }}>
              Common pricing questions
            </h3>
            <div style={{ maxWidth: 720 }}>
              {PRICING_FAQ.map((item, i) => (
                <div key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "20px 0", cursor: "pointer" }}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, color: "#fff" }}>{item.q}</span>
                    <span style={{ fontSize: 20, color: "rgba(255,255,255,0.3)", flexShrink: 0, marginLeft: 16, lineHeight: 1 }}>
                      {openFaq === i ? "−" : "+"}
                    </span>
                  </div>
                  {openFaq === i && (
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.75, margin: "12px 0 0", paddingRight: 32 }}>
                      {item.a}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ background: "rgba(255,255,255,0.012)", overflowX: "hidden" }}>
        <div className="lp-container" style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div className="dh-reveal" style={{ textAlign: "center" as const }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem,3.5vw,3rem)", fontWeight: 800, letterSpacing: "-1.5px", color: "#fff", margin: "0 0 1.25rem" }}>
              What working with DirectHire looks like
            </h2>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 17, color: "rgba(255,255,255,0.55)", lineHeight: 1.75, maxWidth: 640, margin: "0 auto" }}>
              AI-matched candidates, fraud-verified profiles, and a reservation system that keeps the process transparent from first contact to hire.
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ───────────────────────────────────────────────────────── */}
      <div style={{ margin: "4rem 1.5rem" }}>
        <section className="dh-reveal" style={{
          borderRadius: 28, padding: "6rem 2rem", textAlign: "center" as const,
          background: "linear-gradient(135deg, var(--glass-indigo) 0%, var(--glass-purple) 100%)",
          position: "relative" as const, overflow: "hidden",
        }}>
          {/* Grid shimmer */}
          <div aria-hidden style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }} />

          <div style={{ position: "relative" as const, zIndex: 1 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem,4vw,3rem)", fontWeight: 900, color: "#fff", margin: "0 0 1rem", letterSpacing: "-1.5px" }}>
              Ready to hire globally?
            </h2>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 17, color: "rgba(255,255,255,0.75)", margin: "0 0 2.5rem" }}>
              Be part of the future of global hiring.
            </p>
            <div className="cta-banner-buttons" style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" as const }}>
              <Link href="/register" style={{
                display: "inline-flex", alignItems: "center", padding: "15px 36px",
                background: "#fff", color: "#4F46E5", borderRadius: 12,
                fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700,
                textDecoration: "none", transition: "opacity 0.2s",
              }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.9"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
              >
                Get started free
              </Link>
              <Link href="/contact" style={{
                display: "inline-flex", alignItems: "center", padding: "15px 36px",
                background: "transparent", color: "#fff", borderRadius: 12,
                border: "2px solid rgba(255,255,255,0.35)",
                fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600,
                textDecoration: "none", transition: "border-color 0.2s",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.75)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.35)"; }}
              >
                Talk to sales
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* ── BRANDS ROW ───────────────────────────────────────────────────────── */}
      <div style={{ padding: "3rem 0", background: "rgba(255,255,255,0.01)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="lp-container" style={{ maxWidth: 1280, margin: "0 auto", textAlign: "center" as const }}>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "rgba(255,255,255,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: "1.5rem" }}>
            Integrated with tools you already use
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: "1rem", flexWrap: "wrap" as const }}>
            {["Stripe", "LinkedIn", "Google"].map(name => (
              <div key={name} style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8, padding: "10px 20px",
                fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600,
                color: "rgba(255,255,255,0.4)",
                whiteSpace: "nowrap" as const,
                transition: "color 0.15s, border-color 0.15s",
                cursor: "default",
              }}>
                {name}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Footer />

      {/* ── Global styles ─────────────────────────────────────────────────────── */}
      <style>{`
        .dh-reveal {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .dh-reveal.is-visible {
          opacity: 1;
          transform: translateY(0);
        }
        @keyframes ctaFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }
        @media (max-width: 768px) {
          .cta-float-card   { display: none !important; }
          .globe-float-card { display: none !important; }
        }

        /* ── Responsive container padding ── */
        .lp-container { padding-left: 2.5rem !important; padding-right: 2.5rem !important; }
        @media (min-width: 641px) and (max-width: 1023px) {
          .lp-container { padding-left: 1.5rem !important; padding-right: 1.5rem !important; }
        }
        @media (max-width: 640px) {
          .lp-container { padding-left: 1rem !important; padding-right: 1rem !important; }
        }

        /* ── Section padding: py-16 mobile → py-24 desktop ── */
        .lp-section { padding-top: 4rem !important; padding-bottom: 4rem !important; }
        @media (min-width: 1024px) {
          .lp-section { padding-top: 6rem !important; padding-bottom: 6rem !important; }
        }

        /* ── CTA buttons full-width on mobile ── */
        @media (max-width: 640px) {
          .cta-banner-buttons { flex-direction: column !important; align-items: stretch !important; }
          .cta-banner-buttons > a { width: 100% !important; justify-content: center !important; }
        }

        /* ── AI features grid ── */
        @media (max-width: 900px) {
          .ai-features-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .ai-see-all       { display: none !important; }
        }
        @media (max-width: 640px) {
          .ai-features-grid { grid-template-columns: 1fr !important; }
        }

        /* ── Pricing grid ── */
        @media (max-width: 900px) { .pricing-grid { grid-template-columns: 1fr !important; } }

        /* ── Alt grid (Workers / Employers) ── */
        @media (max-width: 900px) { .alt-grid { grid-template-columns: 1fr !important; gap: 2.5rem !important; } }
      `}</style>
    </div>
  );
}
