import React from 'react';
import { RotateCcw, Search, SlidersHorizontal, UserX } from 'lucide-react';

export default function FilterBar({
  statesList,
  selectedState,
  setSelectedState,
  districtsList,
  selectedDistrict,
  setSelectedDistrict,
  constituenciesList,
  selectedConstituency,
  setSelectedConstituency,
  partsList,
  selectedPart,
  setSelectedPart,
  sectionsList,
  selectedSection,
  setSelectedSection,
  gendersList,
  selectedGender,
  setSelectedGender,
  relationTypesList,
  selectedRelationType,
  setSelectedRelationType,
  selectedStatus,
  setSelectedStatus,
  searchQuery,
  setSearchQuery,
  onResetFilters
}) {
  const hasActiveFilters =
    selectedConstituency !== 'ALL' ||
    selectedPart !== 'ALL' ||
    selectedSection !== 'ALL' ||
    selectedGender !== 'ALL' ||
    selectedRelationType !== 'ALL' ||
    selectedStatus !== 'ALL' ||
    searchQuery.trim() !== '';

  return (
    <div className="eci-form-card" id="theravens-filter-card">
      {/* Section Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <SlidersHorizontal size={18} className="icon-violet" />
          <div>
            <h3 className="section-title">Electoral Filters</h3>
            <p className="section-subtitle">Filter voters by constituency, part, section, status & deleted records</p>
          </div>
        </div>
        {hasActiveFilters && (
          <button className="btn-eci-ghost" onClick={onResetFilters}>
            <RotateCcw size={14} /> Clear All
          </button>
        )}
      </div>

      {/* Filter Grid */}
      <div className="eci-form-grid">
        <div className="eci-field-group">
          <label htmlFor="filter-state">
            State <span className="required">*</span>
          </label>
          <select id="filter-state" className="eci-select" value={selectedState} onChange={(e) => setSelectedState(e.target.value)}>
            {statesList.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="eci-field-group">
          <label htmlFor="filter-district">
            District <span className="required">*</span>
          </label>
          <select id="filter-district" className="eci-select" value={selectedDistrict} onChange={(e) => setSelectedDistrict(e.target.value)}>
            {districtsList.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div className="eci-field-group">
          <label htmlFor="filter-constituency">
            Assembly Constituency <span className="required">*</span>
          </label>
          <select id="filter-constituency" className="eci-select" value={selectedConstituency} onChange={(e) => setSelectedConstituency(e.target.value)}>
            <option value="ALL">All Constituencies</option>
            {constituenciesList.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="eci-field-group">
          <label htmlFor="filter-part">
            Part Number <span className="required">*</span>
          </label>
          <select id="filter-part" className="eci-select" value={selectedPart} onChange={(e) => setSelectedPart(e.target.value)}>
            <option value="ALL">All Parts</option>
            {partsList.map((p) => <option key={p} value={p}>Part #{p}</option>)}
          </select>
        </div>

        <div className="eci-field-group">
          <label htmlFor="filter-section">Section / Locality</label>
          <select id="filter-section" className="eci-select" value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
            <option value="ALL">All Sections</option>
            {sectionsList.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="eci-field-group">
          <label htmlFor="filter-status" style={{ color: selectedStatus === 'DELETED' ? '#ef4444' : 'inherit' }}>
            <UserX size={13} style={{ display: 'inline', marginRight: '3px' }} /> Record Status / Deletion
          </label>
          <select 
            id="filter-status" 
            className="eci-select" 
            style={{ borderColor: selectedStatus === 'DELETED' ? '#ef4444' : 'var(--border-color)' }}
            value={selectedStatus} 
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="ALL">All Electors (Active + Deleted)</option>
            <option value="ACTIVE">Active Electors Only</option>
            <option value="DELETED">⚠️ Deleted Electors Only (Shifted / Expired)</option>
          </select>
        </div>

        <div className="eci-field-group">
          <label htmlFor="filter-gender">Gender</label>
          <select id="filter-gender" className="eci-select" value={selectedGender} onChange={(e) => setSelectedGender(e.target.value)}>
            <option value="ALL">All Genders</option>
            {gendersList.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <div className="eci-field-group">
          <label htmlFor="filter-relation">Relation Type</label>
          <select id="filter-relation" className="eci-select" value={selectedRelationType} onChange={(e) => setSelectedRelationType(e.target.value)}>
            <option value="ALL">All Types</option>
            {relationTypesList.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* Global Search Bar */}
      <div className="eci-field-group" style={{ marginTop: '0.5rem' }}>
        <label htmlFor="global-search">
          Instant Search — Name (Tamil/English), EPIC ID, House No, Serial
        </label>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }} />
          <input
            id="global-search"
            type="text"
            className="eci-input"
            style={{ paddingLeft: '2.5rem' }}
            placeholder="e.g. பச்சியம்மாள், IEB0895417, 4/1, 523..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
