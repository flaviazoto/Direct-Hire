"use client";

import { useState, useEffect } from "react";
import { Footer } from "@/components/Footer";

const TOC_ITEMS = [
  { id: "section-1", label: "1. What are cookies"     },
  { id: "section-2", label: "2. Essential cookies"    },
  { id: "section-3", label: "3. Analytics cookies"    },
  { id: "section-4", label: "4. Marketing cookies"    },
  { id: "section-5", label: "5. Managing cookies"     },
  { id: "section-6", label: "6. Contact"              },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} style={{ marginBottom: 52, scrollMarginTop: 110 }}>
      <h2 style={{
        fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)",
        fontWeight: 700, fontSize: 22, color: "#ffffff",
        marginBottom: 16, paddingBottom: 12,
        borderBottom: "2px solid rgba(99,102,241,0.15)",
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
      fontSize: 15, color: "#94a3b8",
      lineHeight: 1.85, marginBottom: 14,
      fontFamily: "var(--font-body,'DM Sans',system-ui,sans-serif)",
    }}>
      {children}
    </p>
  );
}

export default function CookiesPage() {
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
    <main style={{ background: "var(--glass-base)", minHeight: "100vh", color: "#ffffff" }}>
      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{
        background: "var(--glass-base)",
        padding: "140px 32px 60px",
        position: "relative", overflow: "hidden",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 600, height: 400, background: "radial-gradient(ellipse, rgba(99,102,241,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="container" style={{ position: "relative" }}>
          <div style={{ display: "inline-flex", padding: "6px 16px", borderRadius: 999, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", marginBottom: 24 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#818cf8", letterSpacing: "0.08em", textTransform: "uppercase" as const, fontFamily: "var(--font-body)" }}>Legal</span>
          </div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontWeight: 800,
            fontSize: "clamp(2.5rem,4vw,3.5rem)", letterSpacing: "-2px",
            color: "#F0F4FF", marginBottom: 12, lineHeight: 1.1,
          }}>
            Cookie Policy
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", fontFamily: "var(--font-body)" }}>
            Last updated: January 2025
          </p>
        </div>
      </section>

      {/* ── CONTENT + SIDEBAR ────────────────────────────────────────────────── */}
      <section style={{ padding: "72px 32px 120px", background: "var(--glass-base)" }}>
        <div className="container">

          {/* Notice banner */}
          <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 14, padding: "18px 22px", marginBottom: 56 }}>
            <p style={{ fontSize: 14, color: "#818cf8", fontWeight: 500, lineHeight: 1.65, margin: 0, fontFamily: "var(--font-body)" }}>
              DirectHire uses only strictly necessary cookies. We do not use advertising, tracking, or third-party marketing cookies.
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
                        borderLeft: `2px solid ${isActive ? "var(--blue-500,#4F46E5)" : "transparent"}`,
                        color: isActive ? "var(--blue-400,#818cf8)" : "rgba(255,255,255,0.5)",
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

              <Section id="section-1" title="1. What are cookies">
                <P>Cookies are small text files placed on your device by a website when you visit it. They allow the website to remember your actions and preferences over time, so you don&apos;t have to keep re-entering information every time you visit or navigate between pages.</P>
                <P>Cookies can be &ldquo;session&rdquo; cookies (deleted when you close your browser) or &ldquo;persistent&rdquo; cookies (stored for a defined period). We use them to keep you logged in and ensure the platform functions securely.</P>
              </Section>

              <Section id="section-2" title="2. Essential cookies">
                <P>Essential cookies are required for the platform to function. They cannot be disabled because removing them would break core features including login, session management, and security.</P>
                <P><strong style={{ color: "#cbd5e1" }}>Authentication:</strong> JWT access tokens are stored as HttpOnly, Secure, SameSite=Strict cookies. These expire with your session or after a configured idle timeout.</P>
                <P><strong style={{ color: "#cbd5e1" }}>CSRF protection:</strong> a CSRF token cookie is set to prevent cross-site request forgery on form submissions.</P>
                <P><strong style={{ color: "#cbd5e1" }}>Session state:</strong> a short-lived session identifier used to keep you logged in across page navigations without requiring re-authentication.</P>
              </Section>

              <Section id="section-3" title="3. Analytics cookies">
                <P>We may use anonymised analytics to understand how users navigate the platform and to identify areas for improvement. Analytics data is aggregated — it cannot be used to identify you individually.</P>
                <P>If analytics cookies are used, you can opt out at any time by adjusting your preferences in your account settings or by using your browser&apos;s cookie controls. We will update this section to name any analytics provider before we enable it.</P>
                <P>At the time of this policy, no third-party analytics cookies are active on the DirectHire platform.</P>
              </Section>

              <Section id="section-4" title="4. Marketing cookies">
                <P>We do not use marketing cookies. DirectHire does not run retargeting campaigns, interest-based advertising, or any form of behavioural tracking through cookies.</P>
                <P>We do not allow third-party advertising networks to set cookies through our platform.</P>
              </Section>

              <Section id="section-5" title="5. Managing cookies">
                <P>You can control and delete cookies through your browser settings. Instructions for the most common browsers:</P>
                <P><strong style={{ color: "#cbd5e1" }}>Chrome:</strong> Settings → Privacy and security → Cookies and other site data.</P>
                <P><strong style={{ color: "#cbd5e1" }}>Firefox:</strong> Settings → Privacy &amp; Security → Cookies and Site Data.</P>
                <P><strong style={{ color: "#cbd5e1" }}>Safari:</strong> Preferences → Privacy → Manage Website Data.</P>
                <P><strong style={{ color: "#cbd5e1" }}>Edge:</strong> Settings → Cookies and site permissions → Cookies and site data.</P>
                <P>Note: disabling essential cookies will prevent you from logging in and using the platform.</P>
              </Section>

              <Section id="section-6" title="6. Contact">
                <P>If you have questions about our use of cookies or this policy, contact our Data Protection team at <a href="mailto:privacy@directhire.io" style={{ color: "#818cf8", textDecoration: "none" }}>privacy@directhire.io</a>.</P>
                <P>DirectHire Ltd, Rruga e Durrësit 42, Tirana, Albania.</P>
              </Section>

              {/* Footer strip */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 32, marginTop: 16, display: "flex", gap: 24, flexWrap: "wrap" as const }}>
                <a href="/terms" style={{ fontSize: 13, color: "#818cf8", textDecoration: "none", fontWeight: 500, fontFamily: "var(--font-body)" }}>Terms of Service</a>
                <a href="/privacy" style={{ fontSize: 13, color: "#818cf8", textDecoration: "none", fontWeight: 500, fontFamily: "var(--font-body)" }}>Privacy Policy</a>
                <a href="/contact" style={{ fontSize: 13, color: "#94a3b8", textDecoration: "none", fontFamily: "var(--font-body)" }}>Contact Us</a>
                <span style={{ fontSize: 13, color: "#94a3b8", marginLeft: "auto", fontFamily: "var(--font-body)" }}>© {new Date().getFullYear()} DirectHire Ltd</span>
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
