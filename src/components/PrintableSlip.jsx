import React, { useState } from 'react';
import { User, Printer, X, Feather, QrCode, Copy, Check, ShieldCheck, Download, ExternalLink } from 'lucide-react';

export default function PrintableSlip({ voter, photoUrl, station, onClose, isEmbedded = false }) {
  const [copiedField, setCopiedField] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);

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
    `Constituency: ${voter.constituency || '58 - பென்னாகரம்'}`,
    `Verification: ${voter.verified ? 'VERIFIED' : 'PENDING'}`
  ].join('\n');

  // Medium-sized high-resolution scannable QR Code URL
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrPayload)}`;

  const handleCopy = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const slipContent = (
    <div className="official-slip-card" id="official-voter-slip">
      {/* Top Security Accent Ribbon */}
      {voter.is_deleted ? (
        <div className="slip-deleted-ribbon">
          <span>⚠️ DELETED VOTER: {voter.deletion_reason || 'Shifted / Relocated / Expired'}</span>
        </div>
      ) : (
        <div className="slip-security-ribbon">
          <span><ShieldCheck size={13} /> OFFICIAL ECI VOTER INFORMATION SLIP</span>
          <span style={{ fontSize: '0.68rem', opacity: 0.9 }}>CONST. 58 - பென்னாகரம்</span>
        </div>
      )}

      {/* Header */}
      <div className="official-slip-header">
        <div className="slip-emblem-logo">
          <Feather size={22} className="text-violet-400" />
        </div>
        <div className="slip-header-titles">
          <h2>TheRavens Electoral Systems</h2>
          <h3>தேர்தல் ஆணையம் • Official Voter Information Slip</h3>
          <p>Assembly Constituency: <strong>{voter.constituency || '58 – Pennagaram'}</strong></p>
        </div>
        <div className="slip-header-actions no-print">
          <button 
            className="btn-slip-action" 
            title="Copy All Slip Details"
            onClick={() => handleCopy(qrPayload, 'full')}
          >
            {copiedField === 'full' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            <span>{copiedField === 'full' ? 'Copied!' : 'Copy'}</span>
          </button>
          <button 
            className="btn-slip-action btn-slip-print" 
            title="Print E-Slip"
            onClick={() => window.print()}
          >
            <Printer size={14} />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Grid Body */}
      <div className="official-slip-grid">
        {/* Left Photo & EPIC */}
        <div className="slip-photo-col">
          <div className="slip-photo-box">
            {photoUrl ? (
              <img src={photoUrl} alt={voter.name} />
            ) : (
              <User size={46} color="#94a3b8" />
            )}
          </div>
          <div 
            className="slip-epic-title interactive-copy"
            title="Click to copy EPIC ID"
            onClick={() => handleCopy(voter.epic, 'epic')}
          >
            <span>{voter.epic || 'NO EPIC'}</span>
            {copiedField === 'epic' ? <Check size={12} className="text-emerald-500" /> : <Copy size={11} className="copy-icon-hover" />}
          </div>
          <div className="slip-barcode-sim">
            <div className="barcode-bars" />
            <span className="barcode-text">{voter.epic || voter.id?.slice(0, 10)}</span>
          </div>
        </div>

        {/* Middle Elector Details */}
        <div className="slip-details-col">
          <div 
            className="slip-field interactive-copy"
            onClick={() => handleCopy(voter.name, 'name')}
            title="Click to copy name"
          >
            <span className="lbl">Elector Name</span>
            <span className="val slip-name-highlight">
              {voter.name}
              {copiedField === 'name' && <span className="copy-toast">Copied!</span>}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <div className="slip-field">
              <span className="lbl">{voter.relation_type || 'Relative'} Name</span>
              <span className="val">{voter.relation_name || 'N/A'}</span>
            </div>
            <div className="slip-field">
              <span className="lbl">Age / Gender</span>
              <span className="val">{voter.age || '--'} Yrs / {voter.gender || '--'}</span>
            </div>
          </div>

          <div className="slip-field">
            <span className="lbl">Address & Section</span>
            <span className="val">H.No {voter.house_number || 'N/A'}, {voter.section_name || '—'}</span>
          </div>

          <div className="slip-field">
            <span className="lbl">Polling Station & Address</span>
            <span className="val station-address-text">
              {station?.name || `அரசு உயர்நிலைப்பள்ளி, ${voter.section_name ? voter.section_name.split(',')[0] : 'பென்னாகரம்'} - 636809`}
            </span>
          </div>
        </div>

        {/* Right Scannable QR Code */}
        <div className="slip-qr-column">
          <div 
            className="slip-qr-box interactive-qr"
            onClick={() => setShowQrModal(true)}
            title="Click to enlarge & scan high-res QR"
          >
            <img
              src={qrImageUrl}
              alt={`QR Code for ${voter.name}`}
              width="118"
              height="118"
              style={{ display: 'block', borderRadius: '6px' }}
            />
            <div className="qr-overlay-hover">
              <ExternalLink size={16} />
              <span>Enlarge</span>
            </div>
          </div>
          <span className="slip-qr-label" onClick={() => setShowQrModal(true)}>
            <QrCode size={11} className="icon-violet" /> Scan / Enlarge
          </span>
        </div>
      </div>

      {/* Footer Bar */}
      <div className="official-slip-footer">
        <span className="footer-brand">
          <ShieldCheck size={12} className="text-emerald-500" /> TheRavens Electoral Systems • Real DB Data
        </span>
        <span className="footer-timestamp">
          Generated: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      </div>

      {/* High Resolution Zoom QR Modal */}
      {showQrModal && (
        <div className="qr-zoom-modal-overlay" onClick={() => setShowQrModal(false)}>
          <div className="qr-zoom-card" onClick={(e) => e.stopPropagation()}>
            <div className="qr-zoom-header">
              <h4>Scannable Elector QR Code</h4>
              <button onClick={() => setShowQrModal(false)}><X size={16} /></button>
            </div>
            <div className="qr-zoom-body">
              <img src={qrImageUrl} alt="QR Code" width="240" height="240" />
              <div className="qr-zoom-info">
                <p><strong>{voter.name}</strong> ({voter.epic})</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Scan with any mobile QR scanner to view complete elector credentials.</p>
              </div>
            </div>
          </div>
        </div>
      )}
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
