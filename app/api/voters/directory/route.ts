import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { verifyToken, getTokenFromCookieHeader } from '@/lib/auth/jwt'
import { buildScopeFilter } from '@/lib/auth/scope-guard'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const token = getTokenFromCookieHeader(cookieHeader)
  const payload = token ? await verifyToken(token) : null

  if (!payload || !['A1_SUPER_ADMIN', 'A2_SUPERVISOR'].includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '25', 10)))
  const localBody = searchParams.get('local_body')?.trim() || ''
  const partNoParam = searchParams.get('part_no')
  const partNo = partNoParam ? parseInt(partNoParam, 10) : null
  const search = searchParams.get('search')?.trim() || ''
  const gender = searchParams.get('gender')?.trim() || ''
  const status = searchParams.get('status')?.trim() || 'all'
  const sortBy = searchParams.get('sort_by')?.trim() || 'voter_sno'
  const sortOrder = searchParams.get('sort_order')?.toLowerCase() === 'desc' ? 'DESC' : 'ASC'

  const db = getDb()

  // 1. Build Base Filters
  const whereClauses: string[] = ['v.is_deleted = 0']
  const params: any[] = []

  // Role Scope filter
  const { clause: scopeClause, values: scopeValues } = buildScopeFilter(payload.sub, payload.role, 'v')
  whereClauses.push(scopeClause)
  params.push(...scopeValues)

  // Local Body filter (matches polling_parts.local_body_name_ta)
  if (localBody) {
    whereClauses.push('p.local_body_name_ta = ?')
    params.push(localBody)
  }

  // Specific Booth / Part filter
  if (partNo && !isNaN(partNo)) {
    whereClauses.push('v.part_no = ?')
    params.push(partNo)
  }

  // Gender filter (handles both Tamil 'ஆண்'/'பெண்'/'மூன்றாம்' and English codes)
  if (gender) {
    const g = gender.trim().toUpperCase()
    if (g === 'M' || g === 'MALE' || gender.includes('ஆண்')) {
      whereClauses.push("(v.gender = 'ஆண்' OR v.gender = 'M')")
    } else if (g === 'F' || g === 'FEMALE' || gender.includes('பெண்')) {
      whereClauses.push("(v.gender = 'பெண்' OR v.gender = 'F')")
    } else if (g === 'T' || g === 'THIRD' || gender.includes('மூன்றாம்')) {
      whereClauses.push("(v.gender LIKE 'மூன்றாம்%' OR v.gender = 'T')")
    }
  }

  // Search filter (Name in Tamil, EPIC ID, or Door Number)
  if (search) {
    whereClauses.push('(v.name_ta LIKE ? OR v.epic_id LIKE ? OR v.door_no LIKE ? OR v.relative_name_ta LIKE ?)')
    const pattern = `%${search}%`
    params.push(pattern, pattern, pattern, pattern)
  }

  // Survey Status filter
  if (status === 'surveyed') {
    whereClauses.push('vs.epic_id IS NOT NULL')
  } else if (status === 'pending') {
    whereClauses.push('vs.epic_id IS NULL')
  }

  const whereSql = whereClauses.join(' AND ')

  // 2. Count Total Matching Rows
  const countRow = db.prepare(`
    SELECT COUNT(*) as total
    FROM voters_master v
    JOIN polling_parts p ON v.part_no = p.part_no
    LEFT JOIN voter_surveys vs ON v.epic_id = vs.epic_id
    WHERE ${whereSql}
  `).get(...params) as { total: number }

  const totalCount = countRow?.total ?? 0
  const totalPages = Math.ceil(totalCount / limit) || 1
  const offset = (page - 1) * limit

  // 3. Allowed Sorting Columns
  const allowedSorts: Record<string, string> = {
    voter_sno: 'v.part_no ASC, v.voter_sno',
    name_ta: 'v.name_ta',
    age: 'v.age',
    door_no: 'v.door_no',
    part_no: 'v.part_no',
    surveyed_at: 'vs.surveyed_at',
  }
  const sortColumn = allowedSorts[sortBy] || 'v.part_no ASC, v.voter_sno'
  const orderSql = `${sortColumn} ${sortOrder}`

  // 4. Fetch Paginated Records with Joined Survey Data
  const voters = db.prepare(`
    SELECT
      v.epic_id,
      v.voter_sno,
      v.name_ta,
      v.relation_type_ta,
      v.relative_name_ta,
      v.door_no,
      v.age,
      v.gender,
      v.part_no,
      p.local_body_name_ta,
      p.local_body_type,
      p.main_town_village,
      p.section_details,
      vs.phone_number,
      vs.surveyed_at,
      vs.corrected_name_ta,
      vs.corrected_relative_name_ta,
      c.caste_name,
      j.job_title,
      vs.other_job_text,
      pt.party_name,
      pt.color_code,
      pt.symbol_img,
      CASE WHEN vs.epic_id IS NOT NULL THEN 1 ELSE 0 END as is_surveyed
    FROM voters_master v
    JOIN polling_parts p ON v.part_no = p.part_no
    LEFT JOIN voter_surveys vs ON v.epic_id = vs.epic_id
    LEFT JOIN caste_master c ON vs.caste_id = c.id
    LEFT JOIN job_master j ON vs.job_id = j.id
    LEFT JOIN party_master pt ON vs.party_id = pt.id
    WHERE ${whereSql}
    ORDER BY ${orderSql}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset)

  // 5. Summary Metrics for the current scope
  // If no search/gender/status filter is applied, we can get survey counts directly
  const summaryRow = db.prepare(`
    SELECT
      COUNT(DISTINCT vs.epic_id) as completed_surveys
    FROM voters_master v
    JOIN polling_parts p ON v.part_no = p.part_no
    JOIN voter_surveys vs ON v.epic_id = vs.epic_id
    WHERE ${whereSql.replace('vs.epic_id IS NOT NULL AND ', '').replace('vs.epic_id IS NULL AND ', '')}
  `).get(...params) as { completed_surveys: number }

  const completedSurveys = summaryRow?.completed_surveys ?? 0

  return NextResponse.json({
    voters,
    pagination: {
      page,
      limit,
      total_count: totalCount,
      total_pages: totalPages,
      has_prev: page > 1,
      has_next: page < totalPages,
    },
    summary: {
      total_voters: totalCount,
      completed_surveys: completedSurveys,
      pending_surveys: Math.max(0, totalCount - completedSurveys),
      completion_pct: totalCount > 0 ? Math.round((completedSurveys / totalCount) * 100) : 0,
    },
  })
}
