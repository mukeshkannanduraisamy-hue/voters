import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { DashboardStats, Voter } from '../lib/types';
import {
  Alert, Button, Modal, PageHead, Progress, fmt, useToast,
} from '../components/ui';
import { VoterRecordsPanel, EditSurveyModal } from '../components/VoterRecordsPanel';
import type { FormSchema } from '../lib/formSchema';
import { Icon } from '../components/icons';

export default function Survey() {
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const [searchError, setSearchError] = useState('');
  const [voter, setVoter] = useState<Voter | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [recordsRefreshKey, setRecordsRefreshKey] = useState(0);

  useEffect(() => {
    api.get<FormSchema>('/api/form-schema/published')
      .then(setSchema)
      .catch(() => toast.bad('Could not load the survey form', 'Ask your Super Admin to publish a form version.'));
    api.get<DashboardStats>('/api/dashboard/stats').then(setStats).catch(() => { /* banner degrades */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep link: /survey/booth?epic=XXXX opens that elector directly in the survey popup modal
  useEffect(() => {
    const epic = params.get('epic');
    if (epic && (!voter || voter.epicId !== epic)) void openVoter(epic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('epic')]);

  const openVoter = async (epic: string) => {
    setSearchError('');
    try {
      setVoter(await api.get<Voter>(`/api/voters/${encodeURIComponent(epic)}`));
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : 'Could not open that elector');
      setVoter(null);
    }
  };

  const clearAll = () => {
    setVoter(null);
    setSearchError('');
    setParams({}, { replace: true });
  };

  const dismissSavedPopup = () => {
    setSavedName(null);
    clearAll();
  };

  const boothLabel = user?.jurisdictions.length
    ? user.jurisdictions.length === 1
      ? `Booth #${user.jurisdictions[0].part_no} (${user.jurisdictions[0].local_body_name_ta})`
      : `${user.jurisdictions.length} booths`
    : 'No booth assigned';

  const t = stats?.totals;

  return (
    <div className="survey-shell">
      <PageHead
        title="Voter Field Survey"
        sub={`Agent: ${user?.fullName ?? user?.mobileNumber} · ${boothLabel}`}
      />

      {/* ------------- booth progress banner ------------- */}
      {t && (
        <div className="booth-banner mb-4">
          <Icon name="target" size={22} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="t-semi">{boothLabel}</div>
            <div className="booth-banner-stat">
              Done {fmt(t.completed)} / {fmt(t.total)} ({t.completionPct}%)
            </div>
            <div className="mt-2"><Progress value={t.completionPct} /></div>
          </div>
          <div className="t-right">
            <div className="t-lg t-bold tabnum">{fmt(t.today)}</div>
            <div className="booth-banner-stat">today</div>
          </div>
        </div>
      )}

      {searchError && (
        <div className="mb-4"><Alert tone="warn">{searchError}</Alert></div>
      )}

      {/* -------------------- survey popup modal -------------------- */}
      {voter && (
        <EditSurveyModal
          voter={voter}
          schema={schema}
          onCancel={clearAll}
          onSaved={(updated) => {
            setSavedName(updated.survey?.correctedNameTa ?? updated.nameTa);
            setRecordsRefreshKey((k) => k + 1);
            setVoter(null);
            setParams({}, { replace: true });
            api.get<DashboardStats>('/api/dashboard/stats').then(setStats).catch(() => {});
          }}
        />
      )}

      {/* -------------------- voter records -------------------- */}
      <div className="section-tag mt-6 mb-3" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="list" size={16} />My Voter Records
      </div>
      <VoterRecordsPanel syncUrl={false} refreshTrigger={recordsRefreshKey} />

      {/* -------------------- saved confirmation popup -------------------- */}
      <Modal
        open={!!savedName}
        title="Survey Saved"
        onClose={dismissSavedPopup}
        footer={<Button variant="primary" block onClick={dismissSavedPopup}>Continue to next voter</Button>}
      >
        <div className="saved-popup">
          <div className="saved-popup-icon"><Icon name="check-circle" size={30} /></div>
          <div className="t-lg t-semi ta">{savedName}</div>
          <div className="t-sm t-muted mt-2">Survey record saved successfully.</div>
        </div>
      </Modal>
    </div>
  );
}
