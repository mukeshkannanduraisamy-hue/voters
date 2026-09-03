import { NextResponse } from 'next/server'
import { loginSchema } from '@/lib/validations'
import { getDb } from '@/lib/db'
import type { User } from '@/lib/db'
import { signToken, buildSetCookieHeader } from '@/lib/auth/jwt'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

function sha256(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex')
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const { mobile_number, password } = parsed.data
    const db = getDb()

    const user = db.prepare(
      'SELECT * FROM users WHERE mobile_number = ? AND is_active = 1'
    ).get(mobile_number) as User | undefined

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Support both bcrypt (new users) and SHA256 (seeded users)
    let passwordValid = false
    if (user.password_hash.startsWith('$2')) {
      // bcrypt hash
      passwordValid = await bcrypt.compare(password, user.password_hash)
    } else {
      // SHA256 fallback
      passwordValid = sha256(password) === user.password_hash
    }

    if (!passwordValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const token = await signToken({
      sub: user.id,
      role: user.role,
      mobileNumber: user.mobile_number,
    })

    const response = NextResponse.json({
      role: user.role,
      userId: user.id,
      mobileNumber: user.mobile_number,
    })

    response.cookies.set({
      name: 'vms_token',
      value: token,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 86400,
      secure: process.env.NODE_ENV === 'production',
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
