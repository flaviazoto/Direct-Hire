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

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const isLoggedIn = auth.isLoggedIn;
  const role       = isLoggedIn ? auth.role      : undefined;
  const firstName  = isLoggedIn ? auth.firstName : undefined;
  const dashHref   = role ? (DASHBOARD_HREF[role] ?? "/") : "/";
  const greeting   = firstName ?? (role ?? "").toLowerCase();

  async function handleLogout() { await logout(); }

  function LoggedInCTAs() {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
        <Link href={dashHref} style={{
          padding: "8px 18px", borderRadius: 8,
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
          fontFamily: "var(--font-body)", padding: "8px 4px",
          transition: "color 0.2s", whiteSpace: "nowrap" as const,
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
          padding: "8px 18px", borderRadius: 8,
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
          padding: "8px 20px", borderRadius: 8,
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

  return (
    <header style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      height: 68,
      background: "rgba(5,13,26,0.9)",
      backdropFilter: "blur(24px) saturate(200%)",
      WebkitBackdropFilter: "blur(24px) saturate(200%)",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
      transition: "box-shadow 0.3s ease",
      boxShadow: scrolled ? "0 1px 40px rgba(0,0,0,0.5)" : "none",
    }}>

      {/* Desktop: 3-column grid — logo | centered links | auth */}
      <div className="nav-inner" style={{
        maxWidth: 1280, margin: "0 auto", padding: "0 40px",
        height: "100%",
        display: "grid",
        gridTemplateColumns: "200px 1fr 200px",
        alignItems: "center",
        minWidth: 0,
      }}>

        {/* LEFT: Logo */}
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #0090FF, #6366F1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <span style={{
              fontFamily: "var(--font-display)", fontWeight: 700,
              fontSize: 13, color: "#fff", letterSpacing: "-0.5px",
            }}>
              DH
            </span>
          </div>
          <span style={{
            fontFamily: "var(--font-display)", fontWeight: 700,
            fontSize: 17, letterSpacing: "-0.3px", color: "#fff",
          }}>
            DirectHire
          </span>
        </Link>

        {/* CENTER: Nav links */}
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

        {/* RIGHT: Auth buttons + hamburger */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          <div className="nav-auth">
            {!loading && (isLoggedIn ? <LoggedInCTAs /> : <LoggedOutCTAs />)}
          </div>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="nav-hamburger"
            style={{ display: "none", background: "none", border: "none", cursor: "pointer", padding: 8, color: "rgba(255,255,255,0.7)" }}
            aria-label="Toggle menu"
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

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div style={{
          position: "fixed", top: 68, left: 0, right: 0, bottom: 0,
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
        @media (max-width: 1024px) {
          .nav-inner     { display: flex !important; justify-content: space-between !important; }
          .nav-links     { display: none !important; }
          .nav-auth      { display: none !important; }
          .nav-hamburger { display: flex !important; }
        }
        @media (max-width: 640px) {
          .nav-inner { padding: 0 16px !important; }
        }
      `}</style>
    </header>
  );
}
