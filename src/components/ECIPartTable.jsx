import React, { useState, useMemo, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Layers } from 'lucide-react';

export default function ECIPartTable({ filteredVoters, onOpenPartVotersPage }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const partsSummary = useMemo(() => {
    const map = {};
    filteredVoters.forEach((v) => {
      const pn = v.part_number ? String(v.part_number) : '0';
      if (!map[pn]) {
        map[pn] = {
          part_number: pn,
          constituency: v.constituency || '--',
          section_name: v.section_name || '--',
          voters: [],
          male: 0,
          female: 0,
        };
      }
      map[pn].voters.push(v);
      const g = (v.gender || '').toUpperCase();
      if (g.startsWith('M')) map[pn].male++;
      else if (g.startsWith('F')) map[pn].female++;
    });
    return Object.values(map).sort((a, b) => parseInt(a.part_number) - parseInt(b.part_number));
  }, [filteredVoters]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredVoters]);

  const totalItems = partsSummary.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  
  const paginatedParts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return partsSummary.slice(start, start + pageSize);
  }, [partsSummary, currentPage, pageSize]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div id="theravens-part-section">
      {/* Top Table Control Bar */}
      <div className="part-table-control-bar">
        <div className="table-stats-info">
          <span>
            Showing <strong>{startItem}</strong>–<strong>{endItem}</strong> of <strong>{totalItems}</strong> Polling Station Parts
          </span>
        </div>

        <div className="table-pagination-actions">
          {/* Rows Per Page */}
          <div className="page-size-selector">
            <span>Show:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>

          {/* Page Buttons */}
          <div className="pagination-nav">
            <button
              className="btn-page-nav"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              title="Previous Page"
            >
              <ChevronLeft size={16} /> Prev
            </button>

            <div className="page-number-pills">
              {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((p) => (
                <button
                  key={p}
                  className={`btn-page-pill ${p === currentPage ? 'active' : ''}`}
                  onClick={() => setCurrentPage(p)}
                >
                  {p}
                </button>
              ))}
            </div>

            <button
              className="btn-page-nav"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              title="Next Page"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Part Table */}
      <div className="part-table-wrapper" style={{ marginTop: '0.75rem' }}>
        <div className="part-table-header">
          <span>Part No & Polling Station</span>
          <span>Electors</span>
          <span>Male / Female</span>
          <span style={{ textAlign: 'right' }}>Action</span>
        </div>

        <div className="part-rows-list">
          {paginatedParts.length === 0 ? (
            <div className="empty-state">
              <Layers size={40} style={{ opacity: 0.3 }} />
              <p>No polling station parts match your current filters.</p>
            </div>
          ) : (
            paginatedParts.map((pt, idx) => (
              <div
                key={pt.part_number}
                className="part-row"
                onClick={() => onOpenPartVotersPage(pt.part_number)}
                style={{ animationDelay: `${idx * 30}ms` }}
              >
                <div className="part-row-cell part-row-main">
                  <div className="part-number-badge">#{pt.part_number}</div>
                  <div>
                    <div className="part-title-text">{pt.section_name}</div>
                    <div className="part-sub-text">{pt.constituency}</div>
                  </div>
                </div>

                <div className="part-row-cell">
                  <span className="part-voters-badge">
                    {pt.voters.length.toLocaleString()}
                  </span>
                </div>

                <div className="part-row-cell part-gender-split">
                  <span className="gender-male">{pt.male} M</span>
                  <span className="gender-divider">/</span>
                  <span className="gender-female">{pt.female} F</span>
                </div>

                <div className="part-row-cell" style={{ textAlign: 'right' }}>
                  <button
                    className="btn-eci-blue btn-sm"
                    onClick={(e) => { e.stopPropagation(); onOpenPartVotersPage(pt.part_number); }}
                  >
                    View Voters <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Bottom Pagination Bar */}
      {totalPages > 1 && (
        <div className="part-table-footer-pagination">
          <span>Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong></span>
          <div className="pagination-nav">
            <button
              className="btn-page-nav"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <button
              className="btn-page-nav"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
