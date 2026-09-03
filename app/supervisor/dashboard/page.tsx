'use client'

import { useEffect, useState } from 'react'
import {
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  Download,
  Search,
  RefreshCw,
  UserCheck,
} from 'lucide-react'

interface StatsData {
  total_voters: number
  completed_surveys: number
  pending_surveys: number
  today_count: number
  yesterday_count: number
  today_delta_pct: number
  completion_pct: number
  breakdown: Array<{
    name: string
    completed: number
    last_active: string | null
  }>
}

export default function SupervisorDashboardPage() {
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  async function loadStats() {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/stats')
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (e) {
      console.error('Failed to load stats', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, [])

  const filteredBreakdown = (data?.breakdown || []).filter((item) =>
    item.name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            Supervisor Jurisdiction Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Assigned Panchayats & Booths • Field Agent Performance Monitoring
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadStats}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium transition shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <a
            href="/api/reports/export"
            download
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition shadow-sm shadow-blue-500/20"
          >
            <Download className="w-4 h-4" />
            <span>Download Scoped Report</span>
          </a>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Assigned Voters
            </span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h2 className="text-3xl font-extrabold text-slate-900">
              {data ? data.total_voters.toLocaleString() : '...'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">In Assigned Jurisdiction</p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500" />
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Completed
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h2 className="text-3xl font-extrabold text-emerald-600">
              {data ? data.completed_surveys.toLocaleString() : '...'}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full"
                  style={{ width: `${data ? data.completion_pct : 0}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-emerald-600">
                {data ? `${data.completion_pct}%` : '0%'}
              </span>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pending
            </span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h2 className="text-3xl font-extrabold text-amber-600">
              {data ? data.pending_surveys.toLocaleString() : '...'}
            </h2>
            <p className="text-xs text-amber-600/80 font-medium mt-1">
              {data ? `${(100 - data.completion_pct).toFixed(1)}% Remaining` : '...'}
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500" />
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Today&apos;s Done
            </span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h2 className="text-3xl font-extrabold text-indigo-600">
              {data ? data.today_count.toLocaleString() : '...'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              By Assigned Agents
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500" />
        </div>
      </div>

      {/* Agent-Wise Performance Table Card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Field Agent (A3) Performance Summary
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Survey Progress by Agent (களப்பணியாளர்கள் வாரியாக விவரம்)
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Agent Mobile..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50/70 border-b border-slate-100 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-6 py-3.5 w-12 text-center">#</th>
                <th className="px-6 py-3.5">Agent Mobile Number</th>
                <th className="px-6 py-3.5 text-right">Surveys Completed</th>
                <th className="px-6 py-3.5 text-right">Last Surveyed Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-slate-400">
                    Loading agent data...
                  </td>
                </tr>
              ) : filteredBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-slate-400">
                    No field agents currently recorded.
                  </td>
                </tr>
              ) : (
                filteredBreakdown.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4 text-center font-medium text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-900 flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-blue-600" />
                      <span>{item.name}</span>
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-emerald-600">
                      {item.completed.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-500 text-xs">
                      {item.last_active || 'Not started'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
