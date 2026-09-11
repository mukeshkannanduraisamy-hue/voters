import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api } from '../lib/api';
import {
  Alert, Badge, Button, Card, CardHead, ConfirmModal, Empty, Field, Input, Modal,
  TableSkeleton, fmt, fmtDate, useToast,
} from './ui';
import { Icon } from './icons';

interface CustomCategory {
  id: number; key: string; name: string; nameTa: string | null;
  description: string | null; isActive: boolean;
  itemCount: number; activeCount: number; createdAt: string;
}
interface SystemCategory { key: string; name: string; nameTa: string }
interface CategoryList { system: SystemCategory[]; custom: CustomCategory[] }

interface MasterItem {
  id: number; name: string; nameTa: string | null;
  parentId: number | null; parentName: string | null;
  sortOrder: number; isActive: boolean; createdAt: string;
}

/**
 * Custom lookup lists — the part of the Master Data Hub a Super Admin can grow
 * without a schema change. Anything created here becomes bindable from the Form
 * Builder's "Master data" option source.
 */
export function CustomMasters() {
  const toast = useToast();
  const [data, setData] = useState<CategoryList | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<CustomCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CustomCategory | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError('');
    try { setData(await api.get<CategoryList>('/api/master-categories')); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not load master categories'); }
  };
  useEffect(() => { void load(); }, []);

  const toggle = async (c: CustomCategory) => {
    setBusy(true);
    try {
      await api.patch(`/api/master-categories/${c.id}`, { isActive: !c.isActive });
      await load();
    } catch (err) { toast.bad('Could not update', err instanceof ApiError ? err.message : undefined); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/api/master-categories/${deleting.id}`);
      toast.ok('List deleted', deleting.name);
      setDeleting(null);
      await load();
    } catch (err) {
      toast.bad('Could not delete', err instanceof ApiError ? err.message : undefined);
      setDeleting(null);
    } finally { setBusy(false); }
  };

  return (
    <>
      <Card className="mb-4">
        <CardHead
          title="Built-in master data"
          sub="Managed on the tabs above — always available to bind from the Form Builder"
          icon="database"
        />
        <div className="card-body">
          <div className="row tight">
            {(data?.system ?? []).map((s) => (
              <span key={s.key} className="chip">
                {s.name}
                <span className="t-xs t-subtle"> · {s.key}</span>
              </span>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <CardHead
          title="Custom lookup lists"
          sub={data ? `${fmt(data.custom.length)} list${data.custom.length === 1 ? '' : 's'} you can bind to any dropdown, radio or multi-select field` : undefined}
          icon="layers"
          actions={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New list</Button>}
        />
        <div className="card-body flush">
          {error && <div style={{ padding: 'var(--sp-4)' }}><Alert tone="bad">{error}</Alert></div>}
          {!data ? <TableSkeleton rows={4} cols={5} /> : data.custom.length === 0 ? (
            <Empty icon="layers" title="No custom lists yet">
              Create one for anything your constituency tracks that isn't caste, occupation, party or
              education — welfare schemes, ration card types, community roles, and so on.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>List</th><th>Bind key</th><th className="num">Options</th>
                    <th>Status</th><th>Created</th><th style={{ width: 210 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.custom.map((c) => (
                    <tr key={c.id} style={{ opacity: c.isActive ? 1 : 0.6 }}>
                      <td>
                        <div className="t-semi">{c.name}</div>
                        {c.nameTa && <div className="t-sm ta t-muted">{c.nameTa}</div>}
                      </td>
                      <td><span className="mono t-xs">{c.key}</span></td>
                      <td className="num tabnum">
                        {c.activeCount}{c.itemCount !== c.activeCount && <span className="t-subtle"> / {c.itemCount}</span>}
                      </td>
                      <td>{c.isActive ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="muted" dot>Disabled</Badge>}</td>
                      <td className="t-sm t-muted">{fmtDate(c.createdAt)}</td>
                      <td>
                        <div className="actions">
                          <Button size="sm" icon="list" onClick={() => setOpen(c)}>Options</Button>
                          <Button size="sm" icon={c.isActive ? 'ban' : 'check'} loading={busy} onClick={() => void toggle(c)}>
                            {c.isActive ? 'Disable' : 'Enable'}
                          </Button>
                          <Button size="sm" variant="danger-soft" icon="trash" aria-label="Delete" onClick={() => setDeleting(c)} />
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

      {creating && <NewCategoryModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void load(); }} />}
      {open && <ItemsModal category={open} onClose={() => { setOpen(null); void load(); }} />}

      <ConfirmModal
        open={!!deleting} danger title={`Delete "${deleting?.name}"?`} confirmLabel="Delete"
        busy={busy}
        message="Deleting is only allowed when no form field binds to this list and no survey has recorded one of its options. Otherwise, disable it instead — that hides it from new surveys while existing records keep reading correctly."
        onCancel={() => setDeleting(null)} onConfirm={() => void remove()}
      />
    </>
  );
}

function NewCategoryModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [nameTa, setNameTa] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) { setError('Give the list a name of at least 2 characters.'); return; }
    setSaving(true);
    try {
      await api.post('/api/master-categories', { name: name.trim(), nameTa: nameTa.trim(), description: description.trim() });
      toast.ok('List created', name.trim());
      onSaved();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not create the list'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open title="New custom lookup list" icon="plus" onClose={onClose}
      footer={<>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" icon="save" loading={saving} onClick={(e) => save(e as unknown as FormEvent)}>Create</Button>
      </>}>
      {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}
      <form onSubmit={save} className="stack">
        <Field label="List name (English)" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Welfare Scheme" autoFocus />
        </Field>
        <Field label="List name (Tamil)">
          <Input className="ta" value={nameTa} onChange={(e) => setNameTa(e.target.value)} placeholder="நலத்திட்டம்" />
        </Field>
        <Field label="Description" hint="Shown to admins only">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Alert tone="info">
          Once created, bind it from the Form Builder by setting a dropdown, radio or multi-select
          field's source to <strong>Master data</strong>.
        </Alert>
      </form>
    </Modal>
  );
}

function ItemsModal({ category, onClose }: { category: CustomCategory; onClose: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<MasterItem[] | null>(null);
  const [name, setName] = useState('');
  const [nameTa, setNameTa] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    try { setItems(await api.get<MasterItem[]>(`/api/master-categories/${category.id}/items`)); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not load options'); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [category.id]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Enter an option name.'); return; }
    setAdding(true);
    try {
      await api.post(`/api/master-categories/${category.id}/items`, { name: name.trim(), nameTa: nameTa.trim() });
      setName(''); setNameTa('');
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not add the option'); }
    finally { setAdding(false); }
  };

  const toggle = async (item: MasterItem) => {
    setBusyId(item.id);
    try {
      await api.patch(`/api/master-categories/items/${item.id}`, { isActive: !item.isActive });
      await load();
    } catch (err) { toast.bad('Could not update', err instanceof ApiError ? err.message : undefined); }
    finally { setBusyId(null); }
  };

  const remove = async (item: MasterItem) => {
    setBusyId(item.id);
    try {
      await api.del(`/api/master-categories/items/${item.id}`);
      toast.ok('Option removed', item.name);
      await load();
    } catch (err) {
      toast.bad('Could not delete', err instanceof ApiError ? err.message : undefined);
    } finally { setBusyId(null); }
  };

  return (
    <Modal open wide title={`Options — ${category.name}`} icon="list" onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="stack">
        <form onSubmit={add}>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 200px' }}>
              <Field label="Option (English)" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Free Bus Pass" /></Field>
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <Field label="Option (Tamil)"><Input className="ta" value={nameTa} onChange={(e) => setNameTa(e.target.value)} placeholder="இலவச பேருந்து" /></Field>
            </div>
            <Button type="submit" variant="primary" icon="plus" loading={adding}>Add</Button>
          </div>
        </form>

        {error && <Alert tone="bad">{error}</Alert>}

        {!items ? <TableSkeleton rows={4} cols={3} /> : items.length === 0 ? (
          <Empty icon="list" title="No options yet">Add the first option above.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Option</th><th>Status</th><th style={{ width: 190 }}>Actions</th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} style={{ opacity: i.isActive ? 1 : 0.6 }}>
                    <td>
                      <div className="t-semi">{i.name}</div>
                      {i.nameTa && <div className="t-sm ta t-muted">{i.nameTa}</div>}
                    </td>
                    <td>{i.isActive ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="muted" dot>Disabled</Badge>}</td>
                    <td>
                      <div className="actions">
                        <Button size="sm" icon={i.isActive ? 'ban' : 'check'} loading={busyId === i.id} onClick={() => void toggle(i)}>
                          {i.isActive ? 'Disable' : 'Enable'}
                        </Button>
                        <Button size="sm" variant="danger-soft" icon="trash" aria-label="Delete"
                          loading={busyId === i.id} onClick={() => void remove(i)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Alert tone="info">
          <Icon name="info" size={14} /> Disabling an option hides it from new surveys but keeps every
          historical answer readable. Deleting is blocked once a survey has recorded it.
        </Alert>
      </div>
    </Modal>
  );
}
