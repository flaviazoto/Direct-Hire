"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const DASHBOARD_HREF: Record<string, string> = {
  WORKER:   "/worker/dashboard",
  EMPLOYER: "/employer/dashboard",
  ADMIN:    "/admin/dashboard",
};

const NAV_LINKS = [
  { href: "/for-workers",   label: "For Workers"   },
  { href: "/for-employers", label: "For Employers" },
  { href: "/pricing",       label: "Pricing"       },
  { href: "/about",         label: "About"         },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [visible,  setVisible]  = useState(true);
  const [lastY,    setLastY]    = useState(0);
  const pathname                = usePathname();
  const { auth, loading, logout } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 20);
      if (y < 10) {
        setVisible(true);
      } else if (y > lastY) {
        setVisible(false);
      } else {
        setVisible(true);
      }
      setLastY(y);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastY]);

  const isLoggedIn = auth.isLoggedIn;
  const role       = isLoggedIn ? auth.role      : undefined;
  const firstName  = isLoggedIn ? auth.firstName : undefined;
  const dashHref   = role ? (DASHBOARD_HREF[role] ?? "/") : "/";
  const greeting   = firstName ?? (role ?? "").toLowerCase();

  async function handleLogout() { await logout(); }

  // ── Desktop auth CTAs (>1024px) ───────────────────────────────────────────

  function LoggedInCTAs() {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
        <Link href={dashHref} style={{
          padding: "0 18px", borderRadius: 8, minHeight: 44,
          border: "1px solid rgba(255,255,255,0.15)", background: "transparent",
          color: "rgba(255,255,255,0.75)", fontFamily: "var(--font-body)",
          fontSize: 13, fontWeight: 500,
          transition: "all 0.2s", textDecoration: "none",
          display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" as const,
        }}
          onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.75)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
        >
          Dashboard
        </Link>
        <button onClick={handleLogout} style={{
          fontSize: 13, color: "rgba(255,255,255,0.45)",
          background: "none", border: "none", cursor: "pointer",
          fontFamily: "var(--font-body)", padding: "0 4px", minHeight: 44,
          transition: "color 0.2s", whiteSpace: "nowrap" as const,
          display: "inline-flex", alignItems: "center",
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.75)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.45)"; }}
        >
          {greeting ? `Log out (${greeting})` : "Log out"}
        </button>
      </div>
    );
  }

  function LoggedOutCTAs() {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
        <Link href="/login" style={{
          padding: "0 18px", borderRadius: 8, minHeight: 44,
          border: "1px solid rgba(255,255,255,0.15)", background: "transparent",
          color: "rgba(255,255,255,0.75)", fontFamily: "var(--font-body)",
          fontSize: 13, fontWeight: 500,
          transition: "all 0.2s", textDecoration: "none",
          display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" as const,
        }}
          onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.75)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
        >
          Sign in
        </Link>
        <Link href="/register" style={{
          padding: "0 20px", borderRadius: 8, minHeight: 44,
          background: "linear-gradient(135deg, #0090FF, #6366F1)",
          color: "#fff", fontFamily: "var(--font-body)",
          fontSize: 13, fontWeight: 600,
          border: "none", textDecoration: "none",
          display: "inline-flex", alignItems: "center",
          boxShadow: "0 0 20px rgba(0,144,255,0.25)",
          transition: "all 0.2s", whiteSpace: "nowrap" as const,
        }}
          onMouseEnter={e => { e.currentTarget.style.filter = "brightness(1.1)"; e.currentTarget.style.boxShadow = "0 0 28px rgba(0,144,255,0.4)"; }}
          onMouseLeave={e => { e.currentTarget.style.filter = "brightness(1)"; e.currentTarget.style.boxShadow = "0 0 20px rgba(0,144,255,0.25)"; }}
        >
          Get started
        </Link>
      </div>
    );
  }

  // ── Tablet CTA — single button visible at 768–1024px ─────────────────────

  function TabletCTA() {
    if (loading) return null;
    if (isLoggedIn) {
      return (
        <Link href={dashHref} style={{
          padding: "0 16px", borderRadius: 8, minHeight: 44,
          border: "1px solid rgba(255,255,255,0.15)", background: "transparent",
          color: "rgba(255,255,255,0.75)", fontFamily: "var(--font-body)",
          fontSize: 13, fontWeight: 500, textDecoration: "none",
          display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" as const,
          transition: "all 0.2s",
        }}
          onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.75)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
        >
          Dashboard
        </Link>
      );
    }
    return (
      <Link href="/register" style={{
        padding: "0 18px", borderRadius: 8, minHeight: 44,
        background: "linear-gradient(135deg, #0090FF, #6366F1)",
        color: "#fff", fontFamily: "var(--font-body)",
        fontSize: 13, fontWeight: 600, textDecoration: "none",
        display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" as const,
        boxShadow: "0 0 20px rgba(0,144,255,0.25)",
        transition: "all 0.2s",
      }}
        onMouseEnter={e => { e.currentTarget.style.filter = "brightness(1.1)"; }}
        onMouseLeave={e => { e.currentTarget.style.filter = "brightness(1)"; }}
      >
        Get started
      </Link>
    );
  }

  return (
    <header className="nav-header" style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      background: "rgba(5,13,26,0.9)",
      backdropFilter: "blur(24px) saturate(200%)",
      WebkitBackdropFilter: "blur(24px) saturate(200%)",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
      transition: "box-shadow 0.3s ease, transform 0.3s ease",
      boxShadow: scrolled ? "0 1px 40px rgba(0,0,0,0.5)" : "none",
      transform: visible ? "translateY(0)" : "translateY(-100%)",
    }}>

      {/* ── Nav inner (desktop: 3-col grid; tablet: flex; mobile: flex center) ── */}
      <div className="nav-inner" style={{
        maxWidth: 1280, margin: "0 auto",
        height: "100%",
        display: "grid",
        gridTemplateColumns: "200px 1fr 200px",
        alignItems: "center",
        padding: "0 40px",
        minWidth: 0,
      }}>

        {/* Logo */}
        <Link href="/" style={{
          textDecoration: "none", display: "flex", alignItems: "center", gap: 10,
          maxWidth: 160, flexShrink: 0, overflow: "hidden",
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: "linear-gradient(135deg, #0090FF, #6366F1)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{
              fontFamily: "var(--font-display)", fontWeight: 700,
              fontSize: 13, color: "#fff", letterSpacing: "-0.5px",
            }}>DH</span>
          </div>
          <span style={{
            fontFamily: "var(--font-display)", fontWeight: 700,
            fontSize: 17, letterSpacing: "-0.3px", color: "#fff",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
          }}>
            DirectHire
          </span>
        </Link>

        {/* Nav links — hidden on mobile, visible tablet+ */}
        <nav className="nav-links" style={{
          display: "flex", alignItems: "center",
          justifyContent: "center", gap: "2rem",
        }}>
          {NAV_LINKS.map(l => {
            const isActive = pathname === l.href;
            return (
              <div key={l.href} style={{ display: "flex", flexDirection: "column" as const, alignItems: "center" }}>
                <Link href={l.href} style={{
                  fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 500,
                  color: isActive ? "#fff" : "rgba(255,255,255,0.6)",
                  textDecoration: "none", transition: "color 0.2s",
                  whiteSpace: "nowrap" as const,
                  display: "inline-flex", alignItems: "center", minHeight: 44,
                }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
                >
                  {l.label}
                </Link>
                {isActive && (
                  <div style={{
                    height: 3, width: "100%", marginTop: 3,
                    background: "linear-gradient(90deg, #0090FF, #6366F1)",
                    borderRadius: 2,
                  }} />
                )}
              </div>
            );
          })}
        </nav>

        {/* Right col: tablet CTA | desktop auth */}
        <div className="nav-right" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>

          {/* Tablet-only CTA (768–1024px) */}
          <div className="nav-tablet-cta" style={{ display: "none" }}>
            <TabletCTA />
          </div>

          {/* Desktop auth (>1024px) */}
          <div className="nav-auth" style={{ display: "none" }}>
            {!loading && (isLoggedIn ? <LoggedInCTAs /> : <LoggedOutCTAs />)}
          </div>
        </div>
      </div>

      <style>{`
        /* ── Mobile default (<768px) ── */
        .nav-header  { height: 64px; }
        .nav-inner   { display: flex !important; justify-content: center !important; align-items: center !important; padding: 0 16px !important; }
        .nav-links      { display: none !important; }
        .nav-auth       { display: none !important; }
        .nav-tablet-cta { display: none !important; }
        .nav-right      { display: none !important; }

        /* ── Tablet (768px–1024px) ── */
        @media (min-width: 768px) {
          .nav-header  { height: 68px; }
          .nav-inner   { display: grid !important; grid-template-columns: auto 1fr auto !important; gap: 1.5rem !important; padding: 0 32px !important; align-items: center !important; }
          .nav-links      { display: flex !important; }
          .nav-right      { display: flex !important; }
          .nav-tablet-cta { display: flex !important; }
        }

        /* ── Desktop (>1024px) ── */
        @media (min-width: 1025px) {
          .nav-header { height: 72px; }
          .nav-inner  { display: grid !important; grid-template-columns: 200px 1fr 200px !important; gap: 0 !important; padding: 0 40px !important; }
          .nav-tablet-cta { display: none !important; }
          .nav-auth       { display: flex !important; }
        }
      `}</style>
    </header>
  );
}
