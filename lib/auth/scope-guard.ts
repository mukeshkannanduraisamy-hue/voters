import { getDb } from '@/lib/db'

/**
 * Returns the list of part_nos assigned to a given user.
 */
export function getAssignedParts(userId: string): number[] {
  const db = getDb()
  const rows = db.prepare(
    'SELECT part_no FROM user_jurisdictions WHERE user_id = ?'
  ).all(userId) as { part_no: number }[]
  return rows.map((r) => r.part_no)
}

/**
 * Throws a 403-style error if the given partNo is NOT in the user's scope.
 * A1 Super Admins always pass (global scope).
 */
export function assertPartInScope(
  partNo: number,
  userId: string,
  role: string
): void {
  if (role === 'A1_SUPER_ADMIN') return // Global access
  const assigned = getAssignedParts(userId)
  if (!assigned.includes(partNo)) {
    throw new Error('FORBIDDEN: Part not in user jurisdiction scope')
  }
}

/**
 * Asserts a voter's part is within the user's scope by looking up the voter first.
 */
export function assertVoterInScope(
  epicId: string,
  userId: string,
  role: string
): void {
  if (role === 'A1_SUPER_ADMIN') return
  const db = getDb()
  const voter = db.prepare(
    'SELECT part_no FROM voters_master WHERE epic_id = ?'
  ).get(epicId) as { part_no: number } | undefined

  if (!voter) throw new Error('Voter not found')
  assertPartInScope(voter.part_no, userId, role)
}

/**
 * Builds a SQL IN clause for filtering by assigned parts.
 * Returns the placeholder string and values array.
 */
export function buildScopeFilter(
  userId: string,
  role: string,
  colPrefix: string = 'v'
): { clause: string; values: number[] } {
  if (role === 'A1_SUPER_ADMIN') {
    return { clause: '1=1', values: [] }
  }
  const parts = getAssignedParts(userId)
  if (parts.length === 0) {
    return { clause: '1=0', values: [] }
  }
  const col = colPrefix ? `${colPrefix}.part_no` : 'part_no'
  const placeholders = parts.map(() => '?').join(',')
  return {
    clause: `${col} IN (${placeholders})`,
    values: parts,
  }
}
