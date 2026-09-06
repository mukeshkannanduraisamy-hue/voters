import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth, scopedPath } from '../lib/auth';
import type { AgentProgress, DashboardStats, RecentSurvey } from '../lib/types';
import {
  Alert, Button, Card, CardHead, Empty, Input, PageHead, Progress, ProgressRow, Ring,
  Skeleton, Stat, TableSkeleton, TrendBars, fmt, fmtRelative, initials,
} from '../components/ui';
import { LocalBodyBadge, PartyChip } from '../components/spec-ui';
import { Icon } from '../components/icons';

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [agents, setAgents] = useState<AgentProgress[] | null>(null);
  const [recent, setRecent] = useState<RecentSurvey[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState('');

  const canSeeAgents = user?.role === 'A1_SUPER_ADMIN' || user?.role === 'A2_SUPERVISOR';

  const load = async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const [s, r] = await Promise.all([
        api.get<DashboardStats>('/api/dashboard/stats'),
        api.get<RecentSurvey[]>('/api/dashboard/recent?limit=8'),
      ]);
      setStats(s);
      setRecent(r);
      if (canSeeAgents) setAgents(await api.get<AgentProgress[]>('/api/dashboard/agents'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.role]);

  const doExport = async () => {
    setExporting(true);
    try {
      await api.download('/api/reports/export', 'vms-survey-report.xlsx');
    } catch { /* the button returns to idle; the download simply did not start */ }
    finally { setExporting(false); }
  };

  const title = user?.role === 'A2_SUPERVISOR' ? 'Zone Supervisor Dashboard' : 'Global Constituency Dashboard';
  const ac = stats?.constituency;
  const sub = ac
    ? `AC #${ac.acNo} ${ac.acNameTa} · ${fmt(stats!.totals.booths)} polling stations · ${fmt(stats!.totals.localBodies)} local bodies`
    : undefined;

  if (loading) {
    return (
      <>
        <PageHead title={title} />
        <div className="grid cols-4 mb-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={120} />)}
        </div>
        <Card><TableSkeleton rows={6} cols={6} /></Card>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHead title={title} />
        <Alert tone="bad">{error}</Alert>
        <div className="mt-4"><Button icon="refresh" onClick={() => void load()}>Try again</Button></div>
      </>
    );
  }
  if (!stats) return null;

  const t = stats.totals;
  const filtered = stats.localBodies.filter((p) =>
    !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <>
      <PageHead
        title={title}
        sub={sub}
        actions={
          <>
            <Button icon="refresh" loading={refreshing} onClick={() => void load(true)}>Refresh</Button>
            <Button variant="primary" icon="download" loading={exporting} onClick={() => void doExport()}>
              Export Excel
            </Button>
          </>
        }
      />

      {/* ---------------- headline counters ---------------- */}
      <div className="grid cols-4 mb-4">
        <Stat
          label="Total Voters" icon="users" value={fmt(t.total)}
          accent="var(--c1)" accentSoft="var(--brand-50)"
          foot={<span>Registered {stats.scope === 'global' ? 'in database' : 'in your booths'}</span>}
        />
        <Stat
          label="Completed Surveys" icon="check-circle" value={fmt(t.completed)}
          accent="var(--ok-500)" accentSoft="var(--ok-50)"
          foot={<span><strong className="trend-up">{t.completionPct}%</strong> done</span>}
        />
        <Stat
          label="Pending Voters" icon="clock" value={fmt(t.pending)}
          accent="var(--warn-500)" accentSoft="var(--warn-50)"
          foot={<span>{t.pendingPct}% remaining</span>}
        />
        <Stat
          label="Today's Velocity" icon="trending-up" value={fmt(t.today)}
          accent="var(--c4)" accentSoft="var(--brand-50)"
          foot={
            t.todayDeltaPct === null
              ? <span>No comparison for yesterday</span>
              : <span>
                  <strong className={t.todayDeltaPct >= 0 ? 'trend-up' : 'trend-down'}>
                    {t.todayDeltaPct >= 0 ? '+' : ''}{t.todayDeltaPct}%
                  </strong> vs yesterday
                </span>
          }
        />
      </div>

      {/* ---------------- completion + trend ---------------- */}
      <div className="grid cols-1-2 mb-4">
        <Card>
          <CardHead title="Overall completion" icon="target" />
          <div className="card-body">
            <div className="row" style={{ justifyContent: 'center', gap: 'var(--sp-6)' }}>
              <Ring value={t.completionPct} size={132} />
              <div className="stack tight">
                <div>
                  <div className="t-xs t-muted t-bold" style={{ letterSpacing: '0.06em' }}>COMPLETED</div>
                  <div className="t-lg t-bold tabnum" style={{ color: 'var(--ok-600)' }}>{fmt(t.completed)}</div>
                </div>
                <div>
                  <div className="t-xs t-muted t-bold" style={{ letterSpacing: '0.06em' }}>PENDING</div>
                  <div className="t-lg t-bold tabnum" style={{ color: 'var(--warn-600)' }}>{fmt(t.pending)}</div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHead
            title="Survey activity" sub="Submissions over the last 14 days" icon="activity"
            actions={<span className="badge badge-brand">{fmt(stats.trend.reduce((a, d) => a + d.count, 0))} in 14 days</span>}
          />
          <div className="card-body">
            {stats.trend.every((d) => d.count === 0)
              ? <Empty icon="chart" title="No submissions in the last 14 days">
                  Activity will chart here as agents submit surveys from the field.
                </Empty>
              : <TrendBars data={stats.trend} />}
          </div>
        </Card>
      </div>

      {/* ---------------- panchayat / town breakdown ---------------- */}
      <Card className="mb-4">
        <CardHead
          title="Panchayat & town breakdown"
          sub={`${fmt(stats.localBodies.length)} local bodies in scope · click a row to open its voters`}
          icon="map-pin"
          actions={
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search panchayat…"
              aria-label="Search panchayat"
              style={{ width: 200 }}
            />
          }
        />
        <div className="card-body flush">
          {filtered.length === 0 ? (
            <Empty icon="map-pin" title="No local bodies match">
              {query ? 'Try a different search term.' : 'Ask your administrator to assign booths to your account.'}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table table-clickable">
                <thead>
                  <tr>
                    <th style={{ width: 46 }}>#</th>
                    <th>Panchayat name</th>
                    <th>Local body type</th>
                    <th className="num">Booths</th>
                    <th className="num">Total voters</th>
                    <th className="num">Completed</th>
                    <th className="num">Pending</th>
                    <th style={{ width: 180 }}>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <tr
                      key={p.name}
                      onClick={() => nav(`${scopedPath(user?.role, 'voters')}?local_body=${encodeURIComponent(p.name)}`)}
                      title={`Open ${p.name} in the voters directory`}
                    >
                      <td><span className="rank">{i + 1}</span></td>
                      <td className="ta t-semi">{p.name}</td>
                      <td><LocalBodyBadge type={p.type} /></td>
                      <td className="num tabnum">{fmt(p.booths)}</td>
                      <td className="num tabnum">{fmt(p.total)}</td>
                      <td className="num tabnum" style={{ color: 'var(--ok-600)', fontWeight: 600 }}>{fmt(p.completed)}</td>
                      <td className="num tabnum" style={{ color: 'var(--warn-600)', fontWeight: 600 }}>{fmt(p.pending)}</td>
                      <td><ProgressRow value={p.progress} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <div className={canSeeAgents ? 'grid cols-2-1' : ''}>
        {/* ---------------- agent roster ---------------- */}
        {canSeeAgents && (
          <Card>
            <CardHead
              title="Field agent performance"
              sub={`${agents?.length ?? 0} agent${agents?.length === 1 ? '' : 's'} under your supervision`}
              icon="users"
              actions={<Link className="btn btn-secondary btn-sm" to="/admin/users">Manage</Link>}
            />
            <div className="card-body flush">
              {!agents ? <TableSkeleton rows={4} cols={5} /> : agents.length === 0 ? (
                <Empty icon="user-plus" title="No field agents yet">
                  Create agent accounts to start collecting survey data from the field.
                </Empty>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th>Assigned booths</th>
                        <th className="num">Completed</th>
                        <th className="num">Today</th>
                        <th style={{ width: 140 }}>Progress</th>
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
                                <div className="t-semi t-truncate">{a.fullName ?? 'Unnamed agent'}</div>
                                <div className="t-xs t-subtle mono">
                                  +91 {a.mobileNumber}
                                  {!a.isActive && <span style={{ color: 'var(--bad-600)' }}> · disabled</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="t-sm">
                            {a.partList.length
                              ? <>Booth {a.partList.slice(0, 4).join(', ')}{a.partList.length > 4 ? ` +${a.partList.length - 4}` : ''}</>
                              : <span className="t-subtle">None</span>}
                            <div className="t-xs t-subtle tabnum">{fmt(a.assignedVoters)} electors</div>
                          </td>
                          <td className="num tabnum t-semi">{fmt(a.surveysDone)}</td>
                          <td className="num tabnum">
                            {a.todayDone > 0 ? <span className="badge badge-ok">+{a.todayDone}</span> : <span className="t-subtle">—</span>}
                          </td>
                          <td>
                            <div className="progress-row">
                              <Progress value={a.progress} />
                              <span className="progress-pct">{a.progress}%</span>
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
        )}

        {/* ---------------- recent activity ---------------- */}
        <Card>
          <CardHead title="Recent submissions" sub="Latest survey records" icon="clock" />
          <div className="card-body flush">
            {recent.length === 0 ? (
              <Empty icon="inbox" title="No submissions yet">
                Survey records will appear here as agents submit them.
              </Empty>
            ) : (
              recent.map((r) => (
                <div key={r.epicId + r.updatedAt} className="result-row" style={{ cursor: 'default' }}>
                  <div className="avatar" style={{ width: 32, height: 32, flex: '0 0 32px', fontSize: 12 }}>
                    {initials(r.nameTa)}
                  </div>
                  <div className="result-main">
                    <div className="result-name t-truncate ta">{r.nameTa}</div>
                    <div className="result-meta t-truncate">
                      <span className="mono">{r.epicId}</span> · Booth {r.partNo} · <span className="ta">{r.localBodyNameTa}</span>
                    </div>
                  </div>
                  <div className="stack tight" style={{ alignItems: 'flex-end', gap: 4 }}>
                    {r.partyName && (
                      <PartyChip party={{ name: r.partyName, color_code: r.colorCode, symbol_img: r.symbolImg }} />
                    )}
                    <span className="t-xs t-subtle t-nowrap">{fmtRelative(r.updatedAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
