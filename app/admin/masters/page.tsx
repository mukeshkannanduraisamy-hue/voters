'use client'

import React, { useEffect, useState } from 'react'
import {
  Plus,
  CheckCircle2,
  XCircle,
  Tag,
  Briefcase,
  Flag,
  Search,
  RefreshCw,
  Edit2,
  X,
  AlertCircle,
  Sparkles,
} from 'lucide-react'

type TabType = 'castes' | 'jobs' | 'parties'

interface MasterItem {
  id: number
  caste_name?: string
  job_title?: string
  party_name?: string
  category?: string | null
  party_code?: string | null
  color_code?: string | null
  is_active: number
  created_at?: string
}

export default function MasterDataPage() {
  const [activeTab, setActiveTab] = useState<TabType>('castes')
  const [castes, setCastes] = useState<MasterItem[]>([])
  const [jobs, setJobs] = useState<MasterItem[]>([])
  const [parties, setParties] = useState<MasterItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all')

  // Modals & form state
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState<MasterItem | null>(null)
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formCode, setFormCode] = useState('')
  const [formColor, setFormColor] = useState('#2563eb')
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  // Load ALL master data (both active and disabled) from /api/masters/[type]
  async function loadData() {
    setLoading(true)
    try {
      const [castesRes, jobsRes, partiesRes] = await Promise.all([
        fetch('/api/masters/castes'),
        fetch('/api/masters/jobs'),
        fetch('/api/masters/parties'),
      ])

      const [cData, jData, pData] = await Promise.all([
        castesRes.json(),
        jobsRes.json(),
        partiesRes.json(),
      ])

      setCastes(cData.items || [])
      setJobs(jData.items || [])
      setParties(pData.items || [])
    } catch (e) {
      console.error('Error loading master data', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Toggle active/inactive
  async function handleToggle(id: number, currentStatus: number) {
    setTogglingId(id)
    const typeMap: Record<TabType, string> = { castes: 'caste', jobs: 'job', parties: 'party' }
    try {
      const res = await fetch(`/api/masters/${typeMap[activeTab]}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: currentStatus === 1 ? 0 : 1 }),
      })
      if (res.ok) {
        await loadData()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setTogglingId(null)
    }
  }

  // Open Edit Modal
  function openEditModal(item: MasterItem) {
    setEditingItem(item)
    setFormName(item.caste_name || item.job_title || item.party_name || '')
    setFormCategory(item.category || '')
    setFormCode(item.party_code || '')
    setFormColor(item.color_code || '#2563eb')
    setFormError('')
    setFormSuccess('')
    setShowAddModal(true)
  }

  // Open Create Modal
  function openCreateModal() {
    setEditingItem(null)
    setFormName('')
    setFormCategory('')
    setFormCode('')
    setFormColor('#2563eb')
    setFormError('')
    setFormSuccess('')
    setShowAddModal(true)
  }

  // Submit Add or Edit Form
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) {
      setFormError('Please enter a name / title.')
      return
    }

    setSaving(true)
    setFormError('')

    const typeMap: Record<TabType, string> = { castes: 'caste', jobs: 'job', parties: 'party' }
    const endpoint = `/api/masters/${typeMap[activeTab]}`

    try {
      if (editingItem) {
        // Edit existing item
        const res = await fetch(endpoint, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingItem.id,
            name: formName.trim(),
            category: formCategory.trim() || undefined,
            party_code: formCode.trim() || undefined,
            color_code: formColor || undefined,
          }),
        })

        const data = await res.json()
        if (!res.ok) {
          setFormError(data.error || 'Failed to update item.')
          return
        }
      } else {
        // Create new item
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            category: formCategory.trim() || undefined,
            party_code: formCode.trim() || undefined,
            color_code: formColor || undefined,
          }),
        })

        const data = await res.json()
        if (!res.ok) {
          setFormError(data.error || 'Failed to add item.')
          return
        }
      }

      setFormSuccess(editingItem ? 'Item updated successfully!' : 'New item added successfully!')
      await loadData()
      setTimeout(() => {
        setShowAddModal(false)
        setFormSuccess('')
      }, 600)
    } catch {
      setFormError('Network error while saving. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Current active dataset
  const currentList = activeTab === 'castes' ? castes : activeTab === 'jobs' ? jobs : parties

  // Filtering by search query & status
  const filteredList = currentList.filter((item) => {
    const name = (item.caste_name || item.job_title || item.party_name || '').toLowerCase()
    const category = (item.category || item.party_code || '').toLowerCase()
    const query = searchQuery.toLowerCase().trim()

    const matchesSearch = !query || name.includes(query) || category.includes(query)
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
        ? item.is_active === 1
        : item.is_active === 0

    return matchesSearch && matchesStatus
  })

  // Summary counts
  const totalCount = currentList.length
  const activeCount = currentList.filter((i) => i.is_active === 1).length
  const disabledCount = currentList.filter((i) => i.is_active === 0).length

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>SUPER ADMIN (A1) • SYSTEM CONFIGURATION</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Master Data Configuration
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure Caste, 2-Tier Occupational Hierarchy, and Political Party dropdowns used across Field Surveys
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>
              + Add{' '}
              {activeTab === 'castes' ? 'Caste' : activeTab === 'jobs' ? 'Occupation' : 'Party'}
            </span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => {
            setActiveTab('castes')
            setSearchQuery('')
            setStatusFilter('all')
          }}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'castes'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>1. Caste Master ({castes.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('jobs')
            setSearchQuery('')
            setStatusFilter('all')
          }}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'jobs'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>2. Job / Occupation Master ({jobs.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('parties')
            setSearchQuery('')
            setStatusFilter('all')
          }}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'parties'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Flag className="w-4 h-4" />
          <span>3. Party Affiliation Master ({parties.length})</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition ${
              statusFilter === 'all'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg transition ${
              statusFilter === 'active'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ✓ Active ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter('disabled')}
            className={`px-3 py-1.5 rounded-lg transition ${
              statusFilter === 'disabled'
                ? 'bg-white text-amber-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Disabled ({disabledCount})
          </button>
        </div>
      </div>

      {/* Master Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3.5 w-12 text-center">#</th>
                <th className="px-5 py-3.5">
                  {activeTab === 'castes'
                    ? 'Caste / Community'
                    : activeTab === 'jobs'
                    ? 'Occupation Role Title'
                    : 'Political Party Name'}
                </th>
                <th className="px-5 py-3.5">
                  {activeTab === 'parties' ? 'Party Code' : 'Sector / Category'}
                </th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                      <span>Loading master entries...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400">
                    No matching master records found.
                  </td>
                </tr>
              ) : (
                filteredList.map((item, idx) => {
                  const title = item.caste_name || item.job_title || item.party_name || ''
                  const subtitle = item.category || item.party_code || '—'
                  const isToggling = togglingId === item.id

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/60 transition ${
                        item.is_active === 0 ? 'bg-slate-50/40 opacity-75' : ''
                      }`}
                    >
                      <td className="px-5 py-3.5 text-center text-slate-400 font-mono">
                        {idx + 1}
                      </td>

                      <td className="px-5 py-3.5 font-bold text-slate-900 flex items-center gap-2.5">
                        {activeTab === 'parties' && (
                          <span
                            className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-slate-200"
                            style={{ backgroundColor: item.color_code || '#2563eb' }}
                          />
                        )}
                        <span className="text-sm">{title}</span>
                      </td>

                      <td className="px-5 py-3.5 font-medium text-slate-600">
                        <span className="inline-block px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold">
                          {subtitle}
                        </span>
                      </td>

                      <td className="px-5 py-3.5">
                        {item.is_active === 1 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-600">
                            <XCircle className="w-3 h-3" /> Disabled
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => openEditModal(item)}
                            title="Edit Item"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition border border-slate-200 bg-white"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleToggle(item.id, item.is_active)}
                            disabled={isToggling}
                            className={`text-xs font-semibold px-3 py-1 rounded-lg border transition ${
                              item.is_active === 1
                                ? 'border-amber-200 text-amber-700 hover:bg-amber-50 bg-amber-50/40'
                                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 bg-emerald-50/40'
                            }`}
                          >
                            {isToggling ? '...' : item.is_active === 1 ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingItem ? 'Edit' : 'Add New'}{' '}
                {activeTab === 'castes'
                  ? 'Caste Community'
                  : activeTab === 'jobs'
                  ? 'Occupation'
                  : 'Political Party'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-500" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-500" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Name / Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    activeTab === 'castes'
                      ? 'e.g. BC - Vanniyar / வன்னியர்'
                      : activeTab === 'jobs'
                      ? 'e.g. Electrician / எலக்ட்ரீசியன்'
                      : 'e.g. DMK / திமுக'
                  }
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {activeTab === 'castes' && (
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Reservation Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
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
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Main Job Sector / Category (முதன்மை பிரிவு) *
                  </label>
                  <input
                    type="text"
                    list="job-categories-modal"
                    required
                    placeholder="e.g. Agriculture / விவசாயம், Govt Service / அரசு பணி"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <datalist id="job-categories-modal">
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
                    <label className="block font-bold text-slate-700 uppercase mb-1">
                      Party Short Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. DMK, AIADMK"
                      value={formCode}
                      onChange={(e) => setFormCode(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">
                      Flag / Branding Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formColor}
                        onChange={(e) => setFormColor(e.target.value)}
                        className="w-10 h-9 p-0.5 border border-slate-200 rounded-lg cursor-pointer bg-white"
                      />
                      <input
                        type="text"
                        value={formColor}
                        onChange={(e) => setFormColor(e.target.value)}
                        className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-semibold shadow-sm shadow-blue-500/20 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingItem ? 'Update Option' : 'Save Option'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
