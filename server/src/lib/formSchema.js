import { db } from './db.js';
import { FIELD_TYPES, STRUCTURAL_TYPES, MULTI_TYPES, SYSTEM_BINDINGS } from './formDefaults.js';

export { FIELD_TYPES, STRUCTURAL_TYPES, MULTI_TYPES, SYSTEM_BINDINGS };

const KEY_RE = /^[a-z][a-z0-9_]{1,63}$/;
const WIDTHS = new Set(['full', 'half', 'third']);
const CONDITION_OPS = new Set(['eq', 'ne', 'in', 'filled', 'empty']);

/* ============================ schema normalising ========================== */

/**
 * Cleans one incoming field definition into the exact shape we persist.
 * Anything unrecognised is dropped rather than stored, so a malformed or
 * hand-crafted payload can never smuggle extra keys into the schema JSON.
 */
function normaliseField(raw, index, seenKeys) {
  const errors = [];
  const type = String(raw?.type ?? 'text');
  if (!FIELD_TYPES.includes(type)) {
    errors.push(`Field ${index + 1}: unknown type "${type}"`);
    return { errors };
  }

  let key = String(raw?.key ?? '').trim().toLowerCase();
  if (!KEY_RE.test(key)) {
    errors.push(`Field ${index + 1}: invalid key "${key}" (lowercase letters, digits, underscore; must start with a letter)`);
    return { errors };
  }
  if (seenKeys.has(key)) {
    errors.push(`Duplicate field key "${key}" — keys identify stored answers and must be unique`);
    return { errors };
  }
  seenKeys.add(key);

  const label = String(raw?.label ?? '').trim();
  if (!STRUCTURAL_TYPES.has(type) && label.length < 1) {
    errors.push(`Field "${key}": an English label is required`);
  }

  const bind = raw?.bind && SYSTEM_BINDINGS[raw.bind] ? raw.bind : null;

  const field = {
    key,
    type,
    bind,
    label,
    labelTa: String(raw?.labelTa ?? '').trim() || null,
    hint: String(raw?.hint ?? '').trim() || null,
    hintTa: String(raw?.hintTa ?? '').trim() || null,
    placeholder: String(raw?.placeholder ?? '').trim() || null,
    placeholderTa: String(raw?.placeholderTa ?? '').trim() || null,
    width: WIDTHS.has(raw?.width) ? raw.width : 'full',
    required: !!raw?.required && !STRUCTURAL_TYPES.has(type),
    active: raw?.active !== false,
    transient: !!raw?.transient,
  };

  if (type === 'textarea') field.rows = Math.min(10, Math.max(2, Number(raw?.rows) || 3));

  // ---- validation rules ---------------------------------------------------
  const v = raw?.validation ?? {};
  const validation = {};
  const num = (x) => (x === '' || x === null || x === undefined || Number.isNaN(Number(x)) ? undefined : Number(x));
  if (num(v.min) !== undefined) validation.min = num(v.min);
  if (num(v.max) !== undefined) validation.max = num(v.max);
  if (num(v.minLength) !== undefined) validation.minLength = num(v.minLength);
  if (num(v.maxLength) !== undefined) validation.maxLength = num(v.maxLength);
  if (v.decimals) validation.decimals = true;
  if (typeof v.minDate === 'string' && v.minDate.trim()) validation.minDate = v.minDate.trim();
  if (typeof v.maxDate === 'string' && v.maxDate.trim()) validation.maxDate = v.maxDate.trim();
  if (typeof v.regex === 'string' && v.regex.trim()) {
    try {
      new RegExp(v.regex);
      validation.regex = v.regex.trim();
      validation.regexMessage = String(v.regexMessage ?? '').trim() || 'Value does not match the required format';
    } catch {
      errors.push(`Field "${key}": the custom pattern is not a valid regular expression`);
    }
  }
  if (Object.keys(validation).length) field.validation = validation;

  // ---- option source ------------------------------------------------------
  if (['select', 'multiselect', 'radio', 'party'].includes(type)) {
    const src = raw?.source ?? {};
    if (src.kind === 'master' && String(src.master ?? '').trim()) {
      field.source = { kind: 'master', master: String(src.master).trim() };
      if (src.parentField) field.source.parentField = String(src.parentField).trim();
    } else {
      const options = Array.isArray(src.options) ? src.options : [];
      const cleaned = [];
      const seenVals = new Set();
      for (const o of options) {
        const value = String(o?.value ?? o?.label ?? '').trim();
        if (!value || seenVals.has(value)) continue;
        seenVals.add(value);
        cleaned.push({
          value,
          label: String(o?.label ?? value).trim(),
          labelTa: String(o?.labelTa ?? '').trim() || null,
        });
      }
      if (!cleaned.length && type !== 'party') {
        errors.push(`Field "${key}": a choice field needs at least one option, or bind it to master data`);
      }
      field.source = { kind: 'static', options: cleaned };
    }
  }

  // ---- conditional visibility --------------------------------------------
  const vis = raw?.visibility;
  if (vis && typeof vis === 'object' && vis.field) {
    const op = CONDITION_OPS.has(vis.op) ? vis.op : 'eq';
    field.visibility = {
      field: String(vis.field).trim(),
      op,
      value: op === 'in'
        ? (Array.isArray(vis.value) ? vis.value.map((x) => String(x)) : String(vis.value ?? '').split(',').map((s) => s.trim()).filter(Boolean))
        : String(vis.value ?? ''),
    };
  }

  if (type === 'section' || type === 'notice') {
    field.tone = ['info', 'warn', 'ok'].includes(raw?.tone) ? raw.tone : 'info';
  }

  return { field, errors };
}

/** Validates + normalises a whole field array. Throws SchemaError on problems. */
export function normaliseSchema(rawFields) {
  if (!Array.isArray(rawFields)) throw new SchemaError(['Form schema must be a list of fields']);

  const seenKeys = new Set();
  const fields = [];
  const errors = [];

  for (let i = 0; i < rawFields.length; i++) {
    const { field, errors: fieldErrors } = normaliseField(rawFields[i], i, seenKeys);
    errors.push(...fieldErrors);
    if (field) fields.push(field);
  }

  // A rule can only point at a field that exists and sits *earlier* in the
  // form — otherwise the agent would have to answer a question to reveal one
  // they have already scrolled past, and two fields could hide each other.
  const indexByKey = new Map(fields.map((f, i) => [f.key, i]));
  for (const [i, f] of fields.entries()) {
    if (!f.visibility) continue;
    const target = indexByKey.get(f.visibility.field);
    if (target === undefined) {
      errors.push(`Field "${f.key}": its show/hide rule points at "${f.visibility.field}", which is not in this form`);
    } else if (target >= i) {
      errors.push(`Field "${f.key}": its show/hide rule must depend on a field placed above it`);
    }
  }

  // Two fields writing the same system column would silently overwrite one another.
  const boundSeen = new Map();
  for (const f of fields) {
    if (!f.bind) continue;
    if (boundSeen.has(f.bind)) {
      errors.push(`Fields "${boundSeen.get(f.bind)}" and "${f.key}" both save to the same system column (${f.bind})`);
    }
    boundSeen.set(f.bind, f.key);
  }

  if (errors.length) throw new SchemaError(errors);
  return fields;
}

export class SchemaError extends Error {
  constructor(errors) {
    super(errors[0] ?? 'Invalid form schema');
    this.name = 'SchemaError';
    this.errors = errors;
  }
}

/* ============================ schema accessors ============================ */

export async function getPublishedSchema() {
  const row = await db
    .prepare(`SELECT id, version, title, title_ta, fields_json, published_at
                FROM vms_form_schemas WHERE status = 'published'
               ORDER BY version DESC LIMIT 1`)
    .get();
  if (!row) return { version: 0, title: 'Voter Field Survey', titleTa: null, fields: [], publishedAt: null };
  return {
    version: row.version,
    title: row.title,
    titleTa: row.title_ta,
    fields: safeParse(row.fields_json),
    publishedAt: row.published_at,
  };
}

export async function getDraftSchema() {
  const row = await db
    .prepare(`SELECT id, version, title, title_ta, fields_json, change_summary, created_at
                FROM vms_form_schemas WHERE version = 0 LIMIT 1`)
    .get();
  if (row) {
    return {
      version: 0,
      title: row.title,
      titleTa: row.title_ta,
      fields: safeParse(row.fields_json),
      changeSummary: row.change_summary,
      updatedAt: row.created_at,
    };
  }
  // No draft yet — start one from whatever is currently live.
  const pub = await getPublishedSchema();
  return { version: 0, title: pub.title, titleTa: pub.titleTa, fields: pub.fields, changeSummary: null, updatedAt: null };
}

function safeParse(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/* ============================= option resolving =========================== */

/**
 * Resolves the allowed option values for a master-bound field.
 * Legacy system masters keep their own tables (they carry extra columns the
 * dashboards rely on); everything else comes from the generic category tables.
 */
export async function resolveMasterOptions(masterKey) {
  switch (masterKey) {
    case 'caste':
      return (await db.prepare(
        `SELECT id, name, name_ta, category FROM caste_master WHERE is_active = 1 ORDER BY category, name`
      ).all()).map((r) => ({ value: String(r.id), label: r.name, labelTa: r.name_ta, group: r.category }));

    case 'education':
      return (await db.prepare(
        `SELECT id, name, name_ta FROM education_master WHERE is_active = 1 ORDER BY id`
      ).all()).map((r) => ({ value: String(r.id), label: r.name, labelTa: r.name_ta }));

    case 'party':
      return (await db.prepare(
        `SELECT id, name, name_ta, party_code, color_code, symbol_img FROM party_master WHERE is_active = 1 ORDER BY id`
      ).all()).map((r) => ({
        value: String(r.id), label: r.name, labelTa: r.name_ta,
        code: r.party_code, color: r.color_code, symbol: r.symbol_img,
      }));

    case 'job':
      return (await db.prepare(
        `SELECT id, name, name_ta, category FROM job_master WHERE is_active = 1 ORDER BY category, name`
      ).all()).map((r) => ({ value: String(r.id), label: r.name, labelTa: r.name_ta, parent: r.category }));

    case 'job_sector':
      return (await db.prepare(
        `SELECT DISTINCT category, category_ta FROM job_master WHERE is_active = 1 ORDER BY category`
      ).all()).map((r) => ({ value: r.category, label: r.category, labelTa: r.category_ta }));

    default: {
      const cat = await db.prepare('SELECT id FROM vms_master_categories WHERE cat_key = ? AND is_active = 1').get(masterKey);
      if (!cat) return [];
      return (await db.prepare(
        `SELECT id, name, name_ta, parent_id FROM vms_master_items
          WHERE category_id = ? AND is_active = 1 ORDER BY sort_order, name`
      ).all(cat.id)).map((r) => ({
        value: String(r.id), label: r.name, labelTa: r.name_ta,
        parent: r.parent_id === null ? null : String(r.parent_id),
      }));
    }
  }
}

/* ========================= submission validation ========================== */

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

/** Evaluates one field's show/hide rule against the answers collected so far. */
export function isVisible(field, values) {
  if (!field.visibility) return true;
  const { field: dep, op, value } = field.visibility;
  const actual = values[dep];
  switch (op) {
    case 'filled': return !isBlank(actual);
    case 'empty':  return isBlank(actual);
    case 'ne':     return String(actual ?? '') !== String(value);
    case 'in':     return Array.isArray(value) && value.map(String).includes(String(actual ?? ''));
    case 'eq':
    default:       return String(actual ?? '') === String(value);
  }
}

/**
 * Validates a submitted answer map against the published schema.
 *
 * Returns { values, systemValues, answers, errors }:
 *   values       – the accepted value per field key (hidden fields cleared)
 *   systemValues – { column: value } for fields bound to vms_voter_surveys
 *   answers      – { field_key: string } for custom fields
 */
export async function validateSubmission(fields, submitted) {
  const errors = {};
  const codes = {};           // key -> 'required' | 'unavailable' | 'format'
  const values = {};
  const systemValues = {};
  const answers = {};
  const optionCache = new Map();

  const optionsFor = async (masterKey) => {
    if (!optionCache.has(masterKey)) optionCache.set(masterKey, await resolveMasterOptions(masterKey));
    return optionCache.get(masterKey);
  };

  for (const field of fields) {
    if (STRUCTURAL_TYPES.has(field.type) || !field.active) continue;

    // A hidden field contributes nothing — and is actively cleared, so a value
    // typed before the parent answer changed can't survive as stale data.
    if (!isVisible(field, values)) {
      values[field.key] = MULTI_TYPES.has(field.type) ? [] : '';
      if (field.bind) systemValues[field.bind] = null;
      else if (!field.transient) answers[field.key] = null;
      continue;
    }

    const raw = submitted?.[field.key];
    const multi = MULTI_TYPES.has(field.type);
    let value = multi
      ? (Array.isArray(raw) ? raw.map((x) => String(x).trim()).filter(Boolean) : [])
      : (raw === undefined || raw === null ? '' : String(raw).trim());

    if (isBlank(value)) {
      if (field.required) { errors[field.key] = `${field.label} is required`; codes[field.key] = 'required'; }
      values[field.key] = multi ? [] : '';
      if (field.bind) systemValues[field.bind] = null;
      else if (!field.transient) answers[field.key] = null;
      continue;
    }

    const v = field.validation ?? {};

    switch (field.type) {
      case 'number': {
        const n = Number(value);
        if (Number.isNaN(n)) { errors[field.key] = `${field.label} must be a number`; break; }
        if (!v.decimals && !Number.isInteger(n)) { errors[field.key] = `${field.label} must be a whole number`; break; }
        if (v.min !== undefined && n < v.min) { errors[field.key] = `${field.label} must be at least ${v.min}`; break; }
        if (v.max !== undefined && n > v.max) { errors[field.key] = `${field.label} must be at most ${v.max}`; break; }
        value = String(n);
        break;
      }
      case 'phone':
        if (!/^[6-9]\d{9}$/.test(value)) errors[field.key] = 'Enter a valid 10-digit number starting 6-9';
        break;
      case 'date': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
          errors[field.key] = `${field.label} must be a valid date`; break;
        }
        if (v.minDate && value < v.minDate) { errors[field.key] = `${field.label} cannot be before ${v.minDate}`; break; }
        if (v.maxDate && value > v.maxDate) { errors[field.key] = `${field.label} cannot be after ${v.maxDate}`; break; }
        break;
      }
      case 'boolean':
        value = ['true', '1', 'yes', 'on'].includes(value.toLowerCase()) ? 'true' : 'false';
        break;
      case 'select':
      case 'radio':
      case 'party':
      case 'multiselect': {
        const allowed = field.source?.kind === 'master'
          ? (await optionsFor(field.source.master)).map((o) => o.value)
          : (field.source?.options ?? []).map((o) => o.value);
        const chosen = multi ? value : [value];
        const bad = chosen.filter((c) => !allowed.includes(c));
        if (bad.length) {
          // A master-bound value that isn't in the active list means the admin
          // retired that option since the agent loaded the form — semantically
          // different from the agent sending a value that was never valid.
          const fromMaster = field.source?.kind === 'master';
          errors[field.key] = fromMaster
            ? `Selected ${field.label.toLowerCase()} is no longer available`
            : `Invalid option for ${field.label}`;
          codes[field.key] = fromMaster ? 'unavailable' : 'format';
        }
        break;
      }
      default: {
        // text / textarea
        if (v.minLength !== undefined && value.length < v.minLength) {
          errors[field.key] = `${field.label} must be at least ${v.minLength} characters`; break;
        }
        if (v.maxLength !== undefined && value.length > v.maxLength) {
          errors[field.key] = `${field.label} must be at most ${v.maxLength} characters`; break;
        }
      }
    }

    if (!errors[field.key] && v.regex && !multi) {
      try {
        if (!new RegExp(v.regex).test(value)) errors[field.key] = v.regexMessage || `${field.label} is not in the expected format`;
      } catch { /* a bad stored pattern must never block a survey */ }
    }

    values[field.key] = value;
    if (errors[field.key]) continue;

    if (field.bind) {
      const binding = SYSTEM_BINDINGS[field.bind];
      systemValues[field.bind] = binding.kind === 'masterId' ? Number(value) : value;
    } else if (!field.transient) {
      answers[field.key] = multi ? JSON.stringify(value) : value;
    }
  }

  for (const key of Object.keys(errors)) if (!codes[key]) codes[key] = 'format';
  return { values, systemValues, answers, errors, codes };
}

/** Loads stored custom answers for one elector, shaped for the renderer. */
export async function loadAnswers(epicId) {
  const rows = await db
    .prepare('SELECT field_key, value FROM vms_survey_answers WHERE epic_id = ?')
    .all(epicId);
  const out = {};
  for (const r of rows) out[r.field_key] = r.value;
  return out;
}
