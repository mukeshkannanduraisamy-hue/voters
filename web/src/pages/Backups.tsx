import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import {
  Alert, Badge, Button, Card, CardHead, ConfirmModal, Empty, Input, PageHead, Progress, TableSkeleton, useToast,
} from '../components/ui';

interface BackupItem {
  filename: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  createdTimeFormatted: string;
  createdDateFormatted: string;
  createdFormatted: string;
  timeAgo: string;
  slot: string;
  triggerType: string;
  packUpDurationSeconds?: number | null;
  totalRowsDumped?: number | null;
  expiresAt: string;
  expiresTimeFormatted: string;
  expiresDateFormatted: string;
  expiresAtFormatted: string;
  remainingMs: number;
  remainingHours: number;
  remainingLabel: string;
  elapsedPercent: number;
  retentionDays: number;
}

interface BackupsResponse {
  success: boolean;
  total: number;
  schedule: string;
  backups: BackupItem[];
}

export default function Backups() {
  const [backups, setBackups] = useState<BackupItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BackupItem | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<BackupsResponse>('/api/admin/backups');
      setBackups(data.backups || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load database backups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleTriggerBackup = async () => {
    setTriggering(true);
    try {
      await api.post('/api/admin/backups/trigger');
      toast.ok('Backup created', 'New database snapshot saved successfully.');
      await load();
    } catch (err) {
      toast.bad('Could not create backup', err instanceof Error ? err.message : undefined);
    } finally {
      setTriggering(false);
    }
  };

  const handleDownload = async (filename: string) => {
    setDownloading(filename);
    try {
      await api.download(`/api/admin/backups/download/${filename}`, filename);
      toast.ok('Download started', filename);
    } catch (err) {
      toast.bad('Download failed', err instanceof Error ? err.message : undefined);
    } finally {
      setDownloading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await api.del(`/api/admin/backups/${deleting.filename}`);
      toast.ok('Backup deleted', deleting.filename);
      setBackups((prev) => (prev ? prev.filter((b) => b.filename !== deleting.filename) : []));
      setDeleting(null);
    } catch (err) {
      toast.bad('Could not delete backup', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyDelete(false);
    }
  };

  const filtered = useMemo(() => {
    if (!backups) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return backups;
    return backups.filter(
      (b) =>
        b.filename.toLowerCase().includes(needle) ||
        b.createdFormatted.toLowerCase().includes(needle) ||
        (b.createdTimeFormatted && b.createdTimeFormatted.toLowerCase().includes(needle)) ||
        (b.slot && b.slot.toLowerCase().includes(needle)) ||
        b.expiresAtFormatted.toLowerCase().includes(needle)
    );
  }, [backups, q]);

  return (
    <>
      <PageHead
        title="Database Backups & Automated Retention"
        sub="Automated 3x daily MySQL snapshots (08:00 AM, 02:00 PM, 09:00 PM IST) with a strict 3-day auto-deletion policy"
        actions={
          <>
            <Button icon="refresh" onClick={() => void load()} loading={loading}>Refresh</Button>
            <Button variant="primary" icon="save" onClick={() => void handleTriggerBackup()} loading={triggering}>
              Create Backup Now
            </Button>
          </>
        }
      />

      {error && <div className="mb-4"><Alert tone="bad"><strong>Backup error:</strong> {error}</Alert></div>}

      <Card>
        <CardHead
          title="Backup Snapshots & Timeline"
          sub="Complete database dumps with backup time, elapsed time, pack-up speed, and auto-delete countdowns"
          icon="database"
          actions={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search backups by time, name, slot…" style={{ width: 220 }} aria-label="Search backups" />}
        />

        <div className="card-body flush">
          {loading && !backups ? (
            <TableSkeleton cols={6} rows={4} />
          ) : filtered.length === 0 ? (
            <Empty icon="database" title={q ? 'No matching backups' : 'No backups yet'}>
              {q ? 'Try a different search term.' : 'Click "Create Backup Now" above to generate your first snapshot.'}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Backup file & size</th>
                    <th>Backup time (IST)</th>
                    <th>Time since backup</th>
                    <th>Scheduled deletion (3 days)</th>
                    <th style={{ width: 170 }}>Retention status</th>
                    <th style={{ width: 190 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b) => {
                    const isExpiringSoon = b.remainingHours <= 12;
                    const isModerate = b.remainingHours <= 24;
                    const tone = isExpiringSoon ? 'bad' : isModerate ? 'warn' : 'ok';

                    return (
                      <tr key={b.filename}>
                        <td>
                          <div className="mono t-xs t-semi">{b.filename}</div>
                          <div className="row tight mt-2">
                            <Badge tone="brand">{b.sizeFormatted}</Badge>
                            {!!b.packUpDurationSeconds && <Badge tone="muted">Packed in {b.packUpDurationSeconds}s</Badge>}
                          </div>
                        </td>
                        <td>
                          <div className="t-sm t-semi" style={{ color: 'var(--brand-700)' }}>
                            {b.createdTimeFormatted || b.createdFormatted}
                          </div>
                          <div className="t-xs t-muted">{b.createdDateFormatted || 'Asia/Kolkata (IST)'}</div>
                          <Badge tone="muted">{b.slot || 'Automated Snapshot'}</Badge>
                        </td>
                        <td>
                          <Badge tone="muted" dot>{b.timeAgo || 'Just now'}</Badge>
                          <div className="t-xs t-muted mt-2">Elapsed from backup</div>
                        </td>
                        <td>
                          <div className="t-sm t-semi" style={{ color: isExpiringSoon ? 'var(--bad-600)' : undefined }}>
                            {b.expiresTimeFormatted || b.expiresAtFormatted}
                          </div>
                          <div className="t-xs t-muted">{b.expiresDateFormatted || b.expiresAtFormatted} (72h limit)</div>
                        </td>
                        <td>
                          <div className="stack tight" style={{ minWidth: 140 }}>
                            <Badge tone={tone} dot>{b.remainingLabel}</Badge>
                            <Progress value={b.elapsedPercent} tone={tone} />
                            <span className="t-xs t-subtle">{b.elapsedPercent}% of 72h passed</span>
                          </div>
                        </td>
                        <td>
                          <div className="actions">
                            <Button
                              size="sm" variant="primary" icon="download"
                              onClick={() => void handleDownload(b.filename)}
                              loading={downloading === b.filename}
                              disabled={downloading === b.filename || deleting?.filename === b.filename}
                              title="Download the .sql.gz backup file"
                            >
                              Download
                            </Button>
                            <Button
                              size="sm" variant="danger-soft" icon="trash" aria-label="Delete"
                              onClick={() => setDeleting(b)}
                              disabled={downloading === b.filename}
                              title="Delete this backup immediately"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <ConfirmModal
        open={!!deleting} danger title={`Delete "${deleting?.filename}"?`} confirmLabel="Delete"
        busy={busyDelete}
        message="This permanently removes the backup file from the server. This cannot be undone."
        onCancel={() => setDeleting(null)} onConfirm={() => void handleDelete()}
      />
    </>
  );
}
