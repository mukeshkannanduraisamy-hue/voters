/**
 * Seeds master data (caste / 2-tier job / party) and the demo accounts.
 *   node scripts/seed.mjs [--force]
 *
 * --force resets the demo passwords and re-applies their booth jurisdictions.
 */
import { db, migrate, uuid } from '../src/lib/db.js';
import { hashPassword, ROLES } from '../src/lib/auth.js';
import { CASTES, JOB_SECTORS, PARTIES } from './seed-data.mjs';

const FORCE = process.argv.includes('--force');

migrate();

/* ------------------------------- masters -------------------------------- */
function seedCastes() {
  const stmt = db.prepare(
    `INSERT INTO caste_master (name, name_ta, category, is_active) VALUES (?,?,?,1)
     ON CONFLICT(name) DO UPDATE SET name_ta = excluded.name_ta, category = excluded.category`
  );
  for (const c of CASTES) stmt.run(c.name, c.name_ta, c.category);
  console.log(`  caste_master   ${db.prepare('SELECT COUNT(*) c FROM caste_master').get().c} rows`);
}

function seedJobs() {
  const stmt = db.prepare(
    `INSERT INTO job_master (category, category_ta, name, name_ta, is_active) VALUES (?,?,?,?,1)
     ON CONFLICT(category, name) DO UPDATE SET name_ta = excluded.name_ta, category_ta = excluded.category_ta`
  );
  let n = 0;
  for (const sector of JOB_SECTORS) {
    for (const job of sector.jobs) {
      stmt.run(sector.category, sector.category_ta, job.name, job.name_ta);
      n++;
    }
  }
  console.log(`  job_master     ${db.prepare('SELECT COUNT(*) c FROM job_master').get().c} rows across ${JOB_SECTORS.length} sectors (${n} defined)`);
}

function seedParties() {
  // symbol_img is only written when empty, so an admin-uploaded emblem survives re-seeding.
  const stmt = db.prepare(
    `INSERT INTO party_master (name, name_ta, party_code, color_code, symbol_img, is_active)
     VALUES (?,?,?,?,?,1)
     ON CONFLICT(name) DO UPDATE SET
       name_ta    = excluded.name_ta,
       party_code = excluded.party_code,
       color_code = excluded.color_code,
       symbol_img = COALESCE(NULLIF(party_master.symbol_img, ''), excluded.symbol_img)`
  );
  for (const p of PARTIES) stmt.run(p.name, p.name_ta, p.party_code, p.color_code, p.symbol_img);
  const withImg = db.prepare("SELECT COUNT(*) c FROM party_master WHERE symbol_img IS NOT NULL AND symbol_img <> ''").get().c;
  console.log(`  party_master   ${db.prepare('SELECT COUNT(*) c FROM party_master').get().c} rows (${withImg} with Base64 emblems)`);
}

/* -------------------------------- users --------------------------------- */
function pickEpic(offset) {
  const row = db
    .prepare('SELECT epic_id, name_ta FROM voters_master WHERE is_deleted = 0 ORDER BY part_no, voter_sno LIMIT 1 OFFSET ?')
    .get(offset);
  if (!row) throw new Error('voters_master is empty — run `npm run import` first.');
  return row;
}

function upsertUser({ mobile, password, role, epic, name, createdBy = null }) {
  const existing = db.prepare('SELECT * FROM users WHERE mobile_number = ?').get(mobile);
  if (existing) {
    if (FORCE) {
      db.prepare('UPDATE users SET password_hash = ?, role = ?, full_name = ?, is_active = 1 WHERE id = ?')
        .run(hashPassword(password), role, name, existing.id);
      console.log(`  reset  ${mobile.padEnd(12)} ${role}`);
    } else {
      console.log(`  exists ${mobile.padEnd(12)} ${role}`);
    }
    return existing.id;
  }
  const id = uuid();
  db.prepare(
    `INSERT INTO users (id, mobile_number, password_hash, role, epic_id, full_name, is_active, created_by)
     VALUES (?,?,?,?,?,?,1,?)`
  ).run(id, mobile, hashPassword(password), role, epic, name, createdBy);
  console.log(`  create ${mobile.padEnd(12)} ${role}`);
  return id;
}

function assignParts(userId, partNos) {
  const stmt = db.prepare(
    'INSERT INTO user_jurisdictions (user_id, part_no) VALUES (?,?) ON CONFLICT(user_id, part_no) DO NOTHING'
  );
  for (const p of partNos) stmt.run(userId, p);
}

console.log('\n  Seeding master data\n');
seedCastes();
seedJobs();
seedParties();

console.log('\n  Seeding demo accounts\n');

const a1 = upsertUser({
  mobile: '9876543210', password: 'admin123', role: ROLES.A1,
  epic: pickEpic(0).epic_id, name: 'Super Admin',
});

// The supervisor gets the first ten booths; each agent takes a slice of those,
// so the A2 genuinely supervises the A3s beneath them.
const firstTen = db.prepare('SELECT part_no FROM polling_parts ORDER BY part_no LIMIT 10').all().map((r) => r.part_no);

const a2 = upsertUser({
  mobile: '9840123456', password: 'super123', role: ROLES.A2,
  epic: pickEpic(1).epic_id, name: 'Zone Supervisor', createdBy: a1,
});

const a3 = upsertUser({
  mobile: '9845012345', password: 'agent123', role: ROLES.A3,
  epic: pickEpic(2).epic_id, name: 'Field Agent — Ravi', createdBy: a2,
});
const a3b = upsertUser({
  mobile: '9840223344', password: 'agent123', role: ROLES.A3,
  epic: pickEpic(3).epic_id, name: 'Field Agent — Meena', createdBy: a2,
});

const hasScope = (id) => db.prepare('SELECT COUNT(*) c FROM user_jurisdictions WHERE user_id = ?').get(id).c > 0;
if (FORCE || !hasScope(a2)) assignParts(a2, firstTen);
if (FORCE || !hasScope(a3)) assignParts(a3, firstTen.slice(0, 2));
if (FORCE || !hasScope(a3b)) assignParts(a3b, firstTen.slice(2, 4));

const scopeCount = (id) => db.prepare('SELECT COUNT(*) c FROM user_jurisdictions WHERE user_id = ?').get(id).c;
const votersInScope = (id) =>
  db.prepare(
    `SELECT COUNT(*) c FROM voters_master v
      WHERE v.is_deleted = 0
        AND v.part_no IN (SELECT part_no FROM user_jurisdictions WHERE user_id = ?)`
  ).get(id).c;

console.log(`
  ─────────────────── demo credentials ───────────────────
  A1 Super Admin    9876543210 / admin123   global (all booths)
  A2 Supervisor     9840123456 / super123   ${scopeCount(a2)} booths, ${votersInScope(a2).toLocaleString()} electors
  A3 Field Agent    9845012345 / agent123   ${scopeCount(a3)} booth(s), ${votersInScope(a3).toLocaleString()} electors
  A3 Field Agent    9840223344 / agent123   ${scopeCount(a3b)} booth(s), ${votersInScope(a3b).toLocaleString()} electors
  ────────────────────────────────────────────────────────
`);
