"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Briefcase,
  ClipboardList,
  ShieldCheck,
  User,
  Settings,
  LogOut,
  Bell,
} from "lucide-react";
import { userApi, workerApi } from "@/lib/api-client";
import WorkerLockBanner, { type ActiveLock } from "@/components/worker/WorkerLockBanner";

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: "/worker/jobs",         label: "Job feed",     Icon: Briefcase     },
  { href: "/worker/applications", label: "Applications", Icon: ClipboardList },
  { href: "/worker/trust",        label: "Trust score",  Icon: ShieldCheck   },
  { href: "/worker/profile",      label: "My profile",   Icon: User          },
  { href: "/worker/settings",     label: "Settings",     Icon: Settings      },
] as const;

const TEAL_50  = "#f0fdfa";
const TEAL_800 = "#115e59";
const TEAL_700 = "#0f766e";

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();

  const [ready,      setReady]      = useState(false);
  const [initials,   setInitials]   = useState("?");
  const [activeLock, setActiveLock] = useState<ActiveLock | null>(null);

  const lockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auth guard — runs once on mount ───────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("dh_token");
    const role  = localStorage.getItem("dh_role");

    if (!token || role !== "worker") {
      router.push("/login");
      return;
    }

    setReady(true);

    // Fetch avatar initials from profile
    userApi.getProfile().then((res) => {
      if (!res.success) return;
      const d = res.data as {
        profile?: { firstName?: string; lastName?: string } | null;
        user?:    { email?: string };
      };
      const first = d?.profile?.firstName ?? d?.user?.email ?? "";
      const last  = d?.profile?.lastName  ?? "";
      const computed = [first[0], last[0]]
        .filter(Boolean)
        .join("")
        .toUpperCase();
      setInitials(computed || "?");
    });
  }, []);

  // ── Lock status — fetch once, revalidate every 60 s ───────────────────────
  useEffect(() => {
    if (!ready) return;

    async function fetchLockStatus() {
      try {
        const res = await workerApi.getLockStatus();
        if (res.success) {
          const d = res.data as {
            is_locked:   boolean;
            active_lock: ActiveLock | null;
          };
          setActiveLock(d.is_locked && d.active_lock ? d.active_lock : null);
        }
      } catch {
        // silently ignore — banner simply won't show
      }
    }

    fetchLockStatus();
    lockTimerRef.current = setInterval(fetchLockStatus, 60_000);
    return () => {
      if (lockTimerRef.current) clearInterval(lockTimerRef.current);
    };
  }, [ready]);

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

  const isLocked = activeLock !== null;

  return (
    <div
      style={{
        display:             "grid",
        gridTemplateColumns: "200px 1fr",
        // Header row | optional banner row | content row
        gridTemplateRows:    "56px auto 1fr",
        minHeight:           "100vh",
        background:          "#f8fafc",
      }}
    >
      {/* ── Top bar — spans both columns ───────────────────────────────────── */}
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
        {/* Wordmark */}
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

        {/* Right-side controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Bell — red dot when locked */}
          <Link
            href="/worker/notifications"
            aria-label="Notifications"
            style={{
              position:        "relative",
              width:           36,
              height:          36,
              display:         "flex",
              alignItems:      "center",
              justifyContent:  "center",
              borderRadius:    8,
              border:          "1px solid #e2e8f0",
              background:      "#f8fafc",
              color:           "#64748b",
              textDecoration:  "none",
              transition:      "all 0.12s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLAnchorElement).style.background  = TEAL_50;
              (e.currentTarget as HTMLAnchorElement).style.borderColor = TEAL_700;
              (e.currentTarget as HTMLAnchorElement).style.color       = TEAL_800;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLAnchorElement).style.background  = "#f8fafc";
              (e.currentTarget as HTMLAnchorElement).style.borderColor = "#e2e8f0";
              (e.currentTarget as HTMLAnchorElement).style.color       = "#64748b";
            }}
          >
            <Bell size={16} strokeWidth={1.75} />
            {isLocked && (
              <span
                aria-label="Lock notification"
                style={{
                  position:     "absolute",
                  top:          5,
                  right:        5,
                  width:        7,
                  height:       7,
                  borderRadius: "50%",
                  background:   "#E24B4A",
                  border:       "1.5px solid #ffffff",
                  display:      "block",
                }}
              />
            )}
          </Link>

          {/* Avatar */}
          <div
            aria-label="Your account"
            style={{
              width:       32,
              height:      32,
              borderRadius: "50%",
              background:  `linear-gradient(135deg, ${TEAL_700}, #0369a1)`,
              display:     "flex",
              alignItems:  "center",
              justifyContent: "center",
              fontSize:    12,
              fontWeight:  700,
              color:       "#ffffff",
              flexShrink:  0,
              userSelect:  "none",
            }}
          >
            {initials}
          </div>
        </div>
      </header>

      {/* ── Lock banner — full-width, auto-height (collapses when null) ──────── */}
      <div style={{ gridColumn: "1 / -1" }}>
        <WorkerLockBanner activeLock={activeLock} />
      </div>

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
            (href !== "/worker/jobs" && pathname.startsWith(href + "/")) ||
            (href === "/worker/jobs" && (pathname === href || pathname.startsWith("/worker/jobs/")));

          return (
            <Link
              key={href}
              href={href}
              style={{
                display:        "flex",
                alignItems:     "center",
                gap:            10,
                padding:        "9px 12px",
                borderRadius:   8,
                textDecoration: "none",
                fontSize:       13,
                fontWeight:     isActive ? 600 : 500,
                background:     isActive ? TEAL_50  : "transparent",
                color:          isActive ? TEAL_800 : "#475569",
                transition:     "all 0.12s",
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLAnchorElement).style.background = "#f1f5f9";
                  (e.currentTarget as HTMLAnchorElement).style.color      = "#1e293b";
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                  (e.currentTarget as HTMLAnchorElement).style.color      = "#475569";
                }
              }}
            >
              <Icon size={16} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}

        {/* Push logout to bottom */}
        <div style={{ flex: 1 }} />

        <button
          onClick={logout}
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          10,
            padding:      "9px 12px",
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
          <LogOut size={16} strokeWidth={1.75} />
          Log out
        </button>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main style={{ minHeight: 0, overflowY: "auto" }}>
        {children}
      </main>
    </div>
  );
}
