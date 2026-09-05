import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { BoothTree, ManagedUser, PagedUsers, Role } from '../lib/types';
import {
  Alert, Badge, Button, Card, CardHead, ConfirmModal, Empty, Field, Input, Modal,
  PageHead, Pager, PhoneInput, RolePill, Select, Switch, TableSkeleton,
  fmt, fmtDate, fmtRelative, initials, useToast,
} from '../components/ui';
import { BoothPicker } from '../components/BoothPicker';
import { Icon } from '../components/icons';

const PAGE_SIZE = 15;

export default function Users() {
  const { user } = useAuth();
  const toast = useToast();

  const [data, setData] = useState<PagedUsers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isA1 = user?.role === 'A1_SUPER_ADMIN';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.get<PagedUsers>(`/api/users/list${qs({ q, role, status, page, limit: PAGE_SIZE })}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load users');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, role, status, page]);

  useEffect(() => { setPage(1); }, [q, role, status]);

  const toggle = async (u: ManagedUser) => {
    setBusyId(u.id);
    try {
      const res = await api.post<{ isActive: boolean }>(`/api/users/${u.id}/toggle`);
      toast.ok(res.isActive ? 'Account enabled' : 'Account disabled', u.fullName ?? u.mobileNumber);
      await load();
    } catch (err) { toast.bad('Could not change status', err instanceof ApiError ? err.message : undefined); }
    finally { setBusyId(null); }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await api.del(`/api/users/${deleting.id}`);
      toast.ok('Account deleted', deleting.fullName ?? deleting.mobileNumber);
      setDeleting(null);
      await load();
    } catch (err) { toast.bad('Could not delete', err instanceof ApiError ? err.message : undefined); }
    finally { setBusyId(null); }
  };

  return (
    <>
      <PageHead
        title="Staff & Agent Management"
        sub={isA1 ? 'பயனர்கள் பட்டியல் · every supervisor and field agent' : 'Field agents inside your assigned booths'}
        actions={
          <>
            <Button icon="refresh" onClick={() => void load()}>Refresh</Button>
            <Link className="btn btn-primary" to="/admin/users/create">
              <Icon name="user-plus" size={16} />Create User
            </Link>
          </>
        }
      />

      <Card>
        <CardHead
          title={data ? `${fmt(data.total)} account${data.total === 1 ? '' : 's'}` : 'Accounts'}
          icon="users"
          actions={
            <div className="row tight">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mobile, EPIC or name…" style={{ width: 210 }} aria-label="Search accounts" />
              {isA1 && (
                <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role" style={{ width: 160 }}>
                  <option value="">All roles</option>
                  <option value="A2_SUPERVISOR">Supervisor (A2)</option>
                  <option value="A3_FIELD_AGENT">Field Agent (A3)</option>
                </Select>
              )}
              <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" style={{ width: 130 }}>
                <option value="">All status</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </Select>
            </div>
          }
        />

        <div className="card-body flush">
          {error && <div style={{ padding: 'var(--sp-4)' }}><Alert tone="bad">{error}</Alert></div>}

          {loading ? <TableSkeleton rows={6} cols={7} /> : !data || data.rows.length === 0 ? (
            <Empty icon="users" title="No accounts found">
              {q || role || status ? 'No account matches these filters.' : 'Create your first supervisor or field agent to get started.'}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Mobile number</th>
                    <th>Assigned role</th>
                    <th>EPIC ID</th>
                    <th>Jurisdiction scope</th>
                    <th className="num">Surveys</th>
                    <th>Status</th>
                    <th>Last login</th>
                    <th style={{ width: 130 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="row tight" style={{ flexWrap: 'nowrap' }}>
                          <div className="avatar" style={{ width: 32, height: 32, flex: '0 0 32px', fontSize: 12 }}>
                            {initials(u.fullName ?? u.mobileNumber)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="t-semi mono">+91 {u.mobileNumber}</div>
                            <div className="t-xs t-subtle ta t-truncate">{u.fullName ?? 'Unnamed'}</div>
                          </div>
                        </div>
                      </td>
                      <td><RolePill role={u.role} /></td>
                      <td className="mono t-sm">{u.epicId ?? <span className="t-subtle">—</span>}</td>
                      <td>
                        <div className="t-sm">
                          {u.boothCount} booth{u.boothCount === 1 ? '' : 's'}
                          {u.partNos.length > 0 && (
                            <span className="t-subtle">
                              {' '}({u.partNos.slice(0, 4).join(', ')}{u.partNos.length > 4 ? '…' : ''})
                            </span>
                          )}
                        </div>
                        <div className="t-xs t-subtle ta t-truncate" style={{ maxWidth: 190 }}>
                          {u.localBodySummary.join(', ') || '—'}
                          {u.localBodyOverflow > 0 && <span> +{u.localBodyOverflow}</span>}
                        </div>
                      </td>
                      <td className="num tabnum t-semi">{fmt(u.surveysDone)}</td>
                      <td>{u.isActive ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="bad" dot>Disabled</Badge>}</td>
                      <td className="t-sm t-muted t-nowrap">{fmtRelative(u.lastLoginAt)}</td>
                      <td>
                        <div className="actions">
                          <Button size="sm" icon="edit" onClick={() => setEditing(u)}>Edit</Button>
                          <Button
                            size="sm" icon={u.isActive ? 'ban' : 'check'} loading={busyId === u.id}
                            onClick={() => void toggle(u)}
                            aria-label={u.isActive ? 'Disable' : 'Enable'}
                            title={u.isActive ? 'Disable account' : 'Enable account'}
                          />
                          {isA1 && <Button size="sm" variant="danger-soft" icon="trash" aria-label="Delete" onClick={() => setDeleting(u)} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {data && data.total > PAGE_SIZE && (
          <Pager page={page} pages={data.pages} total={data.total} pageSize={PAGE_SIZE} onPage={setPage} />
        )}
      </Card>

      {editing && (
        <EditUserModal user={editing} canChangeRole={isA1} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
      )}

      <ConfirmModal
        open={!!deleting} danger title="Delete this account?" confirmLabel="Delete account"
        busy={busyId === deleting?.id}
        message={
          <>
            <strong>{deleting?.fullName ?? deleting?.mobileNumber}</strong> will be permanently removed and can no
            longer sign in. Survey records they collected are kept, but will no longer show their name.
          </>
        }
        onCancel={() => setDeleting(null)} onConfirm={() => void remove()}
      />
    </>
  );
}

/* ============================== edit modal =============================== */
function EditUserModal({ user, canChangeRole, onClose, onSaved }: {
  user: ManagedUser; canChangeRole: boolean; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [role, setRole] = useState<Role>(user.role);
  const [fullName, setFullName] = useState(user.fullName ?? '');
  const [mobile, setMobile] = useState(user.mobileNumber);
  const [epic, setEpic] = useState(user.epicId ?? '');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(user.isActive);
  const [partNos, setPartNos] = useState<number[]>(user.partNos);
  const [tree, setTree] = useState<BoothTree | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<BoothTree>('/api/users/jurisdictions').then(setTree).catch(() => setError('Could not load the booth list'));
  }, []);

  const save = async () => {
    setSaving(true); setError(''); setFields({});
    try {
      const body: Record<string, unknown> = {
        fullName: fullName.trim(),
        mobileNumber: mobile.trim(),
        epicId: epic.trim().toUpperCase() || null,
        isActive: active,
        partNos,
      };
      if (canChangeRole && role !== user.role) body.role = role;
      if (password) body.password = password;
      await api.patch(`/api/users/${user.id}`, body);
      toast.ok('Account updated', fullName || mobile);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) { setFields(err.fields); setError(err.message); }
      else setError('Could not save changes');
    } finally { setSaving(false); }
  };

  return (
    <Modal
      open wide title={`Edit — ${user.fullName ?? user.mobileNumber}`} icon="edit" onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" icon="save" loading={saving} onClick={() => void save()}>Save changes</Button>
        </>
      }
    >
      {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}

      <div className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <RolePill role={user.role} />
          <span className="t-xs t-muted">
            {fmt(user.surveysDone)} surveys · created {fmtDate(user.createdAt)}
          </span>
        </div>

        <div className="grid cols-2">
          <Field label="Role" required error={fields.role} hint={canChangeRole ? undefined : 'Only a Super Admin can change a role'}>
            {canChangeRole ? (
              <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="A2_SUPERVISOR">Supervisor (A2)</option>
                <option value="A3_FIELD_AGENT">Field Agent (A3)</option>
              </Select>
            ) : (
              <div className="row" style={{ height: 38 }}><Badge tone="brand">{user.roleLabel}</Badge></div>
            )}
          </Field>
          <Field label="Account status" required>
            <div className="row" style={{ height: 38 }}>
              <Switch checked={active} onChange={setActive} label={active ? 'Active (செயலில் உள்ளது)' : 'Disabled (முடக்கப்பட்டுள்ளது)'} />
            </div>
          </Field>
        </div>

        <div className="grid cols-2">
          <Field label="Full name">
            <Input className="ta" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Mobile number" required error={fields.mobileNumber}>
            <PhoneInput value={mobile} onChange={setMobile} invalid={!!fields.mobileNumber} />
          </Field>
        </div>

        <div className="grid cols-2">
          <Field label="Verified EPIC ID" error={fields.epicId} hint="Leave blank to unlink">
            <Input className="mono" value={epic} onChange={(e) => setEpic(e.target.value)} placeholder="IEB0787739" invalid={!!fields.epicId} />
          </Field>
          <Field label="Reset password" hint="Leave blank to keep the current password" error={fields.password}>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (min 6 characters)" invalid={!!fields.password} autoComplete="new-password" />
          </Field>
        </div>

        <Field label={`Booth assignment (${partNos.length} selected)`} required error={fields.partNos}
          hint="The user can only see and survey electors in these booths">
          <BoothPicker tree={tree} selected={partNos} onChange={setPartNos} />
        </Field>
      </div>
    </Modal>
  );
}
