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
  CalendarClock, MessageSquare, Activity,
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

// DirectHire design system: worker = teal, employer = violet, admin = gold
// (+ dark sidebar — the only role whose chrome stays dark; worker/employer
// sidebars are light). These are genuinely distinct per role now — they used
// to all resolve to the same amber, which made every role's nav visually
// identical.

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

// CSS values — desktop sidebar. worker/employer render on a LIGHT sidebar
// (inactiveIcon is a dark-on-light tint); admin stays on its dark ink-950
// sidebar (inactiveIcon is a light-on-dark tint), matching the design system.
const SIDEBAR_THEME: Record<Role, {
  activeBg:    string
  activeText:  string
  activeIcon:  string
  inactiveIcon:string
  logoBg:      string
}> = {
  worker: {
    activeBg:     'rgba(20,184,166,0.12)',
    activeText:   '#0D9488',
    activeIcon:   'rgba(20,184,166,0.18)',
    inactiveIcon: 'rgba(11,17,32,0.05)',
    logoBg:       '#0D9488',
  },
  employer: {
    activeBg:     'rgba(139,92,246,0.12)',
    activeText:   '#7C3AED',
    activeIcon:   'rgba(139,92,246,0.18)',
    inactiveIcon: 'rgba(11,17,32,0.05)',
    logoBg:       '#7C3AED',
  },
  admin: {
    activeBg:     'rgba(200,145,22,0.16)',
    activeText:   '#E0B020',
    activeIcon:   'rgba(200,145,22,0.22)',
    inactiveIcon: 'rgba(255,255,255,0.06)',
    logoBg:       '#C89116',
  },
}

// Tailwind classes — mobile overlay only. worker/employer overlays are light
// (dark active-text on a light tint); admin's overlay stays dark, so its
// active-text needs to read against a dark background instead.
const ROLE_THEME: Record<Role, {
  activeBg:      string
  activeText:    string
  activeIcon:    string
  logoBg:        string
  hamburger:     string
  sectionLabel:  string
  overlayAccent: string
}> = {
  worker: {
    activeBg:      'bg-worker-50',
    activeText:    'text-worker-700',
    activeIcon:    'bg-worker-100',
    logoBg:        'bg-worker-600',
    hamburger:     'text-worker-700',
    sectionLabel:  'text-ink-500',
    overlayAccent: 'border-worker-100',
  },
  employer: {
    activeBg:      'bg-employer-50',
    activeText:    'text-employer-700',
    activeIcon:    'bg-employer-100',
    logoBg:        'bg-employer-600',
    hamburger:     'text-employer-700',
    sectionLabel:  'text-ink-500',
    overlayAccent: 'border-employer-100',
  },
  admin: {
    activeBg:      'bg-admin-500/15',
    activeText:    'text-admin-400',
    activeIcon:    'bg-admin-500/20',
    logoBg:        'bg-admin-600',
    hamburger:     'text-admin-400',
    sectionLabel:  'text-admin-400/70',
    overlayAccent: 'border-admin-600/20',
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
  const sidebarTheme = SIDEBAR_THEME[role]
  const theme = ROLE_THEME[role]
  // Only admin keeps a dark sidebar/nav — worker and employer are light per
  // the design system. Drives every background/text branch below.
  const isDark = role === 'admin'
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

  // ── Notification dropdown (employer only) ───────────────────────────────────
  function renderNotifList() {
    if (notifLoading) {
      return <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Loading…</div>
    }
    if (notifs.length === 0) {
      return <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>No notifications yet</div>
    }
    return notifs.map(n => (
      <button
        key={n.id}
        onClick={() => handleNotifClick(n)}
        style={{
          width: '100%', display: 'flex', flexDirection: 'column', gap: 4,
          padding: '12px 16px',
          background: n.isRead ? 'transparent' : `${sidebarTheme.activeBg}`,
          border: 'none', borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #F1F5F9',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!n.isRead && <div style={{ width: 6, height: 6, borderRadius: '50%', background: sidebarTheme.activeText, flexShrink: 0 }} />}
          <span style={{ fontSize: 13, fontWeight: 600, color: isDark ? '#f1f5f9' : '#0B1120' }}>{n.title}</span>
        </div>
        <span style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748B', lineHeight: 1.4 }}>{n.body}</span>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: isDark ? '#4b5563' : '#94A3B8' }}>{timeAgo(n.createdAt)}</span>
      </button>
    ))
  }

  function renderNotifPanel(width: number) {
    return (
      <div style={{
        width, maxWidth: '90vw', maxHeight: 420, overflow: 'hidden',
        background: isDark ? '#111827' : '#FFFFFF',
        border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #F1F5F9',
        borderRadius: 14, boxShadow: isDark ? '0 20px 60px rgba(0,0,0,0.5)' : '0 12px 32px rgba(11,17,32,0.12)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#f8fafc' : '#0B1120' }}>Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              style={{ fontSize: 11, fontWeight: 600, color: sidebarTheme.activeText, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Mark all read
            </button>
          )}
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>{renderNotifList()}</div>
      </div>
    )
  }

  // Fix 4 — portal escapes any parent stacking context / transform
  const overlay = (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col lg:hidden transition-transform duration-300 ease-in-out ${menuOpen ? 'translate-y-0 pointer-events-auto' : 'translate-y-full pointer-events-none'}`}
      style={{ background: isDark ? '#06091A' : '#FFFFFF' }}
      aria-hidden={!menuOpen}
    >
      {/* Top bar: logo + close */}
      <div className={`flex items-center justify-between px-5 pt-14 pb-5 border-b ${theme.overlayAccent} flex-shrink-0`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl ${theme.logoBg} flex items-center justify-center text-white font-bold text-sm`}>
            DH
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: isDark ? '#F0F4FF' : '#0B1120' }}>
            DirectHire
          </span>
        </div>
        <button
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu"
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isDark ? 'rgba(255,255,255,0.7)' : '#1E293B',
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
              <p className={`text-[10px] font-semibold ${theme.sectionLabel} uppercase tracking-widest px-3 mb-1`}>
                {section}
              </p>
              {sectionLinks.map(({ href, label, Icon }) => {
                const active = isActive(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-4 px-3 py-3 rounded-xl mb-0.5 transition-colors text-sm no-underline ${active ? `${theme.activeBg} ${theme.activeText}` : ''}`}
                    style={{ color: active ? undefined : (isDark ? 'rgba(255,255,255,0.8)' : '#1E293B') }}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? theme.activeIcon : ''}`}
                      style={{ background: active ? undefined : (isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9') }}
                    >
                      <Icon size={16} strokeWidth={1.75} />
                    </div>
                    <span className="font-medium flex-1">{label}</span>
                    <ChevronRight size={14} style={{ color: isDark ? 'rgba(255,255,255,0.25)' : '#CBD5E1' }} />
                  </Link>
                )
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className={`text-[10px] font-semibold ${theme.sectionLabel} uppercase tracking-widest px-3 mb-2`}>
            Menu
          </p>
          {links.map(({ href, label, Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-4 px-3 py-3 rounded-xl mb-1 transition-colors text-sm no-underline ${active ? `${theme.activeBg} ${theme.activeText}` : ''}`}
                style={{ color: active ? undefined : (isDark ? 'rgba(255,255,255,0.8)' : '#1E293B') }}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${active ? theme.activeIcon : ''}`}
                  style={{ background: active ? undefined : (isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9') }}
                >
                  <Icon size={20} strokeWidth={1.75} />
                </div>
                <span className="font-medium flex-1" style={{ fontFamily: 'var(--font-body)', fontSize: 15 }}>{label}</span>
                <ChevronRight size={16} style={{ color: isDark ? 'rgba(255,255,255,0.25)' : '#CBD5E1' }} />
              </Link>
            )
          })}
        </div>
      )}

      {/* Log out pinned at bottom — always the danger color, never a role color */}
      <div style={{
        padding: '16px 16px',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
        borderTop: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #F1F5F9',
        flexShrink: 0,
      }}>
        <button
          onClick={() => { setMenuOpen(false); onLogout() }}
          style={{
            width: '100%', height: 48, borderRadius: 16,
            border: '1px solid rgba(220,38,38,0.28)',
            background: 'rgba(220,38,38,0.08)',
            color: '#DC2626',
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
      {/* ── Mobile header (hidden at md+) ── */}
      <header
        className="fixed top-0 left-0 right-0 z-40 h-14 lg:hidden flex items-center justify-between px-4"
        style={{
          background: isDark ? 'rgba(6,9,26,0.97)' : 'rgba(255,255,255,0.97)',
          backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
          borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #F1F5F9',
        }}
      >
        <Link
          href={`/${role}/dashboard`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: sidebarTheme.logoBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, color: '#fff' }}>DH</span>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: isDark ? '#fff' : '#0B1120', letterSpacing: '-0.02em' }}>
            DirectHire
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div ref={mobileNotifRef} style={{ position: 'relative' }}>
              <button onClick={toggleNotifOpen} aria-label="Notifications" style={{ ...btnStyle, background: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9', border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #F1F5F9' }}>
                <Bell size={17} strokeWidth={1.75} style={{ color: isDark ? 'rgba(248,250,252,0.75)' : '#1E293B' }} />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16,
                    borderRadius: 8, background: '#DC2626', color: 'white',
                    fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', padding: '0 3px', border: isDark ? '2px solid rgba(6,9,26,0.97)' : '2px solid #fff',
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
          <button onClick={() => setMenuOpen(true)} aria-label="Open menu" style={{ ...btnStyle, background: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9', border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #F1F5F9' }}>
            <Menu size={20} className={theme.hamburger} />
          </button>
        </div>
      </header>

      {/* ── Desktop sidebar (shown at md+) — outer layout/theme unchanged; nav content now mirrors the mobile overlay's admin grouping ── */}
      <aside
        aria-label={`${role} dashboard navigation`}
        className="dashboard-sidebar hidden lg:flex flex-col fixed left-0 top-0 h-dvh w-64 z-30 pt-6 pb-8 px-4"
        style={{
          background: isDark ? '#0B1120' : '#FFFFFF',
          borderRight: isDark ? '1px solid rgba(255,255,255,0.07)' : '1px solid #F1F5F9',
          minWidth: 256, maxWidth: 256, overflow: 'hidden',
        }}
      >
        <Link
          href={`/${role}/dashboard`}
          style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 28 }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
            background: sidebarTheme.logoBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, color: '#fff' }}>DH</span>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: isDark ? '#fff' : '#0B1120', letterSpacing: '-0.02em' }}>
            DirectHire
          </span>
        </Link>

        <div ref={desktopNotifRef} style={{ position: 'relative', marginBottom: 12, flexShrink: 0 }}>
            <button
              onClick={toggleNotifOpen}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
                color: isDark ? 'rgba(255,255,255,0.7)' : '#1E293B',
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
                <p className={`text-[10px] font-semibold ${theme.sectionLabel} uppercase tracking-widest px-3 mb-1`}>
                  {section}
                </p>
                {sectionLinks.map(({ href, label, Icon }) => {
                  const active = isActive(href)
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={`dashboard-sidebar-link flex items-center gap-3 px-3 py-2 rounded-lg mb-0.5 transition-colors text-sm no-underline ${active ? `${theme.activeBg} ${theme.activeText}` : ''}`}
                      style={{ color: active ? undefined : (isDark ? 'rgba(255,255,255,0.55)' : '#64748B'), fontWeight: 500 }}
                    >
                      <Icon size={16} strokeWidth={1.75} />
                      {label}
                    </Link>
                  )
                })}
              </div>
            ))
          ) : (
            links.map(({ href, label, Icon }) => {
              const active = isActive(href)
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className="dashboard-sidebar-link"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 10,
                    textDecoration: 'none', fontSize: 13, fontWeight: 500,
                    background: active ? sidebarTheme.activeBg : 'transparent',
                    color: active ? sidebarTheme.activeText : (isDark ? 'rgba(255,255,255,0.55)' : '#64748B'),
                    // Active item = 3px role-colored LEFT border, no fill —
                    // sidebarTheme.activeBg above stays as a subtle tint per
                    // this component's existing hover/press language, but the
                    // left border is what the design system actually keys on.
                    borderLeft: active ? `3px solid ${sidebarTheme.activeText}` : '3px solid transparent',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <Icon size={16} strokeWidth={1.75} />
                  {label}
                </Link>
              )
            })
          )}
        </nav>

        <button
          className="dashboard-sidebar-logout"
          onClick={onLogout}
          style={{
            width: '100%', height: 40, borderRadius: 10,
            border: '1px solid rgba(220,38,38,0.28)',
            background: 'rgba(220,38,38,0.08)',
            color: '#DC2626',
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
