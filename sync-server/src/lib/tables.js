import { SYNC_TABLES, SYNC_OPERATIONS } from '../../../shared/sync-tables.mjs';

export { SYNC_TABLES, SYNC_OPERATIONS };

/**
 * CREATE TABLE statements for every mirror table, typed for MySQL/MariaDB.
 * Column names and order intentionally match SYNC_TABLES (shared/sync-tables.mjs)
 * exactly — that's what `applyEvent` below relies on.
 *
 * No foreign keys between mirror tables: this is a read-mostly reporting
 * mirror fed by independent per-event upserts that can arrive in any order
 * (a voter_surveys event can land before the caste_master row it references
 * finishes syncing), so enforcing referential integrity centrally would only
 * cause spurious apply failures without protecting anything real — the
 * source of truth for integrity is the SQLite side, which already enforces it.
 */
const MIRROR_DDL = {
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id             CHAR(36)     NOT NULL PRIMARY KEY,
      mobile_number  VARCHAR(20)  NOT NULL,
      password_hash  VARCHAR(255) NOT NULL,
      role           VARCHAR(32)  NOT NULL,
      epic_id        VARCHAR(32)  NULL,
      full_name      VARCHAR(191) NULL,
      is_active      TINYINT(1)   NOT NULL DEFAULT 1,
      created_by     CHAR(36)     NULL,
      created_at     DATETIME     NULL,
      last_login_at  DATETIME     NULL,
      last_seen_at   DATETIME     NULL,
      INDEX idx_users_mobile (mobile_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  user_jurisdictions: `
    CREATE TABLE IF NOT EXISTS user_jurisdictions (
      id       BIGINT NOT NULL PRIMARY KEY,
      user_id  CHAR(36) NOT NULL,
      part_no  INT NOT NULL,
      INDEX idx_uj_user (user_id),
      INDEX idx_uj_part (part_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  caste_master: `
    CREATE TABLE IF NOT EXISTS caste_master (
      id          BIGINT NOT NULL PRIMARY KEY,
      name        VARCHAR(191) NOT NULL,
      name_ta     VARCHAR(191) NULL,
      category    VARCHAR(16)  NOT NULL,
      is_active   TINYINT(1)   NOT NULL DEFAULT 1,
      created_at  DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  job_master: `
    CREATE TABLE IF NOT EXISTS job_master (
      id           BIGINT NOT NULL PRIMARY KEY,
      category     VARCHAR(191) NOT NULL,
      category_ta  VARCHAR(191) NULL,
      name         VARCHAR(191) NOT NULL,
      name_ta      VARCHAR(191) NULL,
      is_active    TINYINT(1) NOT NULL DEFAULT 1,
      created_at   DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  party_master: `
    CREATE TABLE IF NOT EXISTS party_master (
      id          BIGINT NOT NULL PRIMARY KEY,
      name        VARCHAR(191) NOT NULL,
      name_ta     VARCHAR(191) NULL,
      party_code  VARCHAR(32)  NOT NULL,
      color_code  VARCHAR(16)  NULL,
      symbol_img  LONGTEXT NULL,
      is_active   TINYINT(1) NOT NULL DEFAULT 1,
      created_at  DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  education_master: `
    CREATE TABLE IF NOT EXISTS education_master (
      id          BIGINT NOT NULL PRIMARY KEY,
      name        VARCHAR(191) NOT NULL,
      name_ta     VARCHAR(191) NULL,
      is_active   TINYINT(1) NOT NULL DEFAULT 1,
      created_at  DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  voter_surveys: `
    CREATE TABLE IF NOT EXISTS voter_surveys (
      epic_id                     VARCHAR(32) NOT NULL PRIMARY KEY,
      corrected_name_ta           VARCHAR(191) NULL,
      corrected_relative_name_ta  VARCHAR(191) NULL,
      phone_number                VARCHAR(20) NOT NULL,
      caste_id                    BIGINT NULL,
      job_id                      BIGINT NULL,
      party_id                    BIGINT NULL,
      education_id                BIGINT NULL,
      other_job_text              VARCHAR(255) NULL,
      remarks                     TEXT NULL,
      surveyed_by                 CHAR(36) NULL,
      last_updated_by             CHAR(36) NULL,
      surveyed_at                 DATETIME NULL,
      updated_at                  DATETIME NULL,
      INDEX idx_vs_party (party_id),
      INDEX idx_vs_agent (surveyed_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  polling_parts: `
    CREATE TABLE IF NOT EXISTS polling_parts (
      part_no             INT NOT NULL PRIMARY KEY,
      ac_no               VARCHAR(16) NULL,
      ac_name_ta          VARCHAR(191) NULL,
      pc_no               VARCHAR(16) NULL,
      pc_name_ta          VARCHAR(191) NULL,
      local_body_name_ta  VARCHAR(191) NOT NULL,
      local_body_type     VARCHAR(32) NOT NULL,
      main_village_ta     VARCHAR(191) NULL,
      ward_ta             VARCHAR(191) NULL,
      taluk_ta            VARCHAR(191) NULL,
      district_ta         VARCHAR(191) NULL,
      pincode             VARCHAR(16) NULL,
      section_details_ta  TEXT NULL,
      revision_year       VARCHAR(16) NULL,
      INDEX idx_pp_local (local_body_name_ta)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
};

export const SYNC_EVENTS_DDL = `
  CREATE TABLE IF NOT EXISTS sync_events (
    event_id    CHAR(36)     NOT NULL PRIMARY KEY,
    table_name  VARCHAR(64)  NOT NULL,
    record_pk   VARCHAR(191) NOT NULL,
    operation   ENUM('CREATE','UPDATE','DELETE') NOT NULL,
    payload     JSON NOT NULL,
    applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sync_events_table (table_name, record_pk)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

export function mirrorDdlStatements() {
  return Object.values(MIRROR_DDL);
}

/** table/columns are always our own SYNC_TABLES whitelist — never client input. */
function buildUpsertSql(table, columns, pk) {
  const colList = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const updates = columns.filter((c) => c !== pk).map((c) => `${c} = VALUES(${c})`).join(', ');
  return `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
}

// SQLite timestamps are ISO-8601 ('2026-01-02T03:04:05.678Z'); MySQL DATETIME
// wants a plain 'YYYY-MM-DD HH:MM:SS'. Detected generically by shape, not by a
// per-column datetime allowlist, so this stays correct if a table gains a new
// timestamp column later without anyone touching this file.
const ISO_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?Z?$/;
function normalizeValue(v) {
  if (typeof v === 'string') {
    const m = v.match(ISO_RE);
    if (m) return `${m[1]} ${m[2]}`;
  }
  return v === undefined ? null : v;
}

/**
 * Applies one already-validated event to its mirror table, inside the caller's
 * transaction. Throws on failure so the caller can roll back the whole event
 * (including the sync_events ledger row) rather than leave a half-applied
 * change with no record of it.
 */
export async function applyEvent(conn, { table_name, record_pk, operation, payload }) {
  const def = SYNC_TABLES[table_name];
  if (!def) throw new Error(`Table "${table_name}" is not in the sync whitelist`);

  if (operation === 'DELETE') {
    await conn.query(`DELETE FROM ${table_name} WHERE ${def.pk} = ?`, [record_pk]);
    return;
  }

  const values = def.columns.map((c) => normalizeValue(payload?.[c]));
  const sql = buildUpsertSql(table_name, def.columns, def.pk);
  await conn.query(sql, values);
}
