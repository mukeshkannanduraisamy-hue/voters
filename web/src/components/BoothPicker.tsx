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
  const [villages, setVillages] = useState<string[]>([]);
  const [q, setQ] = useState('');

  const villageOptions = useMemo(() => {
    if (!tree) return [];
    const sourceParts = localBodies.length
      ? tree.parts.filter((p) => localBodies.includes(p.local_body_name_ta))
      : tree.parts;

    const countMap = new Map<string, number>();
    for (const p of sourceParts) {
      const vList = p.villages && p.villages.length > 0
        ? p.villages
        : (p.main_village_ta ? [p.main_village_ta] : []);
      for (const v of vList) {
        if (!v) continue;
        countMap.set(v, (countMap.get(v) || 0) + 1);
      }
    }

    return Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ta'))
      .map(([name, count]) => ({
        value: name,
        label: name,
        sub: `${count} booth${count === 1 ? '' : 's'}`,
      }));
  }, [tree, localBodies]);

  const visibleBooths = useMemo(() => {
    if (!tree) return [];
    let list = tree.parts;

    if (localBodies.length) {
      list = list.filter((p) => localBodies.includes(p.local_body_name_ta));
    }

    if (villages.length) {
      list = list.filter((p) => {
        const vList = p.villages && p.villages.length > 0
          ? p.villages
          : (p.main_village_ta ? [p.main_village_ta] : []);
        return vList.some((v) => villages.includes(v));
      });
    }

    const needle = q.trim().toLowerCase();
    if (!needle) return list;

    return list.filter((p) => {
      if (String(p.part_no).includes(needle)) return true;
      if (p.local_body_name_ta.toLowerCase().includes(needle)) return true;
      if (p.main_village_ta && p.main_village_ta.toLowerCase().includes(needle)) return true;
      if (p.villages && p.villages.some((v) => v.toLowerCase().includes(needle))) return true;
      return false;
    });
  }, [tree, localBodies, villages, q]);

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
          <div className="t-xs t-muted t-bold" style={{ letterSpacing: '0.06em', whiteSpace: 'nowrap', minWidth: 95 }}>
            LOCAL BODIES
          </div>
          <MultiSelectDropdown
            options={localBodyOptions}
            selected={localBodies}
            onChange={setLocalBodies}
            placeholder="All local bodies — tap to filter"
            searchPlaceholder="Search local body…"
          />
        </div>

        <div className="picker-search row tight" style={{ borderTop: '1px solid var(--border)', flexWrap: 'nowrap' }}>
          <div className="t-xs t-muted t-bold" style={{ letterSpacing: '0.06em', whiteSpace: 'nowrap', minWidth: 95 }}>
            VILLAGES
          </div>
          <MultiSelectDropdown
            options={villageOptions}
            selected={villages}
            onChange={setVillages}
            placeholder="All villages — tap to filter"
            searchPlaceholder="Search village…"
          />
        </div>

        {/* ---- booth checkboxes ---- */}
        <div className="picker-search" style={{ borderTop: '1px solid var(--border)' }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search booth number, local body or village…" />
        </div>

        <div className="picker-list" style={{ maxHeight: 280 }}>
          {visibleBooths.length === 0 ? (
            <div className="t-subtle t-sm" style={{ padding: 'var(--sp-4)', textAlign: 'center' }}>
              No booths match this filter
            </div>
          ) : (
            visibleBooths.map((b) => {
              const bVillages = b.villages && b.villages.length > 0
                ? b.villages
                : (b.main_village_ta ? [b.main_village_ta] : []);
              return (
                <label key={b.part_no} className={`picker-opt ${selectedSet.has(b.part_no) ? 'on' : ''}`}>
                  <input type="checkbox" checked={selectedSet.has(b.part_no)} onChange={() => toggleBooth(b.part_no)} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="row tight" style={{ flexWrap: 'nowrap', alignItems: 'baseline' }}>
                      <strong>Booth {b.part_no}</strong>
                      <span className="ta t-subtle t-xs t-truncate"> · {b.local_body_name_ta}</span>
                    </div>
                    {bVillages.length > 0 && (
                      <div className="ta t-muted t-xs t-truncate" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                        📍 {bVillages.join(' · ')}
                      </div>
                    )}
                  </div>
                  <LocalBodyBadge type={b.local_body_type} />
                  <span className="meta tabnum">{fmt(b.voter_count)}</span>
                </label>
              );
            })
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
