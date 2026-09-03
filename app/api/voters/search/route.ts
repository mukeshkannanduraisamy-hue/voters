import { NextResponse } from 'next/server'
import { verifyToken, getTokenFromCookieHeader } from '@/lib/auth/jwt'
import { getDb } from '@/lib/db'
import { buildScopeFilter } from '@/lib/auth/scope-guard'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const token = getTokenFromCookieHeader(cookieHeader)
  const payload = token ? await verifyToken(token) : null

  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (payload.role !== 'A3_FIELD_AGENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query')?.trim() || ''

  const db = getDb()
  const { clause: scopeClause, values: scopeValues } = buildScopeFilter(payload.sub, payload.role, 'v')

  const likeQuery = `%${query}%`

  let whereClause = `v.is_deleted = 0 AND ${scopeClause}`
  const queryParams: (string | number)[] = [...scopeValues]

  if (query) {
    whereClause += ` AND (
      v.name_ta LIKE ?
      OR v.relative_name_ta LIKE ?
      OR v.door_no LIKE ?
      OR v.epic_id LIKE ?
      OR v.voter_sno = CAST(? AS INTEGER)
    )`
    queryParams.push(likeQuery, likeQuery, likeQuery, likeQuery, query)
  }

  const rows = db.prepare(`
    SELECT
      v.epic_id,
      v.voter_sno,
      v.name_ta,
      v.relative_name_ta,
      v.relation_type_ta,
      v.door_no,
      v.age,
      v.gender,
      v.part_no,
      p.local_body_name_ta,
      CASE WHEN s.epic_id IS NOT NULL THEN 1 ELSE 0 END AS is_surveyed,
      s.phone_number,
      s.caste_id,
      s.job_id,
      s.other_job_text,
      s.party_id,
      s.surveyed_at
    FROM voters_master v
    JOIN polling_parts p ON v.part_no = p.part_no
    LEFT JOIN voter_surveys s ON v.epic_id = s.epic_id
    WHERE ${whereClause}
    ORDER BY v.voter_sno
    LIMIT 50
  `).all(...queryParams) as any[]

  return NextResponse.json({ voters: rows, total: rows.length })
}
