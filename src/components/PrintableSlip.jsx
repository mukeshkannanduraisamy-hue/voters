import React from 'react';
import { User, Printer, X, Feather, QrCode } from 'lucide-react';

export default function PrintableSlip({ voter, photoUrl, station, onClose, isEmbedded = false }) {
  if (!voter) return null;

  // Real voter payload for scanning
  const qrPayload = [
    `TheRavens Electoral Directory`,
    `=============================`,
    `EPIC: ${voter.epic || 'N/A'}`,
    `Elector Name: ${voter.name || 'N/A'}`,
    `${voter.relation_type || 'Relative'}: ${voter.relation_name || 'N/A'}`,
    `Age/Gender: ${voter.age || '--'} Yrs / ${voter.gender || '--'}`,
    `House No: H.No ${voter.house_number || 'N/A'}`,
    `Section: ${voter.section_name || '—'}`,
    `Constituency: ${voter.constituency || '58 - Pennagaram'}`,
    `Verification: ${voter.verified ? 'VERIFIED' : 'PENDING'}`
  ].join('\n');

  // Medium-sized high-resolution scannable QR Code URL
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrPayload)}`;

  const slipContent = (
    <div className="official-slip-card" id="official-voter-slip">
      {/* Header */}
      <div className="official-slip-header">
        <div className="slip-emblem-logo"><Feather size={20} /></div>
        <div className="slip-header-titles">
          <h2>TheRavens Electoral Systems</h2>
          <h3>Official Voter Information Slip</h3>
          <p>Assembly Constituency: {voter.constituency || '58 – Pennagaram'}</p>
        </div>
      </div>

      {/* Grid Body */}
      <div className="official-slip-grid">
        {/* Left Photo & EPIC */}
        <div className="slip-photo-col">
          <div className="slip-photo-box">
            {photoUrl ? <img src={photoUrl} alt={voter.name} /> : <User size={42} color="#94a3b8" />}
          </div>
          <div className="slip-epic-title">
            {voter.epic || 'NO EPIC'}
          </div>
          <div style={{ marginTop: '0.35rem', textAlign: 'center' }}>
            <div style={{ height: '14px', background: 'repeating-linear-gradient(90deg, #1e1b4b 0, #1e1b4b 2px, #fff 2px, #fff 4px)', borderRadius: '2px' }} />
            <span style={{ fontSize: '0.58rem', color: '#94a3b8', letterSpacing: '0.08em' }}>{voter.epic || voter.id}</span>
          </div>
        </div>

        {/* Middle Elector Details */}
        <div className="slip-details-col">
          <div className="slip-field">
            <span className="lbl">Elector Name</span>
            <span className="val slip-name-highlight">{voter.name}</span>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <div className="slip-field">
              <span className="lbl">{voter.relation_type || 'Relative'} Name</span>
              <span className="val">{voter.relation_name || 'N/A'}</span>
            </div>
            <div className="slip-field">
              <span className="lbl">Age / Gender</span>
              <span className="val">{voter.age || '--'} yrs / {voter.gender || '--'}</span>
            </div>
          </div>
          <div className="slip-field">
            <span className="lbl">Address & Section</span>
            <span className="val">H.No {voter.house_number || 'N/A'}, {voter.section_name || '—'}</span>
          </div>
          <div className="slip-field">
            <span className="lbl">Polling Station</span>
            <span className="val" style={{ fontSize: '0.78rem', color: '#475569' }}>
              {station?.name || `அரசு உயர்நிலைப்பள்ளி, ${voter.section_name ? voter.section_name.split(',')[0] : 'பென்னாகரம்'} - 636809`}
            </span>
          </div>
        </div>

        {/* Right Medium Scannable QR Code */}
        <div className="slip-qr-column">
          <div className="slip-qr-box">
            <img
              src={qrImageUrl}
              alt={`QR Code for ${voter.name}`}
              width="115"
              height="115"
              style={{ display: 'block', borderRadius: '4px' }}
            />
          </div>
          <span className="slip-qr-label">
            <QrCode size={11} className="icon-violet" /> Scan for Info
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="official-slip-footer">
        <span>TheRavens Electoral Systems • Scan Matrix v2.6</span>
        <span>Generated: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
      </div>
    </div>
  );

  if (isEmbedded) return slipContent;

  return (
    <div className="eci-modal-overlay" onClick={onClose}>
      <div className="eci-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="eci-modal-header">
          <h3><Feather size={16} /> TheRavens Official E-Slip</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button className="btn-eci-green btn-sm" onClick={() => window.print()}>
              <Printer size={14} /> Print
            </button>
            <button className="eci-modal-close" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="eci-modal-body">{slipContent}</div>
      </div>
    </div>
  );
}
