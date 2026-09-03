'use client'

import { useEffect, useState } from 'react'
import { Plus, CheckCircle2, XCircle, Tag, Briefcase, Flag, ToggleLeft, ToggleRight } from 'lucide-react'

type TabType = 'castes' | 'jobs' | 'parties'

export default function MasterDataPage() {
  const [activeTab, setActiveTab] = useState<TabType>('castes')
  const [castes, setCastes] = useState<any[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [parties, setParties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // New item modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemCategory, setNewItemCategory] = useState('')
  const [newItemCode, setNewItemCode] = useState('')
  const [newItemColor, setNewItemColor] = useState('#2563eb')
  const [saving, setSaving] = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      const res = await fetch('/api/masters/dropdowns')
      const d = await res.json()
      setCastes(d.castes || [])
      setJobs(d.jobs || [])
      setParties(d.parties || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleToggle(id: number, currentStatus: number) {
    const typeMap = { castes: 'caste', jobs: 'job', parties: 'party' }
    try {
      await fetch(`/api/masters/${typeMap[activeTab]}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: currentStatus === 1 ? 0 : 1 }),
      })
      loadData()
    } catch (e) {
      console.error(e)
    }
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newItemName.trim()) return
    setSaving(true)

    const typeMap = { castes: 'caste', jobs: 'job', parties: 'party' }
    try {
      const res = await fetch(`/api/masters/${typeMap[activeTab]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newItemName.trim(),
          category: newItemCategory.trim() || undefined,
          party_code: newItemCode.trim() || undefined,
          color_code: newItemColor || undefined,
        }),
      })

      if (res.ok) {
        setNewItemName('')
        setNewItemCategory('')
        setNewItemCode('')
        setShowAddModal(false)
        loadData()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold mb-2">
          SUPER ADMIN (A1) • MASTER CONFIGURATION
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Master Data Configuration
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure Caste, Job / Occupation, and Party dropdown lists used in Field Surveys
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-8">
        <button
          onClick={() => setActiveTab('castes')}
          className={`pb-3.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'castes'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>1. Caste Master ({castes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('jobs')}
          className={`pb-3.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'jobs'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>2. Job / Occupation Master ({jobs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('parties')}
          className={`pb-3.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'parties'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Flag className="w-4 h-4" />
          <span>3. Party Affiliation Master ({parties.length})</span>
        </button>
      </div>

      {/* Top Action Bar */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">
          Showing active and disabled options
        </span>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium shadow-sm transition shadow-blue-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>
            + Add New{' '}
            {activeTab === 'castes' ? 'Caste' : activeTab === 'jobs' ? 'Job' : 'Party'}
          </span>
        </button>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50/70 border-b border-slate-100 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-6 py-3.5 w-16 text-center">#</th>
              <th className="px-6 py-3.5">
                {activeTab === 'castes'
                  ? 'Caste Name'
                  : activeTab === 'jobs'
                  ? 'Job / Occupation Title'
                  : 'Political Party Name'}
              </th>
              <th className="px-6 py-3.5">
                {activeTab === 'parties' ? 'Party Code' : 'Category'}
              </th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-slate-400">
                  Loading master data...
                </td>
              </tr>
            ) : (activeTab === 'castes' ? castes : activeTab === 'jobs' ? jobs : parties).map(
                (item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4 text-center text-slate-400 font-medium">
                      {idx + 1}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-900 flex items-center gap-2">
                      {activeTab === 'parties' && item.color_code && (
                        <span
                          className="w-3.5 h-3.5 rounded-full inline-block flex-shrink-0"
                          style={{ backgroundColor: item.color_code }}
                        />
                      )}
                      <span>
                        {activeTab === 'castes'
                          ? item.caste_name
                          : activeTab === 'jobs'
                          ? item.job_title
                          : item.party_name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-600">
                      {item.category || item.party_code || '—'}
                    </td>
                    <td className="px-6 py-4">
                      {item.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-400">
                          <XCircle className="w-3.5 h-3.5" /> Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleToggle(item.id, item.is_active)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                          item.is_active
                            ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                            : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {item.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                )
              )}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <h3 className="text-lg font-bold text-slate-900">
              Add New{' '}
              {activeTab === 'castes'
                ? 'Caste Option'
                : activeTab === 'jobs'
                ? 'Occupation'
                : 'Political Party'}
            </h3>

            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Name / Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    activeTab === 'castes'
                      ? 'e.g. BC - Nadar'
                      : activeTab === 'jobs'
                      ? 'e.g. Govt School Teacher'
                      : 'e.g. Party X'
                  }
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {activeTab === 'castes' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Community Category
                  </label>
                  <select
                    value={newItemCategory}
                    onChange={(e) => setNewItemCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">Select Category</option>
                    <option value="OC">OC (Open Competition)</option>
                    <option value="BC">BC (Backward Class)</option>
                    <option value="BCM">BCM (Backward Class Muslim)</option>
                    <option value="MBC">MBC (Most Backward Class)</option>
                    <option value="SC">SC (Scheduled Caste)</option>
                    <option value="ST">ST (Scheduled Tribe)</option>
                  </select>
                </div>
              )}

              {activeTab === 'jobs' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Main Job Sector / Category (முதன்மை பிரிவு)
                  </label>
                  <input
                    type="text"
                    list="job-categories-list"
                    placeholder="e.g. Agriculture / விவசாயம், Govt Service / அரசு பணி"
                    value={newItemCategory}
                    onChange={(e) => setNewItemCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <datalist id="job-categories-list">
                    <option value="Agriculture / விவசாயம்" />
                    <option value="Govt Service / அரசு பணி" />
                    <option value="Private Sector / தனியார் துறை" />
                    <option value="Business & Trade / வணிகம்" />
                    <option value="Daily Wage / தினக்கூலி" />
                    <option value="Non-Working & Others / பிற" />
                  </datalist>
                </div>
              )}

              {activeTab === 'parties' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Party Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. DMK"
                      value={newItemCode}
                      onChange={(e) => setNewItemCode(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Color
                    </label>
                    <input
                      type="color"
                      value={newItemColor}
                      onChange={(e) => setNewItemColor(e.target.value)}
                      className="w-full h-10 p-1 border border-slate-300 rounded-xl cursor-pointer"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/20"
                >
                  {saving ? 'Saving...' : 'Save Option'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
