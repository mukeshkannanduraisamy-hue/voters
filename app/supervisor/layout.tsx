import AdminSidebar from '@/components/layout/admin-sidebar'

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-slate-50">
      <AdminSidebar role="A2_SUPERVISOR" />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
