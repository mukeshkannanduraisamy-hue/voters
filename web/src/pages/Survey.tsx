import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { DashboardStats, Dropdowns, FormFieldDef, Voter } from '../lib/types';
import {
  Alert, Badge, Button, Card, CardHead, Field, Input, Modal, PageHead, PhoneInput,
  Progress, Select, Textarea, fmt, fmtDate, useToast,
} from '../components/ui';
import { PartyGrid } from '../components/spec-ui';
import { VoterRecordsPanel } from '../components/VoterRecordsPanel';
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
  educationId: string;
  remarks: string;
  customFields: Record<number, string>;
}

const EMPTY: FormState = {
  correctedNameTa: '', correctedRelativeNameTa: '', phoneNumber: '',
  sector: '', jobId: '', otherJobText: '', casteId: '', partyId: null,
  educationId: '', remarks: '', customFields: {},
};

export default function Survey() {
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [drops, setDrops] = useState<Dropdowns | null>(null);
  const [customFieldDefs, setCustomFieldDefs] = useState<FormFieldDef[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [voter, setVoter] = useState<Voter | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [pickingContact, setPickingContact] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  /** Seeds the form from the roll, pre-filling any survey already collected. */
  const seedFrom = (v: Voter, d: Dropdowns | null): FormState => {
    const job = v.survey?.jobId ? d?.jobs.find((j) => j.id === v.survey!.jobId) : undefined;
    const customFields: Record<number, string> = {};
    for (const cf of v.survey?.customFields ?? []) {
      if (cf.value !== null) customFields[cf.fieldId] = cf.value;
    }
    return {
      correctedNameTa: v.survey?.correctedNameTa ?? v.nameTa ?? '',
      correctedRelativeNameTa: v.survey?.correctedRelativeNameTa ?? v.relativeNameTa ?? '',
      phoneNumber: v.survey?.phoneNumber ?? '',
      sector: job?.category ?? v.survey?.jobCategory ?? '',
      jobId: v.survey?.jobId ? String(v.survey.jobId) : '',
      otherJobText: v.survey?.otherJobText ?? '',
      casteId: v.survey?.casteId ? String(v.survey.casteId) : '',
      partyId: v.survey?.partyId ?? null,
      educationId: v.survey?.educationId ? String(v.survey.educationId) : '',
      remarks: v.survey?.remarks ?? '',
      customFields,
    };
  };

  useEffect(() => {
    api.get<Dropdowns>('/api/masters/dropdowns')
      .then(setDrops)
      .catch(() => toast.bad('Could not load dropdown options', 'Caste, job and party lists are unavailable.'));
    api.get<FormFieldDef[]>('/api/form-fields')
      .then(setCustomFieldDefs)
      .catch(() => { /* custom fields are optional; the fixed form still works without them */ });
    api.get<DashboardStats>('/api/dashboard/stats').then(setStats).catch(() => { /* banner degrades */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep link: /survey/booth?epic=XXXX opens that elector directly.
  useEffect(() => {
    const epic = params.get('epic');
    if (epic && (!voter || voter.epicId !== epic)) void openVoter(epic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('epic'), drops]);

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
    setParams({ epic: v.epicId }, { replace: true });
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  };

  const setCustom = (fieldId: number, value: string) => {
    setForm((f) => ({ ...f, customFields: { ...f.customFields, [fieldId]: value } }));
    setErrors((e) => (e[`custom_${fieldId}`] ? { ...e, [`custom_${fieldId}`]: '' } : e));
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
    if (form.phoneNumber.trim() && !/^[6-9]\d{9}$/.test(form.phoneNumber.trim())) {
      e.phoneNumber = 'Enter a valid 10-digit number starting 6-9';
    }
    for (const def of customFieldDefs) {
      if (def.isRequired && !form.customFields[def.id]?.trim()) {
        e[`custom_${def.id}`] = `${def.label} is required`;
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setSaveError('');
    if (!voter) return;
    if (!validate()) { setSaveError('Please correct the invalid fields before saving.'); return; }

    setSaving(true);
    try {
      const res = await api.post<{ updated: boolean; voter: Voter }>('/api/voters/survey/submit', {
        epicId: voter.epicId,
        correctedNameTa: form.correctedNameTa.trim(),
        correctedRelativeNameTa: form.correctedRelativeNameTa.trim(),
        phoneNumber: form.phoneNumber.trim(),
        casteId: form.casteId ? Number(form.casteId) : null,
        jobId: form.jobId ? Number(form.jobId) : null,
        partyId: form.partyId ?? null,
        educationId: form.educationId ? Number(form.educationId) : null,
        otherJobText: form.otherJobText.trim(),
        remarks: form.remarks.trim(),
        customFields: form.customFields,
      });
      // A popup confirmation (not just a toast) plus a return to the search
      // screen — the agent's next action is almost always the next voter, so
      // land them back at the start rather than leaving the completed form up.
      setSavedName(res.voter.survey?.correctedNameTa ?? voter.nameTa);
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
    setParams({}, { replace: true });
  };

  const dismissSavedPopup = () => {
    setSavedName(null);
    clearAll(); // "redirect to main page" — back to the search landing state
  };

  /** Opens device Contacts app (Android / Chrome) to search and pick a phone number. */
  const handlePickContact = async () => {
    // 1. Native Web Contact Picker API (Chrome on Android)
    if ('contacts' in navigator && 'ContactsManager' in window) {
      try {
        setPickingContact(true);
        let props = ['tel'];
        if (typeof (navigator as any).contacts?.getProperties === 'function') {
          const supported = await (navigator as any).contacts.getProperties();
          props = ['tel', 'name'].filter((p) => supported.includes(p));
          if (!props.includes('tel')) props.push('tel');
        }
        const contacts = await (navigator as any).contacts.select(props, { multiple: false });
        if (contacts && contacts.length > 0) {
          const c = contacts[0];
          const rawTel = Array.isArray(c.tel) ? c.tel[0] : c.tel;
          if (rawTel) {
            let digits = String(rawTel).replace(/\D/g, '');
            if (digits.length > 10 && (digits.startsWith('91') || digits.startsWith('0'))) {
              digits = digits.slice(-10);
            } else if (digits.length > 10) {
              digits = digits.slice(-10);
            }
            if (digits.length === 10) {
              set('phoneNumber', digits);
              const cName = c.name ? (Array.isArray(c.name) ? c.name[0] : c.name) : '';
              toast.ok('Contact imported', cName ? `${cName}: ${digits}` : digits);
            } else if (digits.length > 0) {
              set('phoneNumber', digits);
              toast.warn('Check phone number', `Imported: ${digits} (please verify 10 digits)`);
            } else {
              toast.bad('No telephone digits', 'Selected contact has no numeric phone number.');
            }
          } else {
            toast.bad('No telephone number', 'Selected contact has no telephone number.');
          }
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn('Contact picker error:', err);
          toast.bad('Could not open contacts', err?.message || 'Contact selection was interrupted.');
        }
      } finally {
        setPickingContact(false);
      }
      return;
    }

    // 2. Clipboard fallback (if user already copied a number from Contacts/dialer)
    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        const text = await navigator.clipboard.readText();
        let digits = text.replace(/\D/g, '');
        if (digits.length > 10 && (digits.startsWith('91') || digits.startsWith('0'))) {
          digits = digits.slice(-10);
        } else if (digits.length > 10) {
          digits = digits.slice(-10);
        }
        if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
          set('phoneNumber', digits);
          toast.ok('Number imported from clipboard', digits);
          return;
        }
      } catch {
        // Clipboard read permission denied or empty
      }
    }

    // 3. Android fallback: the JS Contact Picker API is Chrome/Edge-on-Android
    // only, but ANY Android browser can be told to navigate to an `intent://`
    // URL — the OS intercepts that navigation and opens the device's actual
    // default Contacts app at its native "pick a phone number" screen. This
    // can't hand the selection back to the page (no such channel exists
    // outside the Web API), so we guide the agent to copy the number there
    // and come straight back — the clipboard check above will then pick it
    // up automatically on their next tap of this same button.
    if (/Android/i.test(navigator.userAgent)) {
      toast.info('Opening Contacts…', 'Pick the voter, copy their number, then tap "Contacts" again to import it.');
      window.location.href =
        'intent://contacts/#Intent;action=android.intent.action.PICK;type=vnd.android.cursor.dir/phone_v2;scheme=content;end';
      return;
    }

    // 4. iOS / desktop: no browser API or URI scheme can open the native
    // Contacts app from a webpage here — genuinely not possible outside
    // Android's intent mechanism, so the honest fallback is manual copy/paste.
    toast.info(
      'Device Contacts (தொடர்புகள்)',
      'This browser can’t open Contacts directly. Copy the number from your Contacts app, then tap "Contacts" here again to paste it in.'
    );
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

      {searchError && (
        <div className="mb-4"><Alert tone="warn">{searchError}</Alert></div>
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
                    <div className="locked-key">EPIC NUMBER</div>
                    <div className="locked-val mono">{voter.epicId}</div>
                  </div>
                  <div className="locked-cell">
                    <div className="locked-key">POLLING BOOTH</div>
                    <div className="locked-val">Booth {voter.partNo}</div>
                  </div>
                  <div className="locked-cell">
                    <div className="locked-key">LOCAL BODY / ADDRESS</div>
                    <div className="locked-val ta">
                      {voter.localBodyNameTa}
                      {voter.doorNo && <span className="t-sm t-muted font-normal"> · Door {voter.doorNo}</span>}
                    </div>
                  </div>
                  <div className="locked-cell" />
                  <div className="locked-cell">
                    <div className="locked-key">SERIAL NO</div>
                    <div className="locked-val">{voter.voterSno ?? '—'}</div>
                  </div>
                  <div className="locked-cell">
                    <div className="locked-key">AGE</div>
                    <div className="locked-val">{voter.age ?? '—'}</div>
                  </div>
                  <div className="locked-cell">
                    <div className="locked-key">SEX</div>
                    <div className="locked-val ta">{voter.gender ?? '—'}</div>
                  </div>
                  <div className="locked-cell">
                    <div className="locked-key">ROLL NAME</div>
                    <div className="locked-val ta">{voter.nameTa}</div>
                  </div>
                  <div className="locked-cell span2">
                    <div className="locked-key">
                      {voter.relationTypeTa
                        ? (voter.relationTypeTa.includes('பெயர்') ? `${voter.relationTypeTa} NAME` : `${voter.relationTypeTa} பெயர் NAME`)
                        : 'RELATIVE NAME'}
                    </div>
                    <div className="locked-val ta">{voter.relativeNameTa ?? '—'}</div>
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
            <Card className={customFieldDefs.length ? 'mb-4' : ''}>
              <CardHead title="Section C · Survey intelligence" sub="All fields below are optional" icon="clipboard" />
              <div className="card-body">
                {saveError && <div className="mb-4"><Alert tone="bad">{saveError}</Alert></div>}

                <div className="stack">
                  <div>
                    <div className="section-tag"><span className="n">1</span> Voter phone number <span className="t-muted t-sm font-normal">(Optional)</span></div>
                    <Field error={errors.phoneNumber} hint="Optional — 10 digits starting with 6, 7, 8 or 9">
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <PhoneInput
                            value={form.phoneNumber}
                            onChange={(v) => set('phoneNumber', v)}
                            placeholder="9840112233"
                            invalid={!!errors.phoneNumber}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          icon="phone"
                          loading={pickingContact}
                          onClick={() => void handlePickContact()}
                          title="Search device contacts / தொடர்புகளிலிருந்து இறக்குமதி செய்க"
                          className="btn-contact-pick"
                        >
                          <span>Contacts / தொடர்பு</span>
                        </Button>
                      </div>
                    </Field>
                  </div>

                  <div>
                    <div className="section-tag"><span className="n">2</span> Caste / community <span className="t-muted t-sm font-normal">(Optional)</span></div>
                    <Field error={errors.casteId}>
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
                    <div className="section-tag"><span className="n">3</span> Occupation (2-tier) <span className="t-muted t-sm font-normal">(Optional)</span></div>
                    <div className="grid cols-2">
                      <Field label="Main sector" error={errors.sector}>
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
                        label="Specific sub-job" error={errors.jobId}
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
                    <div className="section-tag"><span className="n">4</span> Political leaning <span className="t-muted t-sm font-normal">(Optional)</span></div>
                    {errors.partyId && <div className="mb-2"><span className="error-text">{errors.partyId}</span></div>}
                    {drops
                      ? <PartyGrid parties={drops.parties} value={form.partyId} onChange={(id) => set('partyId', id)} />
                      : <div className="t-sm t-muted">Loading parties…</div>}
                  </div>

                  <div>
                    <div className="section-tag"><span className="n">5</span> Education</div>
                    <Field hint="Optional">
                      <Select value={form.educationId} onChange={(e) => set('educationId', e.target.value)}>
                        <option value="">Select education level…</option>
                        {drops?.educationLevels.map((ed) => (
                          <option key={ed.id} value={ed.id}>{ed.name_ta ? `${ed.name_ta} (${ed.name})` : ed.name}</option>
                        ))}
                      </Select>
                    </Field>
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
              </div>
            </Card>

            {/* ---- Section D: A1-defined custom fields ---- */}
            {customFieldDefs.length > 0 && (
              <Card>
                <CardHead title="Section D · Additional details" sub="Configured by your administrator" icon="layers" />
                <div className="card-body stack">
                  {customFieldDefs.map((def) => (
                    <Field key={def.id} label={def.labelTa ? `${def.label} (${def.labelTa})` : def.label} required={def.isRequired} error={errors[`custom_${def.id}`]}>
                      {def.fieldType === 'select' ? (
                        <Select
                          value={form.customFields[def.id] ?? ''}
                          onChange={(e) => setCustom(def.id, e.target.value)}
                          invalid={!!errors[`custom_${def.id}`]}
                        >
                          <option value="">Select…</option>
                          {(def.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </Select>
                      ) : (
                        <Input
                          type={def.fieldType === 'number' ? 'number' : def.fieldType === 'date' ? 'date' : 'text'}
                          value={form.customFields[def.id] ?? ''}
                          onChange={(e) => setCustom(def.id, e.target.value)}
                          invalid={!!errors[`custom_${def.id}`]}
                        />
                      )}
                    </Field>
                  ))}
                </div>
              </Card>
            )}

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
          </form>
        </div>
      )}

      {/* -------------------- voter records (merged from the old Voter Records page) -------------------- */}
      <div className="section-tag mt-6 mb-3" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="list" size={16} />My Voter Records
      </div>
      <VoterRecordsPanel syncUrl={false} />

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
