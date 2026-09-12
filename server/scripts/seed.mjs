/**
 * Seeds master data (caste / 2-tier job / party) and the demo accounts.
 *   node scripts/seed.mjs [--force]
 *
 * --force resets the demo passwords and re-applies their booth jurisdictions.
 */
import { db, migrate, uuid, pool } from '../src/lib/db.js';
import { hashPassword, ROLES } from '../src/lib/auth.js';
import { CASTES, JOB_SECTORS, PARTIES, EDUCATION_LEVELS } from './seed-data.mjs';

const FORCE = process.argv.includes('--force');

/*
 * ------------------------------- masters ----------------------------------
 * Every seed function below is additive by default: `ON CONFLICT DO NOTHING`.
 */
async function seedCastes() {
  const stmt = db.prepare(
    `INSERT INTO caste_master (name, name_ta, category, is_active) VALUES (?,?,?,1)
     ON CONFLICT(name) DO NOTHING`
  );
  for (const c of CASTES) await stmt.run(c.name, c.name_ta, c.category);
  const count = (await db.prepare('SELECT COUNT(*) c FROM caste_master').get())?.c ?? 0;
  console.log(`  caste_master   ${count} rows`);
}

async function seedEducation() {
  const stmt = db.prepare(
    `INSERT INTO education_master (name, name_ta, is_active) VALUES (?,?,1)
     ON CONFLICT(name) DO NOTHING`
  );
  for (const e of EDUCATION_LEVELS) await stmt.run(e.name, e.name_ta);
  const count = (await db.prepare('SELECT COUNT(*) c FROM education_master WHERE is_active = 1').get())?.c ?? 0;
  console.log(`  education_master ${count} active rows`);
}

async function seedJobs() {
  const existingSectors = await db.prepare('SELECT DISTINCT category FROM job_master').all();
  const surveysUsingJob = (await db.prepare('SELECT COUNT(*) c FROM voter_surveys WHERE job_id IS NOT NULL').get())?.c ?? 0;
  if (surveysUsingJob === 0) {
    const hasNonCanonical = existingSectors.some((s) => !JOB_SECTORS.find((j) => j.category === s.category));
    if (hasNonCanonical || existingSectors.length !== JOB_SECTORS.length) {
      console.log('  Resetting job_master to canonical 6 sectors & 38 sub-jobs...');
      await db.exec('DELETE FROM job_master');
    }
  }

  const stmt = db.prepare(
    `INSERT INTO job_master (category, category_ta, name, name_ta, is_active) VALUES (?,?,?,?,1)
     ON CONFLICT(category, name) DO NOTHING`
  );
  let n = 0;
  for (const sector of JOB_SECTORS) {
    for (const job of sector.jobs) {
      await stmt.run(sector.category, sector.category_ta, job.name, job.name_ta);
      n++;
    }
  }
  const count = (await db.prepare('SELECT COUNT(*) c FROM job_master').get())?.c ?? 0;
  console.log(`  job_master     ${count} rows across ${JOB_SECTORS.length} sectors (${n} defined)`);
}

async function seedParties() {
  const stmt = db.prepare(
    `INSERT INTO party_master (name, name_ta, party_code, color_code, symbol_img, is_active)
     VALUES (?,?,?,?,?,1)
     ON CONFLICT(name) DO NOTHING`
  );
  for (const p of PARTIES) await stmt.run(p.name, p.name_ta, p.party_code, p.color_code, p.symbol_img);
  const withImg = (await db.prepare("SELECT COUNT(*) c FROM party_master WHERE symbol_img IS NOT NULL AND symbol_img <> ''").get())?.c ?? 0;
  const count = (await db.prepare('SELECT COUNT(*) c FROM party_master').get())?.c ?? 0;
  console.log(`  party_master   ${count} rows (${withImg} with Base64 emblems)`);
}

/* -------------------------------- users --------------------------------- */
async function pickEpic(offset) {
  const row = await db
    .prepare('SELECT epic_id, name_ta FROM voters_master WHERE is_deleted = 0 ORDER BY part_no, voter_sno LIMIT 1 OFFSET ?')
    .get(offset);
  if (!row) throw new Error('voters_master is empty — run `npm run import` first.');
  return row;
}

async function upsertUser({ mobile, password, role, epic, name, createdBy = null }) {
  const existing = await db.prepare('SELECT * FROM users WHERE mobile_number = ?').get(mobile);
  if (existing) {
    if (FORCE) {
      await db.prepare('UPDATE users SET password_hash = ?, role = ?, full_name = ?, is_active = 1 WHERE id = ?')
        .run(hashPassword(password), role, name, existing.id);
      console.log(`  reset  ${mobile.padEnd(12)} ${role}`);
    } else {
      console.log(`  exists ${mobile.padEnd(12)} ${role}`);
    }
    return existing.id;
  }
  const id = uuid();
  await db.prepare(
    `INSERT INTO users (id, mobile_number, password_hash, role, epic_id, full_name, is_active, created_by)
     VALUES (?,?,?,?,?,?,1,?)`
  ).run(id, mobile, hashPassword(password), role, epic, name, createdBy);
  console.log(`  create ${mobile.padEnd(12)} ${role}`);
  return id;
}

async function assignParts(userId, partNos) {
  const stmt = db.prepare(
    'INSERT INTO user_jurisdictions (user_id, part_no) VALUES (?,?) ON CONFLICT(user_id, part_no) DO NOTHING'
  );
  for (const p of partNos) await stmt.run(userId, p);
}

async function main() {
  await migrate();

  console.log('\n  Seeding master data\n');
  await seedCastes();
  await seedJobs();
  await seedParties();
  await seedEducation();

  console.log('\n  Seeding demo accounts\n');

  const epic0 = await pickEpic(0);
  const a1 = await upsertUser({
    mobile: '9876543210', password: 'admin123', role: ROLES.A1,
    epic: epic0.epic_id, name: 'Super Admin',
  });

  const epic4 = await pickEpic(4);
  const a1_mukesh = await upsertUser({
    mobile: '8144928022', password: 'admin123', role: ROLES.A1,
    epic: epic4.epic_id, name: 'Super Admin',
  });

  const partsRows = await db.prepare('SELECT part_no FROM polling_parts ORDER BY part_no LIMIT 10').all();
  const firstTen = partsRows.map((r) => r.part_no);

  const epic1 = await pickEpic(1);
  const a2 = await upsertUser({
    mobile: '9840123456', password: 'super123', role: ROLES.A2,
    epic: epic1.epic_id, name: 'Zone Supervisor', createdBy: a1,
  });

  const epic2 = await pickEpic(2);
  const a3 = await upsertUser({
    mobile: '9845012345', password: 'agent123', role: ROLES.A3,
    epic: epic2.epic_id, name: 'Field Agent — Ravi', createdBy: a2,
  });

  const epic3 = await pickEpic(3);
  const a3b = await upsertUser({
    mobile: '9840223344', password: 'agent123', role: ROLES.A3,
    epic: epic3.epic_id, name: 'Field Agent — Meena', createdBy: a2,
  });

  const hasScope = async (id) => ((await db.prepare('SELECT COUNT(*) c FROM user_jurisdictions WHERE user_id = ?').get(id))?.c ?? 0) > 0;
  if (FORCE || !(await hasScope(a2))) await assignParts(a2, firstTen);
  if (FORCE || !(await hasScope(a3))) await assignParts(a3, firstTen.slice(0, 2));
  if (FORCE || !(await hasScope(a3b))) await assignParts(a3b, firstTen.slice(2, 4));

  const scopeCount = async (id) => (await db.prepare('SELECT COUNT(*) c FROM user_jurisdictions WHERE user_id = ?').get(id))?.c ?? 0;
  const votersInScope = async (id) =>
    (await db.prepare(
      `SELECT COUNT(*) c FROM voters_master v
        WHERE v.is_deleted = 0
          AND v.part_no IN (SELECT part_no FROM user_jurisdictions WHERE user_id = ?)`
    ).get(id))?.c ?? 0;

  const a2Scope = await scopeCount(a2);
  const a2Voters = await votersInScope(a2);
  const a3Scope = await scopeCount(a3);
  const a3Voters = await votersInScope(a3);
  const a3bScope = await scopeCount(a3b);
  const a3bVoters = await votersInScope(a3b);

  console.log(`
  ─────────────────── demo credentials ───────────────────
  A1 Super Admin    9876543210 / admin123   global (all booths)
  A2 Supervisor     9840123456 / super123   ${a2Scope} booths, ${a2Voters.toLocaleString()} electors
  A3 Field Agent    9845012345 / agent123   ${a3Scope} booth(s), ${a3Voters.toLocaleString()} electors
  A3 Field Agent    9840223344 / agent123   ${a3bScope} booth(s), ${a3bVoters.toLocaleString()} electors
  ────────────────────────────────────────────────────────
`);
}

main().catch((err) => {
  console.error('\n  SEED FAILED:', err.message, '\n', err.stack);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
