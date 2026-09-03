export default function SurveyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 flex justify-center">
      <div className="w-full max-w-lg bg-white min-h-screen flex flex-col shadow-xl">
        {children}
      </div>
    </div>
  )
}
