'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Briefcase, Building2, Tag, Info } from 'lucide-react'

const items = [
  { href: '/',              label: 'Home',      Icon: Home      },
  { href: '/for-workers',   label: 'Workers',   Icon: Briefcase },
  { href: '/for-employers', label: 'Employers', Icon: Building2 },
  { href: '/pricing',       label: 'Pricing',   Icon: Tag       },
  { href: '/about',         label: 'About',     Icon: Info      },
]

export default function BottomNav() {
  const pathname = usePathname()
  const active = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{
        background: 'rgba(6,11,24,0.97)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center justify-around h-16">
        {items.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center justify-center gap-[3px] flex-1 h-full"
            style={{
              color: active(href) ? '#60A5FA' : 'rgba(255,255,255,0.38)',
              textDecoration: 'none',
              transition: 'color 0.15s',
            }}
          >
            <Icon size={20} strokeWidth={active(href) ? 2.2 : 1.8} />
            <span style={{
              fontSize: 10,
              fontWeight: active(href) ? 700 : 500,
              letterSpacing: '0.03em',
              fontFamily: 'var(--font-body)',
              lineHeight: 1,
            }}>
              {label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
