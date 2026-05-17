"use client";
// frontend/src/app/(app)/employer/layout.tsx
// JWT auth guard + employer shell layout (amber accent scheme).
// Subscription gate: shows a full-height overlay over <main> when inactive —
// sidebar and top bar remain visible and interactive behind it.

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Briefcase,
  Users,
  Lock,
  CreditCard,
  ShieldCheck,
  Settings,
  LogOut,
  Bell,
} from "lucide-react";
import { userApi, employerApi } from "@/lib/api-client";

// ── Palette ───────────────────────────────────────────────────────────────────

const AMBER_50   = "#FAEEDA";
const AMBER_800  = "#633806";
const AMBER_700  = "#7B4D0A";
const AMBER_400  = "#EF9F27";
const AMBER_100  = "#FDE5B4";

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: "/employer/jobs",       label: "Jobs",         Icon: Briefcase  },
  { href: "/employer/candidates", label: "Candidates",   Icon: Users      },
  { href: "/employer/locks",      label: "Worker locks", Icon: Lock       },
  { href: "/employer/billing",    label: "Billing",      Icon: CreditCard },
  { href: "/employer/escrow",     label: "Escrow",       Icon: ShieldCheck },
  { href: "/employer/settings",   label: "Settings",     Icon: Settings   },
] as const;

// ── Subscription gate overlay ─────────────────────────────────────────────────

function SubscriptionGate() {
  return (
    <div
      style={{
        position:       "absolute",
        inset:          0,
        zIndex:         20,
        background:     "rgba(255, 255, 255, 0.92)",
        backdropFilter: "blur(3px)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        flexDirection:  "column",
        gap:            20,
        padding:        32,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width:          56,
          height:         56,
          borderRadius:   "50%",
          background:     AMBER_50,
          border:         `2px solid ${AMBER_400}`,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
        }}
      >
        <CreditCard size={24} color={AMBER_800} strokeWidth={1.75} />
      </div>

      {/* Text */}
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <h2
          style={{
            fontSize:   20,
            fontWeight: 800,
            color:      "#08142A",
            margin:     "0 0 8px",
            lineHeight: 1.2,
          }}
        >
          Your subscription is inactive
        </h2>
        <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.6 }}>
          Activate to post jobs and view workers.
        </p>
      </div>

      {/* CTA */}
      <Link
        href="/employer/subscribe"
        style={{
          display:        "inline-flex",
          alignItems:     "center",
          justifyContent: "center",
          padding:        "11px 28px",
          background:     AMBER_400,
          color:          AMBER_800,
          fontSize:       14,
          fontWeight:     700,
          borderRadius:   9,
          textDecoration: "none",
          transition:     "opacity 0.12s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = "0.88"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = "1";    }}
      >
        Activate subscription
      </Link>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function EmployerLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();

  const [ready,          setReady]          = useState(false);
  const [initials,       setInitials]       = useState("?");
  const [subActive,      setSubActive]      = useState(true);   // optimistic: assume active
  const [subPill,        setSubPill]        = useState<"active" | "inactive" | null>(null);

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("dh_token");
    const role  = localStorage.getItem("dh_role");

    if (!token || role !== "employer") {
      router.push("/login");
      return;
    }

    setReady(true);

    // Fetch company initials
    userApi.getProfile().then(res => {
      if (!res.success) return;
      const d = res.data as {
        profile?: { companyName?: string; firstName?: string; lastName?: string } | null;
        user?:    { email?: string };
      };
      const company = d?.profile?.companyName ?? "";
      if (company) {
        // First two uppercase chars of company name words
        const words = company.trim().split(/\s+/);
        const computed = words
          .slice(0, 2)
          .map(w => w[0]?.toUpperCase() ?? "")
          .join("");
        setInitials(computed || company[0]?.toUpperCase() || "?");
      } else {
        // Fallback: user email or first/last name
        const first = d?.profile?.firstName ?? d?.user?.email ?? "";
        const last  = d?.profile?.lastName  ?? "";
        const computed = [first[0], last[0]].filter(Boolean).join("").toUpperCase();
        setInitials(computed || "?");
      }
    });

    // Fetch subscription status
    employerApi.getSubscriptionStatus().then(res => {
      if (!res.success) return;
      const d = res.data as { status?: string } | null;
      const status = d?.status?.toUpperCase() ?? "";
      const active = status === "ACTIVE" || status === "TRIALING";
      setSubActive(active);
      setSubPill(active ? "active" : "inactive");
    }).catch(() => {
      setSubPill(null); // hide pill on error — don't block the UI
    });
  }, []);

  function logout() {
    const token = localStorage.getItem("dh_token");
    fetch("/api/auth/logout", {
      method:  "DELETE",
      headers: { Authorization: `Bearer ${token ?? ""}` },
    }).catch(() => {});
    localStorage.removeItem("dh_token");
    localStorage.removeItem("dh_role");
    router.push("/login");
  }

  if (!ready) return null;

  return (
    <div
      style={{
        display:             "grid",
        gridTemplateColumns: "180px 1fr",
        gridTemplateRows:    "56px 1fr",
        minHeight:           "100vh",
        background:          "#f8fafc",
      }}
    >
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header
        style={{
          gridColumn:     "1 / -1",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          padding:        "0 24px",
          background:     "#ffffff",
          borderBottom:   "1px solid #e2e8f0",
          position:       "sticky",
          top:            0,
          zIndex:         50,
        }}
      >
        {/* Left: wordmark + role label */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              fontWeight:    800,
              fontSize:      18,
              letterSpacing: "-0.03em",
              color:         "#0f172a",
              fontFamily:    "var(--font-display, 'Inter', sans-serif)",
              userSelect:    "none",
            }}
          >
            DirectHire
          </span>
          <span
            style={{
              fontSize:   11,
              fontWeight: 500,
              color:      "#94a3b8",
              letterSpacing: "0.03em",
            }}
          >
            Employer
          </span>
        </div>

        {/* Right controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Subscription pill */}
          {subPill === "active" && (
            <span
              style={{
                display:      "inline-flex",
                alignItems:   "center",
                gap:          5,
                background:   "#F0FDF4",
                color:        "#14532D",
                fontSize:     11,
                fontWeight:   700,
                padding:      "3px 10px",
                borderRadius: 100,
                border:       "1px solid #86EFAC",
                whiteSpace:   "nowrap",
              }}
            >
              <span style={{ fontSize: 8, color: "#16A34A" }}>●</span>
              Active subscription
            </span>
          )}
          {subPill === "inactive" && (
            <Link
              href="/employer/subscribe"
              style={{
                display:        "inline-flex",
                alignItems:     "center",
                gap:            5,
                background:     "#FEF2F2",
                color:          "#991B1B",
                fontSize:       11,
                fontWeight:     700,
                padding:        "3px 10px",
                borderRadius:   100,
                border:         "1px solid #FCA5A5",
                whiteSpace:     "nowrap",
                textDecoration: "none",
              }}
            >
              <span style={{ fontSize: 8, color: "#EF4444" }}>●</span>
              Subscription required
            </Link>
          )}

          {/* Bell */}
          <button
            aria-label="Notifications"
            style={{
              width:          36,
              height:         36,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              borderRadius:   8,
              border:         "1px solid #e2e8f0",
              background:     "#f8fafc",
              color:          "#64748b",
              cursor:         "pointer",
              transition:     "all 0.12s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background  = AMBER_50;
              e.currentTarget.style.borderColor = AMBER_400;
              e.currentTarget.style.color       = AMBER_800;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background  = "#f8fafc";
              e.currentTarget.style.borderColor = "#e2e8f0";
              e.currentTarget.style.color       = "#64748b";
            }}
          >
            <Bell size={16} strokeWidth={1.75} />
          </button>

          {/* Avatar — company initials */}
          <div
            aria-label="Your account"
            style={{
              width:          32,
              height:         32,
              borderRadius:   "50%",
              background:     `linear-gradient(135deg, ${AMBER_700}, ${AMBER_400})`,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              fontSize:       12,
              fontWeight:     800,
              color:          "#ffffff",
              flexShrink:     0,
              userSelect:     "none",
              letterSpacing:  "0.02em",
            }}
          >
            {initials}
          </div>
        </div>
      </header>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        style={{
          background:    "#ffffff",
          borderRight:   "1px solid #e2e8f0",
          padding:       "12px 8px",
          display:       "flex",
          flexDirection: "column",
          gap:           2,
          position:      "sticky",
          top:           56,
          height:        "calc(100vh - 56px)",
          overflowY:     "auto",
        }}
      >
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive =
            pathname === href ||
            pathname.startsWith(href + "/");

          return (
            <Link
              key={href}
              href={href}
              style={{
                display:        "flex",
                alignItems:     "center",
                gap:            9,
                padding:        "9px 11px",
                borderRadius:   8,
                textDecoration: "none",
                fontSize:       13,
                fontWeight:     isActive ? 600 : 500,
                background:     isActive ? AMBER_50  : "transparent",
                color:          isActive ? AMBER_800 : "#475569",
                transition:     "all 0.12s",
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLAnchorElement).style.background = AMBER_50;
                  (e.currentTarget as HTMLAnchorElement).style.color      = AMBER_800;
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                  (e.currentTarget as HTMLAnchorElement).style.color      = "#475569";
                }
              }}
            >
              <Icon size={15} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}

        {/* Spacer + logout */}
        <div style={{ flex: 1 }} />

        <button
          onClick={logout}
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          9,
            padding:      "9px 11px",
            borderRadius: 8,
            border:       "none",
            background:   "transparent",
            color:        "#94a3b8",
            fontSize:     13,
            fontWeight:   500,
            cursor:       "pointer",
            width:        "100%",
            textAlign:    "left",
            transition:   "all 0.12s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "#fef2f2";
            e.currentTarget.style.color      = "#dc2626";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color      = "#94a3b8";
          }}
        >
          <LogOut size={15} strokeWidth={1.75} />
          Log out
        </button>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main
        style={{
          position:  "relative",   // anchor for the subscription overlay
          minHeight: 0,
          overflowY: "auto",
          padding:   "1.5rem",
        }}
      >
        {!subActive && <SubscriptionGate />}
        {children}
      </main>
    </div>
  );
}
