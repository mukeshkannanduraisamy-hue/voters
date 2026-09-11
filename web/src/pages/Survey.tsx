import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { DashboardStats, Voter } from '../lib/types';
import {
  Alert, Badge, Button, Card, CardHead, Field, Input, Modal, PageHead,
  Progress, fmt, fmtDate, useToast,
} from '../components/ui';
import { VoterRecordsPanel } from '../components/VoterRecordsPanel';
import { DynamicFieldGrid } from '../components/DynamicField';
import {
  isMulti, isStructural, pruneHidden, validateAnswers,
  type AnswerMap, type FormSchema,
} from '../lib/formSchema';
import { Icon } from '../components/icons';

interface Corrections {
  correctedNameTa: string;
  correctedRelativeNameTa: string;
}

/** Keeps only the last 10 digits, which strips a leading "91" country code or "0" trunk prefix either way. */
const last10Digits = (raw: string) => {
  const digits = raw.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const EMPTY_CORRECTIONS: Corrections = { correctedNameTa: '', correctedRelativeNameTa: '' };

export default function Survey() {
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [voter, setVoter] = useState<Voter | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [corrections, setCorrections] = useState<Corrections>(EMPTY_CORRECTIONS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [pickingContact, setPickingContact] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  /** `epicId::schemaVersion` already seeded, so a re-render never wipes edits. */
  const seededFor = useRef('');

  /**
   * Seeds the dynamic answer map for one elector.
   *
   * System-bound fields read back out of their real survey columns; custom
   * fields come from the stored answers. Either way a re-survey opens with
   * everything the agent recorded last time already filled in, so they are
   * verifying rather than retyping.
   */
  const seedAnswers = (v: Voter, s: FormSchema | null): AnswerMap => {
    const out: AnswerMap = {};
    if (!s) return out;

    const survey = v.survey;
    const bound: Record<string, string> = {
      phone_number: survey?.phoneNumber ?? '',
      caste_id: survey?.casteId ? String(survey.casteId) : '',
      job_id: survey?.jobId ? String(survey.jobId) : '',
      party_id: survey?.partyId ? String(survey.partyId) : '',
      education_id: survey?.educationId ? String(survey.educationId) : '',
      other_job_text: survey?.otherJobText ?? '',
      remarks: survey?.remarks ?? '',
    };
    const stored = new Map((survey?.customFields ?? []).map((c) => [c.key, c.value ?? '']));

    for (const f of s.fields) {
      if (isStructural(f.type)) continue;
      if (f.bind && bound[f.bind] !== undefined) { out[f.key] = bound[f.bind]; continue; }

      const raw = stored.get(f.key) ?? '';
      if (isMulti(f.type)) {
        try {
          const parsed = JSON.parse(raw || '[]');
          out[f.key] = Array.isArray(parsed) ? parsed.map(String) : [];
        } catch { out[f.key] = raw ? [raw] : []; }
      } else {
        out[f.key] = raw;
      }
    }

    // The occupation sector isn't stored — it's a filter for the sub-job — so
    // derive it from whichever job was recorded to keep the cascade consistent.
    const sectorField = s.fields.find((f) => f.source?.kind === 'master' && f.source.master === 'job_sector');
    if (sectorField && survey?.jobCategory) out[sectorField.key] = survey.jobCategory;

    return out;
  };

  useEffect(() => {
    api.get<FormSchema>('/api/form-schema/published')
      .then(setSchema)
      .catch(() => toast.bad('Could not load the survey form', 'Ask your Super Admin to publish a form version.'));
    api.get<DashboardStats>('/api/dashboard/stats').then(setStats).catch(() => { /* banner degrades */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep link: /survey/booth?epic=XXXX opens that elector directly.
  useEffect(() => {
    const epic = params.get('epic');
    if (epic && (!voter || voter.epicId !== epic)) void openVoter(epic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('epic'), schema]);

  /**
   * Pre-fill on re-survey.
   *
   * The elector and the published schema arrive from two independent requests,
   * and on a deep link the elector usually wins the race — seeding inside
   * `selectVoter` would then run against a null schema and silently produce an
   * empty form. Seeding from an effect instead means whichever arrives last
   * triggers the fill. The ref keys on elector + schema version so an agent's
   * in-progress edits are never overwritten by a later re-render.
   */
  useEffect(() => {
    if (!schema || !voter) return;
    const key = `${voter.epicId}::${schema.version}`;
    if (seededFor.current === key) return;
    seededFor.current = key;
    setAnswers(seedAnswers(voter, schema));
    setCorrections({
      correctedNameTa: voter.survey?.correctedNameTa ?? '',
      correctedRelativeNameTa: voter.survey?.correctedRelativeNameTa ?? '',
    });
  }, [schema, voter]);

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
    seededFor.current = '';   // force the seeding effect to run for this record
    setVoter(v);
    setErrors({});
    setSaveError('');
    setParams({ epic: v.epicId }, { replace: true });
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const setAnswer = (key: string, value: string | string[]) => {
    setAnswers((prev) => {
      const next = { ...prev, [key]: value };
      // Changing a parent answer can hide a child; clear it straight away so
      // the agent never submits a value for a question they can no longer see.
      return schema ? pruneHidden(schema.fields, next) : next;
    });
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  };

  const setCorrection = (key: 'correctedNameTa' | 'correctedRelativeNameTa', value: string) => {
    setCorrections((c) => ({ ...c, [key]: value }));
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setSaveError('');
    if (!voter || !schema) return;

    const cleaned = pruneHidden(schema.fields, answers);
    const found = validateAnswers(schema.fields, cleaned);
    if (Object.keys(found).length) {
      setErrors(found);
      setSaveError('Please correct the highlighted fields before saving.');
      return;
    }

    setSaving(true);
    try {
      const res = await api.post<{ updated: boolean; voter: Voter }>('/api/voters/survey/submit', {
        epicId: voter.epicId,
        correctedNameTa: corrections.correctedNameTa.trim(),
        correctedRelativeNameTa: corrections.correctedRelativeNameTa.trim(),
        answers: cleaned,
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
    seededFor.current = '';
    setVoter(null); setAnswers({}); setCorrections(EMPTY_CORRECTIONS);
    setErrors({}); setSaveError('');
    setParams({}, { replace: true });
  };

  const dismissSavedPopup = () => {
    setSavedName(null);
    clearAll(); // "redirect to main page" — back to the search landing state
  };

  /** The first phone field in the schema, so Contacts import targets the right key. */
  const phoneFieldKey = useMemo(
    () => schema?.fields.find((f) => f.type === 'phone' && f.active !== false)?.key ?? null,
    [schema]
  );

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
            const digits = last10Digits(String(rawTel));
            if (digits.length === 10) {
              if (phoneFieldKey) setAnswer(phoneFieldKey, digits);
              const cName = c.name ? (Array.isArray(c.name) ? c.name[0] : c.name) : '';
              toast.ok('Contact imported', cName ? `${cName}: ${digits}` : digits);
            } else if (digits.length > 0) {
              if (phoneFieldKey) setAnswer(phoneFieldKey, digits);
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
        const digits = last10Digits(text);
        if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
          if (phoneFieldKey) setAnswer(phoneFieldKey, digits);
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
                      className="ta" value={corrections.correctedNameTa}
                      onChange={(e) => setCorrection('correctedNameTa', e.target.value)}
                      placeholder="வாக்காளர் பெயர்"
                    />
                  </Field>
                  <Field label={`Corrected relative name (${voter.relationTypeTa ?? 'father / husband'})`} error={errors.correctedRelativeNameTa}>
                    <Input
                      className="ta" value={corrections.correctedRelativeNameTa}
                      onChange={(e) => setCorrection('correctedRelativeNameTa', e.target.value)}
                      placeholder="உறவினர் பெயர்"
                    />
                  </Field>
                </div>
              </div>
            </Card>

            {/* ---- Sections C & D: rendered from the published schema ---- */}
            <Card>
              <CardHead
                title={schema ? schema.title : "Survey intelligence"}
                sub={schema ? `Form version ${schema.version}` : "Loading the published form…"}
                icon="clipboard"
              />
              <div className="card-body">
                {saveError && <div className="mb-4"><Alert tone="bad">{saveError}</Alert></div>}
                {!schema ? (
                  <span className="t-muted t-sm">Loading the survey form…</span>
                ) : schema.fields.length === 0 ? (
                  <Alert tone="warn">No survey questions are published yet. Ask your Super Admin to publish the form.</Alert>
                ) : (
                  <DynamicFieldGrid
                    fields={schema.fields}
                    values={answers}
                    errors={errors}
                    onChange={setAnswer}
                  />
                )}
              </div>
            </Card>

            <div className="survey-actions">
              <Button
                type="button" icon="refresh" disabled={saving}
                onClick={() => {
                  setAnswers(seedAnswers(voter, schema));
                  setCorrections({
                    correctedNameTa: voter.survey?.correctedNameTa ?? '',
                    correctedRelativeNameTa: voter.survey?.correctedRelativeNameTa ?? '',
                  });
                  setErrors({}); setSaveError('');
                }}
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
