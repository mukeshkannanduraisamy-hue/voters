import express from 'express';
import { db, uuid } from '../lib/db.js';
import {
  authenticate, requireRole, hashPassword, audit, ROLES, ROLE_LABELS, ROLE_LABELS_TA, ONLINE_WINDOW_MS,
} from '../lib/auth.js';
import { assignableParts, scopeContains, scopeDetail, visibleUserIds } from '../lib/scope.js';
import { invalidateDashboardCache } from './dashboard.js';

const router = express.Router();
router.use(authenticate);

const MOBILE_RE = /^[6-9]\d{9}$/;

function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  const s = String(lastSeenAt);
  const iso = s.includes('Z') || s.includes('+') ? s : s.replace(' ', 'T') + 'Z';
  return Math.abs(Date.now() - new Date(iso).getTime()) < ONLINE_WINDOW_MS;
}

async function shapeUser(row) {
  const jurisdictions = await scopeDetail(row.id);
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
    lastSeenAt: row.last_seen_at ?? null,
    isOnline: isOnline(row.last_seen_at),
    createdByName: row.created_by_name ?? null,
    surveysDone: Number(row.surveys_done || 0),
    isGlobal: row.role === ROLES.A1,
    boothCount: jurisdictions.length,
    partNos: jurisdictions.map((j) => j.part_no),
    votersInScope: jurisdictions.reduce((a, j) => a + Number(j.voter_count || 0), 0),
    localBodySummary: localBodies.slice(0, 3),
    localBodyOverflow: Math.max(0, localBodies.length - 3),
    jurisdictions,
  };
}

/** GET /api/users/list — paged, searchable, scope-filtered */
router.get('/list', requireRole(ROLES.A1, ROLES.A2), async (req, res, next) => {
  try {
    const q = String(req.query.q ?? req.query.search ?? '').trim();
    const role = String(req.query.role ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));

    const where = [];
    const params = [];

    const visible = await visibleUserIds(req.user);
    if (visible !== null) {
      if (visible.length === 0) return res.json({ rows: [], total: 0, page, limit, pages: 1 });
      where.push(`u.id IN (${visible.map(() => '?').join(',')})`);
      params.push(...visible);
    } else {
      where.push("u.role <> 'A1_SUPER_ADMIN'"); // A1 manages supervisors and field agents
    }

    if (q) {
      where.push('(u.mobile_number LIKE ? OR u.epic_id LIKE ? OR u.full_name LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (role && Object.values(ROLES).includes(role)) { where.push('u.role = ?'); params.push(role); }
    if (status === 'active') where.push('u.is_active = 1');
    if (status === 'disabled') where.push('u.is_active = 0');

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRow = await db.prepare(`SELECT COUNT(*) c FROM users u ${whereSql}`).get(...params);
    const total = totalRow?.c ?? 0;

    const rows = await db
      .prepare(
        `SELECT u.id, u.mobile_number, u.role, u.epic_id, u.full_name, u.is_active,
                u.created_at, u.last_login_at, u.last_seen_at,
                creator.full_name AS created_by_name,
                (SELECT COUNT(*) FROM voter_surveys s WHERE s.surveyed_by = u.id) AS surveys_done
           FROM users u
           LEFT JOIN users creator ON creator.id = u.created_by
           ${whereSql}
           ORDER BY u.role, u.created_at DESC
           LIMIT ? OFFSET ?`
      )
      .all(...params, limit, (page - 1) * limit);

    const shapedRows = await Promise.all(rows.map(shapeUser));
    res.json({ rows: shapedRows, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/users/jurisdictions — booths the caller may assign, grouped by local body */
router.get('/jurisdictions', requireRole(ROLES.A1, ROLES.A2), async (req, res, next) => {
  try {
    const data = await assignableParts(req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/** GET /api/users/:id */
router.get('/:id', requireRole(ROLES.A1, ROLES.A2), async (req, res, next) => {
  try {
    const visible = await visibleUserIds(req.user);
    if (visible !== null && !visible.includes(req.params.id)) {
      return res.status(403).json({ error: 'This user is outside your jurisdiction' });
    }
    const row = await db
      .prepare(
        `SELECT u.id, u.mobile_number, u.role, u.epic_id, u.full_name, u.is_active,
                u.created_at, u.last_login_at, u.last_seen_at, creator.full_name AS created_by_name,
                (SELECT COUNT(*) FROM voter_surveys s WHERE s.surveyed_by = u.id) AS surveys_done
           FROM users u LEFT JOIN users creator ON creator.id = u.created_by
          WHERE u.id = ?`
      )
      .get(req.params.id);
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json(await shapeUser(row));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/users/create — register an A2 or A3.
 */
router.post('/create', requireRole(ROLES.A1, ROLES.A2), async (req, res, next) => {
  try {
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

    const knownRows = await db
      .prepare(`SELECT part_no FROM polling_parts WHERE part_no IN (${partNos.map(() => '?').join(',')})`)
      .all(...partNos);
    const known = knownRows.map((r) => r.part_no);
    if (known.length !== partNos.length) {
      return res.status(400).json({ error: 'One or more selected booths no longer exist', fields: { partNos: 'Invalid selection' } });
    }
    const hasScope = await scopeContains(req.user, partNos);
    if (!hasScope) {
      return res.status(403).json({
        error: 'You can only assign booths inside your own jurisdiction',
        fields: { partNos: 'Outside your jurisdiction' },
      });
    }

    const existingUser = await db.prepare('SELECT 1 FROM users WHERE mobile_number = ?').get(mobile);
    if (existingUser) {
      return res.status(409).json({ error: 'This mobile number is already registered', fields: { mobileNumber: 'Already registered' } });
    }

    let voterName = null;
    if (epic) {
      const voter = await db.prepare('SELECT epic_id, name_ta, is_deleted FROM voters_master WHERE UPPER(epic_id) = ?').get(epic);
      if (!voter) return res.status(422).json({ error: 'EPIC ID not found in the electoral roll', fields: { epicId: 'Not found' } });
      if (voter.is_deleted) return res.status(422).json({ error: 'This EPIC ID is marked deleted in the roll', fields: { epicId: 'Marked deleted' } });
      const epicUser = await db.prepare('SELECT 1 FROM users WHERE UPPER(epic_id) = ?').get(epic);
      if (epicUser) {
        return res.status(409).json({ error: 'This EPIC ID is already linked to another account', fields: { epicId: 'Already linked' } });
      }
      voterName = voter.name_ta;
    }

    const id = uuid();
    await db.prepare(
      `INSERT INTO users (id, mobile_number, password_hash, role, epic_id, full_name, is_active, created_by)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(id, mobile, hashPassword(password), role, epic, fullName ?? voterName, isActive, req.user.id);

    const ins = db.prepare('INSERT INTO user_jurisdictions (user_id, part_no) VALUES (?,?) ON CONFLICT DO NOTHING');
    for (const p of partNos) {
      await ins.run(id, p);
    }

    invalidateDashboardCache();
    audit(req.user.id, 'USER_CREATED', 'user', id, `${role} ${mobile} with ${partNos.length} booths`);
    const createdUser = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.status(201).json(await shapeUser(createdUser));
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/users/:id — profile, status, password reset and booth reassignment */
router.patch('/:id', requireRole(ROLES.A1, ROLES.A2), async (req, res, next) => {
  try {
    const target = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Use your profile page to change your own account' });
    if (target.role === ROLES.A1) return res.status(403).json({ error: 'A Super Admin account cannot be modified here' });

    const visible = await visibleUserIds(req.user);
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
      if (!MOBILE_RE.test(mobile)) {
        fields.mobileNumber = 'Enter a valid 10-digit mobile number starting 6-9';
      } else {
        const clash = await db.prepare('SELECT 1 FROM users WHERE mobile_number = ? AND id <> ?').get(mobile, target.id);
        if (clash) fields.mobileNumber = 'Already registered to another account';
        else { sets.push('mobile_number = ?'); params.push(mobile); }
      }
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
        const voter = await db.prepare('SELECT 1 FROM voters_master WHERE UPPER(epic_id) = ? AND is_deleted = 0').get(epic);
        if (!voter) fields.epicId = 'Not found in the electoral roll';
        else {
          const clash = await db.prepare('SELECT 1 FROM users WHERE UPPER(epic_id) = ? AND id <> ?').get(epic, target.id);
          if (clash) fields.epicId = 'Already linked to another account';
          else { sets.push('epic_id = ?'); params.push(epic); }
        }
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
      else {
        const hasScope = await scopeContains(req.user, partNos);
        if (!hasScope) fields.partNos = 'Outside your jurisdiction';
      }
    }

    if (Object.keys(fields).length) return res.status(400).json({ error: 'Please correct the highlighted fields', fields });
    if (!sets.length && partNos === null) return res.status(400).json({ error: 'Nothing to update' });

    if (sets.length) await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params, target.id);
    if (partNos) {
      await db.prepare('DELETE FROM user_jurisdictions WHERE user_id = ?').run(target.id);
      const ins = db.prepare('INSERT INTO user_jurisdictions (user_id, part_no) VALUES (?,?) ON CONFLICT DO NOTHING');
      for (const p of partNos) {
        await ins.run(target.id, p);
      }
    }

    invalidateDashboardCache();
    audit(req.user.id, 'USER_UPDATED', 'user', target.id, Object.keys(b).join(','));
    const freshTarget = await db.prepare('SELECT * FROM users WHERE id = ?').get(target.id);
    res.json(await shapeUser(freshTarget));
  } catch (err) {
    next(err);
  }
});

/** POST /api/users/:id/toggle — enable / disable in one click */
router.post('/:id/toggle', requireRole(ROLES.A1, ROLES.A2), async (req, res, next) => {
  try {
    const target = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === ROLES.A1) return res.status(403).json({ error: 'A Super Admin account cannot be disabled here' });
    const visible = await visibleUserIds(req.user);
    if (visible !== null && !visible.includes(target.id)) {
      return res.status(403).json({ error: 'This user is outside your jurisdiction' });
    }
    const nextState = target.is_active ? 0 : 1;
    await db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(nextState, target.id);
    audit(req.user.id, nextState ? 'USER_ENABLED' : 'USER_DISABLED', 'user', target.id, null);
    res.json({ ok: true, isActive: !!nextState });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/users/:id — A1 only; surveys are kept and un-attributed */
router.delete('/:id', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const target = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === ROLES.A1) return res.status(403).json({ error: 'A Super Admin account cannot be deleted' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });

    await db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
    invalidateDashboardCache();
    audit(req.user.id, 'USER_DELETED', 'user', target.id, `${target.role} ${target.mobile_number}`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
