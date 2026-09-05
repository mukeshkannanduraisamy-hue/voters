import { useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import { Button } from './ui';
import type { LocalBodyType, LocalBodyTypeOrMixed } from '../lib/types';

/* ---------------------------- local body badge --------------------------- */
export function LocalBodyBadge({ type }: { type: LocalBodyType | LocalBodyTypeOrMixed }) {
  if (type === 'MIXED') {
    return <span className="lb-badge lb-mixed" title="Booths of both types share this name">Mixed</span>;
  }
  const town = type === 'TOWN_PANCHAYAT';
  return (
    <span className={`lb-badge ${town ? 'lb-town' : 'lb-village'}`}>
      {town ? 'Town Panchayat' : 'Village Panchayat'}
    </span>
  );
}

/* ------------------------------ party visuals ---------------------------- */
export interface PartyOption {
  id: number;
  name: string;
  name_ta: string | null;
  party_code: string;
  color_code: string;
  symbol_img: string | null;
}

/**
 * The survey's political-leaning control: a touch grid of emblem cards rather
 * than a dropdown, because an agent on a doorstep recognises the symbol far
 * faster than the party's name.
 */
export function PartyGrid({ parties, value, onChange }: {
  parties: PartyOption[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  return (
    <div className="party-grid" role="radiogroup" aria-label="Political party">
      {parties.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={value === p.id}
          className={`party-card ${value === p.id ? 'on' : ''}`}
          style={{ ['--party-color' as string]: p.color_code }}
          onClick={() => onChange(p.id)}
          title={p.name_ta ?? p.name}
        >
          <PartySymbol party={p} size={44} />
          <span className="party-code">{p.party_code}</span>
          {p.name_ta && <span className="party-name-ta ta">{p.name_ta}</span>}
        </button>
      ))}
    </div>
  );
}

/** Renders the stored Base64 emblem, or a coloured initial when none is set. */
export function PartySymbol({ party, size = 32 }: {
  party: { name: string; party_code: string; color_code: string; symbol_img: string | null };
  size?: number;
}) {
  if (party.symbol_img) {
    return (
      <img
        className="party-symbol"
        src={party.symbol_img}
        alt={`${party.name} symbol`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="party-symbol placeholder"
      style={{ width: size, height: size, background: party.color_code, color: '#fff', fontWeight: 750, fontSize: size * 0.36 }}
      aria-label={`${party.name} symbol placeholder`}
    >
      {party.party_code.slice(0, 2)}
    </span>
  );
}

export function PartyChip({ party }: {
  party: { name: string; party_code?: string | null; color_code?: string | null; symbol_img?: string | null };
}) {
  return (
    <span className="party-chip" style={{ ['--party-color' as string]: party.color_code ?? 'var(--brand-500)' }}>
      {party.symbol_img
        ? <img src={party.symbol_img} alt="" />
        : <span className="dot" style={{ width: 8, height: 8 }} />}
      {party.party_code ?? party.name}
    </span>
  );
}

/* ---------------------------- image uploader ----------------------------- */
const ACCEPTED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Reads a picked file into a Base64 data URL entirely in the browser, so the
 * emblem travels with the record and needs no file server or CDN.
 */
export function ImageUploader({ value, onChange, label = 'Party picture' }: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState<{ name: string; size: string } | null>(null);

  const accept = (file: File) => {
    setError('');
    if (!ACCEPTED.includes(file.type)) {
      setError('Use a PNG, JPG, GIF, WebP or SVG image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 2MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange(String(reader.result));
      // A small SVG is a few hundred bytes; rounding those to "0 KB" reads as an error.
      setMeta({
        name: file.name,
        size: file.size < 1024 ? `${file.size} B` : `${Math.round(file.size / 1024)} KB`,
      });
    };
    reader.onerror = () => setError('Could not read that file. Try another.');
    reader.readAsDataURL(file);
  };

  const clear = () => {
    onChange(null);
    setMeta(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="stack tight">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hide"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) accept(f); }}
      />

      {value ? (
        <div className="dropzone-preview">
          <img src={value} alt="Party symbol preview" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="t-sm t-semi t-truncate">{meta?.name ?? 'Current symbol'}</div>
            <div className="t-xs t-muted">
              {meta ? `${meta.size} · ` : ''}
              <span style={{ color: 'var(--ok-600)' }}>✓ Base64 image ready</span>
            </div>
          </div>
          <div className="row tight" style={{ flexWrap: 'nowrap' }}>
            <Button size="sm" icon="upload" onClick={() => inputRef.current?.click()}>Replace</Button>
            <Button size="sm" variant="danger-soft" icon="x" onClick={clear} aria-label="Remove picture" />
          </div>
        </div>
      ) : (
        <div
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) accept(f);
          }}
        >
          <Icon name="image" size={26} />
          <div className="t-sm t-semi">{label} — click or drop an image</div>
          <div className="t-xs t-subtle">PNG, JPG, SVG or WebP · up to 2MB · stored as Base64</div>
        </div>
      )}

      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

/* --------------------------- sortable table head ------------------------- */
export function SortHeader({ label, column, sortBy, sortDir, onSort }: {
  label: ReactNode;
  column: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onSort: (column: string) => void;
}) {
  const active = sortBy === column;
  return (
    <button
      type="button"
      className={`th-sort ${active ? 'active' : ''}`}
      onClick={() => onSort(column)}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      <span className="dir">{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  );
}
