import DashboardShell from '@/components/layout/dashboard-shell'

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell role="A2_SUPERVISOR">
      {children}
    </DashboardShell>
  )
}
