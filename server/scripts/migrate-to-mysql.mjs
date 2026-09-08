import { DatabaseSync } from 'node:sqlite';
import mysql from 'mysql2/promise';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.VMS_DB_PATH || path.resolve(__dirname, '../../data/vms.db');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'srv1497.hstgr.io',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'u403881955_vms_admin',
  password: process.env.DB_PASSWORD || 'VmsAdmin#2026Secure',
  database: process.env.DB_NAME || 'u403881955_vms',
};

const ISO_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?Z?$/;
function normalizeValue(v) {
  if (typeof v === 'string') {
    const m = v.match(ISO_RE);
    if (m) return `${m[1]} ${m[2]}`;
  }
  return v === undefined ? null : v;
}

async function migrate() {
  console.log(`[migrate] Opening SQLite: ${DB_PATH}`);
  const sqlite = new DatabaseSync(DB_PATH);

  console.log(`[migrate] Connecting to MySQL ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}...`);
  const conn = await mysql.createConnection(DB_CONFIG);
  console.log('[migrate] Connected to MySQL.');

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');

  // 1. Migrate Polling Parts
  console.log('[migrate] Migrating polling_parts...');
  const parts = sqlite.prepare('SELECT * FROM polling_parts').all();
  if (parts.length > 0) {
    const cols = Object.keys(parts[0]);
    const placeholders = `(${cols.map(() => '?').join(', ')})`;
    const sql = `INSERT INTO vms_polling_parts (${cols.join(', ')}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${cols.map(c => `${c}=VALUES(${c})`).join(', ')}`;
    for (const p of parts) {
      await conn.query(sql, Object.values(p).map(normalizeValue));
    }
    console.log(`[migrate] Migrated ${parts.length} polling_parts.`);
  }

  // 2. Migrate Masters
  const masters = ['caste_master', 'job_master', 'party_master', 'education_master', 'survey_field_defs'];
  for (const m of masters) {
    try {
      const rows = sqlite.prepare(`SELECT * FROM ${m}`).all();
      if (rows.length > 0) {
        console.log(`[migrate] Migrating ${m} (${rows.length} rows)...`);
        const cols = Object.keys(rows[0]);
        const placeholders = `(${cols.map(() => '?').join(', ')})`;
        const sql = `INSERT INTO vms_${m} (${cols.join(', ')}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${cols.map(c => `${c}=VALUES(${c})`).join(', ')}`;
        for (const r of rows) {
          await conn.query(sql, Object.values(r).map(normalizeValue));
        }
      }
    } catch (e) {
      console.warn(`[migrate] Skip master ${m}: ${e.message}`);
    }
  }

  // 3. Migrate Users & Jurisdictions
  console.log('[migrate] Migrating users...');
  const users = sqlite.prepare('SELECT * FROM users').all();
  for (const u of users) {
    const cols = Object.keys(u);
    const sql = `INSERT INTO vms_users (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${cols.map(c => `${c}=VALUES(${c})`).join(', ')}`;
    await conn.query(sql, Object.values(u).map(normalizeValue));
  }
  console.log(`[migrate] Migrated ${users.length} users.`);

  const jurisdictions = sqlite.prepare('SELECT * FROM user_jurisdictions').all();
  if (jurisdictions.length > 0) {
    for (const j of jurisdictions) {
      const cols = Object.keys(j);
      const sql = `INSERT INTO vms_user_jurisdictions (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${cols.map(c => `${c}=VALUES(${c})`).join(', ')}`;
      await conn.query(sql, Object.values(j).map(normalizeValue));
    }
    console.log(`[migrate] Migrated ${jurisdictions.length} user_jurisdictions.`);
  }

  // 4. Migrate voters_master in batches of 2000
  const countRow = sqlite.prepare('SELECT COUNT(*) as c FROM voters_master').get();
  const totalVoters = countRow.c;
  console.log(`[migrate] Migrating voters_master: ${totalVoters} rows total in batches of 2,000...`);

  const BATCH_SIZE = 2000;
  const sample = sqlite.prepare('SELECT * FROM voters_master LIMIT 1').get();
  const voterCols = Object.keys(sample);
  const rowPlaceholder = `(${voterCols.map(() => '?').join(', ')})`;

  let offset = 0;
  let batchIndex = 0;
  const startTime = Date.now();

  while (offset < totalVoters) {
    const batch = sqlite.prepare(`SELECT * FROM voters_master LIMIT ? OFFSET ?`).all(BATCH_SIZE, offset);
    if (!batch.length) break;

    const values = [];
    for (const row of batch) {
      for (const col of voterCols) {
        values.push(normalizeValue(row[col]));
      }
    }

    const placeholders = batch.map(() => rowPlaceholder).join(', ');
    const insertSql = `INSERT IGNORE INTO vms_voters_master (${voterCols.join(', ')}) VALUES ${placeholders}`;
    await conn.query(insertSql, values);

    offset += batch.length;
    batchIndex++;
    if (batchIndex % 10 === 0 || offset >= totalVoters) {
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const pct = ((offset / totalVoters) * 100).toFixed(1);
      console.log(`[migrate] Inserted ${offset} / ${totalVoters} voters (${pct}%) in ${elapsedSec}s...`);
    }
  }

  const [voterCount] = await conn.query('SELECT COUNT(*) as c FROM vms_voters_master');
  console.log(`[migrate] Total voters in MySQL vms_voters_master: ${voterCount[0].c}`);

  // 5. Migrate Surveys & Field Values
  const surveys = sqlite.prepare('SELECT * FROM voter_surveys').all();
  if (surveys.length > 0) {
    console.log(`[migrate] Migrating ${surveys.length} voter_surveys...`);
    for (const s of surveys) {
      const cols = Object.keys(s);
      const sql = `INSERT INTO vms_voter_surveys (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${cols.map(c => `${c}=VALUES(${c})`).join(', ')}`;
      await conn.query(sql, Object.values(s).map(normalizeValue));
    }
    console.log(`[migrate] Migrated ${surveys.length} voter_surveys.`);
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();
  console.log('[migrate] Migration to MySQL completed successfully!');
}

migrate().catch(err => {
  console.error('[migrate] Migration failed:', err);
  process.exit(1);
});
