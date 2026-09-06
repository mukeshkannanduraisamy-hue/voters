import express from 'express';
import { db } from '../lib/db.js';
import { authenticate, requireRole, audit, ROLES } from '../lib/auth.js';

const router = express.Router();
router.use(authenticate);

const FIELD_TYPES = ['text', 'number', 'date', 'select'];
const KEY_RE = /^[a-z][a-z0-9_]{1,49}$/;

function slugify(label) {
  return String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50) || 'field';
}

function parseOptions(raw, fieldType) {
  if (fieldType !== 'select') return { ok: true, json: null };
  const list = Array.isArray(raw)
    ? raw.map((v) => String(v).trim()).filter(Boolean)
    : String(raw ?? '').split(',').map((v) => v.trim()).filter(Boolean);
  const unique = [...new Set(list)];
  if (unique.length < 2) return { ok: false, error: 'A dropdown field needs at least 2 options' };
  return { ok: true, json: JSON.stringify(unique) };
}

function shapeField(row) {
  return {
    id: row.id,
    key: row.field_key,
    label: row.label,
    labelTa: row.label_ta,
    fieldType: row.field_type,
    options: row.options_json ? JSON.parse(row.options_json) : null,
    isRequired: !!row.is_required,
    sortOrder: row.sort_order,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    usageCount: row.usage_count ?? 0,
  };
}

/**
 * GET /api/form-fields — active fields in display order, for rendering the
 * survey form. Available to every role (an agent needs it as much as A1).
 */
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM survey_field_defs WHERE is_active = 1 ORDER BY sort_order, id')
    .all();
  res.json(rows.map(shapeField));
});

/** GET /api/form-fields/all — every field including disabled, for the A1 management screen. */
router.get('/all', requireRole(ROLES.A1), (req, res) => {
  const rows = db
    .prepare(
      `SELECT d.*, (SELECT COUNT(*) FROM survey_field_values v WHERE v.field_id = d.id) AS usage_count
         FROM survey_field_defs d
        ORDER BY d.sort_order, d.id`
    )
    .all();
  res.json(rows.map(shapeField));
});

/** POST /api/form-fields — add a new custom field (A1 only). */
router.post('/', requireRole(ROLES.A1), (req, res) => {
  const label = String(req.body?.label ?? '').trim();
  const labelTa = String(req.body?.label_ta ?? req.body?.labelTa ?? '').trim() || null;
  const fieldType = String(req.body?.field_type ?? req.body?.fieldType ?? 'text').trim();
  const isRequired = req.body?.is_required ?? req.body?.isRequired ? 1 : 0;

  const errors = {};
  if (label.length < 2) errors.label = 'Field label must be at least 2 characters';
  if (!FIELD_TYPES.includes(fieldType)) errors.fieldType = `Type must be one of ${FIELD_TYPES.join(', ')}`;
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Please correct the highlighted fields', fields: errors });

  const optionsResult = parseOptions(req.body?.options, fieldType);
  if (!optionsResult.ok) return res.status(400).json({ error: optionsResult.error, fields: { options: optionsResult.error } });

  let key = slugify(label);
  if (!KEY_RE.test(key)) key = `field_${Date.now()}`;
  if (db.prepare('SELECT 1 FROM survey_field_defs WHERE field_key = ?').get(key)) {
    key = `${key}_${Date.now().toString(36)}`;
  }

  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) m FROM survey_field_defs').get().m;

  const info = db.prepare(
    `INSERT INTO survey_field_defs (field_key, label, label_ta, field_type, options_json, is_required, sort_order, is_active)
     VALUES (?,?,?,?,?,?,?,1)`
  ).run(key, label, labelTa, fieldType, optionsResult.json, isRequired, maxOrder + 10);

  audit(req.user.id, 'FORM_FIELD_CREATED', 'survey_field_defs', info.lastInsertRowid, label);
  const row = db.prepare('SELECT * FROM survey_field_defs WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(shapeField(row));
});

/** PATCH /api/form-fields/:id — edit label/type/options/required/active, or reorder (A1 only). */
router.patch('/:id', requireRole(ROLES.A1), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM survey_field_defs WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Field not found' });

  const sets = [];
  const params = [];
  const nextType = req.body?.field_type ?? req.body?.fieldType ?? existing.field_type;

  if (req.body?.label !== undefined) {
    const label = String(req.body.label).trim();
    if (label.length < 2) return res.status(400).json({ error: 'Label must be at least 2 characters', fields: { label: 'Too short' } });
    sets.push('label = ?'); params.push(label);
  }
  if (req.body?.label_ta !== undefined || req.body?.labelTa !== undefined) {
    sets.push('label_ta = ?'); params.push(String(req.body.label_ta ?? req.body.labelTa).trim() || null);
  }
  if (req.body?.field_type !== undefined || req.body?.fieldType !== undefined) {
    if (!FIELD_TYPES.includes(nextType)) return res.status(400).json({ error: `Type must be one of ${FIELD_TYPES.join(', ')}`, fields: { fieldType: 'Invalid' } });
    sets.push('field_type = ?'); params.push(nextType);
  }
  if (req.body?.options !== undefined || nextType === 'select') {
    const optionsResult = parseOptions(req.body?.options ?? (existing.options_json ? JSON.parse(existing.options_json) : []), nextType);
    if (nextType === 'select') {
      if (!optionsResult.ok) return res.status(400).json({ error: optionsResult.error, fields: { options: optionsResult.error } });
      sets.push('options_json = ?'); params.push(optionsResult.json);
    } else {
      sets.push('options_json = ?'); params.push(null);
    }
  }
  if (req.body?.is_required !== undefined || req.body?.isRequired !== undefined) {
    sets.push('is_required = ?'); params.push((req.body.is_required ?? req.body.isRequired) ? 1 : 0);
  }
  if (req.body?.is_active !== undefined || req.body?.isActive !== undefined) {
    sets.push('is_active = ?'); params.push((req.body.is_active ?? req.body.isActive) ? 1 : 0);
  }
  if (req.body?.sort_order !== undefined || req.body?.sortOrder !== undefined) {
    sets.push('sort_order = ?'); params.push(Number(req.body.sort_order ?? req.body.sortOrder) || 0);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

  db.prepare(`UPDATE survey_field_defs SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
  audit(req.user.id, 'FORM_FIELD_UPDATED', 'survey_field_defs', id, JSON.stringify(Object.keys(req.body ?? {})));
  const row = db.prepare('SELECT * FROM survey_field_defs WHERE id = ?').get(id);
  res.json(shapeField(row));
});

/** POST /api/form-fields/:id/move — swap sort_order with the adjacent field (A1 only). Simple reordering, no drag-and-drop needed. */
router.post('/:id/move', requireRole(ROLES.A1), (req, res) => {
  const id = Number(req.params.id);
  const direction = String(req.body?.direction ?? '').trim();
  if (!['up', 'down'].includes(direction)) return res.status(400).json({ error: 'direction must be "up" or "down"' });

  const all = db.prepare('SELECT id, sort_order FROM survey_field_defs ORDER BY sort_order, id').all();
  const idx = all.findIndex((f) => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Field not found' });

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) return res.json({ ok: true }); // already at the edge, no-op

  const a = all[idx], b = all[swapIdx];
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE survey_field_defs SET sort_order = ? WHERE id = ?').run(b.sort_order, a.id);
    db.prepare('UPDATE survey_field_defs SET sort_order = ? WHERE id = ?').run(a.sort_order, b.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Could not reorder', detail: err.message });
  }
  res.json({ ok: true });
});

/** DELETE /api/form-fields/:id — only when no survey has an answer for it; otherwise disable instead. */
router.delete('/:id', requireRole(ROLES.A1), (req, res) => {
  const id = Number(req.params.id);
  const used = db.prepare('SELECT COUNT(*) c FROM survey_field_values WHERE field_id = ?').get(id).c;
  if (used > 0) {
    return res.status(409).json({
      error: `${used.toLocaleString()} survey record(s) already have an answer for this field. Disable it instead of deleting.`,
      usageCount: used,
    });
  }
  const info = db.prepare('DELETE FROM survey_field_defs WHERE id = ?').run(id);
  if (!info.changes) return res.status(404).json({ error: 'Field not found' });
  audit(req.user.id, 'FORM_FIELD_DELETED', 'survey_field_defs', id, null);
  res.json({ ok: true });
});

export default router;
