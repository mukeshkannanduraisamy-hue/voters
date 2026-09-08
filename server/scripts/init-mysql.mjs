import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: process.env.DB_HOST || 'srv1497.hstgr.io',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'u403881955_ecl_admin',
  password: process.env.DB_PASSWORD || 'ECLAdmin@2026',
  database: process.env.DB_NAME || 'u403881955_ECL',
};

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS vms_polling_parts (
    part_no             INT PRIMARY KEY,
    ac_no               VARCHAR(16) NOT NULL,
    ac_name_ta          VARCHAR(191),
    pc_no               VARCHAR(16),
    pc_name_ta          VARCHAR(191),
    local_body_name_ta  VARCHAR(191) NOT NULL,
    local_body_type     ENUM('TOWN_PANCHAYAT','VILLAGE_PANCHAYAT') NOT NULL,
    main_village_ta     VARCHAR(191),
    ward_ta             VARCHAR(191),
    taluk_ta            VARCHAR(191),
    district_ta         VARCHAR(191),
    pincode             VARCHAR(16),
    section_details_ta  TEXT,
    revision_year       VARCHAR(16),
    INDEX idx_vms_pp_local (local_body_name_ta)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS vms_voters_master (
    epic_id            VARCHAR(32) PRIMARY KEY,
    voter_sno          INT,
    part_no            INT NOT NULL,
    name_ta            VARCHAR(191) NOT NULL,
    relation_type_ta   VARCHAR(64),
    relative_name_ta   VARCHAR(191),
    door_no            VARCHAR(64),
    age                INT,
    gender             VARCHAR(16),
    section_title_ta   VARCHAR(255),
    roll_type_ta       VARCHAR(64),
    is_supplement      TINYINT(1) DEFAULT 0,
    is_deleted         TINYINT(1) DEFAULT 0,
    deletion_reason    VARCHAR(255),
    page_number        INT,
    INDEX idx_vms_vm_part_no (part_no),
    INDEX idx_vms_vm_part_live (part_no, is_deleted),
    INDEX idx_vms_vm_name (name_ta),
    INDEX idx_vms_vm_relative (relative_name_ta),
    INDEX idx_vms_vm_door (door_no),
    INDEX idx_vms_vm_gender (gender),
    INDEX idx_vms_vm_sno (part_no, voter_sno),
    CONSTRAINT fk_vms_vm_part FOREIGN KEY (part_no) REFERENCES vms_polling_parts(part_no) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS vms_users (
    id             CHAR(36) PRIMARY KEY,
    mobile_number  VARCHAR(20) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    role           ENUM('A1_SUPER_ADMIN','A2_SUPERVISOR','A3_FIELD_AGENT') NOT NULL,
    epic_id        VARCHAR(32),
    full_name      VARCHAR(191),
    is_active      TINYINT(1) DEFAULT 1,
    created_by     CHAR(36),
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at  DATETIME,
    last_seen_at   DATETIME,
    INDEX idx_vms_users_mobile (mobile_number)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS vms_user_jurisdictions (
    id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id  CHAR(36) NOT NULL,
    part_no  INT NOT NULL,
    UNIQUE KEY uq_vms_uj_user_part (user_id, part_no),
    INDEX idx_vms_uj_user (user_id),
    INDEX idx_vms_uj_part (part_no),
    CONSTRAINT fk_vms_uj_user FOREIGN KEY (user_id) REFERENCES vms_users(id) ON DELETE CASCADE,
    CONSTRAINT fk_vms_uj_part FOREIGN KEY (part_no) REFERENCES vms_polling_parts(part_no) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS vms_caste_master (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(191) NOT NULL UNIQUE,
    name_ta    VARCHAR(191),
    category   ENUM('OC','BC','BCM','MBC','SC','ST','OTHER') NOT NULL DEFAULT 'BC',
    is_active  TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS vms_job_master (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    category    VARCHAR(191) NOT NULL,
    category_ta VARCHAR(191),
    name        VARCHAR(191) NOT NULL,
    name_ta     VARCHAR(191),
    is_active   TINYINT(1) DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_vms_job_cat_name (category, name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS vms_party_master (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(191) NOT NULL UNIQUE,
    name_ta     VARCHAR(191),
    party_code  VARCHAR(32) NOT NULL UNIQUE,
    color_code  VARCHAR(16) DEFAULT '#64748b',
    symbol_img  LONGTEXT,
    is_active   TINYINT(1) DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS vms_education_master (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(191) NOT NULL UNIQUE,
    name_ta     VARCHAR(191),
    is_active   TINYINT(1) DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS vms_survey_field_defs (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    field_key     VARCHAR(64) NOT NULL UNIQUE,
    label         VARCHAR(191) NOT NULL,
    label_ta      VARCHAR(191),
    field_type    ENUM('text','number','date','select') NOT NULL DEFAULT 'text',
    options_json  TEXT,
    is_required   TINYINT(1) NOT NULL DEFAULT 0,
    sort_order    INT NOT NULL DEFAULT 0,
    is_active     TINYINT(1) NOT NULL DEFAULT 1,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_vms_sfd_sort (sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS vms_survey_field_values (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    epic_id    VARCHAR(32) NOT NULL,
    field_id   BIGINT NOT NULL,
    value      TEXT,
    UNIQUE KEY uq_vms_sfv_epic_field (epic_id, field_id),
    INDEX idx_vms_sfv_epic (epic_id),
    INDEX idx_vms_sfv_field (field_id),
    CONSTRAINT fk_vms_sfv_field FOREIGN KEY (field_id) REFERENCES vms_survey_field_defs(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS vms_voter_surveys (
    epic_id                     VARCHAR(32) PRIMARY KEY,
    corrected_name_ta           VARCHAR(191),
    corrected_relative_name_ta  VARCHAR(191),
    phone_number                VARCHAR(20) DEFAULT '',
    caste_id                    BIGINT NULL,
    job_id                      BIGINT NULL,
    party_id                    BIGINT NULL,
    education_id                BIGINT NULL,
    other_job_text              VARCHAR(255),
    remarks                     TEXT,
    surveyed_by                 CHAR(36) NULL,
    last_updated_by             CHAR(36) NULL,
    surveyed_at                 DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at                  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_vms_vs_party (party_id),
    INDEX idx_vms_vs_agent (surveyed_by),
    INDEX idx_vms_vs_at (surveyed_at),
    CONSTRAINT fk_vms_vs_voter FOREIGN KEY (epic_id) REFERENCES vms_voters_master(epic_id) ON DELETE CASCADE,
    CONSTRAINT fk_vms_vs_caste FOREIGN KEY (caste_id) REFERENCES vms_caste_master(id) ON DELETE SET NULL,
    CONSTRAINT fk_vms_vs_job FOREIGN KEY (job_id) REFERENCES vms_job_master(id) ON DELETE SET NULL,
    CONSTRAINT fk_vms_vs_party FOREIGN KEY (party_id) REFERENCES vms_party_master(id) ON DELETE SET NULL,
    CONSTRAINT fk_vms_vs_edu FOREIGN KEY (education_id) REFERENCES vms_education_master(id) ON DELETE SET NULL,
    CONSTRAINT fk_vms_vs_user FOREIGN KEY (surveyed_by) REFERENCES vms_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_vms_vs_updater FOREIGN KEY (last_updated_by) REFERENCES vms_users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS vms_app_meta (
    \`key\`   VARCHAR(64) PRIMARY KEY,
    \`value\` TEXT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS vms_audit_log (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id    CHAR(36),
    action     VARCHAR(64) NOT NULL,
    entity     VARCHAR(64),
    entity_id  VARCHAR(191),
    detail     TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_vms_audit_user (user_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
];

async function init() {
  console.log(`[init-mysql] Connecting to ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}...`);
  const conn = await mysql.createConnection(DB_CONFIG);
  console.log('[init-mysql] Connected successfully.');

  for (const sql of DDL_STATEMENTS) {
    const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
    console.log(`[init-mysql] Creating table ${tableName}...`);
    await conn.query(sql);
  }

  const [tables] = await conn.query("SHOW TABLES LIKE 'vms_%'");
  console.log('[init-mysql] Created tables:', tables.map(r => Object.values(r)[0]));

  await conn.end();
  console.log('[init-mysql] All VMS tables initialized successfully.');
}

init().catch(err => {
  console.error('[init-mysql] Error:', err);
  process.exit(1);
});
