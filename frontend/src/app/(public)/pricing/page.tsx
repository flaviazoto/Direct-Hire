"use client";
// frontend/src/app/pricing/page.tsx
import { useEffect, useState } from "react";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { publicConfigApi } from "@/lib/api-client";

// DirectHire glassmorphism design system, public pages. Two real products,
// no fictional tiers: the "For Employers" card is the one paid subscription,
// so it gets the employer role color (violet) as its accent on top of the
// shared dark-glass base — everywhere else on this page is neutral brand
// chrome. The dedicated "Worker pricing" section below uses the worker role
// color (teal) instead, since that content is specifically about workers.
// Currency figures use font-mono/tabular-nums per the numerics rule. Cards
// here are a small, static set (not a scrolling list), so backdrop-blur via
// .glass-card is fine per the performance rule.

function Check({ color = "#4ade80" }: { color?: string }) {
  return <span style={{ color, fontWeight: 700, fontSize: 16, marginRight: 10 }}>✓</span>;
}

const BTN_PRIMARY: React.CSSProperties = {
  display: "block", textAlign: "center", padding: "14px 28px",
  borderRadius: 10, fontSize: 15, fontWeight: 500, textDecoration: "none",
  background: "#6D28D9", color: "#fff",
};

const BTN_SECONDARY: React.CSSProperties = {
  display: "block", textAlign: "center", padding: "14px 28px",
  borderRadius: 10, fontSize: 15, fontWeight: 500, textDecoration: "none",
  background: "transparent", color: "#ffffff", border: "1px solid rgba(255,255,255,0.1)",
};

interface LockRate { dailyRateCents: number; maxDays: number; maxConcurrent: number; rateDisplay: string }
interface EmployerPrice { amountCents: number; currency: string; interval: string }

export default function PricingPage() {
  const [employerPrice, setEmployerPrice] = useState<EmployerPrice | null>(null);
  const [lockRate, setLockRate] = useState<LockRate | null>(null);

  useEffect(() => {
    publicConfigApi.getPricing().then(r => {
      const data = (r as { success: boolean; data?: { lock: LockRate; employerPrice: EmployerPrice | null } }).data;
      if ((r as { success: boolean }).success && data) {
        setLockRate(data.lock);
        setEmployerPrice(data.employerPrice);
      }
    });
  }, []);

  const employerPriceDisplay = employerPrice
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: employerPrice.currency.toUpperCase(), maximumFractionDigits: 2 }).format(employerPrice.amountCents / 100)
    : null;

  const lockLine = lockRate
    ? `Worker Lock — reserve up to ${lockRate.maxConcurrent} candidates, up to ${lockRate.maxDays} days each (${lockRate.rateDisplay}/day)`
    : "Worker Lock — reserve candidates exclusively for a limited time (a daily fee applies separately)";

  const PLANS = [
    {
      id: "worker", name: "For Workers", price: "Free", period: "", href: "/register?role=worker",
      desc: "Create a profile and get AI-matched to open roles.",
      highlight: false,
      features: [
        "AI-powered job matching",
        "Fraud-verified employers",
        "Application tracking",
        "Pay only when you apply — $1 to $25 per application, based on role and demand",
      ],
      cta: "Get started free",
    },
    {
      id: "employer", name: "For Employers", price: employerPriceDisplay ?? "Pricing available after signup", period: employerPriceDisplay ? "/month" : "", href: "/register?role=employer",
      desc: "Post jobs and access AI-ranked candidates.",
      highlight: true,
      features: [
        "Unlimited job posts",
        "AI-ranked candidates",
        "Fraud detection — included for every user, not a paid tier",
        lockLine,
        "14-day free trial, no credit card required",
      ],
      cta: "Start free trial",
    },
  ];

  return (
    <main style={{ background:"var(--glass-base)", minHeight:"100vh", color:"#ffffff", overflowX:"hidden" }}>
      {/* HERO */}
      <section className="pub-hero" style={{ padding:"140px 32px 80px", textAlign:"center", background:"var(--glass-base)", position: "relative", overflow: "hidden" }}>
        <div aria-hidden className="glass-glow" style={{ top: -120, left: "50%", transform: "translateX(-50%)", width: 600, height: 500, background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)" }} />
        <div className="container" style={{ position: "relative" }}>
          <div style={{
            display:"inline-flex", alignItems:"center", gap:8,
            padding:"6px 16px", borderRadius:999,
            background:"rgba(99,102,241,0.1)", border:"1px solid rgba(99,102,241,0.25)",
            marginBottom:24,
          }}>
            <span style={{ fontSize:12, fontWeight:600, color:"#818cf8", fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)" }}>Simple, transparent pricing</span>
          </div>
          <h1 style={{ fontFamily:"var(--font-display,'Manrope',system-ui,sans-serif)", fontWeight:700, fontSize:"clamp(2rem, 4vw, 3.5rem)", lineHeight:1.1, letterSpacing:"-0.02em", color:"#ffffff", marginBottom:20 }}>
            Pricing for workers and employers
          </h1>
          <p style={{ fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)", fontSize:18, lineHeight:1.7, color:"#cbd5e1", marginBottom:12 }}>
            Workers register free — always. Employers get a 14-day free trial, no credit card required.
          </p>
          <p style={{ fontSize:14, color:"#94a3b8", fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)" }}>Workers always register free. Application fees are charged per job application and vary by region.</p>
        </div>
      </section>

      {/* PLANS */}
      <section style={{ padding:"20px 0 100px", background:"var(--glass-base)" }}>
        <div className="container">
          <div className="pricing-plans-grid" style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:24, alignItems:"start", maxWidth: 760, margin: "0 auto" }}>
            {PLANS.map(plan => (
              <div key={plan.id} className="glass-card" style={{
                borderColor: plan.highlight ? "rgba(124,58,237,0.4)" : undefined,
                boxShadow: plan.highlight ? "0 4px 24px rgba(124,58,237,0.2), 0 25px 50px -12px rgba(0,0,0,0.5)" : undefined,
                padding:"36px 32px", position:"relative",
              }}>
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontFamily:"var(--font-display,'Manrope',system-ui,sans-serif)", fontWeight:700, fontSize:20, color:"#ffffff", marginBottom:6 }}>{plan.name}</div>
                  <p style={{ fontSize:14, color:"#94a3b8", lineHeight:1.6, marginBottom:20, fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)" }}>{plan.desc}</p>
                  <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                    <span style={{
                      fontFamily:"var(--font-mono)", fontVariantNumeric:"tabular-nums",
                      fontWeight:600, fontSize: plan.price.length > 12 ? 20 : 44,
                      color:plan.highlight ? "#a78bfa" : "#ffffff",
                    }}>{plan.price}</span>
                    {plan.period && <span style={{ fontSize:15, color:"#94a3b8", fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)" }}>{plan.period}</span>}
                  </div>
                </div>

                <Link href={plan.href}
                  className={plan.highlight ? "btn-gradient" : "btn-glass"}
                  style={{ ...(plan.highlight ? {} : BTN_SECONDARY), marginBottom:28, textAlign: "center" }}>
                  {plan.cta} →
                </Link>

                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display:"flex", alignItems:"flex-start", fontSize:14, color:"#cbd5e1", fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)" }}>
                      <Check color={plan.highlight ? "#a78bfa" : "#4ade80"}/>{f}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WORKER PRICING — worker role color (teal), this section is specifically about workers */}
      <section className="section-sm" style={{ background:"var(--glass-base)", borderTop:"1px solid rgba(255,255,255,0.07)" }}>
        <div className="container" style={{ textAlign:"center" }}>
          <h2 style={{ fontFamily:"var(--font-display,'Manrope',system-ui,sans-serif)", fontWeight:600, fontSize:"clamp(1.5rem, 3vw, 2.25rem)", color:"#ffffff", marginBottom:16 }}>Worker pricing</h2>
          <p style={{ fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)", fontSize:16, lineHeight:1.65, color:"#cbd5e1", maxWidth:640, margin:"0 auto 32px" }}>
            Registering and building your profile is completely free. A small application fee applies when you apply to a specific job post. This fee varies based on the region, job salary level, and market demand — typically between <strong style={{ color:"#ffffff" }}>$1.00 and $25.00</strong>.
          </p>
          <div className="worker-pricing-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, maxWidth:600, margin:"0 auto" }}>
            {[
              { label:"Profile creation", value:"Free",         color:"#2dd4bf" },
              { label:"AI job matching",  value:"Free",         color:"#2dd4bf" },
              { label:"Application fee",  value:"$1.00–$25.00", color:"#2dd4bf" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding:"24px 20px", background:"rgba(20,184,166,0.08)", border:"1px solid rgba(20,184,166,0.25)", borderRadius:10 }}>
                <div style={{ fontFamily:"var(--font-mono)", fontVariantNumeric:"tabular-nums", fontWeight:600, fontSize:24, color, marginBottom:6 }}>{value}</div>
                <div style={{ fontSize:14, color:"#94a3b8", fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-sm" style={{ background:"rgba(255,255,255,0.02)", borderTop:"1px solid rgba(255,255,255,0.07)" }}>
        <div className="container">
          <h2 style={{ fontFamily:"var(--font-display,'Manrope',system-ui,sans-serif)", fontWeight:600, fontSize:"clamp(1.5rem, 3vw, 2.25rem)", color:"#ffffff", marginBottom:40, textAlign:"center" }}>Pricing FAQ</h2>
          <div style={{ maxWidth:700, margin:"0 auto" }}>
            {[
              { q:"Is the 14-day trial really free?", a:"Yes. No credit card is required to start. You get full access to your chosen plan for 14 days. Your card is only charged after the trial ends — or you can cancel before then at no cost." },
              { q:"What happens to my data if I cancel?", a:<>Canceling your subscription stops future billing — your account and data remain exactly as they were. If you want your data deleted entirely, see our <Link href="/privacy" style={{ color: "#a78bfa" }}>Privacy Policy</Link> for how to request account deletion.</> },
            ].map((item, i, arr) => (
              <div key={i} style={{ padding:"24px 0", borderBottom:i < arr.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none" }}>
                <div style={{ fontFamily:"var(--font-display,'Manrope',system-ui,sans-serif)", fontWeight:600, fontSize:17, color:"#ffffff", marginBottom:10 }}>{item.q}</div>
                <p style={{ fontSize:15, color:"#94a3b8", lineHeight:1.65, fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)" }}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-sm" style={{ background:"var(--glass-base)", borderTop:"1px solid rgba(255,255,255,0.07)", textAlign:"center" }}>
        <div className="container">
          <h2 style={{ fontFamily:"var(--font-display,'Manrope',system-ui,sans-serif)", fontWeight:600, fontSize:"clamp(1.5rem, 3vw, 2.25rem)", color:"#ffffff", marginBottom:16 }}>Start your free trial today</h2>
          <p style={{ fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)", fontSize:16, lineHeight:1.65, color:"#cbd5e1", maxWidth:440, margin:"0 auto 32px" }}>14-day free trial for employers. No credit card required.</p>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            <Link href="/register" className="btn-gradient" style={{ display:"inline-block", padding:"14px 32px" }}>Start free trial →</Link>
            <Link href="/contact" className="btn-glass" style={{ display:"inline-block", padding:"14px 32px" }}>Talk to sales</Link>
          </div>
        </div>
      </section>

      <Footer />

      <style>{`
        @media (max-width: 767px) {
          .pricing-plans-grid,
          .worker-pricing-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
