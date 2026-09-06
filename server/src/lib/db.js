import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '../../../data');
export const DB_PATH = process.env.VMS_DB_PATH || path.join(DATA_DIR, 'vms.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA synchronous = NORMAL');
db.exec('PRAGMA cache_size = -32000');   // 32 MB page cache
db.exec('PRAGMA temp_store = MEMORY');

// Registered here — not only in outbox.js's migrateOutbox() — because a SQL
// function registration lives on the connection, in memory, and is never
// persisted the way a trigger is. Any process that opens this database file
// (the server, `npm run seed`, `npm run import`, a future one-off script)
// gets a fresh connection with no functions registered yet; if the sync
// outbox's trigger schema already exists (created by an earlier server run)
// and that process writes to a synced table without this, every such write
// fails with "no such function: vms_uuid". Registering it unconditionally
// right here means that can never happen, regardless of what the caller
// remembers to call.
db.function('vms_uuid', () => crypto.randomUUID());

/**
 * Schema for the Voter Management & Field Survey System.
 *
 * Jurisdiction is anchored on the polling part (booth), which is how the
 * Election Commission actually partitions an electorate: a supervisor owns a
 * set of booths, an agent owns one. Local body (panchayat/town) is an attribute
 * of the booth rather than a level of the permission tree, so a booth is never
 * reachable through two different paths.
 */
export function migrate() {
  db.exec(`
    -- ===================== POLLING PARTS (booths) =====================
    CREATE TABLE IF NOT EXISTS polling_parts (
      part_no             INTEGER PRIMARY KEY,
      ac_no               TEXT NOT NULL,
      ac_name_ta          TEXT,
      pc_no               TEXT,
      pc_name_ta          TEXT,
      local_body_name_ta  TEXT NOT NULL,
      local_body_type     TEXT NOT NULL CHECK (local_body_type IN ('TOWN_PANCHAYAT','VILLAGE_PANCHAYAT')),
      main_village_ta     TEXT,
      ward_ta             TEXT,
      taluk_ta            TEXT,
      district_ta         TEXT,
      pincode             TEXT,
      section_details_ta  TEXT,
      revision_year       TEXT
    );

    -- ===================== VOTERS MASTER (electoral roll) =====================
    CREATE TABLE IF NOT EXISTS voters_master (
      epic_id            TEXT PRIMARY KEY,
      voter_sno          INTEGER,
      part_no            INTEGER NOT NULL REFERENCES polling_parts(part_no) ON DELETE CASCADE,
      name_ta            TEXT NOT NULL,
      relation_type_ta   TEXT,
      relative_name_ta   TEXT,
      door_no            TEXT,
      age                INTEGER,
      gender             TEXT,
      section_title_ta   TEXT,
      roll_type_ta       TEXT,
      is_supplement      INTEGER DEFAULT 0,
      is_deleted         INTEGER DEFAULT 0,
      deletion_reason    TEXT,
      page_number        INTEGER
    );

    -- ===================== USERS & AUTH =====================
    CREATE TABLE IF NOT EXISTS users (
      id             TEXT PRIMARY KEY,
      mobile_number  TEXT NOT NULL UNIQUE,
      password_hash  TEXT NOT NULL,
      role           TEXT NOT NULL CHECK (role IN ('A1_SUPER_ADMIN','A2_SUPERVISOR','A3_FIELD_AGENT')),
      epic_id        TEXT,
      full_name      TEXT,
      is_active      INTEGER DEFAULT 1,
      created_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at     TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      last_login_at  TEXT,
      last_seen_at   TEXT
    );

    -- Booth-level scope. A1 holds no rows here (global by role).
    CREATE TABLE IF NOT EXISTS user_jurisdictions (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id  TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      part_no  INTEGER NOT NULL REFERENCES polling_parts(part_no) ON DELETE CASCADE,
      UNIQUE (user_id, part_no)
    );

    -- ===================== MASTER DATA =====================
    -- Reservation category drives community-wise reporting.
    CREATE TABLE IF NOT EXISTS caste_master (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      name_ta    TEXT,
      category   TEXT NOT NULL DEFAULT 'BC'
                 CHECK (category IN ('OC','BC','BCM','MBC','SC','ST','OTHER')),
      is_active  INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    -- Two tiers in one table: "category" is the sector, "name" the sub-job.
    CREATE TABLE IF NOT EXISTS job_master (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      category    TEXT NOT NULL,
      category_ta TEXT,
      name        TEXT NOT NULL,
      name_ta     TEXT,
      is_active   INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE (category, name)
    );

    -- symbol_img holds a self-contained Base64 data URL, so emblems render with
    -- no CDN, no file server and no broken-image states.
    CREATE TABLE IF NOT EXISTS party_master (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      name_ta     TEXT,
      party_code  TEXT NOT NULL UNIQUE,
      color_code  TEXT DEFAULT '#64748b',
      symbol_img  TEXT,
      is_active   INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS education_master (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      name_ta     TEXT,
      is_active   INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    -- ===================== CUSTOM SURVEY FIELDS (A1-managed form builder) =====
    -- Field definitions an A1 can add/edit/reorder/disable without a code
    -- change. "options_json" is only meaningful for field_type='select': a
    -- JSON array of plain strings the agent picks from.
    CREATE TABLE IF NOT EXISTS survey_field_defs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      field_key     TEXT NOT NULL UNIQUE,
      label         TEXT NOT NULL,
      label_ta      TEXT,
      field_type    TEXT NOT NULL DEFAULT 'text' CHECK (field_type IN ('text','number','date','select')),
      options_json  TEXT,
      is_required   INTEGER NOT NULL DEFAULT 0,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    -- One row per (survey, custom field) answer. Deleting the survey or the
    -- field definition cleans up its answers automatically.
    CREATE TABLE IF NOT EXISTS survey_field_values (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      epic_id    TEXT    NOT NULL REFERENCES voter_surveys(epic_id) ON DELETE CASCADE,
      field_id   INTEGER NOT NULL REFERENCES survey_field_defs(id) ON DELETE CASCADE,
      value      TEXT,
      UNIQUE (epic_id, field_id)
    );

    -- ===================== SURVEY RECORDS =====================
    -- One survey per elector: epic_id is the primary key, so a re-survey is an
    -- UPSERT rather than a duplicate row.
    CREATE TABLE IF NOT EXISTS voter_surveys (
      epic_id                  TEXT PRIMARY KEY
                               REFERENCES voters_master(epic_id) ON DELETE CASCADE,
      corrected_name_ta        TEXT,
      corrected_relative_name_ta TEXT,
      phone_number             TEXT NOT NULL,
      caste_id                 INTEGER REFERENCES caste_master(id),
      job_id                   INTEGER REFERENCES job_master(id),
      party_id                 INTEGER REFERENCES party_master(id),
      education_id             INTEGER REFERENCES education_master(id),
      other_job_text           TEXT,
      remarks                  TEXT,
      surveyed_by              TEXT REFERENCES users(id) ON DELETE SET NULL,
      last_updated_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
      surveyed_at              TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at               TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT,
      action     TEXT NOT NULL,
      entity     TEXT,
      entity_id  TEXT,
      detail     TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    -- ===================== INDEXES =====================
    CREATE INDEX IF NOT EXISTS idx_vm_part_no   ON voters_master(part_no);
    CREATE INDEX IF NOT EXISTS idx_vm_part_live ON voters_master(part_no, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_vm_name      ON voters_master(name_ta);
    CREATE INDEX IF NOT EXISTS idx_vm_relative  ON voters_master(relative_name_ta);
    CREATE INDEX IF NOT EXISTS idx_vm_door      ON voters_master(door_no);
    CREATE INDEX IF NOT EXISTS idx_vm_gender    ON voters_master(gender);
    CREATE INDEX IF NOT EXISTS idx_vm_sno       ON voters_master(part_no, voter_sno);
    CREATE INDEX IF NOT EXISTS idx_pp_local     ON polling_parts(local_body_name_ta);
    CREATE INDEX IF NOT EXISTS idx_vs_party     ON voter_surveys(party_id);
    CREATE INDEX IF NOT EXISTS idx_vs_agent     ON voter_surveys(surveyed_by);
    CREATE INDEX IF NOT EXISTS idx_vs_at        ON voter_surveys(surveyed_at);
    CREATE INDEX IF NOT EXISTS idx_uj_user      ON user_jurisdictions(user_id);
    CREATE INDEX IF NOT EXISTS idx_uj_part      ON user_jurisdictions(part_no);
    CREATE INDEX IF NOT EXISTS idx_audit_user   ON audit_log(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sfv_epic     ON survey_field_values(epic_id);
    CREATE INDEX IF NOT EXISTS idx_sfv_field    ON survey_field_values(field_id);
    CREATE INDEX IF NOT EXISTS idx_sfd_sort     ON survey_field_defs(sort_order);
  `);

  // `CREATE TABLE IF NOT EXISTS` above only shapes a brand-new database — an
  // existing users/voter_surveys table from before this feature set predates
  // these columns and needs them added explicitly. SQLite has no
  // "ADD COLUMN IF NOT EXISTS", so check PRAGMA table_info first.
  ensureColumn('users', 'last_seen_at', 'TEXT');
  ensureColumn('voter_surveys', 'education_id', 'INTEGER REFERENCES education_master(id)');
  ensureColumn('voter_surveys', 'last_updated_by', 'TEXT REFERENCES users(id) ON DELETE SET NULL');
  ensureEducationDefaults();
}

const DEFAULT_EDUCATION = [
  ['Illiterate', 'எழுத்தறிவு இல்லாதவர்'],
  ['Primary (1st–5th)', 'தொடக்கக் கல்வி (1-5 ஆம் வகுப்பு)'],
  ['Middle School (6th–8th)', 'நடுநிலைக் கல்வி (6-8 ஆம் வகுப்பு)'],
  ['10th / SSLC', '10 ஆம் வகுப்பு / எஸ்.எஸ்.எல்.சி'],
  ['12th / HSC', '12 ஆம் வகுப்பு / உயர்நிலைக் கல்வி'],
  ['Diploma / ITI', 'பட்டயம் / ஐ.டி.ஐ'],
  ['Graduate (BA/BSc/BCom)', 'பட்டதாரி (பி.ஏ/பி.எஸ்.சி/பி.காம்)'],
  ['Engineering (BE/BTech)', 'பொறியியல் பட்டதாரி (பி.இ/பி.டெக்)'],
  ['Postgraduate (MA/MSc/MTech)', 'முதுகலைப் பட்டதாரி (எம்.ஏ/எம்.எஸ்.சி/எம்.டெக்)'],
  ['Professional (MBBS/LLB/MBA/CA)', 'தொழில்முறைப் படிப்பு (எம்.பி.பி.எஸ்/எல்.எல்.பி/எம்.பி.ஏ/சி.ஏ)'],
  ['PhD / Doctorate', 'முனைவர் பட்டம் (பிஎச்.டி)'],
  ['Not Disclosed', 'தெரிவிக்கவில்லை'],
];

function ensureEducationDefaults() {
  const c = db.prepare('SELECT COUNT(*) c FROM education_master').get().c;
  if (c === 0) {
    const insert = db.prepare('INSERT INTO education_master (name, name_ta, is_active) VALUES (?, ?, 1) ON CONFLICT(name) DO NOTHING');
    for (const [name, nameTa] of DEFAULT_EDUCATION) {
      insert.run(name, nameTa);
    }
  }
}

function ensureColumn(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (existing.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/** Refreshes planner statistics so scoped queries pick the right index. */
export function analyze() {
  try {
    db.exec('ANALYZE');
  } catch {
    /* statistics are an optimisation, never a hard requirement */
  }
}

export const nowIso = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();
