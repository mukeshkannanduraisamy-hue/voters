import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { BoothTree, EpicVerification, Role } from '../lib/types';
import {
  Alert, Badge, Button, Card, CardHead, Field, Input, PageHead, PhoneInput, Segmented,
  Switch, fmt, useToast,
} from '../components/ui';
import { BoothPicker } from '../components/BoothPicker';
import { Icon } from '../components/icons';

export default function CreateUser() {
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();

  const isA1 = user?.role === 'A1_SUPER_ADMIN';

  // A supervisor may only ever register field agents, so the control is locked.
  const [role, setRole] = useState<Role>(isA1 ? 'A2_SUPERVISOR' : 'A3_FIELD_AGENT');
  const [active, setActive] = useState(true);
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [epic, setEpic] = useState('');

  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<EpicVerification | null>(null);
  const [verifyError, setVerifyError] = useState('');

  const [tree, setTree] = useState<BoothTree | null>(null);
  const [partNos, setPartNos] = useState<number[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<BoothTree>('/api/users/jurisdictions')
      .then(setTree)
      .catch(() => setError('Could not load the booth list.'));
  }, []);

  const verifyEpic = async () => {
    const value = epic.trim().toUpperCase();
    if (!value) { setVerifyError('Enter an EPIC ID to verify.'); return; }
    setVerifying(true);
    setVerifyError('');
    setVerified(null);
    try {
      const res = await api.get<EpicVerification>(`/api/voters/verify-epic?epic_id=${encodeURIComponent(value)}`);
      setVerified(res);
      setEpic(res.voter.epicId);
      if (res.alreadyRegistered) {
        setVerifyError(`This EPIC is already linked to account ${res.registeredMobile}. Choose another.`);
      } else if (!fullName.trim()) {
        setFullName(res.voter.nameTa);
      }
    } catch (err) {
      setVerifyError(err instanceof ApiError ? err.message : 'Verification failed');
    } finally { setVerifying(false); }
  };

  // Editing the EPIC invalidates a previous verification.
  const onEpicChange = (v: string) => {
    setEpic(v);
    if (verified) { setVerified(null); setVerifyError(''); }
  };

  // EPIC is optional in the schema, so the gate is booths + credentials.
  const canSubmit = partNos.length > 0 && !verified?.alreadyRegistered;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setErrors({});

    const fe: Record<string, string> = {};
    if (!/^[6-9]\d{9}$/.test(mobile.trim())) fe.mobileNumber = 'Enter a valid 10-digit number starting 6-9';
    if (password.length < 6) fe.password = 'Password must be at least 6 characters';
    if (verified?.alreadyRegistered) fe.epicId = 'This EPIC is already linked to an account';
    if (!partNos.length) fe.partNos = 'Select at least one polling booth';
    if (Object.keys(fe).length) {
      setErrors(fe);
      setError('Please correct the highlighted fields.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/api/users/create', {
        role,
        mobileNumber: mobile.trim(),
        password,
        epicId: epic.trim().toUpperCase() || null,
        fullName: fullName.trim() || null,
        isActive: active,
        partNos,
      });
      toast.ok('Account created', `${role === 'A2_SUPERVISOR' ? 'Supervisor' : 'Field Agent'} · ${mobile}`);
      nav('/admin/users');
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); setError(err.message); }
      else setError('Could not create the account.');
    } finally { setSaving(false); }
  };

  const selectedVoters = (tree?.parts ?? [])
    .filter((p) => partNos.includes(p.part_no))
    .reduce((a, p) => a + p.voter_count, 0);

  return (
    <form onSubmit={submit}>
      <PageHead
        title="Register New Staff User"
        sub="புதிய பயனர் பதிவு · credentials, EPIC verification and booth assignment"
        actions={<Button icon="arrow-left" onClick={() => nav('/admin/users')}>Back to accounts</Button>}
      />

      {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}

      <div className="grid cols-2-1">
        <div className="stack">
          {/* ---- 1. role & credentials ---- */}
          <Card>
            <CardHead title="1 · Role and credentials" icon="user" />
            <div className="card-body stack">
              <div className="grid cols-2">
                <Field label="Select role" required hint={isA1 ? undefined : 'A supervisor can only register field agents'}>
                  {isA1 ? (
                    <Segmented
                      full value={role} onChange={setRole}
                      options={[
                        { value: 'A2_SUPERVISOR' as Role, label: 'Supervisor (A2)' },
                        { value: 'A3_FIELD_AGENT' as Role, label: 'Field Agent (A3)' },
                      ]}
                    />
                  ) : (
                    <div className="row" style={{ height: 38 }}><Badge tone="brand">Field Agent (A3)</Badge></div>
                  )}
                </Field>
                <Field label="Account status" required>
                  <div className="row" style={{ height: 38 }}>
                    <Switch checked={active} onChange={setActive} label={active ? 'Active (செயலில்)' : 'Disabled (முடக்கப்பட்டது)'} />
                  </div>
                </Field>
              </div>

              <div className="grid cols-2">
                <Field label="Mobile number" required error={errors.mobileNumber}>
                  <PhoneInput value={mobile} onChange={setMobile} placeholder="9840123456" invalid={!!errors.mobileNumber} autoComplete="off" />
                </Field>
                <Field label="Password" required error={errors.password} hint="Minimum 6 characters">
                  <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set a login password" invalid={!!errors.password} autoComplete="new-password" />
                </Field>
              </div>

              <Field label="Display name" hint="Defaults to the verified elector's name">
                <Input className="ta" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. R. Rajesh Kumar" />
              </Field>
            </div>
          </Card>

          {/* ---- 2. EPIC verification ---- */}
          <Card>
            <CardHead title="2 · Voter EPIC verification" sub="Optional, but recommended — ties the account to a real elector" icon="shield" />
            <div className="card-body stack">
              <Field label="EPIC ID" error={errors.epicId}>
                <div className="input-group">
                  <Input
                    value={epic}
                    onChange={(e) => onEpicChange(e.target.value)}
                    placeholder="e.g. IEB0787739"
                    className="mono"
                    invalid={!!errors.epicId}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void verifyEpic(); } }}
                  />
                  <Button type="button" icon="search" loading={verifying} onClick={() => void verifyEpic()}>Verify EPIC</Button>
                </div>
              </Field>

              {verifyError && <Alert tone={verified?.alreadyRegistered ? 'warn' : 'bad'}>{verifyError}</Alert>}

              {verified?.verified && !verified.alreadyRegistered && (
                <Alert tone="ok">
                  <div>
                    <strong className="ta">✓ Verified: {verified.voter.nameTa}</strong>
                    <div className="t-sm mt-2">
                      {verified.voter.age} / <span className="ta">{verified.voter.gender}</span> ·
                      Part {verified.voter.partNo} · <span className="ta">{verified.voter.localBodyNameTa}</span>
                    </div>
                    <div className="t-xs mt-2 t-muted">{verified.voter.constituency}</div>
                  </div>
                </Alert>
              )}

              {!verified && !verifyError && (
                <div className="t-sm t-muted row tight">
                  <Icon name="info" size={15} />
                  The EPIC must exist in the roll and not already be linked to another account.
                </div>
              )}
            </div>
          </Card>

          {/* ---- 3. booth assignment ---- */}
          <Card>
            <CardHead
              title="3 · Assign polling booths"
              sub="These booths define everything the user can see and survey"
              icon="map-pin"
              actions={<Badge tone={partNos.length ? 'brand' : 'muted'}>{partNos.length} selected</Badge>}
            />
            <div className="card-body">
              {errors.partNos && <div className="mb-3"><Alert tone="bad">{errors.partNos}</Alert></div>}
              <BoothPicker tree={tree} selected={partNos} onChange={setPartNos} />
            </div>
          </Card>
        </div>

        {/* ---- summary rail ---- */}
        <div className="stack">
          <Card>
            <CardHead title="Summary" icon="list" />
            <div className="card-body stack tight">
              <Row label="Role" value={role === 'A2_SUPERVISOR' ? 'Supervisor (A2)' : 'Field Agent (A3)'} />
              <Row label="Status" value={active ? 'Active' : 'Disabled'} />
              <Row label="Mobile" value={mobile ? `+91 ${mobile}` : '—'} mono />
              <Row
                label="EPIC"
                value={verified?.verified ? `${epic} ✓` : epic || 'Not linked'}
                mono
                tone={verified?.verified && !verified.alreadyRegistered ? 'ok' : undefined}
              />
              <Row label="Booths" value={fmt(partNos.length)} tone={partNos.length ? 'ok' : undefined} />
              <Row label="Electors in scope" value={fmt(selectedVoters)} />
            </div>
          </Card>

          <Card>
            <div className="card-body stack tight">
              <Button type="submit" variant="primary" size="lg" block icon="user-plus" loading={saving} disabled={!canSubmit}>
                Create User Account
              </Button>
              <Button type="button" block onClick={() => nav('/admin/users')} disabled={saving}>Cancel</Button>
              {!canSubmit && (
                <div className="t-xs t-subtle t-center mt-2">
                  {verified?.alreadyRegistered ? 'This EPIC is already in use' : 'Select at least one polling booth'}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </form>
  );
}

function Row({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: 'ok' }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 'var(--sp-3)' }}>
      <span className="t-xs t-muted t-bold" style={{ letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
      <span
        className={`t-sm t-semi t-truncate ${mono ? 'mono' : ''}`}
        style={{ color: tone === 'ok' ? 'var(--ok-600)' : undefined, textAlign: 'right' }}
      >
        {value}
      </span>
    </div>
  );
}
