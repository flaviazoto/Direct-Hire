"use client";

import { useState, useEffect } from "react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

const TOC_ITEMS = [
  { id: "section-1", label: "1. Acceptance of Terms"      },
  { id: "section-2", label: "2. Account Registration"     },
  { id: "section-3", label: "3. Worker Terms"             },
  { id: "section-4", label: "4. Employer Terms"           },
  { id: "section-5", label: "5. Payments and Refunds"     },
  { id: "section-6", label: "6. Prohibited Conduct"       },
  { id: "section-7", label: "7. Limitation of Liability"  },
  { id: "section-8", label: "8. Governing Law"            },
  { id: "section-9", label: "9. Contact"                  },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} style={{ marginBottom: 52, scrollMarginTop: 110 }}>
      <h2 style={{
        fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)",
        fontWeight: 700, fontSize: 22, color: "var(--text-primary,#F0F4FF)",
        marginBottom: 16, paddingBottom: 12,
        borderBottom: "2px solid rgba(0,144,255,0.15)",
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 15, color: "var(--text-muted,#4A5980)",
      lineHeight: 1.85, marginBottom: 14,
      fontFamily: "var(--font-body,'DM Sans',system-ui,sans-serif)",
    }}>
      {children}
    </p>
  );
}

export default function TermsPage() {
  const [active, setActive] = useState("section-1");

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    TOC_ITEMS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <main style={{ background: "var(--navy-950,#060B18)", minHeight: "100vh", color: "var(--text-primary,#F0F4FF)" }}>
      <Nav />

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{
        background: "var(--navy-950,#060B18)",
        padding: "140px 32px 60px",
        position: "relative", overflow: "hidden",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 600, height: 400, background: "radial-gradient(ellipse, rgba(0,144,255,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="container" style={{ position: "relative" }}>
          <div style={{ display: "inline-flex", padding: "6px 16px", borderRadius: 999, background: "rgba(0,144,255,0.1)", border: "1px solid rgba(0,144,255,0.2)", marginBottom: 24 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#60A5FA", letterSpacing: "0.08em", textTransform: "uppercase" as const, fontFamily: "var(--font-body)" }}>Legal</span>
          </div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontWeight: 800,
            fontSize: "clamp(2.5rem,4vw,3.5rem)", letterSpacing: "-2px",
            color: "#F0F4FF", marginBottom: 12, lineHeight: 1.1,
          }}>
            Terms of Service
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", fontFamily: "var(--font-body)" }}>
            Last updated: January 2025
          </p>
        </div>
      </section>

      {/* ── CONTENT + SIDEBAR ────────────────────────────────────────────────── */}
      <section style={{ padding: "72px 32px 120px", background: "var(--navy-900,#0A1628)" }}>
        <div className="container">

          {/* Notice banner */}
          <div style={{ background: "rgba(0,144,255,0.06)", border: "1px solid rgba(0,144,255,0.15)", borderRadius: 14, padding: "18px 22px", marginBottom: 56 }}>
            <p style={{ fontSize: 14, color: "#60A5FA", fontWeight: 500, lineHeight: 1.65, margin: 0, fontFamily: "var(--font-body)" }}>
              Please read these Terms of Service carefully before using the DirectHire platform. By creating an account, you agree to be bound by these terms.
            </p>
          </div>

          <div className="legal-layout" style={{ display: "flex", gap: 64, alignItems: "flex-start" }}>

            {/* Left: sticky TOC */}
            <aside className="legal-toc" style={{ width: 240, flexShrink: 0, position: "sticky" as const, top: 100, alignSelf: "flex-start" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase" as const, letterSpacing: "0.1em", fontFamily: "var(--font-body)", marginBottom: 16 }}>
                Contents
              </div>
              <nav style={{ display: "flex", flexDirection: "column" as const, gap: 0 }}>
                {TOC_ITEMS.map(item => {
                  const isActive = active === item.id;
                  return (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      style={{
                        fontSize: 13, padding: "6px 0 6px 12px",
                        borderLeft: `2px solid ${isActive ? "var(--blue-500,#0090FF)" : "transparent"}`,
                        color: isActive ? "var(--blue-400,#60A5FA)" : "rgba(255,255,255,0.5)",
                        textDecoration: "none", fontFamily: "var(--font-body)",
                        transition: "color 0.15s, border-color 0.15s",
                        lineHeight: 1.5,
                      }}
                      onMouseEnter={e => {
                        if (!isActive) (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.8)";
                      }}
                      onMouseLeave={e => {
                        if (!isActive) (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.5)";
                      }}
                    >
                      {item.label}
                    </a>
                  );
                })}
              </nav>
            </aside>

            {/* Right: content */}
            <div style={{ flex: 1, maxWidth: 720 }}>
              <Section id="section-1" title="1. Acceptance of Terms">
                <P>By accessing or using the DirectHire platform (the &ldquo;Service&rdquo;), you agree to be bound by these Terms of Service. If you do not agree, you may not use the Service.</P>
                <P>DirectHire Ltd (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the Service and reserves the right to modify these terms at any time. We will notify you of material changes by email or through the platform. Continued use after changes constitutes acceptance.</P>
              </Section>

              <Section id="section-2" title="2. Account Registration">
                <P>You must be at least 18 years of age to create an account. You are responsible for maintaining the confidentiality of your credentials and for all activity that occurs under your account.</P>
                <P>You agree to provide accurate, current, and complete information during registration and to update this information as necessary. We reserve the right to suspend or terminate accounts with inaccurate or misleading information.</P>
                <P>Passport numbers and other sensitive identity documents submitted to DirectHire are stored encrypted using AES-256-GCM encryption and are used solely for employment verification purposes.</P>
              </Section>

              <Section id="section-3" title="3. Worker Terms">
                <P>Workers may create a profile, upload verification materials, and apply to job postings. Profile creation is free. An application fee applies when applying to specific job posts. Fees are displayed before you confirm any application.</P>
                <P>You must not create duplicate accounts, provide false identity documents, or misrepresent your skills or experience. Violation of these terms may result in immediate account suspension and forfeiture of any fees paid.</P>
                <P>By uploading videos and documents, you grant DirectHire a limited licence to store and display your materials to verified employers. We do not share your materials with third parties outside the platform.</P>
              </Section>

              <Section id="section-4" title="4. Employer Terms">
                <P>Employers must have a legitimate, registered business entity to use the platform. You agree to comply with all applicable employment laws, immigration laws, and visa regulations in your country and in the countries from which you hire workers.</P>
                <P>Job postings must be genuine. You may not use the platform to collect worker data without the intention of hiring. Fraudulent postings will result in immediate account termination and possible legal action.</P>
                <P>Worker Lock™ is a paid feature that provides exclusive candidate access for a defined period. Fees are billed daily and are non-refundable once a lock period begins.</P>
              </Section>

              <Section id="section-5" title="5. Payments and Refunds">
                <P>Subscription fees are billed monthly in advance. Application fees are charged per application and are non-refundable. Worker Lock™ daily fees are charged at the start of each day and are non-refundable.</P>
                <P>Subscription plans may be cancelled at any time. Cancellation takes effect at the end of the current billing period. We do not provide pro-rata refunds for unused subscription time.</P>
              </Section>

              <Section id="section-6" title="6. Prohibited Conduct">
                <P>You may not: (a) circumvent the platform to hire workers or be hired outside of it to avoid fees; (b) scrape or harvest any data from the platform; (c) use the platform for any unlawful purpose; (d) impersonate any person or entity; (e) upload malware or harmful code.</P>
              </Section>

              <Section id="section-7" title="7. Limitation of Liability">
                <P>DirectHire is a technology platform that facilitates connections between workers and employers. We do not guarantee employment outcomes. To the maximum extent permitted by law, DirectHire&apos;s liability for any claim arising from use of the platform is limited to the fees you paid us in the three months preceding the claim.</P>
              </Section>

              <Section id="section-8" title="8. Governing Law">
                <P>These Terms are governed by the laws of Albania. Any disputes shall be submitted to the exclusive jurisdiction of the courts of Tirana, Albania.</P>
              </Section>

              <Section id="section-9" title="9. Contact">
                <P>For questions about these Terms, contact us at legal@directhire.io or write to: DirectHire Ltd, Rruga e Durrësit 42, Tirana, Albania.</P>
              </Section>

              {/* Footer strip */}
              <div style={{ borderTop: "1px solid var(--surface-border,#1E3258)", paddingTop: 32, marginTop: 16, display: "flex", gap: 24, flexWrap: "wrap" as const }}>
                <a href="/privacy" style={{ fontSize: 13, color: "#60A5FA", textDecoration: "none", fontWeight: 500, fontFamily: "var(--font-body)" }}>Privacy Policy</a>
                <a href="/cookies" style={{ fontSize: 13, color: "#60A5FA", textDecoration: "none", fontWeight: 500, fontFamily: "var(--font-body)" }}>Cookie Policy</a>
                <a href="/contact" style={{ fontSize: 13, color: "var(--text-muted,#4A5980)", textDecoration: "none", fontFamily: "var(--font-body)" }}>Contact Us</a>
                <span style={{ fontSize: 13, color: "var(--text-muted,#4A5980)", marginLeft: "auto", fontFamily: "var(--font-body)" }}>© {new Date().getFullYear()} DirectHire Ltd</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />

      <style>{`
        @media (max-width: 900px) {
          .legal-layout { flex-direction: column !important; }
          .legal-toc    { position: static !important; width: 100% !important; display: none; }
        }
      `}</style>
    </main>
  );
}
