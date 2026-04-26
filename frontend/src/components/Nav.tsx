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
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname  = usePathname();
  const { auth, loading, logout } = useAuth();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const isLoggedIn = auth.isLoggedIn;
  const role       = isLoggedIn ? auth.role      : undefined;
  const firstName  = isLoggedIn ? auth.firstName : undefined;
  const dashHref   = role ? (DASHBOARD_HREF[role] ?? "/") : "/";
  const greeting   = firstName ?? (role ?? "").toLowerCase();

  async function handleLogout() { await logout(); }

  function LoggedInCTAs() {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href={dashHref} style={{
          padding: "8px 16px", borderRadius: 8, fontSize: 13,
          fontWeight: 500, color: "var(--text-secondary)", textDecoration: "none",
          border: "1px solid rgba(255,255,255,0.12)", background: "transparent",
          transition: "all 0.2s ease", whiteSpace: "nowrap",
        }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
        >
          Dashboard
        </Link>
        <button onClick={handleLogout} style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 13, fontWeight: 500, color: "var(--text-secondary)",
          padding: "8px 4px", transition: "color 0.2s", whiteSpace: "nowrap",
          fontFamily: "var(--font-body)",
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
        >
          {greeting ? `Log out (${greeting})` : "Log out"}
        </button>
      </div>
    );
  }

  function LoggedOutCTAs() {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Link href="/login" style={{
          padding: "8px 16px", borderRadius: 8, fontSize: 13,
          fontWeight: 500, color: "var(--text-secondary)", textDecoration: "none",
          border: "1px solid rgba(255,255,255,0.12)", background: "transparent",
          transition: "all 0.2s ease", whiteSpace: "nowrap",
        }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
        >
          Sign in
        </Link>
        <Link href="/register" style={{
          padding: "8px 20px", borderRadius: 8, fontSize: 13,
          fontWeight: 600, color: "#fff", background: "var(--blue-500)",
          textDecoration: "none", transition: "filter 0.2s ease", whiteSpace: "nowrap",
          display: "inline-block",
        }}
          onMouseEnter={e => { e.currentTarget.style.filter = "brightness(1.1)"; }}
          onMouseLeave={e => { e.currentTarget.style.filter = "brightness(1)"; }}
        >
          Get started
        </Link>
      </div>
    );
  }

  return (
    <header style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      height: 72,
      background: "rgba(5,13,26,0.85)",
      backdropFilter: "blur(20px) saturate(180%)",
      WebkitBackdropFilter: "blur(20px) saturate(180%)",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      transition: "box-shadow 0.3s ease",
      boxShadow: scrolled ? "0 1px 40px rgba(0,0,0,0.4)" : "none",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", height: "100%", display: "flex", alignItems: "center" }}>

        {/* Logo */}
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
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

        {/* Center nav links */}
        <nav style={{ display: "flex", alignItems: "center", gap: "2rem", marginLeft: 40, flex: 1 }} className="nav-links">
          {NAV_LINKS.map(l => {
            const isActive = pathname === l.href;
            return (
              <Link key={l.href} href={l.href} style={{
                fontSize: 14, fontWeight: 500,
                fontFamily: "var(--font-body)",
                color: isActive ? "var(--blue-400)" : "var(--text-secondary)",
                textDecoration: "none",
                transition: "color 0.2s ease",
                paddingBottom: isActive ? 2 : 0,
                borderBottom: isActive ? "2px solid var(--blue-400)" : "2px solid transparent",
                borderRadius: isActive ? 1 : 0,
              }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = "var(--blue-400)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = "var(--text-secondary)"; }}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: theme toggle + auth CTAs */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!loading && (isLoggedIn ? <LoggedInCTAs /> : <LoggedOutCTAs />)}

          {/* Hamburger */}
          <button onClick={() => setMenuOpen(o => !o)} className="nav-hamburger"
            style={{ display: "none", background: "none", border: "none", cursor: "pointer", padding: 8, color: "var(--text-secondary)" }}
            aria-label="Toggle menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen
                ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{
          position: "fixed", top: 72, left: 0, right: 0, bottom: 0,
          background: "rgba(5,13,26,0.98)", borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", flexDirection: "column", padding: 32, zIndex: 99, overflowY: "auto",
        }}>
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)} style={{
              padding: "16px 0", fontSize: 18, fontWeight: 600,
              color: pathname === l.href ? "var(--blue-400)" : "var(--text-secondary)",
              textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.06)", transition: "color 0.15s",
            }}>
              {l.label}
            </Link>
          ))}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 32 }}>
            {!loading && isLoggedIn ? (
              <>
                <Link href={dashHref} onClick={() => setMenuOpen(false)} style={{ padding: 14, textAlign: "center", fontSize: 15, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "var(--text-secondary)", textDecoration: "none" }}>
                  Dashboard
                </Link>
                <button onClick={() => { setMenuOpen(false); handleLogout(); }} style={{ padding: 14, fontSize: 15, width: "100%", background: "var(--blue-500)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontFamily: "var(--font-body)" }}>
                  Log out{greeting ? ` (${greeting})` : ""}
                </button>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setMenuOpen(false)} style={{ padding: 14, textAlign: "center", fontSize: 15, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "var(--text-secondary)", textDecoration: "none" }}>
                  Sign in
                </Link>
                <Link href="/register" onClick={() => setMenuOpen(false)} style={{ padding: 14, textAlign: "center", fontSize: 15, background: "var(--blue-500)", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 600, display: "block" }}>
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .nav-hamburger { display: flex !important; }
          .nav-links { display: none !important; }
        }
      `}</style>
    </header>
  );
}
