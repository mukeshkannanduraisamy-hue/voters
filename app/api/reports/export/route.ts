import { NextResponse } from 'next/server'
import { verifyToken, getTokenFromCookieHeader } from '@/lib/auth/jwt'
import { getDb } from '@/lib/db'
import { buildScopeFilter } from '@/lib/auth/scope-guard'
import * as XLSX from 'xlsx'

export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const token = getTokenFromCookieHeader(cookieHeader)
  const payload = token ? await verifyToken(token) : null

  if (!payload || !['A1_SUPER_ADMIN', 'A2_SUPERVISOR'].includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = getDb()
  const { searchParams } = new URL(request.url)
  const localBody = searchParams.get('local_body')?.trim()
  const partNo = searchParams.get('part_no')?.trim()

  const { clause: scopeClause, values: scopeValues } = buildScopeFilter(payload.sub, payload.role)

  let filterClause = scopeClause
  const filterValues: (string | number)[] = [...scopeValues]

  if (localBody) {
    filterClause += ' AND p.local_body_name_ta = ?'
    filterValues.push(localBody)
  }
  if (partNo && !isNaN(Number(partNo))) {
    filterClause += ' AND v.part_no = ?'
    filterValues.push(Number(partNo))
  }

  const rows = db.prepare(`
    SELECT
      v.epic_id AS "EPIC ID",
      COALESCE(vs.corrected_name_ta, v.name_ta) AS "வாக்காளர் பெயர்",
      v.part_no AS "பகுதி எண்",
      p.local_body_name_ta AS "உள்ளாட்சி",
      v.door_no AS "வீட்டு எண்",
      v.age AS "வயது",
      v.gender AS "பாலினம்",
      vs.phone_number AS "தொலைபேசி",
      c.caste_name AS "சாதி",
      j.category AS "தொழில் பிரிவு",
      CASE
        WHEN vs.other_job_text IS NOT NULL AND vs.other_job_text != ''
        THEN j.job_title || ' (' || vs.other_job_text || ')'
        ELSE j.job_title
      END AS "தொழில்",
      pm.party_name AS "கட்சி",
      vs.surveyed_at AS "கருத்தரிப்பு நேரம்"
    FROM voter_surveys vs
    JOIN voters_master v ON vs.epic_id = v.epic_id
    JOIN polling_parts p ON v.part_no = p.part_no
    LEFT JOIN caste_master c ON vs.caste_id = c.id
    LEFT JOIN job_master j ON vs.job_id = j.id
    LEFT JOIN party_master pm ON vs.party_id = pm.id
    WHERE ${filterClause}
    ORDER BY v.part_no, v.voter_sno
  `).all(...filterValues) as any[]

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Survey Report')

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename=vms-survey-report.xlsx',
    },
  })
}
