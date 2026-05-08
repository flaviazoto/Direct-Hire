"use client";
// frontend/src/components/Footer.tsx
import Link from "next/link";

const COLS = [
  {
    heading: "Platform",
    links: [
      { href: "/for-workers",   label: "For Workers"   },
      { href: "/for-employers", label: "For Employers" },
      { href: "/pricing",       label: "Pricing"       },
      { href: "/about",         label: "About"         },
    ],
  },
  {
    heading: "Workers",
    links: [
      { href: "/for-workers",     label: "Find Jobs"      },
      { href: "/register",        label: "Create Profile" },
      { href: "/for-workers#faq", label: "Job Alerts"     },
      { href: "/register",        label: "Apply Now"      },
    ],
  },
  {
    heading: "Employers",
    links: [
      { href: "/register",          label: "Post a Job"  },
      { href: "/for-employers",     label: "Find Talent" },
      { href: "/pricing",           label: "Pricing"     },
      { href: "/for-employers#faq", label: "Enterprise"  },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/terms",   label: "Terms of Service" },
      { href: "/privacy", label: "Privacy Policy"   },
      { href: "/cookies", label: "Cookie Policy"    },
      { href: "/contact", label: "Contact"          },
    ],
  },
];

const BOTTOM_LINKS = [
  { href: "/terms",   label: "Terms"   },
  { href: "/privacy", label: "Privacy" },
  { href: "/contact", label: "Contact" },
];

const LinkedInIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const SOCIALS = [
  { label: "LinkedIn", href: "#", Icon: LinkedInIcon },
  { label: "X",        href: "#", Icon: XIcon        },
  { label: "Facebook", href: "#", Icon: FacebookIcon  },
];

export function Footer() {
  return (
    <footer className="footer-root" style={{
      background: "var(--surface)",
      borderTop: "1px solid var(--surface-border)",
      paddingTop: "5rem",
    }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 2rem" }}>

        {/* Top section — brand col + 4 link cols */}
        <div className="footer-grid" style={{
          display: "grid",
          gridTemplateColumns: "30% repeat(4, 17.5%)",
          gap: "2rem",
        }}>

          {/* Brand column */}
          <div>
            <Link href="/" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 10, marginBottom: "1.25rem" }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: "var(--blue-500)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <span style={{
                  fontFamily: "var(--font-display)", fontWeight: 700,
                  fontSize: 12, color: "#fff", letterSpacing: "-0.5px",
                }}>
                  DH
                </span>
              </div>
              <span style={{
                fontFamily: "var(--font-display)", fontWeight: 700,
                fontSize: 17, letterSpacing: "-0.5px",
                color: "var(--text-primary)",
              }}>
                DirectHire
              </span>
            </Link>

            <p style={{
              fontFamily: "var(--font-body)",
              fontSize: 14, lineHeight: 1.75,
              color: "var(--text-secondary)",
              maxWidth: 240, margin: "0 0 1.5rem",
            }}>
              The AI-powered global employment platform.
            </p>

            {/* Social icons — 44×44 touch targets */}
            <div style={{ display: "flex", gap: 10, marginBottom: "1.5rem" }}>
              {SOCIALS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-muted)",
                    textDecoration: "none",
                    transition: "border-color 0.15s, color 0.15s, background 0.15s",
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = "var(--blue-400)";
                    e.currentTarget.style.color = "var(--blue-400)";
                    e.currentTarget.style.background = "rgba(0,144,255,0.06)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                    e.currentTarget.style.color = "var(--text-muted)";
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Icon />
                </a>
              ))}
            </div>

            {/* SOC 2 badge */}
            <span style={{
              display: "inline-block",
              background: "rgba(0,144,255,0.1)",
              color: "var(--blue-400)",
              fontSize: 11, fontWeight: 600,
              fontFamily: "var(--font-body)",
              padding: "4px 12px",
              borderRadius: 999,
              letterSpacing: "0.03em",
            }}>
              SOC 2 Compliant
            </span>
          </div>

          {/* Link columns */}
          {COLS.map(col => (
            <div key={col.heading}>
              <div style={{
                fontFamily: "var(--font-body)",
                fontSize: 11, fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-muted)",
                marginBottom: "1rem",
              }}>
                {col.heading}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {col.links.map(l => (
                  <Link
                    key={`${l.href}-${l.label}`}
                    href={l.href}
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 14,
                      color: "var(--text-secondary)",
                      textDecoration: "none",
                      lineHeight: 2.4,
                      transition: "color 0.15s",
                      display: "block",
                      minHeight: 44,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--blue-400)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--text-secondary)")}
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "3rem 0 0" }} />

        {/* Bottom bar */}
        <div className="footer-bottom" style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: "1.5rem",
          paddingBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-muted)" }}>
            © {new Date().getFullYear()} DirectHire Ltd. All rights reserved.
          </span>

          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" as const }}>
            {BOTTOM_LINKS.map(l => (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  color: "var(--text-muted)",
                  textDecoration: "none",
                  transition: "color 0.15s",
                  minHeight: 44, display: "inline-flex", alignItems: "center",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text-secondary)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>
            Built with AI. Trusted globally.
          </span>
        </div>
      </div>

      <style>{`
        /* Desktop: 5-col grid (brand + 4 link cols) */

        /* Tablet: 2-col */
        @media (max-width: 1024px) {
          .footer-grid { grid-template-columns: 1fr 1fr !important; }
        }

        /* Mobile: 1-col, centered bottom bar */
        @media (max-width: 640px) {
          .footer-grid   { grid-template-columns: 1fr !important; }
          .footer-bottom {
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
          }
          .footer-bottom > div { justify-content: center !important; }
        }

        /* Safe area for mobile home bar */
        .footer-root {
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
      `}</style>
    </footer>
  );
}
