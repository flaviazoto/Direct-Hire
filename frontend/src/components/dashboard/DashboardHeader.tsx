'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Menu, X, Bell, ChevronRight, LogOut,
  LayoutGrid, Search, ClipboardList, User, FolderOpen,
  CreditCard, Briefcase, Users, Settings, Clock, FileText,
  TrendingUp, CheckCircle, FileSearch, ShieldAlert, Mail, Tag, Lock, ExternalLink,
  CalendarClock, MessageSquare, Activity, ClipboardCheck, UserCheck,
} from 'lucide-react'
import { employerApi, adminApi, workerApi } from '@/lib/api-client'
import { useNotificationPolling } from '@/hooks/useNotificationPolling'

type NotifItem = {
  id: string
  title: string
  body: string
  isRead: boolean
  link?: string | null
  createdAt: string
}

function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

type Role = 'worker' | 'employer' | 'admin'

type NavLink = {
  href: string
  label: string
  Icon: React.ElementType
}

// Flat links — desktop sidebar only (worker role uses layout.tsx Sidebar instead)
// NOTE: admin key intentionally removed — admin now renders the grouped
// ADMIN_LINKS structure below on both desktop and mobile. Kept employer-only.
const ROLE_LINKS: Record<'worker' | 'employer', NavLink[]> = {
  worker: [
    { href: '/worker/dashboard',     label: 'Dashboard',       Icon: LayoutGrid    },
    { href: '/worker/jobs',          label: 'Browse Jobs',     Icon: Search        },
    { href: '/worker/applications',  label: 'My Applications', Icon: ClipboardList },
    { href: '/worker/document-requests', label: 'Document Requests', Icon: FileText },
    { href: '/worker/profile',       label: 'My Profile',      Icon: User          },
    { href: '/worker/documents',     label: 'Documents',       Icon: FolderOpen    },
    { href: '/worker/payments',      label: 'Payments',        Icon: CreditCard    },
    { href: '/worker/reservations',  label: 'Reservations',    Icon: CalendarClock },
    { href: '/worker/messages',      label: 'Messages',        Icon: MessageSquare },
    { href: '/worker/notifications', label: 'Notifications',   Icon: Bell          },
  ],
  employer: [
    { href: '/employer/dashboard',    label: 'Dashboard',    Icon: LayoutGrid    },
    { href: '/employer/jobs',         label: 'My Jobs',      Icon: Briefcase     },
    { href: '/employer/workers',      label: 'Candidates',   Icon: Users         },
    { href: '/employer/applications', label: 'Applications', Icon: ClipboardList },
    { href: '/employer/messages',     label: 'Messages',     Icon: Mail          },
    { href: '/employer/profile',      label: 'Account',      Icon: Settings      },
    { href: '/employer/locks',        label: 'Locks',        Icon: Lock          },
    { href: '/employer/subscription',  label: 'Billing',      Icon: CreditCard    },
  ],
}

type AdminLinkGroup = {
  section: string
  links: { href: string; label: string; Icon: React.ElementType }[]
}

// DirectHire glassmorphism design system (Phase 3): worker = teal, employer =
// violet, admin = gold — ALL THREE roles now share the same dark glass shell
// (.glass-card-style translucent + blurred sidebar over the shared
// --glass-base canvas). Only the accent color differs per role; there is no
// longer a light-vs-dark split between roles like the previous iteration —
// that's why the old `isDark` branching throughout this file is gone.

// Grouped links — used by BOTH the admin desktop sidebar and mobile overlay
const ADMIN_LINKS: AdminLinkGroup[] = [
  {
    section: 'Overview',
    links: [
      { href: '/admin/dashboard', label: 'Overview', Icon: LayoutGrid },
      { href: '/admin/revenue',   label: 'Revenue',  Icon: TrendingUp },
    ],
  },
  {
    section: 'Users',
    links: [
      { href: '/admin/users/pending',   label: 'Pending Review',  Icon: Clock       },
      { href: '/admin/approvals',       label: 'Approvals',       Icon: CheckCircle },
      { href: '/admin/document-review', label: 'Document Review', Icon: FileSearch  },
      { href: '/admin/users',           label: 'All Users',       Icon: Users       },
    ],
  },
  {
    section: 'Logs & Compliance',
    links: [
      { href: '/admin/audit-log',  label: 'Audit Log',     Icon: FileText    },
      { href: '/admin/fraud',      label: 'Fraud Console', Icon: ShieldAlert },
      { href: '/admin/email-logs', label: 'Email Logs',    Icon: Mail        },
    ],
  },
  {
    section: 'Job Posts',
    links: [
      { href: '/admin/jobs/pending',   label: 'Pending Review', Icon: Clock        },
      { href: '/admin/jobs',           label: 'All Job Posts',  Icon: Briefcase    },
      { href: '/admin/external-jobs',  label: 'External Jobs',  Icon: ExternalLink },
    ],
  },
  {
    section: 'Hiring Workflow',
    links: [
      { href: '/admin/hiring/review',    label: 'Application Review', Icon: ClipboardCheck },
      { href: '/admin/hiring/interview', label: 'Interview & Hire',   Icon: UserCheck       },
    ],
  },
  {
    section: 'Locks',
    links: [{ href: '/admin/locks', label: 'Lock Monitor', Icon: Lock }],
  },
  {
    section: 'System',
    links: [{ href: '/admin/system', label: 'System Health', Icon: Activity }],
  },
  {
    section: 'Settings',
    links: [{ href: '/admin/pricing', label: 'Pricing', Icon: Tag }],
  },
]

// Per-role accent — the ONE thing that still varies by role. Everything else
// (surface, blur, text colors) is now shared across all three.
const ROLE_ACCENT: Record<Role, {
  solid:       string // logo chip, active icon-tile fill
  activeText:  string // active nav label + left-border color
  activeBg:    string // active nav row translucent tint
  hamburgerClass: string
  sectionLabelClass: string
}> = {
  worker: {
    solid:       '#0D9488',
    activeText:  '#2DD4BF',
    activeBg:    'rgba(20,184,166,0.14)',
    hamburgerClass: 'text-worker-400',
    sectionLabelClass: 'text-worker-400/70',
  },
  employer: {
    solid:       '#7C3AED',
    activeText:  '#A78BFA',
    activeBg:    'rgba(139,92,246,0.14)',
    hamburgerClass: 'text-employer-400',
    sectionLabelClass: 'text-employer-400/70',
  },
  admin: {
    solid:       '#C89116',
    activeText:  '#E0B020',
    activeBg:    'rgba(200,145,22,0.16)',
    hamburgerClass: 'text-admin-400',
    sectionLabelClass: 'text-admin-400/70',
  },
}

export default function DashboardHeader({
  role,
  onLogout,
}: {
  role: Role
  onLogout: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  // Notifications — functional for both employer and admin. Same role-agnostic
  // backend handlers (worker-notifications.controller.ts) mounted on each
  // role's router; only the API namespace differs here.
  const [notifOpen,    setNotifOpen]    = useState(false)
  const [notifs,       setNotifs]       = useState<NotifItem[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const mobileNotifRef  = useRef<HTMLDivElement>(null)
  const desktopNotifRef = useRef<HTMLDivElement>(null)

  const fetchUnreadCount = useCallback(
    () => role === 'employer' ? employerApi.getUnreadCount()
        : role === 'admin'    ? adminApi.getUnreadCount()
        : workerApi.getUnreadCount(),
    [role],
  )
  const { unreadCount, refetch: refetchUnreadCount } = useNotificationPolling(fetchUnreadCount)

  async function toggleNotifOpen() {
    if (notifOpen) { setNotifOpen(false); return }
    setNotifOpen(true)
    setNotifLoading(true)
    const res = role === 'admin'
      ? await adminApi.getNotifications({ limit: '10' })
      : role === 'employer'
        ? await employerApi.getNotifications({ limit: '10' })
        : await workerApi.getNotifications({ limit: '10' })
    if (res.success) {
      const d = res.data as { data?: NotifItem[] } | NotifItem[] | undefined
      setNotifs(Array.isArray(d) ? d : (d as { data?: NotifItem[] } | undefined)?.data ?? [])
    }
    setNotifLoading(false)
  }

  async function handleNotifClick(n: NotifItem) {
    setNotifOpen(false)
    if (!n.isRead) {
      if (role === 'admin') await adminApi.markNotificationRead(n.id)
      else if (role === 'employer') await employerApi.markNotificationRead(n.id)
      else await workerApi.markNotificationRead(n.id)
      setNotifs(ns => ns.map(x => x.id === n.id ? { ...x, isRead: true } : x))
      refetchUnreadCount()
    }
    router.push(n.link ?? (role === 'admin' ? '/admin/dashboard' : '/employer/dashboard'))
  }

  async function handleMarkAllRead() {
    if (role === 'admin') await adminApi.markAllNotificationsRead()
    else if (role === 'employer') await employerApi.markAllNotificationsRead()
    else await workerApi.markAllNotificationsRead()
    setNotifs(ns => ns.map(x => ({ ...x, isRead: true })))
    refetchUnreadCount()
  }

  useEffect(() => {
    if (!notifOpen) return
    function handler(e: MouseEvent) {
      const target = e.target as Node
      if (mobileNotifRef.current?.contains(target)) return
      if (desktopNotifRef.current?.contains(target)) return
      setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen])

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width    = '100%'
      document.body.style.top      = `-${window.scrollY}px`
    } else {
      const scrollY = document.body.style.top
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width    = ''
      document.body.style.top      = ''
      if (scrollY) window.scrollTo(0, -parseInt(scrollY))
    }
    return () => {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width    = ''
      document.body.style.top      = ''
    }
  }, [menuOpen])

  useEffect(() => { setMenuOpen(false); setNotifOpen(false) }, [pathname])

  const links = role === 'admin' ? [] : ROLE_LINKS[role]
  const accent = ROLE_ACCENT[role]
  const roleHrefs = role === 'admin'
    ? ADMIN_LINKS.flatMap(group => group.links.map(link => link.href))
    : links.map(link => link.href)

  const isActive = (href: string) => {
    if (href === `/${role}/dashboard` || href === `/${role}`) {
      return pathname === href || pathname === `/${role}/dashboard`
    }
    const bestMatch = roleHrefs
      .filter(candidate => pathname === candidate || pathname.startsWith(candidate + '/'))
      .sort((a, b) => b.length - a.length)[0]
    return bestMatch === href
  }

  const btnStyle: React.CSSProperties = {
    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer',
    textDecoration: 'none',
  }

  // ── Notification dropdown ────────────────────────────────────────────────
  function renderNotifList() {
    if (notifLoading) {
      return <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
    }
    if (notifs.length === 0) {
      return <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No notifications yet</div>
    }
    return notifs.map(n => (
      <button
        key={n.id}
        onClick={() => handleNotifClick(n)}
        style={{
          width: '100%', display: 'flex', flexDirection: 'column', gap: 4,
          padding: '12px 16px',
          background: n.isRead ? 'transparent' : accent.activeBg,
          border: 'none', borderBottom: '1px solid rgba(255,255,255,0.07)',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!n.isRead && <div style={{ width: 6, height: 6, borderRadius: '50%', background: accent.activeText, flexShrink: 0 }} />}
          <span style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>{n.title}</span>
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.4 }}>{n.body}</span>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#64748b' }}>{timeAgo(n.createdAt)}</span>
      </button>
    ))
  }

  function renderNotifPanel(width: number) {
    return (
      <div className="glass-dropdown" style={{
        width, maxWidth: '90vw', maxHeight: 420, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              style={{ fontSize: 11, fontWeight: 600, color: accent.activeText, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Mark all read
            </button>
          )}
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>{renderNotifList()}</div>
      </div>
    )
  }

  // Shared nav-row renderer for BOTH the desktop sidebar and mobile overlay —
  // glass-appropriate "3px role-colored left border, no fill" active state,
  // now consistent across all three roles (admin used a different bg-fill
  // pattern previously; unified here since all roles share one glass shell).
  function NavRow({ href, label, Icon, compact }: { href: string; label: string; Icon: React.ElementType; compact?: boolean }) {
    const active = isActive(href)
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: compact ? 10 : 16,
          padding: compact ? '9px 12px' : '12px 12px',
          borderRadius: compact ? 10 : 16,
          textDecoration: 'none', fontSize: compact ? 13 : 15, fontWeight: 500,
          background: active ? accent.activeBg : 'transparent',
          color: active ? accent.activeText : 'rgba(255,255,255,0.65)',
          borderLeft: active ? `3px solid ${accent.activeText}` : '3px solid transparent',
          transition: 'background 0.15s, color 0.15s, border-color 0.15s',
        }}
      >
        <Icon size={compact ? 16 : 20} strokeWidth={1.75} />
        <span style={{ flex: 1 }}>{label}</span>
        {!compact && <ChevronRight size={16} style={{ color: 'rgba(255,255,255,0.25)' }} />}
      </Link>
    )
  }

  // Fix 4 — portal escapes any parent stacking context / transform
  const overlay = (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col lg:hidden transition-transform duration-300 ease-in-out ${menuOpen ? 'translate-y-0 pointer-events-auto' : 'translate-y-full pointer-events-none'}`}
      style={{ background: 'var(--glass-base)' }}
      aria-hidden={!menuOpen}
    >
      {/* Top bar: logo + close */}
      <div className="flex items-center justify-between px-5 pt-14 pb-5 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ background: accent.solid }}>
            DH
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: '#ffffff' }}>
            DirectHire
          </span>
        </div>
        <button
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu"
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.7)',
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav links — grouped for admin, flat list for worker/employer */}
      {role === 'admin' ? (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {ADMIN_LINKS.map(({ section, links: sectionLinks }) => (
            <div key={section} className="mb-4">
              <p className={`text-[10px] font-semibold ${accent.sectionLabelClass} uppercase tracking-widest px-3 mb-1`}>
                {section}
              </p>
              {sectionLinks.map(({ href, label, Icon }) => (
                <div key={href} className="mb-0.5"><NavRow href={href} label={label} Icon={Icon} /></div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className={`text-[10px] font-semibold ${accent.sectionLabelClass} uppercase tracking-widest px-3 mb-2`}>
            Menu
          </p>
          {links.map(({ href, label, Icon }) => (
            <div key={href} className="mb-1"><NavRow href={href} label={label} Icon={Icon} /></div>
          ))}
        </div>
      )}

      {/* Log out pinned at bottom — always the danger color, never a role color */}
      <div style={{
        padding: '16px 16px',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => { setMenuOpen(false); onLogout() }}
          style={{
            width: '100%', height: 48, borderRadius: 16,
            border: '1px solid rgba(220,38,38,0.28)',
            background: 'rgba(220,38,38,0.08)',
            color: '#f87171',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14,
            cursor: 'pointer',
          }}
        >
          <LogOut size={16} /> Log out
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* ── Mobile header (hidden at md+) — sticky container, blur is appropriate here ── */}
      <header
        className="fixed top-0 left-0 right-0 z-40 h-14 lg:hidden flex items-center justify-between px-4"
        style={{
          background: 'rgba(11,17,33,0.85)',
          backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Link
          href={`/${role}/dashboard`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: accent.solid,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, color: '#fff' }}>DH</span>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: '#ffffff', letterSpacing: '-0.02em' }}>
            DirectHire
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div ref={mobileNotifRef} style={{ position: 'relative' }}>
              <button onClick={toggleNotifOpen} aria-label="Notifications" style={btnStyle}>
                <Bell size={17} strokeWidth={1.75} style={{ color: 'rgba(255,255,255,0.75)' }} />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16,
                    borderRadius: 8, background: '#DC2626', color: 'white',
                    fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', padding: '0 3px', border: '2px solid rgba(11,17,33,0.97)',
                  }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div style={{ position: 'fixed', top: 56, right: 12, zIndex: 100 }}>
                  {renderNotifPanel(320)}
                </div>
              )}
          </div>
          <button onClick={() => setMenuOpen(true)} aria-label="Open menu" style={btnStyle}>
            <Menu size={20} className={accent.hamburgerClass} />
          </button>
        </div>
      </header>

      {/* ── Desktop sidebar (shown at md+) — glass surface, blur is appropriate here ── */}
      <aside
        aria-label={`${role} dashboard navigation`}
        className="dashboard-sidebar hidden lg:flex flex-col fixed left-0 top-0 h-dvh w-64 z-30 pt-6 pb-8 px-4"
        style={{
          background: 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          borderRight: '1px solid rgba(255,255,255,0.1)',
          minWidth: 256, maxWidth: 256, overflow: 'hidden',
        }}
      >
        <Link
          href={`/${role}/dashboard`}
          style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 28 }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
            background: accent.solid,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, color: '#fff' }}>DH</span>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: '#ffffff', letterSpacing: '-0.02em' }}>
            DirectHire
          </span>
        </Link>

        <div ref={desktopNotifRef} style={{ position: 'relative', marginBottom: 12, flexShrink: 0 }}>
            <button
              onClick={toggleNotifOpen}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.7)',
                fontSize: 13, fontWeight: 500,
              }}
            >
              <div style={{ position: 'relative', display: 'flex' }}>
                <Bell size={16} strokeWidth={1.75} />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: -6, right: -6, minWidth: 14, height: 14,
                    borderRadius: 7, background: '#DC2626', color: 'white',
                    fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', padding: '0 3px',
                  }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              Notifications
            </button>
            {notifOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100 }}>
                {renderNotifPanel(280)}
              </div>
            )}
        </div>

        <nav className="dashboard-sidebar-nav" style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {role === 'admin' ? (
            ADMIN_LINKS.map(({ section, links: sectionLinks }) => (
              <div key={section} className="mb-4">
                <p className={`text-[10px] font-semibold ${accent.sectionLabelClass} uppercase tracking-widest px-3 mb-1`}>
                  {section}
                </p>
                {sectionLinks.map(({ href, label, Icon }) => (
                  <div key={href} className="mb-0.5"><NavRow href={href} label={label} Icon={Icon} compact /></div>
                ))}
              </div>
            ))
          ) : (
            links.map(({ href, label, Icon }) => <NavRow key={href} href={href} label={label} Icon={Icon} compact />)
          )}
        </nav>

        <button
          className="dashboard-sidebar-logout"
          onClick={onLogout}
          style={{
            width: '100%', height: 40, borderRadius: 10,
            border: '1px solid rgba(220,38,38,0.28)',
            background: 'rgba(220,38,38,0.08)',
            color: '#f87171',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <LogOut size={15} /> Log out
        </button>
      </aside>

      {/* ── Fullscreen overlay via portal — escapes all parent stacking contexts ── */}
      {mounted && createPortal(overlay, document.body)}
    </>
  )
}
