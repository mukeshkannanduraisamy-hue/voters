import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { BoothTree, Directory, Voter } from '../lib/types';
import {
  Alert, Badge, Button, Card, CardHead, Empty, Input, Modal, PageHead, Pager, Select,
  TableSkeleton, fmt, fmtDate, useToast,
} from '../components/ui';
import { LocalBodyBadge, PartySymbol, SortHeader } from '../components/spec-ui';
import { Icon } from '../components/icons';

export default function Voters() {
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [data, setData] = useState<Directory | null>(null);
  const [tree, setTree] = useState<BoothTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Voter | null>(null);
  const [exporting, setExporting] = useState(false);

  // The dashboard deep-links here with ?local_body=…, so seed from the URL.
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [localBody, setLocalBody] = useState(params.get('local_body') ?? '');
  const [partNo, setPartNo] = useState(params.get('part_no') ?? '');
  const [gender, setGender] = useState('');
  const [status, setStatus] = useState('');
  const [limit, setLimit] = useState(25);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('voter_sno');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const canExport = user?.role !== 'A3_FIELD_AGENT';
  const isAgent = user?.role === 'A3_FIELD_AGENT';

  useEffect(() => {
    api.get<BoothTree>('/api/booths').then(setTree).catch(() => { /* filters degrade to text search */ });
  }, []);

  const filters = useMemo(
    () => ({ search, local_body: localBody, part_no: partNo, gender, status, limit, page, sort_by: sortBy, sort_dir: sortDir }),
    [search, localBody, partNo, gender, status, limit, page, sortBy, sortDir]
  );

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.get<Directory>(`/api/voters/directory${qs(filters)}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 320 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => { setPage(1); }, [search, localBody, partNo, gender, status, limit]);

  // Keep the URL in step so a filtered view can be shared or reloaded.
  useEffect(() => {
    const next: Record<string, string> = {};
    if (search) next.search = search;
    if (localBody) next.local_body = localBody;
    if (partNo) next.part_no = partNo;
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, localBody, partNo]);

  // Selecting a local body narrows the booth list; clearing it drops a stale booth.
  const boothOptions = useMemo(() => {
    if (!tree) return [];
    return localBody ? tree.parts.filter((p) => p.local_body_name_ta === localBody) : tree.parts;
  }, [tree, localBody]);

  useEffect(() => {
    if (partNo && !boothOptions.some((b) => String(b.part_no) === partNo)) setPartNo('');
  }, [boothOptions, partNo]);

  const onSort = (column: string) => {
    if (sortBy === column) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(column); setSortDir('asc'); }
    setPage(1);
  };

  const doExport = async () => {
    setExporting(true);
    try {
      await api.download(
        `/api/reports/export${qs({ search, local_body: localBody, part_no: partNo, gender, status })}`,
        'vms-survey-report.xlsx'
      );
      toast.ok('Export started', 'The workbook is downloading.');
    } catch (err) {
      toast.bad('Export failed', err instanceof ApiError ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setSearch(''); setLocalBody(''); setPartNo(''); setGender(''); setStatus('');
  };
  const hasFilters = !!(search || localBody || partNo || gender || status);

  return (
    <>
      <PageHead
        title="Electoral Roll Directory"
        sub={user?.isGlobal
          ? `வாக்காளர் பட்டியல் · ${data ? fmt(data.total) : '—'} electors`
          : `Electors inside your ${user?.partCount} assigned booth${user?.partCount === 1 ? '' : 's'}`}
        actions={
          <>
            {hasFilters && <Button icon="x" onClick={clearFilters}>Reset filters</Button>}
            {canExport && (
              <Button variant="primary" icon="download" loading={exporting} onClick={() => void doExport()}>
                Export to Excel
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4">
        <div className="card-body tight">
          <div className="row">
            <div style={{ flex: '2 1 260px', minWidth: 210 }}>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name (Tamil), door no, EPIC ID or serial…"
                aria-label="Search voters"
              />
            </div>
            <Select value={localBody} onChange={(e) => setLocalBody(e.target.value)} aria-label="Filter by local body" style={{ flex: '1 1 180px' }}>
              <option value="">All local bodies</option>
              {tree?.localBodies.map((lb) => (
                <option key={lb.name} value={lb.name}>{lb.name} ({lb.part_count})</option>
              ))}
            </Select>
            <Select value={partNo} onChange={(e) => setPartNo(e.target.value)} aria-label="Filter by polling booth" style={{ flex: '1 1 160px' }}>
              <option value="">All polling booths</option>
              {boothOptions.map((b) => (
                <option key={b.part_no} value={b.part_no}>Part {b.part_no} ({b.voter_count})</option>
              ))}
            </Select>
            <Select value={gender} onChange={(e) => setGender(e.target.value)} aria-label="Filter by gender" style={{ flex: '0 1 150px' }}>
              <option value="">All genders</option>
              <option value="ஆண்">ஆண் (Male)</option>
              <option value="பெண்">பெண் (Female)</option>
              <option value="மூன்றாம்">மூன்றாம் (Third)</option>
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Survey status" style={{ flex: '0 1 150px' }}>
              <option value="">All status</option>
              <option value="surveyed">✓ Surveyed</option>
              <option value="pending">⏳ Pending</option>
            </Select>
            <Select
              value={String(limit)}
              onChange={(e) => setLimit(Number(e.target.value))}
              aria-label="Rows per page"
              style={{ flex: '0 1 110px' }}
            >
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} rows</option>)}
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead
          title={data ? `${fmt(data.total)} elector${data.total === 1 ? '' : 's'}` : 'Electors'}
          sub={hasFilters ? 'Filtered results' : undefined}
          icon="list"
          actions={<Button className="icon-btn" icon="refresh" onClick={() => void load()} aria-label="Refresh" />}
        />
        <div className="card-body flush">
          {error && <div style={{ padding: 'var(--sp-4)' }}><Alert tone="bad">{error}</Alert></div>}

          {loading ? (
            <TableSkeleton rows={8} cols={8} />
          ) : !data || data.rows.length === 0 ? (
            <Empty icon="search" title="No electors match">
              {hasFilters ? 'Try widening or clearing your filters.' : 'No electors are visible in your assigned booths.'}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table table-clickable">
                <thead>
                  <tr>
                    <th><SortHeader label="S.No" column="voter_sno" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /></th>
                    <th><SortHeader label="EPIC ID" column="epic_id" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /></th>
                    <th><SortHeader label="Voter name" column="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /></th>
                    <th>Relative name</th>
                    <th className="num"><SortHeader label="Age / Sex" column="age" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /></th>
                    <th><SortHeader label="Door no" column="door_no" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /></th>
                    <th><SortHeader label="Booth" column="part_no" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /></th>
                    <th>Survey status</th>
                    <th style={{ width: 56 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((v) => (
                    <tr key={v.epicId} onClick={() => setDetail(v)}>
                      <td className="tabnum t-sm">{v.voterSno ?? '—'}</td>
                      <td className="mono t-sm t-semi">{v.epicId}</td>
                      <td>
                        <div className="ta t-semi" title={v.nameTa}>{v.survey?.correctedNameTa ?? v.nameTa}</div>
                        {v.survey?.correctedNameTa && v.survey.correctedNameTa !== v.nameTa && (
                          <span className="badge badge-brand ta" style={{ fontSize: 10 }}>திருத்தப்பட்டது</span>
                        )}
                      </td>
                      <td className="ta t-sm t-muted">
                        {v.relativeNameTa ?? '—'}
                        {v.relationTypeTa && <div className="t-xs t-subtle ta">{v.relationTypeTa}</div>}
                      </td>
                      <td className="num">
                        <span className="tabnum">{v.age ?? '—'}</span>
                        <div className="t-xs ta t-subtle">{v.gender ?? '—'}</div>
                      </td>
                      <td className="t-sm">{v.doorNo ?? '—'}</td>
                      <td>
                        <div className="t-sm">Part {v.partNo}</div>
                        <div className="t-xs t-subtle ta t-truncate" style={{ maxWidth: 130 }}>{v.localBodyNameTa}</div>
                      </td>
                      <td>
                        {v.surveyed ? (
                          <div className="row tight" style={{ flexWrap: 'nowrap' }}>
                            {v.survey?.partyCode && (
                              <PartySymbol
                                party={{
                                  name: v.survey.partyName ?? '', party_code: v.survey.partyCode,
                                  color_code: v.survey.colorCode ?? '#64748b', symbol_img: v.survey.symbolImg,
                                }}
                                size={24}
                              />
                            )}
                            <div style={{ minWidth: 0 }}>
                              <Badge tone="ok" dot>{v.survey?.partyCode ?? 'Surveyed'}</Badge>
                              {v.survey?.phoneNumber && <div className="t-xs t-subtle mono">{v.survey.phoneNumber}</div>}
                            </div>
                          </div>
                        ) : (
                          <Badge tone="warn" dot>Pending</Badge>
                        )}
                      </td>
                      <td>
                        <Button size="sm" icon="eye" aria-label="View dossier" onClick={(e) => { e.stopPropagation(); setDetail(v); }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {data && data.total > limit && (
          <Pager page={page} pages={data.pages} total={data.total} pageSize={limit} onPage={setPage} />
        )}
      </Card>

      {detail && <CitizenDossier voter={detail} isAgent={isAgent} onClose={() => setDetail(null)} />}
    </>
  );
}

/* ============================ citizen dossier ============================ */
function CitizenDossier({ voter, isAgent, onClose }: { voter: Voter; isAgent: boolean; onClose: () => void }) {
  const s = voter.survey;
  return (
    <Modal
      open wide
      title={voter.nameTa}
      icon="user"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {s?.phoneNumber && (
            <a className="btn btn-secondary" href={`tel:+91${s.phoneNumber}`}>
              <Icon name="phone" size={16} />Call {s.phoneNumber}
            </a>
          )}
          {isAgent && (
            <Link className="btn btn-primary" to={`/survey/booth?epic=${encodeURIComponent(voter.epicId)}`}>
              <Icon name="clipboard" size={16} />{voter.surveyed ? 'Update survey' : 'Start survey'}
            </Link>
          )}
        </>
      }
    >
      <div className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="mono t-semi">{voter.epicId}</span>
          <div className="row tight">
            <LocalBodyBadge type={voter.localBodyType} />
            {voter.surveyed ? <Badge tone="ok" dot>Survey completed</Badge> : <Badge tone="warn" dot>Survey pending</Badge>}
          </div>
        </div>

        <div>
          <div className="section-tag ta">அதிகாரப்பூர்வ வாக்காளர் பட்டியல் · Official roll (read-only)</div>
          <div className="locked-grid">
            <Cell k="Voter name" v={voter.nameTa} ta />
            <Cell k={voter.relationTypeTa ?? 'Relative name'} v={voter.relativeNameTa ?? '—'} ta />
            <Cell k="Serial no" v={String(voter.voterSno ?? '—')} />
            <Cell k="Age / Sex" v={`${voter.age ?? '—'} / ${voter.gender ?? '—'}`} ta />
            <Cell k="Door no" v={voter.doorNo ?? '—'} />
            <Cell k="Polling booth" v={`Part ${voter.partNo}`} />
            <Cell k="Local body" v={voter.localBodyNameTa} ta />
            <Cell k="Constituency" v={`AC ${voter.acNo} - ${voter.acNameTa}`} ta />
            {voter.mainVillageTa && <Cell k="Town / Village" v={voter.mainVillageTa} ta />}
            {voter.pincode && <Cell k="Pincode" v={voter.pincode} />}
            {voter.sectionTitleTa && <Cell k="Section" v={voter.sectionTitleTa} span2 ta />}
          </div>
        </div>

        {s ? (
          <div>
            <div className="section-tag ta">கள கணக்கெடுப்பு விபரம் · Field survey intelligence</div>

            {s.partyCode && (
              <div
                className="row"
                style={{
                  marginBottom: 'var(--sp-3)', padding: 'var(--sp-3)',
                  borderRadius: 'var(--r-md)', flexWrap: 'nowrap',
                  background: `color-mix(in srgb, ${s.colorCode ?? '#64748b'} 10%, var(--surface-2))`,
                  border: `1px solid color-mix(in srgb, ${s.colorCode ?? '#64748b'} 30%, transparent)`,
                }}
              >
                <PartySymbol
                  party={{ name: s.partyName ?? '', party_code: s.partyCode, color_code: s.colorCode ?? '#64748b', symbol_img: s.symbolImg }}
                  size={46}
                />
                <div style={{ minWidth: 0 }}>
                  <div className="t-semi">{s.partyName}</div>
                  {s.partyNameTa && <div className="t-sm ta t-muted">{s.partyNameTa}</div>}
                </div>
              </div>
            )}

            <div className="locked-grid">
              <Cell k="Phone number" v={s.phoneNumber} mono />
              <Cell k="Caste / community" v={`${s.casteNameTa ?? s.casteName ?? '—'}${s.casteCategory ? ` (${s.casteCategory})` : ''}`} ta />
              <Cell k="Occupation sector" v={s.jobCategoryTa ?? s.jobCategory ?? '—'} ta />
              <Cell k="Occupation" v={s.jobNameTa ?? s.jobName ?? '—'} ta />
              {s.otherJobText && <Cell k="Custom job note" v={s.otherJobText} span2 ta />}
              {s.correctedNameTa && <Cell k="Corrected name" v={s.correctedNameTa} ta />}
              {s.correctedRelativeNameTa && <Cell k="Corrected relative name" v={s.correctedRelativeNameTa} ta />}
              {s.remarks && <Cell k="Remarks" v={s.remarks} span2 ta />}
              <Cell k="Surveyed by" v={s.agentName ?? 'Unknown'} />
              <Cell k="Surveyed at" v={fmtDate(s.surveyedAt, true)} />
            </div>
          </div>
        ) : (
          <Alert tone="warn">No field survey has been collected for this elector yet.</Alert>
        )}
      </div>
    </Modal>
  );
}

function Cell({ k, v, span2, mono, ta }: { k: string; v: string; span2?: boolean; mono?: boolean; ta?: boolean }) {
  return (
    <div className={`locked-cell ${span2 ? 'span2' : ''}`}>
      <div className="locked-key">{k}</div>
      <div className={`locked-val ${mono ? 'mono' : ''} ${ta ? 'ta' : ''}`}>{v}</div>
    </div>
  );
}
