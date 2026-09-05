/**
 * Imports the Tamil Nadu electoral roll workbook into polling_parts + voters_master.
 *
 *   node scripts/import-data.mjs [--fresh] [path/to/workbook.xlsx]
 *
 * --fresh  rebuilds the roll tables (users, surveys and masters are preserved).
 *
 * Sheet 1 "வாக்காளர் பட்டியல்"  -> voters_master
 * Sheet 2 "பாகம் விவரங்கள்"     -> polling_parts
 * Sheet 3 "வாக்காளர் எண்ணிக்கை"  -> cross-check totals only
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { db, migrate, analyze, DATA_DIR } from '../src/lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const FRESH = args.includes('--fresh');
const explicit = args.find((a) => !a.startsWith('--'));

function findWorkbook() {
  if (explicit) return path.resolve(explicit);
  const found = fs
    .readdirSync(ROOT)
    .filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .map((f) => path.join(ROOT, f));
  if (!found.length) throw new Error(`No .xlsx workbook found in ${ROOT}`);
  return found[0];
}

const clean = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(typeof v === 'object' && v.text ? v.text : v).replace(/ /g, ' ').trim();
  return s === '' ? null : s;
};
const num = (v) => {
  const n = Number(clean(v));
  return Number.isFinite(n) ? n : null;
};
const bool = (v) => (num(v) ? 1 : 0);

/**
 * The roll spells the same place several ways (தர்மபுரி / தர்ம்புரி). Collapse
 * each spelling group to its most frequent form so one place is one row.
 */
function buildCanonicaliser(values) {
  const freq = new Map();
  for (const v of values) if (v) freq.set(v, (freq.get(v) || 0) + 1);
  const normKey = (s) => s.replace(/[்ிீுூ\s]/g, '');
  const best = new Map();
  for (const [value, count] of freq) {
    const k = normKey(value);
    const cur = best.get(k);
    if (!cur || count > cur.count || (count === cur.count && value < cur.value)) {
      best.set(k, { value, count });
    }
  }
  return (s) => (s ? (best.get(normKey(s))?.value ?? s) : s);
}

/**
 * The roll marks each section with its local-body class:
 *   (பே)  = பேரூராட்சி      -> Town Panchayat
 *   (வ.கி) = வருவாய் கிராமம் -> Village Panchayat
 * Town wins when a part mentions both, since a town section is the exception.
 */
function localBodyType(sectionDetails) {
  if (sectionDetails && sectionDetails.includes('(பே)')) return 'TOWN_PANCHAYAT';
  return 'VILLAGE_PANCHAYAT';
}

function dropRollTables() {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS voters_master;
    DROP TABLE IF EXISTS polling_parts;
    PRAGMA foreign_keys = ON;
  `);
}

async function readSheets(file) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, {
    entries: 'emit', sharedStrings: 'cache', worksheets: 'emit',
  });
  const partRows = [], countRows = [], voterRows = [];
  for await (const ws of reader) {
    let first = true;
    for await (const row of ws) {
      if (first) { first = false; continue; }
      if (ws.id === 1) voterRows.push(row.values);
      else if (ws.id === 2) partRows.push(row.values);
      else if (ws.id === 3) countRows.push(row.values);
    }
  }
  return { partRows, countRows, voterRows };
}

async function main() {
  const file = findWorkbook();
  console.log('\n  VMS — electoral roll import');
  console.log(`  source : ${path.basename(file)}`);
  console.log(`  target : ${path.join(DATA_DIR, 'vms.db')}\n`);

  if (FRESH) {
    console.log('  --fresh: rebuilding roll tables ...');
    dropRollTables();
  }
  migrate();

  const already = db.prepare('SELECT COUNT(*) AS c FROM voters_master').get().c;
  if (already > 0 && !FRESH) {
    console.log(`  voters_master already holds ${already.toLocaleString()} rows — nothing to do.`);
    console.log('  Re-run with --fresh to rebuild.\n');
    return;
  }

  console.time('  read workbook');
  const { partRows, countRows, voterRows } = await readSheets(file);
  console.timeEnd('  read workbook');
  console.log(`  parts: ${partRows.length}  counts: ${countRows.length}  voters: ${voterRows.length.toLocaleString()}`);

  const canonDistrict = buildCanonicaliser(partRows.map((r) => clean(r[14])));
  const canonTaluk = buildCanonicaliser(partRows.map((r) => clean(r[13])));
  const canonLocalBody = buildCanonicaliser(partRows.map((r) => clean(r[12])));
  const canonPc = buildCanonicaliser(partRows.map((r) => clean(r[6])));

  db.exec('BEGIN');
  try {
    // ---------------- polling parts ----------------
    const insPart = db.prepare(
      `INSERT INTO polling_parts
        (part_no, ac_no, ac_name_ta, pc_no, pc_name_ta, local_body_name_ta, local_body_type,
         main_village_ta, ward_ta, taluk_ta, district_ta, pincode, section_details_ta, revision_year)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(part_no) DO NOTHING`
    );

    let skipped = 0;
    const knownParts = new Set();
    for (const r of partRows) {
      const partNo = num(r[4]);
      const acNo = clean(r[1]);
      if (partNo === null || !acNo) { skipped++; continue; }

      const section = clean(r[9]);
      // Local body falls back to the main village so every booth is groupable.
      const localBody = canonLocalBody(clean(r[12])) ?? clean(r[10]) ?? `பாகம் ${partNo}`;

      insPart.run(
        partNo, acNo, clean(r[2]), clean(r[5]), canonPc(clean(r[6])),
        localBody, localBodyType(section),
        clean(r[10]), clean(r[11]), canonTaluk(clean(r[13])), canonDistrict(clean(r[14])),
        clean(r[15]), section, clean(r[8])
      );
      knownParts.add(partNo);
    }

    // ---------------- voters ----------------
    const insVoter = db.prepare(
      `INSERT INTO voters_master
        (epic_id, voter_sno, part_no, name_ta, relation_type_ta, relative_name_ta,
         door_no, age, gender, section_title_ta, roll_type_ta,
         is_supplement, is_deleted, deletion_reason, page_number)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(epic_id) DO NOTHING`
    );

    let inserted = 0, noPart = 0, noEpic = 0;
    for (const v of voterRows) {
      const epic = clean(v[2]);
      if (!epic) { noEpic++; continue; }
      const partNo = num(v[11]);
      if (partNo === null || !knownParts.has(partNo)) { noPart++; continue; }

      insVoter.run(
        epic, num(v[1]), partNo,
        clean(v[3]) ?? '—', clean(v[4]), clean(v[5]),
        clean(v[6]), num(v[7]), clean(v[8]),
        clean(v[9]), clean(v[10]),
        bool(v[12]), bool(v[13]), clean(v[14]), num(v[16])
      );
      inserted++;
      if (inserted % 50000 === 0) console.log(`    ... ${inserted.toLocaleString()} voters`);
    }

    db.exec('COMMIT');

    // A --fresh drop runs with foreign keys off, so cascades never fire. Clear
    // any survey or scope row left pointing at something that no longer exists.
    const orphanSurveys = db.prepare(
      'DELETE FROM voter_surveys WHERE epic_id NOT IN (SELECT epic_id FROM voters_master)'
    ).run();
    const orphanScopes = db.prepare(
      'DELETE FROM user_jurisdictions WHERE part_no NOT IN (SELECT part_no FROM polling_parts)'
    ).run();
    if (orphanSurveys.changes) console.log(`  removed ${orphanSurveys.changes} orphaned survey(s)`);
    if (orphanScopes.changes) console.log(`  removed ${orphanScopes.changes} orphaned jurisdiction row(s)`);

    console.log('  building planner statistics ...');
    analyze();

    const one = (q) => db.prepare(q).get().c;
    const towns = one("SELECT COUNT(*) c FROM polling_parts WHERE local_body_type='TOWN_PANCHAYAT'");
    const villages = one("SELECT COUNT(*) c FROM polling_parts WHERE local_body_type='VILLAGE_PANCHAYAT'");

    console.log('\n  ─────────── import complete ───────────');
    console.log(`  constituency   : AC ${db.prepare('SELECT ac_no, ac_name_ta FROM polling_parts LIMIT 1').get()?.ac_no} ${db.prepare('SELECT ac_name_ta FROM polling_parts LIMIT 1').get()?.ac_name_ta ?? ''}`);
    console.log(`  polling parts  : ${one('SELECT COUNT(*) c FROM polling_parts')}  (${towns} town / ${villages} village)`);
    console.log(`  local bodies   : ${one('SELECT COUNT(DISTINCT local_body_name_ta) c FROM polling_parts')}`);
    console.log(`  voters_master  : ${one('SELECT COUNT(*) c FROM voters_master').toLocaleString()}`);
    console.log(`  live electors  : ${one('SELECT COUNT(*) c FROM voters_master WHERE is_deleted=0').toLocaleString()}`);
    if (skipped) console.log(`  skipped parts  : ${skipped}`);
    if (noPart) console.log(`  voters w/o part: ${noPart}`);
    if (noEpic) console.log(`  voters w/o epic: ${noEpic}`);

    const declared = countRows.reduce((a, r) => a + (num(r[7]) || 0), 0);
    console.log(`  roll declares  : ${declared.toLocaleString()} across ${countRows.length} parts`);
    console.log('  ───────────────────────────────────────\n');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

main().catch((err) => {
  console.error('\n  IMPORT FAILED:', err.message, '\n', err.stack);
  process.exit(1);
});
