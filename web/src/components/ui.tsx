import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
  type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { Icon, type IconName } from './icons';

/* ============================== formatting =============================== */
export const fmt = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : n.toLocaleString('en-IN');

export const fmtPct = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${n}%`;

export function fmtDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return withTime ? `${date}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : date;
}

export function fmtRelative(iso: string | null | undefined) {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return 'Just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return fmtDate(iso);
}

export const initials = (name: string | null | undefined, fallback = '?') => {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '')).toUpperCase();
};

/** Progress colour band — same thresholds everywhere so the UI reads consistently. */
export const progressTone = (pct: number) => (pct >= 75 ? 'ok' : pct >= 40 ? 'warn' : 'bad');

/* ================================ toasts ================================= */
interface Toast { id: number; kind: 'ok' | 'bad' | 'warn' | 'info'; title: string; msg?: string }
interface ToastApi {
  push: (kind: Toast['kind'], title: string, msg?: string) => void;
  ok: (title: string, msg?: string) => void;
  bad: (title: string, msg?: string) => void;
}
const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((kind: Toast['kind'], title: string, msg?: string) => {
    const id = ++seq.current;
    setItems((cur) => [...cur, { id, kind, title, msg }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 4800);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    push,
    ok: (t, m) => push('ok', t, m),
    bad: (t, m) => push('bad', t, m),
  }), [push]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <Icon name={t.kind === 'ok' ? 'check-circle' : t.kind === 'bad' ? 'alert' : 'info'} size={17} />
            <div style={{ minWidth: 0 }}>
              <div className="toast-title">{t.title}</div>
              {t.msg && <div className="toast-msg">{t.msg}</div>}
            </div>
            <button onClick={() => setItems((c) => c.filter((x) => x.id !== t.id))} aria-label="Dismiss">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/* ================================ layout ================================= */
export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & Record<string, unknown>) {
  return <div className={`card ${className}`} {...rest}>{children}</div>;
}

export function CardHead({ title, sub, actions, icon }: {
  title: string; sub?: string; actions?: ReactNode; icon?: IconName;
}) {
  return (
    <div className="card-head">
      {icon && <Icon name={icon} size={17} className="t-muted" />}
      <div style={{ minWidth: 0 }}>
        <h3>{title}</h3>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="card-head-actions">{actions}</div>}
    </div>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div style={{ minWidth: 0 }}>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </div>
  );
}

/* ================================ buttons ================================ */
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger' | 'danger-soft';

export function Button({
  children, variant = 'secondary', size, icon, loading, block, className = '', ...rest
}: {
  children?: ReactNode; variant?: BtnVariant; size?: 'sm' | 'lg';
  icon?: IconName; loading?: boolean; block?: boolean; className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${block ? 'btn-block' : ''} ${className}`}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading ? <span className="spinner" /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  );
}

/* ================================= forms ================================= */
/**
 * Carries the Field's generated id down to whichever control it wraps, so the
 * <label> is always associated with its input without every call site having to
 * invent an id. Controls nested inside decorations (e.g. the +91 prefix box)
 * still receive it, which a cloneElement approach could not reach.
 */
const FieldIdCtx = createContext<string | undefined>(undefined);

export function Field({ label, required, hint, error, children, htmlFor }: {
  label?: string; required?: boolean; hint?: string; error?: string;
  children: ReactNode; htmlFor?: string;
}) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  return (
    <div className="field">
      {label && (
        <label className="label" htmlFor={id}>
          {label}{required && <span className="req">*</span>}
        </label>
      )}
      <FieldIdCtx.Provider value={id}>{children}</FieldIdCtx.Provider>
      {error ? <span className="error-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/** Consumes the field id once, so a second control in the same Field is untouched. */
function useFieldId(explicit: string | undefined) {
  const fromField = useContext(FieldIdCtx);
  return explicit ?? fromField;
}

export function Input({ invalid, className = '', ...rest }: { invalid?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useFieldId(rest.id);
  return <input {...rest} id={id} className={`input ${invalid ? 'invalid' : ''} ${className}`} />;
}

export function Select({ invalid, className = '', children, ...rest }: { invalid?: boolean } & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useFieldId(rest.id);
  return <select {...rest} id={id} className={`select ${invalid ? 'invalid' : ''} ${className}`}>{children}</select>;
}

export function Textarea({ invalid, className = '', ...rest }: { invalid?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useFieldId(rest.id);
  return <textarea {...rest} id={id} className={`textarea ${invalid ? 'invalid' : ''} ${className}`} />;
}

/**
 * The +91-prefixed mobile input. Wrapping it here (instead of hand-rolling the
 * markup at five call sites) means it always picks up its Field's label id.
 */
export function PhoneInput({ invalid, value, onChange, placeholder = '9876543210', ...rest }: {
  invalid?: boolean; value: string; onChange: (digits: string) => void; placeholder?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const id = useFieldId(rest.id);
  return (
    <div className={`input-prefix ${invalid ? 'invalid' : ''}`}>
      <span>+91</span>
      <input
        {...rest}
        id={id}
        className="input"
        type="tel"
        inputMode="numeric"
        maxLength={10}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
      />
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, full }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; full?: boolean;
}) {
  return (
    <div className={`segmented ${full ? 'full' : ''}`} role="group">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={value === o.value ? 'on' : ''}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" />
      {label && <span className="t-sm t-semi">{label}</span>}
    </label>
  );
}

/* ================================ display ================================ */
export function Badge({ tone = 'muted', children, dot }: {
  tone?: 'ok' | 'warn' | 'bad' | 'info' | 'brand' | 'muted'; children: ReactNode; dot?: boolean;
}) {
  return <span className={`badge badge-${tone}`}>{dot && <span className="dot" />}{children}</span>;
}

export function RolePill({ role }: { role: string }) {
  const short = role === 'A1_SUPER_ADMIN' ? 'A1' : role === 'A2_ADMIN' ? 'A2' : 'A3';
  const label = role === 'A1_SUPER_ADMIN' ? 'Super Admin' : role === 'A2_ADMIN' ? 'Sub Admin' : 'Field Agent';
  return <span className={`role-pill role-${short}`}>{short} · {label}</span>;
}

export function Progress({ value, tone }: { value: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const t = tone ?? progressTone(value);
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-bar ${t}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function ProgressRow({ value }: { value: number }) {
  return (
    <div className="progress-row">
      <Progress value={value} />
      <span className="progress-pct">{value}%</span>
    </div>
  );
}

export function Ring({ value, size = 108, stroke = 9 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const tone = progressTone(value);
  const color = tone === 'ok' ? 'var(--ok-500)' : tone === 'warn' ? 'var(--warn-500)' : 'var(--bad-500)';
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: `0 0 ${size}px` }}>
      <svg width={size} height={size} className="ring" aria-hidden>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="ring-fill" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          stroke={color}
          strokeDasharray={circ}
          strokeDashoffset={circ - (Math.min(100, Math.max(0, value)) / 100) * circ}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
        fontSize: size > 90 ? 'var(--fs-xl)' : 'var(--fs-md)', fontWeight: 750,
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
      }}>
        {value}%
      </div>
    </div>
  );
}

export function Stat({ label, value, icon, accent = 'var(--brand-500)', accentSoft = 'var(--brand-50)', foot }: {
  label: string; value: ReactNode; icon: IconName; accent?: string; accentSoft?: string; foot?: ReactNode;
}) {
  return (
    <div className="stat" style={{ ['--accent' as string]: accent, ['--accent-soft' as string]: accentSoft }}>
      <div className="stat-top">
        <div className="stat-icon"><Icon name={icon} size={18} /></div>
        <div className="stat-label">{label}</div>
      </div>
      <div className="stat-value">{value}</div>
      {foot && <div className="stat-foot">{foot}</div>}
    </div>
  );
}

export function Empty({ icon = 'inbox', title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={24} /></div>
      <h4>{title}</h4>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Alert({ tone = 'info', children }: { tone?: 'ok' | 'bad' | 'warn' | 'info'; children: ReactNode }) {
  const icon: IconName = tone === 'ok' ? 'check-circle' : tone === 'bad' ? 'alert' : tone === 'warn' ? 'alert' : 'info';
  return (
    <div className={`alert alert-${tone}`} role={tone === 'bad' ? 'alert' : undefined}>
      <Icon name={icon} size={17} />
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', className = '' }: { h?: number; w?: number | string; className?: string }) {
  return <div className={`skeleton ${className}`} style={{ height: h, width: w }} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ padding: 'var(--sp-4)' }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="row" style={{ marginBottom: 12, gap: 16 }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} h={14} w={c === 0 ? 150 : `${Math.round(60 / cols)}%`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ================================= modal ================================= */
export function Modal({ open, title, icon, onClose, children, footer, wide }: {
  open: boolean; title: string; icon?: IconName; onClose: () => void;
  children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          {icon && <Icon name={icon} size={18} className="t-muted" />}
          <h3>{title}</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel, busy }: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string;
  danger?: boolean; onConfirm: () => void; onCancel: () => void; busy?: boolean;
}) {
  return (
    <Modal
      open={open} title={title} icon={danger ? 'alert' : 'info'} onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="t-muted">{message}</div>
    </Modal>
  );
}

/* =============================== pagination ============================== */
export function Pager({ page, pages, total, pageSize, onPage }: {
  page: number; pages: number; total: number; pageSize: number; onPage: (p: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  // A compact window around the current page, always including first & last.
  const nums: (number | '…')[] = [];
  const add = (n: number | '…') => { if (nums[nums.length - 1] !== n) nums.push(n); };
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) add(i);
    else add('…');
  }

  return (
    <div className="pager">
      <span>Showing <strong className="tabnum">{fmt(from)}–{fmt(to)}</strong> of <strong className="tabnum">{fmt(total)}</strong></span>
      <div className="pager-btns">
        <button className="pager-btn" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <Icon name="chevron-left" size={14} />
        </button>
        {nums.map((n, i) =>
          n === '…'
            ? <span key={`e${i}`} className="t-subtle" style={{ padding: '0 4px' }}>…</span>
            : <button key={n} className={`pager-btn ${n === page ? 'on' : ''}`} onClick={() => onPage(n)}>{n}</button>
        )}
        <button className="pager-btn" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
          <Icon name="chevron-right" size={14} />
        </button>
      </div>
    </div>
  );
}

/* ============================ multi-select picker ======================== */
export function MultiPicker({ options, selected, onChange, placeholder = 'Search…', emptyText = 'Nothing to choose from', meta }: {
  options: { id: number; label: string; sub?: string }[];
  selected: number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
  emptyText?: string;
  meta?: (id: number) => string | undefined;
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle) || (o.sub ?? '').toLowerCase().includes(needle));
  }, [options, q]);

  const set = new Set(selected);
  const toggle = (id: number) =>
    onChange(set.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const allShownSelected = filtered.length > 0 && filtered.every((o) => set.has(o.id));

  return (
    <div className="picker">
      <div className="picker-search">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      </div>
      <div className="picker-list">
        {filtered.length === 0 ? (
          <div className="t-subtle t-sm" style={{ padding: 'var(--sp-4)', textAlign: 'center' }}>{emptyText}</div>
        ) : (
          filtered.map((o) => (
            <label key={o.id} className={`picker-opt ${set.has(o.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={set.has(o.id)} onChange={() => toggle(o.id)} />
              <span className="t-truncate">
                <span className="ta">{o.label}</span>
                {o.sub && <span className="t-subtle t-xs"> · {o.sub}</span>}
              </span>
              {meta?.(o.id) && <span className="meta">{meta(o.id)}</span>}
            </label>
          ))
        )}
      </div>
      <div className="picker-foot">
        <span>{selected.length} selected</span>
        <button
          type="button" className="btn btn-ghost btn-sm"
          onClick={() => {
            const ids = filtered.map((o) => o.id);
            onChange(allShownSelected ? selected.filter((x) => !ids.includes(x)) : [...new Set([...selected, ...ids])]);
          }}
          disabled={filtered.length === 0}
        >
          {allShownSelected ? 'Clear shown' : 'Select all shown'}
        </button>
      </div>
    </div>
  );
}

/**
 * A closed-by-default multi-select: a single button showing a summary
 * ("All", "3 selected", or the one chosen label), opening a checkbox panel on
 * click. Unlike `MultiPicker` (an always-expanded box, better for a dedicated
 * field of its own), this is meant to sit inline as a compact filter control —
 * e.g. "Local bodies" next to other filters in a toolbar.
 */
export function MultiSelectDropdown({ options, selected, onChange, placeholder = 'All', searchPlaceholder = 'Search…' }: {
  options: { value: string; label: string; sub?: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle) || (o.sub ?? '').toLowerCase().includes(needle));
  }, [options, q]);

  const set = new Set(selected);
  const toggle = (value: string) =>
    onChange(set.has(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  const summary = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
      : `${selected.length} selected`;

  return (
    <div className="ms-dropdown" ref={ref}>
      <button type="button" className="ms-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox">
        <span className="t-truncate">{summary}</span>
        <Icon name="chevron-down" size={14} />
      </button>

      {open && (
        <div className="ms-panel" role="listbox">
          <div className="picker-search">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} autoFocus />
          </div>
          <div className="picker-list">
            {filtered.length === 0 ? (
              <div className="t-subtle t-sm" style={{ padding: 'var(--sp-4)', textAlign: 'center' }}>No matches</div>
            ) : (
              filtered.map((o) => (
                <label key={o.value} className={`picker-opt ${set.has(o.value) ? 'on' : ''}`}>
                  <input type="checkbox" checked={set.has(o.value)} onChange={() => toggle(o.value)} />
                  <span className="t-truncate">
                    <span className="ta">{o.label}</span>
                    {o.sub && <span className="t-subtle t-xs"> · {o.sub}</span>}
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="picker-foot">
            <span>{selected.length} of {options.length} selected</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])} disabled={!selected.length}>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================== small charts ============================= */
export function TrendBars({ data, height = 130 }: { data: { day: string; count: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="bars" style={{ height }}>
      {data.map((d) => (
        <div key={d.day} className="bars-col" title={`${d.day}: ${fmt(d.count)} surveys`}>
          <div className="bars-bar" style={{ height: `${Math.max(3, (d.count / max) * (height - 22))}px` }} />
          <div className="bars-label">{new Date(d.day + 'T00:00:00').getDate()}</div>
        </div>
      ))}
    </div>
  );
}

const SERIES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];

export function HBars({ data, limit = 8, showPct }: {
  data: { label: string; count: number }[]; limit?: number; showPct?: boolean;
}) {
  const shown = data.slice(0, limit);
  const max = Math.max(1, ...shown.map((d) => d.count));
  const total = data.reduce((a, d) => a + d.count, 0);

  if (!data.length) return <Empty icon="chart" title="No data yet">Records will appear here once surveys are submitted.</Empty>;

  return (
    <div className="stack tight">
      {shown.map((d, i) => (
        <div key={d.label} className="hbar-row">
          <div className="hbar-name ta" title={d.label}>{d.label}</div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(d.count / max) * 100}%`, background: SERIES[i % SERIES.length] }} />
          </div>
          <div className="hbar-val">
            {fmt(d.count)}
            {showPct && total > 0 && <span className="t-subtle t-xs"> · {Math.round((d.count / total) * 100)}%</span>}
          </div>
        </div>
      ))}
      {data.length > limit && (
        <div className="t-subtle t-xs mt-2">+ {data.length - limit} more categories</div>
      )}
    </div>
  );
}

export function Donut({ data, size = 150 }: { data: { label: string; count: number }[]; size?: number }) {
  const total = data.reduce((a, d) => a + d.count, 0);
  if (!total) return <Empty icon="chart" title="No data yet" />;

  const stroke = 22;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="row" style={{ gap: 'var(--sp-5)', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size, flex: `0 0 ${size}px` }}>
        <svg width={size} height={size} className="ring" aria-hidden>
          {data.map((d, i) => {
            const len = (d.count / total) * circ;
            const el = (
              <circle
                key={d.label} cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={SERIES[i % SERIES.length]} strokeWidth={stroke}
                strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 750, fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</div>
            <div className="t-xs t-subtle">total</div>
          </div>
        </div>
      </div>
      <div className="stack tight" style={{ flex: 1, minWidth: 0 }}>
        {data.map((d, i) => (
          <div key={d.label} className="row tight" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <span className="row tight" style={{ minWidth: 0, flexWrap: 'nowrap' }}>
              <span className="legend-swatch" style={{ background: SERIES[i % SERIES.length], flex: '0 0 10px' }} />
              <span className="t-sm ta t-truncate">{d.label}</span>
            </span>
            <span className="t-sm t-semi tabnum t-nowrap">
              {fmt(d.count)} <span className="t-subtle t-xs">{Math.round((d.count / total) * 100)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
