import { useMemo, useState } from 'react';
import { Button, Input, MultiSelectDropdown, fmt } from './ui';
import { LocalBodyBadge } from './spec-ui';
import type { BoothTree } from '../lib/types';

/**
 * Jurisdiction assignment: pick local bodies to narrow the list, then tick the
 * booths themselves. "Auto-Select All" exists because a Super Admin assigning a
 * constituency-wide account would otherwise tick 318 boxes by hand.
 */
export function BoothPicker({ tree, selected, onChange }: {
  tree: BoothTree | null;
  selected: number[];
  onChange: (partNos: number[]) => void;
}) {
  const [localBodies, setLocalBodies] = useState<string[]>([]);
  const [q, setQ] = useState('');

  const visibleBooths = useMemo(() => {
    if (!tree) return [];
    const byBody = localBodies.length
      ? tree.parts.filter((p) => localBodies.includes(p.local_body_name_ta))
      : tree.parts;
    const needle = q.trim().toLowerCase();
    if (!needle) return byBody;
    return byBody.filter(
      (p) => String(p.part_no).includes(needle) || p.local_body_name_ta.toLowerCase().includes(needle)
    );
  }, [tree, localBodies, q]);

  const selectedSet = new Set(selected);
  const allVisibleSelected = visibleBooths.length > 0 && visibleBooths.every((b) => selectedSet.has(b.part_no));

  const toggleBooth = (partNo: number) =>
    onChange(selectedSet.has(partNo) ? selected.filter((p) => p !== partNo) : [...selected, partNo]);

  if (!tree) return <div className="t-sm t-muted">Loading booths…</div>;
  if (!tree.parts.length) {
    return <div className="t-sm t-muted">You have no booths assigned, so you cannot assign any.</div>;
  }

  const selectedVoters = tree.parts
    .filter((p) => selectedSet.has(p.part_no))
    .reduce((a, p) => a + p.voter_count, 0);

  const localBodyOptions = tree.localBodies.map((lb) => ({
    value: lb.name,
    label: lb.name,
    sub: `${lb.part_count} booth${lb.part_count === 1 ? '' : 's'}`,
  }));

  return (
    <div className="stack tight">
      <div className="row tight">
        <Button
          size="sm" variant="primary" icon="check"
          onClick={() => onChange(tree.parts.map((p) => p.part_no))}
        >
          ⚡ Auto-Select All ({tree.parts.length})
        </Button>
        <Button size="sm" icon="x" onClick={() => onChange([])} disabled={!selected.length}>Clear</Button>
        <span className="spacer" />
        <span className="badge badge-brand">
          {fmt(selected.length)} booth{selected.length === 1 ? '' : 's'} · {fmt(selectedVoters)} electors
        </span>
      </div>

      <div className="picker">
        <div className="picker-search row tight" style={{ flexWrap: 'nowrap' }}>
          <div className="t-xs t-muted t-bold" style={{ letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
            LOCAL BODIES
          </div>
          <MultiSelectDropdown
            options={localBodyOptions}
            selected={localBodies}
            onChange={setLocalBodies}
            placeholder="All local bodies — tap to filter booths"
            searchPlaceholder="Search local body…"
          />
        </div>

        {/* ---- booth checkboxes ---- */}
        <div className="picker-search" style={{ borderTop: '1px solid var(--border)' }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search booth number or local body…" />
        </div>

        <div className="picker-list" style={{ maxHeight: 260 }}>
          {visibleBooths.length === 0 ? (
            <div className="t-subtle t-sm" style={{ padding: 'var(--sp-4)', textAlign: 'center' }}>
              No booths match this filter
            </div>
          ) : (
            visibleBooths.map((b) => (
              <label key={b.part_no} className={`picker-opt ${selectedSet.has(b.part_no) ? 'on' : ''}`}>
                <input type="checkbox" checked={selectedSet.has(b.part_no)} onChange={() => toggleBooth(b.part_no)} />
                <span className="t-truncate" style={{ minWidth: 0, flex: 1 }}>
                  <strong>Booth {b.part_no}</strong>
                  <span className="ta t-subtle t-xs"> · {b.local_body_name_ta}</span>
                </span>
                <LocalBodyBadge type={b.local_body_type} />
                <span className="meta tabnum">{fmt(b.voter_count)}</span>
              </label>
            ))
          )}
        </div>

        <div className="picker-foot">
          <span>{visibleBooths.length} shown · {selected.length} selected</span>
          <button
            type="button" className="btn btn-ghost btn-sm"
            disabled={!visibleBooths.length}
            onClick={() => {
              const ids = visibleBooths.map((b) => b.part_no);
              onChange(allVisibleSelected ? selected.filter((p) => !ids.includes(p)) : [...new Set([...selected, ...ids])]);
            }}
          >
            {allVisibleSelected ? 'Clear shown' : 'Select all shown'}
          </button>
        </div>
      </div>
    </div>
  );
}
