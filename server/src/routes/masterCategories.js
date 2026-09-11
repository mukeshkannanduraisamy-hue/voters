import express from 'express';
import { db } from '../lib/db.js';
import { authenticate, requireRole, audit, ROLES } from '../lib/auth.js';
import { resolveMasterOptions } from '../lib/formSchema.js';

const router = express.Router();
router.use(authenticate);

const KEY_RE = /^[a-z][a-z0-9_]{1,63}$/;

/** The four built-in masters keep their own tables; they're listed read-only here. */
const SYSTEM_CATEGORIES = [
  { key: 'caste',      name: 'Caste / Community',  nameTa: 'சாதி / சமூகம்',   manageAt: '/admin/masters' },
  { key: 'job',        name: 'Occupation (sub-job)', nameTa: 'தொழில்',        manageAt: '/admin/masters' },
  { key: 'job_sector', name: 'Occupation sector',  nameTa: 'தொழில் துறை',     manageAt: '/admin/masters' },
  { key: 'party',      name: 'Political party',    nameTa: 'அரசியல் கட்சி',    manageAt: '/admin/masters' },
  { key: 'education',  name: 'Education level',    nameTa: 'கல்வித் தகுதி',    manageAt: '/admin/masters' },
];

const slugify = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);

/**
 * GET /api/master-categories — every bindable lookup source.
 * A2 may read (their dropdowns and filters depend on it); only A1 may write.
 */
router.get('/', async (req, res, next) => {
  try {
    const rows = await db.prepare(
      `SELECT c.id, c.cat_key, c.name, c.name_ta, c.description, c.is_active, c.created_at,
              (SELECT COUNT(*) FROM vms_master_items i WHERE i.category_id = c.id) AS item_count,
              (SELECT COUNT(*) FROM vms_master_items i WHERE i.category_id = c.id AND i.is_active = 1) AS active_count
         FROM vms_master_categories c
        ORDER BY c.name`
    ).all();

    res.json({
      system: SYSTEM_CATEGORIES,
      custom: rows.map((r) => ({
        id: r.id,
        key: r.cat_key,
        name: r.name,
        nameTa: r.name_ta,
        description: r.description,
        isActive: !!r.is_active,
        itemCount: Number(r.item_count || 0),
        activeCount: Number(r.active_count || 0),
        createdAt: r.created_at,
      })),
    });
  } catch (err) { next(err); }
});

/** GET /api/master-categories/:key/options — resolved options (any role). */
router.get('/:key/options', async (req, res, next) => {
  try {
    res.json(await resolveMasterOptions(String(req.params.key)));
  } catch (err) { next(err); }
});

/** POST /api/master-categories — create a brand new lookup list. */
router.post('/', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    if (name.length < 2) {
      return res.status(400).json({ error: 'Category name must be at least 2 characters', fields: { name: 'Too short' } });
    }
    let key = String(req.body?.key ?? '').trim().toLowerCase() || slugify(name);
    if (!KEY_RE.test(key)) key = `cat_${Date.now().toString(36)}`;

    const clash = await db.prepare('SELECT 1 FROM vms_master_categories WHERE cat_key = ?').get(key);
    if (clash || SYSTEM_CATEGORIES.some((c) => c.key === key)) {
      return res.status(409).json({ error: `The key "${key}" is already in use`, fields: { key: 'Already exists' } });
    }

    const info = await db.prepare(
      `INSERT INTO vms_master_categories (cat_key, name, name_ta, description, created_by)
       VALUES (?,?,?,?,?)`
    ).run(key, name, String(req.body?.nameTa ?? '').trim() || null,
          String(req.body?.description ?? '').trim() || null, req.user.id);

    audit(req.user.id, 'MASTER_CATEGORY_CREATED', 'master_category', info.lastInsertRowid, `${name} (${key})`);
    res.status(201).json({ id: Number(info.lastInsertRowid), key, name, isActive: true, itemCount: 0, activeCount: 0 });
  } catch (err) { next(err); }
});

/** PATCH /api/master-categories/:id */
router.patch('/:id', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.prepare('SELECT * FROM vms_master_categories WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    const sets = [], params = [];
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (name.length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters', fields: { name: 'Too short' } });
      sets.push('name = ?'); params.push(name);
    }
    if (req.body?.nameTa !== undefined) { sets.push('name_ta = ?'); params.push(String(req.body.nameTa).trim() || null); }
    if (req.body?.description !== undefined) { sets.push('description = ?'); params.push(String(req.body.description).trim() || null); }
    if (req.body?.isActive !== undefined) { sets.push('is_active = ?'); params.push(req.body.isActive ? 1 : 0); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    await db.prepare(`UPDATE vms_master_categories SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    audit(req.user.id, 'MASTER_CATEGORY_UPDATED', 'master_category', id, JSON.stringify(Object.keys(req.body ?? {})));
    const row = await db.prepare('SELECT * FROM vms_master_categories WHERE id = ?').get(id);
    res.json({ id: row.id, key: row.cat_key, name: row.name, nameTa: row.name_ta, isActive: !!row.is_active });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/master-categories/:id — blocked while any published or draft
 * form field still binds to it, so a live survey can never lose its options.
 */
router.delete('/:id', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cat = await db.prepare('SELECT * FROM vms_master_categories WHERE id = ?').get(id);
    if (!cat) return res.status(404).json({ error: 'Category not found' });

    // Only the live form and the working draft can block deletion. Archived
    // versions reference it forever by definition, so checking those too would
    // make a category undeletable the moment it is used once.
    const schemas = await db.prepare(
      `SELECT version, fields_json FROM vms_form_schemas WHERE status = 'published' OR version = 0`
    ).all();
    const boundIn = schemas.filter((s) => {
      try {
        return JSON.parse(s.fields_json).some((f) => f?.source?.kind === 'master' && f.source.master === cat.cat_key);
      } catch { return false; }
    });
    if (boundIn.length) {
      const where = boundIn.map((s) => (s.version === 0 ? 'the draft' : `version ${s.version}`)).join(' and ');
      return res.status(409).json({
        error: `"${cat.name}" is bound to a form field in ${where}. Unbind it there first, or deactivate the category instead.`,
      });
    }

    // Separately: never delete a list that real survey answers still point at,
    // or those records lose the ability to resolve what was recorded.
    const used = await db.prepare(
      `SELECT COUNT(*) c
         FROM vms_survey_answers a
         JOIN vms_master_items i ON i.category_id = ?
        WHERE a.value = CAST(i.id AS CHAR)
           OR a.value LIKE CONCAT('%"', i.id, '"%')`
    ).get(id);
    if (Number(used.c) > 0) {
      return res.status(409).json({
        error: `${used.c} survey answer(s) still reference options in "${cat.name}". Deactivate the category instead so those records keep reading correctly.`,
        usageCount: Number(used.c),
      });
    }

    await db.prepare('DELETE FROM vms_master_categories WHERE id = ?').run(id);
    audit(req.user.id, 'MASTER_CATEGORY_DELETED', 'master_category', id, cat.name);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ------------------------------- items ----------------------------------- */

/** GET /api/master-categories/:id/items */
router.get('/:id/items', requireRole(ROLES.A1, ROLES.A2), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await db.prepare(
      `SELECT i.id, i.name, i.name_ta, i.parent_id, i.sort_order, i.is_active, i.created_at,
              p.name AS parent_name
         FROM vms_master_items i
         LEFT JOIN vms_master_items p ON p.id = i.parent_id
        WHERE i.category_id = ?
        ORDER BY i.sort_order, i.name`
    ).all(id);
    res.json(rows.map((r) => ({
      id: r.id, name: r.name, nameTa: r.name_ta,
      parentId: r.parent_id, parentName: r.parent_name,
      sortOrder: r.sort_order, isActive: !!r.is_active, createdAt: r.created_at,
    })));
  } catch (err) { next(err); }
});

/** POST /api/master-categories/:id/items */
router.post('/:id/items', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const categoryId = Number(req.params.id);
    const cat = await db.prepare('SELECT id, name FROM vms_master_categories WHERE id = ?').get(categoryId);
    if (!cat) return res.status(404).json({ error: 'Category not found' });

    const name = String(req.body?.name ?? '').trim();
    if (name.length < 1) return res.status(400).json({ error: 'Option name is required', fields: { name: 'Required' } });

    const dupe = await db.prepare('SELECT 1 FROM vms_master_items WHERE category_id = ? AND name = ?').get(categoryId, name);
    if (dupe) return res.status(409).json({ error: `"${name}" already exists in this list`, fields: { name: 'Already exists' } });

    const maxRow = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) m FROM vms_master_items WHERE category_id = ?').get(categoryId);
    const info = await db.prepare(
      `INSERT INTO vms_master_items (category_id, name, name_ta, parent_id, sort_order, is_active)
       VALUES (?,?,?,?,?,1)`
    ).run(categoryId, name, String(req.body?.nameTa ?? '').trim() || null,
          req.body?.parentId ? Number(req.body.parentId) : null, Number(maxRow.m) + 10);

    audit(req.user.id, 'MASTER_ITEM_CREATED', 'master_item', info.lastInsertRowid, `${cat.name} › ${name}`);
    res.status(201).json({ id: Number(info.lastInsertRowid), name, nameTa: req.body?.nameTa ?? null, isActive: true });
  } catch (err) { next(err); }
});

/** PATCH /api/master-categories/items/:itemId */
router.patch('/items/:itemId', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const id = Number(req.params.itemId);
    const existing = await db.prepare('SELECT * FROM vms_master_items WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Option not found' });

    const sets = [], params = [];
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: 'Option name is required', fields: { name: 'Required' } });
      const dupe = await db.prepare('SELECT 1 FROM vms_master_items WHERE category_id = ? AND name = ? AND id <> ?')
        .get(existing.category_id, name, id);
      if (dupe) return res.status(409).json({ error: `"${name}" already exists in this list`, fields: { name: 'Already exists' } });
      sets.push('name = ?'); params.push(name);
    }
    if (req.body?.nameTa !== undefined) { sets.push('name_ta = ?'); params.push(String(req.body.nameTa).trim() || null); }
    if (req.body?.isActive !== undefined) { sets.push('is_active = ?'); params.push(req.body.isActive ? 1 : 0); }
    if (req.body?.sortOrder !== undefined) { sets.push('sort_order = ?'); params.push(Number(req.body.sortOrder) || 0); }
    if (req.body?.parentId !== undefined) { sets.push('parent_id = ?'); params.push(req.body.parentId ? Number(req.body.parentId) : null); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    await db.prepare(`UPDATE vms_master_items SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    audit(req.user.id, 'MASTER_ITEM_UPDATED', 'master_item', id, JSON.stringify(Object.keys(req.body ?? {})));
    const row = await db.prepare('SELECT * FROM vms_master_items WHERE id = ?').get(id);
    res.json({ id: row.id, name: row.name, nameTa: row.name_ta, isActive: !!row.is_active, sortOrder: row.sort_order });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/master-categories/items/:itemId — refused once any survey has
 * recorded this option, exactly like the built-in masters. Deactivate instead:
 * it disappears from new surveys while historical answers still read correctly.
 */
router.delete('/items/:itemId', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const id = Number(req.params.itemId);
    const item = await db.prepare('SELECT * FROM vms_master_items WHERE id = ?').get(id);
    if (!item) return res.status(404).json({ error: 'Option not found' });

    const used = await db.prepare(
      `SELECT COUNT(*) c FROM vms_survey_answers WHERE value = ? OR value LIKE ?`
    ).get(String(id), `%"${id}"%`);

    if (Number(used.c) > 0) {
      return res.status(409).json({
        error: `${used.c} survey record(s) already recorded "${item.name}". Deactivate it instead so those records keep reading correctly.`,
        usageCount: Number(used.c),
      });
    }

    await db.prepare('DELETE FROM vms_master_items WHERE id = ?').run(id);
    audit(req.user.id, 'MASTER_ITEM_DELETED', 'master_item', id, item.name);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
