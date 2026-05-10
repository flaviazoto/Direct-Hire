"use client";

import { useState, useEffect } from "react";
import { Footer } from "@/components/Footer";

const TOC_ITEMS = [
  { id: "section-1",  label: "1. Who We Are"                       },
  { id: "section-2",  label: "2. What Data We Collect"             },
  { id: "section-3",  label: "3. How We Use Your Data"             },
  { id: "section-4",  label: "4. Legal Basis (GDPR)"               },
  { id: "section-5",  label: "5. Data Sharing"                     },
  { id: "section-6",  label: "6. Sensitive Data"                   },
  { id: "section-7",  label: "7. Data Retention"                   },
  { id: "section-8",  label: "8. Your Rights (GDPR)"               },
  { id: "section-9",  label: "9. Cookies"                          },
  { id: "section-10", label: "10. Changes to This Policy"          },
  { id: "section-11", label: "11. Contact"                         },
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

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", fontFamily: "var(--font-body)" }}>
            Last updated: January 2025
          </p>
        </div>
      </section>

      {/* ── CONTENT + SIDEBAR ────────────────────────────────────────────────── */}
      <section style={{ padding: "72px 32px 120px", background: "var(--navy-900,#0A1628)" }}>
        <div className="container">

          {/* GDPR badge */}
          <div style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 14, padding: "18px 22px", marginBottom: 56, display: "flex", gap: 14, alignItems: "center" }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>🛡</span>
            <p style={{ fontSize: 14, color: "#34D399", fontWeight: 600, lineHeight: 1.65, margin: 0, fontFamily: "var(--font-body)" }}>
              DirectHire is committed to GDPR compliance. You have the right to access, correct, export, and delete your personal data at any time.
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
              <Section id="section-1" title="1. Who We Are">
                <P>DirectHire Ltd (&ldquo;DirectHire,&rdquo; &ldquo;we,&rdquo; &ldquo;our&rdquo;) is the data controller for personal data collected through the DirectHire platform. We are registered in Albania.</P>
                <P>Contact our Data Protection team: privacy@directhire.io</P>
              </Section>

              <Section id="section-2" title="2. What Data We Collect">
                <P><strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>Account data:</strong> name, email address, phone number, password (hashed).</P>
                <P><strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>Profile data (workers):</strong> date of birth, nationality, country of residence, passport number (encrypted), marital status, family details, skills, experience, language proficiency, work preferences.</P>
                <P><strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>Profile data (employers):</strong> company name, NIPT, QKR number, administrator ID (encrypted), business description, industry, company size, address.</P>
                <P><strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>Uploaded files:</strong> profile photos, work videos, introduction videos, medical certificates, and business registration documents. All stored encrypted on secure servers.</P>
                <P><strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>Usage data:</strong> pages visited, features used, timestamps, IP addresses, device type, and browser.</P>
                <P><strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>Payment data:</strong> subscription status and billing cycle. Full payment card data is handled by our payment processor and never stored on our servers.</P>
              </Section>

              <Section id="section-3" title="3. How We Use Your Data">
                <P><strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>To provide the service:</strong> matching workers with employers, fraud detection, email notifications, and platform functionality.</P>
                <P><strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>AI matching:</strong> your profile data is used to score compatibility with job postings. This processing is necessary to deliver the service you signed up for.</P>
                <P><strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>Security:</strong> we use usage data and profile data to detect fraud, duplicate accounts, and suspicious activity.</P>
                <P><strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>Communications:</strong> we send transactional emails (account events, application updates) and platform notifications. You may opt out of non-essential communications.</P>
              </Section>

              <Section id="section-4" title="4. Legal Basis for Processing (GDPR)">
                <P><strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>Contract performance:</strong> processing necessary to provide the platform service you agreed to.</P>
                <P><strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>Legitimate interests:</strong> fraud detection, platform security, and service improvement.</P>
                <P><strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>Consent:</strong> optional features such as marketing emails.</P>
              </Section>

              <Section id="section-5" title="5. Data Sharing">
                <P>We share your data only in the following circumstances:</P>
                <P><strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>With employers:</strong> workers&apos; profile information, match scores, and uploaded materials are visible to verified employers who have an active subscription and are searching for candidates matching your profile. Your contact details are only shared when you apply to a job or are shortlisted.</P>
                <P><strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>Service providers:</strong> we use third-party services for cloud storage, email delivery, and payment processing. All providers are contractually bound to process your data only as instructed.</P>
                <P><strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>Legal requirements:</strong> we may disclose data to comply with applicable law or lawful requests from authorities.</P>
                <P>We do not sell your data. We do not share data with advertisers.</P>
              </Section>

              <Section id="section-6" title="6. Sensitive Data">
                <P>Passport numbers, administrator IDs, and similar identity data are encrypted using AES-256-GCM before being stored in our database. The encryption key is stored separately from the data. Only the minimum required staff can request decryption for verification purposes, and all access is logged in our audit system.</P>
              </Section>

              <Section id="section-7" title="7. Data Retention">
                <P>Active account data is retained for the duration of your account. If you delete your account, personal data is permanently deleted within 30 days, except where we are legally required to retain it (e.g., financial records for 7 years).</P>
              </Section>

              <Section id="section-8" title="8. Your Rights (GDPR)">
                <P>You have the right to: <strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>access</strong> your personal data; <strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>correct</strong> inaccurate data; <strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>delete</strong> your account and associated data; <strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>export</strong> your data in a portable format; <strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>restrict</strong> or object to certain processing; <strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>withdraw consent</strong> at any time.</P>
                <P>To exercise these rights, email privacy@directhire.io. We will respond within 30 days.</P>
              </Section>

              <Section id="section-9" title="9. Cookies">
                <P>We use only strictly necessary cookies for authentication (JWT tokens stored as HttpOnly cookies) and session management. We do not use advertising or tracking cookies. See our <a href="/cookies" style={{ color: "#60A5FA", textDecoration: "none" }}>Cookie Policy</a> for full details.</P>
              </Section>

              <Section id="section-10" title="10. Changes to This Policy">
                <P>We may update this policy periodically. We will notify you of material changes by email and by displaying a notice in the platform. The date at the top of this page reflects the most recent update.</P>
              </Section>

              <Section id="section-11" title="11. Contact">
                <P>Data Protection Officer: privacy@directhire.io<br />DirectHire Ltd, Rruga e Durrësit 42, Tirana, Albania</P>
                <P>If you are unsatisfied with our response, you have the right to lodge a complaint with the relevant supervisory authority in your country.</P>
              </Section>

              {/* Footer strip */}
              <div style={{ borderTop: "1px solid var(--surface-border,#1E3258)", paddingTop: 32, marginTop: 16, display: "flex", gap: 24, flexWrap: "wrap" as const }}>
                <a href="/terms" style={{ fontSize: 13, color: "#60A5FA", textDecoration: "none", fontWeight: 500, fontFamily: "var(--font-body)" }}>Terms of Service</a>
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
