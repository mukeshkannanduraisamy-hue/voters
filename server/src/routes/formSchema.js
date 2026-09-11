import express from 'express';
import { db, withTransaction } from '../lib/db.js';
import { authenticate, requireRole, audit, ROLES } from '../lib/auth.js';
import {
  normaliseSchema, SchemaError, getPublishedSchema, getDraftSchema,
  resolveMasterOptions, STRUCTURAL_TYPES,
} from '../lib/formSchema.js';

const router = express.Router();
router.use(authenticate);

/* ----------------------------- read endpoints ---------------------------- */

/**
 * GET /api/form-schema/published — the live form.
 * Every role can read this: it is what the survey screen renders from.
 */
router.get('/published', async (req, res, next) => {
  try {
    res.json(await getPublishedSchema());
  } catch (err) { next(err); }
});

/**
 * GET /api/form-schema/options/:master — resolved options for a bound field.
 * Also open to every role, since agents need it to fill the form.
 */
router.get('/options/:master', async (req, res, next) => {
  try {
    res.json(await resolveMasterOptions(String(req.params.master)));
  } catch (err) { next(err); }
});

/** GET /api/form-schema/draft — the Super Admin's working copy. */
router.get('/draft', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const [draft, published] = await Promise.all([getDraftSchema(), getPublishedSchema()]);
    res.json({ draft, publishedVersion: published.version, dirty: !sameFields(draft.fields, published.fields) });
  } catch (err) { next(err); }
});

/** GET /api/form-schema/versions — publish history for governance. */
router.get('/versions', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const rows = await db.prepare(
      `SELECT f.version, f.status, f.title, f.change_summary, f.created_at, f.published_at,
              u.full_name AS published_by_name
         FROM vms_form_schemas f
         LEFT JOIN users u ON u.id = f.created_by
        WHERE f.version > 0
        ORDER BY f.version DESC
        LIMIT 50`
    ).all();
    res.json(rows.map((r) => ({
      version: r.version,
      status: r.status,
      title: r.title,
      changeSummary: r.change_summary,
      createdAt: r.created_at,
      publishedAt: r.published_at,
      publishedByName: r.published_by_name,
    })));
  } catch (err) { next(err); }
});

/* ---------------------------- write endpoints ---------------------------- */

/** PUT /api/form-schema/draft — save the working copy (does not go live). */
router.put('/draft', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const fields = normaliseSchema(req.body?.fields);
    const title = String(req.body?.title ?? '').trim() || 'Voter Field Survey';
    const titleTa = String(req.body?.titleTa ?? '').trim() || null;

    const existing = await db.prepare('SELECT id FROM vms_form_schemas WHERE version = 0').get();
    if (existing) {
      await db.prepare(
        `UPDATE vms_form_schemas
            SET fields_json = ?, title = ?, title_ta = ?, created_by = ?, created_at = NOW()
          WHERE version = 0`
      ).run(JSON.stringify(fields), title, titleTa, req.user.id);
    } else {
      await db.prepare(
        `INSERT INTO vms_form_schemas (version, status, title, title_ta, fields_json, created_by)
         VALUES (0, 'draft', ?, ?, ?, ?)`
      ).run(title, titleTa, JSON.stringify(fields), req.user.id);
    }

    audit(req.user.id, 'FORM_DRAFT_SAVED', 'form_schema', 'draft', `${fields.length} fields`);
    res.json({ ok: true, draft: { version: 0, title, titleTa, fields } });
  } catch (err) {
    if (err instanceof SchemaError) {
      return res.status(400).json({ error: err.errors[0], errors: err.errors });
    }
    next(err);
  }
});

/**
 * POST /api/form-schema/publish — freeze the draft as the next version and
 * make it live. Agents pick it up on their next survey load; nothing is
 * deployed and no existing answer is touched.
 */
router.post('/publish', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const draft = await getDraftSchema();
    const fields = normaliseSchema(draft.fields);
    if (!fields.some((f) => !STRUCTURAL_TYPES.has(f.type) && f.active)) {
      return res.status(400).json({ error: 'Publish needs at least one active input field — right now the form only has layout elements.' });
    }

    const previous = await getPublishedSchema();
    const summary = String(req.body?.changeSummary ?? '').trim() || describeChanges(previous.fields, fields);

    const nextVersion = await withTransaction(async (trx) => {
      const row = await trx.prepare('SELECT COALESCE(MAX(version), 0) v FROM vms_form_schemas').get();
      const version = Number(row.v) + 1;
      await trx.prepare(`UPDATE vms_form_schemas SET status = 'archived' WHERE status = 'published'`).run();
      await trx.prepare(
        `INSERT INTO vms_form_schemas (version, status, title, title_ta, fields_json, change_summary, created_by, published_at)
         VALUES (?, 'published', ?, ?, ?, ?, ?, NOW())`
      ).run(version, draft.title, draft.titleTa, JSON.stringify(fields), summary, req.user.id);
      return version;
    });

    audit(req.user.id, 'FORM_PUBLISHED', 'form_schema', String(nextVersion), summary);
    res.json({ ok: true, version: nextVersion, changeSummary: summary, fields });
  } catch (err) {
    if (err instanceof SchemaError) {
      return res.status(400).json({ error: err.errors[0], errors: err.errors });
    }
    next(err);
  }
});

/** POST /api/form-schema/revert — throw the draft away, back to what is live. */
router.post('/revert', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const published = await getPublishedSchema();
    await db.prepare(
      `UPDATE vms_form_schemas
          SET fields_json = ?, title = ?, title_ta = ?, created_by = ?, created_at = NOW()
        WHERE version = 0`
    ).run(JSON.stringify(published.fields), published.title, published.titleTa, req.user.id);

    audit(req.user.id, 'FORM_DRAFT_REVERTED', 'form_schema', 'draft', `Reverted to v${published.version}`);
    res.json({ ok: true, draft: { version: 0, ...published } });
  } catch (err) { next(err); }
});

/** POST /api/form-schema/restore/:version — load an old version into the draft. */
router.post('/restore/:version', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const version = Number(req.params.version);
    const row = await db.prepare('SELECT title, title_ta, fields_json FROM vms_form_schemas WHERE version = ?').get(version);
    if (!row) return res.status(404).json({ error: `Version ${version} not found` });

    await db.prepare(
      `UPDATE vms_form_schemas
          SET fields_json = ?, title = ?, title_ta = ?, created_by = ?, created_at = NOW()
        WHERE version = 0`
    ).run(row.fields_json, row.title, row.title_ta, req.user.id);

    audit(req.user.id, 'FORM_VERSION_RESTORED', 'form_schema', String(version), `Loaded v${version} into the draft`);
    res.json({ ok: true, restoredFrom: version });
  } catch (err) { next(err); }
});

/* -------------------------------- helpers -------------------------------- */

function sameFields(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A readable "what changed" line for the audit log when none was supplied. */
function describeChanges(before, after) {
  const beforeKeys = new Set(before.map((f) => f.key));
  const afterKeys = new Set(after.map((f) => f.key));
  const added = [...afterKeys].filter((k) => !beforeKeys.has(k));
  const removed = [...beforeKeys].filter((k) => !afterKeys.has(k));

  const beforeByKey = new Map(before.map((f) => [f.key, f]));
  const changed = after.filter((f) => beforeByKey.has(f.key) && JSON.stringify(beforeByKey.get(f.key)) !== JSON.stringify(f));
  const reordered = JSON.stringify(before.map((f) => f.key).filter((k) => afterKeys.has(k)))
                 !== JSON.stringify(after.map((f) => f.key).filter((k) => beforeKeys.has(k)));

  const parts = [];
  if (added.length) parts.push(`${added.length} added (${added.join(', ')})`);
  if (removed.length) parts.push(`${removed.length} removed (${removed.join(', ')})`);
  if (changed.length) parts.push(`${changed.length} edited`);
  if (reordered) parts.push('reordered');
  return parts.length ? parts.join(' · ') : 'No field changes';
}

export default router;
