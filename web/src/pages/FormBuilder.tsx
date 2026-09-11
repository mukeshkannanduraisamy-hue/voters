import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import {
  Alert, Badge, Button, Card, CardHead, ConfirmModal, Field, Input, Modal, PageHead,
  Segmented, Select, Switch, Textarea, fmtDate, useToast,
} from '../components/ui';
import { Icon } from '../components/icons';
import { DynamicFieldGrid, clearOptionCache } from '../components/DynamicField';
import {
  FIELD_TYPE_META, SYSTEM_BINDINGS, isChoice, isStructural, slugifyKey,
  type AnswerMap, type FieldType, type FormField, type FormSchema,
} from '../lib/formSchema';

interface DraftResponse { draft: FormSchema; publishedVersion: number; dirty: boolean }
interface VersionRow {
  version: number; status: string; title: string; changeSummary: string | null;
  publishedAt: string | null; publishedByName: string | null;
}
interface CategoryList {
  system: { key: string; name: string; nameTa: string }[];
  custom: { key: string; name: string; isActive: boolean; activeCount: number }[];
}

const PALETTE_GROUPS = ['Text & numbers', 'Date & time', 'Choice', 'Layout'];

/** A fresh field of the requested type, with sensible defaults for that type. */
function newField(type: FieldType, existingKeys: Set<string>): FormField {
  const meta = FIELD_TYPE_META[type];
  let key = slugifyKey(meta.label);
  let n = 2;
  while (existingKeys.has(key)) key = `${slugifyKey(meta.label)}_${n++}`;

  const field: FormField = {
    key, type, width: 'full', active: true, required: false,
    label: meta.label, labelTa: null, bind: null,
  };
  if (type === 'textarea') field.rows = 3;
  if (isChoice(type)) {
    field.source = type === 'party'
      ? { kind: 'master', master: 'party' }
      : { kind: 'static', options: [{ value: 'option_1', label: 'Option 1' }] };
  }
  if (type === 'section') { field.label = 'Section title'; field.hint = 'Optional subtitle'; }
  if (type === 'notice') { field.label = 'Guidance for the surveyor'; field.tone = 'info'; }
  return field;
}

export default function FormBuilder() {
  const toast = useToast();
  const [fields, setFields] = useState<FormField[] | null>(null);
  const [title, setTitle] = useState('Voter Field Survey');
  const [titleTa, setTitleTa] = useState('');
  const [publishedVersion, setPublishedVersion] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [schemaErrors, setSchemaErrors] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [previewValues, setPreviewValues] = useState<AnswerMap>({});
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [categories, setCategories] = useState<CategoryList | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const dragKey = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ key: string; above: boolean } | null>(null);

  const load = async () => {
    setError('');
    try {
      const res = await api.get<DraftResponse>('/api/form-schema/draft');
      setFields(res.draft.fields);
      setTitle(res.draft.title);
      setTitleTa(res.draft.titleTa ?? '');
      setPublishedVersion(res.publishedVersion);
      setDirty(res.dirty);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the form builder');
    }
  };

  useEffect(() => {
    void load();
    api.get<CategoryList>('/api/master-categories').then(setCategories).catch(() => { /* binding list degrades */ });
  }, []);

  const selected = useMemo(() => fields?.find((f) => f.key === selectedKey) ?? null, [fields, selectedKey]);
  const keys = useMemo(() => new Set((fields ?? []).map((f) => f.key)), [fields]);

  const mutate = (next: FormField[]) => { setFields(next); setDirty(true); setSchemaErrors([]); };

  const addField = (type: FieldType) => {
    const f = newField(type, keys);
    mutate([...(fields ?? []), f]);
    setSelectedKey(f.key);
  };

  const updateField = (key: string, patch: Partial<FormField>) =>
    mutate((fields ?? []).map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const removeField = (key: string) => {
    mutate((fields ?? []).filter((f) => f.key !== key));
    if (selectedKey === key) setSelectedKey(null);
  };

  const duplicateField = (key: string) => {
    const src = fields?.find((f) => f.key === key);
    if (!src) return;
    let copyKey = `${src.key}_copy`;
    let n = 2;
    while (keys.has(copyKey)) copyKey = `${src.key}_copy_${n++}`;
    const copy = { ...src, key: copyKey, label: `${src.label} (copy)`, bind: null };
    const idx = (fields ?? []).findIndex((f) => f.key === key);
    const next = [...(fields ?? [])];
    next.splice(idx + 1, 0, copy);
    mutate(next);
    setSelectedKey(copyKey);
  };

  const move = (key: string, dir: -1 | 1) => {
    const list = [...(fields ?? [])];
    const i = list.findIndex((f) => f.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    mutate(list);
  };

  /** Drop `dragKey` next to `targetKey`, above or below it. */
  const reorderTo = (targetKey: string, above: boolean) => {
    const from = dragKey.current;
    setDropTarget(null);
    dragKey.current = null;
    if (!from || from === targetKey || !fields) return;
    const list = fields.filter((f) => f.key !== from);
    const moved = fields.find((f) => f.key === from)!;
    const at = list.findIndex((f) => f.key === targetKey);
    list.splice(above ? at : at + 1, 0, moved);
    mutate(list);
  };

  const saveDraft = async () => {
    setSaving(true); setError(''); setSchemaErrors([]);
    try {
      await api.put('/api/form-schema/draft', { fields, title, titleTa });
      toast.ok('Draft saved', 'Agents still see the published form until you publish.');
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        const list = (err as ApiError & { errors?: string[] });
        setSchemaErrors(Array.isArray(list.errors) ? list.errors : [err.message]);
        setError(err.message);
      } else setError('Could not save the draft');
    } finally { setSaving(false); }
  };

  const publish = async () => {
    setPublishing(true); setError(''); setSchemaErrors([]);
    try {
      await api.put('/api/form-schema/draft', { fields, title, titleTa });
      const res = await api.post<{ version: number; changeSummary: string }>('/api/form-schema/publish', {});
      toast.ok(`Published version ${res.version}`, res.changeSummary);
      setConfirmPublish(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        const list = (err as ApiError & { errors?: string[] });
        setSchemaErrors(Array.isArray(list.errors) ? list.errors : [err.message]);
        setError(err.message);
      } else setError('Could not publish');
      setConfirmPublish(false);
    } finally { setPublishing(false); }
  };

  const revert = async () => {
    try {
      await api.post('/api/form-schema/revert', {});
      toast.ok('Draft reset', `Back to published version ${publishedVersion}.`);
      setConfirmRevert(false);
      setSelectedKey(null);
      await load();
    } catch (err) { toast.bad('Could not revert', err instanceof ApiError ? err.message : undefined); }
  };

  const openVersions = async () => {
    setVersionsOpen(true);
    try { setVersions(await api.get<VersionRow[]>('/api/form-schema/versions')); }
    catch { setVersions([]); }
  };

  const restore = async (version: number) => {
    try {
      await api.post(`/api/form-schema/restore/${version}`, {});
      toast.ok(`Version ${version} loaded into the draft`, 'Review it, then publish to make it live.');
      setVersionsOpen(false);
      await load();
    } catch (err) { toast.bad('Could not restore', err instanceof ApiError ? err.message : undefined); }
  };

  const openPreview = () => {
    clearOptionCache();               // pick up master edits made since page load
    setPreviewValues({});
    setPreviewOpen(true);
  };

  const activeInputs = (fields ?? []).filter((f) => !isStructural(f.type) && f.active !== false).length;

  return (
    <>
      <PageHead
        title="Survey Form Builder"
        sub={`Design the survey agents fill in — published version ${publishedVersion} is live${dirty ? ' · you have unpublished changes' : ''}`}
        actions={
          <>
            <Button icon="list" onClick={() => void openVersions()}>Versions</Button>
            <Button icon="eye" onClick={openPreview} disabled={!fields?.length}>Preview</Button>
            <Button icon="refresh" onClick={() => setConfirmRevert(true)} disabled={!dirty}>Revert</Button>
            <Button icon="save" onClick={() => void saveDraft()} loading={saving}>Save draft</Button>
            <Button variant="primary" icon="check" onClick={() => setConfirmPublish(true)} disabled={!fields?.length}>
              Publish
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4">
          <Alert tone="bad">
            <strong>{error}</strong>
            {schemaErrors.length > 1 && (
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {schemaErrors.map((e) => <li key={e} className="t-sm">{e}</li>)}
              </ul>
            )}
          </Alert>
        </div>
      )}

      {!fields ? (
        <Card><div className="card-body"><span className="t-muted">Loading the form…</span></div></Card>
      ) : (
        <div className="fb-studio">
          {/* ------------------------- palette ------------------------- */}
          <div className="fb-panel">
            <Card>
              <CardHead title="Add a field" icon="plus" />
              <div className="card-body">
                {PALETTE_GROUPS.map((group) => (
                  <div key={group} className="fb-palette-group">
                    <h5>{group}</h5>
                    {(Object.keys(FIELD_TYPE_META) as FieldType[])
                      .filter((t) => FIELD_TYPE_META[t].group === group)
                      .map((t) => (
                        <button key={t} type="button" className="fb-palette-item" onClick={() => addField(t)}>
                          <Icon name={FIELD_TYPE_META[t].icon as never} size={15} />
                          {FIELD_TYPE_META[t].label}
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* ------------------------- canvas ------------------------- */}
          <Card>
            <CardHead
              title="Form canvas"
              sub={`${activeInputs} active input${activeInputs === 1 ? '' : 's'} · drag to reorder · click to edit`}
              icon="layers"
              actions={dirty ? <Badge tone="warn" dot>Unpublished</Badge> : <Badge tone="ok" dot>In sync</Badge>}
            />
            <div className="card-body">
              <div className="grid cols-2 mb-4">
                <Field label="Form title (English)">
                  <Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
                </Field>
                <Field label="Form title (Tamil)">
                  <Input className="ta" value={titleTa} onChange={(e) => { setTitleTa(e.target.value); setDirty(true); }} />
                </Field>
              </div>

              <div className="fb-canvas">
                {fields.length === 0 ? (
                  <div className="fb-canvas-empty">
                    Pick a field type on the left to start building the survey.
                  </div>
                ) : fields.map((f) => (
                  <div
                    key={f.key}
                    className={[
                      'fb-item',
                      selectedKey === f.key ? 'selected' : '',
                      f.active === false ? 'inactive' : '',
                      isStructural(f.type) ? 'structural' : '',
                      dropTarget?.key === f.key ? (dropTarget.above ? 'drop-above' : 'drop-below') : '',
                    ].join(' ')}
                    onClick={() => setSelectedKey(f.key)}
                    draggable
                    onDragStart={() => { dragKey.current = f.key; }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setDropTarget({ key: f.key, above: e.clientY < box.top + box.height / 2 });
                    }}
                    onDragLeave={() => setDropTarget((d) => (d?.key === f.key ? null : d))}
                    onDrop={(e) => { e.preventDefault(); reorderTo(f.key, dropTarget?.above ?? true); }}
                  >
                    <div className="fb-item-head">
                      <Icon name="menu" size={14} className="fb-grip" />
                      <span className="t-semi">{f.label || f.key}</span>
                      {f.labelTa && <span className="t-xs ta t-muted">{f.labelTa}</span>}
                      <Badge tone="muted">{FIELD_TYPE_META[f.type].label}</Badge>
                      {f.required && <Badge tone="warn">Required</Badge>}
                      {f.source?.kind === 'master' && <Badge tone="brand">Master: {f.source.master}</Badge>}
                      {f.visibility && <Badge tone="info">Conditional</Badge>}
                      {f.bind && <Badge tone="ok">System</Badge>}
                      {f.active === false && <Badge tone="muted" dot>Inactive</Badge>}
                      {f.width !== 'full' && <Badge tone="muted">{f.width}</Badge>}

                      <div className="fb-item-actions" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" icon="chevron-left" aria-label="Move up"
                          style={{ transform: 'rotate(90deg)' }} onClick={() => move(f.key, -1)} />
                        <Button size="sm" icon="chevron-left" aria-label="Move down"
                          style={{ transform: 'rotate(-90deg)' }} onClick={() => move(f.key, 1)} />
                        <Button size="sm" icon="plus" aria-label="Duplicate" onClick={() => duplicateField(f.key)} />
                        <Button size="sm" variant="danger-soft" icon="trash" aria-label="Remove"
                          onClick={() => removeField(f.key)} />
                      </div>
                    </div>
                    <div className="fb-item-key">{f.key}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* ----------------------- inspector ----------------------- */}
          <div className="fb-panel fb-inspector">
            <Card>
              <CardHead title={selected ? 'Field properties' : 'Inspector'} icon="settings" />
              <div className="card-body">
                {!selected ? (
                  <span className="t-sm t-muted">Select a field on the canvas to edit its properties.</span>
                ) : (
                  <Inspector
                    field={selected}
                    allFields={fields}
                    categories={categories}
                    onChange={(patch) => updateField(selected.key, patch)}
                  />
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* -------------------------- preview -------------------------- */}
      <Modal
        open={previewOpen} wide title={`Live preview — ${title}`} icon="eye"
        onClose={() => setPreviewOpen(false)}
        footer={
          <>
            <Segmented
              value={previewMode} onChange={setPreviewMode}
              options={[{ value: 'desktop' as const, label: 'Desktop' }, { value: 'mobile' as const, label: 'Mobile' }]}
            />
            <Button onClick={() => setPreviewValues({})}>Reset answers</Button>
            <Button variant="primary" onClick={() => setPreviewOpen(false)}>Close</Button>
          </>
        }
      >
        <div className="t-sm t-muted mb-3">
          This is exactly what a field agent sees. Conditional fields appear and disappear as you answer,
          so you can test the flow before publishing.
        </div>
        <div className={`fb-preview-frame ${previewMode}`}>
          <DynamicFieldGrid
            fields={fields ?? []}
            values={previewValues}
            errors={{}}
            onChange={(k, v) => setPreviewValues((prev) => ({ ...prev, [k]: v }))}
          />
        </div>
      </Modal>

      {/* -------------------------- versions -------------------------- */}
      <Modal open={versionsOpen} wide title="Published versions" icon="clock" onClose={() => setVersionsOpen(false)}
        footer={<Button variant="primary" onClick={() => setVersionsOpen(false)}>Close</Button>}>
        {!versions ? <span className="t-muted">Loading…</span> : versions.length === 0 ? (
          <span className="t-muted">Nothing published yet.</span>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Version</th><th>Published</th><th>By</th><th>What changed</th><th style={{ width: 110 }}></th></tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.version}>
                    <td>
                      <span className="t-semi">v{v.version}</span>{' '}
                      {v.status === 'published' && <Badge tone="ok" dot>Live</Badge>}
                    </td>
                    <td className="t-sm t-muted">{fmtDate(v.publishedAt, true)}</td>
                    <td className="t-sm">{v.publishedByName ?? '—'}</td>
                    <td className="t-sm t-muted">{v.changeSummary ?? '—'}</td>
                    <td>
                      <Button size="sm" icon="refresh" onClick={() => void restore(v.version)}>Load</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={confirmPublish} title="Publish this form to field agents?" confirmLabel="Publish now"
        busy={publishing}
        message={
          <>
            Every agent picks this up on their next survey — no app update needed.
            Existing survey answers are never changed, and the current version {publishedVersion} stays
            in history so you can roll back.
          </>
        }
        onCancel={() => setConfirmPublish(false)} onConfirm={() => void publish()}
      />
      <ConfirmModal
        open={confirmRevert} danger title="Discard your unpublished changes?" confirmLabel="Discard"
        message={`The draft goes back to published version ${publishedVersion}. This cannot be undone.`}
        onCancel={() => setConfirmRevert(false)} onConfirm={() => void revert()}
      />
    </>
  );
}

/* ============================== inspector ================================= */
function Inspector({ field, allFields, categories, onChange }: {
  field: FormField;
  allFields: FormField[];
  categories: CategoryList | null;
  onChange: (patch: Partial<FormField>) => void;
}) {
  const structural = isStructural(field.type);
  const choice = isChoice(field.type);

  // A rule may only depend on a field placed above this one — the same
  // constraint the server enforces, surfaced here so it can't be built wrong.
  const earlier = allFields.slice(0, allFields.findIndex((f) => f.key === field.key))
    .filter((f) => !isStructural(f.type));

  const optionsText = (field.source?.options ?? [])
    .map((o) => (o.labelTa ? `${o.label} | ${o.labelTa}` : o.label)).join('\n');

  const setOptionsFromText = (text: string) => {
    const options = text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const [label, labelTa] = line.split('|').map((s) => s.trim());
      return { value: slugifyKey(label) || label, label, labelTa: labelTa || null };
    });
    onChange({ source: { kind: 'static', options } });
  };

  return (
    <div className="stack">
      <Field label="Field key" hint="Identifies stored answers — changing it starts a new answer history">
        <Input className="mono" value={field.key}
          onChange={(e) => onChange({ key: slugifyKey(e.target.value) })}
          disabled={!!field.bind} />
      </Field>

      <Field label="Label (English)" required={!structural}>
        <Input value={field.label} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Label (Tamil)">
        <Input className="ta" value={field.labelTa ?? ''} onChange={(e) => onChange({ labelTa: e.target.value })} />
      </Field>
      <Field label="Help hint (English)">
        <Input value={field.hint ?? ''} onChange={(e) => onChange({ hint: e.target.value })} />
      </Field>
      <Field label="Help hint (Tamil)">
        <Input className="ta" value={field.hintTa ?? ''} onChange={(e) => onChange({ hintTa: e.target.value })} />
      </Field>

      {!structural && (
        <>
          <Field label="Width">
            <Segmented
              value={field.width}
              onChange={(w) => onChange({ width: w })}
              options={[
                { value: 'full' as const, label: 'Full' },
                { value: 'half' as const, label: '1/2' },
                { value: 'third' as const, label: '1/3' },
              ]}
            />
          </Field>

          <Field label="Placeholder">
            <Input value={field.placeholder ?? ''} onChange={(e) => onChange({ placeholder: e.target.value })} />
          </Field>

          <Field label="Mandatory">
            <Switch checked={!!field.required} onChange={(v) => onChange({ required: v })}
              label={field.required ? 'Agent must answer' : 'Optional'} />
          </Field>

          <Field label="Status">
            <Switch checked={field.active !== false} onChange={(v) => onChange({ active: v })}
              label={field.active !== false ? 'Active — shown on the survey' : 'Inactive — hidden'} />
          </Field>

          {field.bind && (
            <Alert tone="info">
              This field saves to the <strong>{SYSTEM_BINDINGS.find((b) => b.value === field.bind)?.label}</strong> column,
              which the dashboards, analytics and Excel export read. You can relabel, reorder and hide it,
              but its key and data source are fixed.
            </Alert>
          )}
        </>
      )}

      {field.type === 'textarea' && (
        <Field label="Rows">
          <Input type="number" min={2} max={10} value={field.rows ?? 3}
            onChange={(e) => onChange({ rows: Number(e.target.value) || 3 })} />
        </Field>
      )}

      {(field.type === 'number') && (
        <div className="grid cols-2">
          <Field label="Minimum">
            <Input type="number" value={field.validation?.min ?? ''}
              onChange={(e) => onChange({ validation: { ...field.validation, min: e.target.value === '' ? undefined : Number(e.target.value) } })} />
          </Field>
          <Field label="Maximum">
            <Input type="number" value={field.validation?.max ?? ''}
              onChange={(e) => onChange({ validation: { ...field.validation, max: e.target.value === '' ? undefined : Number(e.target.value) } })} />
          </Field>
        </div>
      )}

      {field.type === 'date' && (
        <div className="grid cols-2">
          <Field label="Earliest date">
            <Input type="date" value={field.validation?.minDate ?? ''}
              onChange={(e) => onChange({ validation: { ...field.validation, minDate: e.target.value } })} />
          </Field>
          <Field label="Latest date">
            <Input type="date" value={field.validation?.maxDate ?? ''}
              onChange={(e) => onChange({ validation: { ...field.validation, maxDate: e.target.value } })} />
          </Field>
        </div>
      )}

      {(field.type === 'text' || field.type === 'textarea') && (
        <>
          <div className="grid cols-2">
            <Field label="Min length">
              <Input type="number" value={field.validation?.minLength ?? ''}
                onChange={(e) => onChange({ validation: { ...field.validation, minLength: e.target.value === '' ? undefined : Number(e.target.value) } })} />
            </Field>
            <Field label="Max length">
              <Input type="number" value={field.validation?.maxLength ?? ''}
                onChange={(e) => onChange({ validation: { ...field.validation, maxLength: e.target.value === '' ? undefined : Number(e.target.value) } })} />
            </Field>
          </div>
          <Field label="Custom pattern (regex)" hint="Leave blank for no pattern check">
            <Input className="mono" value={field.validation?.regex ?? ''} placeholder="^[A-Z]{3}\\d{4}$"
              onChange={(e) => onChange({ validation: { ...field.validation, regex: e.target.value } })} />
          </Field>
          {field.validation?.regex && (
            <Field label="Message when it does not match">
              <Input value={field.validation?.regexMessage ?? ''}
                onChange={(e) => onChange({ validation: { ...field.validation, regexMessage: e.target.value } })} />
            </Field>
          )}
        </>
      )}

      {choice && !field.bind && (
        <>
          <Field label="Where do the options come from?">
            <Segmented
              value={field.source?.kind ?? 'static'}
              onChange={(kind) => onChange({
                source: kind === 'master'
                  ? { kind: 'master', master: categories?.system[0]?.key ?? 'caste' }
                  : { kind: 'static', options: field.source?.options ?? [{ value: 'option_1', label: 'Option 1' }] },
              })}
              options={[
                { value: 'static' as const, label: 'Fixed list' },
                { value: 'master' as const, label: 'Master data' },
              ]}
            />
          </Field>

          {field.source?.kind === 'master' ? (
            <>
              <Field label="Master data source">
                <Select value={field.source.master ?? ''}
                  onChange={(e) => onChange({ source: { ...field.source, kind: 'master', master: e.target.value } })}>
                  <optgroup label="Built-in">
                    {(categories?.system ?? []).map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                  </optgroup>
                  {!!categories?.custom.length && (
                    <optgroup label="Custom lists">
                      {categories.custom.map((c) => (
                        <option key={c.key} value={c.key}>{c.name} ({c.activeCount})</option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              </Field>
              <Field label="Filter by an earlier field (cascading)" hint="e.g. show only the sub-jobs of the chosen sector">
                <Select value={field.source.parentField ?? ''}
                  onChange={(e) => onChange({ source: { ...field.source, kind: 'master', parentField: e.target.value || undefined } })}>
                  <option value="">No filter</option>
                  {earlier.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </Select>
              </Field>
            </>
          ) : (
            <Field label="Options" hint="One per line. Use “English | Tamil” for both languages.">
              <Textarea rows={5} value={optionsText} onChange={(e) => setOptionsFromText(e.target.value)} />
            </Field>
          )}
        </>
      )}

      {!structural && (
        <>
          <div className="section-tag mt-3">Show this field only if…</div>
          <Field label="Depends on">
            <Select
              value={field.visibility?.field ?? ''}
              onChange={(e) => onChange({
                visibility: e.target.value
                  ? { field: e.target.value, op: field.visibility?.op ?? 'eq', value: field.visibility?.value ?? '' }
                  : null,
              })}
            >
              <option value="">Always show</option>
              {earlier.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </Select>
          </Field>

          {field.visibility && (
            <div className="grid cols-2">
              <Field label="Condition">
                <Select value={field.visibility.op}
                  onChange={(e) => onChange({ visibility: { ...field.visibility!, op: e.target.value as never } })}>
                  <option value="eq">is exactly</option>
                  <option value="ne">is not</option>
                  <option value="in">is one of</option>
                  <option value="filled">is answered</option>
                  <option value="empty">is blank</option>
                </Select>
              </Field>
              {!['filled', 'empty'].includes(field.visibility.op) && (
                <Field label="Value" hint={field.visibility.op === 'in' ? 'Comma-separated' : undefined}>
                  <Input
                    value={Array.isArray(field.visibility.value) ? field.visibility.value.join(', ') : field.visibility.value}
                    onChange={(e) => onChange({ visibility: { ...field.visibility!, value: e.target.value } })}
                  />
                </Field>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
