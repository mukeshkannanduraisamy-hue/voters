/**
 * TEST-ONLY: generates synthetic polling booths + electors so the API test
 * suite can run against an isolated database with no real electoral roll.
 *
 * Refuses to run unless DB_NAME contains "test", as a guard against ever
 * being pointed at a real database by accident.
 *
 *   node scripts/seed-synthetic-test-data.mjs
 */
import { db, migrate, uuid, pool } from '../src/lib/db.js';
import { hashPassword, ROLES } from '../src/lib/auth.js';
import { CASTES, JOB_SECTORS, PARTIES, EDUCATION_LEVELS } from './seed-data.mjs';

if (!/test/i.test(process.env.DB_NAME || '')) {
  console.error(`Refusing to run: DB_NAME="${process.env.DB_NAME}" does not look like a test database.`);
  process.exit(1);
}

const TAMIL_FIRST = ['செல்வம்', 'கமலா', 'முருகன்', 'லட்சுமி', 'ராஜேஷ்', 'பிரியா', 'குமார்', 'மீனா', 'சரவணன்', 'தேவி'];
const TAMIL_LAST = ['ராமன்', 'கிருஷ்ணன்', 'பாலு', 'சங்கர்', 'நடராஜன்'];
const LOCAL_BODIES = [
  { name: 'பென்னாகரம்', type: 'TOWN_PANCHAYAT' },
  { name: 'தளி', type: 'VILLAGE_PANCHAYAT' },
  { name: 'மோரப்பூர்', type: 'VILLAGE_PANCHAYAT' },
];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function main() {
  await migrate();

  console.log('Seeding synthetic booths + electors...');
  const PART_COUNT = 6;
  const VOTERS_PER_PART = 200; // large enough to exercise deep pagination (test-api.mjs pages to offset ~900)

  for (let p = 1; p <= PART_COUNT; p++) {
    const lb = LOCAL_BODIES[p % LOCAL_BODIES.length];
    await db.prepare(
      `INSERT INTO polling_parts
         (part_no, ac_no, ac_name_ta, local_body_name_ta, local_body_type, main_village_ta, taluk_ta, district_ta, pincode)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(part_no) DO NOTHING`
    ).run(p, '58', 'பென்னாகரம்', lb.name, lb.type, lb.name, 'பென்னாகரம்', 'தர்மபுரி', '636810');

    for (let v = 1; v <= VOTERS_PER_PART; v++) {
      const epic = `TST${String(p).padStart(2, '0')}${String(v).padStart(4, '0')}`;
      await db.prepare(
        `INSERT INTO voters_master
           (epic_id, voter_sno, part_no, name_ta, relation_type_ta, relative_name_ta, door_no, age, gender, is_deleted)
         VALUES (?,?,?,?,?,?,?,?,?,0)
         ON CONFLICT(epic_id) DO NOTHING`
      ).run(epic, v, p, `${rand(TAMIL_FIRST)} ${rand(TAMIL_LAST)}`, 'தந்தை', `${rand(TAMIL_FIRST)} ${rand(TAMIL_LAST)}`,
        String(v), 18 + (v % 65), v % 2 === 0 ? 'ஆண்' : 'பெண்');
    }
  }
  // A handful of deliberately-deleted rows to exercise is_deleted filtering.
  await db.prepare(`UPDATE voters_master SET is_deleted = 1 WHERE epic_id IN ('TST010001','TST010002')`).run();

  console.log('Seeding masters (castes, jobs, parties, education)...');
  const casteStmt = db.prepare(`INSERT INTO caste_master (name, name_ta, category, is_active) VALUES (?,?,?,1) ON CONFLICT(name) DO NOTHING`);
  for (const c of CASTES) await casteStmt.run(c.name, c.name_ta, c.category);

  const jobStmt = db.prepare(`INSERT INTO job_master (category, category_ta, name, name_ta, is_active) VALUES (?,?,?,?,1) ON CONFLICT(category, name) DO NOTHING`);
  for (const sector of JOB_SECTORS) for (const job of sector.jobs) await jobStmt.run(sector.category, sector.category_ta, job.name, job.name_ta);

  const partyStmt = db.prepare(`INSERT INTO party_master (name, name_ta, party_code, color_code, symbol_img, is_active) VALUES (?,?,?,?,?,1) ON CONFLICT(name) DO NOTHING`);
  for (const p of PARTIES) await partyStmt.run(p.name, p.name_ta, p.party_code, p.color_code, p.symbol_img);

  const eduStmt = db.prepare(`INSERT INTO education_master (name, name_ta, is_active) VALUES (?,?,1) ON CONFLICT(name) DO NOTHING`);
  for (const e of EDUCATION_LEVELS) await eduStmt.run(e.name, e.name_ta);

  console.log('Seeding demo accounts (same mobiles the README documents as public demo credentials)...');
  async function pickEpic(offset) {
    return (await db.prepare('SELECT epic_id FROM voters_master WHERE is_deleted = 0 ORDER BY part_no, voter_sno LIMIT 1 OFFSET ?').get(offset)).epic_id;
  }
  async function upsertUser({ mobile, password, role, epic, name, createdBy = null }) {
    const existing = await db.prepare('SELECT id FROM users WHERE mobile_number = ?').get(mobile);
    if (existing) return existing.id;
    const id = uuid();
    await db.prepare(
      `INSERT INTO users (id, mobile_number, password_hash, role, epic_id, full_name, is_active, created_by) VALUES (?,?,?,?,?,?,1,?)`
    ).run(id, mobile, hashPassword(password), role, epic, name, createdBy);
    return id;
  }
  async function assignParts(userId, partNos) {
    const stmt = db.prepare('INSERT INTO user_jurisdictions (user_id, part_no) VALUES (?,?) ON CONFLICT(user_id, part_no) DO NOTHING');
    for (const p of partNos) await stmt.run(userId, p);
  }

  const a1 = await upsertUser({ mobile: '9876543210', password: 'admin123', role: ROLES.A1, epic: await pickEpic(0), name: 'Test Super Admin' });
  const a2 = await upsertUser({ mobile: '9840123456', password: 'super123', role: ROLES.A2, epic: await pickEpic(1), name: 'Test Supervisor', createdBy: a1 });
  const a3 = await upsertUser({ mobile: '9845012345', password: 'agent123', role: ROLES.A3, epic: await pickEpic(2), name: 'Test Field Agent A', createdBy: a2 });
  const a3b = await upsertUser({ mobile: '9840223344', password: 'agent123', role: ROLES.A3, epic: await pickEpic(3), name: 'Test Field Agent B', createdBy: a2 });

  await assignParts(a2, [1, 2, 3, 4]);
  await assignParts(a3, [1, 2]);
  await assignParts(a3b, [3, 4]);

  const boothCount = (await db.prepare('SELECT COUNT(*) c FROM polling_parts').get()).c;
  const voterCount = (await db.prepare('SELECT COUNT(*) c FROM voters_master WHERE is_deleted = 0').get()).c;
  console.log(`Done. ${boothCount} synthetic booths, ${voterCount} live synthetic electors.`);
}

main().catch((err) => { console.error('SEED FAILED:', err); process.exitCode = 1; })
  .finally(async () => { await pool.end(); });
