'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  UserPlus,
  Shield,
  Smartphone,
  Calendar,
  CheckCircle2,
  XCircle,
  Edit2,
  X,
  Lock,
  MapPin,
  CheckSquare,
  Square,
  RefreshCw,
  Sparkles,
} from 'lucide-react'

interface UserItem {
  id: string
  mobile_number: string
  role: string
  epic_id: string
  is_active: number
  created_at: string
  part_ids?: number[]
  parts_count: number
  parts_sample: string
}

interface LocalBody {
  ac_no: number
  name: string
  type: string
  part_nos: number[]
}

export default function UserListPage() {
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [localBodies, setLocalBodies] = useState<LocalBody[]>([])

  // Edit Modal State
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)
  const [editMobile, setEditMobile] = useState('')
  const [editRole, setEditRole] = useState<'A2_SUPERVISOR' | 'A3_FIELD_AGENT'>('A3_FIELD_AGENT')
  const [editPassword, setEditPassword] = useState('')
  const [editEpicId, setEditEpicId] = useState('')
  const [editIsActive, setEditIsActive] = useState(true)
  const [editSelectedBodies, setEditSelectedBodies] = useState<string[]>([])
  const [editSelectedParts, setEditSelectedParts] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [modalSuccess, setModalSuccess] = useState('')

  function loadUsers() {
    setLoading(true)
    fetch('/api/users/list')
      .then((r) => r.json())
      .then((d) => {
        if (d.users) setUsers(d.users)
      })
      .catch((e) => console.error('Error fetching users', e))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadUsers()

    // Fetch local bodies for jurisdiction selection
    fetch('/api/users/create')
      .then((r) => r.json())
      .then((d) => {
        if (d.local_bodies) setLocalBodies(d.local_bodies)
      })
      .catch(() => {})
  }, [])

  function openEditModal(u: UserItem) {
    setEditingUser(u)
    setEditMobile(u.mobile_number)
    setEditRole(u.role === 'A2_SUPERVISOR' ? 'A2_SUPERVISOR' : 'A3_FIELD_AGENT')
    setEditPassword('')
    setEditEpicId(u.epic_id || '')
    setEditIsActive(u.is_active === 1)
    setModalError('')
    setModalSuccess('')

    const assignedParts = u.part_ids || []
    setEditSelectedParts(assignedParts)

    // Identify which local bodies contain the assigned parts
    const bodies = localBodies
      .filter((b) => b.part_nos.some((p) => assignedParts.includes(p)))
      .map((b) => b.name)
    setEditSelectedBodies(bodies)
  }

  function toggleBody(name: string) {
    if (editSelectedBodies.includes(name)) {
      setEditSelectedBodies(editSelectedBodies.filter((b) => b !== name))
      const body = localBodies.find((b) => b.name === name)
      if (body) {
        setEditSelectedParts(editSelectedParts.filter((p) => !body.part_nos.includes(p)))
      }
    } else {
      setEditSelectedBodies([...editSelectedBodies, name])
      const body = localBodies.find((b) => b.name === name)
      if (body) {
        setEditSelectedParts([...Array.from(new Set([...editSelectedParts, ...body.part_nos]))])
      }
    }
  }

  function togglePart(partNo: number) {
    if (editSelectedParts.includes(partNo)) {
      setEditSelectedParts(editSelectedParts.filter((p) => p !== partNo))
    } else {
      setEditSelectedParts([...editSelectedParts, partNo])
    }
  }

  async function handleSaveUser(e: React.FormEvent) {
    e.preventDefault()
    if (!editingUser) return
    setModalError('')
    setModalSuccess('')

    if (!editMobile || !/^[6-9]\d{9}$/.test(editMobile)) {
      setModalError('Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.')
      return
    }

    if (editPassword && editPassword.length < 6) {
      setModalError('New password must be at least 6 characters long.')
      return
    }

    if (editSelectedParts.length === 0) {
      setModalError('Please assign at least one Polling Booth / Part No.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobile_number: editMobile,
          role: editRole,
          password: editPassword || undefined,
          epic_id: editEpicId,
          is_active: editIsActive ? 1 : 0,
          part_ids: editSelectedParts,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setModalError(data.error || 'Failed to update user.')
      } else {
        setModalSuccess('✓ User details and jurisdictions successfully updated!')
        setTimeout(() => {
          setEditingUser(null)
          loadUsers()
        }, 1200)
      }
    } catch {
      setModalError('Network error while saving user.')
    } finally {
      setSaving(false)
    }
  }

  // Get parts currently visible based on selected local bodies
  const visibleParts = localBodies
    .filter((b) => editSelectedBodies.includes(b.name))
    .flatMap((b) => b.part_nos)
    .sort((a, b) => a - b)

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>ACCESS CONTROL & JURISDICTIONS</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Registered Users & Field Agents
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Manage Supervisors (A2) and Field Surveyors (A3) — Editable credentials & assigned jurisdictions
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadUsers}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs sm:text-sm font-semibold transition shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <Link
            href="/admin/users/create"
            className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition shadow-sm shadow-blue-500/20"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Create New User</span>
          </Link>
        </div>
      </div>

      {/* Users Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50/70 border-b border-slate-100 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-6 py-3.5">User Mobile</th>
                <th className="px-6 py-3.5">Assigned Role</th>
                <th className="px-6 py-3.5">Verified EPIC ID</th>
                <th className="px-6 py-3.5">Jurisdiction Scope</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Created Date</th>
                <th className="px-6 py-3.5 text-center w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    Loading users list...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    No users registered yet. Click &quot;+ Create New User&quot; to begin.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4 font-semibold text-slate-900 flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-slate-400" />
                      <span>+91 {u.mobile_number}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                          u.role === 'A1_SUPER_ADMIN'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : u.role === 'A2_SUPERVISOR'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        <Shield className="w-3 h-3" />
                        <span>
                          {u.role === 'A1_SUPER_ADMIN'
                            ? 'Super Admin (A1)'
                            : u.role === 'A2_SUPERVISOR'
                            ? 'Supervisor (A2)'
                            : 'Field Agent (A3)'}
                        </span>
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-700">
                      {u.epic_id || '—'}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-600">
                      {u.role === 'A1_SUPER_ADMIN' ? (
                        <span className="font-semibold text-slate-800">
                          Global (All 318 Booths)
                        </span>
                      ) : (
                        <span>
                          <strong className="text-blue-600">{u.parts_count || 0}</strong>{' '}
                          Booths assigned
                          {u.parts_sample ? ` (${u.parts_sample})` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                          <XCircle className="w-3.5 h-3.5" /> Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{u.created_at?.slice(0, 10)}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => openEditModal(u)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-semibold transition shadow-2xs"
                        title="Edit user credentials and jurisdictions"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>Edit</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT USER MODAL */}
      {editingUser && (
        <div
          onClick={() => setEditingUser(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 space-y-5"
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold uppercase mb-1">
                  <Edit2 className="w-3 h-3" />
                  <span>EDIT USER ACCOUNT</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900">
                  Edit User: +91 {editingUser.mobile_number}
                </h2>
                <p className="text-xs text-slate-500">
                  Update role, reset password, toggle active status, and reassign polling booths
                </p>
              </div>

              <button
                onClick={() => setEditingUser(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error & Success Banners */}
            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700">
                ⚠️ {modalError}
              </div>
            )}
            {modalSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800">
                {modalSuccess}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveUser} className="space-y-4">
              {/* Role & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    User Role (பங்கு)
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                  >
                    <option value="A3_FIELD_AGENT">A3 - Field Agent (கள ஆய்வாளர்)</option>
                    <option value="A2_SUPERVISOR">A2 - Supervisor (மேற்பார்வையாளர்)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Account Status
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditIsActive(!editIsActive)}
                    className={`w-full py-2.5 px-3 rounded-xl border text-xs font-semibold transition flex items-center justify-center gap-2 ${
                      editIsActive
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-2xs'
                        : 'bg-slate-100 border-slate-200 text-slate-500'
                    }`}
                  >
                    {editIsActive ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Account is Active (செயலில் உள்ளது)</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-slate-400" />
                        <span>Account is Disabled (முடக்கப்பட்டுள்ளது)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Mobile Number & Password Reset */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Mobile Number (கைபேசி எண்) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-mono font-bold">
                      +91
                    </span>
                    <input
                      type="tel"
                      required
                      value={editMobile}
                      onChange={(e) => setEditMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className="w-full pl-11 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center justify-between">
                    <span>Password (கடவுச்சொல்)</span>
                    <span className="text-[10px] text-slate-400 lowercase font-normal">
                      optional reset
                    </span>
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      placeholder="Leave blank to keep existing password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Verified EPIC ID */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Voter EPIC ID (விருப்பத்தேர்வு)
                </label>
                <input
                  type="text"
                  placeholder="e.g. IEB0787739"
                  value={editEpicId}
                  onChange={(e) => setEditEpicId(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Jurisdiction Assignment */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    <span>Assigned Jurisdictions (வாக்குச்சாவடி ஒதுக்கீடு) *</span>
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        const allNames = localBodies.map((b) => b.name)
                        setEditSelectedBodies(allNames)
                        setEditSelectedParts(localBodies.flatMap((b) => b.part_nos))
                      }}
                      className="text-blue-600 hover:underline font-bold"
                    >
                      ⚡ Auto-Select All ({localBodies.length})
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditSelectedBodies([])
                        setEditSelectedParts([])
                      }}
                      className="text-slate-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Local Body Chips */}
                <div>
                  <span className="text-[11px] text-slate-500 block mb-1.5 font-medium">
                    1. Select Panchayats ({editSelectedBodies.length} chosen):
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50/50">
                    {localBodies.map((b) => {
                      const isSelected = editSelectedBodies.includes(b.name)
                      return (
                        <button
                          type="button"
                          key={b.name}
                          onClick={() => toggleBody(b.name)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border text-left transition ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-3 h-3 flex-shrink-0" />
                          ) : (
                            <Square className="w-3 h-3 flex-shrink-0 text-slate-400" />
                          )}
                          <span className="truncate">{b.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Polling Booths Checkboxes */}
                {editSelectedBodies.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] text-slate-500 font-medium">
                        2. Polling Booths ({editSelectedParts.length} selected):
                      </span>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setEditSelectedParts(visibleParts)}
                          className="text-blue-600 hover:underline font-semibold"
                        >
                          Select All Visible ({visibleParts.length})
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50/50">
                      {visibleParts.map((partNo) => {
                        const isChecked = editSelectedParts.includes(partNo)
                        return (
                          <button
                            type="button"
                            key={partNo}
                            onClick={() => togglePart(partNo)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                              isChecked
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            Part #{partNo}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-bold text-xs shadow-md shadow-blue-500/20 disabled:opacity-50 transition"
                >
                  {saving ? 'Saving Updates...' : '💾 Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
