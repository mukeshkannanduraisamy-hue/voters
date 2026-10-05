import { db, isSqliteMode, pool } from '../src/lib/db.js';
import { extractVillageFromSection } from '../src/lib/villageExtractor.js';

export async function migrateSectionVillage() {
  console.log('[migrate] Checking section_village_ta column...');

  if (isSqliteMode) {
    // 1. Check if column exists in SQLite
    const cols = await db.prepare('PRAGMA table_info(voters_master)').all();
    const hasCol = cols.some((c) => c.name === 'section_village_ta');
    if (!hasCol) {
      console.log('[migrate] Adding column section_village_ta to voters_master (SQLite)...');
      await db.prepare('ALTER TABLE voters_master ADD COLUMN section_village_ta VARCHAR(255)').run();
      console.log('[migrate] Column added.');
    }

    // 2. Create index on section_title_ta if not exists for fast lookups
    try {
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_voters_section_title ON voters_master(section_title_ta)').run();
    } catch {}

    // 3. Create index on section_village_ta for fast filtering/searching
    try {
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_voters_section_village ON voters_master(section_village_ta)').run();
    } catch {}

    // 4. Update electors whose section_village_ta is null or empty
    const distinctSections = await db
      .prepare("SELECT DISTINCT section_title_ta FROM voters_master WHERE section_title_ta IS NOT NULL AND (section_village_ta IS NULL OR section_village_ta = '')")
      .all();

    if (distinctSections.length > 0) {
      console.log(`[migrate] Updating ${distinctSections.length} distinct section titles in voters_master...`);
      let updatedTotal = 0;
      await db.prepare('BEGIN TRANSACTION').run();
      const updateStmt = db.prepare('UPDATE voters_master SET section_village_ta = ? WHERE section_title_ta = ?');
      for (const row of distinctSections) {
        const village = extractVillageFromSection(row.section_title_ta);
        if (village) {
          const res = await updateStmt.run(village, row.section_title_ta);
          updatedTotal += res.changes;
        }
      }
      await db.prepare('COMMIT').run();
      console.log(`[migrate] Updated ${updatedTotal.toLocaleString()} voters with extracted village.`);
    } else {
      console.log('[migrate] All voters already have section_village_ta populated.');
    }

    // Populate supplement additions
    await db.prepare(
      "UPDATE voters_master SET section_village_ta = 'சேர்த்தல் பட்டியல்' WHERE (is_supplement = 1 OR section_title_ta LIKE 'சேர்த்தல் பட்டியல்%') AND (section_village_ta IS NULL OR section_village_ta = '')"
    ).run();
  } else {
    // Central MySQL mode
    try {
      const [colCheck] = await pool.query(
        `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME IN ('voters_master', 'vms_voters_master')
            AND COLUMN_NAME = 'section_village_ta'
          LIMIT 1`
      );

      if (!colCheck || colCheck.length === 0) {
        console.log('[migrate] Adding column section_village_ta to voters_master (MySQL)...');
        await pool.query('ALTER TABLE voters_master ADD COLUMN section_village_ta VARCHAR(255) NULL AFTER section_title_ta');
        console.log('[migrate] Column added to MySQL table.');
      }

      try {
        await pool.query('ALTER TABLE voters_master ADD INDEX idx_voters_section_village (section_village_ta)');
      } catch (e) {
        // Index already exists, ignore
      }

      // Check for unpopulated rows
      const [distinctSections] = await pool.query(
        "SELECT DISTINCT section_title_ta FROM voters_master WHERE section_title_ta IS NOT NULL AND (section_village_ta IS NULL OR section_village_ta = '')"
      );

      if (distinctSections && distinctSections.length > 0) {
        console.log(`[migrate] Updating ${distinctSections.length} distinct section titles in MySQL voters_master...`);
        let updatedTotal = 0;
        for (const row of distinctSections) {
          const village = extractVillageFromSection(row.section_title_ta);
          if (village) {
            const [res] = await pool.query('UPDATE voters_master SET section_village_ta = ? WHERE section_title_ta = ?', [village, row.section_title_ta]);
            updatedTotal += res.affectedRows;
          }
        }
        console.log(`[migrate] Updated ${updatedTotal.toLocaleString()} MySQL voters with extracted village.`);
      } else {
        console.log('[migrate] All MySQL voters already have section_village_ta populated.');
      }

      await pool.query(
        "UPDATE voters_master SET section_village_ta = 'சேர்த்தல் பட்டியல்' WHERE (is_supplement = 1 OR section_title_ta LIKE 'சேர்த்தல் பட்டியல்%') AND (section_village_ta IS NULL OR section_village_ta = '')"
      );
    } catch (err) {
      console.warn('[migrate] MySQL migration error:', err.message);
    }
  }
}

// When executed directly:
if (process.argv[1]?.endsWith('migrate-village.mjs')) {
  migrateSectionVillage()
    .then(() => {
      console.log('[migrate] Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[migrate] Failed:', err);
      process.exit(1);
    });
}
