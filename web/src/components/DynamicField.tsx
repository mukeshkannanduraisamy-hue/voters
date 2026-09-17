import { useEffect, useMemo, useRef, useState } from 'react';
import { api, setMutationHandler } from '../lib/api';
import {
  Alert, Field, Input, PhoneInput, Select, Switch, Textarea,
} from './ui';
import { PartyGrid } from './spec-ui';
import type { AnswerMap, FieldOption, FormField } from '../lib/formSchema';
import { isMulti, isOthersSector, isVisible, OTHER_TEXT_FIELDS } from '../lib/formSchema';

/* ------------------------------------------------------------------ options */
/**
 * Master-bound option lists are fetched once per master key and shared by every
 * field that binds to it, so a form with five caste-bound dropdowns still makes
 * one request. Kept module-level (not React state) because the builder preview
 * and the live survey both mount these and would otherwise double-fetch.
 */
const optionCache = new Map<string, Promise<FieldOption[]>>();
const cachedOptionsByMaster = new Map<string, FieldOption[]>();

/** The master each "other text" field's paired select is bound to. */
const MASTER_BY_BASE_KEY: Record<string, string> = {
  job_id: 'job',
  caste_id: 'caste',
  education_id: 'education',
};

function isOtherLabel(opt?: FieldOption): boolean {
  if (!opt) return false;
  const l = (opt.label || '').trim().toLowerCase();
  const lTa = (opt.labelTa || '').trim();
  return l === 'other' || l.startsWith('other') || lTa === 'மற்றவை' || lTa.startsWith('மற்றவை');
}

/** Is `value` the "Other" option within a given (already-loaded) options list? */
function isOtherInList(value: string, options: FieldOption[]): boolean {
  if (!value) return false;
  const opt = options.find((o) => String(o.value) === String(value));
  if (opt) return isOtherLabel(opt);
  return value.toLowerCase() === 'other';
}

/** Is `value` the "Other" option for the given master, using the option cache? */
export function isOtherOption(master: string, value: string): boolean {
  return isOtherInList(value, cachedOptionsByMaster.get(master) ?? []);
}

/** Resolver passed into isVisible/pruneHidden/validateAnswers — keyed by the paired select's own field key. */
export function resolveOtherOption(baseKey: string, value: string): boolean {
  const master = MASTER_BY_BASE_KEY[baseKey];
  if (!master) return value.toLowerCase() === 'other';
  return isOtherOption(master, value);
}

export function fetchMasterOptions(master: string): Promise<FieldOption[]> {
  const existing = optionCache.get(master);
  if (existing) return existing;

  const p = api.get<FieldOption[]>(`/api/form-schema/options/${encodeURIComponent(master)}`)
    .then((opts) => {
      cachedOptionsByMaster.set(master, opts);
      return opts;
    })
    .catch((err) => {
      // Do not leave failed or unauthenticated responses poisoned in cache forever
      optionCache.delete(master);
      throw err;
    });

  optionCache.set(master, p);
  return p;
}

/** Drops the cache so a freshly edited master list shows up without a reload. */
export function clearOptionCache() {
  optionCache.clear();
  cachedOptionsByMaster.clear();
}

// Automatically clear the dropdown options cache whenever masters, categories or schemas are mutated
setMutationHandler((path) => {
  if (path.includes('/masters') || path.includes('/master-categories') || path.includes('/form-schema')) {
    clearOptionCache();
  }
});

export function useFieldOptions(field: FormField): FieldOption[] {
  const [remote, setRemote] = useState<FieldOption[]>([]);
  const master = field.source?.kind === 'master' ? field.source.master : undefined;

  useEffect(() => {
    let alive = true;
    if (master) {
      void fetchMasterOptions(master)
        .then((o) => { if (alive) setRemote(o); })
        .catch(() => { if (alive) setRemote([]); });
    }
    return () => { alive = false; };
  }, [master]);

  return field.source?.kind === 'master' ? remote : (field.source?.options ?? []);
}

/* ------------------------------------------------------------------- field */
export function DynamicField({
  field, values, errors, onChange, tamilFirst = true,
  onPickContact, pickingContact = false,
}: {
  field: FormField;
  values: AnswerMap;
  errors: Record<string, string>;
  onChange: (key: string, value: string | string[]) => void;
  tamilFirst?: boolean;
  onPickContact?: () => void;
  pickingContact?: boolean;
}) {
  const allOptions = useFieldOptions(field);
  if (field.source?.kind === 'master' && field.source.master && allOptions.length > 0) {
    cachedOptionsByMaster.set(field.source.master, allOptions);
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

  // Track the previous parent value to only trigger child clearing when parent actually changes
  const prevParentRef = useRef<string | null>(null);

  // Auto-populate parent if child already holds a valid value but parent was empty
  // (e.g. re-surveying a voter with existing sub-job)
  useEffect(() => {
    if (!parentKey || parentValue || allOptions.length === 0) return;
    const currentVal = String(values[field.key] ?? '');
    if (!currentVal) return;
    const match = allOptions.find((o) => String(o.value) === currentVal);
    if (match?.parent) {
      onChange(parentKey, String(match.parent));
      prevParentRef.current = String(match.parent);
    }
  }, [parentKey, parentValue, field.key, values, allOptions, onChange]);

  // When a parent field changes or is cleared, clear this child field only if its
  // current value is no longer valid for the newly selected parent.
  useEffect(() => {
    if (!parentKey) return;

    if (prevParentRef.current === null) {
      prevParentRef.current = parentValue;
      return;
    }

    if (prevParentRef.current === parentValue) return;

    // Parent changed!
    prevParentRef.current = parentValue;
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

  // Picking the "Others / Students / Homemakers" catch-all sector auto-selects
  // its own "Other" sub-job, so the custom note box appears immediately
  // instead of requiring a second explicit pick. Only fires while the
  // sub-job is genuinely empty on that sector — choosing a real sub-job
  // When Occupation sector is "Others", auto-select its "Other" sub-job
  // so the database binding receives a valid job_id, while the sub-job dropdown
  // is disabled and the text box directly opens.
  const isJobIdField = field.bind === 'job_id' || field.key === 'job_id';
  useEffect(() => {
    if (!isJobIdField || !isOthersSector(parentValue) || allOptions.length === 0) return;
    const otherOpt = allOptions.find((o) => isOthersSector(String(o.parent ?? '')) && isOtherInList(String(o.value), allOptions))
      || allOptions.find((o) => isOthersSector(String(o.parent ?? '')));
    if (otherOpt && String(values[field.key] ?? '') !== String(otherOpt.value)) {
      onChange(field.key, otherOpt.value);
    }
  }, [isJobIdField, parentValue, allOptions, field.key, values, onChange]);

  // A custom-note field (e.g. other_job_text, other_caste_text) stays visible
  // once it holds a value (so a legacy record survives even if the "Other"
  // option is later deactivated) — but that same rule must not let a stale
  // note survive the agent actively switching its paired select to something
  // else during this edit. Track the paired value by reference and clear the
  // note only on a real change, never on the initial seed, mirroring the
  // sector→sub-job cascade above.
  const otherTextBaseKey = OTHER_TEXT_FIELDS[field.key];
  const pairedValue = otherTextBaseKey ? String(values[otherTextBaseKey] ?? '') : '';
  const prevPairedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!otherTextBaseKey) return;

    if (prevPairedRef.current === null) {
      prevPairedRef.current = pairedValue;
      return;
    }

    if (prevPairedRef.current === pairedValue) return;

    prevPairedRef.current = pairedValue;
    const currentVal = String(values[field.key] ?? '');
    if (!currentVal) return;
    // Do not clear the custom job note while Occupation sector is "Others"
    if (field.key === 'other_job_text' && isOthersSector(String(values['job_sector'] ?? ''))) {
      return;
    }
    if (!resolveOtherOption(otherTextBaseKey, pairedValue)) onChange(field.key, '');
  }, [otherTextBaseKey, pairedValue, field.key, values, onChange]);

  if (field.active === false) return null;
  if (!isVisible(field, values, resolveOtherOption)) return null;

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
            onChange={(v) => onChange(field.key, v)}
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
        const isJobSubField = field.bind === 'job_id' || field.key === 'job_id';
        const isSectorOthers = isJobSubField && isOthersSector(parentValue);
        const isDisabled = isParentMissing || isSectorOthers;
        const placeholderText = isParentMissing
          ? 'Select occupation sector first… / முதலில் தொழில் துறையைத் தேர்ந்தெடுக்கவும்'
          : isSectorOthers
          ? 'Others / மற்றவை'
          : (placeholder ?? 'Select…');
        return (
          <Select
            value={str}
            disabled={isDisabled}
            invalid={!!err}
            onChange={(e) => onChange(field.key, e.target.value)}
          >
            <option value="">{placeholderText}</option>
            {options.map((o) => <option key={o.value} value={o.value}>{optLabel(o)}</option>)}
          </Select>
        );
      }

      case 'radio': {
        const isJobSubField = field.bind === 'job_id' || field.key === 'job_id';
        const isSectorOthers = isJobSubField && isOthersSector(parentValue);
        const isDisabled = isParentMissing || isSectorOthers;
        return (
          <div className="pill-group" role="radiogroup" aria-label={field.label}>
            {isParentMissing ? (
              <span className="t-sm t-muted">Select occupation sector first… / முதலில் தொழில் துறையைத் தேர்ந்தெடுக்கவும்</span>
            ) : isSectorOthers ? (
              <span className="t-sm t-muted">Others / மற்றவை</span>
            ) : (
              options.map((o) => (
                <button
                  key={o.value} type="button" role="radio" aria-checked={str === o.value}
                  className={`pill ${str === o.value ? 'on' : ''}`}
                  disabled={isDisabled}
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
      }

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
  fields, values, errors, onChange, onPickContact, pickingContact = false,
}: {
  fields: FormField[];
  values: AnswerMap;
  errors: Record<string, string>;
  onChange: (key: string, value: string | string[]) => void;
  onPickContact?: () => void;
  pickingContact?: boolean;
}) {
  return (
    <div className="dyn-grid">
      {fields.filter((f) => f.active !== false).map((f) => {
        if (!isVisible(f, values, resolveOtherOption)) return null;
        const span = f.type === 'section' || f.type === 'divider' || f.type === 'notice' ? 'full' : f.width;
        return (
          <div key={f.key} className={`dyn-cell dyn-${span}`}>
            <DynamicField
              field={f} values={values} errors={errors} onChange={onChange}
              onPickContact={onPickContact} pickingContact={pickingContact}
            />
          </div>
        );
      })}
    </div>
  );
}

export { isMulti };
