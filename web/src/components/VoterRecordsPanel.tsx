import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { BoothTree, Directory, Dropdowns, FormFieldDef, Voter } from '../lib/types';
import {
  Alert, Badge, Button, Card, CardHead, Empty, Field, Input, Modal, Pager,
  PhoneInput, Segmented, Select, TableSkeleton, Textarea, fmt, fmtDate, useToast,
} from './ui';
import { LocalBodyBadge, PartyGrid, PartySymbol, SortHeader } from './spec-ui';
import { Icon } from './icons';

type QuickFilter = 'all' | 'mine' | 'pending';

/**
 * The filterable, sortable voter records table — quick filter, filter row,
 * table, pager and citizen dossier. Shared by the standalone Voters Directory
 * page (A1/A2) and embedded below the search/survey flow on the A3 Field
 * Survey page, so both surfaces get filter/sort/edit fixes for free.
 *
 * `syncUrl` is off inside Survey.tsx because that page already owns the
 * `?epic=` query param for its own deep-link — both components replacing the
 * full query string would fight over it.
 */
export function VoterRecordsPanel({ syncUrl = true }: { syncUrl?: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [data, setData] = useState<Directory | null>(null);
  const [tree, setTree] = useState<BoothTree | null>(null);
  const [drops, setDrops] = useState<Dropdowns | null>(null);
  const [customFieldDefs, setCustomFieldDefs] = useState<FormFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Voter | null>(null);
  const [exporting, setExporting] = useState(false);

  // The dashboard deep-links here with ?local_body=…, so seed from the URL
  // when this panel owns the query string.
  const [search, setSearch] = useState(syncUrl ? params.get('search') ?? '' : '');
  const [localBody, setLocalBody] = useState(syncUrl ? params.get('local_body') ?? '' : '');
  const [partNo, setPartNo] = useState(syncUrl ? params.get('part_no') ?? '' : '');
  const [gender, setGender] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [limit, setLimit] = useState(25);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('voter_sno');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const canExport = user?.role !== 'A3_FIELD_AGENT';
  const canEditDirectly = user?.role === 'A1_SUPER_ADMIN' || user?.role === 'A2_SUPERVISOR';
  const isAgent = user?.role === 'A3_FIELD_AGENT';

  // Derive the actual API params from the quick filter — "mine" resolves to
  // the caller's own id server-side via the special 'me' token.
  const status = quickFilter === 'pending' ? 'pending' : '';
  const agentId = quickFilter === 'mine' ? 'me' : '';

  useEffect(() => {
    api.get<BoothTree>('/api/booths').then(setTree).catch(() => { /* filters degrade to text search */ });
    api.get<Dropdowns>('/api/masters/dropdowns').then(setDrops).catch(() => { /* edit modal degrades */ });
    api.get<FormFieldDef[]>('/api/form-fields').then(setCustomFieldDefs).catch(() => { /* optional */ });
  }, []);

  const filters = useMemo(
    () => ({ search, local_body: localBody, part_no: partNo, gender, status, agent_id: agentId, limit, page, sort_by: sortBy, sort_dir: sortDir }),
    [search, localBody, partNo, gender, status, agentId, limit, page, sortBy, sortDir]
  );

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.get<Directory>(`/api/voters/directory${qs(filters)}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 320 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => { setPage(1); }, [search, localBody, partNo, gender, quickFilter, limit]);

  // Keep the URL in step so a filtered view can be shared or reloaded —
  // skipped entirely when embedded, so this never clobbers a sibling ?epic=.
  useEffect(() => {
    if (!syncUrl) return;
    const next: Record<string, string> = {};
    if (search) next.search = search;
    if (localBody) next.local_body = localBody;
    if (partNo) next.part_no = partNo;
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, localBody, partNo, syncUrl]);

  // Selecting a local body narrows the booth list; clearing it drops a stale booth.
  const boothOptions = useMemo(() => {
    if (!tree) return [];
    return localBody ? tree.parts.filter((p) => p.local_body_name_ta === localBody) : tree.parts;
  }, [tree, localBody]);

  useEffect(() => {
    if (partNo && !boothOptions.some((b) => String(b.part_no) === partNo)) setPartNo('');
  }, [boothOptions, partNo]);

  const onSort = (column: string) => {
    if (sortBy === column) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(column); setSortDir('asc'); }
    setPage(1);
  };

  const doExport = async () => {
    setExporting(true);
    try {
      await api.download(
        `/api/reports/export${qs({ search, local_body: localBody, part_no: partNo, gender, status })}`,
        'vms-survey-report.xlsx'
      );
      toast.ok('Export started', 'The workbook is downloading.');
    } catch (err) {
      toast.bad('Export failed', err instanceof ApiError ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setSearch(''); setLocalBody(''); setPartNo(''); setGender(''); setQuickFilter('all');
  };
  const hasFilters = !!(search || localBody || partNo || gender || quickFilter !== 'all');

  const refreshAfterEdit = (updated: Voter) => {
    setDetail(updated);
    void load();
  };

  return (
    <>
      <Card className="mb-4">
        <div className="card-body tight stack tight">
          {/* Quick filter: what an agent actually wants day to day — what have I
              finished, and what's still left — without hand-building a filter. */}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <Segmented
              value={quickFilter}
              onChange={setQuickFilter}
              options={[
                { value: 'all' as QuickFilter, label: 'All electors' },
                { value: 'mine' as QuickFilter, label: isAgent ? 'Done by me' : 'Done by agent' },
                { value: 'pending' as QuickFilter, label: 'All pending' },
              ]}
            />
            {hasFilters && <Button size="sm" icon="x" onClick={clearFilters}>Reset filters</Button>}
          </div>
          <div className="row">
            <div style={{ flex: '2 1 260px', minWidth: 210 }}>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name (Tamil), door no, EPIC ID or serial…"
                aria-label="Search voters"
              />
            </div>
            <Select value={localBody} onChange={(e) => setLocalBody(e.target.value)} aria-label="Filter by local body" style={{ flex: '1 1 180px' }}>
              <option value="">All local bodies</option>
              {tree?.localBodies.map((lb) => (
                <option key={lb.name} value={lb.name}>{lb.name} ({lb.part_count})</option>
              ))}
            </Select>
            <Select value={partNo} onChange={(e) => setPartNo(e.target.value)} aria-label="Filter by polling booth" style={{ flex: '1 1 160px' }}>
              <option value="">All polling booths</option>
              {boothOptions.map((b) => (
                <option key={b.part_no} value={b.part_no}>Booth {b.part_no} ({b.voter_count})</option>
              ))}
            </Select>
            <Select value={gender} onChange={(e) => setGender(e.target.value)} aria-label="Filter by gender" style={{ flex: '0 1 150px' }}>
              <option value="">All genders</option>
              <option value="ஆண்">ஆண் (Male)</option>
              <option value="பெண்">பெண் (Female)</option>
              <option value="மூன்றாம்">மூன்றாம் (Third)</option>
            </Select>
            <Select
              value={String(limit)}
              onChange={(e) => setLimit(Number(e.target.value))}
              aria-label="Rows per page"
              style={{ flex: '0 1 110px' }}
            >
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} rows</option>)}
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead
          title={data ? `${fmt(data.total)} elector${data.total === 1 ? '' : 's'}` : 'Electors'}
          sub={hasFilters ? 'Filtered results' : undefined}
          icon="list"
          actions={
            <>
              {canExport && (
                <Button size="sm" icon="download" loading={exporting} onClick={() => void doExport()}>Export</Button>
              )}
              <Button className="icon-btn" icon="refresh" onClick={() => void load()} aria-label="Refresh" />
            </>
          }
        />
        <div className="card-body flush">
          {error && <div style={{ padding: 'var(--sp-4)' }}><Alert tone="bad">{error}</Alert></div>}

          {loading ? (
            <TableSkeleton rows={8} cols={8} />
          ) : !data || data.rows.length === 0 ? (
            <Empty icon="search" title="No electors match">
              {hasFilters ? 'Try widening or clearing your filters.' : 'No electors are visible in your assigned booths.'}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table table-clickable">
                <thead>
                  <tr>
                    <th><SortHeader label="S.No" column="voter_sno" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /></th>
                    <th><SortHeader label="EPIC ID" column="epic_id" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /></th>
                    <th><SortHeader label="Voter name" column="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /></th>
                    <th>Relative name</th>
                    <th>Survey status</th>
                    <th style={{ width: 56 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((v) => (
                    <tr key={v.epicId} onClick={() => setDetail(v)}>
                      <td className="tabnum t-sm">{v.voterSno ?? '—'}</td>
                      <td className="mono t-sm t-semi">{v.epicId}</td>
                      <td>
                        <div className="ta t-semi" title={v.nameTa}>{v.survey?.correctedNameTa ?? v.nameTa}</div>
                        {v.survey?.correctedNameTa && v.survey.correctedNameTa !== v.nameTa && (
                          <span className="badge badge-brand ta" style={{ fontSize: 10 }}>திருத்தப்பட்டது</span>
                        )}
                      </td>
                      {/* Shown directly in its own column (not nested behind a
                          click) so the relative/father name is visible at a glance. */}
                      <td className="ta t-sm t-muted">
                        {v.relativeNameTa ?? '—'}
                        {v.relationTypeTa && <div className="t-xs t-subtle ta">{v.relationTypeTa}</div>}
                      </td>
                      <td>
                        {v.surveyed ? (
                          <div className="row tight" style={{ flexWrap: 'nowrap' }}>
                            {v.survey?.partyCode && (
                              <PartySymbol
                                party={{
                                  name: v.survey.partyName ?? '', party_code: v.survey.partyCode,
                                  color_code: v.survey.colorCode ?? '#64748b', symbol_img: v.survey.symbolImg,
                                }}
                                size={24}
                              />
                            )}
                            <div style={{ minWidth: 0 }}>
                              <Badge tone="ok" dot>{v.survey?.partyCode ?? 'Surveyed'}</Badge>
                              {v.survey?.phoneNumber && <div className="t-xs t-subtle mono">{v.survey.phoneNumber}</div>}
                            </div>
                          </div>
                        ) : (
                          <Badge tone="warn" dot>Pending</Badge>
                        )}
                      </td>
                      <td>
                        <Button size="sm" icon="eye" aria-label="View dossier" onClick={(e) => { e.stopPropagation(); setDetail(v); }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {data && data.total > limit && (
          <Pager page={page} pages={data.pages} total={data.total} pageSize={limit} onPage={setPage} />
        )}
      </Card>

      {detail && (
        <CitizenDossier
          voter={detail}
          isAgent={isAgent}
          canEditDirectly={canEditDirectly}
          drops={drops}
          customFieldDefs={customFieldDefs}
          onClose={() => setDetail(null)}
          onSaved={refreshAfterEdit}
        />
      )}
    </>
  );
}

/* ============================ citizen dossier ============================ */
function CitizenDossier({ voter, isAgent, canEditDirectly, drops, customFieldDefs, onClose, onSaved }: {
  voter: Voter; isAgent: boolean; canEditDirectly: boolean;
  drops: Dropdowns | null; customFieldDefs: FormFieldDef[];
  onClose: () => void; onSaved: (v: Voter) => void;
}) {
  const [editing, setEditing] = useState(false);
  const s = voter.survey;

  if (editing) {
    return (
      <EditSurveyModal
        voter={voter}
        drops={drops}
        customFieldDefs={customFieldDefs}
        onCancel={() => setEditing(false)}
        onSaved={(v) => { setEditing(false); onSaved(v); }}
      />
    );
  }

  return (
    <Modal
      open wide
      title={voter.nameTa}
      icon="user"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {s?.phoneNumber && (
            <a className="btn btn-secondary" href={`tel:+91${s.phoneNumber}`}>
              <Icon name="phone" size={16} />Call {s.phoneNumber}
            </a>
          )}
          {canEditDirectly && (
            <Button variant="primary" icon="edit" onClick={() => setEditing(true)}>
              {voter.surveyed ? 'Edit survey' : 'Enter survey'}
            </Button>
          )}
          {isAgent && (
            <Link className="btn btn-primary" to={`/survey/booth?epic=${encodeURIComponent(voter.epicId)}`}>
              <Icon name="clipboard" size={16} />{voter.surveyed ? 'Update survey' : 'Start survey'}
            </Link>
          )}
        </>
      }
    >
      <div className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="mono t-semi">{voter.epicId}</span>
          <div className="row tight">
            <LocalBodyBadge type={voter.localBodyType} />
            {voter.surveyed ? <Badge tone="ok" dot>Survey completed</Badge> : <Badge tone="warn" dot>Survey pending</Badge>}
          </div>
        </div>

        <div>
          <div className="section-tag ta">அதிகாரப்பூர்வ வாக்காளர் பட்டியல் · Official roll (read-only)</div>
          <div className="locked-grid">
            <Cell k="Voter name" v={voter.nameTa} ta />
            <Cell k={voter.relationTypeTa ?? 'Relative name'} v={voter.relativeNameTa ?? '—'} ta />
            <Cell k="Serial no" v={String(voter.voterSno ?? '—')} />
            <Cell k="Age / Sex" v={`${voter.age ?? '—'} / ${voter.gender ?? '—'}`} ta />
            <Cell k="Door no" v={voter.doorNo ?? '—'} />
            <Cell k="Polling booth" v={`Booth ${voter.partNo}`} />
            <Cell k="Local body" v={voter.localBodyNameTa} ta />
            <Cell k="Constituency" v={`AC ${voter.acNo} - ${voter.acNameTa}`} ta />
            {voter.mainVillageTa && <Cell k="Town / Village" v={voter.mainVillageTa} ta />}
            {voter.pincode && <Cell k="Pincode" v={voter.pincode} />}
            {voter.sectionTitleTa && <Cell k="Section" v={voter.sectionTitleTa} span2 ta />}
          </div>
        </div>

        {s ? (
          <div>
            <div className="section-tag ta">கள கணக்கெடுப்பு விபரம் · Field survey intelligence</div>

            {s.partyCode && (
              <div
                className="row"
                style={{
                  marginBottom: 'var(--sp-3)', padding: 'var(--sp-3)',
                  borderRadius: 'var(--r-md)', flexWrap: 'nowrap',
                  background: `color-mix(in srgb, ${s.colorCode ?? '#64748b'} 10%, var(--surface-2))`,
                  border: `1px solid color-mix(in srgb, ${s.colorCode ?? '#64748b'} 30%, transparent)`,
                }}
              >
                <PartySymbol
                  party={{ name: s.partyName ?? '', party_code: s.partyCode, color_code: s.colorCode ?? '#64748b', symbol_img: s.symbolImg }}
                  size={46}
                />
                <div style={{ minWidth: 0 }}>
                  <div className="t-semi">{s.partyName}</div>
                  {s.partyNameTa && <div className="t-sm ta t-muted">{s.partyNameTa}</div>}
                </div>
              </div>
            )}

            <div className="locked-grid">
              <Cell k="Phone number" v={s.phoneNumber} mono />
              <Cell k="Caste / community" v={`${s.casteNameTa ?? s.casteName ?? '—'}${s.casteCategory ? ` (${s.casteCategory})` : ''}`} ta />
              <Cell k="Occupation sector" v={s.jobCategoryTa ?? s.jobCategory ?? '—'} ta />
              <Cell k="Occupation" v={s.jobNameTa ?? s.jobName ?? '—'} ta />
              {s.otherJobText && <Cell k="Custom job note" v={s.otherJobText} span2 ta />}
              {s.educationName && <Cell k="Education" v={s.educationNameTa ? `${s.educationNameTa} (${s.educationName})` : s.educationName} ta />}
              {s.correctedNameTa && <Cell k="Corrected name" v={s.correctedNameTa} ta />}
              {s.correctedRelativeNameTa && <Cell k="Corrected relative name" v={s.correctedRelativeNameTa} ta />}
              {s.remarks && <Cell k="Remarks" v={s.remarks} span2 ta />}
              <Cell k="Surveyed by" v={s.agentName ?? 'Unknown'} />
              <Cell k="Surveyed at" v={fmtDate(s.surveyedAt, true)} />
              {s.lastEditorName && s.lastEditorName !== s.agentName && <Cell k="Last edited by" v={s.lastEditorName} />}
              {(s.customFields ?? []).filter((cf) => cf.value).map((cf) => (
                <Cell key={cf.fieldId} k={cf.labelTa ? `${cf.label} (${cf.labelTa})` : cf.label} v={cf.value ?? '—'} ta />
              ))}
            </div>
          </div>
        ) : (
          <Alert tone="warn">No field survey has been collected for this elector yet.</Alert>
        )}
      </div>
    </Modal>
  );
}

/* ========================= A1/A2 direct edit modal ======================== */
function EditSurveyModal({ voter, drops, customFieldDefs, onCancel, onSaved }: {
  voter: Voter; drops: Dropdowns | null; customFieldDefs: FormFieldDef[];
  onCancel: () => void; onSaved: (v: Voter) => void;
}) {
  const toast = useToast();
  const s = voter.survey;
  const initialJob = s?.jobId ? drops?.jobs.find((j) => j.id === s.jobId) : undefined;

  const [correctedNameTa, setCorrectedNameTa] = useState(s?.correctedNameTa ?? voter.nameTa ?? '');
  const [correctedRelativeNameTa, setCorrectedRelativeNameTa] = useState(s?.correctedRelativeNameTa ?? voter.relativeNameTa ?? '');
  const [phoneNumber, setPhoneNumber] = useState(s?.phoneNumber ?? '');
  const [casteId, setCasteId] = useState(s?.casteId ? String(s.casteId) : '');
  const [sector, setSector] = useState(initialJob?.category ?? s?.jobCategory ?? '');
  const [jobId, setJobId] = useState(s?.jobId ? String(s.jobId) : '');
  const [partyId, setPartyId] = useState<number | null>(s?.partyId ?? null);
  const [educationId, setEducationId] = useState(s?.educationId ? String(s.educationId) : '');
  const [remarks, setRemarks] = useState(s?.remarks ?? '');
  const [customFields, setCustomFields] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const cf of s?.customFields ?? []) if (cf.value !== null) init[cf.fieldId] = cf.value;
    return init;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const subJobs = useMemo(() => drops?.sectors.find((x) => x.category === sector)?.jobs ?? [], [drops, sector]);

  const onSectorChange = (value: string) => {
    const first = drops?.sectors.find((x) => x.category === value)?.jobs[0];
    setSector(value);
    setJobId(first ? String(first.id) : '');
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setErrors({});
    try {
      const res = await api.post<{ updated: boolean; voter: Voter }>('/api/voters/survey/submit', {
        epicId: voter.epicId,
        correctedNameTa: correctedNameTa.trim(),
        correctedRelativeNameTa: correctedRelativeNameTa.trim(),
        phoneNumber: phoneNumber.trim(),
        casteId: casteId ? Number(casteId) : null,
        jobId: jobId ? Number(jobId) : null,
        partyId,
        educationId: educationId ? Number(educationId) : null,
        remarks: remarks.trim(),
        customFields,
      });
      setSaving(true);
      toast.ok(res.updated ? 'Survey updated' : 'Survey saved', `${voter.nameTa} · ${voter.epicId}`);
      onSaved(res.voter);
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); setError(err.message); }
      else setError('Could not save the survey.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open wide title={`Edit survey — ${voter.nameTa}`} icon="edit" onClose={onCancel}
      footer={<>
        <Button onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button variant="primary" icon="save" loading={saving} onClick={(e) => save(e as unknown as FormEvent)}>Save survey</Button>
      </>}
    >
      {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}
      <form onSubmit={save} className="stack">
        <div className="grid cols-2">
          <Field label="Corrected name (Tamil)"><Input className="ta" value={correctedNameTa} onChange={(e) => setCorrectedNameTa(e.target.value)} /></Field>
          <Field label={`Corrected relative name (${voter.relationTypeTa ?? 'father / husband'})`}>
            <Input className="ta" value={correctedRelativeNameTa} onChange={(e) => setCorrectedRelativeNameTa(e.target.value)} />
          </Field>
        </div>
        <Field label="Phone number" required error={errors.phoneNumber}>
          <PhoneInput value={phoneNumber} onChange={setPhoneNumber} invalid={!!errors.phoneNumber} />
        </Field>
        <Field label="Caste / community" required error={errors.casteId}>
          <Select value={casteId} onChange={(e) => setCasteId(e.target.value)} invalid={!!errors.casteId}>
            <option value="">Select caste…</option>
            {drops?.castes.map((c) => <option key={c.id} value={c.id}>{c.category} — {c.name}{c.name_ta ? ` / ${c.name_ta}` : ''}</option>)}
          </Select>
        </Field>
        <div className="grid cols-2">
          <Field label="Occupation sector" required error={errors.sector}>
            <Select value={sector} onChange={(e) => onSectorChange(e.target.value)} invalid={!!errors.sector}>
              <option value="">Select sector…</option>
              {drops?.sectors.map((sec) => <option key={sec.category} value={sec.category}>{sec.category}</option>)}
            </Select>
          </Field>
          <Field label="Specific sub-job" required error={errors.jobId}>
            <Select value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={!sector} invalid={!!errors.jobId}>
              <option value="">Select sub-job…</option>
              {subJobs.map((j) => <option key={j.id} value={j.id}>{j.name_ta ? `${j.name_ta} (${j.name})` : j.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Education" hint="Optional">
          <Select value={educationId} onChange={(e) => setEducationId(e.target.value)}>
            <option value="">Select education level…</option>
            {drops?.educationLevels.map((ed) => <option key={ed.id} value={ed.id}>{ed.name_ta ? `${ed.name_ta} (${ed.name})` : ed.name}</option>)}
          </Select>
        </Field>
        <Field label="Political leaning" required error={errors.partyId}>
          {drops ? <PartyGrid parties={drops.parties} value={partyId} onChange={setPartyId} /> : <div className="t-sm t-muted">Loading…</div>}
        </Field>
        {customFieldDefs.length > 0 && (
          <div className="stack tight">
            <div className="section-tag">Additional details</div>
            {customFieldDefs.map((def) => (
              <Field key={def.id} label={def.labelTa ? `${def.label} (${def.labelTa})` : def.label} required={def.isRequired} error={errors[`custom_${def.id}`]}>
                {def.fieldType === 'select' ? (
                  <Select value={customFields[def.id] ?? ''} onChange={(e) => setCustomFields((c) => ({ ...c, [def.id]: e.target.value }))} invalid={!!errors[`custom_${def.id}`]}>
                    <option value="">Select…</option>
                    {(def.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </Select>
                ) : (
                  <Input
                    type={def.fieldType === 'number' ? 'number' : def.fieldType === 'date' ? 'date' : 'text'}
                    value={customFields[def.id] ?? ''}
                    onChange={(e) => setCustomFields((c) => ({ ...c, [def.id]: e.target.value }))}
                    invalid={!!errors[`custom_${def.id}`]}
                  />
                )}
              </Field>
            ))}
          </div>
        )}
        <Field label="Remarks" hint="Optional">
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
        </Field>
      </form>
    </Modal>
  );
}

function Cell({ k, v, span2, mono, ta }: { k: string; v: string; span2?: boolean; mono?: boolean; ta?: boolean }) {
  return (
    <div className={`locked-cell ${span2 ? 'span2' : ''}`}>
      <div className="locked-key">{k}</div>
      <div className={`locked-val ${mono ? 'mono' : ''} ${ta ? 'ta' : ''}`}>{v}</div>
    </div>
  );
}
