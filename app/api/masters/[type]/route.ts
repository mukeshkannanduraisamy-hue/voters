import { NextResponse } from 'next/server'
import { verifyToken, getTokenFromCookieHeader } from '@/lib/auth/jwt'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

type MasterType = 'castes' | 'jobs' | 'parties'

const TABLE_MAP: Record<string, { table: string; nameCol: string }> = {
  castes: { table: 'caste_master', nameCol: 'caste_name' },
  caste: { table: 'caste_master', nameCol: 'caste_name' },
  jobs: { table: 'job_master', nameCol: 'job_title' },
  job: { table: 'job_master', nameCol: 'job_title' },
  parties: { table: 'party_master', nameCol: 'party_name' },
  party: { table: 'party_master', nameCol: 'party_name' },
}

export async function GET(
  request: Request,
  { params }: { params: { type: string } }
) {
  const cookieHeader = request.headers.get('cookie')
  const token = getTokenFromCookieHeader(cookieHeader)
  const payload = token ? await verifyToken(token) : null

  if (!payload || payload.role !== 'A1_SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const mapping = TABLE_MAP[params.type as MasterType]
  if (!mapping) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const db = getDb()
  const items = db.prepare(`SELECT * FROM ${mapping.table} ORDER BY id`).all()
  return NextResponse.json({ items })
}

export async function POST(
  request: Request,
  { params }: { params: { type: string } }
) {
  const cookieHeader = request.headers.get('cookie')
  const token = getTokenFromCookieHeader(cookieHeader)
  const payload = token ? await verifyToken(token) : null

  if (!payload || payload.role !== 'A1_SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const mapping = TABLE_MAP[params.type as MasterType]
  if (!mapping) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const body = await request.json()
  const db = getDb()
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

  try {
    if (params.type === 'parties' || params.type === 'party') {
      const existing = db.prepare('SELECT id FROM party_master WHERE party_name = ?').get(body.name) as { id: number } | undefined
      if (existing) {
        return NextResponse.json({ id: existing.id, existing: true })
      }
      const result = db.prepare(
        `INSERT INTO party_master (party_name, party_code, color_code, symbol_img, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)`
      ).run(body.name, body.party_code || null, body.color_code || null, body.symbol_img || '/parties/independent.svg', now)
      return NextResponse.json({ id: result.lastInsertRowid })
    } else if (params.type === 'castes' || params.type === 'caste') {
      const existing = db.prepare('SELECT id FROM caste_master WHERE caste_name = ?').get(body.name) as { id: number } | undefined
      if (existing) {
        return NextResponse.json({ id: existing.id, existing: true })
      }
      const result = db.prepare(
        `INSERT INTO caste_master (caste_name, category, is_active, created_at) VALUES (?, ?, 1, ?)`
      ).run(body.name, body.category || null, now)
      return NextResponse.json({ id: result.lastInsertRowid })
    } else {
      const existing = db.prepare('SELECT id FROM job_master WHERE job_title = ?').get(body.name) as { id: number } | undefined
      if (existing) {
        return NextResponse.json({ id: existing.id, existing: true })
      }
      const result = db.prepare(
        `INSERT INTO job_master (job_title, category, is_active, created_at) VALUES (?, ?, 1, ?)`
      ).run(body.name, body.category || null, now)
      return NextResponse.json({ id: result.lastInsertRowid })
    }
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE')) {
      return NextResponse.json({ error: 'An item with this name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { type: string } }
) {
  const cookieHeader = request.headers.get('cookie')
  const token = getTokenFromCookieHeader(cookieHeader)
  const payload = token ? await verifyToken(token) : null

  if (!payload || payload.role !== 'A1_SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const mapping = TABLE_MAP[params.type as MasterType]
  if (!mapping) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const body = await request.json()
  const { id } = body
  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 })
  }

  const db = getDb()

  try {
    if (typeof body.is_active === 'number') {
      db.prepare(`UPDATE ${mapping.table} SET is_active = ? WHERE id = ?`).run(body.is_active ? 1 : 0, id)
    }

    if (body.name) {
      if (params.type === 'parties' || params.type === 'party') {
        db.prepare(
          `UPDATE party_master SET party_name = ?, party_code = ?, color_code = ?, symbol_img = COALESCE(?, symbol_img) WHERE id = ?`
        ).run(body.name.trim(), body.party_code?.trim() || null, body.color_code || null, body.symbol_img || null, id)
      } else if (params.type === 'castes' || params.type === 'caste') {
        db.prepare(
          `UPDATE caste_master SET caste_name = ?, category = ? WHERE id = ?`
        ).run(body.name.trim(), body.category?.trim() || null, id)
      } else {
        db.prepare(
          `UPDATE job_master SET job_title = ?, category = ? WHERE id = ?`
        ).run(body.name.trim(), body.category?.trim() || null, id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE')) {
      return NextResponse.json({ error: 'An item with this name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
  }
}
