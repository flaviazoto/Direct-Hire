'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu, X, Bell, ChevronRight, LogOut,
  LayoutGrid, Search, ClipboardList, User, FolderOpen,
  CreditCard, Briefcase, Users, Settings, Clock, FileText,
} from 'lucide-react'

type Role = 'worker' | 'employer' | 'admin'

type NavLink = {
  href: string
  label: string
  Icon: React.ElementType
}

const ROLE_LINKS: Record<Role, NavLink[]> = {
  worker: [
    { href: '/worker/dashboard',    label: 'Dashboard',       Icon: LayoutGrid    },
    { href: '/worker/jobs',         label: 'Browse Jobs',     Icon: Search        },
    { href: '/worker/applications', label: 'My Applications', Icon: ClipboardList },
    { href: '/worker/profile',      label: 'My Profile',      Icon: User          },
    { href: '/worker/documents',    label: 'Documents',       Icon: FolderOpen    },
    { href: '/worker/payments',     label: 'Payments',        Icon: CreditCard    },
  ],
  employer: [
    { href: '/employer/dashboard',    label: 'Dashboard',    Icon: LayoutGrid    },
    { href: '/employer/jobs',         label: 'My Jobs',      Icon: Briefcase     },
    { href: '/employer/workers',      label: 'Candidates',   Icon: Users         },
    { href: '/employer/applications', label: 'Applications', Icon: ClipboardList },
    { href: '/employer/profile',      label: 'Account',      Icon: Settings      },
  ],
  admin: [
    { href: '/admin/dashboard', label: 'Dashboard',        Icon: LayoutGrid },
    { href: '/admin/users',     label: 'All Users',        Icon: Users      },
    { href: '/admin/approvals', label: 'Pending Approvals',Icon: Clock      },
    { href: '/admin/audit-log', label: 'Audit Log',        Icon: FileText   },
    { href: '/admin/revenue',   label: 'Revenue',          Icon: Settings   },
  ],
}

const ROLE_THEME: Record<Role, {
  border:      string
  activeBg:    string
  activeText:  string
  activeIcon:  string
  inactiveIcon:string
  logoBg:      string
  hamburger:   string
}> = {
  worker: {
    border:       'rgba(168,85,247,0.22)',
    activeBg:     'rgba(168,85,247,0.15)',
    activeText:   '#c084fc',
    activeIcon:   'rgba(168,85,247,0.20)',
    inactiveIcon: 'rgba(255,255,255,0.06)',
    logoBg:       '#9333ea',
    hamburger:    '#c084fc',
  },
  employer: {
    border:       'rgba(59,130,246,0.22)',
    activeBg:     'rgba(59,130,246,0.15)',
    activeText:   '#60a5fa',
    activeIcon:   'rgba(59,130,246,0.20)',
    inactiveIcon: 'rgba(255,255,255,0.06)',
    logoBg:       '#2563eb',
    hamburger:    '#60a5fa',
  },
  admin: {
    border:       'rgba(245,158,11,0.22)',
    activeBg:     'rgba(245,158,11,0.15)',
    activeText:   '#fbbf24',
    activeIcon:   'rgba(245,158,11,0.20)',
    inactiveIcon: 'rgba(255,255,255,0.06)',
    logoBg:       '#d97706',
    hamburger:    '#fbbf24',
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
  const pathname = usePathname()

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => { setMenuOpen(false) }, [pathname])

  const links = ROLE_LINKS[role]
  const theme = ROLE_THEME[role]

  const isActive = (href: string) =>
    href === `/${role}/dashboard`
      ? pathname === href
      : pathname.startsWith(href)

  const btnStyle: React.CSSProperties = {
    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(248,250,252,0.75)',
    cursor: 'pointer',
    textDecoration: 'none',
  }

  return (
    <>
      {/* ── Fixed mobile header (hidden at lg+) ── */}
      <header
        className="lg:hidden"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40,
          height: 56,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px',
          background: 'rgba(11,17,32,0.97)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        {/* Logo */}
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
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: 15, color: '#fff', letterSpacing: '-0.02em',
          }}>
            DirectHire
          </span>
        </Link>

        {/* Right: bell + hamburger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link
            href={role === 'worker' ? '/worker/notifications' : `/${role}/dashboard`}
            aria-label="Notifications"
            style={btnStyle}
          >
            <Bell size={17} strokeWidth={1.75} />
          </Link>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            style={btnStyle}
          >
            <Menu size={19} strokeWidth={1.75} color={theme.hamburger} />
          </button>
        </div>
      </header>

      {/* ── Fullscreen overlay — slides up from bottom ── */}
      <div
        className="lg:hidden"
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: '#06091A',
          display: 'flex', flexDirection: 'column',
          transform: menuOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
        }}
        aria-hidden={!menuOpen}
      >
        {/* Top bar: logo + close */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '56px 20px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 12, flexShrink: 0,
              background: theme.logoBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: '#fff' }}>DH</span>
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

        {/* Nav links */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          <p style={{
            fontSize: 11, fontWeight: 700,
            color: 'rgba(255,255,255,0.3)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            padding: '0 8px', marginBottom: 8,
            fontFamily: 'var(--font-body)',
          }}>
            Menu
          </p>
          {links.map(({ href, label, Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '12px 12px', borderRadius: 16, marginBottom: 4,
                  textDecoration: 'none',
                  background: active ? theme.activeBg : 'transparent',
                  color: active ? theme.activeText : 'rgba(255,255,255,0.8)',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: active ? theme.activeIcon : theme.inactiveIcon,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: active ? theme.activeText : 'rgba(255,255,255,0.55)',
                }}>
                  <Icon size={20} strokeWidth={1.75} />
                </div>
                <span style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500,
                  fontSize: 16, flex: 1,
                }}>
                  {label}
                </span>
                <ChevronRight size={16} color="rgba(255,255,255,0.25)" />
              </Link>
            )
          })}
        </div>

        {/* Log out pinned at bottom */}
        <div style={{
          padding: '16px 16px',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}>
          <button
            onClick={() => { setMenuOpen(false); onLogout(); }}
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
    </>
  )
}
