import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabase';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import ECIPartTable from './components/ECIPartTable';
import ECIVoterTable from './components/ECIVoterTable';
import VoterProfilePage from './components/VoterProfilePage';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function App() {
  // Accessibility, Theme & Language State
  const [fontSize, setFontSize] = useState('16px');
  const [language, setLanguage] = useState('ENGLISH');
  const [theme, setTheme] = useState('light');

  // Apply Theme to body
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // Database State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [voters, setVoters] = useState([]);
  const [photosMap, setPhotosMap] = useState({});

  // Dynamic Dropdown Lists Extracted from DB
  const [statesList, _setStatesList] = useState(['Tamil Nadu']);
  const [districtsList, _setDistrictsList] = useState(['Dharmapuri']);
  const [constituenciesList, setConstituenciesList] = useState([]);
  const [partsList, setPartsList] = useState([]);
  const [sectionsList, setSectionsList] = useState([]);
  const [gendersList, setGendersList] = useState([]);
  const [relationTypesList, setRelationTypesList] = useState([]);

  // Selected Filter States
  const [selectedState, setSelectedState] = useState('Tamil Nadu');
  const [selectedDistrict, setSelectedDistrict] = useState('Dharmapuri');
  const [selectedConstituency, setSelectedConstituency] = useState('ALL');
  const [selectedPart, setSelectedPart] = useState('ALL');
  const [selectedSection, setSelectedSection] = useState('ALL');
  const [selectedGender, setSelectedGender] = useState('ALL');
  const [selectedRelationType, setSelectedRelationType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // 3-Page Navigation View State: 'PARTS_PAGE' | 'VOTERS_PAGE' | 'PROFILE_PAGE'
  const [viewState, setViewState] = useState('PARTS_PAGE');
  const [activePartNumber, setActivePartNumber] = useState(null);
  const [selectedVoter, setSelectedVoter] = useState(null);

  // Apply Font Size to html root
  useEffect(() => {
    document.documentElement.style.fontSize = fontSize;
  }, [fontSize]);

  // Initial Real Data Fetch from Supabase
  useEffect(() => {
    fetchRealDatabaseRecords();
  }, []);

  const fetchRealDatabaseRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all valid voter records from Supabase DB in chunks to bypass Supabase 1,000-row REST limit
      let allVoters = [];
      let fromIndex = 0;
      const step = 1000;
      let keepFetching = true;

      while (keepFetching) {
        const { data: chunk, error: chunkErr } = await supabase
          .from('voters')
          .select('*')
          .range(fromIndex, fromIndex + step - 1);

        if (chunkErr) throw chunkErr;

        if (chunk && chunk.length > 0) {
          const normalized = chunk.map(v => ({
            ...v,
            part_number: (v.part_number && String(v.part_number).trim()) ? String(v.part_number).trim() : 'General'
          }));
          allVoters = allVoters.concat(normalized);
          fromIndex += step;
          if (chunk.length < step) keepFetching = false;
        } else {
          keepFetching = false;
        }
      }

      setVoters(allVoters);

      // Extract unique DB values for real dropdown options
      const constSet = new Set();
      const partSet = new Set();
      const sectionSet = new Set();
      const genderSet = new Set();
      const relationSet = new Set();

      allVoters.forEach(v => {
        if (v.constituency) constSet.add(v.constituency);
        if (v.part_number) partSet.add(v.part_number);
        if (v.section_name) sectionSet.add(v.section_name);
        if (v.gender && v.gender.trim()) genderSet.add(v.gender);
        if (v.relation_type && v.relation_type.trim()) relationSet.add(v.relation_type);
      });

      setConstituenciesList(Array.from(constSet));
      setPartsList(Array.from(partSet).sort((a, b) => parseInt(a) - parseInt(b)));
      setSectionsList(Array.from(sectionSet));
      setGendersList(Array.from(genderSet));
      setRelationTypesList(Array.from(relationSet));

      // Fetch Photos mapping if available
      const { data: photoData } = await supabase
        .from('photos')
        .select('*');

      if (photoData) {
        const pMap = {};
        photoData.forEach(p => {
          if (p.voter_id) {
            pMap[p.voter_id] = p.file_path || p.image_data;
          }
        });
        setPhotosMap(pMap);
      }
    } catch (err) {
      console.error('Data fetch error:', err);
      setError(err.message || 'Failed to load records from Supabase.');
    } finally {
      setLoading(false);
    }
  };

  // Update Voter in DB
  const handleUpdateVoter = async (voterId, updates) => {
    try {
      const { error: updateErr } = await supabase
        .from('voters')
        .update(updates)
        .eq('id', voterId);

      if (updateErr) throw updateErr;

      setVoters(prev => prev.map(v => v.id === voterId ? { ...v, ...updates } : v));
      if (selectedVoter && selectedVoter.id === voterId) {
        setSelectedVoter(prev => ({ ...prev, ...updates }));
      }
    } catch (err) {
      alert('Error updating voter record: ' + err.message);
    }
  };

  // Real-time Filtering Engine based on Real DB Data
  const filteredVoters = useMemo(() => {
    return voters.filter((v) => {
      // Constituency Filter
      if (selectedConstituency !== 'ALL' && v.constituency !== selectedConstituency) {
        return false;
      }

      // Part Number Filter
      if (selectedPart !== 'ALL' && String(v.part_number) !== String(selectedPart)) {
        return false;
      }

      // Section Filter
      if (selectedSection !== 'ALL' && v.section_name !== selectedSection) {
        return false;
      }

      // Gender Filter
      if (selectedGender !== 'ALL' && v.gender !== selectedGender) {
        return false;
      }

      // Relation Type Filter
      if (selectedRelationType !== 'ALL' && v.relation_type !== selectedRelationType) {
        return false;
      }

      // Global Search Filter (Name in Tamil/English, EPIC ID, House No, Serial No)
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (v.name || '').toLowerCase().includes(q);
        const epicMatch = (v.epic || '').toLowerCase().includes(q);
        const houseMatch = (v.house_number || '').toLowerCase().includes(q);
        const serialMatch = String(v.serial || '').includes(q);
        const relMatch = (v.relation_name || '').toLowerCase().includes(q);

        return nameMatch || epicMatch || houseMatch || serialMatch || relMatch;
      }

      return true;
    });
  }, [voters, selectedConstituency, selectedPart, selectedSection, selectedGender, selectedRelationType, searchQuery]);

  // Voters for Active Part Page View
  const partPageVoters = useMemo(() => {
    if (!activePartNumber) return filteredVoters;
    return filteredVoters.filter(v => String(v.part_number) === String(activePartNumber));
  }, [filteredVoters, activePartNumber]);

  // Navigation Handlers
  const handleOpenPartPage = (partNo) => {
    setActivePartNumber(partNo);
    setViewState('VOTERS_PAGE');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenVoterProfilePage = (voter) => {
    setSelectedVoter(voter);
    setViewState('PROFILE_PAGE');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToParts = () => {
    setViewState('PARTS_PAGE');
    setActivePartNumber(null);
  };

  const handleBackToVoterList = () => {
    setViewState('VOTERS_PAGE');
  };

  const resetFilters = () => {
    setSelectedConstituency('ALL');
    setSelectedPart('ALL');
    setSelectedSection('ALL');
    setSelectedGender('ALL');
    setSelectedRelationType('ALL');
    setSearchQuery('');
    setViewState('PARTS_PAGE');
    setActivePartNumber(null);
    setSelectedVoter(null);
  };

  return (
    <div className="eci-app-wrapper">
      {/* Header */}
      <Header
        fontSize={fontSize}
        setFontSize={setFontSize}
        language={language}
        setLanguage={setLanguage}
        theme={theme}
        setTheme={setTheme}
      />

      {/* Main ECI Container */}
      <main className="eci-container">
        {loading ? (
          <div className="eci-form-card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div className="spinner" style={{ margin: '0 auto 1rem auto' }}></div>
            <p style={{ fontWeight: 700, color: 'var(--text-main)' }}>Loading records from Supabase database...</p>
          </div>
        ) : error ? (
          <div className="eci-form-card" style={{ borderColor: '#ef4444' }}>
            <AlertCircle size={36} color="#ef4444" style={{ margin: '0 auto 0.5rem auto' }} />
            <p style={{ color: '#ef4444', fontWeight: 700 }}>{error}</p>
            <button className="btn-eci-blue" style={{ marginTop: '1rem' }} onClick={fetchRealDatabaseRecords}>
              <RefreshCw size={16} /> Retry DB Fetch
            </button>
          </div>
        ) : viewState === 'PARTS_PAGE' ? (
          /* PAGE 1: Dynamic Filter Bar & Part Summary Table */
          <>
            <FilterBar
              statesList={statesList}
              selectedState={selectedState}
              setSelectedState={setSelectedState}
              districtsList={districtsList}
              selectedDistrict={selectedDistrict}
              setSelectedDistrict={setSelectedDistrict}
              constituenciesList={constituenciesList}
              selectedConstituency={selectedConstituency}
              setSelectedConstituency={setSelectedConstituency}
              partsList={partsList}
              selectedPart={selectedPart}
              setSelectedPart={setSelectedPart}
              sectionsList={sectionsList}
              selectedSection={selectedSection}
              setSelectedSection={setSelectedSection}
              gendersList={gendersList}
              selectedGender={selectedGender}
              setSelectedGender={setSelectedGender}
              relationTypesList={relationTypesList}
              selectedRelationType={selectedRelationType}
              setSelectedRelationType={setSelectedRelationType}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onResetFilters={resetFilters}
            />

            <ECIPartTable
              filteredVoters={filteredVoters}
              onOpenPartVotersPage={handleOpenPartPage}
            />
          </>
        ) : viewState === 'VOTERS_PAGE' ? (
          /* PAGE 2: Dedicated Full Voter Directory Table Page for Selected Part */
          <ECIVoterTable
            partNumber={activePartNumber}
            voters={partPageVoters}
            photosMap={photosMap}
            onBackToParts={handleBackToParts}
            onOpenVoterProfilePage={handleOpenVoterProfilePage}
          />
        ) : (
          /* PAGE 3: Dedicated Full Page View for Selected Voter Profile & Official E-Slip */
          <VoterProfilePage
            voter={selectedVoter}
            photoUrl={photosMap[selectedVoter?.id]}
            onBackToVoterList={handleBackToVoterList}
            onUpdateVoter={handleUpdateVoter}
          />
        )}
      </main>
    </div>
  );
}
