import express from 'express';
import { db, nowIso } from '../lib/db.js';
import {
  authenticate, authenticateOptional, signToken, setAuthCookie, clearAuthCookie,
  hashPassword, verifyPassword, audit,
  ROLE_LABELS, ROLE_LABELS_TA, HOME_FOR,
} from '../lib/auth.js';
import { scopeDetail, scopePartNos } from '../lib/scope.js';

const router = express.Router();

export async function publicUser(user) {
  const parts = await scopePartNos(user);
  const detail = await scopeDetail(user.id);
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
    votersInScope: detail.reduce((a, d) => a + Number(d.voter_count || 0), 0),
    home: HOME_FOR[user.role],
  };
}

/** POST /api/auth/login — { mobileNumber, password } -> sets vms_token cookie */
router.post('/login', async (req, res, next) => {
  try {
    const mobile = String(req.body?.mobileNumber ?? req.body?.mobile_number ?? '').trim();
    const password = String(req.body?.password ?? '');

    if (!mobile || !password) {
      return res.status(400).json({ error: 'Mobile number and password are both required' });
    }
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE mobile_number = ?').get(mobile);
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

    await db.prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?').run(user.id);
    audit(user.id, 'LOGIN', 'user', user.id, null);

    const fresh = await db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    const token = signToken(fresh);
    setAuthCookie(res, token);

    const pubUser = await publicUser(fresh);
    res.json({ token, user: pubUser, redirectTo: HOME_FOR[fresh.role] });
  } catch (err) {
    next(err);
  }
});

/** GET /api/auth/me — current session identity + live scope */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const pubUser = await publicUser(user);
    res.json({ user: pubUser });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/logout — clears the session cookie */
router.post('/logout', authenticateOptional, (req, res) => {
  if (req.user) audit(req.user.id, 'LOGOUT', 'user', req.user.id, null);
  clearAuthCookie(res);
  res.json({ ok: true });
});

/** POST /api/auth/change-password — { currentPassword, newPassword } */
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const current = String(req.body?.currentPassword ?? req.body?.current_password ?? '');
    const nextPassword = String(req.body?.newPassword ?? req.body?.new_password ?? '');

    if (nextPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!verifyPassword(current, user.password_hash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(nextPassword), user.id);
    audit(user.id, 'PASSWORD_CHANGED', 'user', user.id, null);
    res.json({ ok: true, message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
