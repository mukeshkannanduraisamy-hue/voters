import { NextResponse } from 'next/server'
import { verifyToken, getTokenFromCookieHeader } from '@/lib/auth/jwt'
import { getDb } from '@/lib/db'
import { createUserSchema } from '@/lib/validations'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const token = getTokenFromCookieHeader(cookieHeader)
  const payload = token ? await verifyToken(token) : null

  const db = getDb()
  let filterClause = '1=1'
  let filterValues: any[] = []

  if (payload && payload.role === 'A2_SUPERVISOR') {
    const { getAssignedParts } = await import('@/lib/auth/scope-guard')
    const myParts = getAssignedParts(payload.sub)
    if (myParts.length === 0) {
      return NextResponse.json({ local_bodies: [] })
    }
    const placeholders = myParts.map(() => '?').join(',')
    filterClause = `part_no IN (${placeholders})`
    filterValues = myParts
  }

  const rows = db.prepare(`
    SELECT DISTINCT ac_no, local_body_name_ta as name, local_body_type as type, part_no
    FROM polling_parts
    WHERE ${filterClause}
    ORDER BY ac_no, local_body_name_ta, part_no
  `).all(...filterValues) as { ac_no: number; name: string; type: string; part_no: number }[]

  const groups: Record<string, { ac_no: number; name: string; type: string; part_nos: number[] }> = {}
  for (const r of rows) {
    const key = `${r.ac_no}_${r.name}`
    if (!groups[key]) {
      groups[key] = { ac_no: r.ac_no, name: r.name, type: r.type, part_nos: [] }
    }
    groups[key].part_nos.push(r.part_no)
  }

  const { getConstituencies } = await import('@/lib/db/constituencies')
  const constituencies = getConstituencies()

  return NextResponse.json({
    constituencies,
    local_bodies: Object.values(groups),
  })
}

export async function POST(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const token = getTokenFromCookieHeader(cookieHeader)
  const payload = token ? await verifyToken(token) : null

  if (!payload || !['A1_SUPER_ADMIN', 'A2_SUPERVISOR'].includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    console.log('[Users/Create] Received body:', JSON.stringify(body))
    const parsed = createUserSchema.safeParse(body)
    if (!parsed.success) {
      console.log('[Users/Create] Validation failed:', JSON.stringify(parsed.error.flatten()))
      const firstEntry = Object.entries(parsed.error.flatten().fieldErrors)[0]
      const errorMsg = firstEntry ? (firstEntry[1]?.[0] ?? firstEntry[0]) : 'Invalid input'
      return NextResponse.json({ error: errorMsg, details: parsed.error.flatten() }, { status: 400 })
    }

    const data = parsed.data

    // A2 can only create A3 agents
    if (payload.role === 'A2_SUPERVISOR' && data.role !== 'A3_FIELD_AGENT') {
      return NextResponse.json({ error: 'Supervisors can only create Field Agents' }, { status: 403 })
    }

    const db = getDb()

    // Check mobile not already used
    const existing = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get(data.mobile_number)
    if (existing) {
      return NextResponse.json({ error: 'Mobile number already registered' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(data.password, 12)
    const userId = randomUUID()
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
    const finalEpicId = data.epic_id ? data.epic_id.trim() : ''

    const insertUser = db.transaction(() => {
      db.prepare(`
        INSERT INTO users (id, mobile_number, password_hash, role, epic_id, created_by_user_id, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, data.mobile_number, passwordHash, data.role, finalEpicId, payload.sub, data.is_active ? 1 : 0, now)

      for (const partId of data.part_ids) {
        db.prepare(
          'INSERT INTO user_jurisdictions (id, user_id, part_no) VALUES (?, ?, ?)'
        ).run(randomUUID(), userId, partId)
      }
    })

    insertUser()

    return NextResponse.json({
      id: userId,
      mobile_number: data.mobile_number,
      role: data.role,
      epic_id: data.epic_id,
      is_active: data.is_active,
      created_at: now,
    }, { status: 201 })
  } catch (error) {
    console.error('Create user error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
