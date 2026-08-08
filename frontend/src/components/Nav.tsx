"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  X, Home, Briefcase, Building2, Tag, Info,
  ChevronRight, LogIn, UserPlus, Menu,
} from "lucide-react";

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

const OVERLAY_LINKS = [
  { href: "/",              label: "Home",          Icon: Home      },
  { href: "/for-workers",   label: "For Workers",   Icon: Briefcase },
  { href: "/for-employers", label: "For Employers", Icon: Building2 },
  { href: "/pricing",       label: "Pricing",       Icon: Tag       },
  { href: "/about",         label: "About",         Icon: Info      },
];

export function Nav() {
  const [scrolled,  setScrolled]  = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [mounted,   setMounted]   = useState(false);
  const pathname                  = usePathname();
  const { auth, loading, logout } = useAuth();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const handleScroll = () => { setScrolled(window.scrollY > 20); };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow  = "hidden";
      document.body.style.position  = "fixed";
      document.body.style.width     = "100%";
      document.body.style.top       = `-${window.scrollY}px`;
    } else {
      const scrollY = document.body.style.top;
      document.body.style.overflow  = "";
      document.body.style.position  = "";
      document.body.style.width     = "";
      document.body.style.top       = "";
      if (scrollY) window.scrollTo(0, -parseInt(scrollY));
    }
    return () => {
      document.body.style.overflow  = "";
      document.body.style.position  = "";
      document.body.style.width     = "";
      document.body.style.top       = "";
    };
  }, [menuOpen]);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const isLoggedIn = auth.isLoggedIn;
  const role       = isLoggedIn ? auth.role      : undefined;
  const firstName  = isLoggedIn ? auth.firstName : undefined;
  const dashHref   = role ? (DASHBOARD_HREF[role] ?? "/") : "/";
  const greeting   = firstName ?? (role ?? "").toLowerCase();

  async function handleLogout() { await logout(); }

  function DesktopCTAs() {
    if (loading) return null;
    if (isLoggedIn) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          <Link href={dashHref} className="btn-glass" style={{
            padding: "0 18px", minHeight: 44,
            fontFamily: "var(--font-body)",
            fontSize: 13,
            textDecoration: "none",
            whiteSpace: "nowrap" as const,
          }}>
            Dashboard
          </Link>
          <button onClick={handleLogout} style={{
            fontSize: 13, color: "#94a3b8",
            background: "none", border: "none", cursor: "pointer",
            fontFamily: "var(--font-body)", padding: "0 4px", minHeight: 44,
            transition: "color 0.2s", whiteSpace: "nowrap" as const,
            display: "inline-flex", alignItems: "center",
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#cbd5e1"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; }}
          >
            {greeting ? `Log out (${greeting})` : "Log out"}
          </button>
        </div>
      );
    }
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
        <Link href="/login" className="btn-glass" style={{
          padding: "0 18px", minHeight: 44,
          fontFamily: "var(--font-body)",
          fontSize: 13,
          textDecoration: "none",
          whiteSpace: "nowrap" as const,
        }}>
          Sign in
        </Link>
        <Link href="/register" className="btn-gradient" style={{
          padding: "0 20px", minHeight: 44,
          fontFamily: "var(--font-body)",
          fontSize: 13,
          textDecoration: "none",
          whiteSpace: "nowrap" as const,
        }}>
          Get started
        </Link>
      </div>
    );
  }

  const overlay = (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col md:hidden transition-transform duration-300 ease-in-out ${
        menuOpen ? "translate-y-0 pointer-events-auto" : "translate-y-full pointer-events-none"
      }`}
      style={{ background: "var(--glass-base)" }}
      aria-hidden={!menuOpen}
    >
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "56px 20px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(135deg, var(--glass-indigo), var(--glass-purple))",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "#fff" }}>DH</span>
          </div>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "#F0F4FF" }}>DirectHire</span>
        </div>
        <button
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu"
          tabIndex={menuOpen ? undefined : -1}
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.7)",
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav links */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {OVERLAY_LINKS.map(({ href, label, Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              tabIndex={menuOpen ? undefined : -1}
              style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: "12px 12px", borderRadius: 16, marginBottom: 4,
                textDecoration: "none",
                background: isActive ? "rgba(99,102,241,0.12)" : "transparent",
                color: isActive ? "#818cf8" : "rgba(255,255,255,0.8)",
                transition: "background 0.15s",
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: isActive ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: isActive ? "#818cf8" : "rgba(255,255,255,0.55)",
              }}>
                <Icon size={20} strokeWidth={1.75} />
              </div>
              <span style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: 16, flex: 1 }}>
                {label}
              </span>
              <ChevronRight size={16} color="rgba(255,255,255,0.25)" />
            </Link>
          );
        })}
      </div>

      {/* Auth buttons pinned at bottom */}
      <div style={{
        padding: "16px 16px",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        flexShrink: 0,
        display: "flex", gap: 12,
      }}>
        {!loading && isLoggedIn ? (
          <>
            <Link href={dashHref} className="btn-gradient" tabIndex={menuOpen ? undefined : -1} style={{
              flex: 1, height: 48, textDecoration: "none",
              fontFamily: "var(--font-body)", fontSize: 14,
            }}>
              Dashboard
            </Link>
            <button onClick={() => { setMenuOpen(false); handleLogout(); }} className="btn-glass" tabIndex={menuOpen ? undefined : -1} style={{
              flex: 1, height: 48,
              fontFamily: "var(--font-body)", fontSize: 14,
            }}>
              {greeting ? `Log out (${greeting})` : "Log out"}
            </button>
          </>
        ) : !loading ? (
          <>
            <Link href="/login" className="btn-glass" tabIndex={menuOpen ? undefined : -1} style={{
              flex: 1, height: 48, textDecoration: "none",
              fontFamily: "var(--font-body)", fontSize: 14,
            }}>
              <LogIn size={16} /> Log in
            </Link>
            <Link href="/register" className="btn-gradient" tabIndex={menuOpen ? undefined : -1} style={{
              flex: 1, height: 48, textDecoration: "none",
              fontFamily: "var(--font-body)", fontSize: 14,
            }}>
              <UserPlus size={16} /> Register
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      <header className="nav-header" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(11,17,33,0.85)",
        backdropFilter: "blur(24px) saturate(200%)",
        WebkitBackdropFilter: "blur(24px) saturate(200%)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        transition: "box-shadow 0.3s ease",
        boxShadow: scrolled ? "0 1px 40px rgba(0,0,0,0.5)" : "none",
      }}>

        <div className="nav-inner" style={{ maxWidth: 1280, margin: "0 auto", height: "100%", alignItems: "center" }}>

          {/* Logo */}
          <Link href="/" style={{
            textDecoration: "none", display: "flex", alignItems: "center", gap: 10,
            flexShrink: 0, overflow: "hidden",
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: "linear-gradient(135deg, var(--glass-indigo), var(--glass-purple))",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "#fff", letterSpacing: "-0.5px" }}>DH</span>
            </div>
            <span style={{
              fontFamily: "var(--font-display)", fontWeight: 700,
              fontSize: 17, letterSpacing: "-0.3px", color: "#fff",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
            }}>
              DirectHire
            </span>
          </Link>

          {/* Nav links — desktop only */}
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
                      background: "linear-gradient(90deg, var(--glass-indigo), var(--glass-purple))",
                      borderRadius: 2,
                    }} />
                  )}
                </div>
              );
            })}
          </nav>

          {/* Right: hamburger (mobile) | desktop auth */}
          <div className="nav-right" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>

            {/* Hamburger — mobile only */}
            <button
              className="nav-hamburger"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              style={{
                display: "none",
                alignItems: "center", justifyContent: "center",
                width: 44, height: 44, borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.8)",
                cursor: "pointer",
              }}
            >
              <Menu size={20} strokeWidth={1.75} />
            </button>

            {/* Desktop auth */}
            <div className="nav-auth" style={{ display: "none" }}>
              <DesktopCTAs />
            </div>
          </div>
        </div>

        <style>{`
          /* ── Mobile (<768px) ── */
          .nav-header    { height: 64px; }
          .nav-inner     { display: flex !important; justify-content: space-between !important;
                           align-items: center !important; padding: 0 16px !important; }
          .nav-links     { display: none !important; }
          .nav-auth      { display: none !important; }
          .nav-right     { display: flex !important; }
          .nav-hamburger { display: flex !important; }

          /* ── Desktop (≥768px) ── */
          @media (min-width: 768px) {
            .nav-header    { height: 64px; }
            .nav-inner     { display: grid !important;
                             grid-template-columns: 200px 1fr 200px !important;
                             padding: 0 40px !important;
                             align-items: center !important; }
            .nav-links     { display: flex !important; }
            .nav-auth      { display: flex !important; }
            .nav-hamburger { display: none !important; }
          }
        `}</style>
      </header>

      {/* Portal — renders directly into document.body, escaping all parent stacking contexts */}
      {mounted && createPortal(overlay, document.body)}
    </>
  );
}
