import { NextResponse } from 'next/server'
import { verifyToken, getTokenFromCookieHeader } from '@/lib/auth/jwt'
import { getDb } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const cookieHeader = request.headers.get('cookie')
  const token = getTokenFromCookieHeader(cookieHeader)
  const payload = token ? await verifyToken(token) : null

  if (!payload || !['A1_SUPER_ADMIN', 'A2_SUPERVISOR'].includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = getDb()
  const user = db.prepare('SELECT id, mobile_number, role, epic_id, is_active, created_at FROM users WHERE id = ?').get(params.id) as any

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const parts = (db.prepare('SELECT part_no FROM user_jurisdictions WHERE user_id = ? ORDER BY part_no').all(params.id) as { part_no: number }[]).map(p => p.part_no)

  return NextResponse.json({ user: { ...user, part_ids: parts } })
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const cookieHeader = request.headers.get('cookie')
  const token = getTokenFromCookieHeader(cookieHeader)
  const payload = token ? await verifyToken(token) : null

  if (!payload || !['A1_SUPER_ADMIN', 'A2_SUPERVISOR'].includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = getDb()
  const existingUser = db.prepare('SELECT * FROM users WHERE id = ?').get(params.id) as any
  if (!existingUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // A2 can only edit A3 agents
  if (payload.role === 'A2_SUPERVISOR' && existingUser.role !== 'A3_FIELD_AGENT') {
    return NextResponse.json({ error: 'Supervisors can only edit Field Agents' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { mobile_number, role, password, epic_id, is_active, part_ids } = body

    // 1. Mobile number validation & duplicate check
    if (mobile_number) {
      if (!/^[6-9]\d{9}$/.test(mobile_number)) {
        return NextResponse.json({ error: 'Mobile number must be 10 digits starting with 6-9' }, { status: 400 })
      }
      const duplicate = db.prepare('SELECT id FROM users WHERE mobile_number = ? AND id != ?').get(mobile_number, params.id)
      if (duplicate) {
        return NextResponse.json({ error: 'Mobile number is already registered by another user' }, { status: 409 })
      }
    }

    // 2. Role validation
    let newRole = existingUser.role
    if (role) {
      if (payload.role === 'A2_SUPERVISOR' && role !== 'A3_FIELD_AGENT') {
        return NextResponse.json({ error: 'Supervisors can only set role to Field Agent' }, { status: 403 })
      }
      newRole = role
    }

    // 3. Password handling (only re-hashed if provided and non-empty)
    let newPasswordHash = existingUser.password_hash
    if (password && password.trim().length > 0) {
      if (password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
      }
      newPasswordHash = await bcrypt.hash(password, 12)
    }

    const newMobile = mobile_number ? mobile_number.trim() : existingUser.mobile_number
    const newEpicId = epic_id !== undefined ? (epic_id ? epic_id.trim() : '') : existingUser.epic_id
    const newActive = is_active !== undefined ? (is_active ? 1 : 0) : existingUser.is_active

    // 4. Update user in transaction
    const updateUserTx = db.transaction(() => {
      db.prepare(`
        UPDATE users
        SET mobile_number = ?, role = ?, password_hash = ?, epic_id = ?, is_active = ?
        WHERE id = ?
      `).run(newMobile, newRole, newPasswordHash, newEpicId, newActive, params.id)

      // Update jurisdictions if provided
      if (Array.isArray(part_ids)) {
        db.prepare('DELETE FROM user_jurisdictions WHERE user_id = ?').run(params.id)
        const insertPart = db.prepare('INSERT INTO user_jurisdictions (id, user_id, part_no) VALUES (?, ?, ?)')
        for (const p of part_ids) {
          insertPart.run(randomUUID(), params.id, Number(p))
        }
      }
    })

    updateUserTx()

    // Return updated user
    const updatedParts = (db.prepare('SELECT part_no FROM user_jurisdictions WHERE user_id = ? ORDER BY part_no').all(params.id) as { part_no: number }[]).map(p => p.part_no)

    return NextResponse.json({
      success: true,
      user: {
        id: params.id,
        mobile_number: newMobile,
        role: newRole,
        epic_id: newEpicId,
        is_active: newActive,
        part_ids: updatedParts,
      }
    })
  } catch (error) {
    console.error('Update user error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const cookieHeader = request.headers.get('cookie')
  const token = getTokenFromCookieHeader(cookieHeader)
  const payload = token ? await verifyToken(token) : null

  if (!payload || payload.role !== 'A1_SUPER_ADMIN') {
    return NextResponse.json({ error: 'Only Super Admins can delete users' }, { status: 403 })
  }

  const db = getDb()
  const deleteTx = db.transaction(() => {
    db.prepare('DELETE FROM user_jurisdictions WHERE user_id = ?').run(params.id)
    db.prepare('DELETE FROM users WHERE id = ?').run(params.id)
  })

  deleteTx()
  return NextResponse.json({ success: true })
}
