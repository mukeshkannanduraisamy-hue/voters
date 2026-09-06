export type Role = 'A1_SUPER_ADMIN' | 'A2_SUPERVISOR' | 'A3_FIELD_AGENT';
export type LocalBodyType = 'TOWN_PANCHAYAT' | 'VILLAGE_PANCHAYAT';
/** A local body master row can report 'MIXED' when a merge combined booths of both types. */
export type LocalBodyTypeOrMixed = LocalBodyType | 'MIXED';
export type CasteCategory = 'OC' | 'BC' | 'BCM' | 'MBC' | 'SC' | 'ST' | 'OTHER';

export interface JurisdictionBooth {
  part_no: number;
  local_body_name_ta: string;
  local_body_type: LocalBodyType;
  ac_no: string;
  ac_name_ta: string;
  voter_count: number;
}

export interface CurrentUser {
  id: string;
  mobileNumber: string;
  role: Role;
  roleLabel: string;
  roleLabelTa: string;
  epicId: string | null;
  fullName: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  isGlobal: boolean;
  partCount: number | null;
  partNos: number[];
  jurisdictions: JurisdictionBooth[];
  votersInScope: number;
  home: string;
}

export interface ManagedUser {
  id: string;
  mobileNumber: string;
  role: Role;
  roleLabel: string;
  roleLabelTa: string;
  epicId: string | null;
  fullName: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  isOnline: boolean;
  createdByName: string | null;
  surveysDone: number;
  isGlobal: boolean;
  boothCount: number;
  partNos: number[];
  votersInScope: number;
  localBodySummary: string[];
  localBodyOverflow: number;
  jurisdictions: JurisdictionBooth[];
}

export type CustomFieldType = 'text' | 'number' | 'date' | 'select';

export interface CustomFieldAnswer {
  fieldId: number;
  key: string;
  label: string;
  labelTa: string | null;
  fieldType: CustomFieldType;
  isActive: boolean;
  value: string | null;
}

export interface SurveyRecord {
  correctedNameTa: string | null;
  correctedRelativeNameTa: string | null;
  phoneNumber: string;
  casteId: number | null;
  casteName: string | null;
  casteNameTa: string | null;
  casteCategory: CasteCategory | null;
  jobId: number | null;
  jobName: string | null;
  jobNameTa: string | null;
  jobCategory: string | null;
  jobCategoryTa: string | null;
  otherJobText: string | null;
  partyId: number | null;
  partyName: string | null;
  partyNameTa: string | null;
  partyCode: string | null;
  colorCode: string | null;
  symbolImg: string | null;
  educationId: number | null;
  educationName: string | null;
  educationNameTa: string | null;
  remarks: string | null;
  surveyedAt: string;
  agentName: string | null;
  agentMobile: string | null;
  agentId: string | null;
  lastUpdatedBy: string | null;
  lastEditorName: string | null;
  customFields?: CustomFieldAnswer[];
}

export interface Voter {
  epicId: string;
  voterSno: number | null;
  nameTa: string;
  relationTypeTa: string | null;
  relativeNameTa: string | null;
  doorNo: string | null;
  age: number | null;
  gender: string | null;
  sectionTitleTa: string | null;
  rollTypeTa: string | null;
  isSupplement: boolean;
  isDeleted: boolean;
  partNo: number;
  localBodyNameTa: string;
  localBodyType: LocalBodyType;
  mainVillageTa: string | null;
  acNo: string;
  acNameTa: string;
  talukTa: string | null;
  districtTa: string | null;
  pincode: string | null;
  surveyed: boolean;
  survey: SurveyRecord | null;
}

export interface Directory {
  rows: Voter[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

export interface PagedUsers {
  rows: ManagedUser[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/* ------------------------------- masters -------------------------------- */
export interface CasteRow {
  id: number; name: string; name_ta: string | null;
  category: CasteCategory; is_active: boolean; created_at?: string; usage_count?: number;
}
export interface JobRow {
  id: number; category: string; category_ta: string | null;
  name: string; name_ta: string | null; is_active: boolean; created_at?: string; usage_count?: number;
}
export interface JobSectorGroup { category: string; category_ta: string | null; jobs: JobRow[] }
export interface PartyRow {
  id: number; name: string; name_ta: string | null; party_code: string;
  color_code: string; symbol_img: string | null; is_active: boolean;
  created_at?: string; usage_count?: number;
}

export interface Dropdowns {
  castes: { id: number; name: string; name_ta: string | null; category: CasteCategory }[];
  jobs: { id: number; category: string; category_ta: string | null; name: string; name_ta: string | null }[];
  sectors: { category: string; category_ta: string | null; jobs: { id: number; name: string; name_ta: string | null }[] }[];
  parties: { id: number; name: string; name_ta: string | null; party_code: string; color_code: string; symbol_img: string | null }[];
  educationLevels: { id: number; name: string; name_ta: string | null }[];
}

export interface EducationRow {
  id: number; name: string; name_ta: string | null;
  is_active: boolean; created_at?: string; usage_count?: number;
}

export interface FormFieldDef {
  id: number;
  key: string;
  label: string;
  labelTa: string | null;
  fieldType: CustomFieldType;
  options: string[] | null;
  isRequired: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
  usageCount?: number;
}

/* ------------------------------- booths --------------------------------- */
export interface Booth {
  part_no: number;
  local_body_name_ta: string;
  local_body_type: LocalBodyType;
  main_village_ta: string | null;
  ac_no: string;
  ac_name_ta: string;
  voter_count: number;
}
export interface LocalBodySummary {
  name: string; type: LocalBodyType; part_count: number; voter_count: number;
}
export interface BoothTree { localBodies: LocalBodySummary[]; parts: Booth[] }

/* ----------------------------- dashboards ------------------------------- */
export interface LocalBodyProgress {
  name: string; type: LocalBodyType; booths: number;
  total: number; completed: number; pending: number; progress: number;
}

export interface DashboardStats {
  scope: 'global' | 'assigned';
  constituency: { acNo: string; acNameTa: string; districtTa: string } | null;
  totals: {
    total: number; completed: number; pending: number;
    completionPct: number; pendingPct: number;
    today: number; yesterday: number; todayDeltaPct: number | null;
    booths: number; localBodies: number;
  };
  localBodies: LocalBodyProgress[];
  trend: { day: string; count: number }[];
}

export interface AgentProgress {
  id: string; fullName: string | null; mobileNumber: string;
  isActive: boolean; lastLoginAt: string | null;
  lastSeenAt?: string | null; isOnline?: boolean;
  surveysDone: number; todayDone: number; assignedVoters: number;
  boothCount: number; partList: number[]; progress: number; pending: number;
}

export interface Breakdown {
  castes: { label: string; labelTa: string | null; category: string; count: number }[];
  jobSectors: { label: string; labelTa: string | null; count: number }[];
  jobs: { label: string; labelTa: string | null; category: string; count: number }[];
  parties: { label: string; labelTa: string | null; code: string; color: string; symbol: string | null; count: number }[];
  gender: { label: string; count: number }[];
  ageBands: { label: string; count: number }[];
}

export interface RecentSurvey {
  epicId: string; nameTa: string; phoneNumber: string; updatedAt: string;
  partNo: number; localBodyNameTa: string; agentName: string | null;
  partyName: string | null; colorCode: string | null; symbolImg: string | null;
}

export interface AuditEntry {
  id: number; action: string; entity: string | null; entity_id: string | null;
  detail: string | null; created_at: string;
  full_name: string | null; mobile_number: string | null; role: Role | null;
}

export interface EpicVerification {
  verified: boolean;
  alreadyRegistered: boolean;
  registeredMobile: string | null;
  voter: {
    epicId: string; nameTa: string; relativeNameTa: string | null;
    age: number | null; gender: string | null; doorNo: string | null;
    partNo: number; localBodyNameTa: string; constituency: string;
  };
}

export interface HealthInfo {
  status: string;
  constituency: { acNo: string; acNameTa: string; districtTa: string } | null;
  counts: {
    voters: number; liveVoters: number; surveys: number;
    users: number; booths: number; localBodies: number;
  };
}

/* -------------------------- local body master ---------------------------- */
export interface LocalBodyRow {
  name: string;
  type: LocalBodyTypeOrMixed;
  part_count: number;
  voter_count: number;
  part_nos: number[];
}
export interface LocalBodyMergeSuggestion {
  candidates: LocalBodyRow[];
  recommended: string;
}
export interface LocalBodyList {
  rows: LocalBodyRow[];
  suggestions: LocalBodyMergeSuggestion[];
  total: number;
}
