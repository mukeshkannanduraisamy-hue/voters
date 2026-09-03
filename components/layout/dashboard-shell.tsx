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

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
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
        />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
