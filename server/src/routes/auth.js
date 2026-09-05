import express from 'express';
import { db, nowIso } from '../lib/db.js';
import {
  authenticate, signToken, setAuthCookie, clearAuthCookie,
  hashPassword, verifyPassword, audit,
  ROLE_LABELS, ROLE_LABELS_TA, HOME_FOR,
} from '../lib/auth.js';
import { scopeDetail, scopePartNos } from '../lib/scope.js';

const router = express.Router();

export function publicUser(user) {
  const parts = scopePartNos(user);
  const detail = scopeDetail(user.id);
  return {
    id: user.id,
    mobileNumber: user.mobile_number,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role],
    roleLabelTa: ROLE_LABELS_TA[user.role],
    epicId: user.epic_id,
    fullName: user.full_name,
    isActive: !!user.is_active,
    lastLoginAt: user.last_login_at ?? null,
    isGlobal: parts === null,
    partCount: parts === null ? null : parts.length,
    partNos: parts ?? [],
    jurisdictions: detail,
    votersInScope: detail.reduce((a, d) => a + d.voter_count, 0),
    home: HOME_FOR[user.role],
  };
}

/** POST /api/auth/login — { mobileNumber, password } -> sets vms_token cookie */
router.post('/login', (req, res) => {
  const mobile = String(req.body?.mobileNumber ?? req.body?.mobile_number ?? '').trim();
  const password = String(req.body?.password ?? '');

  if (!mobile || !password) {
    return res.status(400).json({ error: 'Mobile number and password are both required' });
  }
  if (!/^[6-9]\d{9}$/.test(mobile)) {
    return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
  }

  const user = db.prepare('SELECT * FROM users WHERE mobile_number = ?').get(mobile);
  // Identical message for unknown mobile and wrong password — the endpoint must
  // not be usable to enumerate which accounts exist.
  if (!user || !verifyPassword(password, user.password_hash)) {
    audit(user?.id ?? null, 'LOGIN_FAILED', 'user', mobile, 'Invalid credentials');
    return res.status(401).json({
      error: 'Invalid mobile number or password (தவறான கைபேசி எண் அல்லது கடவுச்சொல்)',
    });
  }
  if (!user.is_active) {
    audit(user.id, 'LOGIN_BLOCKED', 'user', user.id, 'Account disabled');
    return res.status(403).json({ error: 'Account is disabled. Please contact Super Admin.' });
  }

  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);
  audit(user.id, 'LOGIN', 'user', user.id, null);

  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  const token = signToken(fresh);
  setAuthCookie(res, token);

  // The token is also returned so scripts and tests can use a bearer header.
  res.json({ token, user: publicUser(fresh), redirectTo: HOME_FOR[fresh.role] });
});

/** GET /api/auth/me — current session identity + live scope */
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

/** POST /api/auth/logout — clears the session cookie */
router.post('/logout', (req, res) => {
  if (req.cookies?.vms_token) {
    try {
      const me = db.prepare('SELECT id FROM users WHERE id = ?').get(req.user?.id);
      if (me) audit(me.id, 'LOGOUT', 'user', me.id, null);
    } catch { /* logging out must always succeed */ }
  }
  clearAuthCookie(res);
  res.json({ ok: true });
});

/** POST /api/auth/change-password — { currentPassword, newPassword } */
router.post('/change-password', authenticate, (req, res) => {
  const current = String(req.body?.currentPassword ?? req.body?.current_password ?? '');
  const next = String(req.body?.newPassword ?? req.body?.new_password ?? '');

  if (next.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(current, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), user.id);
  audit(user.id, 'PASSWORD_CHANGED', 'user', user.id, null);
  res.json({ ok: true, message: 'Password updated successfully' });
});

export default router;
