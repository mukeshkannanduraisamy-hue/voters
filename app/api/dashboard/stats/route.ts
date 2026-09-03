import { NextResponse } from 'next/server'
import { verifyToken, getTokenFromCookieHeader } from '@/lib/auth/jwt'
import { getDb } from '@/lib/db'
import { buildScopeFilter } from '@/lib/auth/scope-guard'

import { getConstituencies } from '@/lib/db/constituencies'

export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const token = getTokenFromCookieHeader(cookieHeader)
  const payload = token ? await verifyToken(token) : null

  if (!payload || !['A1_SUPER_ADMIN', 'A2_SUPERVISOR'].includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const acNoParam = searchParams.get('ac_no')
  const acNo = acNoParam ? parseInt(acNoParam, 10) : null

  const db = getDb()
  const constituencies = getConstituencies()

  let { clause: scopeClause, values: scopeValues } = buildScopeFilter(payload.sub, payload.role, 'v')

  if (acNo) {
    scopeClause += ` AND v.part_no IN (SELECT part_no FROM polling_parts WHERE ac_no = ?)`
    scopeValues = [...scopeValues, acNo]
  }

  const today = new Date().toISOString().substring(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10)

  // 1. Fast scalar counts
  const totalVoters = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM voters_master v
    WHERE v.is_deleted = 0 AND ${scopeClause}
  `).get(...scopeValues) as { count: number })?.count ?? 0

  const completedSurveys = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM voter_surveys vs
    JOIN voters_master v ON vs.epic_id = v.epic_id
    WHERE ${scopeClause}
  `).get(...scopeValues) as { count: number })?.count ?? 0

  const todayCount = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM voter_surveys vs
    JOIN voters_master v ON vs.epic_id = v.epic_id
    WHERE ${scopeClause} AND DATE(vs.surveyed_at) = ?
  `).get(...scopeValues, today) as { count: number })?.count ?? 0

  const yesterdayCount = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM voter_surveys vs
    JOIN voters_master v ON vs.epic_id = v.epic_id
    WHERE ${scopeClause} AND DATE(vs.surveyed_at) = ?
  `).get(...scopeValues, yesterday) as { count: number })?.count ?? 0

  // 2. Ultra-fast pre-aggregated breakdown using CTE
  let breakdown: any[] = []
  if (payload.role === 'A1_SUPER_ADMIN') {
    breakdown = db.prepare(`
      WITH voter_counts AS (
        SELECT v.part_no, COUNT(*) as total_voters
        FROM voters_master v
        WHERE v.is_deleted = 0
        GROUP BY v.part_no
      ),
      survey_counts AS (
        SELECT v.part_no, COUNT(*) as completed
        FROM voter_surveys vs
        JOIN voters_master v ON vs.epic_id = v.epic_id
        GROUP BY v.part_no
      )
      SELECT
        p.local_body_name_ta as name,
        p.local_body_type as type,
        SUM(COALESCE(vc.total_voters, 0)) as total_voters,
        SUM(COALESCE(sc.completed, 0)) as completed,
        SUM(COALESCE(vc.total_voters, 0)) - SUM(COALESCE(sc.completed, 0)) as pending
      FROM polling_parts p
      LEFT JOIN voter_counts vc ON p.part_no = vc.part_no
      LEFT JOIN survey_counts sc ON p.part_no = sc.part_no
      GROUP BY p.local_body_name_ta, p.local_body_type
      ORDER BY total_voters DESC
    `).all() as any[]
  } else {
    // Supervisor view: agent breakdown
    breakdown = db.prepare(`
      SELECT
        u.mobile_number as name,
        COUNT(DISTINCT vs.epic_id) as completed,
        DATE(MAX(vs.surveyed_at)) as last_active
      FROM users u
      JOIN user_jurisdictions uj ON u.id = uj.user_id
      LEFT JOIN voter_surveys vs ON vs.agent_id = u.id
      WHERE u.role = 'A3_FIELD_AGENT'
        AND uj.part_no IN (
          SELECT part_no FROM user_jurisdictions WHERE user_id = ?
        )
      GROUP BY u.id, u.mobile_number
      ORDER BY completed DESC
    `).all(payload.sub) as any[]
  }

  const completionPct = totalVoters > 0 ? Math.round((completedSurveys / totalVoters) * 100) : 0
  const todayDeltaPct = yesterdayCount > 0 ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100) : 0

  return NextResponse.json({
    total_voters: totalVoters,
    completed_surveys: completedSurveys,
    pending_surveys: totalVoters - completedSurveys,
    today_count: todayCount,
    yesterday_count: yesterdayCount,
    today_delta_pct: todayDeltaPct,
    completion_pct: completionPct,
    breakdown,
    constituencies,
  })
}
