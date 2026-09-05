import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { AgentProgress, Breakdown, DashboardStats } from '../lib/types';
import {
  Alert, Button, Card, CardHead, Donut, Empty, HBars, PageHead, Progress, Ring,
  Skeleton, Stat, TableSkeleton, TrendBars, fmt, fmtRelative, initials,
} from '../components/ui';
import { LocalBodyBadge, PartySymbol } from '../components/spec-ui';

export default function Analytics() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [agents, setAgents] = useState<AgentProgress[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [s, b, a] = await Promise.all([
        api.get<DashboardStats>('/api/dashboard/stats'),
        api.get<Breakdown>('/api/dashboard/breakdown'),
        api.get<AgentProgress[]>('/api/dashboard/agents').catch(() => [] as AgentProgress[]),
      ]);
      setStats(s); setBreakdown(b); setAgents(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load analytics');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  if (loading) {
    return (
      <>
        <PageHead title="Analytics & Reports" />
        <div className="grid cols-4 mb-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={130} />)}</div>
        <Card><TableSkeleton rows={6} cols={4} /></Card>
      </>
    );
  }
  if (error) {
    return (
      <>
        <PageHead title="Analytics & Reports" />
        <Alert tone="bad">{error}</Alert>
        <div className="mt-4"><Button icon="refresh" onClick={() => void load()}>Try again</Button></div>
      </>
    );
  }
  if (!stats || !breakdown) return null;

  const t = stats.totals;
  const noSurveys = t.completed === 0;

  return (
    <>
      <PageHead
        title="Analytics & Reports"
        sub={stats.scope === 'global'
          ? 'Demographic breakdown across the constituency'
          : `Demographic breakdown for your ${user?.partCount} assigned booth${user?.partCount === 1 ? '' : 's'}`}
        actions={<Button icon="refresh" onClick={() => void load()}>Refresh</Button>}
      />

      <div className="grid cols-4 mb-4">
        <Stat label="Electors in scope" icon="users" value={fmt(t.total)} accent="var(--c1)" />
        <Stat label="Surveys collected" icon="check-circle" value={fmt(t.completed)} accent="var(--ok-500)" accentSoft="var(--ok-50)"
          foot={<span>{t.completionPct}% coverage</span>} />
        <Stat label="Still pending" icon="clock" value={fmt(t.pending)} accent="var(--warn-500)" accentSoft="var(--warn-50)" />
        <Stat label="Active agents" icon="user" value={fmt(agents.filter((a) => a.isActive).length)} accent="var(--c4)"
          foot={<span>{fmt(agents.length)} total</span>} />
      </div>

      {noSurveys && (
        <div className="mb-4">
          <Alert tone="info">
            No survey records exist in this scope yet, so the caste, occupation and party charts are
            empty. Sex and age come from the electoral roll itself and are shown below.
          </Alert>
        </div>
      )}

      {/* ---------- roll demographics ---------- */}
      <div className="grid cols-2 mb-4">
        <Card>
          <CardHead title="Sex distribution" sub="From the electoral roll" icon="users" />
          <div className="card-body"><Donut data={breakdown.gender.filter((g) => g.label !== '—')} /></div>
        </Card>
        <Card>
          <CardHead title="Age bands" sub="From the electoral roll" icon="chart" />
          <div className="card-body"><HBars data={breakdown.ageBands} limit={8} showPct /></div>
        </Card>
      </div>

      {/* ---------- party affiliation, with emblems ---------- */}
      <Card className="mb-4">
        <CardHead title="Political affiliation" sub={`${fmt(t.completed)} surveyed electors`} icon="flag" />
        <div className="card-body">
          {breakdown.parties.length === 0 ? (
            <Empty icon="flag" title="No party data yet">Party leanings appear as agents submit surveys.</Empty>
          ) : (
            <div className="stack tight">
              {breakdown.parties.map((p) => {
                const max = Math.max(...breakdown.parties.map((x) => x.count));
                const total = breakdown.parties.reduce((a, x) => a + x.count, 0);
                return (
                  <div key={p.code} className="hbar-row">
                    <div className="row tight" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
                      <PartySymbol party={{ name: p.label, party_code: p.code, color_code: p.color, symbol_img: p.symbol }} size={26} />
                      <div style={{ minWidth: 0 }}>
                        <div className="t-sm t-semi">{p.code}</div>
                        {p.labelTa && <div className="t-xs t-subtle ta t-truncate">{p.labelTa}</div>}
                      </div>
                    </div>
                    <div className="hbar-track">
                      <div className="hbar-fill" style={{ width: `${(p.count / max) * 100}%`, background: p.color }} />
                    </div>
                    <div className="hbar-val">
                      {fmt(p.count)}
                      <span className="t-subtle t-xs"> · {Math.round((p.count / total) * 100)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* ---------- caste / occupation ---------- */}
      <div className="grid cols-3 mb-4">
        <Card>
          <CardHead title="Caste distribution" sub="By community" icon="list" />
          <div className="card-body"><HBars data={breakdown.castes} limit={8} showPct /></div>
        </Card>
        <Card>
          <CardHead title="Occupation sectors" sub="Tier 1 rollup" icon="folder" />
          <div className="card-body"><HBars data={breakdown.jobSectors} limit={8} showPct /></div>
        </Card>
        <Card>
          <CardHead title="Specific occupations" sub="Tier 2 detail" icon="briefcase" />
          <div className="card-body"><HBars data={breakdown.jobs} limit={8} showPct /></div>
        </Card>
      </div>

      {/* ---------- coverage + trend ---------- */}
      <div className="grid cols-1-2 mb-4">
        <Card>
          <CardHead title="Coverage" icon="target" />
          <div className="card-body t-center">
            <Ring value={t.completionPct} size={150} />
            <div className="mt-4 t-sm t-muted">{fmt(t.completed)} of {fmt(t.total)} electors surveyed</div>
          </div>
        </Card>
        <Card>
          <CardHead title="14-day submission trend" icon="activity" />
          <div className="card-body">
            {stats.trend.every((d) => d.count === 0)
              ? <Empty icon="chart" title="No submissions in this window" />
              : <TrendBars data={stats.trend} height={150} />}
          </div>
        </Card>
      </div>

      {/* ---------- local body ranking ---------- */}
      <Card className="mb-4">
        <CardHead title="Local body completion ranking" sub="Sorted by elector volume" icon="map-pin" />
        <div className="card-body flush">
          {stats.localBodies.length === 0 ? <Empty icon="map-pin" title="No local bodies in scope" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 46 }}>#</th>
                    <th>Local body</th>
                    <th>Type</th>
                    <th className="num">Booths</th>
                    <th className="num">Total</th>
                    <th className="num">Done</th>
                    <th className="num">Pending</th>
                    <th style={{ width: 170 }}>Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.localBodies.map((p, i) => (
                    <tr key={p.name}>
                      <td><span className="rank">{i + 1}</span></td>
                      <td className="ta t-semi">{p.name}</td>
                      <td><LocalBodyBadge type={p.type} /></td>
                      <td className="num tabnum">{fmt(p.booths)}</td>
                      <td className="num tabnum">{fmt(p.total)}</td>
                      <td className="num tabnum" style={{ color: 'var(--ok-600)' }}>{fmt(p.completed)}</td>
                      <td className="num tabnum" style={{ color: 'var(--warn-600)' }}>{fmt(p.pending)}</td>
                      <td>
                        <div className="progress-row">
                          <Progress value={p.progress} />
                          <span className="progress-pct">{p.progress}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* ---------- agent productivity ---------- */}
      {agents.length > 0 && (
        <Card>
          <CardHead title="Agent productivity" sub={`${agents.length} field agent${agents.length === 1 ? '' : 's'}`} icon="users" />
          <div className="card-body flush">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th className="num">Booths</th>
                    <th className="num">Assigned electors</th>
                    <th className="num">Completed</th>
                    <th className="num">Today</th>
                    <th className="num">Pending</th>
                    <th style={{ width: 160 }}>Progress</th>
                    <th>Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div className="row tight" style={{ flexWrap: 'nowrap' }}>
                          <div className="avatar" style={{ width: 30, height: 30, flex: '0 0 30px', fontSize: 11 }}>
                            {initials(a.fullName ?? a.mobileNumber)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="t-semi t-truncate">{a.fullName ?? 'Unnamed'}</div>
                            <div className="t-xs t-subtle mono">{a.mobileNumber}</div>
                          </div>
                        </div>
                      </td>
                      <td className="num tabnum">{a.boothCount}</td>
                      <td className="num tabnum">{fmt(a.assignedVoters)}</td>
                      <td className="num tabnum t-semi">{fmt(a.surveysDone)}</td>
                      <td className="num tabnum">{a.todayDone || <span className="t-subtle">—</span>}</td>
                      <td className="num tabnum">{fmt(a.pending)}</td>
                      <td>
                        <div className="progress-row">
                          <Progress value={a.progress} />
                          <span className="progress-pct">{a.progress}%</span>
                        </div>
                      </td>
                      <td className="t-sm t-muted t-nowrap">{fmtRelative(a.lastLoginAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
