/**
 * The client half of the form-schema contract. This mirrors
 * server/src/lib/formSchema.js exactly — the same field shapes, the same
 * visibility rules, the same validation. The server still re-validates
 * everything on submit; this exists so the agent gets the answer instantly
 * instead of after a round trip.
 */

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'phone' | 'date'
  | 'select' | 'multiselect' | 'radio' | 'boolean' | 'party'
  | 'section' | 'divider' | 'notice';

export type FieldWidth = 'full' | 'half' | 'third';
export type ConditionOp = 'eq' | 'ne' | 'in' | 'filled' | 'empty';

export interface FieldOption {
  value: string;
  label: string;
  labelTa?: string | null;
  /** Extra attributes carried by master-bound options (party colours etc). */
  group?: string;
  parent?: string | null;
  code?: string;
  color?: string;
  symbol?: string | null;
}

export interface FieldValidation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  decimals?: boolean;
  minDate?: string;
  maxDate?: string;
  regex?: string;
  regexMessage?: string;
}

export interface FieldSource {
  kind: 'static' | 'master';
  options?: FieldOption[];
  master?: string;
  parentField?: string;
}

export interface FieldVisibility {
  field: string;
  op: ConditionOp;
  value: string | string[];
}

export interface FormField {
  key: string;
  type: FieldType;
  bind?: string | null;
  label: string;
  labelTa?: string | null;
  hint?: string | null;
  hintTa?: string | null;
  placeholder?: string | null;
  placeholderTa?: string | null;
  width: FieldWidth;
  required?: boolean;
  active?: boolean;
  transient?: boolean;
  rows?: number;
  tone?: 'info' | 'warn' | 'ok';
  validation?: FieldValidation;
  source?: FieldSource;
  visibility?: FieldVisibility | null;
}

export interface FormSchema {
  version: number;
  title: string;
  titleTa?: string | null;
  fields: FormField[];
  publishedAt?: string | null;
}

export type AnswerMap = Record<string, string | string[]>;

export const STRUCTURAL_TYPES: FieldType[] = ['section', 'divider', 'notice'];
export const MULTI_TYPES: FieldType[] = ['multiselect'];

export const isStructural = (t: FieldType) => STRUCTURAL_TYPES.includes(t);
export const isMulti = (t: FieldType) => MULTI_TYPES.includes(t);
export const isChoice = (t: FieldType) => ['select', 'multiselect', 'radio', 'party'].includes(t);

/** Columns on the survey table a field can write to, for the builder's inspector. */
export const SYSTEM_BINDINGS: { value: string; label: string }[] = [
  { value: 'phone_number', label: 'Phone number' },
  { value: 'caste_id', label: 'Caste' },
  { value: 'job_id', label: 'Occupation' },
  { value: 'party_id', label: 'Political party' },
  { value: 'education_id', label: 'Education' },
  { value: 'other_job_text', label: 'Custom job note' },
  { value: 'remarks', label: 'Remarks' },
];

export const FIELD_TYPE_META: Record<FieldType, { label: string; icon: string; group: string }> = {
  text:        { label: 'Text',            icon: 'edit',      group: 'Text & numbers' },
  textarea:    { label: 'Long text',       icon: 'edit',      group: 'Text & numbers' },
  number:      { label: 'Number',          icon: 'chart',     group: 'Text & numbers' },
  phone:       { label: 'Phone',           icon: 'phone',     group: 'Text & numbers' },
  date:        { label: 'Date',            icon: 'clock',     group: 'Date & time' },
  select:      { label: 'Dropdown',        icon: 'list',      group: 'Choice' },
  multiselect: { label: 'Multi-select',    icon: 'list',      group: 'Choice' },
  radio:       { label: 'Radio / pills',   icon: 'check',     group: 'Choice' },
  boolean:     { label: 'Yes / No switch', icon: 'check',     group: 'Choice' },
  party:       { label: 'Party picker',    icon: 'flag',      group: 'Choice' },
  section:     { label: 'Section header',  icon: 'layers',    group: 'Layout' },
  divider:     { label: 'Divider',         icon: 'menu',      group: 'Layout' },
  notice:      { label: 'Guidance note',   icon: 'info',      group: 'Layout' },
};

const isBlank = (v: unknown) =>
  v === undefined || v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

/** Mirror of the server's rule engine — decides whether a field shows. */
export function isVisible(field: FormField, values: AnswerMap): boolean {
  if (!field.visibility) return true;
  const { field: dep, op, value } = field.visibility;
  const actual = values[dep];
  switch (op) {
    case 'filled': return !isBlank(actual);
    case 'empty': return isBlank(actual);
    case 'ne': return String(actual ?? '') !== String(value);
    case 'in': return Array.isArray(value) && value.map(String).includes(String(actual ?? ''));
    case 'eq':
    default: return String(actual ?? '') === String(value);
  }
}

/** Client-side validation, matching the server's rules field for field. */
export function validateAnswers(fields: FormField[], values: AnswerMap): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (isStructural(field.type) || field.active === false) continue;
    if (!isVisible(field, values)) continue;

    const raw = values[field.key];
    const multi = isMulti(field.type);
    const value = multi ? (Array.isArray(raw) ? raw : []) : String(raw ?? '').trim();

    if (isBlank(value)) {
      if (field.required) errors[field.key] = `${field.label} is required`;
      continue;
    }

    const v = field.validation ?? {};
    const str = String(value);

    if (field.type === 'number') {
      const n = Number(str);
      if (Number.isNaN(n)) errors[field.key] = `${field.label} must be a number`;
      else if (!v.decimals && !Number.isInteger(n)) errors[field.key] = `${field.label} must be a whole number`;
      else if (v.min !== undefined && n < v.min) errors[field.key] = `${field.label} must be at least ${v.min}`;
      else if (v.max !== undefined && n > v.max) errors[field.key] = `${field.label} must be at most ${v.max}`;
    } else if (field.type === 'phone') {
      if (!/^[6-9]\d{9}$/.test(str)) errors[field.key] = 'Enter a valid 10-digit number starting 6-9';
    } else if (field.type === 'date') {
      if (v.minDate && str < v.minDate) errors[field.key] = `${field.label} cannot be before ${v.minDate}`;
      else if (v.maxDate && str > v.maxDate) errors[field.key] = `${field.label} cannot be after ${v.maxDate}`;
    } else if (!multi && (field.type === 'text' || field.type === 'textarea')) {
      if (v.minLength !== undefined && str.length < v.minLength) errors[field.key] = `${field.label} must be at least ${v.minLength} characters`;
      else if (v.maxLength !== undefined && str.length > v.maxLength) errors[field.key] = `${field.label} must be at most ${v.maxLength} characters`;
    }

    if (!errors[field.key] && v.regex && !multi) {
      try {
        if (!new RegExp(v.regex).test(str)) errors[field.key] = v.regexMessage || `${field.label} is not in the expected format`;
      } catch { /* a bad stored pattern must never block the agent */ }
    }
  }

  return errors;
}

/**
 * Blanks out every field whose show/hide rule currently fails, so a value typed
 * before the parent answer changed never reaches the server as stale data.
 */
export function pruneHidden(fields: FormField[], values: AnswerMap): AnswerMap {
  const out: AnswerMap = { ...values };
  for (const field of fields) {
    if (isStructural(field.type) || field.active === false) continue;
    if (!isVisible(field, out)) out[field.key] = isMulti(field.type) ? [] : '';
  }
  return out;
}

/** A stable, readable key suggestion from a label the admin just typed. */
export function slugifyKey(label: string): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return /^[a-z]/.test(base) ? base : `field_${base || Date.now().toString(36)}`;
}
