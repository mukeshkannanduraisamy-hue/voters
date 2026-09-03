import { NextResponse } from 'next/server'
import { verifyToken, getTokenFromCookieHeader } from '@/lib/auth/jwt'
import { getDb } from '@/lib/db'
import { surveySchema } from '@/lib/validations'
import { assertVoterInScope } from '@/lib/auth/scope-guard'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const token = getTokenFromCookieHeader(cookieHeader)
  const payload = token ? await verifyToken(token) : null

  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (payload.role !== 'A3_FIELD_AGENT') {
    return NextResponse.json({ error: 'Only field agents can submit surveys' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const parsed = surveySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const data = parsed.data
    const db = getDb()

    // Assert voter is within agent's scope
    assertVoterInScope(data.epic_id, payload.sub, payload.role)

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

    db.prepare(`
      INSERT INTO voter_surveys
        (id, epic_id, corrected_name_ta, corrected_relative_name_ta, phone_number,
         caste_id, job_id, other_job_text, party_id, agent_id, is_verified, surveyed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(epic_id) DO UPDATE SET
        corrected_name_ta = excluded.corrected_name_ta,
        corrected_relative_name_ta = excluded.corrected_relative_name_ta,
        phone_number = excluded.phone_number,
        caste_id = excluded.caste_id,
        job_id = excluded.job_id,
        other_job_text = excluded.other_job_text,
        party_id = excluded.party_id,
        agent_id = excluded.agent_id,
        updated_at = ?
    `).run(
      randomUUID(),
      data.epic_id,
      data.corrected_name_ta ?? null,
      data.corrected_relative_name_ta ?? null,
      data.phone_number,
      data.caste_id,
      data.job_id,
      data.other_job_text ?? null,
      data.party_id,
      payload.sub,
      now,
      now
    )

    // Count total surveyed in agent's parts for progress
    const voter = db.prepare('SELECT part_no FROM voters_master WHERE epic_id = ?').get(data.epic_id) as { part_no: number } | undefined
    const partNo = voter?.part_no

    const counts = partNo
      ? db.prepare(`
          SELECT
            (SELECT COUNT(*) FROM voters_master WHERE part_no = ? AND is_deleted = 0) AS total,
            (SELECT COUNT(*) FROM voter_surveys vs JOIN voters_master vm ON vs.epic_id = vm.epic_id WHERE vm.part_no = ?) AS completed
        `).get(partNo, partNo) as { total: number; completed: number }
      : { total: 0, completed: 0 }

    return NextResponse.json({ success: true, booth_progress: counts })
  } catch (error: any) {
    if (error.message?.includes('FORBIDDEN')) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('Survey submit error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
