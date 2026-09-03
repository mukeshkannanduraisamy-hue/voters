'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { UserPlus, Shield, Smartphone, Calendar, CheckCircle2, XCircle } from 'lucide-react'

interface UserItem {
  id: string
  mobile_number: string
  role: string
  epic_id: string
  is_active: number
  created_at: string
  parts_count: number
  parts_sample: string
}

export default function UserListPage() {
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/users/list')
      .then((r) => r.json())
      .then((d) => {
        if (d.users) setUsers(d.users)
      })
      .catch((e) => console.error('Error fetching users', e))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Registered Users & Field Agents
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage Supervisors (A2) and Field Surveyors (A3) with assigned jurisdictions
          </p>
        </div>

        <Link
          href="/admin/users/create"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition shadow-sm shadow-blue-500/20"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Create New User</span>
        </Link>
      </div>

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
                <th className="px-6 py-3.5 text-right">Created Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    Loading users list...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
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
                    <td className="px-6 py-4 text-right text-xs text-slate-500 flex items-center justify-end gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{u.created_at?.slice(0, 10)}</span>
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
