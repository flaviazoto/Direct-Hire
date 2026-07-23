// frontend/src/app/pricing/page.tsx
import Link from "next/link";
import { Footer } from "@/components/Footer";

// DirectHire glassmorphism design system, public pages. The highlighted
// "Growth" plan is employer subscription content, so it gets the employer
// role color (violet) as its accent on top of the shared dark-glass base —
// everywhere else on this page is neutral brand chrome. The dedicated
// "Worker pricing" section below uses the worker role color (teal) instead,
// since that content is specifically about workers. Currency figures use
// font-mono/tabular-nums per the numerics rule. Cards here are a small,
// static set (not a scrolling list), so backdrop-blur via .glass-card is
// fine per the performance rule.

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

const PLANS = [
  {
    id:"starter", name:"Starter", price:"€149", period:"/month",
    desc:"Perfect for small companies making their first international hires.",
    highlight:false,
    features:[
      "5 active job posts",
      "Up to 10 AI candidate matches per post",
      "Basic match score breakdown",
      "Worker contact via platform",
      "Email support (48h response)",
      "Basic analytics dashboard",
    ],
    notIncluded:["Worker Lock™","Advanced analytics","Priority support","API access"],
    cta:"Start free trial",
  },
  {
    id:"growth", name:"Growth", price:"€349", period:"/month",
    desc:"For growing teams that need scale, speed, and exclusive candidate holds.",
    highlight:true,
    features:[
      "20 active job posts",
      "Unlimited AI candidate matches",
      "Full score breakdowns + risk flags",
      "Worker Lock™ — up to 3 concurrent",
      "Priority support (4h response)",
      "Advanced analytics & reporting",
      "Interview scheduling tools",
      "Bulk candidate management",
    ],
    notIncluded:["API access","Dedicated account manager"],
    cta:"Start free trial",
  },
  {
    id:"enterprise", name:"Enterprise", price:"Custom", period:"",
    desc:"For high-volume recruiters and staffing agencies with complex needs.",
    highlight:false,
    features:[
      "Unlimited job posts",
      "Unlimited AI matches",
      "Worker Lock™ — unlimited concurrent",
      "Dedicated account manager",
      "API access + webhooks",
      "Custom analytics & reporting",
      "SLA guarantee",
      "White-glove onboarding",
      "Custom compliance documentation",
    ],
    notIncluded:[],
    cta:"Contact sales",
  },
];

const COMPARE = [
  { feature:"Active job posts",      starter:"5",       growth:"20",           enterprise:"Unlimited"     },
  { feature:"AI candidate matches",  starter:"10/post", growth:"Unlimited",    enterprise:"Unlimited"     },
  { feature:"Match score breakdown", starter:"Basic",   growth:"Full",         enterprise:"Full + custom" },
  { feature:"Worker Lock™",          starter:"✕",       growth:"3 concurrent", enterprise:"Unlimited"     },
  { feature:"Fraud risk flags",      starter:"✓",       growth:"✓",            enterprise:"✓"             },
  { feature:"Analytics dashboard",   starter:"Basic",   growth:"Advanced",     enterprise:"Custom"        },
  { feature:"Support",               starter:"Email 48h", growth:"Priority 4h", enterprise:"Dedicated"   },
  { feature:"API access",            starter:"✕",       growth:"✕",            enterprise:"✓"             },
];

export default function PricingPage() {
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
            Plans for every hiring team
          </h1>
          <p style={{ fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)", fontSize:18, lineHeight:1.7, color:"#cbd5e1", marginBottom:12 }}>
            All plans include a 14-day free trial. No credit card required until the trial ends.
          </p>
          <p style={{ fontSize:14, color:"#94a3b8", fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)" }}>Workers always register free. Application fees are charged per job application and vary by region.</p>
        </div>
      </section>

      {/* PLANS */}
      <section style={{ padding:"20px 0 100px", background:"var(--glass-base)" }}>
        <div className="container">
          <div className="pricing-plans-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:24, alignItems:"start" }}>
            {PLANS.map(plan => (
              <div key={plan.id} className="glass-card" style={{
                borderColor: plan.highlight ? "rgba(124,58,237,0.4)" : undefined,
                boxShadow: plan.highlight ? "0 4px 24px rgba(124,58,237,0.2), 0 25px 50px -12px rgba(0,0,0,0.5)" : undefined,
                padding:"36px 32px", position:"relative",
              }}>
                {plan.highlight && (
                  <div style={{
                    position:"absolute", top:-14, left:"50%", transform:"translateX(-50%)",
                    background:"linear-gradient(135deg, #7C3AED, #6D28D9)",
                    color:"#fff", fontSize:11, fontWeight:700,
                    padding:"5px 16px", borderRadius:999,
                    letterSpacing:"0.08em", whiteSpace:"nowrap",
                    fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)",
                  }}>
                    MOST POPULAR
                  </div>
                )}
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontFamily:"var(--font-display,'Manrope',system-ui,sans-serif)", fontWeight:700, fontSize:20, color:"#ffffff", marginBottom:6 }}>{plan.name}</div>
                  <p style={{ fontSize:14, color:"#94a3b8", lineHeight:1.6, marginBottom:20, fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)" }}>{plan.desc}</p>
                  <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                    <span style={{
                      fontFamily:"var(--font-mono)", fontVariantNumeric:"tabular-nums",
                      fontWeight:600, fontSize:44,
                      color:plan.highlight ? "#a78bfa" : "#ffffff",
                    }}>{plan.price}</span>
                    {plan.period && <span style={{ fontSize:15, color:"#94a3b8", fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)" }}>{plan.period}</span>}
                  </div>
                </div>

                <Link href={plan.id === "enterprise" ? "/contact" : "/register"}
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
                  {plan.notIncluded.map(f => (
                    <div key={f} style={{ display:"flex", alignItems:"center", fontSize:14, color:"#64748b", fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)" }}>
                      <span style={{ color:"#64748b", marginRight:10, fontWeight:700 }}>✕</span>{f}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARISON TABLE */}
      <section className="section-sm" style={{ background:"rgba(255,255,255,0.02)", borderTop:"1px solid rgba(255,255,255,0.07)" }}>
        <div className="container">
          <h2 style={{ fontFamily:"var(--font-display,'Manrope',system-ui,sans-serif)", fontWeight:600, fontSize:"clamp(1.5rem, 3vw, 2.25rem)", color:"#ffffff", marginBottom:40, textAlign:"center" }}>Full comparison</h2>
          <div className="pricing-table-shell glass-card" style={{ maxWidth:900, margin:"0 auto", overflow:"hidden" }}>
            <div className="pricing-table-row" style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", background:"rgba(255,255,255,0.04)", padding:"14px 24px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.06em", fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)" }}>Feature</div>
              {["Starter","Growth","Enterprise"].map(n => (
                <div key={n} style={{ fontSize:13, fontWeight:700, color:"#ffffff", textAlign:"center", fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)" }}>{n}</div>
              ))}
            </div>
            {COMPARE.map((row, i) => (
              <div key={i} className="pricing-table-row" style={{
                display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr",
                padding:"14px 24px",
                borderBottom:i < COMPARE.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none",
                background:i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
              }}>
                <div style={{ fontSize:14, color:"#cbd5e1", fontWeight:500, fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)" }}>{row.feature}</div>
                {[row.starter, row.growth, row.enterprise].map((v, j) => (
                  <div key={j} style={{
                    fontSize:13, textAlign:"center",
                    fontFamily: /^[0-9]/.test(v) ? "var(--font-mono)" : "var(--font-body,'Inter',system-ui,sans-serif)",
                    color:v === "✕" ? "#64748b" : v === "✓" ? "#4ade80" : "#ffffff",
                    fontWeight:v === "✕" || v === "✓" ? 700 : 500,
                  }}>{v}</div>
                ))}
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
            Registering and building your profile is completely free. A small application fee applies when you apply to a specific job post. This fee varies based on the region, job salary level, and market demand — typically between <strong style={{ color:"#ffffff" }}>€8 and €85</strong>.
          </p>
          <div className="worker-pricing-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, maxWidth:600, margin:"0 auto" }}>
            {[
              { label:"Profile creation", value:"Free",   color:"#2dd4bf" },
              { label:"AI job matching",  value:"Free",   color:"#2dd4bf" },
              { label:"Application fee",  value:"€8–€85", color:"#2dd4bf" },
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
              { q:"Can I switch plans?", a:"Yes, you can upgrade or downgrade at any time. Changes take effect at the start of the next billing cycle. Upgrades take effect immediately." },
              { q:"What happens to my data if I cancel?", a:"You retain access until your billing period ends. After cancellation, your data is retained for 30 days then permanently deleted, in compliance with GDPR." },
              { q:"Do you offer discounts for staffing agencies?", a:"Yes. Contact our sales team for volume pricing, staffing agency rates, and custom enterprise agreements." },
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
          <p style={{ fontFamily:"var(--font-body,'Inter',system-ui,sans-serif)", fontSize:16, lineHeight:1.65, color:"#cbd5e1", maxWidth:440, margin:"0 auto 32px" }}>14 days free on all plans. No credit card required.</p>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            <Link href="/register" className="btn-gradient" style={{ display:"inline-block", padding:"14px 32px" }}>Start free trial →</Link>
            <Link href="/contact" className="btn-glass" style={{ display:"inline-block", padding:"14px 32px" }}>Talk to sales</Link>
          </div>
        </div>
      </section>

      <Footer />

      <style>{`
        @media (max-width: 1024px) {
          .pricing-plans-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 767px) {
          .pricing-plans-grid,
          .worker-pricing-grid { grid-template-columns: 1fr !important; }
          .pricing-table-shell { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .pricing-table-row   { min-width: 620px !important; }
        }
      `}</style>
    </main>
  );
}
