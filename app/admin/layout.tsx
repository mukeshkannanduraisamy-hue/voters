import DashboardShell from '@/components/layout/dashboard-shell'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell role="A1_SUPER_ADMIN">
      {children}
    </DashboardShell>
  )
}
