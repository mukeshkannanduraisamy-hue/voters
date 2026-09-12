import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUPS_DIR = path.resolve(__dirname, '../../../backups');
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
  return BACKUPS_DIR;
}

function sqlEscapeString(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (val instanceof Date) {
    return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
  }
  if (typeof val === 'object') {
    val = JSON.stringify(val);
  }
  const str = String(val)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\0/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\x1a/g, '\\Z');
  return `'${str}'`;
}

export function getISTParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return map;
}

export function formatISTTime(date) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(date);
}

export function formatISTDate(date) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

export function formatIST(date) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(date);
}

export function getTimeAgo(createdMs, nowMs = Date.now()) {
  const diffMs = Math.max(0, nowMs - createdMs);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 45) return 'Just now';
  if (diffSec < 90) return '1 minute ago';
  if (diffMin < 60) return `${diffMin} minutes ago`;
  if (diffHour === 1) return '1 hour ago';
  if (diffHour < 24) return `${diffHour} hours ago`;
  if (diffDay === 1) return '1 day ago';
  return `${diffDay} days ago`;
}

export function getRemainingLabel(remainingMs) {
  if (remainingMs <= 0) return 'Expired / Deleting now';
  const totalMins = Math.floor(remainingMs / (60 * 1000));
  const days = Math.floor(totalMins / (24 * 60));
  const hours = Math.floor((totalMins % (24 * 60)) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

export function getNextBackupInfo() {
  const now = new Date();
  const istFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });
  const parts = istFormatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const currentMinutesOfDay = hour * 60 + minute;

  const schedules = [
    { label: 'Morning Slot', time: '08:00 AM IST', minutes: 8 * 60 },
    { label: 'Afternoon Slot', time: '02:00 PM IST', minutes: 14 * 60 },
    { label: 'Night Slot', time: '09:00 PM IST', minutes: 21 * 60 },
  ];

  let next = schedules.find(s => s.minutes > currentMinutesOfDay);
  let diffMinutes = 0;
  if (next) {
    diffMinutes = next.minutes - currentMinutesOfDay;
  } else {
    next = schedules[0];
    diffMinutes = (24 * 60 - currentMinutesOfDay) + next.minutes;
  }

  const hoursLeft = Math.floor(diffMinutes / 60);
  const minsLeft = diffMinutes % 60;
  const countdown = hoursLeft > 0 ? `${hoursLeft}h ${minsLeft}m` : `${minsLeft}m`;

  return {
    nextSlot: next.label,
    nextTime: next.time,
    minutesUntilNext: diffMinutes,
    countdown: `in ${countdown}`,
    dailySlots: ['08:00 AM IST', '02:00 PM IST', '09:00 PM IST']
  };
}

export async function createDatabaseBackup(options = {}) {
  const dir = ensureBackupsDir();
  const now = new Date();
  const ist = getISTParts(now);
  const timestamp = `${ist.year}-${ist.month}-${ist.day}_${ist.hour}-${ist.minute}-${ist.second}`;
  const filename = `vms_backup_${timestamp}.sql.gz`;
  const filepath = path.join(dir, filename);

  console.log(`[backup] Starting database backup -> ${filename}...`);
  const startTime = Date.now();

  const fileStream = fs.createWriteStream(filepath);
  const gzipStream = zlib.createGzip({ level: 6 });
  gzipStream.pipe(fileStream);

  const write = (text) => {
    return new Promise((resolve) => {
      if (!gzipStream.write(text)) {
        gzipStream.once('drain', resolve);
      } else {
        resolve();
      }
    });
  };

  try {
    await write(`-- ========================================================\n`);
    await write(`-- Voter Management System (VMS) - Database Backup\n`);
    await write(`-- Generated at: ${now.toISOString()}\n`);
    await write(`-- Server: srv1497.hstgr.io / Database: u403881955_vms\n`);
    await write(`-- ========================================================\n\n`);
    await write(`SET FOREIGN_KEY_CHECKS = 0;\n`);
    await write(`SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";\n`);
    await write(`SET time_zone = "+00:00";\n\n`);

    const [tableRows] = await pool.query("SHOW TABLES LIKE 'vms_%'");
    const tables = tableRows.map(r => Object.values(r)[0]);

    let totalDumpedRows = 0;
    const conn = await pool.getConnection();
    try {
      for (const table of tables) {
        console.log(`[backup] Dumping table ${table}...`);
        await write(`-- --------------------------------------------------------\n`);
        await write(`-- Table structure for table \`${table}\`\n`);
        await write(`-- --------------------------------------------------------\n`);
        await write(`DROP TABLE IF EXISTS \`${table}\`;\n`);

        const [createRows] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
        const createSql = createRows[0]['Create Table'];
        await write(`${createSql};\n\n`);

        await write(`-- Dumping data for table \`${table}\`\n`);
        
        const stream = conn.connection.query(`SELECT * FROM \`${table}\``).stream();
        let batch = [];
        let cols = null;
        let rowCount = 0;

        for await (const row of stream) {
          if (!cols) cols = Object.keys(row);
          batch.push(row);
          rowCount++;
          totalDumpedRows++;

          if (batch.length >= 1000) {
            const valuesSql = batch.map(r => `(${cols.map(c => sqlEscapeString(r[c])).join(', ')})`).join(',\n');
            await write(`INSERT INTO \`${table}\` (\`${cols.join('`, `')}\`) VALUES\n${valuesSql};\n`);
            batch = [];
          }
        }

        if (batch.length > 0) {
          const valuesSql = batch.map(r => `(${cols.map(c => sqlEscapeString(r[c])).join(', ')})`).join(',\n');
          await write(`INSERT INTO \`${table}\` (\`${cols.join('`, `')}\`) VALUES\n${valuesSql};\n`);
        }

        await write(`\n`);
        console.log(`[backup] Dumped ${rowCount} rows for ${table}.`);
      }
    } finally {
      conn.release();
    }


    await write(`SET FOREIGN_KEY_CHECKS = 1;\n`);
    await write(`-- Backup completed at: ${now.toISOString()}\n`);

    await new Promise((resolve, reject) => {
      gzipStream.end(() => {
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
      });
    });

    const stats = fs.statSync(filepath);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

    const istHour = parseInt(ist.hour, 10);
    let slot = 'Manual Snapshot';
    if (options.triggerType === 'cron' || options.triggerType === 'scheduler') {
      if (istHour >= 7 && istHour <= 9) slot = 'Morning Slot (08:00 AM)';
      else if (istHour >= 13 && istHour <= 15) slot = 'Afternoon Slot (02:00 PM)';
      else if (istHour >= 20 && istHour <= 22) slot = 'Night Slot (09:00 PM)';
      else slot = `Scheduled Slot (${formatISTTime(now)})`;
    }

    const meta = {
      filename,
      createdAt: now.toISOString(),
      createdTimeFormatted: formatISTTime(now),
      createdDateFormatted: formatISTDate(now),
      createdFormatted: formatIST(now),
      slot,
      triggerType: options.triggerType || 'manual',
      packUpDurationSeconds: parseFloat(duration),
      sizeBytes: stats.size,
      sizeFormatted: `${sizeMb} MB`,
      totalRowsDumped: totalDumpedRows
    };

    try {
      fs.writeFileSync(`${filepath}.json`, JSON.stringify(meta, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[backup] Could not save meta file:', e.message);
    }

    console.log(`[backup] Backup completed in ${duration}s! Size: ${sizeMb} MB (${stats.size} bytes, ${totalDumpedRows} rows)`);

    // Prune backups older than 3 days
    pruneExpiredBackups(3);

    return {
      success: true,
      filename,
      filepath,
      sizeBytes: stats.size,
      sizeFormatted: `${sizeMb} MB`,
      durationSeconds: duration,
      createdAt: now.toISOString(),
      createdTimeFormatted: meta.createdTimeFormatted,
      createdDateFormatted: meta.createdDateFormatted,
      slot: meta.slot
    };
  } catch (err) {
    console.error(`[backup] Backup failed:`, err);
    try { gzipStream.destroy(); } catch {}
    try { fileStream.destroy(); } catch {}
    if (fs.existsSync(filepath)) {
      try { fs.unlinkSync(filepath); } catch {}
    }
    const metaPath = `${filepath}.json`;
    if (fs.existsSync(metaPath)) {
      try { fs.unlinkSync(metaPath); } catch {}
    }
    throw err;
  }
}

export function listBackups() {
  pruneExpiredBackups(3);

  const dir = ensureBackupsDir();
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.startsWith('vms_backup_') && f.endsWith('.sql.gz'));
  const now = Date.now();

  return files.map(filename => {
    const full = path.join(dir, filename);
    const stats = fs.statSync(full);
    const metaPath = `${full}.json`;
    let meta = null;
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      } catch {}
    }

    const createdDate = meta?.createdAt ? new Date(meta.createdAt) : new Date(stats.birthtime || stats.mtime);
    const createdMs = createdDate.getTime();
    const expiresMs = createdMs + THREE_DAYS_MS;
    const expiresDate = new Date(expiresMs);
    const remainingMs = Math.max(0, expiresMs - now);
    const elapsedMs = Math.max(0, now - createdMs);
    const elapsedPercent = Math.min(100, Math.max(0, (elapsedMs / THREE_DAYS_MS) * 100)).toFixed(1);

    let slot = meta?.slot;
    if (!slot) {
      const istHour = parseInt(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(createdDate), 10);
      if (istHour >= 7 && istHour <= 9) slot = 'Morning Slot (08:00 AM)';
      else if (istHour >= 13 && istHour <= 15) slot = 'Afternoon Slot (02:00 PM)';
      else if (istHour >= 20 && istHour <= 22) slot = 'Night Slot (09:00 PM)';
      else slot = 'Manual Snapshot';
    }

    return {
      filename,
      sizeBytes: stats.size,
      sizeFormatted: `${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
      createdAt: createdDate.toISOString(),
      createdTimeFormatted: meta?.createdTimeFormatted || formatISTTime(createdDate),
      createdDateFormatted: meta?.createdDateFormatted || formatISTDate(createdDate),
      createdFormatted: meta?.createdFormatted || formatIST(createdDate),
      timeAgo: getTimeAgo(createdMs, now),
      slot,
      triggerType: meta?.triggerType || 'manual',
      packUpDurationSeconds: meta?.packUpDurationSeconds || null,
      totalRowsDumped: meta?.totalRowsDumped || null,
      expiresAt: expiresDate.toISOString(),
      expiresTimeFormatted: formatISTTime(expiresDate),
      expiresDateFormatted: formatISTDate(expiresDate),
      expiresAtFormatted: formatIST(expiresDate),
      remainingMs,
      remainingHours: Math.floor(remainingMs / (3600 * 1000)),
      remainingLabel: getRemainingLabel(remainingMs),
      elapsedPercent: parseFloat(elapsedPercent),
      retentionDays: 3,
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function deleteBackup(filename) {
  const dir = ensureBackupsDir();
  const fullPath = path.join(dir, filename);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
  const metaPath = `${fullPath}.json`;
  if (fs.existsSync(metaPath)) {
    try { fs.unlinkSync(metaPath); } catch {}
  }
}

export function pruneExpiredBackups(retentionDays = 3) {
  try {
    const dir = ensureBackupsDir();
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter(f => f.startsWith('vms_backup_') && f.endsWith('.sql.gz'));
    const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const filename of files) {
      const fullPath = path.join(dir, filename);
      const stats = fs.statSync(fullPath);
      const metaPath = `${fullPath}.json`;
      let fileTime = stats.birthtime ? stats.birthtime.getTime() : stats.mtime.getTime();

      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          if (meta.createdAt) fileTime = new Date(meta.createdAt).getTime();
        } catch {}
      }

      const ageMs = now - fileTime;

      if (ageMs > maxAgeMs) {
        fs.unlinkSync(fullPath);
        if (fs.existsSync(metaPath)) {
          try { fs.unlinkSync(metaPath); } catch {}
        }
        console.log(`[backup] Auto-deleted expired backup (>3 days old): ${filename}`);
      }
    }
  } catch (e) {
    console.warn('[backup] Error pruning expired backups:', e.message);
  }
}

