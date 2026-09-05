import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, HOME_FOR } from '../lib/auth';
import { ApiError, api } from '../lib/api';
import type { HealthInfo } from '../lib/types';
import { Alert, Button, Field, Input, PhoneInput, fmt } from '../components/ui';
import { Icon } from '../components/icons';

const DEMO = [
  { role: 'A1 Super Admin', mobile: '9876543210', password: 'admin123', note: 'Global — all 318 booths' },
  { role: 'A2 Supervisor', mobile: '9840123456', password: 'super123', note: 'Assigned booths only' },
  { role: 'A3 Field Agent', mobile: '9845012345', password: 'agent123', note: 'Mobile field survey' },
];

export default function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();

  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [health, setHealth] = useState<HealthInfo | null>(null);

  // Already signed in (e.g. hit /login directly) → straight to the role home.
  useEffect(() => {
    if (user) nav(HOME_FOR[user.role], { replace: true });
  }, [user, nav]);

  // Hero figures come from the live database, not hardcoded copy.
  useEffect(() => {
    api.get<HealthInfo>('/api/health').then(setHealth).catch(() => setHealth(null));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^[6-9]\d{9}$/.test(mobile.trim())) {
      setError('Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    setBusy(true);
    try {
      const me = await login(mobile.trim(), password);
      nav(HOME_FOR[me.role], { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const ac = health?.constituency;

  return (
    <div className="login-wrap">
      <section className="login-hero">
        <div className="login-hero-brand">
          <div className="brand-mark"><Icon name="vote" size={20} /></div>
          <div>
            <div className="brand-title">Voter Survey Portal</div>
            <div className="brand-sub ta">வாக்காளர் கணக்கெடுப்பு போர்டல்</div>
          </div>
        </div>

        <div>
          <h1>Door-to-door survey,<br />verified against the roll.</h1>
          <p>
            A three-tier portal for electoral verification, on-ground field surveys and
            live booth-wise progress tracking.
          </p>

          <div className="login-feats">
            <div className="login-feat">
              <div className="login-feat-icon"><Icon name="shield" size={17} /></div>
              <div>
                <strong>EPIC-verified accounts</strong>
                <span>Staff accounts are tied to a real entry in the electoral roll.</span>
              </div>
            </div>
            <div className="login-feat">
              <div className="login-feat-icon"><Icon name="map-pin" size={17} /></div>
              <div>
                <strong>Booth-level jurisdiction</strong>
                <span>Supervisors own a set of booths, agents own theirs — enforced end to end.</span>
              </div>
            </div>
            <div className="login-feat">
              <div className="login-feat-icon"><Icon name="trending-up" size={17} /></div>
              <div>
                <strong>Live progress dashboards</strong>
                <span>Completion by panchayat and by agent, updated on every submission.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="login-hero-foot">
          <div className="login-hero-stat">
            <strong>{health ? fmt(health.counts.liveVoters) : '—'}</strong>
            <span>Electors</span>
          </div>
          <div className="login-hero-stat">
            <strong>{health ? fmt(health.counts.booths) : '—'}</strong>
            <span>Booths</span>
          </div>
          <div className="login-hero-stat">
            <strong>{health ? fmt(health.counts.localBodies) : '—'}</strong>
            <span>Local Bodies</span>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-form" onSubmit={submit} noValidate>
          <div className="login-mark-sm">
            <div className="brand-mark"><Icon name="vote" size={20} /></div>
            <div>
              <div style={{ fontWeight: 700 }}>Voter Survey Portal</div>
              <div className="t-xs t-muted ta">வாக்காளர் போர்டல்</div>
            </div>
          </div>

          <h2>Sign in</h2>
          <p className="lead t-muted">
            {ac ? `AC #${ac.acNo} ${ac.acNameTa} · ${ac.districtTa} District` : 'Use your registered mobile number and password.'}
          </p>

          {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}

          <div className="stack">
            <Field label="Mobile Number (கைபேசி எண்)" required htmlFor="mobile">
              <PhoneInput
                id="mobile"
                value={mobile}
                onChange={setMobile}
                invalid={!!error && !mobile}
                autoComplete="username"
                autoFocus
              />
            </Field>

            <Field label="Password (கடவுச்சொல்)" required htmlFor="password">
              <div style={{ position: 'relative' }}>
                <Input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: 42 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    border: 'none', background: 'none', color: 'var(--text-subtle)',
                    padding: 6, display: 'grid', placeItems: 'center',
                  }}
                >
                  <Icon name={showPw ? 'ban' : 'eye'} size={16} />
                </button>
              </div>
            </Field>

            <Button type="submit" variant="primary" size="lg" block loading={busy} icon="lock">
              {busy ? 'Signing in…' : 'Sign In to Portal (உள்நுழைக)'}
            </Button>
          </div>

          <div className="demo-box">
            <div className="demo-head">Quick test credentials — click to fill</div>
            {DEMO.map((d) => (
              <button
                key={d.mobile}
                type="button"
                className="demo-row"
                onClick={() => { setMobile(d.mobile); setPassword(d.password); setError(''); }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="demo-row-name">{d.role}</div>
                  <div className="demo-row-cred mono">{d.mobile} / {d.password}</div>
                </div>
                <span className="use">USE</span>
              </button>
            ))}
          </div>
        </form>
      </section>
    </div>
  );
}
