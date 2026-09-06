import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError, api } from '../lib/api';
import type {
  CasteCategory, CasteRow, EducationRow, JobRow, JobSectorGroup, LocalBodyList, LocalBodyRow, PartyRow,
} from '../lib/types';
import {
  Alert, Badge, Button, Card, CardHead, ConfirmModal, Empty, Field, Input, Modal, PageHead,
  Segmented, Select, Switch, TableSkeleton, fmt, fmtDate, useToast,
} from '../components/ui';
import { ImageUploader, LocalBodyBadge, PartySymbol } from '../components/spec-ui';
import { Icon } from '../components/icons';

type Tab = 'caste' | 'job' | 'party' | 'education' | 'local-body';

const CATEGORIES: CasteCategory[] = ['OC', 'BC', 'BCM', 'MBC', 'SC', 'ST', 'OTHER'];
const CATEGORY_LABEL: Record<CasteCategory, string> = {
  OC: 'OC — Open Competition',
  BC: 'BC — Backward Class',
  BCM: 'BCM — BC Muslim',
  MBC: 'MBC — Most Backward Class',
  SC: 'SC — Scheduled Caste',
  ST: 'ST — Scheduled Tribe',
  OTHER: 'Other / Not Disclosed',
};

export default function Masters() {
  const [tab, setTab] = useState<Tab>('caste');
  return (
    <>
      <PageHead
        title="Master Configuration"
        sub="Dropdown options available to field agents during the survey"
      />
      <div className="mb-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'caste' as Tab, label: '1. Caste Master' },
            { value: 'job' as Tab, label: '2. Job Master' },
            { value: 'party' as Tab, label: '3. Party Master' },
            { value: 'education' as Tab, label: '4. Education Master' },
            { value: 'local-body' as Tab, label: '5. Local Body Master' },
          ]}
        />
      </div>
      {tab === 'caste' && <CasteMaster />}
      {tab === 'job' && <JobMaster />}
      {tab === 'party' && <PartyMaster />}
      {tab === 'education' && <EducationMaster />}
      {tab === 'local-body' && <LocalBodyMaster />}
    </>
  );
}

/* ============================= education master =========================== */
function EducationMaster() {
  const toast = useToast();
  const [rows, setRows] = useState<EducationRow[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<EducationRow | null>(null);
  const [deleting, setDeleting] = useState<EducationRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [nameTa, setNameTa] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const load = async () => {
    setRows(null);
    setError('');
    try { setRows(await api.get<EducationRow[]>('/api/masters/education')); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not load education master'); }
  };
  useEffect(() => { void load(); }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setAddError('');
    if (name.trim().length < 2) { setAddError('Enter at least 2 characters.'); return; }
    setAdding(true);
    try {
      await api.post('/api/masters/education', { name: name.trim(), name_ta: nameTa.trim() });
      toast.ok('Education level added', name.trim());
      setName(''); setNameTa('');
      await load();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Could not add the entry');
    } finally { setAdding(false); }
  };

  const toggle = async (r: EducationRow) => {
    setBusyId(r.id);
    try {
      await api.patch(`/api/masters/education/${r.id}`, { is_active: !r.is_active });
      await load();
    } catch (err) { toast.bad('Could not update', err instanceof ApiError ? err.message : undefined); }
    finally { setBusyId(null); }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await api.del(`/api/masters/education/${deleting.id}`);
      toast.ok('Entry deleted', deleting.name);
      setDeleting(null);
      await load();
    } catch (err) { toast.bad('Could not delete', err instanceof ApiError ? err.message : undefined); setDeleting(null); }
    finally { setBusyId(null); }
  };

  const filtered = (rows ?? []).filter((r) =>
    !q.trim() || r.name.toLowerCase().includes(q.toLowerCase()) || (r.name_ta ?? '').includes(q)
  );

  return (
    <>
      <Card className="mb-4">
        <CardHead title="Add new education level" icon="plus" />
        <div className="card-body">
          <form onSubmit={add}>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 220px' }}>
                <Field label="Education level (English)" required error={addError}>
                  <Input value={name} onChange={(e) => { setName(e.target.value); setAddError(''); }} placeholder="e.g. Higher Secondary" invalid={!!addError} maxLength={100} />
                </Field>
              </div>
              <div style={{ flex: '1 1 220px' }}>
                <Field label="Education level (Tamil)">
                  <Input className="ta" value={nameTa} onChange={(e) => setNameTa(e.target.value)} placeholder="மேல்நிலைக் கல்வி" maxLength={100} />
                </Field>
              </div>
              <Button type="submit" variant="primary" icon="save" loading={adding}>Save</Button>
            </div>
          </form>
        </div>
      </Card>

      <Card>
        <CardHead
          title="Education master"
          sub={rows ? `${fmt(rows.length)} total · ${fmt(rows.filter((r) => r.is_active).length)} active` : undefined}
          icon="database"
          actions={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" style={{ width: 200 }} aria-label="Search education levels" />}
        />
        <div className="card-body flush">
          {error && <div style={{ padding: 'var(--sp-4)' }}><Alert tone="bad">{error}</Alert></div>}
          {!rows ? <TableSkeleton rows={6} cols={4} /> : filtered.length === 0 ? (
            <Empty icon="database" title="No education levels found" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 52 }}>#</th>
                    <th>Education level</th>
                    <th>Status</th>
                    <th className="num">Used by</th>
                    <th>Created</th>
                    <th style={{ width: 190 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.6 }}>
                      <td><span className="rank">{i + 1}</span></td>
                      <td>
                        <div className="t-semi">{r.name}</div>
                        {r.name_ta && <div className="t-sm ta t-muted">{r.name_ta}</div>}
                      </td>
                      <td>{r.is_active ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="muted" dot>Disabled</Badge>}</td>
                      <td className="num tabnum">{r.usage_count ? <Badge tone="ok">{fmt(r.usage_count)}</Badge> : <span className="t-subtle">—</span>}</td>
                      <td className="t-sm t-muted">{fmtDate(r.created_at)}</td>
                      <td>
                        <div className="actions">
                          <Button size="sm" icon="edit" onClick={() => setEditing(r)}>Edit</Button>
                          <Button size="sm" icon={r.is_active ? 'ban' : 'check'} loading={busyId === r.id} onClick={() => void toggle(r)}>
                            {r.is_active ? 'Disable' : 'Enable'}
                          </Button>
                          <Button size="sm" variant="danger-soft" icon="trash" aria-label="Delete" onClick={() => setDeleting(r)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {editing && <EditEducationModal row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
      <ConfirmModal
        open={!!deleting} danger title={`Delete "${deleting?.name}"?`} confirmLabel="Delete"
        busy={busyId === deleting?.id}
        message={deleting?.usage_count
          ? <>Used by <strong>{fmt(deleting.usage_count)}</strong> survey record(s), so it cannot be deleted. Disable it instead.</>
          : <>This removes the education level permanently.</>}
        onCancel={() => setDeleting(null)} onConfirm={() => void remove()}
      />
    </>
  );
}

function EditEducationModal({ row, onClose, onSaved }: { row: EducationRow; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(row.name);
  const [nameTa, setNameTa] = useState(row.name_ta ?? '');
  const [active, setActive] = useState(row.is_active);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError('');
    if (name.trim().length < 2) { setError('Name must be at least 2 characters.'); return; }
    setSaving(true);
    try {
      await api.patch(`/api/masters/education/${row.id}`, { name: name.trim(), name_ta: nameTa.trim(), is_active: active });
      toast.ok('Education level updated', name.trim());
      onSaved();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not save changes'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open title="Edit education level" icon="edit" onClose={onClose}
      footer={<><Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" icon="save" loading={saving} onClick={() => void save()}>Save changes</Button></>}>
      {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}
      <div className="stack">
        <Field label="Education level (English)" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Education level (Tamil)"><Input className="ta" value={nameTa} onChange={(e) => setNameTa(e.target.value)} /></Field>
        <Field label="Status"><Switch checked={active} onChange={setActive} label={active ? 'Active — shown to agents' : 'Disabled — hidden'} /></Field>
        {!!row.usage_count && <Alert tone="info">Used by <strong>{fmt(row.usage_count)}</strong> survey record(s).</Alert>}
      </div>
    </Modal>
  );
}

/* ============================== caste master ============================= */
function CasteMaster() {
  const toast = useToast();
  const [rows, setRows] = useState<CasteRow[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<CasteRow | null>(null);
  const [deleting, setDeleting] = useState<CasteRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [nameTa, setNameTa] = useState('');
  const [category, setCategory] = useState<CasteCategory>('BC');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const load = async () => {
    setRows(null);
    setError('');
    try { setRows(await api.get<CasteRow[]>('/api/masters/caste')); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not load caste master'); }
  };
  useEffect(() => { void load(); }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setAddError('');
    if (name.trim().length < 2) { setAddError('Enter at least 2 characters.'); return; }
    setAdding(true);
    try {
      await api.post('/api/masters/caste', { name: name.trim(), name_ta: nameTa.trim(), category });
      toast.ok('Caste added', name.trim());
      setName(''); setNameTa(''); setCategory('BC');
      await load();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Could not add the entry');
    } finally { setAdding(false); }
  };

  const toggle = async (r: CasteRow) => {
    setBusyId(r.id);
    try {
      await api.patch(`/api/masters/caste/${r.id}`, { is_active: !r.is_active });
      await load();
    } catch (err) { toast.bad('Could not update', err instanceof ApiError ? err.message : undefined); }
    finally { setBusyId(null); }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await api.del(`/api/masters/caste/${deleting.id}`);
      toast.ok('Entry deleted', deleting.name);
      setDeleting(null);
      await load();
    } catch (err) { toast.bad('Could not delete', err instanceof ApiError ? err.message : undefined); setDeleting(null); }
    finally { setBusyId(null); }
  };

  const filtered = (rows ?? []).filter((r) =>
    !q.trim() || r.name.toLowerCase().includes(q.toLowerCase()) || (r.name_ta ?? '').includes(q)
  );

  return (
    <>
      <Card className="mb-4">
        <CardHead title="Add new caste option" icon="plus" />
        <div className="card-body">
          <form onSubmit={add}>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 190px' }}>
                <Field label="Caste name (English)" required error={addError}>
                  <Input value={name} onChange={(e) => { setName(e.target.value); setAddError(''); }} placeholder="e.g. Vanniyar" invalid={!!addError} maxLength={100} />
                </Field>
              </div>
              <div style={{ flex: '1 1 170px' }}>
                <Field label="Caste name (Tamil)">
                  <Input className="ta" value={nameTa} onChange={(e) => setNameTa(e.target.value)} placeholder="வன்னியர்" maxLength={100} />
                </Field>
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <Field label="Reservation category" required>
                  <Select value={category} onChange={(e) => setCategory(e.target.value as CasteCategory)}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                  </Select>
                </Field>
              </div>
              <Button type="submit" variant="primary" icon="save" loading={adding}>Save Caste</Button>
            </div>
          </form>
        </div>
      </Card>

      <Card>
        <CardHead
          title="Caste categories master"
          sub={rows ? `${fmt(rows.length)} total · ${fmt(rows.filter((r) => r.is_active).length)} active` : undefined}
          icon="database"
          actions={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search caste…" style={{ width: 200 }} aria-label="Search caste" />}
        />
        <div className="card-body flush">
          {error && <div style={{ padding: 'var(--sp-4)' }}><Alert tone="bad">{error}</Alert></div>}
          {!rows ? <TableSkeleton rows={6} cols={5} /> : filtered.length === 0 ? (
            <Empty icon="database" title="No caste options found" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 52 }}>#</th>
                    <th>Caste title</th>
                    <th>Reservation category</th>
                    <th className="num">Used by</th>
                    <th>Created</th>
                    <th style={{ width: 190 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.6 }}>
                      <td><span className="rank">{i + 1}</span></td>
                      <td>
                        <div className="t-semi">{r.name}</div>
                        {r.name_ta && <div className="t-sm ta t-muted">{r.name_ta}</div>}
                      </td>
                      <td><Badge tone="brand">{r.category}</Badge></td>
                      <td className="num tabnum">{r.usage_count ? <Badge tone="ok">{fmt(r.usage_count)}</Badge> : <span className="t-subtle">—</span>}</td>
                      <td className="t-sm t-muted">{fmtDate(r.created_at)}</td>
                      <td>
                        <div className="actions">
                          <Button size="sm" icon="edit" onClick={() => setEditing(r)}>Edit</Button>
                          <Button size="sm" icon={r.is_active ? 'ban' : 'check'} loading={busyId === r.id} onClick={() => void toggle(r)}>
                            {r.is_active ? 'Disable' : 'Enable'}
                          </Button>
                          <Button size="sm" variant="danger-soft" icon="trash" aria-label="Delete" onClick={() => setDeleting(r)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {editing && <EditCasteModal row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
      <ConfirmModal
        open={!!deleting} danger title={`Delete "${deleting?.name}"?`} confirmLabel="Delete"
        busy={busyId === deleting?.id}
        message={deleting?.usage_count
          ? <>This option is used by <strong>{fmt(deleting.usage_count)}</strong> survey record(s), so it cannot be deleted. Disable it instead.</>
          : <>This removes the option permanently. Agents will no longer see it.</>}
        onCancel={() => setDeleting(null)} onConfirm={() => void remove()}
      />
    </>
  );
}

function EditCasteModal({ row, onClose, onSaved }: { row: CasteRow; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(row.name);
  const [nameTa, setNameTa] = useState(row.name_ta ?? '');
  const [category, setCategory] = useState<CasteCategory>(row.category);
  const [active, setActive] = useState(row.is_active);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError('');
    if (name.trim().length < 2) { setError('Name must be at least 2 characters.'); return; }
    setSaving(true);
    try {
      await api.patch(`/api/masters/caste/${row.id}`, { name: name.trim(), name_ta: nameTa.trim(), category, is_active: active });
      toast.ok('Caste updated', name.trim());
      onSaved();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not save changes'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open title="Edit caste option" icon="edit" onClose={onClose}
      footer={<><Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" icon="save" loading={saving} onClick={() => void save()}>Save changes</Button></>}>
      {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}
      <div className="stack">
        <Field label="Caste name (English)" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Caste name (Tamil)"><Input className="ta" value={nameTa} onChange={(e) => setNameTa(e.target.value)} /></Field>
        <Field label="Reservation category" required>
          <Select value={category} onChange={(e) => setCategory(e.target.value as CasteCategory)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </Select>
        </Field>
        <Field label="Status"><Switch checked={active} onChange={setActive} label={active ? 'Active — shown to agents' : 'Disabled — hidden'} /></Field>
        {!!row.usage_count && <Alert tone="info">Used by <strong>{fmt(row.usage_count)}</strong> survey record(s).</Alert>}
      </div>
    </Modal>
  );
}

/* =============================== job master ============================== */
function JobMaster() {
  const toast = useToast();
  const [view, setView] = useState<'grouped' | 'flat'>('grouped');
  const [sectors, setSectors] = useState<JobSectorGroup[] | null>(null);
  const [flat, setFlat] = useState<JobRow[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<JobRow | null>(null);
  const [deleting, setDeleting] = useState<JobRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setError('');
    try {
      const [g, f] = await Promise.all([
        api.get<{ sectors: JobSectorGroup[] }>('/api/masters/job?grouped=1'),
        api.get<JobRow[]>('/api/masters/job'),
      ]);
      setSectors(g.sectors);
      setFlat(f);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not load job master'); }
  };
  useEffect(() => { void load(); }, []);

  const toggle = async (r: JobRow) => {
    setBusyId(r.id);
    try { await api.patch(`/api/masters/job/${r.id}`, { is_active: !r.is_active }); await load(); }
    catch (err) { toast.bad('Could not update', err instanceof ApiError ? err.message : undefined); }
    finally { setBusyId(null); }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await api.del(`/api/masters/job/${deleting.id}`);
      toast.ok('Sub-job deleted', deleting.name);
      setDeleting(null);
      await load();
    } catch (err) { toast.bad('Could not delete', err instanceof ApiError ? err.message : undefined); setDeleting(null); }
    finally { setBusyId(null); }
  };

  const filteredFlat = (flat ?? []).filter((r) =>
    !q.trim() || r.name.toLowerCase().includes(q.toLowerCase()) || (r.name_ta ?? '').includes(q) || r.category.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <Card className="mb-4">
        <CardHead
          title="Occupation master"
          sub={flat ? `${fmt(flat.length)} sub-jobs across ${sectors?.length ?? 0} sectors` : undefined}
          icon="briefcase"
          actions={
            <div className="row tight">
              <Segmented
                value={view}
                onChange={setView}
                options={[{ value: 'grouped' as const, label: '📁 Grouped' }, { value: 'flat' as const, label: '📋 Flat' }]}
              />
              <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Add Sub-Job</Button>
            </div>
          }
        />
        {view === 'flat' && (
          <div className="card-body tight">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sub-job or sector…" aria-label="Search jobs" />
          </div>
        )}
      </Card>

      {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}

      {view === 'grouped' ? (
        !sectors ? <Card><TableSkeleton rows={6} cols={3} /></Card> : (
          <div className="stack">
            {sectors.map((s) => (
              <div key={s.category} className="sector-card">
                <div className="sector-head">
                  <Icon name="folder" size={17} className="t-muted" />
                  <div style={{ minWidth: 0 }}>
                    <h4>{s.category}</h4>
                    {s.category_ta && <div className="t-xs ta t-muted">{s.category_ta}</div>}
                  </div>
                  <Badge tone="brand">{s.jobs.length} sub-jobs</Badge>
                </div>
                <div className="sector-body">
                  {s.jobs.map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      className={`job-chip ${j.is_active ? '' : 'off'}`}
                      onClick={() => setEditing(j)}
                      title={`Edit ${j.name}`}
                    >
                      <span className="ta">{j.name_ta ?? j.name}</span>
                      {j.name_ta && <span className="t-xs t-subtle">({j.name})</span>}
                      {!!j.usage_count && <Badge tone="ok">{j.usage_count}</Badge>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <Card>
          <div className="card-body flush">
            {!flat ? <TableSkeleton rows={8} cols={5} /> : filteredFlat.length === 0 ? (
              <Empty icon="briefcase" title="No sub-jobs found" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 52 }}>#</th>
                      <th>Sector</th>
                      <th>Sub-job</th>
                      <th>Status</th>
                      <th className="num">Used by</th>
                      <th style={{ width: 190 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFlat.map((r, i) => (
                      <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.6 }}>
                        <td><span className="rank">{i + 1}</span></td>
                        <td>
                          <div className="t-sm t-semi">{r.category}</div>
                          {r.category_ta && <div className="t-xs ta t-subtle">{r.category_ta}</div>}
                        </td>
                        <td>
                          <div className="t-semi ta">{r.name_ta ?? r.name}</div>
                          {r.name_ta && <div className="t-xs t-subtle">{r.name}</div>}
                        </td>
                        <td>{r.is_active ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="muted" dot>Disabled</Badge>}</td>
                        <td className="num tabnum">{r.usage_count ? <Badge tone="ok">{fmt(r.usage_count)}</Badge> : <span className="t-subtle">—</span>}</td>
                        <td>
                          <div className="actions">
                            <Button size="sm" icon="edit" onClick={() => setEditing(r)}>Edit</Button>
                            <Button size="sm" icon={r.is_active ? 'ban' : 'check'} loading={busyId === r.id} onClick={() => void toggle(r)}>
                              {r.is_active ? 'Disable' : 'Enable'}
                            </Button>
                            <Button size="sm" variant="danger-soft" icon="trash" aria-label="Delete" onClick={() => setDeleting(r)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}

      {(adding || editing) && (
        <EditJobModal
          row={editing}
          sectors={sectors ?? []}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); void load(); }}
        />
      )}
      <ConfirmModal
        open={!!deleting} danger title={`Delete "${deleting?.name}"?`} confirmLabel="Delete"
        busy={busyId === deleting?.id}
        message={deleting?.usage_count
          ? <>Used by <strong>{fmt(deleting.usage_count)}</strong> survey record(s), so it cannot be deleted. Disable it instead.</>
          : <>This removes the sub-job permanently.</>}
        onCancel={() => setDeleting(null)} onConfirm={() => void remove()}
      />
    </>
  );
}

function EditJobModal({ row, sectors, onClose, onSaved }: {
  row: JobRow | null; sectors: JobSectorGroup[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const isNew = !row;
  const [useCustom, setUseCustom] = useState(false);
  const [category, setCategory] = useState(row?.category ?? sectors[0]?.category ?? '');
  const [categoryTa, setCategoryTa] = useState(row?.category_ta ?? '');
  const [name, setName] = useState(row?.name ?? '');
  const [nameTa, setNameTa] = useState(row?.name_ta ?? '');
  const [active, setActive] = useState(row?.is_active ?? true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError('');
    if (name.trim().length < 2) { setError('Sub-job name must be at least 2 characters.'); return; }
    if (category.trim().length < 2) { setError('Choose or enter a main sector.'); return; }
    setSaving(true);
    try {
      const body = { category: category.trim(), category_ta: categoryTa.trim(), name: name.trim(), name_ta: nameTa.trim(), is_active: active };
      if (isNew) await api.post('/api/masters/job', body);
      else await api.patch(`/api/masters/job/${row!.id}`, body);
      toast.ok(isNew ? 'Sub-job added' : 'Sub-job updated', `${category} › ${name}`);
      onSaved();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not save'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open title={isNew ? 'Add new sub-job' : 'Edit sub-job'} icon="briefcase" onClose={onClose}
      footer={<><Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" icon="save" loading={saving} onClick={() => void save()}>{isNew ? 'Add sub-job' : 'Save changes'}</Button></>}>
      {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}
      <div className="stack">
        <Field label="1. Main sector" required hint="Pick an existing sector, or switch to enter a new one">
          {useCustom ? (
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Transport & Logistics" autoFocus />
          ) : (
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {sectors.map((s) => <option key={s.category} value={s.category}>{s.category}</option>)}
              {row && !sectors.some((s) => s.category === row.category) && <option value={row.category}>{row.category}</option>}
            </Select>
          )}
        </Field>
        <Button size="sm" icon={useCustom ? 'list' : 'plus'} onClick={() => setUseCustom((c) => !c)}>
          {useCustom ? 'Choose an existing sector' : 'Enter a new sector'}
        </Button>

        {useCustom && (
          <Field label="Sector name (Tamil)">
            <Input className="ta" value={categoryTa} onChange={(e) => setCategoryTa(e.target.value)} placeholder="போக்குவரத்து" />
          </Field>
        )}

        <Field label="2. Sub-job title (English)" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Silk Weaver" />
        </Field>
        <Field label="Sub-job title (Tamil)">
          <Input className="ta" value={nameTa} onChange={(e) => setNameTa(e.target.value)} placeholder="பட்டு நெசவாளர்" />
        </Field>
        <Field label="Status"><Switch checked={active} onChange={setActive} label={active ? 'Active' : 'Disabled'} /></Field>
      </div>
    </Modal>
  );
}

/* ============================== party master ============================= */
function PartyMaster() {
  const toast = useToast();
  const [rows, setRows] = useState<PartyRow[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<PartyRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<PartyRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    setRows(null); setError('');
    try { setRows(await api.get<PartyRow[]>('/api/masters/party')); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not load party master'); }
  };
  useEffect(() => { void load(); }, []);

  const toggle = async (r: PartyRow) => {
    setBusyId(r.id);
    try { await api.patch(`/api/masters/party/${r.id}`, { is_active: !r.is_active }); await load(); }
    catch (err) { toast.bad('Could not update', err instanceof ApiError ? err.message : undefined); }
    finally { setBusyId(null); }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await api.del(`/api/masters/party/${deleting.id}`);
      toast.ok('Party deleted', deleting.name);
      setDeleting(null); await load();
    } catch (err) { toast.bad('Could not delete', err instanceof ApiError ? err.message : undefined); setDeleting(null); }
    finally { setBusyId(null); }
  };

  const filtered = (rows ?? []).filter((r) =>
    !q.trim() || r.name.toLowerCase().includes(q.toLowerCase()) || r.party_code.toLowerCase().includes(q.toLowerCase()) || (r.name_ta ?? '').includes(q)
  );

  return (
    <>
      <Card>
        <CardHead
          title="Political party master"
          sub={rows ? `${fmt(rows.length)} parties · ${fmt(rows.filter((r) => r.symbol_img).length)} with emblems` : undefined}
          icon="flag"
          actions={
            <div className="row tight">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search party…" style={{ width: 180 }} aria-label="Search party" />
              <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Add New Party</Button>
            </div>
          }
        />
        <div className="card-body flush">
          {error && <div style={{ padding: 'var(--sp-4)' }}><Alert tone="bad">{error}</Alert></div>}
          {!rows ? <TableSkeleton rows={8} cols={6} /> : filtered.length === 0 ? (
            <Empty icon="flag" title="No parties found" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 52 }}>#</th>
                    <th style={{ width: 70 }}>Symbol</th>
                    <th>Party code</th>
                    <th>Party name</th>
                    <th>Flag colour</th>
                    <th className="num">Used by</th>
                    <th style={{ width: 190 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.6 }}>
                      <td><span className="rank">{i + 1}</span></td>
                      <td><PartySymbol party={r} size={38} /></td>
                      <td><span className="badge badge-brand">{r.party_code}</span></td>
                      <td>
                        <div className="t-semi">{r.name}</div>
                        {r.name_ta && <div className="t-sm ta t-muted">{r.name_ta}</div>}
                      </td>
                      <td>
                        <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                          <span style={{ width: 16, height: 16, borderRadius: 4, background: r.color_code, border: '1px solid var(--border)' }} />
                          <span className="mono t-xs">{r.color_code}</span>
                        </span>
                      </td>
                      <td className="num tabnum">{r.usage_count ? <Badge tone="ok">{fmt(r.usage_count)}</Badge> : <span className="t-subtle">—</span>}</td>
                      <td>
                        <div className="actions">
                          <Button size="sm" icon="edit" onClick={() => setEditing(r)}>Edit</Button>
                          <Button size="sm" icon={r.is_active ? 'ban' : 'check'} loading={busyId === r.id} onClick={() => void toggle(r)}>
                            {r.is_active ? 'Disable' : 'Enable'}
                          </Button>
                          <Button size="sm" variant="danger-soft" icon="trash" aria-label="Delete" onClick={() => setDeleting(r)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {(adding || editing) && (
        <EditPartyModal
          row={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); void load(); }}
        />
      )}
      <ConfirmModal
        open={!!deleting} danger title={`Delete "${deleting?.name}"?`} confirmLabel="Delete"
        busy={busyId === deleting?.id}
        message={deleting?.usage_count
          ? <>Used by <strong>{fmt(deleting.usage_count)}</strong> survey record(s), so it cannot be deleted. Disable it instead.</>
          : <>This removes the party permanently.</>}
        onCancel={() => setDeleting(null)} onConfirm={() => void remove()}
      />
    </>
  );
}

function EditPartyModal({ row, onClose, onSaved }: { row: PartyRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isNew = !row;
  const [name, setName] = useState(row?.name ?? '');
  const [nameTa, setNameTa] = useState(row?.name_ta ?? '');
  const [code, setCode] = useState(row?.party_code ?? '');
  const [color, setColor] = useState(row?.color_code ?? '#2563eb');
  const [symbol, setSymbol] = useState<string | null>(row?.symbol_img ?? null);
  const [active, setActive] = useState(row?.is_active ?? true);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(''); setFields({});
    setSaving(true);
    try {
      const body = {
        name: name.trim(), name_ta: nameTa.trim(), party_code: code.trim().toUpperCase(),
        color_code: color, symbol_img: symbol, is_active: active,
      };
      if (isNew) await api.post('/api/masters/party', body);
      else await api.patch(`/api/masters/party/${row!.id}`, body);
      toast.ok(isNew ? 'Party added' : 'Party updated', name.trim());
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) { setFields(err.fields); setError(err.message); }
      else setError('Could not save');
    } finally { setSaving(false); }
  };

  return (
    <Modal open wide title={isNew ? 'Add new party' : `Edit — ${row!.name}`} icon="flag" onClose={onClose}
      footer={<><Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" icon="save" loading={saving} onClick={() => void save()}>{isNew ? 'Add party' : 'Save changes'}</Button></>}>
      {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}
      <div className="stack">
        <div className="grid cols-2">
          <Field label="Party name (English)" required error={fields.name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. DMK" invalid={!!fields.name} autoFocus />
          </Field>
          <Field label="Party code" required error={fields.party_code} hint="Short abbreviation shown on cards">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="DMK" maxLength={12} invalid={!!fields.party_code} className="mono" />
          </Field>
        </div>

        <Field label="Party name (Tamil)">
          <Input className="ta" value={nameTa} onChange={(e) => setNameTa(e.target.value)} placeholder="திராவிட முன்னேற்றக் கழகம்" />
        </Field>

        <Field label="Flag / branding colour" required error={fields.color_code}>
          <div className="row tight">
            <input
              type="color" value={color} onChange={(e) => setColor(e.target.value)}
              aria-label="Pick flag colour"
              style={{ width: 48, height: 38, padding: 2, border: '1px solid var(--border-strong)', borderRadius: 'var(--r-md)', background: 'var(--surface)' }}
            />
            <Input value={color} onChange={(e) => setColor(e.target.value)} className="mono" style={{ width: 120 }} maxLength={7} />
            <span className="badge" style={{ background: color, color: '#fff' }}>Preview</span>
          </div>
        </Field>

        <Field
          label="Party picture (stored as Base64 in the database)"
          error={fields.symbol_img}
          hint="No CDN or file server — the image travels with the record"
        >
          <ImageUploader value={symbol} onChange={setSymbol} label="Party symbol" />
        </Field>

        <Field label="Status">
          <Switch checked={active} onChange={setActive} label={active ? 'Active — shown to agents' : 'Disabled — hidden'} />
        </Field>

        {!!row?.usage_count && <Alert tone="info">Used by <strong>{fmt(row.usage_count)}</strong> survey record(s).</Alert>}
      </div>
    </Modal>
  );
}

/* =========================== local body master ============================
 * Local body names are free text carried over from the roll's own spelling,
 * not a separate table — so "duplicates" here are booths that should share
 * one name but don't, because the roll spells the place two or three ways.
 * The list is scanned for near-matches (ignoring vowel-sign differences) and
 * surfaced as merge suggestions; nothing merges until an admin confirms.
 * ========================================================================= */
function LocalBodyMaster() {
  const toast = useToast();
  const [data, setData] = useState<LocalBodyList | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [merging, setMerging] = useState<{ from: string; into: string } | null>(null);
  const [renaming, setRenaming] = useState<LocalBodyRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError('');
    try { setData(await api.get<LocalBodyList>('/api/masters/local-bodies')); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not load local bodies'); }
  };
  useEffect(() => { void load(); }, []);

  const doMerge = async (from: string, into: string) => {
    setBusy(true);
    try {
      const res = await api.post<{ boothsMoved: number }>('/api/masters/local-bodies/merge', { from, into });
      toast.ok('Merged', `${fmt(res.boothsMoved)} booth${res.boothsMoved === 1 ? '' : 's'} moved from "${from}" to "${into}"`);
      setMerging(null);
      setRenaming(null);
      await load();
    } catch (err) {
      toast.bad('Could not merge', err instanceof ApiError ? err.message : undefined);
    } finally { setBusy(false); }
  };

  const filtered = useMemo(
    () => (data?.rows ?? []).filter((r) => !q.trim() || r.name.includes(q.trim())),
    [data, q]
  );

  return (
    <>
      {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}

      {!data ? (
        <Card><TableSkeleton rows={6} cols={4} /></Card>
      ) : (
        <>
          {/* ---- suggested merges: real spelling duplicates found automatically ---- */}
          <Card className="mb-4">
            <CardHead
              title="Possible spelling duplicates"
              sub="Same place, written more than one way — grouped by ignoring vowel-sign differences"
              icon="alert"
              actions={data.suggestions.length > 0 ? <Badge tone="warn">{data.suggestions.length} found</Badge> : <Badge tone="ok">None found</Badge>}
            />
            <div className="card-body">
              {data.suggestions.length === 0 ? (
                <Empty icon="check-circle" title="No likely duplicates detected">
                  Every local body name in the roll appears to be spelled consistently.
                </Empty>
              ) : (
                <div className="stack">
                  {data.suggestions.map((s) => (
                    <div key={s.candidates.map((c) => c.name).join('|')} className="dup-cluster">
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="t-sm t-semi">
                          {s.candidates.length} spellings of what looks like the same place
                        </span>
                        <Badge tone="ok">Recommend: {s.recommended}</Badge>
                      </div>
                      <div className="dup-candidates">
                        {s.candidates.map((c) => (
                          <span key={c.name} className={`dup-candidate ${c.name === s.recommended ? 'recommended' : ''}`}>
                            <span className="ta">{c.name}</span>
                            <span className="t-xs t-subtle">
                              {c.part_count} booth{c.part_count === 1 ? '' : 's'} · {fmt(c.voter_count)} electors
                            </span>
                            {c.name !== s.recommended && <Icon name="chevron-right" size={12} className="arrow" />}
                          </span>
                        ))}
                      </div>
                      <Button
                        size="sm" variant="primary" icon="check"
                        onClick={() => setMerging({ from: s.candidates.filter((c) => c.name !== s.recommended).map((c) => c.name).join(', '), into: s.recommended })}
                      >
                        Merge all into "{s.recommended}"
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* ---- full local body roster with manual rename/merge ---- */}
          <Card>
            <CardHead
              title="All local bodies"
              sub={`${fmt(data.total)} distinct names across 318 booths`}
              icon="map-pin"
              actions={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search local body…" style={{ width: 200 }} aria-label="Search local bodies" />}
            />
            <div className="card-body flush">
              {filtered.length === 0 ? (
                <Empty icon="map-pin" title="No local bodies match" />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: 52 }}>#</th>
                        <th>Local body name</th>
                        <th>Type</th>
                        <th className="num">Booths</th>
                        <th className="num">Electors</th>
                        <th style={{ width: 130 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r, i) => (
                        <tr key={r.name}>
                          <td><span className="rank">{i + 1}</span></td>
                          <td className="t-semi ta">{r.name}</td>
                          <td><LocalBodyBadge type={r.type} /></td>
                          <td className="num tabnum">{fmt(r.part_count)}</td>
                          <td className="num tabnum">{fmt(r.voter_count)}</td>
                          <td>
                            <Button size="sm" icon="edit" onClick={() => setRenaming(r)}>Rename / Merge</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </>
      )}

      <ConfirmModal
        open={!!merging}
        title="Merge these spellings?"
        confirmLabel="Merge"
        busy={busy}
        message={
          <>
            Every booth currently named <strong className="ta">{merging?.from}</strong> will be renamed to{' '}
            <strong className="ta">{merging?.into}</strong>. Booths themselves, their electors and every
            survey record are unaffected — only the display name changes.
          </>
        }
        onCancel={() => setMerging(null)}
        onConfirm={() => {
          if (!merging) return;
          // The suggestion card can bundle several source names into one confirm;
          // apply them one at a time against the same target.
          const sources = merging.from.split(', ');
          (async () => { for (const s of sources) await doMerge(s, merging.into); })();
        }}
      />

      {renaming && (
        <RenameLocalBodyModal
          row={renaming}
          existingNames={(data?.rows ?? []).map((r) => r.name).filter((n) => n !== renaming.name)}
          busy={busy}
          onCancel={() => setRenaming(null)}
          onConfirm={(target) => void doMerge(renaming.name, target)}
        />
      )}
    </>
  );
}

function RenameLocalBodyModal({ row, existingNames, busy, onCancel, onConfirm }: {
  row: LocalBodyRow;
  existingNames: string[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (target: string) => void;
}) {
  const [target, setTarget] = useState(row.name);
  const trimmed = target.trim();
  const isMergeIntoExisting = trimmed !== row.name && existingNames.includes(trimmed);
  const unchanged = trimmed === row.name;

  return (
    <Modal
      open title={`Rename — ${row.name}`} icon="edit" onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon="save" loading={busy} disabled={!trimmed || unchanged} onClick={() => onConfirm(trimmed)}>
            {isMergeIntoExisting ? 'Merge' : 'Rename'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="t-sm t-muted">
          {fmt(row.part_count)} booth{row.part_count === 1 ? '' : 's'} · {fmt(row.voter_count)} electors are
          currently under this name.
        </div>
        <Field label="Correct spelling" required hint="Type the name exactly as it should read everywhere">
          <Input className="ta" value={target} onChange={(e) => setTarget(e.target.value)} list="local-body-names" autoFocus />
          <datalist id="local-body-names">
            {existingNames.map((n) => <option key={n} value={n} />)}
          </datalist>
        </Field>
        {isMergeIntoExisting && (
          <Alert tone="warn">
            <span className="ta">{trimmed}</span> already names another local body — saving will
            <strong> merge</strong> both under that name rather than simply renaming.
          </Alert>
        )}
      </div>
    </Modal>
  );
}
