'use client'

import React, { useEffect, useState, useTransition, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Search,
  Filter,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  Building2,
  MapPin,
  Phone,
  Briefcase,
  Users,
  Vote,
  RotateCcw,
  Sparkles,
} from 'lucide-react'

interface VoterRecord {
  epic_id: string
  voter_sno: number
  name_ta: string
  relation_type_ta: string
  relative_name_ta: string
  door_no: string
  age: number
  gender: string
  part_no: number
  local_body_name_ta: string
  local_body_type: string
  main_town_village: string
  section_details: string
  phone_number: string | null
  surveyed_at: string | null
  corrected_name_ta: string | null
  corrected_relative_name_ta: string | null
  caste_name: string | null
  job_title: string | null
  other_job_text: string | null
  party_name: string | null
  color_code: string | null
  symbol_img: string | null
  is_surveyed: number
}

interface DirectoryResponse {
  voters: VoterRecord[]
  pagination: {
    page: number
    limit: number
    total_count: number
    total_pages: number
    has_prev: boolean
    has_next: boolean
  }
  summary: {
    total_voters: number
    completed_surveys: number
    pending_surveys: number
    completion_pct: number
  }
}

interface LocalBodyOption {
  name: string
  type: string
  part_nos: number[]
}

function VoterDirectoryContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // URL query params
  const initialLocalBody = searchParams.get('local_body') || ''
  const initialPartNo = searchParams.get('part_no') || ''
  const initialSearch = searchParams.get('search') || ''
  const initialStatus = searchParams.get('status') || 'all'

  // Filter state
  const [localBody, setLocalBody] = useState(initialLocalBody)
  const [partNo, setPartNo] = useState(initialPartNo)
  const [searchTerm, setSearchTerm] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
  const [gender, setGender] = useState('')
  const [status, setStatus] = useState(initialStatus)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [sortBy, setSortBy] = useState('voter_sno')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Data state
  const [data, setData] = useState<DirectoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [localBodies, setLocalBodies] = useState<LocalBodyOption[]>([])
  const [selectedVoter, setSelectedVoter] = useState<VoterRecord | null>(null)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Load available local bodies for filter dropdown
  useEffect(() => {
    fetch('/api/users/create')
      .then((r) => r.json())
      .then((d) => {
        if (d.local_bodies) {
          setLocalBodies(d.local_bodies)
        }
      })
      .catch(() => {})
  }, [])

  // Sync state if URL searchParams change
  useEffect(() => {
    const paramLb = searchParams.get('local_body') || ''
    if (paramLb !== localBody) {
      setLocalBody(paramLb)
      setPage(1)
    }
  }, [searchParams])

  // Fetch voters on filter / pagination change
  async function fetchVoters() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(limit))
      if (localBody) params.set('local_body', localBody)
      if (partNo) params.set('part_no', partNo)
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (gender) params.set('gender', gender)
      if (status && status !== 'all') params.set('status', status)
      params.set('sort_by', sortBy)
      params.set('sort_order', sortOrder)

      const res = await fetch(`/api/voters/directory?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (err) {
      console.error('Failed to fetch voter directory:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchVoters()
  }, [page, limit, localBody, partNo, debouncedSearch, gender, status, sortBy, sortOrder])

  // Reset all filters
  function handleReset() {
    setLocalBody('')
    setPartNo('')
    setSearchTerm('')
    setDebouncedSearch('')
    setGender('')
    setStatus('all')
    setPage(1)
    setSortBy('voter_sno')
    setSortOrder('asc')
  }

  // Handle sort column click
  function handleSort(column: string) {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
    setPage(1)
  }

  // Parts available for chosen local body
  const availableParts = localBody
    ? localBodies.find((b) => b.name === localBody)?.part_nos || []
    : []

  return (
    <div className="p-3.5 sm:p-5 lg:p-6 max-w-[1440px] mx-auto space-y-5 sm:space-y-6">
      {/* Top Breadcrumb & Title Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link href="/admin/dashboard" className="hover:text-blue-600 transition">
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-slate-900 font-semibold">Voter Directory</span>
            {localBody && (
              <>
                <span>/</span>
                <span className="text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded">
                  {localBody}
                </span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>வாக்காளர் பட்டியல் & கணக்கெடுப்பு விவரங்கள்</span>
            <span className="text-base font-normal text-slate-500 hidden sm:inline">
              (Electoral Roll & Survey Directory)
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchVoters}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <a
            href={`/api/reports/export?${localBody ? `local_body=${encodeURIComponent(localBody)}` : ''}${partNo ? `&part_no=${partNo}` : ''}`}
            download
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-xs font-semibold transition shadow-sm shadow-blue-500/20"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Roster (.xlsx)</span>
          </a>
        </div>
      </div>

      {/* Summary KPI Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Total Voters</div>
            <div className="text-xl font-bold text-slate-900">
              {data?.summary.total_voters.toLocaleString() ?? '—'}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Surveyed</div>
            <div className="text-xl font-bold text-emerald-700">
              {data?.summary.completed_surveys.toLocaleString() ?? '—'}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Pending</div>
            <div className="text-xl font-bold text-amber-700">
              {data?.summary.pending_surveys.toLocaleString() ?? '—'}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Completion Rate</div>
            <div className="text-xl font-bold text-purple-700">
              {data?.summary.completion_pct ?? 0}%
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Filter Toolbar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search Name, EPIC, Door #..."
              className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Local Body Dropdown Filter */}
          <div>
            <select
              value={localBody}
              onChange={(e) => {
                setLocalBody(e.target.value)
                setPartNo('')
                setPage(1)
              }}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
            >
              <option value="">All Panchayats & Towns ({localBodies.length})</option>
              {localBodies.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name} ({b.type === 'TOWN_PANCHAYAT' ? 'பேரூராட்சி' : 'ஊராட்சி'}) — {b.part_nos.length} Booths
                </option>
              ))}
            </select>
          </div>

          {/* Polling Booth Dropdown Filter */}
          <div>
            <select
              value={partNo}
              onChange={(e) => {
                setPartNo(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
            >
              <option value="">
                {localBody ? 'All Booths in ' + localBody : 'All Polling Booths (318 Parts)'}
              </option>
              {(availableParts.length > 0
                ? availableParts
                : Array.from({ length: 318 }, (_, i) => i + 1)
              ).map((p) => (
                <option key={p} value={p}>
                  Part #{p}
                </option>
              ))}
            </select>
          </div>

          {/* Gender Filter */}
          <div>
            <select
              value={gender}
              onChange={(e) => {
                setGender(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
            >
              <option value="">All Genders</option>
              <option value="M">Male (ஆண்)</option>
              <option value="F">Female (பெண்)</option>
              <option value="T">Third Gender (மூன்றாம் பாலினம்)</option>
            </select>
          </div>
        </div>

        {/* Secondary Filter Row: Status Pills, Limit & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            {[
              { label: 'All Voters', value: 'all' },
              { label: '✓ Surveyed Only', value: 'surveyed' },
              { label: '⏳ Pending Only', value: 'pending' },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  setStatus(tab.value)
                  setPage(1)
                }}
                className={`px-3 py-1.5 rounded-lg transition ${
                  status === tab.value
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>Rows per page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value))
                  setPage(1)
                }}
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {(localBody || partNo || searchTerm || gender || status !== 'all') && (
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Advanced Voter Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th
                  onClick={() => handleSort('voter_sno')}
                  className="px-4 py-3.5 cursor-pointer hover:text-slate-900 select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>S.No</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="px-4 py-3.5">EPIC ID</th>
                <th
                  onClick={() => handleSort('name_ta')}
                  className="px-4 py-3.5 cursor-pointer hover:text-slate-900 select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Voter Name (Tamil)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="px-4 py-3.5">Relative Name</th>
                <th
                  onClick={() => handleSort('age')}
                  className="px-4 py-3.5 cursor-pointer hover:text-slate-900 select-none text-center"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Age / Gender</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('door_no')}
                  className="px-4 py-3.5 cursor-pointer hover:text-slate-900 select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Door #</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('part_no')}
                  className="px-4 py-3.5 cursor-pointer hover:text-slate-900 select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Booth / Panchayat</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="px-4 py-3.5">Survey Intelligence</th>
                <th className="px-4 py-3.5 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                      <span>Loading voter roster...</span>
                    </div>
                  </td>
                </tr>
              ) : data?.voters.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-8 h-8 text-slate-300" />
                      <span className="font-semibold text-slate-700">No matching voters found</span>
                      <span className="text-xs">Try loosening search terms or clearing filters</span>
                    </div>
                  </td>
                </tr>
              ) : (
                data?.voters.map((voter) => {
                  return (
                    <tr
                      key={voter.epic_id}
                      onClick={() => setSelectedVoter(voter)}
                      className="hover:bg-blue-50/40 transition cursor-pointer group"
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-slate-500">
                        {voter.voter_sno}
                      </td>

                      <td className="px-4 py-3 font-mono font-bold text-slate-900 group-hover:text-blue-600">
                        {voter.epic_id}
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 text-sm">
                          {voter.name_ta}
                        </div>
                        {voter.corrected_name_ta && (
                          <div className="text-[10px] text-emerald-600 font-medium">
                            Corrected: {voter.corrected_name_ta}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-slate-700">
                        <div>{voter.relative_name_ta}</div>
                        <span className="text-[10px] text-slate-400">
                          ({voter.relation_type_ta || 'உறவு'})
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span className="font-semibold text-slate-800">{voter.age}</span>
                        <span className="text-slate-400 mx-1">/</span>
                        <span
                          className={`font-bold ${
                            voter.gender === 'M' || voter.gender === 'ஆண்'
                              ? 'text-blue-600'
                              : voter.gender === 'F' || voter.gender === 'பெண்'
                              ? 'text-pink-600'
                              : 'text-purple-600'
                          }`}
                        >
                          {voter.gender === 'M' || voter.gender === 'ஆண்'
                            ? 'ஆண்'
                            : voter.gender === 'F' || voter.gender === 'பெண்'
                            ? 'பெண்'
                            : 'மூ.பா'}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-mono text-slate-700">
                        {voter.door_no || '—'}
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">Part #{voter.part_no}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[140px]">
                          {voter.local_body_name_ta}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {voter.is_surveyed ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              ✓ Surveyed
                            </span>
                            {voter.party_name && (
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                                <div className="w-4 h-4 rounded bg-white p-0.5 border border-slate-200 shadow-sm flex items-center justify-center flex-shrink-0">
                                  <img
                                    src={voter.symbol_img || '/parties/independent.svg'}
                                    alt={voter.party_name}
                                    className="w-full h-full object-contain"
                                  />
                                </div>
                                <span>{voter.party_name}</span>
                              </div>
                            )}
                            {voter.phone_number && (
                              <div className="text-[11px] font-mono text-slate-500">
                                📞 {voter.phone_number}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                            ⏳ Pending
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedVoter(voter)
                          }}
                          title="Inspect Voter Details"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {data && data.pagination.total_pages > 1 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-t border-slate-100 bg-slate-50/50 text-xs">
            <div className="text-slate-500 font-medium">
              Showing{' '}
              <span className="font-bold text-slate-900">
                {((page - 1) * limit + 1).toLocaleString()}
              </span>{' '}
              to{' '}
              <span className="font-bold text-slate-900">
                {Math.min(page * limit, data.pagination.total_count).toLocaleString()}
              </span>{' '}
              of{' '}
              <span className="font-bold text-slate-900">
                {data.pagination.total_count.toLocaleString()}
              </span>{' '}
              voters
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!data.pagination.has_prev}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white text-slate-700 transition flex items-center gap-1 font-medium"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              <div className="px-3 py-1.5 font-bold text-slate-800 bg-white border border-slate-200 rounded-lg">
                Page {page} of {data.pagination.total_pages}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(data.pagination.total_pages, p + 1))}
                disabled={!data.pagination.has_next}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white text-slate-700 transition flex items-center gap-1 font-medium"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Voter Inspection Modal / Drawer */}
      {selectedVoter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 space-y-6">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {selectedVoter.epic_id}
                  </span>
                  <span className="text-xs text-slate-400">S.No: #{selectedVoter.voter_sno}</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mt-1">
                  {selectedVoter.name_ta}
                </h2>
                <p className="text-xs text-slate-500">
                  {selectedVoter.local_body_name_ta} ({selectedVoter.local_body_type}) • Booth #{selectedVoter.part_no}
                </p>
              </div>

              <button
                onClick={() => setSelectedVoter(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Section A: Official Citizen Electoral Details (Read-Only) */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                <span>1. Official Electoral Roll Details (தேர்தல் பட்டியல்)</span>
              </h3>

              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[11px]">Relative Name</span>
                  <span className="font-semibold text-slate-800">
                    {selectedVoter.relative_name_ta} ({selectedVoter.relation_type_ta || '—'})
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Age & Gender</span>
                  <span className="font-semibold text-slate-800">
                    {selectedVoter.age} Yrs • {selectedVoter.gender === 'M' || selectedVoter.gender === 'ஆண்' ? 'ஆண் (Male)' : selectedVoter.gender === 'F' || selectedVoter.gender === 'பெண்' ? 'பெண் (Female)' : 'மூன்றாம் பாலினம் (Third Gender)'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Door Number</span>
                  <span className="font-semibold font-mono text-slate-800">
                    {selectedVoter.door_no || '—'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Polling Station Part</span>
                  <span className="font-semibold text-slate-800">
                    Part #{selectedVoter.part_no} ({selectedVoter.local_body_name_ta})
                  </span>
                </div>

                {selectedVoter.main_town_village && (
                  <div className="col-span-2">
                    <span className="text-slate-400 block text-[11px]">Village / Town</span>
                    <span className="font-medium text-slate-700">
                      {selectedVoter.main_town_village}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Section B: Field Survey Intelligence */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Vote className="w-3.5 h-3.5 text-emerald-600" />
                <span>2. Field Survey Intelligence (கள கணக்கெடுப்பு முடிவு)</span>
              </h3>

              {selectedVoter.is_surveyed ? (
                <div className="grid grid-cols-2 gap-3 text-xs bg-emerald-50/60 p-4 rounded-xl border border-emerald-200">
                  <div>
                    <span className="text-emerald-700 block text-[11px]">Mobile Number</span>
                    <span className="font-bold font-mono text-slate-900 text-sm">
                      📞 {selectedVoter.phone_number || '—'}
                    </span>
                  </div>

                  <div>
                    <span className="text-emerald-700 block text-[11px]">Political Leaning</span>
                    <span className="font-bold text-slate-900 flex items-center gap-2 mt-0.5">
                      <div className="w-6 h-6 rounded-lg bg-white p-0.5 border border-slate-200 shadow-sm flex items-center justify-center flex-shrink-0">
                        <img
                          src={selectedVoter.symbol_img || '/parties/independent.svg'}
                          alt={selectedVoter.party_name || 'Party'}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <span>{selectedVoter.party_name || '—'}</span>
                    </span>
                  </div>

                  <div>
                    <span className="text-emerald-700 block text-[11px]">Caste / Community</span>
                    <span className="font-semibold text-slate-900">
                      {selectedVoter.caste_name || '—'}
                    </span>
                  </div>

                  <div>
                    <span className="text-emerald-700 block text-[11px]">Job / Occupation</span>
                    <span className="font-semibold text-slate-900">
                      {selectedVoter.job_title || '—'}
                      {selectedVoter.other_job_text ? ` (${selectedVoter.other_job_text})` : ''}
                    </span>
                  </div>

                  {selectedVoter.corrected_name_ta && (
                    <div className="col-span-2 bg-white/70 p-2.5 rounded-lg border border-emerald-200/60">
                      <span className="text-[11px] text-emerald-700 block font-semibold">
                        Field Corrected Name
                      </span>
                      <span className="text-slate-800">{selectedVoter.corrected_name_ta}</span>
                    </div>
                  )}

                  <div className="col-span-2 text-[11px] text-slate-400 pt-1 border-t border-emerald-100">
                    Survey Recorded At: {selectedVoter.surveyed_at || '—'}
                  </div>
                </div>
              ) : (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-1">
                  <Clock className="w-6 h-6 text-amber-500 mx-auto" />
                  <div className="font-bold text-slate-800 text-sm">Survey Pending</div>
                  <div className="text-xs text-slate-500">
                    This citizen has not yet been surveyed by the booth agent.
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={() => setSelectedVoter(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function VoterDirectoryPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-slate-400 text-sm">
          Loading voter directory...
        </div>
      }
    >
      <VoterDirectoryContent />
    </Suspense>
  )
}
