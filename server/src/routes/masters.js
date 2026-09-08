import express from 'express';
import { db } from '../lib/db.js';
import { authenticate, requireRole, audit, ROLES } from '../lib/auth.js';
import { invalidateDashboardCache } from './dashboard.js';

const router = express.Router();
router.use(authenticate);

const CASTE_CATEGORIES = ['OC', 'BC', 'BCM', 'MBC', 'SC', 'ST', 'OTHER'];

const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/;
const MAX_IMG_BYTES = 2 * 1024 * 1024; // 2 MB

function validateSymbol(value) {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  const s = String(value).trim();
  if (!DATA_URL_RE.test(s)) {
    return { ok: false, error: 'Party picture must be an uploaded image (PNG, JPG, SVG or WebP)' };
  }
  const b64 = s.slice(s.indexOf(',') + 1);
  if (Math.floor((b64.length * 3) / 4) > MAX_IMG_BYTES) {
    return { ok: false, error: 'Party picture must be 2MB or smaller' };
  }
  return { ok: true, value: s };
}

/* ============================== dropdowns ================================ */
router.get('/dropdowns', async (req, res, next) => {
  try {
    const castes = await db
      .prepare('SELECT id, name, name_ta, category FROM caste_master WHERE is_active = 1 ORDER BY category, name')
      .all();
    const jobs = await db
      .prepare('SELECT id, category, category_ta, name, name_ta FROM job_master WHERE is_active = 1 ORDER BY category, name')
      .all();
    const parties = await db
      .prepare('SELECT id, name, name_ta, party_code, color_code, symbol_img FROM party_master WHERE is_active = 1 ORDER BY id')
      .all();
    const educationLevels = await db
      .prepare('SELECT id, name, name_ta FROM education_master WHERE is_active = 1 ORDER BY id')
      .all();

    const sectors = [];
    const byCategory = new Map();
    for (const j of jobs) {
      if (!byCategory.has(j.category)) {
        const entry = { category: j.category, category_ta: j.category_ta, jobs: [] };
        byCategory.set(j.category, entry);
        sectors.push(entry);
      }
      byCategory.get(j.category).jobs.push({ id: j.id, name: j.name, name_ta: j.name_ta });
    }

    res.json({ castes, jobs, sectors, parties, educationLevels });
  } catch (err) {
    next(err);
  }
});

/* ============================ caste master =============================== */
router.get('/caste', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const where = q ? 'WHERE (name LIKE ? OR name_ta LIKE ?)' : '';
    const params = q ? [`%${q}%`, `%${q}%`] : [];
    const rows = await db
      .prepare(
        `SELECT c.id, c.name, c.name_ta, c.category, c.is_active, c.created_at,
                (SELECT COUNT(*) FROM voter_surveys s WHERE s.caste_id = c.id) AS usage_count
           FROM caste_master c ${where}
          ORDER BY c.is_active DESC, c.category, c.name`
      )
      .all(...params);
    res.json(rows.map((r) => ({ ...r, is_active: !!r.is_active })));
  } catch (err) {
    next(err);
  }
});

router.post('/caste', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    const nameTa = String(req.body?.name_ta ?? '').trim() || null;
    const category = String(req.body?.category ?? 'BC').trim().toUpperCase();
    const isActive = req.body?.is_active === false ? 0 : 1;

    if (name.length < 2) return res.status(400).json({ error: 'Caste name must be at least 2 characters', fields: { name: 'Too short' } });
    if (!CASTE_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Category must be one of ${CASTE_CATEGORIES.join(', ')}`, fields: { category: 'Invalid' } });
    }
    const existing = await db.prepare('SELECT 1 FROM caste_master WHERE name = ? COLLATE NOCASE').get(name);
    if (existing) {
      return res.status(409).json({ error: `"${name}" already exists`, fields: { name: 'Already exists' } });
    }

    const info = await db.prepare('INSERT INTO caste_master (name, name_ta, category, is_active) VALUES (?,?,?,?)')
      .run(name, nameTa, category, isActive);
    audit(req.user.id, 'MASTER_CREATED', 'caste_master', info.lastInsertRowid, name);
    res.status(201).json({ id: Number(info.lastInsertRowid), name, name_ta: nameTa, category, is_active: !!isActive, usage_count: 0 });
  } catch (err) {
    next(err);
  }
});

router.patch('/caste/:id', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existingEntry = await db.prepare('SELECT 1 FROM caste_master WHERE id = ?').get(id);
    if (!existingEntry) {
      return res.status(404).json({ error: 'Caste entry not found' });
    }
    const sets = [], params = [];

    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (name.length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters', fields: { name: 'Too short' } });
      const clash = await db.prepare('SELECT 1 FROM caste_master WHERE name = ? COLLATE NOCASE AND id <> ?').get(name, id);
      if (clash) {
        return res.status(409).json({ error: `"${name}" already exists`, fields: { name: 'Already exists' } });
      }
      sets.push('name = ?'); params.push(name);
    }
    if (req.body?.name_ta !== undefined) { sets.push('name_ta = ?'); params.push(String(req.body.name_ta).trim() || null); }
    if (req.body?.category !== undefined) {
      const category = String(req.body.category).trim().toUpperCase();
      if (!CASTE_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid reservation category', fields: { category: 'Invalid' } });
      sets.push('category = ?'); params.push(category);
    }
    if (req.body?.is_active !== undefined) { sets.push('is_active = ?'); params.push(req.body.is_active ? 1 : 0); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    await db.prepare(`UPDATE caste_master SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    audit(req.user.id, 'MASTER_UPDATED', 'caste_master', id, JSON.stringify(Object.keys(req.body)));
    const row = await db.prepare('SELECT id, name, name_ta, category, is_active FROM caste_master WHERE id = ?').get(id);
    res.json({ ...row, is_active: !!row.is_active });
  } catch (err) {
    next(err);
  }
});

/* =========================== education master ============================= */
router.get('/education', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const where = q ? 'WHERE (name LIKE ? OR name_ta LIKE ?)' : '';
    const params = q ? [`%${q}%`, `%${q}%`] : [];
    const rows = await db
      .prepare(
        `SELECT e.id, e.name, e.name_ta, e.is_active, e.created_at,
                (SELECT COUNT(*) FROM voter_surveys s WHERE s.education_id = e.id) AS usage_count
           FROM education_master e ${where}
          ORDER BY e.is_active DESC, e.id`
      )
      .all(...params);
    res.json(rows.map((r) => ({ ...r, is_active: !!r.is_active })));
  } catch (err) {
    next(err);
  }
});

router.post('/education', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    const nameTa = String(req.body?.name_ta ?? '').trim() || null;
    const isActive = req.body?.is_active === false ? 0 : 1;

    if (name.length < 2) return res.status(400).json({ error: 'Education level name must be at least 2 characters', fields: { name: 'Too short' } });
    const existing = await db.prepare('SELECT 1 FROM education_master WHERE name = ? COLLATE NOCASE').get(name);
    if (existing) {
      return res.status(409).json({ error: `"${name}" already exists`, fields: { name: 'Already exists' } });
    }

    const info = await db.prepare('INSERT INTO education_master (name, name_ta, is_active) VALUES (?,?,?)').run(name, nameTa, isActive);
    audit(req.user.id, 'MASTER_CREATED', 'education_master', info.lastInsertRowid, name);
    res.status(201).json({ id: Number(info.lastInsertRowid), name, name_ta: nameTa, is_active: !!isActive, usage_count: 0 });
  } catch (err) {
    next(err);
  }
});

router.patch('/education/:id', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existingEntry = await db.prepare('SELECT 1 FROM education_master WHERE id = ?').get(id);
    if (!existingEntry) {
      return res.status(404).json({ error: 'Education entry not found' });
    }
    const sets = [], params = [];

    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (name.length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters', fields: { name: 'Too short' } });
      const clash = await db.prepare('SELECT 1 FROM education_master WHERE name = ? COLLATE NOCASE AND id <> ?').get(name, id);
      if (clash) {
        return res.status(409).json({ error: `"${name}" already exists`, fields: { name: 'Already exists' } });
      }
      sets.push('name = ?'); params.push(name);
    }
    if (req.body?.name_ta !== undefined) { sets.push('name_ta = ?'); params.push(String(req.body.name_ta).trim() || null); }
    if (req.body?.is_active !== undefined) { sets.push('is_active = ?'); params.push(req.body.is_active ? 1 : 0); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    await db.prepare(`UPDATE education_master SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    audit(req.user.id, 'MASTER_UPDATED', 'education_master', id, JSON.stringify(Object.keys(req.body)));
    const row = await db.prepare('SELECT id, name, name_ta, is_active FROM education_master WHERE id = ?').get(id);
    res.json({ ...row, is_active: !!row.is_active });
  } catch (err) {
    next(err);
  }
});

/* ============================= job master ================================ */
router.get('/job', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const where = q ? 'WHERE (j.name LIKE ? OR j.name_ta LIKE ? OR j.category LIKE ?)' : '';
    const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];

    const rows = (await db
      .prepare(
        `SELECT j.id, j.category, j.category_ta, j.name, j.name_ta, j.is_active, j.created_at,
                (SELECT COUNT(*) FROM voter_surveys s WHERE s.job_id = j.id) AS usage_count
           FROM job_master j ${where}
          ORDER BY j.category, j.is_active DESC, j.name`
      )
      .all(...params))
      .map((r) => ({ ...r, is_active: !!r.is_active }));

    if (req.query.grouped === '1') {
      const sectors = [];
      const map = new Map();
      for (const r of rows) {
        if (!map.has(r.category)) {
          const s = { category: r.category, category_ta: r.category_ta, jobs: [] };
          map.set(r.category, s);
          sectors.push(s);
        }
        map.get(r.category).jobs.push(r);
      }
      return res.json({ sectors, total: rows.length });
    }
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/job/sectors', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const sectors = await db.prepare(
      `SELECT category, category_ta, COUNT(*) AS job_count
         FROM job_master GROUP BY category ORDER BY category`
    ).all();
    res.json(sectors);
  } catch (err) {
    next(err);
  }
});

router.post('/job', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const category = String(req.body?.category ?? '').trim();
    const categoryTa = String(req.body?.category_ta ?? '').trim() || null;
    const name = String(req.body?.name ?? '').trim();
    const nameTa = String(req.body?.name_ta ?? '').trim() || null;
    const isActive = req.body?.is_active === false ? 0 : 1;

    const fields = {};
    if (category.length < 2) fields.category = 'Choose or enter a sector';
    if (name.length < 2) fields.name = 'Sub-job name must be at least 2 characters';
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Please correct the highlighted fields', fields });

    const existing = await db.prepare('SELECT 1 FROM job_master WHERE category = ? AND name = ? COLLATE NOCASE').get(category, name);
    if (existing) {
      return res.status(409).json({ error: `"${name}" already exists in ${category}`, fields: { name: 'Already exists in this sector' } });
    }

    const info = await db.prepare('INSERT INTO job_master (category, category_ta, name, name_ta, is_active) VALUES (?,?,?,?,?)')
      .run(category, categoryTa, name, nameTa, isActive);
    audit(req.user.id, 'MASTER_CREATED', 'job_master', info.lastInsertRowid, `${category} > ${name}`);
    res.status(201).json({ id: Number(info.lastInsertRowid), category, category_ta: categoryTa, name, name_ta: nameTa, is_active: !!isActive, usage_count: 0 });
  } catch (err) {
    next(err);
  }
});

router.patch('/job/:id', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.prepare('SELECT * FROM job_master WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Job entry not found' });

    const sets = [], params = [];
    const nextCategory = req.body?.category !== undefined ? String(req.body.category).trim() : existing.category;
    const nextName = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;

    if (req.body?.category !== undefined || req.body?.name !== undefined) {
      if (nextName.length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters', fields: { name: 'Too short' } });
      if (nextCategory.length < 2) return res.status(400).json({ error: 'Sector must be at least 2 characters', fields: { category: 'Too short' } });
      const clash = await db.prepare('SELECT 1 FROM job_master WHERE category = ? AND name = ? COLLATE NOCASE AND id <> ?')
        .get(nextCategory, nextName, id);
      if (clash) return res.status(409).json({ error: `"${nextName}" already exists in ${nextCategory}`, fields: { name: 'Already exists in this sector' } });
      sets.push('category = ?', 'name = ?');
      params.push(nextCategory, nextName);
    }
    if (req.body?.category_ta !== undefined) { sets.push('category_ta = ?'); params.push(String(req.body.category_ta).trim() || null); }
    if (req.body?.name_ta !== undefined) { sets.push('name_ta = ?'); params.push(String(req.body.name_ta).trim() || null); }
    if (req.body?.is_active !== undefined) { sets.push('is_active = ?'); params.push(req.body.is_active ? 1 : 0); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    await db.prepare(`UPDATE job_master SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    audit(req.user.id, 'MASTER_UPDATED', 'job_master', id, `${nextCategory} > ${nextName}`);
    const row = await db.prepare('SELECT id, category, category_ta, name, name_ta, is_active FROM job_master WHERE id = ?').get(id);
    res.json({ ...row, is_active: !!row.is_active });
  } catch (err) {
    next(err);
  }
});

/* ============================ party master =============================== */
router.get('/party', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const where = q ? 'WHERE (p.name LIKE ? OR p.name_ta LIKE ? OR p.party_code LIKE ?)' : '';
    const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
    const rows = await db
      .prepare(
        `SELECT p.id, p.name, p.name_ta, p.party_code, p.color_code, p.symbol_img, p.is_active, p.created_at,
                (SELECT COUNT(*) FROM voter_surveys s WHERE s.party_id = p.id) AS usage_count
           FROM party_master p ${where}
          ORDER BY p.is_active DESC, p.id`
      )
      .all(...params);
    res.json(rows.map((r) => ({ ...r, is_active: !!r.is_active })));
  } catch (err) {
    next(err);
  }
});

router.post('/party', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    const nameTa = String(req.body?.name_ta ?? '').trim() || null;
    const code = String(req.body?.party_code ?? '').trim().toUpperCase();
    const color = String(req.body?.color_code ?? '#64748b').trim();
    const isActive = req.body?.is_active === false ? 0 : 1;

    const fields = {};
    if (name.length < 2) fields.name = 'Party name must be at least 2 characters';
    if (code.length < 2) fields.party_code = 'Party code must be at least 2 characters';
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) fields.color_code = 'Pick a colour';

    const symbol = validateSymbol(req.body?.symbol_img);
    if (!symbol.ok) fields.symbol_img = symbol.error;
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Please correct the highlighted fields', fields });

    if (await db.prepare('SELECT 1 FROM party_master WHERE name = ? COLLATE NOCASE').get(name)) {
      return res.status(409).json({ error: `"${name}" already exists`, fields: { name: 'Already exists' } });
    }
    if (await db.prepare('SELECT 1 FROM party_master WHERE party_code = ? COLLATE NOCASE').get(code)) {
      return res.status(409).json({ error: `Code "${code}" already exists`, fields: { party_code: 'Already exists' } });
    }

    const info = await db
      .prepare('INSERT INTO party_master (name, name_ta, party_code, color_code, symbol_img, is_active) VALUES (?,?,?,?,?,?)')
      .run(name, nameTa, code, color, symbol.value, isActive);
    audit(req.user.id, 'MASTER_CREATED', 'party_master', info.lastInsertRowid, `${code} ${name}`);
    res.status(201).json({
      id: Number(info.lastInsertRowid), name, name_ta: nameTa, party_code: code,
      color_code: color, symbol_img: symbol.value, is_active: !!isActive, usage_count: 0,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/party/:id', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!await db.prepare('SELECT 1 FROM party_master WHERE id = ?').get(id)) {
      return res.status(404).json({ error: 'Party entry not found' });
    }
    const sets = [], params = [];

    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (name.length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters', fields: { name: 'Too short' } });
      if (await db.prepare('SELECT 1 FROM party_master WHERE name = ? COLLATE NOCASE AND id <> ?').get(name, id)) {
        return res.status(409).json({ error: `"${name}" already exists`, fields: { name: 'Already exists' } });
      }
      sets.push('name = ?'); params.push(name);
    }
    if (req.body?.party_code !== undefined) {
      const code = String(req.body.party_code).trim().toUpperCase();
      if (code.length < 2) return res.status(400).json({ error: 'Code must be at least 2 characters', fields: { party_code: 'Too short' } });
      if (await db.prepare('SELECT 1 FROM party_master WHERE party_code = ? COLLATE NOCASE AND id <> ?').get(code, id)) {
        return res.status(409).json({ error: `Code "${code}" already exists`, fields: { party_code: 'Already exists' } });
      }
      sets.push('party_code = ?'); params.push(code);
    }
    if (req.body?.name_ta !== undefined) { sets.push('name_ta = ?'); params.push(String(req.body.name_ta).trim() || null); }
    if (req.body?.color_code !== undefined) {
      const color = String(req.body.color_code).trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: 'Pick a valid colour', fields: { color_code: 'Invalid' } });
      sets.push('color_code = ?'); params.push(color);
    }
    if (req.body?.symbol_img !== undefined) {
      const symbol = validateSymbol(req.body.symbol_img);
      if (!symbol.ok) return res.status(400).json({ error: symbol.error, fields: { symbol_img: symbol.error } });
      sets.push('symbol_img = ?'); params.push(symbol.value);
    }
    if (req.body?.is_active !== undefined) { sets.push('is_active = ?'); params.push(req.body.is_active ? 1 : 0); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    await db.prepare(`UPDATE party_master SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    audit(req.user.id, 'MASTER_UPDATED', 'party_master', id, JSON.stringify(Object.keys(req.body)));
    const row = await db.prepare('SELECT id, name, name_ta, party_code, color_code, symbol_img, is_active FROM party_master WHERE id = ?').get(id);
    res.json({ ...row, is_active: !!row.is_active });
  } catch (err) {
    next(err);
  }
});

/* =========================== local body master ============================ */
function duplicateKey(name) {
  return name.replace(/[ா-்ௗ\s]/g, '');
}

router.get('/local-bodies', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const parts = await db
      .prepare(
        `SELECT pp.local_body_name_ta AS name, pp.local_body_type AS type, pp.part_no,
                (SELECT COUNT(*) FROM voters_master v WHERE v.part_no = pp.part_no AND v.is_deleted = 0) AS voters
           FROM polling_parts pp`
      )
      .all();

    const byName = new Map();
    for (const p of parts) {
      if (!byName.has(p.name)) byName.set(p.name, { name: p.name, types: new Set(), part_count: 0, voter_count: 0, part_nos: [] });
      const g = byName.get(p.name);
      g.types.add(p.type);
      g.part_count += 1;
      g.voter_count += Number(p.voters || 0);
      g.part_nos.push(p.part_no);
    }

    const rows = [...byName.values()]
      .map((g) => ({
        name: g.name,
        type: g.types.size === 1 ? [...g.types][0] : 'MIXED',
        part_count: g.part_count,
        voter_count: g.voter_count,
        part_nos: g.part_nos.sort((a, b) => a - b),
      }))
      .sort((a, b) => b.voter_count - a.voter_count);

    const clusters = new Map();
    for (const r of rows) {
      const key = duplicateKey(r.name);
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key).push(r);
    }
    const suggestions = [...clusters.values()]
      .filter((c) => c.length > 1)
      .map((candidates) => ({
        candidates: candidates.sort((a, b) => b.voter_count - a.voter_count),
        recommended: candidates.reduce((a, b) => (b.voter_count > a.voter_count ? b : a)).name,
      }));

    res.json({ rows, suggestions, total: rows.length });
  } catch (err) {
    next(err);
  }
});

router.post('/local-bodies/merge', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const from = String(req.body?.from ?? '').trim();
    const into = String(req.body?.into ?? '').trim();
    const type = String(req.body?.type ?? '').trim().toUpperCase();

    if (!from || !into) return res.status(400).json({ error: 'Both the source and target names are required' });
    if (from === into) return res.status(400).json({ error: 'Choose a different name to merge or rename into' });

    const affectedRow = await db.prepare('SELECT COUNT(*) c FROM polling_parts WHERE local_body_name_ta = ?').get(from);
    const affected = affectedRow?.c ?? 0;
    if (!affected) return res.status(404).json({ error: `No booths are currently named "${from}"` });

    const validType = ['TOWN_PANCHAYAT', 'VILLAGE_PANCHAYAT'].includes(type) ? type : null;
    if (validType) {
      await db.prepare('UPDATE polling_parts SET local_body_name_ta = ?, local_body_type = ? WHERE local_body_name_ta = ?')
        .run(into, validType, from);
    } else {
      await db.prepare('UPDATE polling_parts SET local_body_name_ta = ? WHERE local_body_name_ta = ?').run(into, from);
    }

    invalidateDashboardCache();
    audit(req.user.id, 'LOCAL_BODY_MERGED', 'polling_parts', null, `${from} -> ${into} (${affected} booths)`);
    res.json({ ok: true, boothsMoved: affected, into });
  } catch (err) {
    next(err);
  }
});

/* ============================ shared delete ============================== */
const DELETABLE = {
  caste: { table: 'caste_master', usage: 'caste_id', label: 'Caste' },
  job: { table: 'job_master', usage: 'job_id', label: 'Job' },
  party: { table: 'party_master', usage: 'party_id', label: 'Party' },
  education: { table: 'education_master', usage: 'education_id', label: 'Education' },
};

router.delete('/:type/:id', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const def = DELETABLE[String(req.params.type).toLowerCase()];
    if (!def) return res.status(404).json({ error: 'Unknown master type. Use caste, job, party or education.' });
    const id = Number(req.params.id);

    const usedRow = await db.prepare(`SELECT COUNT(*) c FROM voter_surveys WHERE ${def.usage} = ?`).get(id);
    const used = usedRow?.c ?? 0;
    if (used > 0) {
      return res.status(409).json({
        error: `In use by ${used.toLocaleString()} survey record(s). Disable it instead of deleting.`,
        usage_count: used,
      });
    }
    const info = await db.prepare(`DELETE FROM ${def.table} WHERE id = ?`).run(id);
    if (!info.changes) return res.status(404).json({ error: `${def.label} entry not found` });
    audit(req.user.id, 'MASTER_DELETED', def.table, id, null);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
