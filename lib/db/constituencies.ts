import { getDb } from './index'

export interface ConstituencyInfo {
  ac_no: number
  ac_name_ta: string
  ac_name_en: string
  pc_no: number
  pc_name_ta: string
  pc_name_en: string
  district: string
  total_parts: number
}

export function getConstituencies(): ConstituencyInfo[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT
      ac_no,
      ac_name_ta,
      ac_name_en,
      pc_no,
      pc_name_ta,
      pc_name_en,
      district,
      COUNT(part_no) as total_parts
    FROM polling_parts
    GROUP BY ac_no
    ORDER BY ac_no
  `).all() as ConstituencyInfo[]

  return rows
}
