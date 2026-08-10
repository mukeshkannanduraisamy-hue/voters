import React, { useState, useEffect } from 'react';
import { ArrowLeft, User, Printer, MapPin, ShieldCheck, Copy, Check, Edit3, Home,
  FileText, ChevronRight, Eye, Star, StarOff, Clock, Activity, Bookmark, BookmarkCheck, Maximize2, Minimize2 } from 'lucide-react';
import PrintableSlip from './PrintableSlip';

export default function VoterProfilePage({ voter, photoUrl, onBackToVoterList, onUpdateVoter }) {
  const [copiedField, setCopiedField] = useState(null);
  const [notes, setNotes] = useState(voter?.notes || '');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [isStarred, setIsStarred] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [expandedCard, setExpandedCard] = useState(null);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    setTimeout(() => setAnimateIn(true), 50);
  }, []);

  if (!voter) return null;

  const copyToClipboard = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const toggleVerified = async () => {
    setIsSaving(true);
    await onUpdateVoter(voter.id, { verified: !voter.verified });
    setIsSaving(false);
  };

  const saveNotes = async () => {
    setIsSaving(true);
    await onUpdateVoter(voter.id, { notes });
    setIsSaving(false);
    setIsEditingNotes(false);
  };

  const toggleCard = (cardId) => {
    setExpandedCard(expandedCard === cardId ? null : cardId);
  };

  const tabs = [
    { id: 'details', label: 'Details', icon: <User size={14} /> },
    { id: 'location', label: 'Location', icon: <MapPin size={14} /> },
    { id: 'verification', label: 'Verification', icon: <ShieldCheck size={14} /> },
    { id: 'eslip', label: 'E-Slip', icon: <FileText size={14} /> },
  ];

  return (
    <div className={`voter-profile-page ${animateIn ? 'vp-animate-in' : ''}`} id="theravens-voter-profile">
      {/* Breadcrumb Nav */}
      <div className="vp-breadcrumb">
        <button className="vp-breadcrumb-link" onClick={onBackToVoterList}>Parts</button>
        <ChevronRight size={14} className="vp-breadcrumb-sep" />
        <button className="vp-breadcrumb-link" onClick={onBackToVoterList}>Part #{voter.part_number}</button>
        <ChevronRight size={14} className="vp-breadcrumb-sep" />
        <span className="vp-breadcrumb-current">{voter.name}</span>
      </div>

      {/* Top Action Bar */}
      <div className="vp-action-bar">
        <button className="btn-eci-ghost" onClick={onBackToVoterList}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="vp-action-group">
          <button className={`vp-icon-btn ${isBookmarked ? 'active' : ''}`} onClick={() => setIsBookmarked(!isBookmarked)} title="Bookmark">
            {isBookmarked ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
          </button>
          <button className={`vp-icon-btn ${isStarred ? 'active-star' : ''}`} onClick={() => setIsStarred(!isStarred)} title="Star">
            {isStarred ? <Star size={18} /> : <StarOff size={18} />}
          </button>
          <button className="btn-eci-ghost btn-sm" onClick={() => setShowSlipModal(true)}>
            <Eye size={14} /> Preview E-Slip
          </button>
          <button className="btn-eci-green btn-sm" onClick={() => window.print()}>
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {/* HORIZONTAL LAYOUT */}
      <div className="hp-layout">

        {/* LEFT SIDEBAR — Photo Card */}
        <div className="hp-sidebar">
          <div className={`hp-photo-card ${animateIn ? 'vp-slide-up' : ''}`}>
            <div className="hp-avatar">
              {photoUrl ? <img src={photoUrl} alt={voter.name} /> : <User size={56} style={{ color: 'var(--text-light)' }} />}
            </div>

            <h2 className="hp-voter-name">{voter.name}</h2>

            {/* EPIC with interactive copy */}
            <div className="hp-epic-row">
              <span className="epic-badge epic-badge-lg">{voter.epic || 'NO EPIC'}</span>
              <button
                className={`vp-copy-btn ${copiedField === 'epic' ? 'copied' : ''}`}
                onClick={() => copyToClipboard(voter.epic || '', 'epic')}
              >
                {copiedField === 'epic' ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>

            {/* Quick Stats 2x2 */}
            <div className="hp-quick-stats">
              <div className="hp-stat vp-stat-interactive" onClick={() => copyToClipboard(String(voter.serial || ''), 'serial')} title="Click to copy Serial">
                <span className="hp-stat-label">Serial</span>
                <span className="hp-stat-value hp-stat-violet">#{voter.serial || '--'}</span>
                {copiedField === 'serial' && <span className="vp-copied-toast">Copied!</span>}
              </div>
              <div className="hp-stat vp-stat-interactive" onClick={() => copyToClipboard(String(voter.part_number || ''), 'part')} title="Click to copy Part No">
                <span className="hp-stat-label">Part</span>
                <span className="hp-stat-value">#{voter.part_number || '--'}</span>
                {copiedField === 'part' && <span className="vp-copied-toast">Copied!</span>}
              </div>
              <div className="hp-stat">
                <span className="hp-stat-label">Age</span>
                <span className="hp-stat-value">{voter.age || '--'}</span>
              </div>
              <div className="hp-stat">
                <span className="hp-stat-label">Gender</span>
                <span className="hp-stat-value">{voter.gender || '--'}</span>
              </div>
            </div>

            {/* Verification Status Interactive */}
            <div className="hp-verify-section">
              <span className={`hp-verify-badge ${voter.verified ? 'verified' : 'pending'}`}>
                {voter.verified ? '✓ Verified' : '⚠ Pending'}
              </span>
              <button
                className={`vp-verify-btn ${voter.verified ? 'verified' : ''}`}
                onClick={toggleVerified}
                disabled={isSaving}
              >
                <ShieldCheck size={14} />
                {isSaving ? 'Saving...' : voter.verified ? 'Unverify Elector' : 'Mark as Verified'}
              </button>
            </div>

            {/* Quick Actions */}
            <div className="vp-quick-actions">
              <button className="vp-quick-action" onClick={() => setActiveTab('eslip')}>
                <FileText size={14} /> View E-Slip
              </button>
              <button className="vp-quick-action" onClick={() => setActiveTab('location')}>
                <MapPin size={14} /> Location
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT MAIN — Tabbed Content */}
        <div className="hp-main">

          {/* Tab Navigation */}
          <div className="vp-tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`vp-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* TAB: Details */}
          {activeTab === 'details' && (
            <div className="vp-tab-content vp-fade-in">
              <div className="hp-detail-box">
                <div className="vp-box-header" onClick={() => toggleCard('elector')}>
                  <h3 className="hp-box-title" style={{ border: 'none', margin: 0, padding: 0 }}>
                    <User size={16} className="icon-violet" /> Elector Particulars
                  </h3>
                  {expandedCard === 'elector' ? <Minimize2 size={16} className="vp-toggle-icon" /> : <Maximize2 size={16} className="vp-toggle-icon" />}
                </div>

                <div className={`vp-expandable ${expandedCard === 'elector' ? '' : 'expanded'}`}>
                  <div className="hp-fields-grid" style={{ marginTop: '1rem' }}>
                    <div className="hp-field vp-field-interactive" onClick={() => copyToClipboard(voter.name || '', 'name')}>
                      <span className="hp-field-label">Full Name</span>
                      <span className="hp-field-value">{voter.name}</span>
                      {copiedField === 'name' && <span className="vp-field-copied">✓</span>}
                    </div>
                    <div className="hp-field vp-field-interactive" onClick={() => copyToClipboard(voter.relation_name || '', 'relation')}>
                      <span className="hp-field-label">{voter.relation_type || 'Relative'} Name</span>
                      <span className="hp-field-value">{voter.relation_name || 'N/A'}</span>
                      {copiedField === 'relation' && <span className="vp-field-copied">✓</span>}
                    </div>
                    <div className="hp-field">
                      <span className="hp-field-label">Gender</span>
                      <span className="hp-field-value">
                        <span className={`vp-gender-dot ${(voter.gender || '').toUpperCase().startsWith('M') ? 'male' : 'female'}`} />
                        {voter.gender || 'N/A'}
                      </span>
                    </div>
                    <div className="hp-field">
                      <span className="hp-field-label">Age</span>
                      <span className="hp-field-value">
                        {voter.age ? (
                          <>
                            <span className="vp-age-number">{voter.age}</span>
                            <span className="vp-age-unit">years</span>
                          </>
                        ) : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Admin Notes */}
              <div className="hp-detail-box">
                <div className="vp-box-header">
                  <h3 className="hp-box-title" style={{ border: 'none', margin: 0, padding: 0 }}>
                    <FileText size={16} className="icon-violet" /> Notes
                  </h3>
                  {!isEditingNotes && (
                    <button className="btn-eci-ghost btn-xs" onClick={() => setIsEditingNotes(true)}>
                      <Edit3 size={12} /> Edit
                    </button>
                  )}
                </div>
                {isEditingNotes ? (
                  <div style={{ marginTop: '0.75rem' }}>
                    <textarea className="eci-input vp-notes-textarea" rows="4" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add field notes, survey details..." />
                    <div className="vp-notes-actions">
                      <span className="vp-char-count">{notes.length} chars</span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn-eci-ghost btn-xs" onClick={() => setIsEditingNotes(false)}>Cancel</button>
                        <button className="btn-eci-blue btn-xs" onClick={saveNotes} disabled={isSaving}>
                          {isSaving ? 'Saving...' : 'Save Notes'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className={`vp-notes-display ${!voter.notes ? 'empty' : ''}`}>
                    {voter.notes || 'No notes added yet. Click Edit to add field observations.'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB: Location */}
          {activeTab === 'location' && (
            <div className="vp-tab-content vp-fade-in">
              <div className="hp-detail-box">
                <h3 className="hp-box-title">
                  <MapPin size={16} className="icon-cyan" /> Location & Residence
                </h3>
                <div className="hp-fields-grid">
                  <div className="hp-field vp-field-interactive" onClick={() => copyToClipboard(voter.house_number || '', 'house')}>
                    <span className="hp-field-label">House Number</span>
                    <span className="hp-field-value hp-field-highlight">
                      <Home size={14} /> H.No {voter.house_number || 'N/A'}
                    </span>
                    {copiedField === 'house' && <span className="vp-field-copied">✓</span>}
                  </div>
                  <div className="hp-field vp-field-interactive" onClick={() => copyToClipboard(voter.constituency || '', 'const')}>
                    <span className="hp-field-label">Assembly Constituency</span>
                    <span className="hp-field-value">{voter.constituency || '—'}</span>
                    {copiedField === 'const' && <span className="vp-field-copied">✓</span>}
                  </div>
                  <div className="hp-field hp-field-full">
                    <span className="hp-field-label">Section / Locality</span>
                    <span className="hp-field-value">{voter.section_name || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Polling Station Info */}
              <div className="hp-detail-box vp-polling-card">
                <h3 className="hp-box-title">
                  <Activity size={16} className="icon-emerald" /> Polling Station Assignment
                </h3>
                <div className="vp-polling-info">
                  <div className="vp-polling-badge">
                    <span className="vp-polling-number">#{voter.part_number || '15'}</span>
                    <span className="vp-polling-label">Part No</span>
                  </div>
                  <div>
                    <p className="vp-polling-name">
                      அரசு உயர்நிலைப்பள்ளி, {voter.section_name ? voter.section_name.split(',')[0] : 'பென்னாகரம்'} – 636809
                    </p>
                    <p className="vp-polling-detail">
                      {voter.constituency || '58-பென்னாகரம்'} • Part #{voter.part_number} • Booth #{voter.serial ? Math.ceil(voter.serial / 400) : 1}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Verification */}
          {activeTab === 'verification' && (
            <div className="vp-tab-content vp-fade-in">
              <div className="hp-detail-box">
                <h3 className="hp-box-title">
                  <ShieldCheck size={16} className="icon-emerald" /> Verification Status
                </h3>

                <div className="vp-verification-panel">
                  <div className={`vp-verification-indicator ${voter.verified ? 'verified' : 'pending'}`}>
                    <ShieldCheck size={32} />
                    <div>
                      <h4>{voter.verified ? 'Verified Official Elector' : 'Pending Verification'}</h4>
                      <p>{voter.verified ? 'This elector has been verified through field survey.' : 'This elector has not yet been field-verified.'}</p>
                    </div>
                  </div>

                  <button
                    className={`vp-verify-btn-lg ${voter.verified ? 'verified' : ''}`}
                    onClick={toggleVerified}
                    disabled={isSaving}
                  >
                    <ShieldCheck size={18} />
                    {isSaving ? 'Processing...' : voter.verified ? 'Remove Verification' : 'Verify This Elector'}
                  </button>
                </div>
              </div>

              {/* Activity Timeline */}
              <div className="hp-detail-box">
                <h3 className="hp-box-title">
                  <Clock size={16} className="icon-violet" /> Activity Timeline
                </h3>
                <div className="vp-timeline">
                  <div className="vp-timeline-item">
                    <div className="vp-timeline-dot active" />
                    <div className="vp-timeline-content">
                      <span className="vp-timeline-time">Today</span>
                      <span className="vp-timeline-text">Profile viewed via TheRavens Portal</span>
                    </div>
                  </div>
                  <div className="vp-timeline-item">
                    <div className="vp-timeline-dot" />
                    <div className="vp-timeline-content">
                      <span className="vp-timeline-time">Electoral Roll</span>
                      <span className="vp-timeline-text">Record imported from Supabase database</span>
                    </div>
                  </div>
                  <div className="vp-timeline-item">
                    <div className="vp-timeline-dot" />
                    <div className="vp-timeline-content">
                      <span className="vp-timeline-time">Registration</span>
                      <span className="vp-timeline-text">Elector enrolled in Part #{voter.part_number}, Serial #{voter.serial}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: E-Slip */}
          {activeTab === 'eslip' && (
            <div className="vp-tab-content vp-fade-in">
              <div className="vp-eslip-actions">
                <button className="btn-eci-green btn-sm" onClick={() => window.print()}>
                  <Printer size={14} /> Print E-Slip
                </button>
                <button className="btn-eci-blue btn-sm" onClick={() => setShowSlipModal(true)}>
                  <Maximize2 size={14} /> Fullscreen Preview
                </button>
              </div>
              <div className="hp-detail-box" style={{ padding: 0, overflow: 'hidden' }}>
                <PrintableSlip voter={voter} photoUrl={photoUrl} isEmbedded={true} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen E-Slip Modal */}
      {showSlipModal && (
        <PrintableSlip voter={voter} photoUrl={photoUrl} onClose={() => setShowSlipModal(false)} />
      )}
    </div>
  );
}
