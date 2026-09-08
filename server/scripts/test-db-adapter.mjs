import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: process.env.DB_HOST || 'srv1497.hstgr.io',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'u403881955_ecl_admin',
  password: process.env.DB_PASSWORD || 'ECLAdmin@2026',
  database: process.env.DB_NAME || 'u403881955_ECL',
  waitForConnections: true,
  connectionLimit: 5,
  maxIdle: 3,
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  dateStrings: true,
};

const pool = mysql.createPool(DB_CONFIG);

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

const db = {
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

async function test() {
  console.log('[test] Testing polling_parts query...');
  const part = await db.prepare('SELECT part_no, ac_no, local_body_name_ta FROM polling_parts LIMIT 1').get();
  console.log('Part:', part);

  console.log('[test] Testing voters_master count...');
  const voterCount = await db.prepare('SELECT COUNT(*) c FROM voters_master').get();
  console.log('Voter count:', voterCount);

  console.log('[test] Testing users query...');
  const users = await db.prepare('SELECT id, mobile_number, role FROM users').all();
  console.log('Users count:', users.length, users[0]);

  console.log('[test] Testing case-insensitive COLLATE NOCASE replacement...');
  const caste = await db.prepare('SELECT 1 FROM caste_master WHERE name = ? COLLATE NOCASE').get('Vanniyar');
  console.log('Caste found:', caste);

  await pool.end();
  console.log('[test] All tests passed!');
}

test().catch(err => {
  console.error('[test] Error:', err);
  process.exit(1);
});
