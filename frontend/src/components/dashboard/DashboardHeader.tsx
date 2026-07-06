'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu, X, Bell, ChevronRight, LogOut,
  LayoutGrid, Search, ClipboardList, User, FolderOpen,
  CreditCard, Briefcase, Users, Settings, Clock, FileText,
  TrendingUp, CheckCircle, FileSearch, ShieldAlert, Mail, Tag, Lock,
} from 'lucide-react'

type Role = 'worker' | 'employer' | 'admin'

type NavLink = {
  href: string
  label: string
  Icon: React.ElementType
}

// Flat links — desktop sidebar only (worker role uses layout.tsx Sidebar instead)
// NOTE: admin key intentionally removed — admin now renders the grouped
// ADMIN_LINKS structure below on both desktop and mobile. Kept employer-only.
const ROLE_LINKS: Record<'employer', NavLink[]> = {
  employer: [
    { href: '/employer/dashboard',    label: 'Dashboard',    Icon: LayoutGrid    },
    { href: '/employer/jobs',         label: 'My Jobs',      Icon: Briefcase     },
    { href: '/employer/workers',      label: 'Candidates',   Icon: Users         },
    { href: '/employer/applications', label: 'Applications', Icon: ClipboardList },
    { href: '/employer/profile',      label: 'Account',      Icon: Settings      },
    { href: '/employer/locks',        label: 'Locks',        Icon: Lock          },
    { href: '/employer/billing',      label: 'Billing',      Icon: CreditCard    },
  ],
}

type AdminLinkGroup = {
  section: string
  links: { href: string; label: string; Icon: React.ElementType }[]
}

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
      { href: '/admin/jobs/pending', label: 'Pending Review', Icon: Clock     },
      { href: '/admin/jobs',         label: 'All Job Posts',  Icon: Briefcase },
    ],
  },
  {
    section: 'Settings',
    links: [{ href: '/admin/pricing', label: 'Pricing', Icon: Tag }],
  },
]

// CSS values — desktop sidebar (DO NOT TOUCH)
const SIDEBAR_THEME: Record<Role, {
  activeBg:    string
  activeText:  string
  activeIcon:  string
  inactiveIcon:string
  logoBg:      string
}> = {
  worker: {
    activeBg:     'rgba(168,85,247,0.15)',
    activeText:   '#c084fc',
    activeIcon:   'rgba(168,85,247,0.20)',
    inactiveIcon: 'rgba(255,255,255,0.06)',
    logoBg:       '#9333ea',
  },
  employer: {
    activeBg:     'rgba(59,130,246,0.15)',
    activeText:   '#60a5fa',
    activeIcon:   'rgba(59,130,246,0.20)',
    inactiveIcon: 'rgba(255,255,255,0.06)',
    logoBg:       '#2563eb',
  },
  admin: {
    activeBg:     'rgba(245,158,11,0.15)',
    activeText:   '#fbbf24',
    activeIcon:   'rgba(245,158,11,0.20)',
    inactiveIcon: 'rgba(255,255,255,0.06)',
    logoBg:       '#d97706',
  },
}

// Tailwind classes — mobile overlay only
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
    activeBg:      'bg-purple-600/20',
    activeText:    'text-purple-300',
    activeIcon:    'bg-purple-600/30',
    logoBg:        'bg-purple-600',
    hamburger:     'text-purple-400',
    sectionLabel:  'text-purple-400/70',
    overlayAccent: 'border-purple-600/20',
  },
  employer: {
    activeBg:      'bg-blue-600/20',
    activeText:    'text-blue-300',
    activeIcon:    'bg-blue-600/30',
    logoBg:        'bg-blue-600',
    hamburger:     'text-blue-400',
    sectionLabel:  'text-blue-400/70',
    overlayAccent: 'border-blue-600/20',
  },
  admin: {
    activeBg:      'bg-amber-500/15',
    activeText:    'text-amber-400',
    activeIcon:    'bg-amber-500/20',
    logoBg:        'bg-amber-600',
    hamburger:     'text-amber-400',
    sectionLabel:  'text-amber-400/70',
    overlayAccent: 'border-amber-600/20',
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

  useEffect(() => { setMenuOpen(false) }, [pathname])

  const links = role === 'employer' ? ROLE_LINKS.employer : []
  const sidebarTheme = SIDEBAR_THEME[role]
  const theme = ROLE_THEME[role]

  const isActive = (href: string) => {
    if (href === `/${role}/dashboard` || href === `/${role}`) {
      return pathname === href || pathname === `/${role}/dashboard`
    }
    return pathname.startsWith(href)
  }

  const btnStyle: React.CSSProperties = {
    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer',
    textDecoration: 'none',
  }

  // Fix 4 — portal escapes any parent stacking context / transform
  const overlay = (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col md:hidden transition-transform duration-300 ease-in-out ${menuOpen ? 'translate-y-0 pointer-events-auto' : 'translate-y-full pointer-events-none'}`}
      style={{ background: '#06091A' }}
      aria-hidden={!menuOpen}
    >
      {/* Top bar: logo + close */}
      <div className={`flex items-center justify-between px-5 pt-14 pb-5 border-b ${theme.overlayAccent} flex-shrink-0`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl ${theme.logoBg} flex items-center justify-center text-white font-bold text-sm`}>
            DH
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: '#F0F4FF' }}>
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
              <p className={`text-[10px] font-semibold ${theme.sectionLabel} uppercase tracking-widest px-3 mb-1`}>
                {section}
              </p>
              {sectionLinks.map(({ href, label, Icon }) => {
                const active = pathname === href || pathname.startsWith(href + '/')
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-4 px-3 py-3 rounded-xl mb-0.5 transition-colors text-sm no-underline ${active ? `${theme.activeBg} ${theme.activeText}` : ''}`}
                    style={{ color: active ? undefined : 'rgba(255,255,255,0.8)' }}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? theme.activeIcon : ''}`}
                      style={{ background: active ? undefined : 'rgba(255,255,255,0.06)' }}
                    >
                      <Icon size={16} strokeWidth={1.75} />
                    </div>
                    <span className="font-medium flex-1">{label}</span>
                    <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.25)' }} />
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
                style={{ color: active ? undefined : 'rgba(255,255,255,0.8)' }}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${active ? theme.activeIcon : ''}`}
                  style={{ background: active ? undefined : 'rgba(255,255,255,0.06)' }}
                >
                  <Icon size={20} strokeWidth={1.75} />
                </div>
                <span className="font-medium flex-1" style={{ fontFamily: 'var(--font-body)', fontSize: 15 }}>{label}</span>
                <ChevronRight size={16} style={{ color: 'rgba(255,255,255,0.25)' }} />
              </Link>
            )
          })}
        </div>
      )}

      {/* Log out pinned at bottom */}
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
            border: '1px solid rgba(239,68,68,0.28)',
            background: 'rgba(239,68,68,0.08)',
            color: '#fca5a5',
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
        className="fixed top-0 left-0 right-0 z-40 h-14 md:hidden flex items-center justify-between px-4"
        style={{ background: 'rgba(6,9,26,0.97)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Link
          href={`/${role}/dashboard`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: 'linear-gradient(135deg, #0090FF, #6366F1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, color: '#fff' }}>DH</span>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: '#fff', letterSpacing: '-0.02em' }}>
            DirectHire
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {role === 'worker' ? (
            <Link href="/worker/notifications" aria-label="Notifications" style={btnStyle}>
              <Bell size={17} strokeWidth={1.75} style={{ color: 'rgba(248,250,252,0.75)' }} />
            </Link>
          ) : (
            <button aria-label="Notifications" style={btnStyle}>
              <Bell size={17} strokeWidth={1.75} style={{ color: 'rgba(248,250,252,0.75)' }} />
            </button>
          )}
          <button onClick={() => setMenuOpen(true)} aria-label="Open menu" style={btnStyle}>
            <Menu size={20} className={theme.hamburger} />
          </button>
        </div>
      </header>

      {/* ── Desktop sidebar (shown at md+) — outer layout/theme unchanged; nav content now mirrors the mobile overlay's admin grouping ── */}
      <aside
        className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 z-30 pt-6 pb-8 px-4"
        style={{ background: '#0b1120', borderRight: '1px solid rgba(255,255,255,0.07)' }}
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
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: '#fff', letterSpacing: '-0.02em' }}>
            DirectHire
          </span>
        </Link>

        <nav style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {role === 'admin' ? (
            ADMIN_LINKS.map(({ section, links: sectionLinks }) => (
              <div key={section} className="mb-4">
                <p className={`text-[10px] font-semibold ${theme.sectionLabel} uppercase tracking-widest px-3 mb-1`}>
                  {section}
                </p>
                {sectionLinks.map(({ href, label, Icon }) => {
                  const active = pathname === href || pathname.startsWith(href + '/')
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-0.5 transition-colors text-sm no-underline ${active ? `${theme.activeBg} ${theme.activeText}` : ''}`}
                      style={{ color: active ? undefined : 'rgba(255,255,255,0.55)', fontWeight: 500 }}
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
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 10,
                    textDecoration: 'none', fontSize: 13, fontWeight: 500,
                    background: active ? sidebarTheme.activeBg : 'transparent',
                    color: active ? sidebarTheme.activeText : 'rgba(255,255,255,0.55)',
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
          onClick={onLogout}
          style={{
            width: '100%', height: 40, borderRadius: 10,
            border: '1px solid rgba(239,68,68,0.28)',
            background: 'rgba(239,68,68,0.08)',
            color: '#fca5a5',
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
