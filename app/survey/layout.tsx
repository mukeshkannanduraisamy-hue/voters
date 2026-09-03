import AppHeader from '@/components/layout/app-header'

export default function SurveyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <AppHeader role="A3_FIELD_AGENT" />
      <div className="flex-1 flex justify-center w-full">
        <div className="w-full max-w-2xl bg-white min-h-[calc(100vh-55px)] flex flex-col shadow-sm border-x border-slate-200/60">
          {children}
        </div>
      </div>
    </div>
  )
}
