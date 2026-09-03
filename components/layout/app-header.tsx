'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Menu,
  X,
  ChevronDown,
  LogOut,
  User,
  Shield,
  LayoutDashboard,
  Vote,
  Database,
  Smartphone,
  Download,
  Check,
  Sparkles,
  ExternalLink,
  Laptop,
  Tablet,
  Phone,
  Users,
} from 'lucide-react'

interface AppHeaderProps {
  role?: 'A1_SUPER_ADMIN' | 'A2_SUPERVISOR' | 'A3_FIELD_AGENT'
  onToggleSidebar?: () => void
  isSidebarOpen?: boolean
  viewMode?: 'desktop' | 'tablet' | 'mobile'
  onViewModeChange?: (mode: 'desktop' | 'tablet' | 'mobile') => void
}

export default function AppHeader({
  role = 'A1_SUPER_ADMIN',
  onToggleSidebar,
  isSidebarOpen = false,
  viewMode = 'desktop',
  onViewModeChange,
}: AppHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Fetch current user details
  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const data = await res.json()
          setCurrentUser(data.user || data)
        }
      } catch {
        // ignore
      }
    }
    fetchUser()
  }, [])

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close menu on Escape key
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    router.push('/login')
  }

  const roleLabel =
    role === 'A1_SUPER_ADMIN'
      ? 'Super Admin'
      : role === 'A2_SUPERVISOR'
      ? 'Supervisor'
      : 'Field Agent'

  const roleTamil =
    role === 'A1_SUPER_ADMIN'
      ? 'தலைமை நிர்வாகி'
      : role === 'A2_SUPERVISOR'
      ? 'மேற்பார்வையாளர்'
      : 'கள முகவர்'

  const roleBadgeColor =
    role === 'A1_SUPER_ADMIN'
      ? 'bg-purple-50 text-purple-700 border-purple-200'
      : role === 'A2_SUPERVISOR'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200'

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 py-2.5 transition-all">
      <div className="flex items-center justify-between gap-3">
        {/* Left Side: Mobile Menu Toggle & Title */}
        <div className="flex items-center gap-3">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              aria-label="Toggle menu"
              className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition border border-slate-200"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-sm shadow-blue-500/20 flex-shrink-0">
              🗳️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-slate-900 tracking-tight leading-none">
                  VMS PORTAL
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  AC-58 Pennagaram
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium hidden sm:block">
                பென்னாகரம் சட்டமன்ற தொகுதி
              </span>
            </div>
          </div>
        </div>

        {/* Center: Responsive Device Preview Switcher (Interactive Selection) */}
        <div className="hidden md:flex items-center p-1 bg-slate-100 rounded-xl text-[11px] font-semibold text-slate-600 gap-1 border border-slate-200/70 shadow-2xs">
          <button
            type="button"
            onClick={() => onViewModeChange?.('desktop')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition ${
              viewMode === 'desktop'
                ? 'bg-blue-600 text-white shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
            title="Switch to Full Desktop View"
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Desktop</span>
          </button>

          <span className="text-slate-300">•</span>

          <button
            type="button"
            onClick={() => onViewModeChange?.('tablet')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition ${
              viewMode === 'tablet'
                ? 'bg-blue-600 text-white shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
            title="Switch to Tablet View Preview (768px)"
          >
            <Tablet className="w-3.5 h-3.5" />
            <span>Tablet</span>
          </button>

          <span className="text-slate-300">•</span>

          <button
            type="button"
            onClick={() => onViewModeChange?.('mobile')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition ${
              viewMode === 'mobile'
                ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                : 'text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50'
            }`}
            title="Switch to Mobile Phone View Preview (384px)"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Mobile Ready</span>
          </button>
        </div>

        {/* Right Side: SMALL CORNER OPTION MENU */}
        <div className="relative flex items-center gap-2" ref={menuRef}>
          {/* Quick Direct Survey/Dashboard Button on Mobile */}
          {role === 'A3_FIELD_AGENT' ? (
            <Link
              href="/survey/booth"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Survey Booth</span>
            </Link>
          ) : (
            <Link
              href="/admin/voters"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200 transition"
            >
              <Vote className="w-3.5 h-3.5" />
              <span>Voters (245k)</span>
            </Link>
          )}

          {/* Small Corner Action Button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-xl border transition text-xs font-semibold shadow-sm ${
              menuOpen
                ? 'bg-blue-50 border-blue-300 text-blue-900 ring-2 ring-blue-500/20'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
            }`}
            title="Options & Account"
          >
            {/* User Avatar */}
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
              {currentUser?.mobile_number ? currentUser.mobile_number.substring(0, 2) : '98'}
            </div>

            {/* User Summary Text (Desktop/Tablet) */}
            <div className="hidden sm:flex flex-col text-left leading-tight">
              <span className="font-bold text-slate-900 text-xs truncate max-w-[100px]">
                {roleLabel}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {currentUser?.mobile_number || '9876543210'}
              </span>
            </div>

            {/* Chevron Icon */}
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                menuOpen ? 'rotate-180 text-blue-600' : ''
              }`}
            />
          </button>

          {/* FLOATING CORNER DROPDOWN MENU */}
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 py-3 z-50 animate-in fade-in zoom-in-95 duration-150">
              {/* Account Card Header */}
              <div className="px-4 pb-3 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-blue-500/20">
                  <User className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-slate-900 truncate">
                      {roleLabel}
                    </span>
                    <span
                      className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${roleBadgeColor}`}
                    >
                      {role === 'A1_SUPER_ADMIN' ? 'A1' : role === 'A2_SUPERVISOR' ? 'A2' : 'A3'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    📞 {currentUser?.mobile_number || '9876543210'}
                  </p>
                  <p className="text-[10px] text-blue-600 font-medium">{roleTamil}</p>
                </div>
              </div>

              {/* Quick Navigation / Role Switcher */}
              <div className="p-2 border-b border-slate-100">
                <span className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Quick Portal Switcher (விரைவு இணைப்புகள்)
                </span>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <Link
                    href="/admin/dashboard"
                    className="flex items-center gap-2 p-2 rounded-xl text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition"
                  >
                    <LayoutDashboard className="w-3.5 h-3.5 text-blue-600" />
                    <span>Admin Dashboard</span>
                  </Link>
                  <Link
                    href="/admin/voters"
                    className="flex items-center gap-2 p-2 rounded-xl text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition"
                  >
                    <Vote className="w-3.5 h-3.5 text-blue-600" />
                    <span>245k Directory</span>
                  </Link>
                  <Link
                    href="/admin/users"
                    className="flex items-center gap-2 p-2 rounded-xl text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition"
                  >
                    <Users className="w-3.5 h-3.5 text-blue-600" />
                    <span>User Accounts</span>
                  </Link>
                  <Link
                    href="/admin/masters"
                    className="flex items-center gap-2 p-2 rounded-xl text-slate-700 hover:bg-purple-50 hover:text-purple-700 font-medium transition"
                  >
                    <Database className="w-3.5 h-3.5 text-purple-600" />
                    <span>2-Tier Masters</span>
                  </Link>
                </div>
              </div>

              {/* System & Export Options */}
              <div className="p-2 border-b border-slate-100 text-xs">
                <span className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  System Tools (அமைப்பு கருவிகள்)
                </span>
                <a
                  href="/api/reports/export"
                  download
                  className="flex items-center justify-between p-2 rounded-xl text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 font-medium transition"
                >
                  <div className="flex items-center gap-2">
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Export Roster (.xlsx)</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                    Excel
                  </span>
                </a>
              </div>

              {/* Logout Action */}
              <div className="p-2 pt-2">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl text-rose-600 hover:bg-rose-50 font-bold text-xs transition"
                >
                  <div className="flex items-center gap-2">
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out (வெளியேறு)</span>
                  </div>
                  <span className="text-[11px] text-rose-400 font-normal">End Session</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
