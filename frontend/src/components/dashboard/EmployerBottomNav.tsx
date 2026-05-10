'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Briefcase, Users, ClipboardList, Building2 } from 'lucide-react'

const ACCENT     = '#0d9488'
const ACCENT_RGB = '13,148,136'

const tabs = [
  { href: '/employer/dashboard',    label: 'Dashboard',   Icon: LayoutGrid    },
  { href: '/employer/jobs',         label: 'Jobs',        Icon: Briefcase     },
  { href: '/employer/workers',      label: 'Candidates',  Icon: Users         },
  { href: '/employer/applications', label: 'Apps',        Icon: ClipboardList },
  { href: '/employer/profile',      label: 'Account',     Icon: Building2     },
]

export default function EmployerBottomNav() {
  const pathname = usePathname()
  const active = (href: string) =>
    href === '/employer/dashboard'
      ? pathname === '/employer/dashboard'
      : pathname.startsWith(href)

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden px-3"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)', paddingTop: 8 }}
    >
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(8,13,26,0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.35)',
          padding: '6px 4px',
        }}
      >
        {tabs.map(({ href, label, Icon }) => {
          const isActive = active(href)
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                minWidth: 44,
                minHeight: 48,
                padding: '6px 10px',
                borderRadius: 14,
                textDecoration: 'none',
                background: isActive ? `rgba(${ACCENT_RGB},0.18)` : 'transparent',
                color: isActive ? '#f8fafc' : 'rgba(248,250,252,0.48)',
                transition: 'all 0.15s',
              }}
            >
              <Icon
                size={19}
                strokeWidth={isActive ? 2.2 : 1.75}
                color={isActive ? ACCENT : undefined}
              />
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: '0.02em',
                fontFamily: 'var(--font-body)',
                color: isActive ? '#f8fafc' : 'rgba(248,250,252,0.48)',
              }}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
