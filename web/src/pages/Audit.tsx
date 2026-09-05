import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { AuditEntry } from '../lib/types';
import {
  Alert, Badge, Button, Card, CardHead, Empty, Input, PageHead, RolePill, Select,
  TableSkeleton, fmtDate, fmtRelative,
} from '../components/ui';

/** Colour-codes the action so a long log stays scannable. */
function actionTone(action: string): 'ok' | 'bad' | 'warn' | 'info' | 'brand' | 'muted' {
  if (action.includes('FAILED') || action.includes('DELETED') || action.includes('BLOCKED')) return 'bad';
  if (action.includes('CREATED')) return 'ok';
  if (action.includes('DISABLED')) return 'warn';
  if (action.includes('UPDATED') || action.includes('ENABLED') || action.includes('CHANGED')) return 'info';
  if (action === 'LOGIN' || action === 'LOGOUT') return 'muted';
  return 'brand';
}

export default function Audit() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(100);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');

  const load = async () => {
    setRows(null);
    setError('');
    try {
      setRows(await api.get<AuditEntry[]>(`/api/dashboard/audit?limit=${limit}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the activity log');
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [limit]);

  const actions = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.action))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    if (!rows) return null;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (action && r.action !== action) return false;
      if (!needle) return true;
      return (
        r.action.toLowerCase().includes(needle) ||
        (r.full_name ?? '').toLowerCase().includes(needle) ||
        (r.mobile_number ?? '').includes(needle) ||
        (r.detail ?? '').toLowerCase().includes(needle) ||
        (r.entity_id ?? '').toLowerCase().includes(needle)
      );
    });
  }, [rows, q, action]);

  return (
    <>
      <PageHead
        title="Activity Log"
        sub="Every login, account change, master edit and survey write"
        actions={<Button icon="refresh" onClick={() => void load()}>Refresh</Button>}
      />

      <Card>
        <CardHead
          title={filtered ? `${filtered.length} event${filtered.length === 1 ? '' : 's'}` : 'Events'}
          icon="activity"
          actions={
            <div className="row tight">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events…" style={{ width: 200 }} aria-label="Search events" />
              <Select value={action} onChange={(e) => setAction(e.target.value)} style={{ width: 180 }} aria-label="Filter by action">
                <option value="">All actions</option>
                {actions.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
              </Select>
              <Select value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))} style={{ width: 110 }} aria-label="Rows to load">
                <option value="50">Last 50</option>
                <option value="100">Last 100</option>
                <option value="200">Last 200</option>
              </Select>
            </div>
          }
        />
        <div className="card-body flush">
          {error && <div style={{ padding: 'var(--sp-4)' }}><Alert tone="bad">{error}</Alert></div>}

          {!filtered ? (
            <TableSkeleton rows={8} cols={5} />
          ) : filtered.length === 0 ? (
            <Empty icon="activity" title="No matching events">
              {q || action ? 'Try clearing the filters.' : 'System activity will appear here.'}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>#</th>
                    <th>Action</th>
                    <th>Performed by</th>
                    <th>Entity</th>
                    <th>Detail</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td className="t-xs t-subtle mono">{r.id}</td>
                      <td><Badge tone={actionTone(r.action)}>{r.action.replace(/_/g, ' ')}</Badge></td>
                      <td>
                        {r.full_name || r.mobile_number ? (
                          <>
                            <div className="t-sm t-semi ta t-truncate">{r.full_name ?? '—'}</div>
                            <div className="t-xs t-subtle mono">{r.mobile_number ?? ''}</div>
                          </>
                        ) : (
                          <span className="t-subtle t-sm">System / unknown</span>
                        )}
                      </td>
                      <td>
                        {r.entity ? (
                          <>
                            <div className="t-sm">{r.entity}</div>
                            {r.entity_id && <div className="t-xs t-subtle mono t-truncate" style={{ maxWidth: 160 }}>{r.entity_id}</div>}
                          </>
                        ) : <span className="t-subtle">—</span>}
                      </td>
                      <td className="t-sm t-muted t-truncate" style={{ maxWidth: 260 }}>{r.detail ?? '—'}</td>
                      <td className="t-nowrap">
                        <div className="t-sm">{fmtRelative(r.created_at)}</div>
                        <div className="t-xs t-subtle">{fmtDate(r.created_at, true)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
