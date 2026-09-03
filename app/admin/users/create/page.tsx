'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  UserPlus,
  Search,
  CheckCircle2,
  AlertCircle,
  Shield,
  Layers,
  MapPin,
  CheckSquare,
  Square,
  ChevronDown,
} from 'lucide-react'

interface LocalBody {
  ac_no?: number
  name: string
  type: string
  part_nos: number[]
}

interface Constituency {
  ac_no: number
  ac_name_ta: string
  ac_name_en: string
  district: string
  total_parts: number
}

export default function CreateUserPage() {
  const router = useRouter()
  const [currentUserRole, setCurrentUserRole] = useState<string>('A1_SUPER_ADMIN')
  const [targetRole, setTargetRole] = useState<'A2_SUPERVISOR' | 'A3_FIELD_AGENT'>('A2_SUPERVISOR')
  const [mobileNumber, setMobileNumber] = useState('')
  const [password, setPassword] = useState('')
  const [isActive, setIsActive] = useState(true)

  // Geographic list & Constituencies
  const [constituencies, setConstituencies] = useState<Constituency[]>([])
  const [selectedConstituencyValue, setSelectedConstituencyValue] = useState<string>('')
  const [selectedConstituencies, setSelectedConstituencies] = useState<number[]>([])
  const [localBodies, setLocalBodies] = useState<LocalBody[]>([])
  const [selectedBodies, setSelectedBodies] = useState<string[]>([])
  const [selectedParts, setSelectedParts] = useState<number[]>([])

  // Submission state
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')

  useEffect(() => {
    // Load current user info
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          setCurrentUserRole(d.user.role)
          if (d.user.role === 'A2_SUPERVISOR') {
            setTargetRole('A3_FIELD_AGENT')
          }
        }
      })
      .catch(() => {})
  }, [])

  // Load constituencies and local bodies
  useEffect(() => {
    fetch('/api/users/create')
      .then((r) => r.json())
      .then((d) => {
        if (d.constituencies && d.constituencies.length > 0) {
          setConstituencies(d.constituencies)
          setSelectedConstituencyValue(String(d.constituencies[0].ac_no))
          setSelectedConstituencies([d.constituencies[0].ac_no])
        }
        if (d.local_bodies) {
          setLocalBodies(d.local_bodies)
        }
      })
      .catch(() => {})
  }, [])



  function toggleLocalBody(bodyName: string) {
    const isSelected = selectedBodies.includes(bodyName)
    const newSelected = isSelected
      ? selectedBodies.filter((b) => b !== bodyName)
      : [...selectedBodies, bodyName]
    setSelectedBodies(newSelected)

    // Also auto-select / deselect parts for this body
    const body = localBodies.find((b) => b.name === bodyName)
    if (body) {
      if (isSelected) {
        setSelectedParts(selectedParts.filter((p) => !body.part_nos.includes(p)))
      } else {
        setSelectedParts([...Array.from(new Set([...selectedParts, ...body.part_nos]))])
      }
    }
  }

  function togglePart(partNo: number) {
    if (selectedParts.includes(partNo)) {
      setSelectedParts(selectedParts.filter((p) => p !== partNo))
    } else {
      setSelectedParts([...selectedParts, partNo])
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')
    setSubmitSuccess('')

    if (selectedParts.length === 0) {
      setSubmitError('Please assign at least one Polling Booth / Part to this user.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: targetRole,
          mobile_number: mobileNumber,
          password,
          part_ids: selectedParts,
          is_active: isActive,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data.error || 'Failed to create user account')
      } else {
        setSubmitSuccess(`User ${mobileNumber} successfully registered as ${targetRole}!`)
        setTimeout(() => {
          router.push('/admin/users')
        }, 1500)
      }
    } catch {
      setSubmitError('Network error while creating account.')
    } finally {
      setSubmitting(false)
    }
  }

  // Get parts currently visible based on selected local bodies
  const visibleParts = localBodies
    .filter((b) => selectedBodies.includes(b.name))
    .flatMap((b) => b.part_nos)
    .sort((a, b) => a - b)

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold mb-2">
          USER MANAGEMENT • CREATE USER ACCOUNT
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
          User Details & Cascading Jurisdiction Assignment
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Assign Role, Verify Citizen Identity, and Scope Geographic Boundaries
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Role & Status Card */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            <span>1. Role & Account Credentials</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Role Radio */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                TARGET ROLE *
              </label>
              <div className="flex gap-4">
                {currentUserRole === 'A1_SUPER_ADMIN' && (
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="role"
                      value="A2_SUPERVISOR"
                      checked={targetRole === 'A2_SUPERVISOR'}
                      onChange={() => setTargetRole('A2_SUPERVISOR')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium text-slate-800">Second Level Admin (A2)</span>
                  </label>
                )}
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="role"
                    value="A3_FIELD_AGENT"
                    checked={targetRole === 'A3_FIELD_AGENT'}
                    onChange={() => setTargetRole('A3_FIELD_AGENT')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-medium text-slate-800">Field Agent (A3)</span>
                </label>
              </div>
              {currentUserRole === 'A2_SUPERVISOR' && (
                <p className="text-xs text-amber-600 mt-1">
                  *(A2 Supervisors can only register A3 Agents within their scope)*
                </p>
              )}
            </div>

            {/* Account Status */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                ACCOUNT STATUS *
              </label>
              <div className="flex gap-5">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="status"
                    checked={isActive}
                    onChange={() => setIsActive(true)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-slate-800">Active (Yes)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="status"
                    checked={!isActive}
                    onChange={() => setIsActive(false)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-slate-800">Disabled (No)</span>
                </label>
              </div>
            </div>

            {/* Mobile Number */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                USER MOBILE NUMBER *
              </label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 text-slate-500 text-sm">
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  required
                  placeholder="9840123456"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                INITIAL PASSWORD *
              </label>
              <input
                type="password"
                required
                minLength={6}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Cascading Jurisdiction Assignment Card */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            <span>2. Jurisdiction Assignment (Cascading Multi-Select)</span>
          </h2>

          {/* Step 1: Constituency Dropdown */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                1. CONSTITUENCY SELECTION (DROPDOWN) *
              </label>
              <span className="text-xs text-blue-600 font-semibold">
                {constituencies.length} Constituenc{constituencies.length === 1 ? 'y' : 'ies'} Available
              </span>
            </div>

            <div className="relative">
              <select
                value={selectedConstituencyValue}
                onChange={(e) => {
                  const val = e.target.value
                  setSelectedConstituencyValue(val)
                  if (val === 'ALL') {
                    setSelectedConstituencies(constituencies.map((c) => c.ac_no))
                  } else if (val) {
                    setSelectedConstituencies([Number(val)])
                  } else {
                    setSelectedConstituencies([])
                  }
                  setSelectedBodies([])
                  setSelectedParts([])
                }}
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer pr-10"
              >
                <option value="">-- Choose Constituency --</option>
                {constituencies.length > 1 && (
                  <option value="ALL">🌐 All Available Constituencies ({constituencies.length})</option>
                )}
                {constituencies.map((c) => (
                  <option key={c.ac_no} value={c.ac_no}>
                    AC-{c.ac_no}: {c.ac_name_en} ({c.ac_name_ta}) • {c.district} District ({c.total_parts} Polling Booths)
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-2 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex items-center gap-2">
              <span className="text-sm flex-shrink-0">💡</span>
              <span>
                <strong>Future Data Ready:</strong> When data for any additional constituency or district is imported into the database in the future, it will automatically appear in this dropdown.
              </span>
            </div>
          </div>

          {/* Step 2: Panchayats / Towns Multi-Select */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                2. LOCAL BODY / PANCHAYAT (உள்ளாட்சி அமைப்பு)
              </label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const allNames = localBodies.map((b) => b.name)
                    setSelectedBodies(allNames)
                    setSelectedParts(localBodies.flatMap((b) => b.part_nos))
                  }}
                  className="text-blue-600 hover:underline font-semibold"
                >
                  ⚡ Auto-Select All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBodies([])
                    setSelectedParts([])
                  }}
                  className="text-slate-500 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="mb-2">
              <span className="text-xs text-blue-600 font-medium">
                {selectedBodies.length} Selected
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50/50">
              {localBodies
                .filter((b) => (selectedConstituencies.length > 0 && b.ac_no ? selectedConstituencies.includes(b.ac_no) : true))
                .map((b) => {
                  const isSelected = selectedBodies.includes(b.name)
                  return (
                    <button
                      type="button"
                      key={b.name}
                      onClick={() => toggleLocalBody(b.name)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border text-left transition ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 flex-shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                      )}
                      <span className="truncate">{b.name}</span>
                    </button>
                  )
                })}
            </div>
          </div>


          {/* Step 3: Polling Booths (Parts) Filtered */}
          {selectedBodies.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  3. POLLING BOOTH / PART NO (FILTERED BY PANCHAYAT) *
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedParts(visibleParts)}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    Select All ({visibleParts.length})
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedParts([])}
                    className="text-slate-500 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-3 border border-slate-200 rounded-xl bg-slate-50/50">
                {visibleParts.map((partNo) => {
                  const isChecked = selectedParts.includes(partNo)
                  return (
                    <button
                      type="button"
                      key={partNo}
                      onClick={() => togglePart(partNo)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                        isChecked
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      Part #{partNo}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {selectedParts.length} polling booths selected
              </p>
            </div>
          )}
        </div>

        {/* Submit Alerts */}
        {submitError && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 font-medium">
            {submitError}
          </div>
        )}

        {submitSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 font-medium">
            {submitSuccess}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push('/admin/users')}
            className="px-6 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium transition"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={submitting || selectedParts.length === 0}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium transition shadow-sm shadow-blue-500/20 flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>{submitting ? 'Creating Account...' : '✓ Create User Account'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}
