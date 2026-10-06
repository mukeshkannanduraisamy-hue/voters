import { useEffect, useMemo, useState, useRef } from 'react';
import { Button, Input, MultiSelectDropdown, fmt } from './ui';
import { LocalBodyBadge } from './spec-ui';
import { Icon } from './icons';
import type { BoothTree } from '../lib/types';

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={ariaLabel}
    />
  );
}

/**
 * Jurisdiction assignment:
 * Hierarchy: LOCAL BODIES -> Booth -> then select the village(s).
 */
export function BoothPicker({
  tree,
  selected,
  onChange,
  selectedVillages: propVillages,
  onVillagesChange,
}: {
  tree: BoothTree | null;
  selected: number[];
  onChange: (partNos: number[]) => void;
  selectedVillages?: string[];
  onVillagesChange?: (villages: string[]) => void;
}) {
  // 1. LOCAL BODIES filter
  const [localBodies, setLocalBodies] = useState<string[]>([]);
  // 2. BOOTH filter
  const [boothFilter, setBoothFilter] = useState<string[]>([]);
  // 3. Search query
  const [q, setQ] = useState('');

  // Expand / collapse state for booths: set of part_no
  const [expandedBooths, setExpandedBooths] = useState<Set<number>>(new Set());
  const [allExpanded, setAllExpanded] = useState<boolean>(true);

  // Selected village keys: Set of `${part_no}:${village_name}`
  const [villageKeySet, setVillageKeySet] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (!tree) return s;
    const selectedSet = new Set(selected);
    for (const b of tree.parts) {
      if (selectedSet.has(b.part_no)) {
        const vList = b.village_items?.length
          ? b.village_items.map((v) => v.name)
          : (b.villages?.length ? b.villages : (b.main_village_ta ? [b.main_village_ta] : []));
        for (const v of vList) {
          s.add(`${b.part_no}:${v}`);
        }
      }
    }
    return s;
  });

  // Sync villageKeySet if selected prop changes externally
  const prevSelectedRef = useRef<number[]>(selected);
  useEffect(() => {
    if (prevSelectedRef.current === selected) return;
    prevSelectedRef.current = selected;

    const selectedSet = new Set(selected);
    setVillageKeySet(() => {
      const next = new Set<string>();
      if (!tree) return next;
      for (const b of tree.parts) {
        if (selectedSet.has(b.part_no)) {
          const vList = b.village_items?.length
            ? b.village_items.map((v) => v.name)
            : (b.villages?.length ? b.villages : (b.main_village_ta ? [b.main_village_ta] : []));
          for (const v of vList) {
            next.add(`${b.part_no}:${v}`);
          }
        }
      }
      return next;
    });
  }, [selected, tree]);

  // Options for LOCAL BODIES filter dropdown
  const localBodyOptions = useMemo(() => {
    if (!tree) return [];
    return tree.localBodies.map((lb) => ({
      value: lb.name,
      label: lb.name,
      sub: `${lb.part_count} booth${lb.part_count === 1 ? '' : 's'}`,
    }));
  }, [tree]);

  // Options for BOOTHS filter dropdown (dynamically scoped to selected local bodies!)
  const boothOptions = useMemo(() => {
    if (!tree) return [];
    const pool = localBodies.length > 0
      ? tree.parts.filter((p) => localBodies.includes(p.local_body_name_ta))
      : tree.parts;

    return pool.map((b) => ({
      value: String(b.part_no),
      label: `Booth ${b.part_no} · ${b.local_body_name_ta}`,
      sub: `${b.villages?.length || 1} village${(b.villages?.length || 1) === 1 ? '' : 's'} · ${fmt(b.voter_count)} electors`,
    }));
  }, [tree, localBodies]);

  // Clear booth filter if it no longer belongs to the selected local bodies
  useEffect(() => {
    if (!localBodies.length || !boothFilter.length || !tree) return;
    const validPartNos = new Set(
      tree.parts
        .filter((p) => localBodies.includes(p.local_body_name_ta))
        .map((p) => String(p.part_no))
    );
    const cleaned = boothFilter.filter((bp) => validPartNos.has(bp));
    if (cleaned.length !== boothFilter.length) {
      setBoothFilter(cleaned);
    }
  }, [localBodies, boothFilter, tree]);

  // Filtered booths shown in the picker list
  const visibleBooths = useMemo(() => {
    if (!tree) return [];
    let list = tree.parts;

    if (localBodies.length > 0) {
      list = list.filter((p) => localBodies.includes(p.local_body_name_ta));
    }

    if (boothFilter.length > 0) {
      const bfNums = boothFilter.map(Number);
      list = list.filter((p) => bfNums.includes(p.part_no));
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
  }, [tree, localBodies, boothFilter, q]);

  // Toggle individual village
  const toggleVillage = (partNo: number, villageName: string) => {
    const key = `${partNo}:${villageName}`;
    const nextKeys = new Set(villageKeySet);
    if (nextKeys.has(key)) {
      nextKeys.delete(key);
    } else {
      nextKeys.add(key);
    }
    setVillageKeySet(nextKeys);

    // Recompute if partNo has at least one village in nextKeys
    const booth = tree?.parts.find((p) => p.part_no === partNo);
    const vList = booth?.village_items?.length
      ? booth.village_items.map((v) => v.name)
      : (booth?.villages?.length ? booth.villages : (booth?.main_village_ta ? [booth.main_village_ta] : []));
    const hasAny = vList?.some((v) => nextKeys.has(`${partNo}:${v}`));

    let nextSelected: number[];
    if (hasAny) {
      nextSelected = selected.includes(partNo) ? selected : [...selected, partNo];
    } else {
      nextSelected = selected.filter((p) => p !== partNo);
    }
    onChange(nextSelected);

    if (onVillagesChange) {
      const allSelectedVillageNames = [...new Set([...nextKeys].map((k) => k.split(':')[1]))];
      onVillagesChange(allSelectedVillageNames);
    }
  };

  // Toggle entire booth (all villages under it)
  const toggleBooth = (partNo: number) => {
    const booth = tree?.parts.find((p) => p.part_no === partNo);
    if (!booth) return;
    const vList = booth.village_items?.length
      ? booth.village_items.map((v) => v.name)
      : (booth.villages?.length ? booth.villages : (booth.main_village_ta ? [booth.main_village_ta] : []));

    const allKeys = vList.map((v) => `${partNo}:${v}`);
    const areAllChecked = allKeys.every((k) => villageKeySet.has(k));

    const nextKeys = new Set(villageKeySet);
    let nextSelected: number[];

    if (areAllChecked) {
      for (const k of allKeys) nextKeys.delete(k);
      nextSelected = selected.filter((p) => p !== partNo);
    } else {
      for (const k of allKeys) nextKeys.add(k);
      nextSelected = selected.includes(partNo) ? selected : [...selected, partNo];
    }

    setVillageKeySet(nextKeys);
    onChange(nextSelected);

    if (onVillagesChange) {
      const allSelectedVillageNames = [...new Set([...nextKeys].map((k) => k.split(':')[1]))];
      onVillagesChange(allSelectedVillageNames);
    }
  };

  // Select all shown
  const handleSelectAllShown = () => {
    const nextKeys = new Set(villageKeySet);
    const shownIds = visibleBooths.map((b) => b.part_no);
    for (const b of visibleBooths) {
      const vList = b.village_items?.length
        ? b.village_items.map((v) => v.name)
        : (b.villages?.length ? b.villages : (b.main_village_ta ? [b.main_village_ta] : []));
      for (const v of vList) {
        nextKeys.add(`${b.part_no}:${v}`);
      }
    }
    setVillageKeySet(nextKeys);
    const nextSelected = [...new Set([...selected, ...shownIds])];
    onChange(nextSelected);
    if (onVillagesChange) {
      const allSelectedVillageNames = [...new Set([...nextKeys].map((k) => k.split(':')[1]))];
      onVillagesChange(allSelectedVillageNames);
    }
  };

  // Clear shown
  const handleClearShown = () => {
    const nextKeys = new Set(villageKeySet);
    const shownIds = visibleBooths.map((b) => b.part_no);
    for (const b of visibleBooths) {
      const vList = b.village_items?.length
        ? b.village_items.map((v) => v.name)
        : (b.villages?.length ? b.villages : (b.main_village_ta ? [b.main_village_ta] : []));
      for (const v of vList) {
        nextKeys.delete(`${b.part_no}:${v}`);
      }
    }
    setVillageKeySet(nextKeys);
    const nextSelected = selected.filter((p) => !shownIds.includes(p));
    onChange(nextSelected);
    if (onVillagesChange) {
      const allSelectedVillageNames = [...new Set([...nextKeys].map((k) => k.split(':')[1]))];
      onVillagesChange(allSelectedVillageNames);
    }
  };

  // Auto-Select All across entire tree
  const handleAutoSelectAll = () => {
    if (!tree) return;
    const nextKeys = new Set<string>();
    const nextParts: number[] = [];
    for (const b of tree.parts) {
      nextParts.push(b.part_no);
      const vList = b.village_items?.length
        ? b.village_items.map((v) => v.name)
        : (b.villages?.length ? b.villages : (b.main_village_ta ? [b.main_village_ta] : []));
      for (const v of vList) {
        nextKeys.add(`${b.part_no}:${v}`);
      }
    }
    setVillageKeySet(nextKeys);
    onChange(nextParts);
    if (onVillagesChange) {
      const allSelectedVillageNames = [...new Set([...nextKeys].map((k) => k.split(':')[1]))];
      onVillagesChange(allSelectedVillageNames);
    }
  };

  // Clear all
  const handleClearAll = () => {
    setVillageKeySet(new Set());
    onChange([]);
    if (onVillagesChange) onVillagesChange([]);
  };

  const toggleExpand = (partNo: number) => {
    setExpandedBooths((prev) => {
      const next = new Set(prev);
      if (next.has(partNo)) next.delete(partNo);
      else next.add(partNo);
      return next;
    });
  };

  const toggleAllExpanded = () => {
    setAllExpanded((prev) => !prev);
    setExpandedBooths(new Set());
  };

  if (!tree) return <div className="t-sm t-muted">Loading booths…</div>;
  if (!tree.parts.length) {
    return <div className="t-sm t-muted">You have no booths assigned, so you cannot assign any.</div>;
  }

  const selectedSet = new Set(selected);
  const allVisibleSelected = visibleBooths.length > 0 && visibleBooths.every((b) => selectedSet.has(b.part_no));

  const selectedVoters = tree.parts
    .filter((p) => selectedSet.has(p.part_no))
    .reduce((a, p) => a + p.voter_count, 0);

  const selectedVillagesCount = new Set([...villageKeySet].map((k) => k.split(':')[1])).size;

  return (
    <div className="stack tight">
      {/* Top Action Bar */}
      <div className="row tight">
        <Button
          size="sm" variant="primary" icon="check"
          onClick={handleAutoSelectAll}
        >
          ⚡ Auto-Select All ({tree.parts.length})
        </Button>
        <Button size="sm" icon="x" onClick={handleClearAll} disabled={!selected.length}>
          Clear
        </Button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={toggleAllExpanded}
          title={allExpanded ? 'Collapse all villages' : 'Expand all villages'}
        >
          {allExpanded ? '▾ Collapse all' : '▸ Expand all'}
        </button>
        <span className="spacer" />
        <span className="badge badge-brand">
          {fmt(selected.length)} booth{selected.length === 1 ? '' : 's'} · {fmt(selectedVillagesCount)} village{selectedVillagesCount === 1 ? '' : 's'} · {fmt(selectedVoters)} electors
        </span>
      </div>

      <div className="picker">
        {/* Step 1: LOCAL BODIES Filter */}
        <div className="picker-search row tight" style={{ flexWrap: 'nowrap' }}>
          <div className="t-xs t-muted t-bold" style={{ letterSpacing: '0.06em', whiteSpace: 'nowrap', minWidth: 105 }}>
            1 · LOCAL BODIES
          </div>
          <MultiSelectDropdown
            options={localBodyOptions}
            selected={localBodies}
            onChange={setLocalBodies}
            placeholder="All local bodies — tap to filter"
            searchPlaceholder="Search local body…"
          />
        </div>

        {/* Step 2: BOOTHS Filter */}
        <div className="picker-search row tight" style={{ borderTop: '1px solid var(--border)', flexWrap: 'nowrap' }}>
          <div className="t-xs t-muted t-bold" style={{ letterSpacing: '0.06em', whiteSpace: 'nowrap', minWidth: 105 }}>
            2 · BOOTHS
          </div>
          <MultiSelectDropdown
            options={boothOptions}
            selected={boothFilter}
            onChange={setBoothFilter}
            placeholder={
              localBodies.length > 0
                ? `All booths in selected (${boothOptions.length}) — tap to filter`
                : `All booths (${boothOptions.length}) — tap to filter`
            }
            searchPlaceholder="Search booth number…"
          />
        </div>

        {/* Search Bar */}
        <div className="picker-search" style={{ borderTop: '1px solid var(--border)' }}>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search village name, booth number or local body…"
          />
        </div>

        {/* 3 · Step 3: Booths & Village Selection List */}
        <div className="picker-list" style={{ maxHeight: 380, overflowY: 'auto' }}>
          {visibleBooths.length === 0 ? (
            <div className="t-subtle t-sm" style={{ padding: 'var(--sp-4)', textAlign: 'center' }}>
              No booths or villages match this filter
            </div>
          ) : (
            visibleBooths.map((b) => {
              const vItems: { name: string; voter_count: number }[] = b.village_items?.length
                ? b.village_items
                : (b.villages?.length
                  ? b.villages.map((v) => ({ name: v, voter_count: 0 }))
                  : (b.main_village_ta ? [{ name: b.main_village_ta, voter_count: b.voter_count }] : []));

              const allVKeys = vItems.map((v) => `${b.part_no}:${v.name}`);
              const checkedVCount = allVKeys.filter((k) => villageKeySet.has(k)).length;
              const isBoothFullyChecked = allVKeys.length > 0 && checkedVCount === allVKeys.length;
              const isBoothPartiallyChecked = checkedVCount > 0 && checkedVCount < allVKeys.length;
              const isExpanded = expandedBooths.has(b.part_no) ? !allExpanded : allExpanded;

              return (
                <div key={b.part_no} className="picker-booth-group">
                  {/* Booth Row */}
                  <div className={`picker-booth-row ${checkedVCount > 0 ? 'on' : ''}`}>
                    <IndeterminateCheckbox
                      checked={isBoothFullyChecked}
                      indeterminate={isBoothPartiallyChecked}
                      onChange={() => toggleBooth(b.part_no)}
                      ariaLabel={`Booth ${b.part_no}`}
                    />
                    <div
                      style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}
                      onClick={() => toggleExpand(b.part_no)}
                    >
                      <strong>Booth {b.part_no}</strong>
                      <span className="ta t-subtle t-xs t-truncate"> · {b.local_body_name_ta}</span>
                      <LocalBodyBadge type={b.local_body_type} />
                    </div>
                    <span className="meta tabnum">{fmt(b.voter_count)} electors</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '2px 8px', fontSize: '0.75rem', height: 26, marginLeft: 6 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(b.part_no);
                      }}
                      title={isExpanded ? 'Collapse villages' : 'Expand villages'}
                    >
                      <span className="ta" style={{ marginRight: 4 }}>
                        {vItems.length} கிராமம்
                      </span>
                      <span
                        style={{
                          display: 'inline-flex',
                          transform: isExpanded ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.15s ease',
                        }}
                      >
                        <Icon name="chevron-down" size={12} />
                      </span>
                    </button>
                  </div>

                  {/* Villages under this Booth */}
                  {isExpanded && (
                    <div className="picker-villages-container">
                      {vItems.map((v) => {
                        const isVChecked = villageKeySet.has(`${b.part_no}:${v.name}`);
                        return (
                          <label key={v.name} className={`picker-village-opt ${isVChecked ? 'on' : ''}`}>
                            <input
                              type="checkbox"
                              checked={isVChecked}
                              onChange={() => toggleVillage(b.part_no, v.name)}
                            />
                            <span className="ta t-truncate" style={{ flex: 1 }}>
                              📍 {v.name}
                            </span>
                            {v.voter_count > 0 && (
                              <span className="meta tabnum">{fmt(v.voter_count)} electors</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Bar */}
        <div className="picker-foot">
          <span>
            {visibleBooths.length} booths shown · {selected.length} booths selected
            {selectedVillagesCount > 0 ? ` (${selectedVillagesCount} villages)` : ''}
          </span>
          <button
            type="button" className="btn btn-ghost btn-sm"
            disabled={!visibleBooths.length}
            onClick={allVisibleSelected ? handleClearShown : handleSelectAllShown}
          >
            {allVisibleSelected ? 'Clear shown' : 'Select all shown'}
          </button>
        </div>
      </div>
    </div>
  );
}
