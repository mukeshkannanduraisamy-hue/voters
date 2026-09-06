import { useMemo, useState, type FormEvent } from 'react';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  Alert, Badge, Button, Card, CardHead, Field, Input, PageHead, RolePill,
  fmt, fmtDate, initials, useToast,
} from '../components/ui';
import { LocalBodyBadge } from '../components/spec-ui';

export default function Profile() {
  const { user, refresh } = useAuth();
  const toast = useToast();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Group the flat booth list by local body for display.
  const grouped = useMemo(() => {
    if (!user) return [];
    const map = new Map<string, { name: string; type: 'TOWN_PANCHAYAT' | 'VILLAGE_PANCHAYAT'; parts: number[]; voters: number }>();
    for (const j of user.jurisdictions) {
      if (!map.has(j.local_body_name_ta)) {
        map.set(j.local_body_name_ta, { name: j.local_body_name_ta, type: j.local_body_type, parts: [], voters: 0 });
      }
      const g = map.get(j.local_body_name_ta)!;
      g.parts.push(j.part_no);
      g.voters += j.voter_count;
    }
    return [...map.values()].sort((a, b) => b.voters - a.voters);
  }, [user]);

  if (!user) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setErrors({});

    const fe: Record<string, string> = {};
    if (!current) fe.current = 'Enter your current password';
    if (next.length < 6) fe.next = 'New password must be at least 6 characters';
    if (next !== confirm) fe.confirm = 'Passwords do not match';
    if (current && next && current === next) fe.next = 'Choose a password different from the current one';
    if (Object.keys(fe).length) { setErrors(fe); return; }

    setSaving(true);
    try {
      await api.post('/api/auth/change-password', { currentPassword: current, newPassword: next });
      toast.ok('Password updated', 'Use the new password the next time you sign in.');
      setCurrent(''); setNext(''); setConfirm('');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the password');
    } finally { setSaving(false); }
  };

  return (
    <>
      <PageHead title="My Profile" sub="Account details, jurisdiction and password" />

      <div className="grid cols-2-1">
        <div className="stack">
          <Card>
            <CardHead title="Account" icon="user" />
            <div className="card-body">
              <div className="row" style={{ gap: 'var(--sp-4)', flexWrap: 'nowrap' }}>
                <div className="avatar" style={{ width: 60, height: 60, flex: '0 0 60px', fontSize: 21 }}>
                  {initials(user.fullName ?? user.mobileNumber)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="t-lg t-bold ta t-truncate">{user.fullName ?? 'Unnamed user'}</div>
                  <div className="row tight mt-2">
                    <RolePill role={user.role} />
                    {user.isActive ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="bad" dot>Disabled</Badge>}
                  </div>
                  <div className="t-sm ta t-muted mt-2">{user.roleLabelTa}</div>
                </div>
              </div>

              <div className="locked-grid mt-5">
                <div className="locked-cell">
                  <div className="locked-key">Mobile number</div>
                  <div className="locked-val mono">+91 {user.mobileNumber}</div>
                </div>
                <div className="locked-cell">
                  <div className="locked-key">EPIC ID</div>
                  <div className="locked-val mono">{user.epicId ?? '—'}</div>
                </div>
                <div className="locked-cell">
                  <div className="locked-key">Role</div>
                  <div className="locked-val">{user.roleLabel}</div>
                </div>
                <div className="locked-cell">
                  <div className="locked-key">Last login</div>
                  <div className="locked-val">{fmtDate(user.lastLoginAt, true)}</div>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHead
              title="Assigned jurisdiction"
              sub={user.isGlobal
                ? 'Global — all 318 booths'
                : `${fmt(user.partCount ?? 0)} booths across ${grouped.length} local bod${grouped.length === 1 ? 'y' : 'ies'} · ${fmt(user.votersInScope)} electors`}
              icon="map-pin"
            />
            <div className="card-body">
              {user.isGlobal ? (
                <Alert tone="info">
                  As a <strong>Super Admin</strong> you have unrestricted access to every polling booth
                  and local body in the constituency.
                </Alert>
              ) : grouped.length === 0 ? (
                <Alert tone="warn">
                  No booths have been assigned to your account yet, so you cannot see any electors.
                  Contact your administrator.
                </Alert>
              ) : (
                <div className="stack tight">
                  {grouped.map((g) => (
                    <div key={g.name} className="locked-cell" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <div>
                          <div className="t-semi ta">{g.name}</div>
                          <div className="t-xs t-subtle tabnum">{fmt(g.voters)} electors</div>
                        </div>
                        <div className="row tight">
                          <LocalBodyBadge type={g.type} />
                          <Badge tone="brand">{g.parts.length} booth{g.parts.length === 1 ? '' : 's'}</Badge>
                        </div>
                      </div>
                      <div className="chips mt-3">
                        {g.parts.map((p) => (
                          <span key={p} className="chip" style={{ paddingRight: 11 }}>Booth {p}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        <Card style={{ alignSelf: 'flex-start' }}>
          <CardHead title="Change password" icon="key" />
          <div className="card-body">
            {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}
            <form onSubmit={submit} className="stack">
              <Field label="Current password" required error={errors.current}>
                <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" invalid={!!errors.current} />
              </Field>
              <Field label="New password" required error={errors.next} hint="At least 6 characters">
                <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" invalid={!!errors.next} />
              </Field>
              <Field label="Confirm new password" required error={errors.confirm}>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" invalid={!!errors.confirm} />
              </Field>
              <Button type="submit" variant="primary" icon="save" loading={saving} block>Update password</Button>
            </form>
          </div>
        </Card>
      </div>
    </>
  );
}
