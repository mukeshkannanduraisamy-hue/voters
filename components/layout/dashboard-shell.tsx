'use client'

import React, { useState } from 'react'
import AdminSidebar from '@/components/layout/admin-sidebar'
import AppHeader from '@/components/layout/app-header'

interface DashboardShellProps {
  role: 'A1_SUPER_ADMIN' | 'A2_SUPERVISOR'
  children: React.ReactNode
}

export default function DashboardShell({ role, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* Responsive Sidebar (Docked on Desktop, Drawer on Tablet/Phone) */}
      <AdminSidebar
        role={role}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area with Sticky Header & Right-Corner Option Menu */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <AppHeader
          role={role}
          isSidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
        <div className="flex-1 overflow-y-auto bg-slate-50 flex justify-center items-start p-0">
          <main
            className={`transition-all duration-300 w-full ${
              viewMode === 'tablet'
                ? 'max-w-3xl my-4 bg-white rounded-2xl shadow-xl border border-slate-200 ring-4 ring-slate-200/60 overflow-hidden min-h-[calc(100vh-85px)]'
                : viewMode === 'mobile'
                ? 'max-w-sm my-4 bg-white rounded-3xl shadow-2xl border-4 border-slate-800 ring-8 ring-slate-200/60 overflow-hidden min-h-[calc(100vh-85px)]'
                : 'w-full'
            }`}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
