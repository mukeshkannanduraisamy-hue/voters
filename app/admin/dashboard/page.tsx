'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  Download,
  Search,
  Filter,
  RefreshCw,
  ArrowRight,
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
    type: string
    total_voters: number
    completed: number
    pending: number
  }>
  gender_distribution?: Array<{
    gender: string
    count: number
  }>
  constituencies?: Array<{
    ac_no: number
    ac_name_ta: string
    ac_name_en: string
    district: string
    pc_name_en: string
  }>
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAcNo, setSelectedAcNo] = useState<number | ''>('')

  async function loadStats(ac?: number | '') {
    setLoading(true)
    try {
      const url = ac ? `/api/dashboard/stats?ac_no=${ac}` : '/api/dashboard/stats'
      const res = await fetch(url)
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
    loadStats(selectedAcNo)
  }, [selectedAcNo])

  const filteredBreakdown = (data?.breakdown || []).filter(
    (item) =>
      item.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.type?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const activeC = data?.constituencies?.length
    ? selectedAcNo
      ? data.constituencies.find((c: any) => c.ac_no === selectedAcNo) || data.constituencies[0]
      : data.constituencies[0]
    : null

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            Constituency Analytics Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {activeC
              ? `AC-${activeC.ac_no} ${activeC.ac_name_en} (${activeC.ac_name_ta}) • ${activeC.district} District • ${activeC.pc_name_en} PC`
              : 'Tamil Nadu Assembly Constituency Voter Overview'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Dynamic Constituency Switcher (for multi-constituency database) */}
          {(data?.constituencies?.length || 0) > 1 && (
            <select
              value={selectedAcNo}
              onChange={(e) => setSelectedAcNo(e.target.value ? Number(e.target.value) : '')}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">All Constituencies ({data?.constituencies?.length})</option>
              {data?.constituencies?.map((c: any) => (
                <option key={c.ac_no} value={c.ac_no}>
                  AC-{c.ac_no} {c.ac_name_en} ({c.ac_name_ta})
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => loadStats(selectedAcNo)}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium transition shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <a
            href="/api/reports/export"
            download="vms-survey-report.xlsx"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition shadow-sm shadow-blue-500/20"
          >
            <Download className="w-4 h-4" />
            <span>Download Full Report</span>
          </a>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Voters */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Voters
            </span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h2 className="text-3xl font-extrabold text-slate-900">
              {data ? data.total_voters.toLocaleString() : '...'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">In Database (318 Booths)</p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500" />
        </div>

        {/* Completed */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Completed Surveys
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
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${data ? Math.min(100, Math.max(0, data.completion_pct ?? 0)) : 0}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-emerald-600">
                {data ? `${Math.min(100, Math.max(0, data.completion_pct ?? 0))}%` : '0%'}
              </span>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
        </div>

        {/* Pending */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pending Surveys
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

        {/* Today's Done */}
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
              Yesterday: {data ? data.yesterday_count.toLocaleString() : '0'}
              {data && data.today_delta_pct !== 0 && (
                <span
                  className={`ml-1 font-semibold ${
                    data.today_delta_pct > 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  ({data.today_delta_pct > 0 ? '+' : ''}
                  {data.today_delta_pct}%)
                </span>
              )}
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500" />
        </div>
      </div>

      {/* Progress Breakdown Table Card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Panchayat & Town-Wise Survey Progress
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Breakdown by Local Body (கிராம ஊராட்சி & பேரூராட்சி வாரியாக விவரம்)
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Panchayat / Town..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50/70 border-b border-slate-100 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-6 py-3.5 w-12 text-center">#</th>
                <th className="px-6 py-3.5">Local Body Name</th>
                <th className="px-6 py-3.5">Type</th>
                <th className="px-6 py-3.5 text-right">Total Voters</th>
                <th className="px-6 py-3.5 text-right">Updated</th>
                <th className="px-6 py-3.5 text-right">Pending</th>
                <th className="px-6 py-3.5 text-right w-44">Progress</th>
                <th className="px-6 py-3.5 text-center w-28">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    Loading analytics data...
                  </td>
                </tr>
              ) : filteredBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    No matching panchayats found.
                  </td>
                </tr>
              ) : (
                filteredBreakdown.map((item, idx) => {
                  const pct =
                    item.total_voters > 0
                      ? Math.min(100, Math.round((item.completed / item.total_voters) * 100))
                      : 0
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50 transition">
                      <td className="px-6 py-4 text-center font-medium text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        <Link
                          href={`/admin/voters?local_body=${encodeURIComponent(item.name)}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1.5 group"
                          title={`Click to view voters in ${item.name}`}
                        >
                          <span>{item.name}</span>
                          <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-blue-600" />
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                            item.type === 'TOWN_PANCHAYAT'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200/50'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {item.type === 'TOWN_PANCHAYAT' ? 'பேரூராட்சி' : 'ஊராட்சி'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-slate-700">
                        {item.total_voters.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-emerald-600">
                        {item.completed.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-amber-600">
                        {item.pending.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-blue-600 h-full rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-slate-700 w-8">
                            {pct}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Link
                          href={`/admin/voters?local_body=${encodeURIComponent(item.name)}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white text-xs font-semibold transition shadow-sm"
                        >
                          <span>Voters</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
