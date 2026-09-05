import express from 'express';
import { db, uuid } from '../lib/db.js';
import {
  authenticate, requireRole, hashPassword, audit, ROLES, ROLE_LABELS, ROLE_LABELS_TA,
} from '../lib/auth.js';
import { assignableParts, scopeContains, scopeDetail, visibleUserIds } from '../lib/scope.js';
import { invalidateDashboardCache } from './dashboard.js';

const router = express.Router();
router.use(authenticate);

const MOBILE_RE = /^[6-9]\d{9}$/;

function shapeUser(row) {
  const jurisdictions = scopeDetail(row.id);
  const localBodies = [...new Set(jurisdictions.map((j) => j.local_body_name_ta))];
  return {
    id: row.id,
    mobileNumber: row.mobile_number,
    role: row.role,
    roleLabel: ROLE_LABELS[row.role],
    roleLabelTa: ROLE_LABELS_TA[row.role],
    epicId: row.epic_id,
    fullName: row.full_name,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    createdByName: row.created_by_name ?? null,
    surveysDone: row.surveys_done ?? 0,
    isGlobal: row.role === ROLES.A1,
    boothCount: jurisdictions.length,
    partNos: jurisdictions.map((j) => j.part_no),
    votersInScope: jurisdictions.reduce((a, j) => a + j.voter_count, 0),
    localBodySummary: localBodies.slice(0, 3),
    localBodyOverflow: Math.max(0, localBodies.length - 3),
    jurisdictions,
  };
}

/** GET /api/users/list — paged, searchable, scope-filtered */
router.get('/list', requireRole(ROLES.A1, ROLES.A2), (req, res) => {
  const q = String(req.query.q ?? req.query.search ?? '').trim();
  const role = String(req.query.role ?? '').trim();
  const status = String(req.query.status ?? '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));

  const where = [];
  const params = [];

  const visible = visibleUserIds(req.user);
  if (visible !== null) {
    if (visible.length === 0) return res.json({ rows: [], total: 0, page, limit, pages: 1 });
    where.push(`u.id IN (${visible.map(() => '?').join(',')})`);
    params.push(...visible);
  } else {
    where.push('u.id <> ?'); // A1 does not list itself among managed users
    params.push(req.user.id);
  }

  if (q) {
    where.push('(u.mobile_number LIKE ? OR u.epic_id LIKE ? OR u.full_name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (role && Object.values(ROLES).includes(role)) { where.push('u.role = ?'); params.push(role); }
  if (status === 'active') where.push('u.is_active = 1');
  if (status === 'disabled') where.push('u.is_active = 0');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM users u ${whereSql}`).get(...params).c;
  const rows = db
    .prepare(
      `SELECT u.id, u.mobile_number, u.role, u.epic_id, u.full_name, u.is_active,
              u.created_at, u.last_login_at,
              creator.full_name AS created_by_name,
              (SELECT COUNT(*) FROM voter_surveys s WHERE s.surveyed_by = u.id) AS surveys_done
         FROM users u
         LEFT JOIN users creator ON creator.id = u.created_by
         ${whereSql}
         ORDER BY u.role, u.created_at DESC
         LIMIT ? OFFSET ?`
    )
    .all(...params, limit, (page - 1) * limit);

  res.json({ rows: rows.map(shapeUser), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
});

/** GET /api/users/jurisdictions — booths the caller may assign, grouped by local body */
router.get('/jurisdictions', requireRole(ROLES.A1, ROLES.A2), (req, res) => {
  res.json(assignableParts(req.user));
});

/** GET /api/users/:id */
router.get('/:id', requireRole(ROLES.A1, ROLES.A2), (req, res) => {
  const visible = visibleUserIds(req.user);
  if (visible !== null && !visible.includes(req.params.id)) {
    return res.status(403).json({ error: 'This user is outside your jurisdiction' });
  }
  const row = db
    .prepare(
      `SELECT u.id, u.mobile_number, u.role, u.epic_id, u.full_name, u.is_active,
              u.created_at, u.last_login_at, creator.full_name AS created_by_name,
              (SELECT COUNT(*) FROM voter_surveys s WHERE s.surveyed_by = u.id) AS surveys_done
         FROM users u LEFT JOIN users creator ON creator.id = u.created_by
        WHERE u.id = ?`
    )
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json(shapeUser(row));
});

/**
 * POST /api/users/create — register an A2 or A3.
 * Body: { role, mobileNumber, password, epicId?, fullName?, isActive, partNos[] }
 */
router.post('/create', requireRole(ROLES.A1, ROLES.A2), (req, res) => {
  const b = req.body ?? {};
  const role = String(b.role ?? '').trim();
  const mobile = String(b.mobileNumber ?? b.mobile_number ?? '').trim();
  const password = String(b.password ?? '');
  const epic = String(b.epicId ?? b.epic_id ?? '').trim().toUpperCase() || null;
  const fullName = String(b.fullName ?? b.full_name ?? '').trim() || null;
  const isActive = b.isActive === false || b.is_active === false ? 0 : 1;
  const partNos = Array.isArray(b.partNos ?? b.part_nos)
    ? [...new Set((b.partNos ?? b.part_nos).map(Number).filter(Number.isInteger))]
    : [];

  const errors = {};
  if (![ROLES.A2, ROLES.A3].includes(role)) {
    errors.role = 'Choose Supervisor (A2) or Field Agent (A3)';
  } else if (req.user.role === ROLES.A2 && role !== ROLES.A3) {
    errors.role = 'A Supervisor can only register Field Agents (A3)';
  }
  if (!MOBILE_RE.test(mobile)) errors.mobileNumber = 'Enter a valid 10-digit mobile number starting 6-9';
  if (password.length < 6) errors.password = 'Password must be at least 6 characters';
  if (!partNos.length) errors.partNos = 'Assign at least one polling booth';
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Please correct the highlighted fields', fields: errors });
  }

  // Authorization is settled before any record lookup, so the endpoint's error
  // codes can never be used to probe for EPICs outside the caller's scope.
  const known = db
    .prepare(`SELECT part_no FROM polling_parts WHERE part_no IN (${partNos.map(() => '?').join(',')})`)
    .all(...partNos)
    .map((r) => r.part_no);
  if (known.length !== partNos.length) {
    return res.status(400).json({ error: 'One or more selected booths no longer exist', fields: { partNos: 'Invalid selection' } });
  }
  if (!scopeContains(req.user, partNos)) {
    return res.status(403).json({
      error: 'You can only assign booths inside your own jurisdiction',
      fields: { partNos: 'Outside your jurisdiction' },
    });
  }

  if (db.prepare('SELECT 1 FROM users WHERE mobile_number = ?').get(mobile)) {
    return res.status(409).json({ error: 'This mobile number is already registered', fields: { mobileNumber: 'Already registered' } });
  }

  let voterName = null;
  if (epic) {
    const voter = db.prepare('SELECT epic_id, name_ta, is_deleted FROM voters_master WHERE UPPER(epic_id) = ?').get(epic);
    if (!voter) return res.status(422).json({ error: 'EPIC ID not found in the electoral roll', fields: { epicId: 'Not found' } });
    if (voter.is_deleted) return res.status(422).json({ error: 'This EPIC ID is marked deleted in the roll', fields: { epicId: 'Marked deleted' } });
    if (db.prepare('SELECT 1 FROM users WHERE UPPER(epic_id) = ?').get(epic)) {
      return res.status(409).json({ error: 'This EPIC ID is already linked to another account', fields: { epicId: 'Already linked' } });
    }
    voterName = voter.name_ta;
  }

  const id = uuid();
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO users (id, mobile_number, password_hash, role, epic_id, full_name, is_active, created_by)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(id, mobile, hashPassword(password), role, epic, fullName ?? voterName, isActive, req.user.id);

    const ins = db.prepare('INSERT INTO user_jurisdictions (user_id, part_no) VALUES (?,?) ON CONFLICT DO NOTHING');
    for (const p of partNos) ins.run(id, p);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Could not create the account', detail: err.message });
  }

  invalidateDashboardCache();
  audit(req.user.id, 'USER_CREATED', 'user', id, `${role} ${mobile} with ${partNos.length} booths`);
  res.status(201).json(shapeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)));
});

/** PATCH /api/users/:id — profile, status, password reset and booth reassignment */
router.patch('/:id', requireRole(ROLES.A1, ROLES.A2), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Use your profile page to change your own account' });
  if (target.role === ROLES.A1) return res.status(403).json({ error: 'A Super Admin account cannot be modified here' });

  const visible = visibleUserIds(req.user);
  if (visible !== null && !visible.includes(target.id)) {
    return res.status(403).json({ error: 'This user is outside your jurisdiction' });
  }

  const b = req.body ?? {};
  const sets = [], params = [], fields = {};

  if (b.fullName !== undefined || b.full_name !== undefined) {
    sets.push('full_name = ?');
    params.push(String(b.fullName ?? b.full_name).trim() || null);
  }
  if (b.mobileNumber !== undefined || b.mobile_number !== undefined) {
    const mobile = String(b.mobileNumber ?? b.mobile_number).trim();
    if (!MOBILE_RE.test(mobile)) fields.mobileNumber = 'Enter a valid 10-digit mobile number starting 6-9';
    else if (db.prepare('SELECT 1 FROM users WHERE mobile_number = ? AND id <> ?').get(mobile, target.id)) {
      fields.mobileNumber = 'Already registered to another account';
    } else { sets.push('mobile_number = ?'); params.push(mobile); }
  }
  if (b.password) {
    if (String(b.password).length < 6) fields.password = 'Password must be at least 6 characters';
    else { sets.push('password_hash = ?'); params.push(hashPassword(String(b.password))); }
  }
  if (b.role !== undefined) {
    const role = String(b.role).trim();
    if (![ROLES.A2, ROLES.A3].includes(role)) fields.role = 'Choose Supervisor (A2) or Field Agent (A3)';
    else if (req.user.role === ROLES.A2 && role !== ROLES.A3) fields.role = 'A Supervisor can only manage Field Agents';
    else { sets.push('role = ?'); params.push(role); }
  }
  if (b.epicId !== undefined || b.epic_id !== undefined) {
    const epic = String(b.epicId ?? b.epic_id).trim().toUpperCase() || null;
    if (epic) {
      const voter = db.prepare('SELECT 1 FROM voters_master WHERE UPPER(epic_id) = ? AND is_deleted = 0').get(epic);
      if (!voter) fields.epicId = 'Not found in the electoral roll';
      else if (db.prepare('SELECT 1 FROM users WHERE UPPER(epic_id) = ? AND id <> ?').get(epic, target.id)) {
        fields.epicId = 'Already linked to another account';
      } else { sets.push('epic_id = ?'); params.push(epic); }
    } else { sets.push('epic_id = ?'); params.push(null); }
  }
  if (b.isActive !== undefined || b.is_active !== undefined) {
    sets.push('is_active = ?');
    params.push((b.isActive ?? b.is_active) ? 1 : 0);
  }

  let partNos = null;
  const rawParts = b.partNos ?? b.part_nos;
  if (Array.isArray(rawParts)) {
    partNos = [...new Set(rawParts.map(Number).filter(Number.isInteger))];
    if (!partNos.length) fields.partNos = 'Assign at least one polling booth';
    else if (!scopeContains(req.user, partNos)) fields.partNos = 'Outside your jurisdiction';
  }

  if (Object.keys(fields).length) return res.status(400).json({ error: 'Please correct the highlighted fields', fields });
  if (!sets.length && partNos === null) return res.status(400).json({ error: 'Nothing to update' });

  db.exec('BEGIN');
  try {
    if (sets.length) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params, target.id);
    if (partNos) {
      db.prepare('DELETE FROM user_jurisdictions WHERE user_id = ?').run(target.id);
      const ins = db.prepare('INSERT INTO user_jurisdictions (user_id, part_no) VALUES (?,?) ON CONFLICT DO NOTHING');
      for (const p of partNos) ins.run(target.id, p);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Could not update the account', detail: err.message });
  }

  invalidateDashboardCache();
  audit(req.user.id, 'USER_UPDATED', 'user', target.id, Object.keys(b).join(','));
  res.json(shapeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(target.id)));
});

/** POST /api/users/:id/toggle — enable / disable in one click */
router.post('/:id/toggle', requireRole(ROLES.A1, ROLES.A2), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === ROLES.A1) return res.status(403).json({ error: 'A Super Admin account cannot be disabled here' });
  const visible = visibleUserIds(req.user);
  if (visible !== null && !visible.includes(target.id)) {
    return res.status(403).json({ error: 'This user is outside your jurisdiction' });
  }
  const next = target.is_active ? 0 : 1;
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(next, target.id);
  audit(req.user.id, next ? 'USER_ENABLED' : 'USER_DISABLED', 'user', target.id, null);
  res.json({ ok: true, isActive: !!next });
});

/** DELETE /api/users/:id — A1 only; surveys are kept and un-attributed */
router.delete('/:id', requireRole(ROLES.A1), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === ROLES.A1) return res.status(403).json({ error: 'A Super Admin account cannot be deleted' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });

  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  invalidateDashboardCache();
  audit(req.user.id, 'USER_DELETED', 'user', target.id, `${target.role} ${target.mobile_number}`);
  res.json({ ok: true });
});

export default router;
