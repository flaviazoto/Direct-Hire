"use client";

import { useState, useEffect, useRef } from "react";
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
  const [scrolled,  setScrolled]  = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const pathname                  = usePathname();
  const { auth, loading, logout } = useAuth();
  const menuRef                   = useRef<HTMLDivElement>(null);
  const btnRef                    = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

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
      transition: "box-shadow 0.3s ease",
      boxShadow: scrolled ? "0 1px 40px rgba(0,0,0,0.5)" : "none",
    }}>

      {/* ── Nav inner (desktop: 3-col grid; tablet: flex; mobile: flex) ───── */}
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

        {/* Right col: tablet CTA | desktop auth | hamburger */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>

          {/* Tablet-only CTA (768–1024px) */}
          <div className="nav-tablet-cta" style={{ display: "none" }}>
            <TabletCTA />
          </div>

          {/* Desktop auth (>1024px) */}
          <div className="nav-auth" style={{ display: "none" }}>
            {!loading && (isLoggedIn ? <LoggedInCTAs /> : <LoggedOutCTAs />)}
          </div>

          {/* Hamburger (<768px) */}
          <button
            ref={btnRef}
            onClick={() => setMenuOpen(o => !o)}
            className="nav-hamburger"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(255,255,255,0.7)", borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              minWidth: 44, minHeight: 44, padding: 0,
            }}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen
                ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>
              }
            </svg>
          </button>
        </div>
      </div>

      {/* ── Mobile dropdown menu (<768px) ────────────────────────────────────── */}
      {menuOpen && (
        <div
          ref={menuRef}
          style={{
            position: "fixed", top: 64, left: 0, right: 0, bottom: 0,
            background: "rgba(5,13,26,0.98)",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            zIndex: 50, overflowY: "auto",
            display: "flex", flexDirection: "column",
            animation: "navSlideDown 0.2s ease both",
          }}
        >
          {/* Nav links */}
          <div style={{ padding: "8px 0" }}>
            {NAV_LINKS.map(l => {
              const isActive = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "0 24px", minHeight: 56,
                    fontSize: 17, fontWeight: 600,
                    color: isActive ? "#60A5FA" : "rgba(255,255,255,0.8)",
                    textDecoration: "none",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    transition: "color 0.15s, background 0.15s",
                    background: isActive ? "rgba(0,144,255,0.05)" : "transparent",
                  }}
                >
                  {l.label}
                  {isActive && <span style={{ fontSize: 8, color: "#60A5FA" }}>●</span>}
                </Link>
              );
            })}
          </div>

          {/* Auth buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "20px 24px" }}>
            {!loading && isLoggedIn ? (
              <>
                <Link href={dashHref} onClick={() => setMenuOpen(false)} style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  minHeight: 52, borderRadius: 10, textDecoration: "none",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: 600,
                  fontFamily: "var(--font-body)",
                }}>
                  Dashboard
                </Link>
                <button
                  onClick={() => { setMenuOpen(false); handleLogout(); }}
                  style={{
                    minHeight: 52, borderRadius: 10, border: "none", cursor: "pointer",
                    background: "linear-gradient(135deg, #0090FF, #6366F1)",
                    color: "#fff", fontSize: 15, fontWeight: 700,
                    fontFamily: "var(--font-body)", width: "100%",
                  }}
                >
                  {greeting ? `Log out (${greeting})` : "Log out"}
                </button>
              </>
            ) : !loading ? (
              <>
                <Link href="/login" onClick={() => setMenuOpen(false)} style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  minHeight: 52, borderRadius: 10, textDecoration: "none",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: 600,
                  fontFamily: "var(--font-body)",
                }}>
                  Sign in
                </Link>
                <Link href="/register" onClick={() => setMenuOpen(false)} style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  minHeight: 52, borderRadius: 10, textDecoration: "none",
                  background: "linear-gradient(135deg, #0090FF, #6366F1)",
                  color: "#fff", fontSize: 15, fontWeight: 700,
                  fontFamily: "var(--font-body)",
                }}>
                  Get started
                </Link>
              </>
            ) : null}
          </div>
        </div>
      )}

      <style>{`
        @keyframes navSlideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Mobile default (<768px) ── */
        .nav-header  { height: 64px; }
        .nav-inner   { display: flex !important; justify-content: space-between !important; align-items: center !important; padding: 0 16px !important; }
        .nav-links       { display: none !important; }
        .nav-auth        { display: none !important; }
        .nav-tablet-cta  { display: none !important; }
        .nav-hamburger   { display: flex !important; }

        /* ── Tablet (768px–1024px) ── */
        @media (min-width: 768px) {
          .nav-header  { height: 68px; }
          .nav-inner   { display: grid !important; grid-template-columns: auto 1fr auto !important; gap: 1.5rem !important; padding: 0 32px !important; align-items: center !important; }
          .nav-links      { display: flex !important; }
          .nav-tablet-cta { display: flex !important; }
          .nav-hamburger  { display: none !important; }
        }

        /* ── Desktop (>1024px) ── */
        @media (min-width: 1025px) {
          .nav-header { height: 72px; }
          .nav-inner  { display: grid !important; grid-template-columns: 200px 1fr 200px !important; gap: 0 !important; padding: 0 40px !important; }
          .nav-tablet-cta { display: none !important; }
          .nav-auth       { display: flex !important; }
        }

        @media (max-width: 640px) {
          .nav-inner { padding: 0 12px !important; }
        }
      `}</style>
    </header>
  );
}
