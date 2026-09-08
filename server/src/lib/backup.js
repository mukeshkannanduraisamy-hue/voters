import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUPS_DIR = path.resolve(__dirname, '../../../backups');

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
  const str = String(val)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\0/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\x1a/g, '\\Z');
  return `'${str}'`;
}

export async function createDatabaseBackup(options = {}) {
  const dir = ensureBackupsDir();
  const now = new Date();
  
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
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
    await write(`-- Backup completed at: ${new Date().toISOString()}\n`);

    await new Promise((resolve, reject) => {
      gzipStream.end(() => {
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
      });
    });

    const stats = fs.statSync(filepath);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`[backup] Backup completed successfully in ${duration}s! Size: ${sizeMb} MB (${stats.size} bytes)`);

    // Prune backups older than 3 days
    pruneExpiredBackups(3);

    return {
      success: true,
      filename,
      filepath,
      sizeBytes: stats.size,
      sizeFormatted: `${sizeMb} MB`,
      durationSeconds: duration,
      createdAt: now.toISOString()
    };
  } catch (err) {
    console.error(`[backup] Backup failed:`, err);
    if (fs.existsSync(filepath)) {
      try { fs.unlinkSync(filepath); } catch {}
    }
    throw err;
  }
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function formatIST(date) {
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

function getRemainingLabel(remainingMs) {
  if (remainingMs <= 0) return 'Expiring now';
  const totalMins = Math.floor(remainingMs / (60 * 1000));
  const days = Math.floor(totalMins / (24 * 60));
  const hours = Math.floor((totalMins % (24 * 60)) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
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
    const createdDate = new Date(stats.birthtime || stats.mtime);
    const createdMs = createdDate.getTime();
    const expiresMs = createdMs + THREE_DAYS_MS;
    const expiresDate = new Date(expiresMs);
    const remainingMs = Math.max(0, expiresMs - now);

    return {
      filename,
      sizeBytes: stats.size,
      sizeFormatted: `${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
      createdAt: createdDate.toISOString(),
      createdFormatted: formatIST(createdDate),
      expiresAt: expiresDate.toISOString(),
      expiresAtFormatted: formatIST(expiresDate),
      remainingMs,
      remainingHours: Math.round(remainingMs / (3600 * 1000)),
      remainingLabel: getRemainingLabel(remainingMs),
      retentionDays: 3,
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
      const fileTime = new Date(stats.birthtime || stats.mtime).getTime();
      const ageMs = now - fileTime;

      if (ageMs > maxAgeMs) {
        fs.unlinkSync(fullPath);
        console.log(`[backup] Auto-deleted expired backup (>3 days old): ${filename}`);
      }
    }
  } catch (e) {
    console.warn('[backup] Error pruning expired backups:', e.message);
  }
}

