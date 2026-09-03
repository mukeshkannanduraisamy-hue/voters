'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Database,
  Download,
  LogOut,
  Vote,
} from 'lucide-react'

interface AdminSidebarProps {
  role: 'A1_SUPER_ADMIN' | 'A2_SUPERVISOR'
}

export default function AdminSidebar({ role }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const isA1 = role === 'A1_SUPER_ADMIN'
  const basePath = isA1 ? '/admin' : '/supervisor'

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    router.push('/login')
  }

  const navItems = [
    {
      label: 'Dashboard',
      tamilLabel: 'டாஷ்போர்டு',
      href: `${basePath}/dashboard`,
      icon: LayoutDashboard,
    },
    {
      label: 'Voters Directory',
      tamilLabel: 'வாக்காளர் பட்டியல்',
      href: `${basePath}/voters`,
      icon: Vote,
    },
    {
      label: 'Create User',
      tamilLabel: 'பயனர் பதிவு',
      href: '/admin/users/create',
      icon: UserPlus,
    },
    {
      label: 'User List',
      tamilLabel: 'பயனர்கள் பட்டியல்',
      href: '/admin/users',
      icon: Users,
    },
    ...(isA1
      ? [
          {
            label: 'Master Data',
            tamilLabel: 'முதன்மை தரவு',
            href: '/admin/masters',
            icon: Database,
          },
        ]
      : []),
  ]

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col justify-between h-screen sticky top-0 border-r border-slate-800 shadow-xl z-20">
      <div>
        {/* Portal Branding */}
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
            <Vote className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight tracking-wide text-white">
              VMS PORTAL
            </h1>
            <p className="text-xs text-blue-400 font-medium tracking-wider">
              {isA1 ? 'SUPER ADMIN (A1)' : 'SUPERVISOR (A2)'}
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-4 space-y-1.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <div className="flex flex-col">
                  <span>{item.label}</span>
                  <span className="text-[11px] opacity-75 font-normal">
                    {item.tamilLabel}
                  </span>
                </div>
              </Link>
            )
          })}

          {/* Direct Export link */}
          <a
            href="/api/reports/export"
            download
            className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30 border border-emerald-800/40 transition-all mt-4"
          >
            <Download className="w-5 h-5 flex-shrink-0" />
            <div className="flex flex-col">
              <span>Export Excel</span>
              <span className="text-[11px] opacity-75 font-normal">
                அறிக்கை பதிவிறக்கு
              </span>
            </div>
          </a>
        </nav>
      </div>

      {/* Footer / User Profile & Logout */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/50">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-slate-300">TN Assembly Portal</span>
            <span className="text-[11px] text-slate-500">சட்டமன்ற தொகுதி போர்டல்</span>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="p-2.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
