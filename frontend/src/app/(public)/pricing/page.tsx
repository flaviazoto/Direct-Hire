// frontend/src/app/pricing/page.tsx
import Link from "next/link";
import { Footer } from "@/components/Footer";

function Check({ color = "#34D399" }: { color?: string }) {
  return <span style={{ color, fontWeight:700, fontSize:16, marginRight:10 }}>✓</span>;
}

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
    cta:"Start Free Trial",
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
    cta:"Start Free Trial",
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
    cta:"Contact Sales",
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
    <main style={{ background:"var(--navy-950,#060B18)", minHeight:"100vh", color:"var(--text-primary,#F0F4FF)", overflowX:"hidden" }}>
      {/* HERO */}
      <section className="pub-hero" style={{ padding:"140px 32px 80px", textAlign:"center", background:"var(--navy-950,#060B18)", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:"-20%", left:"50%", transform:"translateX(-50%)", width:700, height:500, borderRadius:"50%", background:"rgba(0,144,255,0.07)", filter:"blur(120px)", pointerEvents:"none" }}/>
        <div className="container" style={{ position:"relative" }}>
          <div style={{
            display:"inline-flex", alignItems:"center", gap:8,
            padding:"6px 16px", borderRadius:999,
            background:"rgba(0,144,255,0.1)", border:"1px solid rgba(0,144,255,0.2)",
            marginBottom:24,
          }}>
            <span style={{ fontSize:12, fontWeight:700, color:"#60A5FA", fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)" }}>Simple, transparent pricing</span>
          </div>
          <h1 className="text-display-lg" style={{ color:"var(--text-primary,#F0F4FF)", marginBottom:20 }}>
            Plans for every hiring team
          </h1>
          <p className="text-body-lg" style={{ marginBottom:12 }}>
            All plans include a 14-day free trial. No credit card required until the trial ends.
          </p>
          <p style={{ fontSize:14, color:"var(--text-muted,#4A5980)", fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)" }}>Workers always register free. Application fees are charged per job application and vary by region.</p>
        </div>
      </section>

      {/* PLANS */}
      <section style={{ padding:"20px 0 100px", background:"var(--navy-950,#060B18)" }}>
        <div className="container">
          <div className="pricing-plans-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:24, alignItems:"start" }}>
            {PLANS.map(plan => (
              <div key={plan.id} style={{
                background:"var(--surface,#0F1C35)",
                border:plan.highlight ? "1px solid rgba(0,144,255,0.4)" : "1px solid var(--surface-border,#1E3258)",
                borderRadius:24, padding:"36px 32px", position:"relative",
                boxShadow:plan.highlight ? "0 0 40px rgba(0,144,255,0.12)" : "none",
              }}>
                {plan.highlight && (
                  <div style={{
                    position:"absolute", top:-14, left:"50%", transform:"translateX(-50%)",
                    background:"linear-gradient(135deg,#0090FF,#0070CC)",
                    color:"#F0F4FF", fontSize:11, fontWeight:800,
                    padding:"5px 16px", borderRadius:999,
                    letterSpacing:"0.08em", whiteSpace:"nowrap",
                    fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)",
                  }}>
                    MOST POPULAR
                  </div>
                )}
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontFamily:"var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)", fontWeight:800, fontSize:22, color:"var(--text-primary,#F0F4FF)", marginBottom:6 }}>{plan.name}</div>
                  <p style={{ fontSize:14, color:"var(--text-muted,#4A5980)", lineHeight:1.6, marginBottom:20, fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)" }}>{plan.desc}</p>
                  <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                    <span style={{
                      fontFamily:"var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)",
                      fontWeight:800, fontSize:48,
                      color:plan.highlight ? "#0090FF" : "var(--text-primary,#F0F4FF)",
                    }}>{plan.price}</span>
                    {plan.period && <span style={{ fontSize:15, color:"var(--text-muted,#4A5980)", fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)" }}>{plan.period}</span>}
                  </div>
                </div>

                <Link href={plan.id === "enterprise" ? "/contact" : "/register"}
                  className={plan.highlight ? "btn-primary" : "btn-secondary"}
                  style={{ display:"block", textAlign:"center", marginBottom:28 }}>
                  {plan.cta} →
                </Link>

                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display:"flex", alignItems:"flex-start", fontSize:14, color:"var(--text-primary,#F0F4FF)", fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)" }}>
                      <Check color={plan.highlight ? "#0090FF" : "#34D399"}/>{f}
                    </div>
                  ))}
                  {plan.notIncluded.map(f => (
                    <div key={f} style={{ display:"flex", alignItems:"center", fontSize:14, color:"var(--text-muted,#4A5980)", fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)" }}>
                      <span style={{ color:"var(--text-muted,#4A5980)", marginRight:10, fontWeight:700 }}>✕</span>{f}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARISON TABLE */}
      <section className="section-sm" style={{ background:"var(--navy-900,#0A1628)", borderTop:"1px solid var(--surface-border,#1E3258)" }}>
        <div className="container">
          <h2 className="text-display-md" style={{ color:"var(--text-primary,#F0F4FF)", marginBottom:40, textAlign:"center" }}>Full comparison</h2>
          <div className="pricing-table-shell" style={{ maxWidth:900, margin:"0 auto", border:"1px solid var(--surface-border,#1E3258)", borderRadius:20, overflow:"hidden" }}>
            <div className="pricing-table-row" style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", background:"var(--surface,#0F1C35)", padding:"14px 24px", borderBottom:"1px solid var(--surface-border,#1E3258)" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"var(--text-muted,#4A5980)", textTransform:"uppercase", letterSpacing:"0.06em", fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)" }}>Feature</div>
              {["Starter","Growth","Enterprise"].map(n => (
                <div key={n} style={{ fontSize:13, fontWeight:700, color:"var(--text-primary,#F0F4FF)", textAlign:"center", fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)" }}>{n}</div>
              ))}
            </div>
            {COMPARE.map((row, i) => (
              <div key={i} className="pricing-table-row" style={{
                display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr",
                padding:"14px 24px",
                borderBottom:i < COMPARE.length - 1 ? "1px solid rgba(30,50,88,0.5)" : "none",
                background:i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
              }}>
                <div style={{ fontSize:14, color:"var(--text-secondary,#8B9CC8)", fontWeight:500, fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)" }}>{row.feature}</div>
                {[row.starter, row.growth, row.enterprise].map((v, j) => (
                  <div key={j} style={{
                    fontSize:13, textAlign:"center",
                    color:v === "✕" ? "var(--text-muted,#4A5980)" : v === "✓" ? "#34D399" : "var(--text-primary,#F0F4FF)",
                    fontWeight:v === "✕" || v === "✓" ? 700 : 500,
                    fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)",
                  }}>{v}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WORKER PRICING */}
      <section className="section-sm" style={{ background:"var(--navy-950,#060B18)", borderTop:"1px solid var(--surface-border,#1E3258)" }}>
        <div className="container" style={{ textAlign:"center" }}>
          <h2 className="text-display-md" style={{ color:"var(--text-primary,#F0F4FF)", marginBottom:16 }}>Worker pricing</h2>
          <p className="text-body" style={{ maxWidth:640, margin:"0 auto 32px" }}>
            Registering and building your profile is completely free. A small application fee applies when you apply to a specific job post. This fee varies based on the region, job salary level, and market demand — typically between <strong style={{ color:"var(--text-primary,#F0F4FF)" }}>€8 and €85</strong>.
          </p>
          <div className="worker-pricing-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, maxWidth:600, margin:"0 auto" }}>
            {[
              { label:"Profile creation", value:"Free",   color:"#34D399" },
              { label:"AI job matching",  value:"Free",   color:"#34D399" },
              { label:"Application fee",  value:"€8–€85", color:"#0090FF" },
            ].map(({ label, value, color }) => (
              <div key={label} className="card-surface" style={{ padding:"24px 20px" }}>
                <div style={{ fontFamily:"var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)", fontWeight:800, fontSize:26, color, marginBottom:6 }}>{value}</div>
                <div style={{ fontSize:14, color:"var(--text-muted,#4A5980)", fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-sm" style={{ background:"var(--navy-900,#0A1628)", borderTop:"1px solid var(--surface-border,#1E3258)" }}>
        <div className="container">
          <h2 className="text-display-md" style={{ color:"var(--text-primary,#F0F4FF)", marginBottom:40, textAlign:"center" }}>Pricing FAQ</h2>
          <div style={{ maxWidth:700, margin:"0 auto" }}>
            {[
              { q:"Is the 14-day trial really free?", a:"Yes. No credit card is required to start. You get full access to your chosen plan for 14 days. Your card is only charged after the trial ends — or you can cancel before then at no cost." },
              { q:"Can I switch plans?", a:"Yes, you can upgrade or downgrade at any time. Changes take effect at the start of the next billing cycle. Upgrades take effect immediately." },
              { q:"What happens to my data if I cancel?", a:"You retain access until your billing period ends. After cancellation, your data is retained for 30 days then permanently deleted, in compliance with GDPR." },
              { q:"Do you offer discounts for staffing agencies?", a:"Yes. Contact our sales team for volume pricing, staffing agency rates, and custom enterprise agreements." },
            ].map((item, i, arr) => (
              <div key={i} style={{ padding:"24px 0", borderBottom:i < arr.length - 1 ? "1px solid var(--surface-border,#1E3258)" : "none" }}>
                <div style={{ fontFamily:"var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)", fontWeight:700, fontSize:17, color:"var(--text-primary,#F0F4FF)", marginBottom:10 }}>{item.q}</div>
                <p style={{ fontSize:15, color:"var(--text-muted,#4A5980)", lineHeight:1.65, fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)" }}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-sm" style={{ background:"var(--navy-950,#060B18)", borderTop:"1px solid var(--surface-border,#1E3258)", textAlign:"center", overflow:"hidden", position:"relative" }}>
        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:600, height:400, borderRadius:"50%", background:"rgba(0,144,255,0.06)", filter:"blur(80px)", pointerEvents:"none" }}/>
        <div className="container" style={{ position:"relative" }}>
          <h2 className="text-display-md" style={{ color:"var(--text-primary,#F0F4FF)", marginBottom:16 }}>Start your free trial today</h2>
          <p className="text-body" style={{ maxWidth:440, margin:"0 auto 32px" }}>14 days free on all plans. No credit card required.</p>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            <Link href="/register" className="btn-primary">Start Free Trial →</Link>
            <Link href="/contact" className="btn-secondary">Talk to Sales</Link>
          </div>
        </div>
      </section>

      <Footer />

      <style>{`
        @media (max-width: 767px) {
          .pricing-plans-grid  { grid-template-columns: 1fr !important; }
          .worker-pricing-grid { grid-template-columns: 1fr !important; }
          .pricing-table-shell { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .pricing-table-row   { min-width: 580px !important; }
        }
        @media (max-width: 900px) and (min-width: 768px) {
          .pricing-plans-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <style>{`
        @media (max-width: 1024px) {
          .pricing-plans-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 700px) {
          .pricing-plans-grid,
          .worker-pricing-grid { grid-template-columns: 1fr !important; }
          .pricing-table-shell { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .pricing-table-row { min-width: 680px; }
        }
      `}</style>
    </main>
  );
}
