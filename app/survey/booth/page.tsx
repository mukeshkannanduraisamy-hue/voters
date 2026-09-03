'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Lock,
  Edit3,
  PenTool,
  CheckCircle2,
  AlertCircle,
  LogOut,
  RefreshCw,
  Phone,
  User,
  Home,
  ChevronRight,
  X,
  Wifi,
  WifiOff,
} from 'lucide-react'

interface Voter {
  epic_id: string
  voter_sno: number
  part_no: number
  name_ta: string
  relation_type_ta: string | null
  relative_name_ta: string | null
  door_no: string
  age: number
  gender: string
  section_title: string | null
  local_body_name_ta: string
  is_surveyed: number
  phone_number?: string
}

export default function MobileSurveyPage() {
  const router = useRouter()
  const [agentMobile, setAgentMobile] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [voters, setVoters] = useState<Voter[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedVoter, setSelectedVoter] = useState<Voter | null>(null)

  // Masters
  const [castes, setCastes] = useState<any[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [parties, setParties] = useState<any[]>([])

  // Form inputs
  const [correctedFirstName, setCorrectedFirstName] = useState('')
  const [correctedLastName, setCorrectedLastName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [selectedCaste, setSelectedCaste] = useState<number | ''>('')
  const [selectedJobCategory, setSelectedJobCategory] = useState('')
  const [selectedJob, setSelectedJob] = useState<number | ''>('')
  const [otherJobText, setOtherJobText] = useState('')
  const [selectedParty, setSelectedParty] = useState<number | ''>('')

  // Submission state
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Online status
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Load agent info & masters on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.user) setAgentMobile(d.user.mobile_number)
      })
      .catch(() => {})

    fetch('/api/masters/dropdowns')
      .then((r) => r.json())
      .then((d) => {
        setCastes(d.castes || [])
        setJobs(d.jobs || [])
        setParties(d.parties || [])
      })
      .catch(() => {})
  }, [])

  // Load default roster and handle search
  useEffect(() => {
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const url = searchQuery.trim()
          ? `/api/voters/search?query=${encodeURIComponent(searchQuery.trim())}`
          : '/api/voters/search'
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          setVoters(data.voters || [])
        }
      } catch (e) {
        console.error(e)
      } finally {
        setSearching(false)
      }
    }, searchQuery.trim() ? 250 : 0)

    return () => clearTimeout(timer)
  }, [searchQuery])

  function handleSelectVoter(v: Voter) {
    setSelectedVoter(v)
    setCorrectedFirstName(v.name_ta || '')
    setCorrectedLastName(v.relative_name_ta || '')
    setPhoneNumber(v.phone_number || '')
    setSelectedCaste('')
    setSelectedJobCategory('')
    setSelectedJob('')
    setOtherJobText('')
    setSelectedParty('')
    setSubmitSuccess(false)
    setSubmitError('')
  }

  function handleClearForm() {
    if (selectedVoter) {
      setCorrectedFirstName(selectedVoter.name_ta || '')
      setCorrectedLastName(selectedVoter.relative_name_ta || '')
    }
    setPhoneNumber('')
    setSelectedCaste('')
    setSelectedJobCategory('')
    setSelectedJob('')
    setOtherJobText('')
    setSelectedParty('')
    setSubmitError('')
  }

  async function handleSubmitSurvey(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedVoter) return
    setSubmitError('')

    if (!phoneNumber || !/^[6-9]\d{9}$/.test(phoneNumber)) {
      setSubmitError('Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.')
      return
    }

    if (!selectedCaste || !selectedJob || !selectedParty) {
      setSubmitError('Please select Caste, Job Sector & Role, and Party affiliation.')
      return
    }

    setSubmitting(true)

    const payload = {
      epic_id: selectedVoter.epic_id,
      phone_number: phoneNumber,
      caste_id: Number(selectedCaste),
      job_id: Number(selectedJob),
      other_job_text: otherJobText.trim() ? otherJobText.trim() : undefined,
      party_id: Number(selectedParty),
      corrected_name_ta: correctedFirstName !== selectedVoter.name_ta ? correctedFirstName : undefined,
      corrected_relative_name_ta:
        correctedLastName !== selectedVoter.relative_name_ta ? correctedLastName : undefined,
    }

    try {
      const res = await fetch('/api/voters/survey/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        setSubmitError(data.error || 'Failed to submit survey')
      } else {
        setSubmitSuccess(true)
        // Mark as surveyed in current search list
        setVoters((prev) =>
          prev.map((v) =>
            v.epic_id === selectedVoter.epic_id ? { ...v, is_surveyed: 1, phone_number: phoneNumber } : v
          )
        )
        setTimeout(() => {
          setSelectedVoter(null)
          setSubmitSuccess(false)
        }, 1200)
      }
    } catch {
      setSubmitError('Network error while saving survey. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  // Unique job categories from master
  const jobCategories = Array.from(
    new Set(jobs.map((j) => j.category).filter(Boolean))
  ) as string[]

  // Sub-jobs filtered by chosen category
  const filteredJobs = selectedJobCategory
    ? jobs.filter((j) => j.category === selectedJobCategory)
    : jobs

  // Is "Others" selected?
  const currentJobObj = jobs.find((j) => j.id === Number(selectedJob))
  const isOtherJobSelected =
    Boolean(currentJobObj?.job_title?.toLowerCase().includes('other')) ||
    Boolean(currentJobObj?.job_title?.includes('மற்றவை')) ||
    Boolean(selectedJobCategory?.toLowerCase().includes('other')) ||
    Boolean(selectedJobCategory?.includes('பிற'))

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top Mobile Bar */}
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shadow-md sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">
            🗳️
          </div>
          <div>
            <h1 className="text-xs font-bold uppercase tracking-wider">Voter Field Survey</h1>
            <p className="text-[11px] text-blue-300">Agent: +91 {agentMobile}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
              isOnline ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400'
            }`}
          >
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </span>

          <button
            onClick={handleLogout}
            title="Logout"
            className="p-1.5 text-slate-400 hover:text-rose-400 rounded"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Input Section */}
      <div className="p-4 bg-blue-900/10 border-b border-blue-100">
        <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1 flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5 text-blue-600" />
          <span>🔎 SEARCH VOTER RECORD</span>
        </label>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="EPIC ID / Name (தமிழ்/Eng) / Door No..."
            className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none shadow-sm"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          Search voters in your assigned Polling Booths (வாக்காளர் தேடல்)
        </p>
      </div>

      {/* Voter List or Search Results */}
      {!selectedVoter && (
        <div className="flex-1 p-4 overflow-y-auto space-y-3">
          {searching ? (
            <div className="py-12 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              <span>Searching voter records...</span>
            </div>
          ) : searchQuery.trim().length >= 2 && voters.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              No matching voter found in your assigned booth.
            </div>
          ) : voters.length > 0 ? (
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-500 px-1">
                Found {voters.length} Voters:
              </div>
              {voters.map((v) => (
                <button
                  type="button"
                  key={v.epic_id}
                  onClick={() => handleSelectVoter(v)}
                  className={`w-full text-left p-3.5 rounded-xl border transition flex items-center justify-between shadow-sm ${
                    v.is_surveyed
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : 'bg-white border-slate-200 hover:border-blue-400'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                        {v.epic_id}
                      </span>
                      {v.is_surveyed ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> Surveyed
                        </span>
                      ) : (
                        <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                          Pending
                        </span>
                      )}
                    </div>

                    <div className="font-bold text-slate-900 text-base tamil-text">
                      {v.name_ta}
                    </div>

                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <span>
                        {v.relation_type_ta || 'உறவு'}: {v.relative_name_ta || '—'}
                      </span>
                      <span>•</span>
                      <span>
                        Door #{v.door_no} • {v.age} Yrs ({v.gender})
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400">
                      Booth #{v.part_no} • {v.local_body_name_ta}
                    </div>
                  </div>

                  <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Search className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm">Type a voter EPIC, Name, or Door Number above to begin.</p>
              <p className="text-xs text-slate-400 tamil-text">
                வாக்காளர் பெயர் அல்லது வாக்காளர் அடையாள அட்டை எண்ணை உள்ளிடவும்
              </p>
            </div>
          )}
        </div>
      )}

      {/* Survey Form Panel */}
      {selectedVoter && (
        <form onSubmit={handleSubmitSurvey} className="flex-1 p-4 space-y-4 overflow-y-auto">
          {/* Back button */}
          <button
            type="button"
            onClick={() => setSelectedVoter(null)}
            className="text-xs text-blue-600 font-semibold flex items-center gap-1 mb-1"
          >
            ← Back to Voter Search List
          </button>

          {/* Section 1: System Pre-Filled (Read-Only) */}
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span>🔒 SYSTEM PRE-FILLED (READ-ONLY)</span>
              </span>
              <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-semibold">
                Locked
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">EPIC NUMBER</span>
                <span className="font-mono font-bold text-slate-800">{selectedVoter.epic_id}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">PANCHAYAT / TOWN</span>
                <span className="font-medium text-slate-800">{selectedVoter.local_body_name_ta}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">DOOR NO / ADDRESS</span>
                <span className="font-medium text-slate-800">#{selectedVoter.door_no}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">AGE / SEX</span>
                <span className="font-medium text-slate-800">
                  {selectedVoter.age} Yrs • {selectedVoter.gender}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Voter Identity (Corrections Allowed) */}
          <div className="bg-amber-50/60 rounded-xl p-3.5 border border-amber-200/80 space-y-3">
            <div className="flex items-center justify-between border-b border-amber-200 pb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1">
                <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                <span>✏️ VOTER IDENTITY (CORRECTIONS ALLOWED)</span>
              </span>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  VOTER FIRST NAME * (வாக்காளர் பெயர்)
                </label>
                <input
                  type="text"
                  value={correctedFirstName}
                  onChange={(e) => setCorrectedFirstName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none tamil-text"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  LAST NAME / FATHER / HUSBAND NAME *
                </label>
                <input
                  type="text"
                  value={correctedLastName}
                  onChange={(e) => setCorrectedLastName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none tamil-text"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Field Data to be Filled by Agent */}
          <div className="bg-blue-50/40 rounded-xl p-3.5 border border-blue-200/80 space-y-3.5">
            <div className="flex items-center justify-between border-b border-blue-200 pb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1">
                <PenTool className="w-3.5 h-3.5 text-blue-700" />
                <span>✍️ FIELD DATA TO BE FILLED BY AGENT</span>
              </span>
            </div>

            {/* 1. Phone Number */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                1. VOTER PHONE NUMBER * (கைபேசி எண்)
              </label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 text-slate-500 text-xs">
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  required
                  placeholder="9845012345"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-r-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                />
              </div>
            </div>

            {/* 2. Caste Dropdown */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                2. CASTE (DROPDOWN FROM MASTER) * (சாதி பிரிவு)
              </label>
              <select
                required
                value={selectedCaste}
                onChange={(e) => setSelectedCaste(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">-- Select Caste --</option>
                {castes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.caste_name} {c.category ? `(${c.category})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Job / Occupation 2-Tier Selector */}
            <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">
                  3. JOB / OCCUPATION * (தொழில் வகைப்பாடு)
                </label>
                <span className="text-[10px] text-blue-600 font-semibold">2-Tier Dropdown</span>
              </div>

              {/* Step 3a: Primary Sector / Category */}
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">
                  Step 1: Main Sector / முதன்மை தொழில் பிரிவு *
                </label>
                <select
                  required
                  value={selectedJobCategory}
                  onChange={(e) => {
                    const cat = e.target.value
                    setSelectedJobCategory(cat)
                    setSelectedJob('')
                    setOtherJobText('')
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">-- Choose Main Sector / பிரிவு --</option>
                  {jobCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 3b: Sub-Dropdown for Specific Role */}
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">
                  Step 2: Specific Occupation / உட்பிரிவு தொழில் *
                </label>
                <select
                  required
                  disabled={!selectedJobCategory && jobCategories.length > 0}
                  value={selectedJob}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setSelectedJob(val)
                    if (!val) setOtherJobText('')
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">
                    {selectedJobCategory ? '-- Choose Specific Job / பணி --' : '-- First Select Sector Above --'}
                  </option>
                  {filteredJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.job_title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 3c: "Others" Free Text Input */}
              {isOtherJobSelected && (
                <div className="pt-1 animate-in fade-in duration-200">
                  <label className="block text-[10px] font-bold text-blue-700 mb-1 flex items-center gap-1">
                    <span>✍️</span>
                    <span>Specify Other Job Title / பிற தொழில் விவரம் (Text):</span>
                  </label>
                  <input
                    type="text"
                    value={otherJobText}
                    onChange={(e) => setOtherJobText(e.target.value)}
                    placeholder="e.g. ஆட்டோ ஓட்டுநர் / தையல் கலைஞர் / வழக்கறிஞர்"
                    className="w-full px-3 py-2 bg-white border border-blue-300 rounded-lg text-xs font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* 4. Party Dropdown */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                4. BELONGS TO WHICH PART / PARTY * (கட்சி ஆதரவு)
              </label>
              <select
                required
                value={selectedParty}
                onChange={(e) => setSelectedParty(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">-- Select Party Affiliation --</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.party_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Feedback */}
          {submitError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {submitSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>✓ Survey successfully saved and submitted!</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleClearForm}
              className="flex-1 py-3 px-4 border border-slate-300 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              🔄 Clear
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="flex-[2] py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-600/30 transition flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Saving...' : '💾 Save & Submit'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
