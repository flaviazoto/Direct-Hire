"use client";
// src/app/(app)/layout.tsx — Dark premium sidebar layout

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { authApi, adminApi, employerApi, workerApi } from "@/lib/api-client";
import DashboardHeader   from "@/components/dashboard/DashboardHeader";
import WorkerHeader      from "@/components/dashboard/WorkerHeader";

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.582-7 8-7s8 3 8 7" />
    </svg>
  ),
  clipboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6M9 16h4" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <circle cx="9" cy="7" r="4" /><path d="M3 21v-1a6 6 0 016-6" />
      <circle cx="17" cy="9" r="3" /><path d="M21 21v-1a4 4 0 00-5-3.87" />
    </svg>
  ),
  briefcase: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2M12 12v4M10 14h4" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" />
      <circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  creditcard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  ),
  building: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/>
    </svg>
  ),
};

// ─── Nav definitions ─────────────────────────────────────────────────────────

const WORKER_NAV = [
  { icon: icons.dashboard, label: "Dashboard",     href: "/worker/dashboard" },
  { icon: icons.search,    label: "Browse Jobs",   href: "/worker/jobs" },
  { icon: icons.user,      label: "My Profile",    href: "/worker/profile" },
  { icon: icons.clipboard,  label: "Applications",  href: "/worker/applications" },
  { icon: icons.creditcard, label: "Payments",      href: "/worker/payments" },
  { icon: icons.lock,       label: "Reservations",  href: "/worker/reservations", badgeKey: "worker_reserved" as const },
  { icon: icons.folder,    label: "Documents",     href: "/worker/documents" },
  { icon: icons.mail,      label: "Messages",      href: "/worker/messages" },
  { icon: icons.bell,      label: "Notifications", href: "/worker/notifications" },
];

const EMPLOYER_NAV = [
  { icon: icons.dashboard,  label: "Dashboard",    href: "/employer/dashboard" },
  { icon: icons.search,     label: "Find Workers", href: "/employer/workers" },
  { icon: icons.briefcase,  label: "Job Posts",    href: "/employer/jobs" },
  { icon: icons.clipboard,  label: "Applications", href: "/employer/applications" },
  { icon: icons.building,   label: "Company",      href: "/employer/profile" },
  { icon: icons.lock,       label: "Reservations", href: "/employer/locks", badgeKey: "active_locks" as const },
  { icon: icons.creditcard, label: "Billing",      href: "/employer/billing" },
];

const ADMIN_NAV = [
  { icon: icons.chart,      label: "Overview",         href: "/admin/dashboard" },
  { icon: icons.chart,      label: "Revenue",          href: "/admin/revenue" },
  { icon: icons.clock,      label: "Pending Review",   href: "/admin/users/pending" },
  { icon: icons.check,      label: "Approvals",        href: "/admin/approvals" },
  { icon: icons.clipboard,  label: "Document Review",  href: "/admin/document-review" },
  { icon: icons.users,      label: "Users",            href: "/admin/users" },
  { icon: icons.list,       label: "Audit Log",        href: "/admin/audit-log" },
  { icon: icons.shield,     label: "Fraud Console",    href: "/admin/fraud" },
  { icon: icons.mail,       label: "Email Logs",       href: "/admin/email-logs" },
  { icon: icons.creditcard, label: "Pricing",          href: "/admin/pricing" },
];

// Job posts section — rendered separately as a collapsible group
const ADMIN_JOB_NAV = [
  { label: "Pending review", href: "/admin/jobs/pending", badgeKey: "pending_jobs" as const },
  { label: "All job posts",  href: "/admin/jobs",        badgeKey: null },
];

type Role = "worker" | "employer" | "admin";

const ROLE_CONFIG: Record<Role, {
  nav: { icon: React.ReactNode; label: string; href: string; badgeKey?: string }[];
  accent: string;
  accentRgb: string;
  label: string;
  badge?: string;
  portalLabel: string;
}> = {
  worker:   { nav: WORKER_NAV,   accent: "#7c3aed", accentRgb: "124,58,237",  label: "Worker Portal",   portalLabel: "Worker Portal"   },
  employer: { nav: EMPLOYER_NAV, accent: "#0d9488", accentRgb: "13,148,136",  label: "Employer Portal", portalLabel: "Employer Portal" },
  admin:    { nav: ADMIN_NAV,    accent: "#dc2626", accentRgb: "220,38,38",   label: "Admin Panel",     portalLabel: "Admin Control", badge: "Admin" },
};

// ─── NavItem (handles hover state internally) ────────────────────────────────

function NavItem({
  item,
  isActive,
  accent,
  accentRgb,
  badgeCount,
  dotBadge,
}: {
  item: { icon: React.ReactNode; label: string; href: string; badgeKey?: string };
  isActive: boolean;
  accent: string;
  accentRgb: string;
  badgeCount?: number;
  dotBadge?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  const bgColor = isActive
    ? `rgba(${accentRgb},0.12)`
    : hovered
    ? `rgba(${accentRgb},0.06)`
    : "transparent";

  const color = isActive ? "#f8fafc" : hovered ? "#f8fafc" : "rgba(248,250,252,0.45)";
  const iconColor = isActive ? accent : hovered ? "#f8fafc" : "rgba(248,250,252,0.4)";

  return (
    <Link
      href={item.href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: isActive ? "9px 12px 9px 10px" : "9px 12px",
        borderRadius: 10,
        textDecoration: "none",
        transition: "all 0.15s",
        background: bgColor,
        color,
        borderLeft: isActive ? `2px solid ${accent}` : "2px solid transparent",
        fontSize: 13,
        fontWeight: 500,
        marginBottom: 2,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ width: 16, height: 16, flexShrink: 0, color: iconColor, transition: "color 0.15s" }}>
        {item.icon}
      </div>
      <span style={{ whiteSpace: "nowrap", flex: 1 }}>{item.label}</span>
      {badgeCount != null && badgeCount > 0 && (
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          background: "#f59e0b",
          color: "#ffffff",
          borderRadius: 20,
          padding: "1px 6px",
          lineHeight: "16px",
          flexShrink: 0,
        }}>
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      )}
      {dotBadge && (
        <span style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "#f59e0b",
          flexShrink: 0,
          boxShadow: "0 0 6px rgba(245,158,11,0.6)",
        }} />
      )}
    </Link>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface AdminCounts {
  pending_review:  number;
  total_workers:   number;
  total_employers: number;
  pending_jobs:    number;
  live_jobs:       number;
}

function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const router = useRouter();
  const { nav, accent, accentRgb, label, badge, portalLabel } = ROLE_CONFIG[role];
  const [logoutHovered,    setLogoutHovered]    = useState(false);
  const [adminCounts,      setAdminCounts]      = useState<AdminCounts | null>(null);
  const [activeLockCount,  setActiveLockCount]  = useState(0);
  const [workerIsLocked,   setWorkerIsLocked]   = useState(false);
  const [workerNotifCount, setWorkerNotifCount] = useState(0);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (role !== "admin") return;
    const fetchCounts = async () => {
      const res = await adminApi.getUserCounts();
      if (res.success && res.data) {
        const d = res.data as Record<string, number>;
        setAdminCounts({
          pending_review:  d.pending_review  ?? 0,
          total_workers:   d.total_workers   ?? 0,
          total_employers: d.total_employers ?? 0,
          pending_jobs:    d.pending_jobs    ?? 0,
          live_jobs:       d.live_jobs       ?? 0,
        });
      }
    };
    fetchCounts();
    intervalRef.current = setInterval(fetchCounts, 120_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [role]);

  useEffect(() => {
    if (role !== "employer") return;
    const fetchLockCount = async () => {
      const res = await employerApi.getLocks({ status: "ACTIVE", limit: "1" });
      if (res.success && res.data) {
        const d = res.data as { total?: number };
        setActiveLockCount(d.total ?? 0);
      }
    };
    fetchLockCount();
    intervalRef.current = setInterval(fetchLockCount, 120_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [role]);

  useEffect(() => {
    if (role !== "worker") return;
    const fetchWorkerLock = async () => {
      const res = await workerApi.getLockStatus();
      if (res.success && res.data) {
        const d = res.data as { is_locked?: boolean };
        setWorkerIsLocked(d.is_locked ?? false);
      }
    };
    fetchWorkerLock();
    intervalRef.current = setInterval(fetchWorkerLock, 5 * 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [role]);

  useEffect(() => {
    if (role !== "worker") return;
    const fetchNotifCount = async () => {
      const res = await workerApi.getUnreadCount();
      if (res.success && res.data) {
        const d = res.data as { count?: number };
        setWorkerNotifCount(d.count ?? 0);
      }
    };
    fetchNotifCount();
    notifRef.current = setInterval(fetchNotifCount, 30_000);
    return () => { if (notifRef.current) clearInterval(notifRef.current); };
  }, [role]);

  const handleLogout = async () => {
    localStorage.removeItem("dh_token");
    localStorage.removeItem("dh_role");
    authApi.logout().catch(() => {});
    router.push("/login");
  };

  return (
    <aside
      className="app-sidebar"
      style={{
        width: 260,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        background: "var(--navy-2, #0b1120)",
        borderRight: `1px solid rgba(${accentRgb},0.15)`,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      {/* Logo */}
      <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid rgba(${accentRgb},0.1)` }}>
        <Link href={`/${role}/dashboard`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: `linear-gradient(135deg, var(--blue-2), var(--blue-1))`, boxShadow: "0 2px 10px rgba(30,84,183,0.3)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white" />
              <path d="M2 17l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M2 12l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" opacity="0.5" />
            </svg>
          </div>
          <div>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, letterSpacing: "-0.03em", background: "linear-gradient(135deg, var(--white) 0%, var(--blue-4) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>DirectHire</span>
            <div style={{ fontSize: 9, fontWeight: 700, color: accent, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginTop: 1 }}>{portalLabel}</div>
          </div>
        </Link>
      </div>

      {/* Role badge placeholder (keeps spacing) */}
      <div style={{ height: 4 }} />

      {/* Admin stats row */}
      {role === "admin" && adminCounts && (
        <div style={{
          display: "flex",
          gap: 0,
          margin: "8px 10px 0",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.05)",
          overflow: "hidden",
        }}>
          {[
            { label: "Workers",  value: adminCounts.total_workers },
            { label: "Employers", value: adminCounts.total_employers },
            { label: "Users",    value: adminCounts.pending_review, highlight: adminCounts.pending_review > 0 },
            { label: "Jobs",     value: adminCounts.pending_jobs,   highlight: adminCounts.pending_jobs > 0 },
          ].map((stat, i, arr) => (
            <div key={stat.label} style={{
              flex: 1,
              textAlign: "center",
              padding: "6px 4px",
              borderRight: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : undefined,
            }}>
              <div style={{
                fontSize: 13,
                fontWeight: 700,
                color: stat.highlight ? "#f59e0b" : "#aaaaaa",
              }}>{stat.value}</div>
              <div style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 1 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
        {nav.map(item => {
          const isActive = pathname === item.href || (item.href !== `/${role}/dashboard` && pathname.startsWith(item.href));
          const isPendingReview    = item.href === "/admin/users/pending";
          const isLocksItem        = item.href === "/employer/locks";
          const isReservationsItem = item.href === "/worker/reservations";
          const isNotificationsItem = item.href === "/worker/notifications";
          const isMessagesItem      = item.href === "/worker/messages";
          return (
            <NavItem
              key={item.href}
              item={item}
              isActive={isActive}
              accent={accent}
              accentRgb={accentRgb}
              badgeCount={
                isPendingReview   ? (adminCounts?.pending_review ?? undefined) :
                isNotificationsItem ? (workerNotifCount > 0 ? workerNotifCount : undefined) :
                isMessagesItem      ? undefined :
                undefined
              }
              dotBadge={(isLocksItem && activeLockCount > 0) || (isReservationsItem && workerIsLocked)}
            />
          );
        })}

        {/* Job Posts section — admin only */}
        {role === "admin" && (
          <div style={{ marginTop: 12 }}>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#333",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              padding: "0 12px",
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <div style={{ width: 14, height: 14, color: "#444", flexShrink: 0 }}>{icons.briefcase}</div>
              Job Posts
            </div>
            {ADMIN_JOB_NAV.map(item => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              const count = item.badgeKey === "pending_jobs" ? (adminCounts?.pending_jobs ?? undefined) : undefined;
              return (
                <NavItem
                  key={item.href}
                  item={{ icon: null, label: item.label, href: item.href }}
                  isActive={isActive}
                  accent={accent}
                  accentRgb={accentRgb}
                  badgeCount={count}
                />
              );
            })}
          </div>
        )}
      </nav>

      {/* Footer / Logout */}
      <div style={{ borderTop: `1px solid rgba(${accentRgb},0.1)`, padding: "12px 10px" }}>
        <button
          onClick={handleLogout}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 12px",
            borderRadius: 10,
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
            transition: "all 0.15s",
            background: logoutHovered ? "rgba(239,68,68,0.08)" : "transparent",
            color: logoutHovered ? "#f87171" : "var(--text-muted,#4A5980)",
          }}
          onMouseEnter={() => setLogoutHovered(true)}
          onMouseLeave={() => setLogoutHovered(false)}
        >
          <div style={{ width: 16, height: 16, flexShrink: 0 }}>{icons.logout}</div>
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}

// ─── WorkerTopBar ─────────────────────────────────────────────────────────────

interface NotifItem {
  id: string; title: string; body: string; isRead: boolean; link?: string; createdAt: string;
}

function WorkerTopBar() {
  const router = useRouter();
  const [unread,   setUnread]   = useState(0);
  const [open,     setOpen]     = useState(false);
  const [notifs,   setNotifs]   = useState<NotifItem[]>([]);
  const [loading,  setLoading]  = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Poll unread count every 30s
  useEffect(() => {
    const fetch_ = async () => {
      const res = await workerApi.getUnreadCount();
      if (res.success) setUnread((res.data as { count: number })?.count ?? 0);
    };
    fetch_();
    const t = setInterval(fetch_, 30_000);
    return () => clearInterval(t);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function toggleOpen() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setLoading(true);
    const res = await workerApi.getNotifications({ limit: "5" });
    if (res.success) {
      const d = res.data as { data?: NotifItem[] } | NotifItem[];
      setNotifs(Array.isArray(d) ? d : (d as { data?: NotifItem[] }).data ?? []);
    }
    setLoading(false);
  }

  async function handleNotifClick(n: NotifItem) {
    setOpen(false);
    if (!n.isRead) {
      await workerApi.markNotificationRead(n.id);
      setUnread(c => Math.max(0, c - 1));
      setNotifs(ns => ns.map(x => x.id === n.id ? { ...x, isRead: true } : x));
    }
    router.push(n.link ?? "/worker/notifications");
  }

  function timeAgo(d: string) {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60)  return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  return (
    <div className="worker-topbar" style={{ position: "sticky", top: 0, zIndex: 50, background: "var(--navy-2, #0b1120)", borderBottom: "1px solid rgba(124,58,237,0.1)", padding: "8px 24px", display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
      <div ref={wrapRef} style={{ position: "relative" }}>
        <button
          onClick={toggleOpen}
          aria-label="Notifications"
          style={{ position: "relative", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 10, cursor: "pointer", color: "rgba(248,250,252,0.7)", transition: "all 0.15s" }}
          onMouseOver={e => { e.currentTarget.style.background = "rgba(124,58,237,0.16)"; e.currentTarget.style.color = "#f8fafc"; }}
          onMouseOut={e  => { e.currentTarget.style.background = "rgba(124,58,237,0.08)"; e.currentTarget.style.color = "rgba(248,250,252,0.7)"; }}
        >
          <div style={{ width: 18, height: 18 }}>{icons.bell}</div>
          {unread > 0 && (
            <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, background: "#dc2626", color: "white", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: "2px solid #0b1120" }}>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>

        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 340, background: "#111827", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", overflow: "hidden", zIndex: 100 }}>
            {/* Header */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc" }}>Notifications</span>
              {unread > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", background: "rgba(124,58,237,0.12)", borderRadius: 20, padding: "2px 8px" }}>
                  {unread} unread
                </span>
              )}
            </div>

            {/* List */}
            {loading ? (
              <div style={{ padding: 24, textAlign: "center", color: "#64748b", fontSize: 13 }}>Loading…</div>
            ) : notifs.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#64748b", fontSize: 13 }}>No notifications yet</div>
            ) : (
              notifs.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  style={{ width: "100%", display: "flex", gap: 12, padding: "12px 16px", background: n.isRead ? "transparent" : "rgba(124,58,237,0.06)", border: "none", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", textAlign: "left", transition: "background 0.1s" }}
                  onMouseOver={e => (e.currentTarget.style.background = "rgba(124,58,237,0.1)")}
                  onMouseOut={e  => (e.currentTarget.style.background = n.isRead ? "transparent" : "rgba(124,58,237,0.06)")}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: n.isRead ? "transparent" : "#7c3aed", flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.title}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{n.body}</div>
                    <div style={{ fontSize: 11, color: "#4b5563", marginTop: 3 }}>{timeAgo(n.createdAt)}</div>
                  </div>
                </button>
              ))
            )}

            {/* Footer */}
            <button
              onClick={() => { setOpen(false); router.push("/worker/notifications"); }}
              style={{ width: "100%", padding: "10px 16px", background: "transparent", border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", color: "#7c3aed", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "background 0.1s" }}
              onMouseOver={e => (e.currentTarget.style.background = "rgba(124,58,237,0.08)")}
              onMouseOut={e  => (e.currentTarget.style.background = "transparent")}
            >
              View all notifications →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("dh_token") : null;
    if (!token) router.push("/login");
  }, []);

  const role: Role = pathname.startsWith("/admin")
    ? "admin"
    : pathname.startsWith("/employer")
    ? "employer"
    : "worker";

  if (pathname.includes("/onboarding")) {
    return <>{children}</>;
  }

  const handleLogout = () => {
    localStorage.removeItem("dh_token");
    localStorage.removeItem("dh_role");
    authApi.logout().catch(() => {});
    router.push("/login");
  };

  return (
    <div className="app-shell" style={{ display: "flex", flexDirection: "row", minHeight: "100vh", background: "var(--navy, #05080f)" }}>
      <style>{`
        @media (max-width: 1023px) {
          .app-sidebar   { display: none !important; }
          .worker-topbar { display: none !important; }
          .app-main      { padding-top: 56px !important; }
        }
        @media (max-width: 768px) {
          .admin-page-root { padding: 16px !important; }
          .admin-quick-nav { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .admin-quick-nav { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <Sidebar role={role} />
      <main className="app-main" style={{ flex: 1, minWidth: 0, background: "var(--navy, #05080f)", minHeight: "100vh", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {role === 'worker'
          ? <WorkerHeader onLogout={handleLogout} />
          : <DashboardHeader role={role} onLogout={handleLogout} />
        }
        {role === "worker" && <WorkerTopBar />}
        <div key={pathname} data-page-root style={{ flex: 1, minWidth: 0 }}>
          {children}
        </div>
      </main>

    </div>
  );
}
