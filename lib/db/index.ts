import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import AdmZip from 'adm-zip'

const DB_PATH = path.join(process.cwd(), 'vms.db')
const ZIP_PATH = path.join(process.cwd(), 'vms.db.zip')

let db: Database.Database | null = null

function ensureDbFile() {
  if (!fs.existsSync(DB_PATH) && fs.existsSync(ZIP_PATH)) {
    console.log('📦 vms.db not found on disk. Unzipping vms.db.zip (16.7 MB)...')
    const zip = new AdmZip(ZIP_PATH)
    zip.extractAllTo(process.cwd(), true)
    console.log('✅ vms.db successfully unpacked.')
  }
}

export function getDb(): Database.Database {
  if (!db) {
    ensureDbFile()
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  }
  return db
}

// Type definitions matching vms.db schema
export type Role = 'A1_SUPER_ADMIN' | 'A2_SUPERVISOR' | 'A3_FIELD_AGENT'

export interface User {
  id: string
  mobile_number: string
  password_hash: string
  role: Role
  epic_id: string
  created_by_user_id: string | null
  is_active: number
  created_at: string
}

export interface Voter {
  epic_id: string
  voter_sno: number
  part_no: number
  name_ta: string
  relation_type_ta: string | null
  relative_name_ta: string | null
  door_no: string
  age: number
  gender: string
  section_title: string | null
  list_type: string | null
  is_supplement: number
  is_deleted: number
  deletion_reason: string | null
}

export interface PollingPart {
  part_no: number
  ac_no: number
  ac_name_ta: string
  ac_name_en: string
  pc_no: number
  local_body_type: string
  local_body_name_ta: string
  ward_no: string | null
  main_town_village: string | null
  pincode: string | null
}

export interface Survey {
  id: string
  epic_id: string
  corrected_name_ta: string | null
  corrected_relative_name_ta: string | null
  phone_number: string
  caste_id: number
  job_id: number
  party_id: number
  agent_id: string
  is_verified: number
  surveyed_at: string
}

export interface CasteMaster {
  id: number
  caste_name: string
  category: string | null
  is_active: number
}

export interface JobMaster {
  id: number
  job_title: string
  category: string | null
  is_active: number
}

export interface PartyMaster {
  id: number
  party_name: string
  party_code: string | null
  color_code: string | null
  is_active: number
}
