import { db } from './db.js';
import { ROLES } from './auth.js';

/**
 * Jurisdiction is anchored on the polling part (booth).
 *
 * @returns {Promise<number[]|null>} null = global (A1), otherwise the allowed part numbers.
 */
export async function scopePartNos(user) {
  if (user.role === ROLES.A1) return null;
  const rows = await db
    .prepare('SELECT part_no FROM user_jurisdictions WHERE user_id = ? ORDER BY part_no')
    .all(user.id);
  return rows.map((r) => r.part_no);
}

/**
 * SQL predicate restricting `<alias>.part_no` to the caller's booths.
 */
export async function buildPartFilter(user, alias = 'v') {
  const parts = await scopePartNos(user);
  if (parts === null) return { sql: '1=1', params: [] };
  if (parts.length === 0) return { sql: '1=0', params: [] };
  return {
    sql: `${alias}.part_no IN (${parts.map(() => '?').join(',')})`,
    params: parts,
  };
}

/** True when every booth in `partNos` lies inside the user's own scope. */
export async function scopeContains(user, partNos) {
  const allowed = await scopePartNos(user);
  if (allowed === null) return true;
  const set = new Set(allowed);
  return partNos.every((p) => set.has(Number(p)));
}

/** Booth detail with local-body names, for display on profile and user cards. */
export async function scopeDetail(userId) {
  const booths = await db
    .prepare(
      `SELECT pp.part_no, pp.local_body_name_ta, pp.local_body_type, pp.main_village_ta, pp.ac_no, pp.ac_name_ta,
              (SELECT COUNT(*) FROM voters_master v WHERE v.part_no = pp.part_no AND v.is_deleted = 0) AS voter_count
         FROM user_jurisdictions uj
         JOIN polling_parts pp ON pp.part_no = uj.part_no
        WHERE uj.user_id = ?
        ORDER BY pp.part_no`
    )
    .all(userId);

  if (booths.length === 0) return [];

  const partNos = booths.map((b) => b.part_no);
  const villageRows = await db
    .prepare(
      `SELECT v.part_no, v.section_village_ta
         FROM voters_master v
        WHERE v.is_deleted = 0
          AND v.section_village_ta IS NOT NULL
          AND v.section_village_ta != ''
          AND v.section_village_ta != 'சேர்த்தல் பட்டியல்'
          AND v.part_no IN (${partNos.map(() => '?').join(',')})
        GROUP BY v.part_no, v.section_village_ta`
    )
    .all(...partNos);

  const boothVillages = new Map();
  for (const vr of villageRows) {
    if (!boothVillages.has(vr.part_no)) boothVillages.set(vr.part_no, []);
    boothVillages.get(vr.part_no).push(vr.section_village_ta);
  }

  return booths.map((b) => {
    const list = boothVillages.get(b.part_no);
    const villages = (list && list.length > 0)
      ? list
      : (b.main_village_ta ? [b.main_village_ta] : []);
    return {
      ...b,
      villages,
      village_display: villages.join(', '),
    };
  });
}

/**
 * Users an admin may see:
 *   A1 -> everyone but themselves
 *   A2 -> field agents whose booths overlap the supervisor's own
 *   A3 -> nobody
 */
export async function visibleUserIds(user) {
  if (user.role === ROLES.A1) return null;
  if (user.role !== ROLES.A2) return [];
  const parts = await scopePartNos(user);
  if (!parts.length) return [];
  const rows = await db
    .prepare(
      `SELECT DISTINCT u.id
         FROM users u
         JOIN user_jurisdictions uj ON uj.user_id = u.id
        WHERE u.role = '${ROLES.A3}'
          AND uj.part_no IN (${parts.map(() => '?').join(',')})`
    )
    .all(...parts);
  return rows.map((r) => r.id);
}

/**
 * The booths a caller may assign or filter by, grouped by local body and village.
 */
export async function assignableParts(user) {
  const parts = await scopePartNos(user);
  const scoped = parts !== null;
  if (scoped && parts.length === 0) return { localBodies: [], villages: [], parts: [] };

  const where = scoped ? `WHERE pp.part_no IN (${parts.map(() => '?').join(',')})` : '';
  const params = scoped ? parts : [];

  const rows = await db
    .prepare(
      `SELECT pp.part_no, pp.local_body_name_ta, pp.local_body_type, pp.main_village_ta,
              pp.ac_no, pp.ac_name_ta,
              (SELECT COUNT(*) FROM voters_master v WHERE v.part_no = pp.part_no AND v.is_deleted = 0) AS voter_count
         FROM polling_parts pp
         ${where}
        ORDER BY pp.part_no`
    )
    .all(...params);

  // Group section_village_ta by part_no for each booth
  const vWhere = scoped ? `AND v.part_no IN (${parts.map(() => '?').join(',')})` : '';
  const villageRows = await db
    .prepare(
      `SELECT v.part_no, v.section_village_ta, COUNT(v.epic_id) AS voter_count
         FROM voters_master v
        WHERE v.is_deleted = 0
          AND v.section_village_ta IS NOT NULL
          AND v.section_village_ta != ''
          AND v.section_village_ta != 'சேர்த்தல் பட்டியல்'
          ${vWhere}
        GROUP BY v.part_no, v.section_village_ta`
    )
    .all(...params);

  const boothVillages = new Map();
  const villageMap = new Map();

  for (const vr of villageRows) {
    if (!boothVillages.has(vr.part_no)) boothVillages.set(vr.part_no, []);
    boothVillages.get(vr.part_no).push(vr.section_village_ta);

    if (!villageMap.has(vr.section_village_ta)) {
      villageMap.set(vr.section_village_ta, {
        name: vr.section_village_ta,
        parts: new Set(),
        voter_count: 0,
      });
    }
    const vm = villageMap.get(vr.section_village_ta);
    vm.parts.add(vr.part_no);
    vm.voter_count += vr.voter_count;
  }

  const partsWithVillages = rows.map((r) => {
    const list = boothVillages.get(r.part_no);
    const villages = (list && list.length > 0)
      ? list
      : (r.main_village_ta ? [r.main_village_ta] : []);
    return {
      ...r,
      villages,
      village_display: villages.join(', '),
    };
  });

  const localBodies = new Map();
  for (const r of rows) {
    if (!localBodies.has(r.local_body_name_ta)) {
      localBodies.set(r.local_body_name_ta, {
        name: r.local_body_name_ta,
        type: r.local_body_type,
        part_count: 0,
        voter_count: 0,
      });
    }
    const lb = localBodies.get(r.local_body_name_ta);
    lb.part_count += 1;
    lb.voter_count += r.voter_count;
  }

  const villagesSummary = [...villageMap.values()]
    .map((v) => ({
      name: v.name,
      part_count: v.parts.size,
      voter_count: v.voter_count,
    }))
    .sort((a, b) => b.voter_count - a.voter_count);

  return {
    localBodies: [...localBodies.values()],
    villages: villagesSummary,
    parts: partsWithVillages,
  };
}
