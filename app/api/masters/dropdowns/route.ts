import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()

  const castes = db.prepare('SELECT id, caste_name, category FROM caste_master WHERE is_active = 1 ORDER BY caste_name').all()
  const jobs = db.prepare('SELECT id, job_title, category FROM job_master WHERE is_active = 1 ORDER BY job_title').all()
  const parties = db.prepare('SELECT id, party_name, party_code, color_code FROM party_master WHERE is_active = 1 ORDER BY party_name').all()

  return NextResponse.json({ castes, jobs, parties })
}
