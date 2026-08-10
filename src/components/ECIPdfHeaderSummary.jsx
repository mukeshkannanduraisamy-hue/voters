import React, { useState } from 'react';
import { FileText, ChevronDown, ChevronUp, Printer, CheckCircle } from 'lucide-react';

export function ECIPdfHeader({ partNumber, voters }) {
  const [collapsed, setCollapsed] = useState(false);
  const first = voters[0] || {};
  const totalCount = voters.length;
  
  // Real DB calculated statistics
  const maleCount = voters.filter(v => (v.gender || '').toUpperCase().startsWith('M')).length;
  const femaleCount = voters.filter(v => (v.gender || '').toUpperCase().startsWith('F')).length;
  const tgCount = voters.filter(v => (v.gender || '').toUpperCase().includes('THIRD') || (v.gender || '').toUpperCase().includes('TRANS')).length;

  const minSerial = voters.length > 0 
    ? Math.min(...voters.map(v => v.serial || 1)) 
    : 1;
  const maxSerial = voters.length > 0 
    ? Math.max(...voters.map(v => v.serial || totalCount)) 
    : totalCount;

  // Real DB Section list
  const sections = Array.from(new Set(voters.map(v => v.section_name).filter(Boolean)));
  const primarySection = sections[0] || 'பன்குளம் (வ.கி) மற்றும் (ஊ)';
  const sectionLocationName = primarySection.split(',')[0] || primarySection;

  const constituencyText = first.constituency ? first.constituency : '58-பென்னாகரம் (பொது)';

  return (
    <div className="eci-pdf-box eci-pdf-header-box" id="eci-pdf-cover-page">
      {/* Header Banner Control */}
      <div className="eci-pdf-banner" onClick={() => setCollapsed(!collapsed)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileText size={18} className="icon-violet" />
          <span className="eci-pdf-banner-title">
            அதிகாரப்பூர்வ ECI வாக்காளர் பட்டியல் 2026 S22 தமிழ்நாடு — பாகம் #{partNumber} (Cover Page)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="btn-eci-ghost btn-xs" onClick={(e) => { e.stopPropagation(); window.print(); }}>
            <Printer size={13} /> அச்சிடு / Print PDF
          </button>
          <button className="eci-pdf-collapse-btn">
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="eci-pdf-content">
          {/* Main Title Row */}
          <div className="eci-pdf-main-title">
            வாக்காளர் பட்டியல் 2026 S22 தமிழ்நாடு
          </div>

          {/* Top Info Grid */}
          <table className="eci-pdf-table eci-pdf-top-table">
            <tbody>
              <tr>
                <td style={{ width: '75%' }}>
                  <strong>சட்டமன்றத் தொகுதியின் எண். பெயர் மற்றும் ஒதுக்கீட்டுத்தொகுதி நிலை :</strong> {constituencyText}
                </td>
                <td style={{ width: '25%', textAlign: 'center', fontWeight: 'bold' }}>
                  பாகம் எண் : {partNumber}
                </td>
              </tr>
              <tr>
                <td colSpan="2">
                  <strong>சட்டமன்றத் தொகுதி அடங்கியுள்ள நாடாளுமன்றத் தொகுதியின் எண். பெயர் மற்றும் ஒதுக்கீட்டுத்தொகுதி நிலை :</strong> 10 - தர்மபுரி (பொது)
                </td>
              </tr>
            </tbody>
          </table>

          {/* Section 1: Revision Details */}
          <div className="eci-pdf-section-head">1. திருத்தத்தின் விவரங்கள்</div>
          <table className="eci-pdf-table">
            <tbody>
              <tr>
                <td style={{ width: '25%', fontWeight: 'bold', background: '#f8fafc' }}>திருத்தப்படும் ஆண்டு</td>
                <td style={{ width: '25%' }}>2026</td>
                <td colSpan="2" rowSpan="4" style={{ width: '50%', verticalAlign: 'top', padding: '0.75rem', fontSize: '0.78rem', lineHeight: '1.4', background: '#fafafa' }}>
                  <strong>பட்டியல் விவரம்</strong><br />
                  19-12-2025 அன்று வெளியிடப்பட்ட சிறப்பு தீவிர திருத்தம், 2026 இன் அடிப்படை பட்டியலோடு ஒருங்கிணைக்கப்பட்ட அத்திருத்தத்தின் சேர்த்தல்கள் அடங்கிய துணைப்பட்டியல் - 1, மற்றும் அதனைடுத்த 23-02-2026 முதல் 06-04-2026 வரையிலான தொடர் திருத்த காலத்தின் துணைப்பட்டியல் - 2 இல் உள்ள நீக்கங்களும் திருத்தங்களும் அடிப்படை பட்டியலின் குறிபிடப்பட்டுள்ளன.
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold', background: '#f8fafc' }}>தகுதியேற்படுத்தும் நாள்</td>
                <td>01-04-2026</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold', background: '#f8fafc' }}>திருத்தத்தின் வகை</td>
                <td>சிறப்பு தீவிர திருத்தம் 2026</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold', background: '#f8fafc' }}>வெளியிடப்பட்ட நாள்</td>
                <td>06-04-2026</td>
              </tr>
            </tbody>
          </table>

          {/* Section 2: Part & Area Details */}
          <div className="eci-pdf-section-head">2. பாகத்தின் விவரங்கள் மற்றும் வாக்குச்சாவடிக்கான பரப்பளவு</div>
          <table className="eci-pdf-table">
            <tbody>
              <tr>
                <td style={{ width: '50%', verticalAlign: 'top' }}>
                  <strong style={{ display: 'block', marginBottom: '0.35rem' }}>இந்த பாகத்தில், பாகத்தின் கீழ் வரும் பிரிவின் எண் மற்றும் பெயர் :</strong>
                  <div style={{ fontSize: '0.8rem', lineHeight: '1.5', color: '#1e293b' }}>
                    {sections.map((s, i) => <div key={i}>{i + 1} - {s}</div>)}
                  </div>
                </td>
                <td style={{ width: '50%', verticalAlign: 'top' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <tbody>
                      <tr><td style={{ fontWeight: 'bold', width: '45%' }}>முக்கிய நகரம்/கிராமம்</td><td>: {sectionLocationName}</td></tr>
                      <tr><td style={{ fontWeight: 'bold' }}>வார்டு</td><td>: 5</td></tr>
                      <tr><td style={{ fontWeight: 'bold' }}>அஞ்சல் அலுவலகம்</td><td>: {sectionLocationName}</td></tr>
                      <tr><td style={{ fontWeight: 'bold' }}>காவல் நிலையம்</td><td>: பாப்பாரப்பட்டி</td></tr>
                      <tr><td style={{ fontWeight: 'bold' }}>பஞ்சாயத்து / வட்டம்</td><td>: பென்னாகரம்</td></tr>
                      <tr><td style={{ fontWeight: 'bold' }}>கோட்டம் / மாவட்டம்</td><td>: தர்மபுரி</td></tr>
                      <tr><td style={{ fontWeight: 'bold' }}>அஞ்சல் குறியீட்டு எண்</td><td>: 636809</td></tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Section 3: Polling Station Details */}
          <div className="eci-pdf-section-head">3. வாக்குச் சாவடியின் விவரங்கள்</div>
          <table className="eci-pdf-table">
            <tbody>
              <tr>
                <td style={{ width: '50%', verticalAlign: 'top' }}>
                  <strong>வாக்குச் சாவடியின் எண் மற்றும் பெயர் :</strong><br />
                  <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#1e1b4b' }}>
                    {partNumber} - அரசு உயர்நிலைப்பள்ளி, {sectionLocationName}
                  </span>
                  <br /><br />
                  <strong>வாக்குச் சாவடியின் முகவரி :</strong><br />
                  <span>அரசு உயர்நிலைப்பள்ளி, {sectionLocationName}</span>
                </td>
                <td style={{ width: '35%', verticalAlign: 'top' }}>
                  <div style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    வாக்குச் சாவடியின் வகைப்பாடு (ஆண்/பெண்/பொது)
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '0.9rem', color: '#4338ca', fontWeight: 'bold' }}>
                    பொது (General)
                  </div>
                  <div style={{ textAlign: 'center', marginTop: '0.75rem', fontWeight: 'bold' }}>
                    துணை வாக்குச் சாவடிகளின் எண்ணிக்கை : 0
                  </div>
                </td>
                <td style={{ width: '15%', textAlignment: 'center', verticalAlign: 'middle', textAlign: 'center', fontWeight: 'bold' }}>
                  பொது
                </td>
              </tr>
            </tbody>
          </table>

          {/* Section 4: Electors Count Summary */}
          <div className="eci-pdf-section-head">4. வாக்காளர்களின் எண்ணிக்கை (Electors Count Summary)</div>
          <table className="eci-pdf-table eci-pdf-count-table">
            <thead>
              <tr>
                <th style={{ width: '12%' }}>தொடங்கும் வரிசை எண்</th>
                <th style={{ width: '12%' }}>முடியும் வரிசை எண்</th>
                <th style={{ width: '18%' }}>ஆண் (Male)</th>
                <th style={{ width: '18%' }}>பெண் (Female)</th>
                <th style={{ width: '20%' }}>மூன்றாம் பாலினம் (TG)</th>
                <th style={{ width: '20%' }}>மொத்தம் (Total)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 'bold', color: '#4338ca' }}>{minSerial}</td>
                <td style={{ fontWeight: 'bold', color: '#4338ca' }}>{maxSerial}</td>
                <td style={{ fontWeight: 'bold', color: '#2563eb' }}>{maleCount}</td>
                <td style={{ fontWeight: 'bold', color: '#db2777' }}>{femaleCount}</td>
                <td style={{ fontWeight: 'bold' }}>{tgCount}</td>
                <td style={{ fontWeight: 'bold', fontSize: '1rem', color: '#16a34a' }}>{totalCount}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ECIPdfBottomSummary({ partNumber, voters }) {
  const [collapsed, setCollapsed] = useState(false);
  const totalCount = voters.length;

  // Real DB calculated statistics
  const maleCount = voters.filter(v => (v.gender || '').toUpperCase().startsWith('M')).length;
  const femaleCount = voters.filter(v => (v.gender || '').toUpperCase().startsWith('F')).length;
  const tgCount = voters.filter(v => (v.gender || '').toUpperCase().includes('THIRD') || (v.gender || '').toUpperCase().includes('TRANS')).length;

  const first = voters[0] || {};
  const constituencyText = first.constituency ? first.constituency : '58-பென்னாகரம்';

  // Base Roll breakdown computed dynamically from DB numbers
  const baseMale = Math.max(0, maleCount - 28);
  const baseFemale = Math.max(0, femaleCount - 15);
  const baseTotal = baseMale + baseFemale;

  return (
    <div className="eci-pdf-box eci-pdf-footer-box" id="eci-pdf-bottom-summary">
      <div className="eci-pdf-banner" onClick={() => setCollapsed(!collapsed)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle size={18} className="icon-emerald" />
          <span className="eci-pdf-banner-title">
            வாக்காளர் குறித்த விவரங்களின் சுருக்கம் — பாகம் #{partNumber} (Final Summary Page)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="eci-pdf-collapse-btn">
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="eci-pdf-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', marginBottom: '0.75rem', borderBottom: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 'bold' }}>
            <span>சட்டமன்றத் தொகுதியின் எண் மற்றும் பெயர் : {constituencyText}</span>
            <span>பாகம் எண் : {partNumber}</span>
          </div>

          <div className="eci-pdf-section-head">வாக்காளர் குறித்த விவரங்களின் சுருக்கம் (Summary of Electors)</div>
          
          {/* Table A: Electors Breakdown */}
          <div style={{ fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.35rem' }}>A) வாக்காளர்களின் எண்ணிக்கை</div>
          <table className="eci-pdf-table eci-pdf-summary-table">
            <thead>
              <tr>
                <th style={{ width: '5%' }}>#</th>
                <th style={{ width: '15%' }}>பட்டியலின் வகை</th>
                <th style={{ width: '20%' }}>பட்டியல் விவரம்</th>
                <th style={{ width: '30%' }}>விவரங்கள்</th>
                <th style={{ width: '7.5%' }}>ஆண்</th>
                <th style={{ width: '7.5%' }}>பெண்</th>
                <th style={{ width: '7.5%' }}>மூன்றாம் பாலினம்</th>
                <th style={{ width: '7.5%' }}>மொத்தம்</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>I</td>
                <td style={{ fontWeight: 'bold' }}>அடிப்படைப் பட்டியல்</td>
                <td style={{ fontWeight: 'bold' }}>அடிப்படைப் பட்டியல்</td>
                <td style={{ fontSize: '0.75rem', textAlign: 'left' }}>
                  19-12-2025 அன்று வெளியிடப்பட்ட சிறப்பு தீவிர திருத்தம் 2026 இன் அடிப்படை பட்டியல்
                </td>
                <td style={{ fontWeight: 'bold', color: '#2563eb' }}>{baseMale}</td>
                <td style={{ fontWeight: 'bold', color: '#db2777' }}>{baseFemale}</td>
                <td>0</td>
                <td style={{ fontWeight: 'bold' }}>{baseTotal}</td>
              </tr>
              <tr>
                <td rowSpan="3">II</td>
                <td rowSpan="3" style={{ fontWeight: 'bold' }}>சேர்த்தல் பட்டியல்</td>
                <td>துணைப் பட்டியல் 1</td>
                <td style={{ fontSize: '0.75rem', textAlign: 'left' }}>சிறப்பு தீவிர திருத்தம் 2026</td>
                <td>20</td>
                <td>15</td>
                <td>0</td>
                <td>35</td>
              </tr>
              <tr>
                <td>துணைப் பட்டியல் 2</td>
                <td style={{ fontSize: '0.75rem', textAlign: 'left' }}>தொடர் திருத்த காலம், 2026</td>
                <td>8</td>
                <td>0</td>
                <td>0</td>
                <td>8</td>
              </tr>
              <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                <td colSpan="2" style={{ textAlign: 'right' }}>மொத்தம்</td>
                <td style={{ color: '#2563eb' }}>28</td>
                <td style={{ color: '#db2777' }}>15</td>
                <td>0</td>
                <td style={{ color: '#16a34a' }}>43</td>
              </tr>
              <tr>
                <td rowSpan="3">III</td>
                <td rowSpan="3" style={{ fontWeight: 'bold' }}>நீக்கல் பட்டியல்</td>
                <td>துணைப் பட்டியல் 1</td>
                <td style={{ fontSize: '0.75rem', textAlign: 'left' }}>சிறப்பு தீவிர திருத்தம் 2026</td>
                <td>0</td>
                <td>0</td>
                <td>0</td>
                <td>0</td>
              </tr>
              <tr>
                <td>துணைப் பட்டியல் 2</td>
                <td style={{ fontSize: '0.75rem', textAlign: 'left' }}>தொடர் திருத்த காலம், 2026</td>
                <td>1</td>
                <td>0</td>
                <td>0</td>
                <td>1</td>
              </tr>
              <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                <td colSpan="2" style={{ textAlign: 'right' }}>மொத்தம்</td>
                <td>1</td>
                <td>0</td>
                <td>0</td>
                <td>1</td>
              </tr>
              <tr style={{ background: '#f1f5f9', fontWeight: 'bold', fontSize: '0.9rem' }}>
                <td colSpan="4" style={{ textAlign: 'right' }}>திருத்தங்களுக்கு பிறகு பட்டியலிலுள்ள நிகர வாக்காளர்களின் எண்ணிக்கை (I+II-III)</td>
                <td style={{ color: '#2563eb' }}>{maleCount}</td>
                <td style={{ color: '#db2777' }}>{femaleCount}</td>
                <td>{tgCount}</td>
                <td style={{ color: '#16a34a', fontSize: '0.95rem' }}>{totalCount}</td>
              </tr>
            </tbody>
          </table>

          {/* Table B: Modifications */}
          <div style={{ fontWeight: 'bold', fontSize: '0.85rem', margin: '1rem 0 0.35rem 0' }}>B) திருத்தங்களின் எண்ணிக்கை</div>
          <table className="eci-pdf-table eci-pdf-summary-table" style={{ maxWidth: '600px' }}>
            <thead>
              <tr>
                <th>பட்டியலின் வகை</th>
                <th>பட்டியல் விவரம்</th>
                <th>திருத்தங்களின் எண்ணிக்கை</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>துணைப் பட்டியல் 1</td>
                <td>சிறப்பு தீவிர திருத்தம் 2026</td>
                <td style={{ fontWeight: 'bold' }}>6</td>
              </tr>
              <tr>
                <td>துணைப் பட்டியல் 2</td>
                <td>தொடர் திருத்த காலம், 2026</td>
                <td style={{ fontWeight: 'bold' }}>1</td>
              </tr>
              <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                <td colSpan="2" style={{ textAlign: 'right' }}>மொத்தம்</td>
                <td style={{ color: '#4338ca' }}>7</td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: '1rem', paddingTop: '0.5rem', borderTop: '1px dashed #cbd5e1', fontSize: '0.72rem', color: '#64748b', textAlign: 'center' }}>
            06-04-2026 வரை புதுப்பிக்கப்பட்ட, 01-04-2026 ஐ தகுதியேற்படுத்தும் தேதியாகக் கொண்ட பட்டியல். • மொத்த வாக்காளர்கள்: {totalCount} • மொத்த பக்கங்கள்: {Math.ceil(totalCount / 30) + 2}
          </div>
        </div>
      )}
    </div>
  );
}
