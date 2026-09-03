import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken, getTokenFromCookieHeader } from '@/lib/auth/jwt'

const ROLE_ROUTES: Record<string, string[]> = {
  '/admin': ['A1_SUPER_ADMIN'],
  '/supervisor': ['A2_SUPERVISOR'],
  '/survey': ['A3_FIELD_AGENT'],
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Find which role group this path belongs to
  const matchedPrefix = Object.keys(ROLE_ROUTES).find((prefix) =>
    pathname.startsWith(prefix)
  )

  if (!matchedPrefix) return NextResponse.next()

  const token =
    request.cookies.get('vms_token')?.value ||
    getTokenFromCookieHeader(request.headers.get('cookie'))

  const payload = token ? await verifyToken(token) : null
  console.log(`[Middleware] Path: ${pathname}, token: ${token ? 'Found' : 'MISSING'}, payload: ${payload?.role || 'NULL'}`)

  if (!token || !payload) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const allowedRoles = ROLE_ROUTES[matchedPrefix]
  if (!allowedRoles.includes(payload.role)) {
    // Redirect to their correct dashboard
    if (payload.role === 'A1_SUPER_ADMIN') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    } else if (payload.role === 'A2_SUPERVISOR') {
      return NextResponse.redirect(new URL('/supervisor/dashboard', request.url))
    } else {
      return NextResponse.redirect(new URL('/survey/booth', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/supervisor/:path*', '/survey/:path*'],
}
