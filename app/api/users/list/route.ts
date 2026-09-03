import { NextResponse } from 'next/server'
import { verifyToken, getTokenFromCookieHeader } from '@/lib/auth/jwt'
import { getDb } from '@/lib/db'
import { getAssignedParts } from '@/lib/auth/scope-guard'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const token = getTokenFromCookieHeader(cookieHeader)
  const payload = token ? await verifyToken(token) : null

  if (!payload || !['A1_SUPER_ADMIN', 'A2_SUPERVISOR'].includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = getDb()

  if (payload.role === 'A1_SUPER_ADMIN') {
    const rows = db.prepare(`
      SELECT u.id, u.mobile_number, u.role, u.epic_id, u.is_active, u.created_at,
             GROUP_CONCAT(uj.part_no) AS part_nos
      FROM users u
      LEFT JOIN user_jurisdictions uj ON u.id = uj.user_id
      WHERE u.role != 'A1_SUPER_ADMIN'
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all() as any[]

    const users = rows.map((u) => {
      const parts = u.part_nos ? u.part_nos.split(',').map(Number) : []
      return {
        ...u,
        parts_count: parts.length,
        parts_sample: parts.length > 5 ? parts.slice(0, 5).join(', ') + '...' : parts.join(', '),
      }
    })
    return NextResponse.json({ users })
  } else {
    // A2: only A3 agents within their parts
    const myParts = getAssignedParts(payload.sub)
    if (myParts.length === 0) {
      return NextResponse.json({ users: [] })
    }
    const placeholders = myParts.map(() => '?').join(',')
    const rows = db.prepare(`
      SELECT DISTINCT u.id, u.mobile_number, u.role, u.epic_id, u.is_active, u.created_at,
             GROUP_CONCAT(uj2.part_no) AS part_nos
      FROM users u
      JOIN user_jurisdictions uj ON u.id = uj.user_id
      LEFT JOIN user_jurisdictions uj2 ON u.id = uj2.user_id
      WHERE u.role = 'A3_FIELD_AGENT'
        AND uj.part_no IN (${placeholders})
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all(...myParts) as any[]

    const users = rows.map((u) => {
      const parts = u.part_nos ? Array.from(new Set(u.part_nos.split(',').map(Number))) : []
      return {
        ...u,
        parts_count: parts.length,
        parts_sample: parts.length > 5 ? parts.slice(0, 5).join(', ') + '...' : parts.join(', '),
      }
    })
    return NextResponse.json({ users })
  }
}
