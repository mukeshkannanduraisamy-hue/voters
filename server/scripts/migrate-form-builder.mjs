/**
 * Creates the Dynamic Form Builder + Master Data Hub schema, and seeds the
 * first form version from the survey form as it exists today.
 *
 *   node scripts/migrate-form-builder.mjs
 *
 * Safe to re-run: every statement is IF NOT EXISTS / idempotent, and the seed
 * only runs when no schema version exists yet.
 */
import { pool } from '../src/lib/db.js';
import { DEFAULT_FIELDS } from '../src/lib/formDefaults.js';

const ddl = [
  // ---- versioned form definitions -----------------------------------------
  // One row per version. version 0 is the mutable working draft; every publish
  // freezes a numbered, immutable snapshot so an old survey can always be
  // explained by the schema that was live when it was answered.
  `CREATE TABLE IF NOT EXISTS vms_form_schemas (
     id             BIGINT AUTO_INCREMENT PRIMARY KEY,
     version        INT NOT NULL,
     status         ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
     title          VARCHAR(191) NOT NULL DEFAULT 'Voter Field Survey',
     title_ta       VARCHAR(191) DEFAULT NULL,
     fields_json    LONGTEXT NOT NULL,
     change_summary TEXT DEFAULT NULL,
     created_by     CHAR(36) DEFAULT NULL,
     created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
     published_at   DATETIME DEFAULT NULL,
     UNIQUE KEY uq_vms_form_version (version),
     KEY idx_vms_form_status (status)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ---- custom master categories -------------------------------------------
  `CREATE TABLE IF NOT EXISTS vms_master_categories (
     id          BIGINT AUTO_INCREMENT PRIMARY KEY,
     cat_key     VARCHAR(64) NOT NULL,
     name        VARCHAR(191) NOT NULL,
     name_ta     VARCHAR(191) DEFAULT NULL,
     description VARCHAR(255) DEFAULT NULL,
     is_active   TINYINT(1) NOT NULL DEFAULT 1,
     created_by  CHAR(36) DEFAULT NULL,
     created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uq_vms_mc_key (cat_key)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS vms_master_items (
     id          BIGINT AUTO_INCREMENT PRIMARY KEY,
     category_id BIGINT NOT NULL,
     name        VARCHAR(191) NOT NULL,
     name_ta     VARCHAR(191) DEFAULT NULL,
     parent_id   BIGINT DEFAULT NULL,
     sort_order  INT NOT NULL DEFAULT 0,
     is_active   TINYINT(1) NOT NULL DEFAULT 1,
     created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
     KEY idx_vms_mi_cat (category_id, sort_order),
     KEY idx_vms_mi_parent (parent_id),
     CONSTRAINT fk_vms_mi_cat FOREIGN KEY (category_id)
       REFERENCES vms_master_categories (id) ON DELETE CASCADE,
     CONSTRAINT fk_vms_mi_parent FOREIGN KEY (parent_id)
       REFERENCES vms_master_items (id) ON DELETE SET NULL
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ---- survey answers for custom (non-system-bound) fields ----------------
  // Deliberately keyed by the *stable field key*, with NO foreign key to any
  // field-definition table. That is the whole point: deleting or renaming a
  // field in the builder can never cascade-delete a citizen's recorded answer
  // (the old vms_survey_field_values had exactly that cascade).
  `CREATE TABLE IF NOT EXISTS vms_survey_answers (
     epic_id    VARCHAR(32)  NOT NULL,
     field_key  VARCHAR(64)  NOT NULL,
     value      TEXT DEFAULT NULL,
     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     PRIMARY KEY (epic_id, field_key),
     KEY idx_vms_sa_field (field_key)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

async function run() {
  console.log('\n  Dynamic Form Builder — schema migration\n');

  for (const sql of ddl) {
    const name = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
    await pool.query(sql);
    console.log(`  ✓ ${name}`);
  }

  // ---- carry across any answers from the legacy cascade-coupled table ------
  const [legacy] = await pool.query(
    `SELECT v.epic_id, d.field_key, v.value
       FROM vms_survey_field_values v
       JOIN vms_survey_field_defs d ON d.id = v.field_id`
  ).catch(() => [[]]);

  if (legacy.length) {
    for (const row of legacy) {
      await pool.query(
        `INSERT INTO vms_survey_answers (epic_id, field_key, value) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [row.epic_id, row.field_key, row.value]
      );
    }
    console.log(`  ✓ carried ${legacy.length} legacy answer(s) into vms_survey_answers`);
  }

  // ---- seed version 1 from the form as it stands today --------------------
  const [[existing]] = await pool.query('SELECT COUNT(*) c FROM vms_form_schemas');
  if (existing.c === 0) {
    const fields = JSON.stringify(DEFAULT_FIELDS);
    const now = new Date();
    await pool.query(
      `INSERT INTO vms_form_schemas (version, status, title, title_ta, fields_json, change_summary, published_at)
       VALUES (1, 'published', ?, ?, ?, ?, ?)`,
      ['Voter Field Survey', 'வாக்காளர் கள கணக்கெடுப்பு', fields,
       'Initial version seeded from the built-in survey form', now]
    );
    await pool.query(
      `INSERT INTO vms_form_schemas (version, status, title, title_ta, fields_json, change_summary)
       VALUES (0, 'draft', ?, ?, ?, ?)`,
      ['Voter Field Survey', 'வாக்காளர் கள கணக்கெடுப்பு', fields, 'Working draft']
    );
    console.log(`  ✓ seeded form version 1 (published) + working draft — ${DEFAULT_FIELDS.length} fields`);
  } else {
    console.log(`  · form schema already seeded (${existing.c} row(s)) — left untouched`);
  }

  const [[cats]] = await pool.query('SELECT COUNT(*) c FROM vms_master_categories');
  console.log(`\n  custom master categories: ${cats.c}`);
  console.log('  Done.\n');
  await pool.end();
}

run().catch(async (err) => {
  console.error('\n  Migration failed:', err.message, '\n');
  await pool.end().catch(() => {});
  process.exit(1);
});
