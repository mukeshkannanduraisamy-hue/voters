import { NextResponse } from 'next/server'
import { verifyToken, getTokenFromCookieHeader } from '@/lib/auth/jwt'
import { getDb } from '@/lib/db'

export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const token = getTokenFromCookieHeader(cookieHeader)
  const payload = token ? await verifyToken(token) : null

  if (!payload || !['A1_SUPER_ADMIN', 'A2_SUPERVISOR'].includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const epicId = searchParams.get('epic_id')

  if (!epicId) {
    return NextResponse.json({ error: 'epic_id is required' }, { status: 400 })
  }

  const db = getDb()
  const voter = db.prepare(`
    SELECT v.epic_id, v.name_ta, v.age, v.gender, v.part_no, p.local_body_name_ta
    FROM voters_master v
    JOIN polling_parts p ON v.part_no = p.part_no
    WHERE v.epic_id = ? AND v.is_deleted = 0
  `).get(epicId) as { epic_id: string; name_ta: string; age: number; gender: string; part_no: number; local_body_name_ta: string } | undefined

  if (!voter) {
    return NextResponse.json({ valid: false }, { status: 404 })
  }

  return NextResponse.json({ valid: true, ...voter })
}
