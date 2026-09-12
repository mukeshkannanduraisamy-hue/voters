import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '../../../data');

export const DB_HOST = process.env.DB_HOST || 'srv1497.hstgr.io';
export const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
export const DB_USER = process.env.DB_USER || 'u403881955_vms_admin';
export const DB_PASSWORD = process.env.DB_PASSWORD || 'VmsAdmin#2026Secure';
export const DB_NAME = process.env.DB_NAME || 'u403881955_vms';

export const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  maxIdle: 3,
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  dateStrings: true,
  multipleStatements: true,
  ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false },
});

const VMS_TABLES = [
  'voters_master', 'polling_parts', 'users', 'user_jurisdictions',
  'caste_master', 'job_master', 'party_master', 'education_master',
  'survey_field_defs', 'survey_field_values', 'voter_surveys',
  'form_schemas', 'master_categories', 'master_items', 'survey_answers',
  'app_meta', 'audit_log', 'sync_outbox'
];
const TABLE_REGEX = new RegExp(`\\b(${VMS_TABLES.join('|')})\\b`, 'g');

export function translateSql(sql) {
  let s = sql.replace(TABLE_REGEX, 'vms_$1');
  s = s.replace(/strftime\([^)]+\)/gi, 'NOW()');
  s = s.replace(/datetime\('now',\s*['"]-(\d+)\s*days?['"]\)/gi, 'DATE_SUB(NOW(), INTERVAL $1 DAY)');
  s = s.replace(/datetime\('now'\)/gi, 'NOW()');
  s = s.replace(/ON CONFLICT\s*\([^)]*\)\s*DO UPDATE SET/gi, 'ON DUPLICATE KEY UPDATE');
  s = s.replace(/excluded\.(\w+)/gi, 'VALUES($1)');
  s = s.replace(/ON CONFLICT\s*\((\w+)[^)]*\)\s*DO NOTHING/gi, 'ON DUPLICATE KEY UPDATE $1=$1');
  s = s.replace(/ON CONFLICT\s+DO NOTHING/gi, (match) => {
    const m = s.match(/INSERT\s+INTO\s+\S+\s*\((\w+)/i);
    return `ON DUPLICATE KEY UPDATE ${m ? m[1] : 'id'}=${m ? m[1] : 'id'}`;
  });
  s = s.replace(/COLLATE\s+NOCASE/gi, '');
  return s;
}

function flatParams(args) {
  const arr = (args.length === 1 && Array.isArray(args[0])) ? args[0] : args;
  return arr.map(v => v === undefined ? null : v);
}

// Render's free tier fully suspends this process when idle. Any connection
// the pool was holding at the moment of suspension is stale by the time a
// request wakes it back up — the remote MySQL server has long since closed
// it — but mysql2 doesn't know that until it actually tries to use it, so
// the *first* query after a cold start fails with ECONNRESET/PROTOCOL_
// CONNECTION_LOST/ETIMEDOUT even though the database itself is perfectly
// healthy (confirmed: the very next request always succeeds). Retrying once
// transparently absorbs exactly that one-time failure instead of surfacing
// it to the user as a 500.
const TRANSIENT_CODES = new Set([
  'PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED',
  'EPIPE', 'PROTOCOL_SEQUENCE_TIMEOUT',
]);

async function poolQuery(sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (!TRANSIENT_CODES.has(err.code)) throw err;
    await new Promise((r) => setTimeout(r, 150));
    return await pool.query(sql, params);
  }
}

export const db = {
  prepare(sql) {
    const translated = translateSql(sql);
    return {
      async get(...params) {
        const [rows] = await poolQuery(translated, flatParams(params));
        return rows[0] || null;
      },
      async all(...params) {
        const [rows] = await poolQuery(translated, flatParams(params));
        return rows;
      },
      async run(...params) {
        const [result] = await poolQuery(translated, flatParams(params));
        return {
          changes: result.affectedRows ?? 0,
          lastInsertRowid: result.insertId ?? null,
        };
      },
      async *iterate(...params) {
        const conn = await pool.getConnection();
        try {
          const stream = conn.connection.query(translated, flatParams(params)).stream();
          for await (const row of stream) {
            yield row;
          }
        } finally {
          conn.release();
        }
      }
    };
  },
  async exec(sql) {
    const s = sql.trim();
    if (s.toUpperCase() === 'BEGIN' || s.toUpperCase() === 'COMMIT' || s.toUpperCase() === 'ROLLBACK') {
      return;
    }
    await poolQuery(translateSql(sql));
  }
};

export async function withTransaction(callback) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const trxDb = {
      prepare(sql) {
        const translated = translateSql(sql);
        return {
          async get(...params) {
            const [rows] = await conn.query(translated, flatParams(params));
            return rows[0] || null;
          },
          async all(...params) {
            const [rows] = await conn.query(translated, flatParams(params));
            return rows;
          },
          async run(...params) {
            const [result] = await conn.query(translated, flatParams(params));
            return {
              changes: result.affectedRows ?? 0,
              lastInsertRowid: result.insertId ?? null,
            };
          }
        };
      },
      async exec(sql) {
        await conn.query(translateSql(sql));
      }
    };
    const result = await callback(trxDb);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function migrate() {
  console.log(`[db] Connected to MySQL (${DB_HOST}:${DB_PORT}/${DB_NAME})`);
  // Ensure Super Admin exists
  try {
    const [existing] = await poolQuery('SELECT id FROM vms_users WHERE mobile_number = ?', ['8144928022']);
    if (!existing.length) {
      const salt = crypto.randomBytes(16).toString('hex');
      const derived = crypto.scryptSync('admin123', salt, 64).toString('hex');
      const hash = 'scrypt$' + salt + '$' + derived;
      await poolQuery(
        'INSERT INTO vms_users (id, mobile_number, password_hash, role, full_name, is_active) VALUES (?, ?, ?, ?, ?, 1)',
        [crypto.randomUUID(), '8144928022', hash, 'A1_SUPER_ADMIN', 'Super Admin']
      );
      console.log('[db] Created initial Super Admin 8144928022 in MySQL.');
    }
  } catch (e) {
    console.warn('[db] Super admin check failed:', e.message);
  }
}

export function analyze() {
  // MySQL table analysis (optional background optimization)
  pool.query('ANALYZE TABLE vms_voters_master, vms_voter_surveys').catch(() => {});
}

export const nowIso = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();
