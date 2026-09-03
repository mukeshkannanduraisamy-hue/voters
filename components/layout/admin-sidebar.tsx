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
  X,
  Smartphone,
} from 'lucide-react'

interface AdminSidebarProps {
  role: 'A1_SUPER_ADMIN' | 'A2_SUPERVISOR'
  isOpen?: boolean
  onClose?: () => void
}

export default function AdminSidebar({ role, isOpen = false, onClose }: AdminSidebarProps) {
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
      tamilLabel: 'வாக்காளர் பட்டியல் (245k)',
      href: `${basePath}/voters`,
      icon: Vote,
    },
    {
      label: 'Create User',
      tamilLabel: 'பயனர் பதிவு (No EPIC)',
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
            tamilLabel: '2-Tier முதன்மை தரவு',
            href: '/admin/masters',
            icon: Database,
          },
        ]
      : []),
  ]

  const sidebarContent = (
    <div className="flex flex-col justify-between h-full">
      <div>
        {/* Portal Branding & Mobile Close */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30 font-bold">
              <Vote className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-base leading-tight tracking-wide text-white">
                VMS PORTAL
              </h1>
              <p className="text-[11px] text-blue-400 font-bold tracking-wider">
                {isA1 ? 'SUPER ADMIN (A1)' : 'SUPERVISOR (A2)'}
              </p>
            </div>
          </div>

          {/* Close button for mobile/tablet drawer */}
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="p-3 sm:p-4 space-y-1.5 overflow-y-auto max-h-[calc(100vh-190px)]">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <div className="flex flex-col leading-snug">
                  <span>{item.label}</span>
                  <span className="text-[10px] opacity-75 font-normal">
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
            className="flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-semibold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 border border-emerald-800/40 transition-all mt-4"
          >
            <Download className="w-5 h-5 flex-shrink-0" />
            <div className="flex flex-col leading-snug">
              <span>Export Roster</span>
              <span className="text-[10px] opacity-75 font-normal">
                அறிக்கை பதிவிறக்கு (.xlsx)
              </span>
            </div>
          </a>
        </nav>
      </div>

      {/* Footer / User Profile & Logout */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/70">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-300">AC-58 Pennagaram</span>
            <span className="text-[11px] text-slate-500">பென்னாகரம் தொகுதி</span>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* 1. Desktop Docked Sidebar (>= lg) */}
      <aside className="hidden lg:flex w-64 bg-slate-900 text-slate-100 flex-col justify-between h-screen sticky top-0 border-r border-slate-800 shadow-xl z-20 flex-shrink-0">
        {sidebarContent}
      </aside>

      {/* 2. Mobile & Tablet Drawer (< lg) */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop Blur */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300"
          />

          {/* Sliding Drawer */}
          <aside className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-slate-900 text-slate-100 shadow-2xl z-50 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
