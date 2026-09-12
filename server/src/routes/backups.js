import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { authenticate, requireRole, ROLES } from '../lib/auth.js';
import { createDatabaseBackup, listBackups, deleteBackup, getNextBackupInfo, ensureBackupsDir } from '../lib/backup.js';

const router = express.Router();
const CRON_SECRET = process.env.CRON_SECRET || 'vms-cron-secret-2026';

// 1. List all available backup snapshots (A1 Super Admin only)
router.get('/api/admin/backups', authenticate, requireRole(ROLES.A1), (req, res) => {
  try {
    const backups = listBackups();
    const nextBackup = getNextBackupInfo();
    res.json({
      success: true,
      total: backups.length,
      schedule: 'Daily 3 times (08:00 AM, 02:00 PM, 09:00 PM IST)',
      nextBackup,
      backups
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list backups', detail: err.message });
  }
});

// 2. Download a specific backup snapshot (A1 Super Admin only)
router.get('/api/admin/backups/download/:filename', authenticate, requireRole(ROLES.A1), (req, res) => {
  try {
    const { filename } = req.params;
    // Security check: ensure filename is safe and in backups dir
    if (!filename || !filename.startsWith('vms_backup_') || !filename.endsWith('.sql.gz') || filename.includes('..') || filename.includes('/') || filename.includes('\\') || path.basename(filename) !== filename) {
      return res.status(400).json({ error: 'Invalid backup filename' });
    }

    const dir = ensureBackupsDir();
    const filepath = path.join(dir, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const stream = fs.createReadStream(filepath);
    stream.on('error', (streamErr) => {
      console.error('[backup] Download stream error:', streamErr);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream backup file' });
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Failed to download backup', detail: err.message });
  }
});

// 3. Trigger an instant manual backup snapshot (A1 Super Admin only)
router.post('/api/admin/backups/trigger', authenticate, requireRole(ROLES.A1), async (req, res) => {
  try {
    const result = await createDatabaseBackup({ triggerType: 'manual' });
    res.json({
      success: true,
      message: 'Backup created successfully',
      backup: result
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create backup', detail: err.message });
  }
});

// 4. Manually delete a backup file (A1 Super Admin only)
router.delete('/api/admin/backups/:filename', authenticate, requireRole(ROLES.A1), (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename || !filename.startsWith('vms_backup_') || !filename.endsWith('.sql.gz') || filename.includes('..') || filename.includes('/') || filename.includes('\\') || path.basename(filename) !== filename) {
      return res.status(400).json({ error: 'Invalid backup filename' });
    }

    const dir = ensureBackupsDir();
    const filepath = path.join(dir, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    deleteBackup(filename);
    console.log(`[backup] Manually deleted backup: ${filename}`);
    res.json({
      success: true,
      message: `Backup ${filename} deleted successfully`,
      filename
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete backup', detail: err.message });
  }
});

// 5. External cron endpoint (Secured with CRON_SECRET key)
router.get('/api/internal/backup-cron', async (req, res) => {
  try {
    const key = req.query.key || req.headers['x-cron-key'];
    if (key !== CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized cron key' });
    }

    console.log('[cron] External backup cron triggered...');
    const result = await createDatabaseBackup({ triggerType: 'cron' });
    res.json({
      success: true,
      message: 'Automated 3x daily backup completed successfully',
      backup: result
    });
  } catch (err) {
    res.status(500).json({ error: 'Cron backup failed', detail: err.message });
  }
});

export default router;
