import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import {
  Alert, Field, Input, PhoneInput, Select, Switch, Textarea,
} from './ui';
import { PartyGrid } from './spec-ui';
import type { AnswerMap, FieldOption, FormField } from '../lib/formSchema';
import { isMulti, isVisible } from '../lib/formSchema';

/* ------------------------------------------------------------------ options */
/**
 * Master-bound option lists are fetched once per master key and shared by every
 * field that binds to it, so a form with five caste-bound dropdowns still makes
 * one request. Kept module-level (not React state) because the builder preview
 * and the live survey both mount these and would otherwise double-fetch.
 */
const optionCache = new Map<string, Promise<FieldOption[]>>();
let cachedJobOptions: FieldOption[] = [];

export function isOtherJob(jobId: string, options?: FieldOption[]): boolean {
  if (!jobId) return false;
  const list = options && options.length > 0 ? options : cachedJobOptions;
  const opt = list.find((o) => String(o.value) === String(jobId));
  if (opt) {
    const l = (opt.label || '').trim().toLowerCase();
    const lTa = (opt.labelTa || '').trim();
    return l === 'other' || l.startsWith('other') || lTa === 'மற்றவை' || lTa.startsWith('மற்றவை');
  }
  return jobId.toLowerCase() === 'other';
}

export function fetchMasterOptions(master: string): Promise<FieldOption[]> {
  if (!optionCache.has(master)) {
    const p = api.get<FieldOption[]>(`/api/form-schema/options/${encodeURIComponent(master)}`)
      .then((opts) => {
        if (master === 'job') cachedJobOptions = opts;
        return opts;
      })
      .catch(() => [] as FieldOption[]);
    optionCache.set(master, p);
  }
  return optionCache.get(master)!;
}

if (typeof window !== 'undefined') {
  void fetchMasterOptions('job').catch(() => {});
}

/** Drops the cache so a freshly edited master list shows up without a reload. */
export function clearOptionCache() { optionCache.clear(); }

export function useFieldOptions(field: FormField): FieldOption[] {
  const [remote, setRemote] = useState<FieldOption[]>([]);
  const master = field.source?.kind === 'master' ? field.source.master : undefined;

  useEffect(() => {
    let alive = true;
    if (master) void fetchMasterOptions(master).then((o) => { if (alive) setRemote(o); });
    return () => { alive = false; };
  }, [master]);

  return field.source?.kind === 'master' ? remote : (field.source?.options ?? []);
}

/* ------------------------------------------------------------------- field */
export function DynamicField({
  field, values, errors, onChange, tamilFirst = true, allowCall = false,
  onPickContact, pickingContact = false,
}: {
  field: FormField;
  values: AnswerMap;
  errors: Record<string, string>;
  onChange: (key: string, value: string | string[]) => void;
  tamilFirst?: boolean;
  allowCall?: boolean;
  onPickContact?: () => void;
  pickingContact?: boolean;
}) {
  const allOptions = useFieldOptions(field);
  if (field.source?.kind === 'master' && field.source.master === 'job' && allOptions.length > 0) {
    cachedJobOptions = allOptions;
  }

  const parentKey = field.source?.parentField;
  const parentValue = parentKey ? String(values[parentKey] ?? '') : '';
  const isParentMissing = Boolean(parentKey && !parentValue);

  // A cascading child (sub-job under sector) only offers the options whose
  // parent matches whatever the parent field currently holds.
  const options = useMemo(() => {
    if (!parentKey) return allOptions;
    if (!parentValue) return [];
    return allOptions.filter((o) => o.parent === undefined || o.parent === null || String(o.parent) === parentValue);
  }, [allOptions, parentKey, parentValue]);

  // When a parent field changes or is cleared, clear this child field if its
  // current value is no longer one of the valid options for the new parent.
  useEffect(() => {
    if (!parentKey) return;
    const currentVal = String(values[field.key] ?? '');
    if (!currentVal) return;

    if (!parentValue) {
      onChange(field.key, '');
    } else if (allOptions.length > 0) {
      const match = allOptions.find((o) => String(o.value) === currentVal && (o.parent === undefined || o.parent === null || String(o.parent) === parentValue));
      if (!match) {
        onChange(field.key, '');
      }
    }
  }, [parentKey, parentValue, field.key, values, allOptions, onChange]);

  if (field.active === false) return null;
  if (!isVisible(field, values, isOtherJob)) return null;

  const isEducation = field.bind === 'education_id' || field.source?.master === 'education';
  const err = errors[field.key];
  const raw = values[field.key];
  const label = !isEducation && tamilFirst && field.labelTa ? `${field.label} / ${field.labelTa}` : field.label;
  const hint = !isEducation && tamilFirst && field.hintTa ? `${field.hint ?? ''} ${field.hintTa}`.trim() : field.hint ?? undefined;
  const placeholder = field.placeholder ?? field.placeholderTa ?? undefined;
  const optLabel = (o: FieldOption) => (!isEducation && o.labelTa ? `${o.labelTa} (${o.label})` : o.label);

  /* ---- layout-only elements ---- */
  if (field.type === 'section') {
    return (
      <div className="dyn-section">
        <div className="section-tag">{label}</div>
        {hint && <div className="t-xs t-muted">{hint}</div>}
      </div>
    );
  }
  if (field.type === 'divider') return <hr className="dyn-divider" />;
  if (field.type === 'notice') {
    return <Alert tone={field.tone ?? 'info'}>{label}{hint ? ` — ${hint}` : ''}</Alert>;
  }

  const str = String(raw ?? '');

  /* ---- inputs ---- */
  const control = (() => {
    switch (field.type) {
      case 'textarea':
        return (
          <Textarea value={str} rows={field.rows ?? 3} placeholder={placeholder} invalid={!!err}
            onChange={(e) => onChange(field.key, e.target.value)} />
        );

      case 'number':
        return (
          <Input type="number" value={str} placeholder={placeholder} invalid={!!err}
            min={field.validation?.min} max={field.validation?.max}
            step={field.validation?.decimals ? 'any' : 1}
            onChange={(e) => onChange(field.key, e.target.value)} />
        );

      case 'phone':
        return (
          <PhoneInput value={str} placeholder={placeholder ?? '9840112233'} invalid={!!err}
            onChange={(v) => onChange(field.key, v)} allowCall={allowCall}
            onPickContact={onPickContact} pickingContact={pickingContact} />
        );

      case 'date':
        return (
          <Input type="date" value={str} invalid={!!err}
            min={field.validation?.minDate} max={field.validation?.maxDate}
            onChange={(e) => onChange(field.key, e.target.value)} />
        );

      case 'boolean':
        return (
          <Switch checked={str === 'true'} onChange={(c) => onChange(field.key, c ? 'true' : 'false')}
            label={str === 'true' ? 'Yes / ஆம்' : 'No / இல்லை'} />
        );

      case 'select': {
        const placeholderText = isParentMissing
          ? 'Select occupation sector first… / முதலில் தொழில் துறையைத் தேர்ந்தெடுக்கவும்'
          : (placeholder ?? 'Select…');
        return (
          <Select
            value={str}
            disabled={isParentMissing}
            invalid={!!err}
            onChange={(e) => onChange(field.key, e.target.value)}
          >
            <option value="">{placeholderText}</option>
            {options.map((o) => <option key={o.value} value={o.value}>{optLabel(o)}</option>)}
          </Select>
        );
      }

      case 'radio':
        return (
          <div className="pill-group" role="radiogroup" aria-label={field.label}>
            {isParentMissing ? (
              <span className="t-sm t-muted">Select occupation sector first… / முதலில் தொழில் துறையைத் தேர்ந்தெடுக்கவும்</span>
            ) : (
              options.map((o) => (
                <button
                  key={o.value} type="button" role="radio" aria-checked={str === o.value}
                  className={`pill ${str === o.value ? 'on' : ''}`}
                  // Tapping the chosen pill again clears it, so an optional
                  // question can be un-answered without reloading the form.
                  onClick={() => onChange(field.key, str === o.value ? '' : o.value)}
                >
                  {optLabel(o)}
                </button>
              ))
            )}
          </div>
        );

      case 'multiselect': {
        const selected = Array.isArray(raw) ? raw.map(String) : [];
        return (
          <div className="check-group">
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <label key={o.value} className={`check-opt ${on ? 'on' : ''}`}>
                  <input
                    type="checkbox" checked={on}
                    onChange={() => onChange(field.key, on ? selected.filter((s) => s !== o.value) : [...selected, o.value])}
                  />
                  <span>{optLabel(o)}</span>
                </label>
              );
            })}
            {options.length === 0 && <span className="t-sm t-subtle">No options configured yet.</span>}
          </div>
        );
      }

      case 'party':
        return options.length ? (
          <PartyGrid
            parties={options.map((o) => ({
              id: Number(o.value), name: o.label, name_ta: o.labelTa ?? null,
              party_code: o.code ?? o.label.slice(0, 4).toUpperCase(),
              color_code: o.color ?? '#64748b', symbol_img: o.symbol ?? null,
            }))}
            value={str ? Number(str) : null}
            onChange={(id) => onChange(field.key, id === null ? '' : String(id))}
          />
        ) : <div className="t-sm t-muted">Loading parties…</div>;

      case 'text':
      default:
        return (
          <Input value={str} placeholder={placeholder} invalid={!!err}
            maxLength={field.validation?.maxLength}
            onChange={(e) => onChange(field.key, e.target.value)} />
        );
    }
  })();

  return (
    <Field label={label} required={field.required} error={err} hint={hint}>
      {control}
    </Field>
  );
}

/**
 * Lays the fields out honouring each one's configured width, and starts a new
 * row at every section header so cards stay visually grouped.
 */
export function DynamicFieldGrid({
  fields, values, errors, onChange, allowCall = false, onPickContact, pickingContact = false,
}: {
  fields: FormField[];
  values: AnswerMap;
  errors: Record<string, string>;
  onChange: (key: string, value: string | string[]) => void;
  allowCall?: boolean;
  onPickContact?: () => void;
  pickingContact?: boolean;
}) {
  return (
    <div className="dyn-grid">
      {fields.filter((f) => f.active !== false).map((f) => {
        if (!isVisible(f, values, isOtherJob)) return null;
        const span = f.type === 'section' || f.type === 'divider' || f.type === 'notice' ? 'full' : f.width;
        return (
          <div key={f.key} className={`dyn-cell dyn-${span}`}>
            <DynamicField
              field={f} values={values} errors={errors} onChange={onChange} allowCall={allowCall}
              onPickContact={onPickContact} pickingContact={pickingContact}
            />
          </div>
        );
      })}
    </div>
  );
}

export { isMulti };
