import mysql from 'mysql2/promise';
import crypto from 'node:crypto';

export const DB_HOST = process.env.DB_HOST || 'srv1497.hstgr.io';
export const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
export const DB_USER = process.env.DB_USER || 'u403881955_ecl_admin';
export const DB_PASSWORD = process.env.DB_PASSWORD || 'ECLAdmin@2026';
export const DB_NAME = process.env.DB_NAME || 'u403881955_ECL';

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
});

const VMS_TABLES = [
  'voters_master', 'polling_parts', 'users', 'user_jurisdictions',
  'caste_master', 'job_master', 'party_master', 'education_master',
  'survey_field_defs', 'survey_field_values', 'voter_surveys',
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
  s = s.replace(/ON CONFLICT\s*\([^)]*\)\s*DO NOTHING/gi, 'ON DUPLICATE KEY UPDATE id=id');
  s = s.replace(/ON CONFLICT\s+DO NOTHING/gi, 'ON DUPLICATE KEY UPDATE id=id');
  s = s.replace(/COLLATE\s+NOCASE/gi, '');
  return s;
}

function flatParams(args) {
  const arr = (args.length === 1 && Array.isArray(args[0])) ? args[0] : args;
  return arr.map(v => v === undefined ? null : v);
}

export const db = {
  prepare(sql) {
    const translated = translateSql(sql);
    return {
      async get(...params) {
        const [rows] = await pool.query(translated, flatParams(params));
        return rows[0] || null;
      },
      async all(...params) {
        const [rows] = await pool.query(translated, flatParams(params));
        return rows;
      },
      async run(...params) {
        const [result] = await pool.query(translated, flatParams(params));
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
    await pool.query(translateSql(sql));
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
    const [existing] = await pool.query('SELECT id FROM vms_users WHERE mobile_number = ?', ['8144928022']);
    if (!existing.length) {
      const salt = crypto.randomBytes(16).toString('hex');
      const derived = crypto.scryptSync('admin123', salt, 64).toString('hex');
      const hash = 'scrypt$' + salt + '$' + derived;
      await pool.query(
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
