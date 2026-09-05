import { db } from './db.js';
import { ROLES } from './auth.js';

/**
 * Jurisdiction is anchored on the polling part (booth).
 *
 * @returns {number[]|null} null = global (A1), otherwise the allowed part numbers.
 */
export function scopePartNos(user) {
  if (user.role === ROLES.A1) return null;
  return db
    .prepare('SELECT part_no FROM user_jurisdictions WHERE user_id = ? ORDER BY part_no')
    .all(user.id)
    .map((r) => r.part_no);
}

/**
 * SQL predicate restricting `<alias>.part_no` to the caller's booths.
 * A scoped user with no assignment yields `1=0` — they see nothing rather than
 * everything, which is the safe direction to fail.
 */
export function buildPartFilter(user, alias = 'v') {
  const parts = scopePartNos(user);
  if (parts === null) return { sql: '1=1', params: [] };
  if (parts.length === 0) return { sql: '1=0', params: [] };
  return {
    sql: `${alias}.part_no IN (${parts.map(() => '?').join(',')})`,
    params: parts,
  };
}

/** True when every booth in `partNos` lies inside the user's own scope. */
export function scopeContains(user, partNos) {
  const allowed = scopePartNos(user);
  if (allowed === null) return true;
  const set = new Set(allowed);
  return partNos.every((p) => set.has(Number(p)));
}

/** Booth detail with local-body names, for display on profile and user cards. */
export function scopeDetail(userId) {
  return db
    .prepare(
      `SELECT pp.part_no, pp.local_body_name_ta, pp.local_body_type, pp.ac_no, pp.ac_name_ta,
              (SELECT COUNT(*) FROM voters_master v WHERE v.part_no = pp.part_no AND v.is_deleted = 0) AS voter_count
         FROM user_jurisdictions uj
         JOIN polling_parts pp ON pp.part_no = uj.part_no
        WHERE uj.user_id = ?
        ORDER BY pp.part_no`
    )
    .all(userId);
}

/**
 * Users an admin may see:
 *   A1 -> everyone but themselves
 *   A2 -> field agents whose booths overlap the supervisor's own
 *   A3 -> nobody
 */
export function visibleUserIds(user) {
  if (user.role === ROLES.A1) return null;
  if (user.role !== ROLES.A2) return [];
  const parts = scopePartNos(user);
  if (!parts.length) return [];
  return db
    .prepare(
      `SELECT DISTINCT u.id
         FROM users u
         JOIN user_jurisdictions uj ON uj.user_id = u.id
        WHERE u.role = '${ROLES.A3}'
          AND uj.part_no IN (${parts.map(() => '?').join(',')})`
    )
    .all(...parts)
    .map((r) => r.id);
}

/**
 * The booths a caller may assign or filter by, grouped by local body.
 * Already scope-filtered, so an A2 can never widen its own reach.
 */
export function assignableParts(user) {
  const parts = scopePartNos(user);
  const scoped = parts !== null;
  if (scoped && parts.length === 0) return { localBodies: [], parts: [] };

  const where = scoped ? `WHERE pp.part_no IN (${parts.map(() => '?').join(',')})` : '';
  const params = scoped ? parts : [];

  const rows = db
    .prepare(
      `SELECT pp.part_no, pp.local_body_name_ta, pp.local_body_type, pp.main_village_ta,
              pp.ac_no, pp.ac_name_ta,
              (SELECT COUNT(*) FROM voters_master v WHERE v.part_no = pp.part_no AND v.is_deleted = 0) AS voter_count
         FROM polling_parts pp
         ${where}
        ORDER BY pp.part_no`
    )
    .all(...params);

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

  return { localBodies: [...localBodies.values()], parts: rows };
}
