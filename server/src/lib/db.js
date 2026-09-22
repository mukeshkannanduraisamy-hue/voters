import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { requireEnv } from './env.js';
import { DEFAULT_FIELDS } from './formDefaults.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '../../../data');
export const SQLITE_PATH = path.resolve(DATA_DIR, 'vms.db');

export const DB_HOST = requireEnv('DB_HOST', 'srv1497.hstgr.io');
export const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10); // not a secret — the standard MySQL port is a safe default
export const DB_USER = requireEnv('DB_USER', 'u403881955_vms_admin');
export const DB_PASSWORD = requireEnv('DB_PASSWORD', 'VmsAdmin#2026Secure');
export const DB_NAME = requireEnv('DB_NAME', 'u403881955_vms');

export let isSqliteMode = (
  process.env.USE_SQLITE === 'true' ||
  process.env.DB_DIALECT === 'sqlite' ||
  DB_HOST === 'sqlite'
);

let sqliteDb = null;
export function getSqliteDb() {
  if (!sqliteDb) {
    if (!fs.existsSync(SQLITE_PATH)) {
      throw new Error(`SQLite database not found at ${SQLITE_PATH}`);
    }
    sqliteDb = new DatabaseSync(SQLITE_PATH);
    sqliteDb.function('vms_uuid', () => crypto.randomUUID());
  }
  return sqliteDb;
}

let mysqlPool = null;
export function getMysqlPool() {
  if (!mysqlPool) {
    mysqlPool = mysql.createPool({
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
      timezone: '+05:30',
      ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false },
    });
    mysqlPool.on?.('error', (err) => {
      console.warn('[mysql pool background error]', err?.code || err?.message);
    });
  }
  return mysqlPool;
}

export const pool = {
  query(sql, params) {
    return poolQuery(sql, params);
  },
  async getConnection() {
    if (!isSqliteMode) {
      return getMysqlPool().getConnection();
    }
    return {
      connection: {
        query(sql, params) {
          return {
            async *[Symbol.asyncIterator]() {
              const sdb = getSqliteDb();
              const stmt = sdb.prepare(translateSqlForSqlite(sql));
              for (const row of stmt.iterate(...flatParams(params || []))) {
                yield row;
              }
            }
          };
        }
      },
      release() {},
      async beginTransaction() {},
      async commit() {},
      async rollback() {},
    };
  },
  async end() {
    if (mysqlPool) await mysqlPool.end();
    if (sqliteDb) sqliteDb.close();
  },
  on(event, cb) {
    if (!isSqliteMode) getMysqlPool().on(event, cb);
  }
};

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

export function translateSqlForSqlite(sql) {
  let s = sql.trim();
  // Strip MySQL vms_ table prefixes
  s = s.replace(/\bvms_([a-z0-9_]+)\b/gi, '$1');
  // NOW() -> datetime('now', 'localtime')
  s = s.replace(/\bNOW\(\)/gi, "datetime('now', 'localtime')");
  // ANY_VALUE(col) -> col
  s = s.replace(/\bANY_VALUE\(([^)]+)\)/gi, '$1');
  // DATE_SUB(NOW(), INTERVAL x DAY) -> datetime('now', 'localtime', '-x days')
  s = s.replace(/\bDATE_SUB\(NOW\(\),\s*INTERVAL\s*(\d+)\s*DAYS?\)/gi, "datetime('now', 'localtime', '-$1 days')");
  // ON DUPLICATE KEY UPDATE in voter_surveys -> ON CONFLICT (epic_id) DO UPDATE SET
  s = s.replace(/INSERT\s+INTO\s+(?:vms_)?voter_surveys\s*([\s\S]*?)\s*ON DUPLICATE KEY UPDATE/gi,
    (m, pre) => `INSERT INTO voter_surveys ${pre} ON CONFLICT (epic_id) DO UPDATE SET`);
  // ON DUPLICATE KEY UPDATE in survey_answers -> ON CONFLICT (epic_id, field_key) DO UPDATE SET
  s = s.replace(/INSERT\s+INTO\s+(?:vms_)?survey_answers\s*([\s\S]*?)\s*ON DUPLICATE KEY UPDATE/gi,
    (m, pre) => `INSERT INTO survey_answers ${pre} ON CONFLICT (epic_id, field_key) DO UPDATE SET`);
  // Generic VALUES(col) -> excluded.col
  s = s.replace(/\bVALUES\((\w+)\)/gi, 'excluded.$1');
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
  'EPIPE', 'PROTOCOL_SEQUENCE_TIMEOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH',
]);

async function poolQuery(sql, params = [], retries = 2) {
  if (isSqliteMode) {
    const cleanSql = translateSqlForSqlite(sql);
    const sdb = getSqliteDb();
    const stmt = sdb.prepare(cleanSql);
    const fp = flatParams(params || []);
    const upper = cleanSql.trim().toUpperCase();
    if (upper.startsWith('SELECT') || upper.startsWith('PRAGMA') || upper.startsWith('DESCRIBE') || upper.startsWith('EXPLAIN')) {
      const rows = stmt.all(...fp);
      return [rows, []];
    }
    const res = stmt.run(...fp);
    return [{ affectedRows: res.changes, insertId: res.lastInsertRowid != null ? Number(res.lastInsertRowid) : null }, []];
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await getMysqlPool().query(sql, params);
    } catch (err) {
      if (fs.existsSync(SQLITE_PATH) && (err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT')) {
        console.warn(`[db] Remote MySQL connection failed (${err.code}). Falling back to local SQLite: ${SQLITE_PATH}`);
        isSqliteMode = true;
        return poolQuery(sql, params);
      }
      if (!TRANSIENT_CODES.has(err.code) || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
}

export const db = {
  prepare(sql) {
    if (isSqliteMode) {
      const cleanSql = translateSqlForSqlite(sql);
      const stmt = getSqliteDb().prepare(cleanSql);
      return {
        async get(...params) {
          return stmt.get(...flatParams(params)) ?? null;
        },
        async all(...params) {
          return stmt.all(...flatParams(params));
        },
        async run(...params) {
          const res = stmt.run(...flatParams(params));
          return {
            changes: res.changes,
            lastInsertRowid: res.lastInsertRowid != null ? Number(res.lastInsertRowid) : null,
          };
        },
        async *iterate(...params) {
          for (const row of stmt.iterate(...flatParams(params))) {
            yield row;
          }
        }
      };
    }

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
    if (isSqliteMode) {
      const s = sql.trim();
      if (s.toUpperCase() === 'BEGIN' || s.toUpperCase() === 'COMMIT' || s.toUpperCase() === 'ROLLBACK') {
        return;
      }
      getSqliteDb().exec(translateSqlForSqlite(sql));
      return;
    }
    const s = sql.trim();
    if (s.toUpperCase() === 'BEGIN' || s.toUpperCase() === 'COMMIT' || s.toUpperCase() === 'ROLLBACK') {
      return;
    }
    await poolQuery(translateSql(sql));
  }
};

export async function withTransaction(callback) {
  if (isSqliteMode) {
    const sdb = getSqliteDb();
    sdb.exec('BEGIN');
    try {
      const trxDb = {
        prepare(sql) {
          const cleanSql = translateSqlForSqlite(sql);
          const stmt = sdb.prepare(cleanSql);
          return {
            async get(...params) { return stmt.get(...flatParams(params)) ?? null; },
            async all(...params) { return stmt.all(...flatParams(params)); },
            async run(...params) {
              const res = stmt.run(...flatParams(params));
              return {
                changes: res.changes,
                lastInsertRowid: res.lastInsertRowid != null ? Number(res.lastInsertRowid) : null,
              };
            },
            async *iterate(...params) {
              for (const row of stmt.iterate(...flatParams(params))) {
                yield row;
              }
            },
          };
        },
        async exec(sql) { sdb.exec(translateSqlForSqlite(sql)); },
      };
      const result = await callback(trxDb);
      sdb.exec('COMMIT');
      return result;
    } catch (err) {
      try { sdb.exec('ROLLBACK'); } catch {}
      throw err;
    }
  }

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
    try { await conn.rollback(); } catch {}
    throw err;
  } finally {
    try { conn.release(); } catch {}
  }
}

/**
 * First-deployment bootstrap only: if the database has literally zero A1
 * accounts, create exactly one with a random password so there is *some* way
 * to log in and create real accounts.
 */
export async function migrate() {
  if (isSqliteMode) {
    console.log(`[db] Connected to local SQLite (${SQLITE_PATH})`);
  } else {
    console.log(`[db] Connected to MySQL (${DB_HOST}:${DB_PORT}/${DB_NAME})`);
  }
  try {
    const [admins] = await poolQuery("SELECT id FROM users WHERE role = 'A1_SUPER_ADMIN' LIMIT 1");
    if (!admins || !admins.length) {
      const mobile = process.env.BOOTSTRAP_ADMIN_MOBILE || '9999999999';
      const password = crypto.randomBytes(9).toString('base64url');
      const salt = crypto.randomBytes(16).toString('hex');
      const derived = crypto.scryptSync(password, salt, 64).toString('hex');
      const hash = 'scrypt$' + salt + '$' + derived;
      await poolQuery(
        'INSERT INTO users (id, mobile_number, password_hash, role, full_name, is_active) VALUES (?, ?, ?, ?, ?, 1)',
        [crypto.randomUUID(), mobile, hash, 'A1_SUPER_ADMIN', 'Super Admin']
      );
      console.log('='.repeat(72));
      console.log('[db] No Super Admin existed — created a one-time bootstrap account:');
      console.log(`[db]   mobile:   ${mobile}`);
      console.log(`[db]   password: ${password}`);
      console.log('[db] Log in now and set a real password immediately.');
      console.log('='.repeat(72));
    }
  } catch (e) {
    console.warn('[db] Super admin bootstrap check failed:', e.message);
  }

  try {
    const [pubRows] = await poolQuery("SELECT id, version, fields_json FROM form_schemas WHERE status = 'published' ORDER BY version DESC LIMIT 1");
    if (pubRows && pubRows.length > 0) {
      const fields = JSON.parse(pubRows[0].fields_json || '[]');
      const needsUpdate = fields.some((f) => f.key === 'job_sector' || f.key === 'other_job_text' || (f.key === 'job_id' && (f.source?.parentField || f.label === 'Specific sub-job')));
      if (needsUpdate) {
        const [maxRows] = await poolQuery('SELECT COALESCE(MAX(version), 0) AS v FROM form_schemas');
        const nextVer = Number(maxRows[0]?.v ?? 0) + 1;
        await poolQuery("UPDATE form_schemas SET status = 'archived' WHERE status = 'published'");
        await poolQuery(
          `INSERT INTO form_schemas (version, status, title, title_ta, fields_json, change_summary, published_at)
           VALUES (?, 'published', 'Voter Field Survey', 'வாக்காளர் கள கணக்கெடுப்பு', ?, 'Simplified Occupation: removed sub-job and custom job note, streamlined Education & Occupation dropdowns', NOW())`,
          [nextVer, JSON.stringify(DEFAULT_FIELDS)]
        );
        await poolQuery(
          "UPDATE form_schemas SET fields_json = ? WHERE version = 0",
          [JSON.stringify(DEFAULT_FIELDS)]
        );
        console.log(`[db] Form schema auto-updated to v${nextVer}: simplified Occupation, removed sub-job and custom job note`);
      }
    }
  } catch (e) {
    console.warn('[db] Auto-sync form schema check warning:', e.message);
  }

  // Clear all survey entries as requested by user (one-time execution)
  try {
    const [cleared] = await poolQuery("SELECT 1 FROM audit_log WHERE action = 'CLEAR_ALL_SURVEYS_REQ_2026_09_21' LIMIT 1");
    if (!cleared || !cleared.length) {
      await poolQuery('DELETE FROM survey_answers');
      await poolQuery('DELETE FROM survey_field_values');
      const [delSurv] = await poolQuery('DELETE FROM voter_surveys');
      await poolQuery("DELETE FROM audit_log WHERE entity IN ('voter_survey', 'survey_answers', 'survey_field_values')");
      try {
        await poolQuery("DELETE FROM sync_outbox WHERE table_name IN ('voter_surveys', 'survey_answers')");
      } catch {}
      await poolQuery(
        "INSERT INTO audit_log (id, user_id, action, entity, entity_id, details, created_at) VALUES (?, 'system', 'CLEAR_ALL_SURVEYS_REQ_2026_09_21', 'voter_surveys', 'all', ?, NOW())",
        [crypto.randomUUID(), `Cleared ${delSurv?.affectedRows ?? 0} voter surveys`]
      );
      console.log(`[db] Cleared all survey entries (${delSurv?.affectedRows ?? 0} rows deleted)`);
    }
  } catch (e) {
    console.warn('[db] Survey clearance warning:', e.message);
  }
}

export function analyze() {
  // MySQL table analysis (optional background optimization)
  pool.query('ANALYZE TABLE vms_voters_master, vms_voter_surveys').catch(() => {});
}

export const nowIso = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();
