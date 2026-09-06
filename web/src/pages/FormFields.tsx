import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api } from '../lib/api';
import type { CustomFieldType, FormFieldDef } from '../lib/types';
import {
  Alert, Badge, Button, Card, CardHead, ConfirmModal, Empty, Field, Input, Modal, PageHead,
  Select, Switch, TableSkeleton, useToast,
} from '../components/ui';

const TYPE_LABEL: Record<CustomFieldType, string> = {
  text: 'Text', number: 'Number', date: 'Date', select: 'Dropdown',
};

/**
 * A1's "customize form" module — add, edit, reorder and disable fields that
 * appear at the end of the Voter Field Survey form (Section D), stored as
 * field definitions rather than code, so a new field never needs a deploy.
 */
export default function FormFields() {
  const toast = useToast();
  const [rows, setRows] = useState<FormFieldDef[] | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FormFieldDef | null>(null);
  const [deleting, setDeleting] = useState<FormFieldDef | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    setError('');
    try { setRows(await api.get<FormFieldDef[]>('/api/form-fields/all')); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not load custom fields'); }
  };
  useEffect(() => { void load(); }, []);

  const toggle = async (f: FormFieldDef) => {
    setBusyId(f.id);
    try {
      await api.patch(`/api/form-fields/${f.id}`, { is_active: !f.isActive });
      await load();
    } catch (err) { toast.bad('Could not update', err instanceof ApiError ? err.message : undefined); }
    finally { setBusyId(null); }
  };

  const move = async (f: FormFieldDef, direction: 'up' | 'down') => {
    setBusyId(f.id);
    try {
      await api.post(`/api/form-fields/${f.id}/move`, { direction });
      await load();
    } catch (err) { toast.bad('Could not reorder', err instanceof ApiError ? err.message : undefined); }
    finally { setBusyId(null); }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await api.del(`/api/form-fields/${deleting.id}`);
      toast.ok('Field deleted', deleting.label);
      setDeleting(null);
      await load();
    } catch (err) { toast.bad('Could not delete', err instanceof ApiError ? err.message : undefined); setDeleting(null); }
    finally { setBusyId(null); }
  };

  return (
    <>
      <PageHead
        title="Survey Form Builder"
        sub="Add, edit, reorder or retire custom fields on the Voter Field Survey form — no code change needed"
        actions={<Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Add Field</Button>}
      />

      <Card>
        <CardHead
          title={rows ? `${rows.length} custom field${rows.length === 1 ? '' : 's'}` : 'Custom fields'}
          sub="Appears as Section D on the survey form, in this order"
          icon="layers"
        />
        <div className="card-body flush">
          {error && <div style={{ padding: 'var(--sp-4)' }}><Alert tone="bad">{error}</Alert></div>}
          {!rows ? <TableSkeleton rows={4} cols={5} /> : rows.length === 0 ? (
            <Empty icon="layers" title="No custom fields yet">
              The survey form ships with EPIC, name, phone, caste, occupation, party and education.
              Add a field here for anything specific your constituency also needs to collect.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Order</th>
                    <th>Label</th>
                    <th>Type</th>
                    <th>Required</th>
                    <th>Status</th>
                    <th className="num">Used by</th>
                    <th style={{ width: 220 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f, i) => (
                    <tr key={f.id} style={{ opacity: f.isActive ? 1 : 0.6 }}>
                      <td>
                        <div className="row tight" style={{ flexWrap: 'nowrap' }}>
                          <Button size="sm" icon="chevron-left" aria-label="Move up" disabled={i === 0} loading={busyId === f.id}
                            onClick={() => void move(f, 'up')} style={{ transform: 'rotate(90deg)' }} />
                          <Button size="sm" icon="chevron-left" aria-label="Move down" disabled={i === rows.length - 1} loading={busyId === f.id}
                            onClick={() => void move(f, 'down')} style={{ transform: 'rotate(-90deg)' }} />
                        </div>
                      </td>
                      <td>
                        <div className="t-semi">{f.label}</div>
                        {f.labelTa && <div className="t-sm ta t-muted">{f.labelTa}</div>}
                        <div className="t-xs t-subtle mono">{f.key}</div>
                      </td>
                      <td>
                        <Badge tone="brand">{TYPE_LABEL[f.fieldType]}</Badge>
                        {f.fieldType === 'select' && f.options && (
                          <div className="t-xs t-subtle t-truncate" style={{ maxWidth: 180 }}>{f.options.join(', ')}</div>
                        )}
                      </td>
                      <td>{f.isRequired ? <Badge tone="warn">Required</Badge> : <span className="t-subtle t-sm">Optional</span>}</td>
                      <td>{f.isActive ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="muted" dot>Disabled</Badge>}</td>
                      <td className="num tabnum">{f.usageCount ? <Badge tone="ok">{f.usageCount}</Badge> : <span className="t-subtle">—</span>}</td>
                      <td>
                        <div className="actions">
                          <Button size="sm" icon="edit" onClick={() => setEditing(f)}>Edit</Button>
                          <Button size="sm" icon={f.isActive ? 'ban' : 'check'} loading={busyId === f.id} onClick={() => void toggle(f)}>
                            {f.isActive ? 'Disable' : 'Enable'}
                          </Button>
                          <Button size="sm" variant="danger-soft" icon="trash" aria-label="Delete" onClick={() => setDeleting(f)} />
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
        <FieldEditorModal
          row={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); void load(); }}
        />
      )}
      <ConfirmModal
        open={!!deleting} danger title={`Delete "${deleting?.label}"?`} confirmLabel="Delete"
        busy={busyId === deleting?.id}
        message={deleting?.usageCount
          ? <>{deleting.usageCount} survey record(s) already answered this field, so it cannot be deleted. Disable it instead.</>
          : <>This removes the field permanently. Agents will no longer see it on the survey form.</>}
        onCancel={() => setDeleting(null)} onConfirm={() => void remove()}
      />
    </>
  );
}

function FieldEditorModal({ row, onClose, onSaved }: { row: FormFieldDef | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isNew = !row;
  const [label, setLabel] = useState(row?.label ?? '');
  const [labelTa, setLabelTa] = useState(row?.labelTa ?? '');
  const [fieldType, setFieldType] = useState<CustomFieldType>(row?.fieldType ?? 'text');
  const [options, setOptions] = useState((row?.options ?? []).join(', '));
  const [isRequired, setIsRequired] = useState(row?.isRequired ?? false);
  const [isActive, setIsActive] = useState(row?.isActive ?? true);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setFields({});
    setSaving(true);
    try {
      const body = {
        label: label.trim(), label_ta: labelTa.trim(),
        field_type: fieldType, options: fieldType === 'select' ? options : undefined,
        is_required: isRequired, is_active: isActive,
      };
      if (isNew) await api.post('/api/form-fields', body);
      else await api.patch(`/api/form-fields/${row!.id}`, body);
      toast.ok(isNew ? 'Field added' : 'Field updated', label.trim());
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) { setFields(err.fields); setError(err.message); }
      else setError('Could not save');
    } finally { setSaving(false); }
  };

  return (
    <Modal
      open title={isNew ? 'Add custom field' : `Edit — ${row!.label}`} icon="layers" onClose={onClose}
      footer={<>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" icon="save" loading={saving} onClick={(e) => save(e as unknown as FormEvent)}>
          {isNew ? 'Add field' : 'Save changes'}
        </Button>
      </>}
    >
      {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}
      <form onSubmit={save} className="stack">
        <Field label="Field label (English)" required error={fields.label}>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Ration Card Type" invalid={!!fields.label} autoFocus />
        </Field>
        <Field label="Field label (Tamil)">
          <Input className="ta" value={labelTa} onChange={(e) => setLabelTa(e.target.value)} placeholder="குடும்ப அட்டை வகை" />
        </Field>
        <Field label="Field type" required error={fields.fieldType}>
          <Select value={fieldType} onChange={(e) => setFieldType(e.target.value as CustomFieldType)}>
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="select">Dropdown</option>
          </Select>
        </Field>
        {fieldType === 'select' && (
          <Field label="Dropdown options" required error={fields.options} hint="Comma-separated, e.g. APL, BPL, Antyodaya">
            <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="APL, BPL, Antyodaya" invalid={!!fields.options} />
          </Field>
        )}
        <Field label="Required">
          <Switch checked={isRequired} onChange={setIsRequired} label={isRequired ? 'Agent must answer to submit' : 'Optional'} />
        </Field>
        <Field label="Status">
          <Switch checked={isActive} onChange={setIsActive} label={isActive ? 'Active — shown on the survey form' : 'Disabled — hidden'} />
        </Field>
        {!!row?.usageCount && (
          <Alert tone="info">{row.usageCount} survey record(s) already have an answer for this field.</Alert>
        )}
      </form>
    </Modal>
  );
}
