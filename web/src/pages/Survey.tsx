import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { DashboardStats, Directory, Dropdowns, Voter } from '../lib/types';
import {
  Alert, Badge, Button, Card, CardHead, Empty, Field, Input, PageHead, PhoneInput,
  Progress, Select, Textarea, fmt, fmtDate, useToast,
} from '../components/ui';
import { PartyGrid } from '../components/spec-ui';
import { Icon } from '../components/icons';

interface FormState {
  correctedNameTa: string;
  correctedRelativeNameTa: string;
  phoneNumber: string;
  sector: string;
  jobId: string;
  otherJobText: string;
  casteId: string;
  partyId: number | null;
  remarks: string;
}

const EMPTY: FormState = {
  correctedNameTa: '', correctedRelativeNameTa: '', phoneNumber: '',
  sector: '', jobId: '', otherJobText: '', casteId: '', partyId: null, remarks: '',
};

export default function Survey() {
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [drops, setDrops] = useState<Dropdowns | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Voter[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [voter, setVoter] = useState<Voter | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  /** Seeds the form from the roll, pre-filling any survey already collected. */
  const seedFrom = (v: Voter, d: Dropdowns | null): FormState => {
    const job = v.survey?.jobId ? d?.jobs.find((j) => j.id === v.survey!.jobId) : undefined;
    return {
      correctedNameTa: v.survey?.correctedNameTa ?? v.nameTa ?? '',
      correctedRelativeNameTa: v.survey?.correctedRelativeNameTa ?? v.relativeNameTa ?? '',
      phoneNumber: v.survey?.phoneNumber ?? '',
      sector: job?.category ?? v.survey?.jobCategory ?? '',
      jobId: v.survey?.jobId ? String(v.survey.jobId) : '',
      otherJobText: v.survey?.otherJobText ?? '',
      casteId: v.survey?.casteId ? String(v.survey.casteId) : '',
      partyId: v.survey?.partyId ?? null,
      remarks: v.survey?.remarks ?? '',
    };
  };

  useEffect(() => {
    api.get<Dropdowns>('/api/masters/dropdowns')
      .then(setDrops)
      .catch(() => toast.bad('Could not load dropdown options', 'Caste, job and party lists are unavailable.'));
    api.get<DashboardStats>('/api/dashboard/stats').then(setStats).catch(() => { /* banner degrades */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep link: /survey/booth?epic=XXXX opens that elector directly.
  useEffect(() => {
    const epic = params.get('epic');
    if (epic && (!voter || voter.epicId !== epic)) void openVoter(epic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('epic'), drops]);

  const search = async (e?: FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) { setSearchError('Enter an EPIC number, name or door number to search.'); return; }
    setSearching(true);
    setSearchError('');
    setResults(null);
    try {
      const res = await api.get<Directory>(`/api/voters/directory${qs({ search: q, limit: 25 })}`);
      setResults(res.rows);
      if (res.rows.length === 1) selectVoter(res.rows[0]);
      else if (res.rows.length === 0) setSearchError('No elector in your assigned booth matches that search.');
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const openVoter = async (epic: string) => {
    setSearching(true);
    setSearchError('');
    try {
      selectVoter(await api.get<Voter>(`/api/voters/${encodeURIComponent(epic)}`));
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : 'Could not open that elector');
      setVoter(null);
    } finally {
      setSearching(false);
    }
  };

  const selectVoter = (v: Voter) => {
    setVoter(v);
    setForm(seedFrom(v, drops));
    setErrors({});
    setSaveError('');
    setResults(null);
    setParams({ epic: v.epicId }, { replace: true });
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  };

  /** Picking a sector auto-selects its first sub-job, so the pair is never half-set. */
  const onSectorChange = (sector: string) => {
    const first = drops?.sectors.find((s) => s.category === sector)?.jobs[0];
    setForm((f) => ({ ...f, sector, jobId: first ? String(first.id) : '' }));
    setErrors((e) => ({ ...e, sector: '', jobId: '' }));
  };

  const subJobs = useMemo(
    () => drops?.sectors.find((s) => s.category === form.sector)?.jobs ?? [],
    [drops, form.sector]
  );

  const validate = () => {
    const e: Record<string, string> = {};
    if (!/^[6-9]\d{9}$/.test(form.phoneNumber.trim())) e.phoneNumber = 'Enter a valid 10-digit number starting 6-9';
    if (!form.casteId) e.casteId = 'Select a caste';
    if (!form.sector) e.sector = 'Select a main sector';
    if (!form.jobId) e.jobId = 'Select a specific sub-job';
    if (!form.partyId) e.partyId = 'Select a political leaning';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setSaveError('');
    if (!voter) return;
    if (!validate()) { setSaveError('Please complete all required fields before saving.'); return; }

    setSaving(true);
    try {
      const res = await api.post<{ updated: boolean; voter: Voter }>('/api/voters/survey/submit', {
        epicId: voter.epicId,
        correctedNameTa: form.correctedNameTa.trim(),
        correctedRelativeNameTa: form.correctedRelativeNameTa.trim(),
        phoneNumber: form.phoneNumber.trim(),
        casteId: Number(form.casteId),
        jobId: Number(form.jobId),
        partyId: form.partyId,
        otherJobText: form.otherJobText.trim(),
        remarks: form.remarks.trim(),
      });
      toast.ok(res.updated ? 'Survey updated' : 'Survey saved', `${voter.nameTa} · ${voter.epicId}`);
      setVoter(res.voter);
      setForm(seedFrom(res.voter, drops));
      // Refresh the booth progress banner so the counter moves immediately.
      api.get<DashboardStats>('/api/dashboard/stats').then(setStats).catch(() => {});
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); setSaveError(err.message); }
      else setSaveError('Could not save the survey. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const clearAll = () => {
    setVoter(null); setForm(EMPTY); setErrors({}); setSaveError('');
    setResults(null); setQuery(''); setParams({}, { replace: true });
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
        actions={voter ? <Button icon="x" onClick={clearAll}>New search</Button> : undefined}
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

      {/* -------------------- search -------------------- */}
      <Card className="mb-4">
        <CardHead title="Search voter record" sub="By EPIC number, name or door number" icon="search" />
        <div className="card-body">
          <form onSubmit={search}>
            <div className="input-group">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="EPIC ID, voter name, or door no"
                aria-label="Search voter"
                autoFocus={!voter}
              />
              <Button type="submit" variant="primary" icon="search" loading={searching}>Search</Button>
            </div>
          </form>
          {searchError && <div className="mt-3"><Alert tone="warn">{searchError}</Alert></div>}
        </div>

        {results && results.length > 1 && (
          <div className="card-body flush" style={{ borderTop: '1px solid var(--border)' }}>
            <div style={{ padding: 'var(--sp-2) var(--sp-4)', background: 'var(--surface-3)' }} className="t-xs t-muted t-bold">
              {results.length} MATCHES — SELECT ONE
            </div>
            {results.map((r) => (
              <button key={r.epicId} type="button" className="result-row" onClick={() => selectVoter(r)}>
                <div className="result-main">
                  <div className="result-name ta">{r.nameTa}</div>
                  <div className="result-meta">
                    <span className="mono">{r.epicId}</span> · S.No {r.voterSno ?? '—'} · Door {r.doorNo ?? '—'} · {r.age ?? '—'} · <span className="ta">{r.gender ?? '—'}</span>
                  </div>
                  <div className="result-meta ta">Part {r.partNo} · {r.localBodyNameTa}</div>
                </div>
                {r.surveyed ? <Badge tone="ok" dot>Done</Badge> : <Badge tone="warn" dot>Pending</Badge>}
                <Icon name="chevron-right" size={16} className="t-subtle" />
              </button>
            ))}
          </div>
        )}
      </Card>

      {!voter && !results && (
        <Card>
          <Empty icon="clipboard" title="Search for a voter to begin">
            Enter an EPIC number, voter name, or door number above. Only electors inside your
            assigned booth will appear.
          </Empty>
        </Card>
      )}

      {/* -------------------- survey form -------------------- */}
      {voter && (
        <div ref={formRef}>
          {voter.surveyed && (
            <div className="mb-4">
              <Alert tone="ok">
                <strong>Already surveyed</strong> on {fmtDate(voter.survey?.surveyedAt, true)}
                {voter.survey?.agentName && <> by {voter.survey.agentName}</>}. Saving again will update the record.
              </Alert>
            </div>
          )}

          <form onSubmit={submit}>
            {/* ---- Section A: locked roll data ---- */}
            <Card className="mb-4">
              <CardHead
                title="Section A · Electoral roll data" sub="Read-only from the official roll" icon="lock"
                actions={<Badge tone="muted" dot>Locked</Badge>}
              />
              <div className="card-body">
                <div className="locked-grid">
                  <div className="locked-cell">
                    <div className="locked-key">EPIC Number</div>
                    <div className="locked-val mono">{voter.epicId}</div>
                  </div>
                  <div className="locked-cell">
                    <div className="locked-key">Polling booth</div>
                    <div className="locked-val">Part {voter.partNo}</div>
                  </div>
                  <div className="locked-cell span2">
                    <div className="locked-key">Local body / Address</div>
                    <div className="locked-val ta">
                      {voter.localBodyNameTa}
                      {voter.doorNo && <span className="t-sm t-muted"> · Door {voter.doorNo}</span>}
                    </div>
                  </div>
                  <div className="locked-cell">
                    <div className="locked-key">Serial no</div>
                    <div className="locked-val">{voter.voterSno ?? '—'}</div>
                  </div>
                  <div className="locked-cell">
                    <div className="locked-key">Age</div>
                    <div className="locked-val">{voter.age ?? '—'}</div>
                  </div>
                  <div className="locked-cell">
                    <div className="locked-key">Sex</div>
                    <div className="locked-val ta">{voter.gender ?? '—'}</div>
                  </div>
                  <div className="locked-cell">
                    <div className="locked-key">Roll name</div>
                    <div className="locked-val ta">{voter.nameTa}</div>
                  </div>
                </div>
              </div>
            </Card>

            {/* ---- Section B: corrections ---- */}
            <Card className="mb-4">
              <CardHead title="Section B · Field corrections" sub="Optional — fix clerical spelling errors" icon="edit" />
              <div className="card-body">
                <div className="grid cols-2">
                  <Field label="Corrected name (Tamil)" error={errors.correctedNameTa}>
                    <Input
                      className="ta" value={form.correctedNameTa}
                      onChange={(e) => set('correctedNameTa', e.target.value)}
                      placeholder="வாக்காளர் பெயர்"
                    />
                  </Field>
                  <Field label={`Corrected relative name (${voter.relationTypeTa ?? 'father / husband'})`} error={errors.correctedRelativeNameTa}>
                    <Input
                      className="ta" value={form.correctedRelativeNameTa}
                      onChange={(e) => set('correctedRelativeNameTa', e.target.value)}
                      placeholder="உறவினர் பெயர்"
                    />
                  </Field>
                </div>
              </div>
            </Card>

            {/* ---- Section C: collected intelligence ---- */}
            <Card>
              <CardHead title="Section C · Survey intelligence" sub="All fields below are required" icon="clipboard" />
              <div className="card-body">
                {saveError && <div className="mb-4"><Alert tone="bad">{saveError}</Alert></div>}

                <div className="stack">
                  <div>
                    <div className="section-tag"><span className="n">1</span> Voter phone number</div>
                    <Field required error={errors.phoneNumber} hint="10 digits, starting with 6, 7, 8 or 9">
                      <PhoneInput
                        value={form.phoneNumber}
                        onChange={(v) => set('phoneNumber', v)}
                        placeholder="9840112233"
                        invalid={!!errors.phoneNumber}
                      />
                    </Field>
                  </div>

                  <div>
                    <div className="section-tag"><span className="n">2</span> Caste / community</div>
                    <Field required error={errors.casteId}>
                      <Select value={form.casteId} onChange={(e) => set('casteId', e.target.value)} invalid={!!errors.casteId}>
                        <option value="">Select caste…</option>
                        {drops?.castes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.category} — {c.name}{c.name_ta ? ` / ${c.name_ta}` : ''}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <div>
                    <div className="section-tag"><span className="n">3</span> Occupation (2-tier)</div>
                    <div className="grid cols-2">
                      <Field label="Main sector" required error={errors.sector}>
                        <Select value={form.sector} onChange={(e) => onSectorChange(e.target.value)} invalid={!!errors.sector}>
                          <option value="">Select sector…</option>
                          {drops?.sectors.map((s) => (
                            <option key={s.category} value={s.category}>
                              {s.category}{s.category_ta ? ` / ${s.category_ta}` : ''}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field
                        label="Specific sub-job" required error={errors.jobId}
                        hint={form.sector ? undefined : 'Choose a sector first'}
                      >
                        <Select
                          value={form.jobId}
                          onChange={(e) => set('jobId', e.target.value)}
                          invalid={!!errors.jobId}
                          disabled={!form.sector}
                        >
                          <option value="">Select sub-job…</option>
                          {subJobs.map((j) => (
                            <option key={j.id} value={j.id}>
                              {j.name_ta ? `${j.name_ta} (${j.name})` : j.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <div className="mt-3">
                      <Field label="Optional custom job note">
                        <Input
                          className="ta" value={form.otherJobText}
                          onChange={(e) => set('otherJobText', e.target.value)}
                          placeholder="e.g. பட்டுப்புழு வளர்ப்பு"
                        />
                      </Field>
                    </div>
                  </div>

                  <div>
                    <div className="section-tag"><span className="n">4</span> Political leaning</div>
                    {errors.partyId && <div className="mb-2"><span className="error-text">{errors.partyId}</span></div>}
                    {drops
                      ? <PartyGrid parties={drops.parties} value={form.partyId} onChange={(id) => set('partyId', id)} />
                      : <div className="t-sm t-muted">Loading parties…</div>}
                  </div>

                  <Field label="Remarks" hint="Optional note for the supervisor">
                    <Textarea
                      value={form.remarks}
                      onChange={(e) => set('remarks', e.target.value)}
                      placeholder="e.g. House locked, revisit in the evening"
                      rows={2}
                    />
                  </Field>
                </div>

                <div className="survey-actions">
                  <Button
                    type="button" icon="refresh" disabled={saving}
                    onClick={() => { setForm(seedFrom(voter, drops)); setErrors({}); setSaveError(''); }}
                  >
                    Clear
                  </Button>
                  <Button type="submit" variant="primary" icon="save" loading={saving} block>
                    {voter.surveyed ? 'Update & submit' : 'Save & Submit Survey'}
                  </Button>
                </div>
              </div>
            </Card>
          </form>
        </div>
      )}
    </div>
  );
}
