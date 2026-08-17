import React, { useState } from 'react';
import { ArrowLeft, Search, ChevronRight, CheckCircle2, Users, UserX, AlertTriangle } from 'lucide-react';
import { ECIPdfHeader, ECIPdfBottomSummary } from './ECIPdfHeaderSummary';

export default function ECIVoterTable({
  partNumber,
  voters,
  partDetails,
  electorCounts,
  photosMap: _photosMap,
  onBackToParts,
  onOpenVoterProfilePage
}) {
  const [voterSearch, setVoterSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 50;

  const filtered = voters.filter((v) => {
    if (!voterSearch.trim()) return true;
    const q = voterSearch.toLowerCase();
    return (
      (v.name || '').toLowerCase().includes(q) ||
      (v.epic || '').toLowerCase().includes(q) ||
      (v.house_number || '').toLowerCase().includes(q) ||
      String(v.serial || '').includes(q) ||
      (v.relation_name || '').toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
  const first = voters[0] || {};

  // Find the elector count for this specific part
  const partCountData = electorCounts.find(ec => String(ec['பாகம்_எண்']) === String(partNumber));
  const maleCount = partCountData ? partCountData['ஆண்'] : voters.filter(v => (v.gender || '').toUpperCase().startsWith('M')).length;
  const femaleCount = partCountData ? partCountData['பெண்'] : voters.filter(v => (v.gender || '').toUpperCase().startsWith('F')).length;

  return (
    <div className="voter-page-container" id="theravens-voter-page">
      {/* Top Nav Bar */}
      <div className="page-nav-bar">
        <button className="btn-eci-ghost" onClick={onBackToParts}>
          <ArrowLeft size={16} /> Back to Parts List
        </button>
        <div className="search-inline">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search name, EPIC, house no..."
            value={voterSearch}
            onChange={(e) => { setVoterSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>
      </div>

      {/* Part Info Banner */}
      <div className="page-info-banner">
        <div className="banner-left">
          <div className="part-number-badge part-number-badge-lg">#{partNumber}</div>
          <div>
            <h2 className="banner-title">Part {partNumber} — Electoral Roll Directory</h2>
            <p className="banner-subtitle">
              {first.constituency || '—'} • {first.section_name || '—'}
            </p>
          </div>
        </div>
        <div className="banner-right">
          <div className="banner-stat">
            <span className="stat-label">Total Voters</span>
            <span className="stat-value">{filtered.length}</span>
          </div>
          <div className="banner-stat">
            <span className="gender-male">{maleCount} M</span>
            <span className="gender-divider">/</span>
            <span className="gender-female">{femaleCount} F</span>
          </div>
        </div>
      </div>

      {/* ====== 1. TOP PDF COVER & REVISION DETAILS BOX (Matching Image 1) ====== */}
      <ECIPdfHeader 
        partNumber={partNumber} 
        voters={voters} 
        partDetails={partDetails} 
        electorCounts={electorCounts} 
      />

      {/* ====== 2. ELECTORAL ROLL VOTER DIRECTORY TABLE ====== */}
      <div className="eci-voters-table-wrapper" style={{ marginTop: '1.25rem' }}>
        <div className="eci-table-title-bar">
          <span>வாக்காளர் பட்டியல் — 58 - பென்னாகரம் • பாகம் எண் #{partNumber}</span>
          <span style={{ fontSize: '0.78rem', opacity: 0.8 }}>Showing {filtered.length} Voters</span>
        </div>
        <table className="eci-voters-table">
          <thead>
            <tr>
              <th>S.No</th>
              <th>EPIC</th>
              <th>Elector Name</th>
              <th>Relative</th>
              <th>House</th>
              <th>Age/Gender</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan="8" className="empty-state-cell">
                  No voters match your search criteria.
                </td>
              </tr>
            ) : (
              paginated.map((voter, idx) => (
                <tr
                  key={voter.id}
                  className={voter.is_deleted ? 'row-deleted' : ''}
                  onClick={() => onOpenVoterProfilePage(voter)}
                  style={{ animationDelay: `${idx * 15}ms` }}
                >
                  <td className="cell-serial">#{voter.serial || '--'}</td>
                  <td>
                    <span className="epic-badge">{voter.epic || 'N/A'}</span>
                  </td>
                  <td className="cell-name">
                    <span className={voter.is_deleted ? 'name-deleted-text' : ''}>
                      {voter.name}
                    </span>
                    {voter.is_deleted && (
                      <span className="deleted-tag-inline" title={voter.deletion_reason || 'Deleted Voter'}>
                        <UserX size={10} /> {voter.deletion_reason ? voter.deletion_reason.split(',')[0] : 'Deleted'}
                      </span>
                    )}
                  </td>
                  <td className="cell-muted">
                    <span className="relation-type">{voter.relation_type}</span> {voter.relation_name || '—'}
                  </td>
                  <td className="cell-muted">{voter.house_number || '—'}</td>
                  <td>
                    <span className="age-gender">{voter.age || '--'} / {voter.gender || '--'}</span>
                  </td>
                  <td>
                    {voter.is_deleted ? (
                      <span className="status-deleted" title={voter.deletion_reason || 'Deleted Voter'}>
                        <UserX size={12} /> {voter.deletion_reason ? (voter.deletion_reason.includes('Shifted') ? 'Shifted' : voter.deletion_reason.includes('Expired') ? 'Expired' : 'Deleted') : 'Deleted'}
                      </span>
                    ) : voter.verified ? (
                      <span className="status-verified"><CheckCircle2 size={13} /> Verified</span>
                    ) : (
                      <span className="status-pending">Pending</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className={voter.is_deleted ? 'btn-eci-ghost btn-sm btn-deleted-profile' : 'btn-eci-blue btn-sm'}
                      onClick={(e) => { e.stopPropagation(); onOpenVoterProfilePage(voter); }}
                    >
                      Profile <ChevronRight size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination-bar">
          <span className="pagination-info">
            Showing {((currentPage - 1) * perPage) + 1}–{Math.min(currentPage * perPage, filtered.length)} of {filtered.length}
          </span>
          <div className="pagination-buttons">
            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="btn-eci-ghost btn-sm">Prev</button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let page;
              if (totalPages <= 7) {
                page = i + 1;
              } else if (currentPage <= 4) {
                page = i + 1;
              } else if (currentPage >= totalPages - 3) {
                page = totalPages - 6 + i;
              } else {
                page = currentPage - 3 + i;
              }
              return (
                <button
                  key={page}
                  className={`btn-page ${currentPage === page ? 'btn-page-active' : ''}`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              );
            })}
            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="btn-eci-ghost btn-sm">Next</button>
          </div>
        </div>
      )}

      {/* ====== 3. BOTTOM PDF SUMMARY DETAILS BOX (Matching Image 2) ====== */}
      <ECIPdfBottomSummary partNumber={partNumber} voters={voters} />
    </div>
  );
}
