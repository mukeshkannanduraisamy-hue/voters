import React, { useMemo } from 'react';
import { ChevronRight, Layers } from 'lucide-react';

export default function ECIPartTable({ filteredVoters, onOpenPartVotersPage }) {
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

  return (
    <div id="theravens-part-section">
      {/* Part Table */}
      <div className="part-table-wrapper" style={{ marginTop: 0 }}>
        <div className="part-table-header">
          <span>Part No & Polling Station</span>
          <span>Electors</span>
          <span>Male / Female</span>
          <span style={{ textAlign: 'right' }}>Action</span>
        </div>

        <div className="part-rows-list">
          {partsSummary.length === 0 ? (
            <div className="empty-state">
              <Layers size={40} style={{ opacity: 0.3 }} />
              <p>No parts match your current filters.</p>
            </div>
          ) : (
            partsSummary.map((pt, idx) => (
              <div
                key={pt.part_number}
                className="part-row"
                onClick={() => onOpenPartVotersPage(pt.part_number)}
                style={{ animationDelay: `${idx * 40}ms` }}
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
    </div>
  );
}
