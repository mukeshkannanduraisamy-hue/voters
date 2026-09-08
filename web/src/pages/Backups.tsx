import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import {
  Alert, Badge, Button, Card, CardHead, Empty, Input, PageHead, TableSkeleton, useToast
} from '../components/ui';
import { Icon } from '../components/icons';

interface NextBackupInfo {
  nextSlot: string;
  nextTime: string;
  minutesUntilNext: number;
  countdown: string;
  dailySlots: string[];
}

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
  nextBackup?: NextBackupInfo;
  backups: BackupItem[];
}

export default function Backups() {
  const [backups, setBackups] = useState<BackupItem[] | null>(null);
  const [nextBackup, setNextBackup] = useState<NextBackupInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<BackupsResponse>('/api/admin/backups');
      setBackups(data.backups || []);
      if (data.nextBackup) setNextBackup(data.nextBackup);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load database backups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleTriggerBackup = async () => {
    setTriggering(true);
    try {
      await api.post('/api/admin/backups/trigger');
      toast.show('New database backup snapshot created successfully!', 'ok');
      await load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Failed to create backup', 'bad');
    } finally {
      setTriggering(false);
    }
  };

  const handleDownload = async (filename: string) => {
    setDownloading(filename);
    try {
      await api.download(`/api/admin/backups/download/${filename}`, filename);
      toast.show(`Downloaded ${filename}`, 'ok');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Download failed', 'bad');
    } finally {
      setDownloading(null);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete backup: ${filename}?`)) {
      return;
    }
    setDeleting(filename);
    try {
      await api.del(`/api/admin/backups/${filename}`);
      toast.show(`Backup ${filename} deleted successfully.`, 'ok');
      setBackups((prev) => (prev ? prev.filter((b) => b.filename !== filename) : []));
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Failed to delete backup', 'bad');
    } finally {
      setDeleting(null);
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

  const totalSizeMb = useMemo(() => {
    if (!backups || !backups.length) return '0.00';
    const totalBytes = backups.reduce((acc, b) => acc + (b.sizeBytes || 0), 0);
    return (totalBytes / (1024 * 1024)).toFixed(2);
  }, [backups]);

  return (
    <>
      <PageHead
        eyebrow="System Administration"
        title="Database Backups & Automated Retention"
        subtitle="Automated 3x daily MySQL snapshots (08:00 AM, 02:00 PM, 09:00 PM IST) with strict 3-day auto-deletion policy."
        actions={
          <div className="cluster">
            <Button
              variant="primary"
              tone="brand"
              onClick={handleTriggerBackup}
              busy={triggering}
              disabled={triggering}
            >
              <Icon name="save" size={16} />
              <span>Create Backup Now</span>
            </Button>
            <Button variant="outline" onClick={load} busy={loading} disabled={loading}>
              <Icon name="refresh" size={16} />
              <span>Refresh</span>
            </Button>
          </div>
        }
      />

      {error && <Alert tone="bad" title="Backup error">{error}</Alert>}

      {/* KPI Metrics */}
      <div className="grid-3" style={{ marginBottom: 'var(--sp-6)' }}>
        <Card>
          <div style={{ padding: 'var(--sp-4)' }}>
            <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="t-xs t-muted t-upper t-bold">Snapshots Available</span>
              <span style={{ color: 'var(--brand-500)' }}><Icon name="database" size={20} /></span>
            </div>
            <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 700, marginTop: 'var(--sp-2)' }}>
              {backups ? backups.length : '—'}
            </div>
            <div className="t-xs t-muted mt-1">
              Total Storage: <span style={{ fontWeight: 600 }}>{totalSizeMb} MB</span> (Gzip Compressed)
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 'var(--sp-4)' }}>
            <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="t-xs t-muted t-upper t-bold">Daily 3x Automation</span>
              <span style={{ color: 'var(--emerald-500)' }}><Icon name="clock" size={20} /></span>
            </div>
            <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 700, marginTop: 'var(--sp-2)' }}>
              3 Times / Day
            </div>
            <div className="t-xs t-muted mt-1">
              {nextBackup ? (
                <span>Next: <strong style={{ color: 'var(--brand-600)' }}>{nextBackup.nextTime}</strong> ({nextBackup.countdown})</span>
              ) : (
                <span>Scheduled: <strong>08:00 AM</strong>, <strong>02:00 PM</strong>, <strong>09:00 PM IST</strong></span>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 'var(--sp-4)' }}>
            <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="t-xs t-muted t-upper t-bold">Auto-Delete Policy</span>
              <span style={{ color: 'var(--amber-500)' }}><Icon name="trash" size={20} /></span>
            </div>
            <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 700, marginTop: 'var(--sp-2)' }}>
              3 Days (72 Hours)
            </div>
            <div className="t-xs t-muted mt-1">
              Files older than 72 hours from backup time are automatically deleted
            </div>
          </div>
        </Card>
      </div>

      {/* Backups Table */}
      <Card>
        <CardHead
          title="Backup Snapshots & Timeline"
          subtitle="Complete database dumps with exact backup time, time elapsed, pack-up speed, and auto-delete countdowns."
          actions={
            <div className="cluster" style={{ minWidth: 260 }}>
              <Input
                placeholder="Search backups by time, name, slot…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          }
        />

        {loading && !backups ? (
          <TableSkeleton cols={6} rows={4} />
        ) : !filtered.length ? (
          <Empty
            icon="database"
            title={q ? 'No matching backups' : 'No backups yet'}
            message={
              q
                ? 'Try a different search query.'
                : 'Click "Create Backup Now" above to generate your first snapshot.'
            }
          />
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Backup File & Size</th>
                  <th>Backup Time (IST)</th>
                  <th>Time Passed (From Backup)</th>
                  <th>Scheduled Deletion (3 Days)</th>
                  <th>Retention Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const isExpiringSoon = b.remainingHours <= 12;
                  const isModerate = b.remainingHours <= 24;

                  return (
                    <tr key={b.filename}>
                      <td>
                        <div className="stack" style={{ gap: '4px' }}>
                          <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 'var(--fs-xs)' }}>
                            {b.filename}
                          </span>
                          <div className="cluster" style={{ gap: '6px' }}>
                            <Badge tone="brand">{b.sizeFormatted}</Badge>
                            {b.packUpDurationSeconds && (
                              <Badge tone="neutral">⚡ Packed in {b.packUpDurationSeconds}s</Badge>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="stack" style={{ gap: '3px' }}>
                          <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--brand-700)' }}>
                            {b.createdTimeFormatted || b.createdFormatted}
                          </span>
                          <span className="t-xs t-muted">{b.createdDateFormatted || 'Asia/Kolkata (IST)'}</span>
                          <Badge tone="neutral" style={{ width: 'fit-content' }}>
                            {b.slot || 'Automated Snapshot'}
                          </Badge>
                        </div>
                      </td>
                      <td>
                        <div className="stack" style={{ gap: '3px' }}>
                          <Badge tone="neutral" style={{ width: 'fit-content' }}>
                            <Icon name="clock" size={12} />
                            <span style={{ fontWeight: 600 }}>{b.timeAgo || 'Just now'}</span>
                          </Badge>
                          <span className="t-xs t-muted">Elapsed from backup</span>
                        </div>
                      </td>
                      <td>
                        <div className="stack" style={{ gap: '2px' }}>
                          <span style={{ fontWeight: 600, color: isExpiringSoon ? 'var(--red-600)' : undefined }}>
                            {b.expiresTimeFormatted ? `${b.expiresTimeFormatted}` : b.expiresAtFormatted}
                          </span>
                          <span className="t-xs t-muted">{b.expiresDateFormatted || b.expiresAtFormatted} (72h limit)</span>
                        </div>
                      </td>
                      <td>
                        <div className="stack" style={{ gap: '4px', minWidth: 140 }}>
                          <Badge tone={isExpiringSoon ? 'bad' : isModerate ? 'warn' : 'ok'}>
                            <Icon name="clock" size={12} />
                            <span>{b.remainingLabel}</span>
                          </Badge>
                          <div
                            style={{
                              width: '100%',
                              height: 6,
                              background: 'var(--slate-200)',
                              borderRadius: 3,
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(100, Math.max(0, b.elapsedPercent || 0))}%`,
                                height: '100%',
                                background: isExpiringSoon
                                  ? 'var(--red-500)'
                                  : isModerate
                                  ? 'var(--amber-500)'
                                  : 'var(--brand-500)',
                              }}
                            />
                          </div>
                          <span className="t-xs t-muted" style={{ fontSize: '11px' }}>
                            {b.elapsedPercent}% of 72h passed
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="cluster" style={{ justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
                          <Button
                            size="sm"
                            variant="primary"
                            tone="brand"
                            onClick={() => handleDownload(b.filename)}
                            busy={downloading === b.filename}
                            disabled={downloading === b.filename || deleting === b.filename}
                            title="Download .sql.gz backup file to your computer"
                          >
                            <Icon name="download" size={14} />
                            <span>Download</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            tone="bad"
                            onClick={() => handleDelete(b.filename)}
                            busy={deleting === b.filename}
                            disabled={deleting === b.filename || downloading === b.filename}
                            title="Manually delete this backup immediately"
                          >
                            <Icon name="trash" size={14} />
                            <span>Delete</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
