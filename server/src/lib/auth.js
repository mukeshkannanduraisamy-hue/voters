import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db } from './db.js';

export const JWT_SECRET = process.env.VMS_JWT_SECRET || 'vms-dev-secret-change-in-production';
export const JWT_TTL_SECONDS = Number(process.env.VMS_JWT_TTL_SECONDS) || 86400; // 24h
export const COOKIE_NAME = 'vms_token';

export const ROLES = {
  A1: 'A1_SUPER_ADMIN',
  A2: 'A2_SUPERVISOR',
  A3: 'A3_FIELD_AGENT',
};

export const ROLE_LABELS = {
  A1_SUPER_ADMIN: 'Super Admin',
  A2_SUPERVISOR: 'Zone Supervisor',
  A3_FIELD_AGENT: 'Field Agent',
};

export const ROLE_LABELS_TA = {
  A1_SUPER_ADMIN: 'முதன்மை நிர்வாகி',
  A2_SUPERVISOR: 'மண்டல மேற்பார்வையாளர்',
  A3_FIELD_AGENT: 'கள பணியாளர்',
};

/** Landing route per role — the server is the authority, the client mirrors it. */
export const HOME_FOR = {
  A1_SUPER_ADMIN: '/admin/dashboard',
  A2_SUPERVISOR: '/supervisor/dashboard',
  A3_FIELD_AGENT: '/survey/booth',
};

// ---------------------------------------------------------------- passwords
// scrypt keeps hashing dependency-free (no native module to compile).
export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, expected] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const derived = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  const a = Buffer.from(derived, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ------------------------------------------------------------------- tokens
export function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, mobileNumber: user.mobile_number },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: JWT_TTL_SECONDS }
  );
}

/** Sets the hardened session cookie. Secure is on only in production (HTTPS). */
export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: JWT_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/**
 * Reads the session from the cookie, falling back to a bearer header so the
 * API stays scriptable for tooling and tests.
 *
 * The user row is re-read on every request, so disabling an account or changing
 * its role takes effect immediately rather than at token expiry.
 */
export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = req.cookies?.[COOKIE_NAME]
    || (header.startsWith('Bearer ') ? header.slice(7) : null);

  if (!token) return res.status(401).json({ error: 'Authentication required' });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    clearAuthCookie(res);
    return res.status(401).json({
      error: expired ? 'Session expired, please sign in again' : 'Invalid session token',
    });
  }

  const user = db
    .prepare('SELECT id, mobile_number, role, epic_id, full_name, is_active FROM users WHERE id = ?')
    .get(payload.sub);

  if (!user) {
    clearAuthCookie(res);
    return res.status(401).json({ error: 'Account no longer exists' });
  }
  if (!user.is_active) {
    clearAuthCookie(res);
    return res.status(403).json({ error: 'This account has been disabled. Please contact the Super Admin.' });
  }

  req.user = user;
  touchLastSeen(user.id);
  next();
}

/** A user is considered "online" if seen within this window. Shared with routes that report it. */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Bumps `last_seen_at` for presence ("online now") indicators — but at most
 * once every 60s per user, in-process. `users` is a synced table, so touching
 * it on every single authenticated request would land one outbox event per
 * request; throttling caps it at ~1/user/minute regardless of traffic.
 */
const lastTouch = new Map(); // userId -> ms timestamp of the last DB write
const TOUCH_THROTTLE_MS = 60 * 1000;

function touchLastSeen(userId) {
  const now = Date.now();
  const last = lastTouch.get(userId) ?? 0;
  if (now - last < TOUCH_THROTTLE_MS) return;
  lastTouch.set(userId, now);
  try {
    db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(new Date(now).toISOString(), userId);
  } catch {
    /* presence tracking must never break a request */
  }
}

/** requireRole(ROLES.A1, ROLES.A2) */
export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Your role does not have access to this resource' });
    }
    next();
  };
}

export function audit(userId, action, entity, entityId, detail) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?)')
      .run(userId ?? null, action, entity ?? null, entityId != null ? String(entityId) : null, detail ?? null);
  } catch {
    /* auditing must never break the request */
  }
}
