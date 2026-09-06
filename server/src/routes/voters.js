import express from 'express';
import { db, nowIso } from '../lib/db.js';
import { authenticate, requireRole, audit, ROLES } from '../lib/auth.js';
import { buildPartFilter } from '../lib/scope.js';

const router = express.Router();
router.use(authenticate);

const PHONE_RE = /^[6-9]\d{9}$/;

const VOTER_COLUMNS = `
  v.epic_id, v.voter_sno, v.name_ta, v.relation_type_ta, v.relative_name_ta,
  v.door_no, v.age, v.gender, v.section_title_ta, v.roll_type_ta,
  v.is_supplement, v.is_deleted, v.part_no,
  pp.local_body_name_ta, pp.local_body_type, pp.main_village_ta,
  pp.ac_no, pp.ac_name_ta, pp.taluk_ta, pp.district_ta, pp.pincode,
  s.epic_id AS survey_epic, s.corrected_name_ta, s.corrected_relative_name_ta,
  s.phone_number, s.caste_id, s.job_id, s.party_id, s.education_id, s.other_job_text, s.remarks,
  s.surveyed_at, s.surveyed_by, s.last_updated_by,
  cm.name AS caste_name, cm.name_ta AS caste_name_ta, cm.category AS caste_category,
  jm.name AS job_name, jm.name_ta AS job_name_ta, jm.category AS job_category, jm.category_ta AS job_category_ta,
  pm.name AS party_name, pm.name_ta AS party_name_ta, pm.party_code, pm.color_code, pm.symbol_img,
  em.name AS education_name, em.name_ta AS education_name_ta,
  ag.full_name AS agent_name, ag.mobile_number AS agent_mobile,
  ed.full_name AS last_editor_name`;

const VOTER_JOINS = `
  FROM voters_master v
  JOIN polling_parts pp ON pp.part_no = v.part_no
  LEFT JOIN voter_surveys s ON s.epic_id = v.epic_id
  LEFT JOIN caste_master cm ON cm.id = s.caste_id
  LEFT JOIN job_master   jm ON jm.id = s.job_id
  LEFT JOIN party_master pm ON pm.id = s.party_id
  LEFT JOIN education_master em ON em.id = s.education_id
  LEFT JOIN users        ag ON ag.id = s.surveyed_by
  LEFT JOIN users        ed ON ed.id = s.last_updated_by`;

/** Counting needs neither the master joins nor the agent lookup. */
const COUNT_JOINS = `
  FROM voters_master v
  JOIN polling_parts pp ON pp.part_no = v.part_no
  LEFT JOIN voter_surveys s ON s.epic_id = v.epic_id`;

/** Custom field answers for one survey, joined against the current field defs so a renamed/disabled field still shows correctly. */
function customFieldsFor(epicId) {
  return db
    .prepare(
      `SELECT d.id AS field_id, d.field_key, d.label, d.label_ta, d.field_type, d.is_active, v.value
         FROM survey_field_values v
         JOIN survey_field_defs d ON d.id = v.field_id
        WHERE v.epic_id = ?
        ORDER BY d.sort_order, d.id`
    )
    .all(epicId)
    .map((r) => ({
      fieldId: r.field_id,
      key: r.field_key,
      label: r.label,
      labelTa: r.label_ta,
      fieldType: r.field_type,
      isActive: !!r.is_active,
      value: r.value,
    }));
}

function shapeVoter(r, { includeCustomFields = false } = {}) {
  if (!r) return null;
  return {
    epicId: r.epic_id,
    voterSno: r.voter_sno,
    nameTa: r.name_ta,
    relationTypeTa: r.relation_type_ta,
    relativeNameTa: r.relative_name_ta,
    doorNo: r.door_no,
    age: r.age,
    gender: r.gender,
    sectionTitleTa: r.section_title_ta,
    rollTypeTa: r.roll_type_ta,
    isSupplement: !!r.is_supplement,
    isDeleted: !!r.is_deleted,
    partNo: r.part_no,
    localBodyNameTa: r.local_body_name_ta,
    localBodyType: r.local_body_type,
    mainVillageTa: r.main_village_ta,
    acNo: r.ac_no,
    acNameTa: r.ac_name_ta,
    talukTa: r.taluk_ta,
    districtTa: r.district_ta,
    pincode: r.pincode,
    surveyed: !!r.survey_epic,
    survey: r.survey_epic
      ? {
          correctedNameTa: r.corrected_name_ta,
          correctedRelativeNameTa: r.corrected_relative_name_ta,
          phoneNumber: r.phone_number,
          casteId: r.caste_id,
          casteName: r.caste_name,
          casteNameTa: r.caste_name_ta,
          casteCategory: r.caste_category,
          jobId: r.job_id,
          jobName: r.job_name,
          jobNameTa: r.job_name_ta,
          jobCategory: r.job_category,
          jobCategoryTa: r.job_category_ta,
          otherJobText: r.other_job_text,
          partyId: r.party_id,
          partyName: r.party_name,
          partyNameTa: r.party_name_ta,
          partyCode: r.party_code,
          colorCode: r.color_code,
          symbolImg: r.symbol_img,
          educationId: r.education_id,
          educationName: r.education_name,
          educationNameTa: r.education_name_ta,
          remarks: r.remarks,
          surveyedAt: r.surveyed_at,
          agentName: r.agent_name,
          agentMobile: r.agent_mobile,
          agentId: r.surveyed_by,
          lastUpdatedBy: r.last_updated_by,
          lastEditorName: r.last_editor_name,
          customFields: includeCustomFields ? customFieldsFor(r.epic_id) : undefined,
        }
      : null,
  };
}

/** Whitelisted sort columns — anything else would be an injection surface. */
const SORT_COLUMNS = {
  voter_sno: 'v.voter_sno',
  name: 'v.name_ta',
  age: 'v.age',
  door_no: 'v.door_no',
  part_no: 'v.part_no',
  epic_id: 'v.epic_id',
  surveyed_at: 's.surveyed_at',
};

function buildFilter(req) {
  const scope = buildPartFilter(req.user, 'v');
  const where = [scope.sql];
  const params = [...scope.params];

  const search = String(req.query.search ?? req.query.q ?? '').trim();
  if (search) {
    where.push(`(
      UPPER(v.epic_id) LIKE ?
      OR v.name_ta LIKE ?
      OR v.relative_name_ta LIKE ?
      OR v.door_no LIKE ?
      OR CAST(v.voter_sno AS TEXT) = ?
    )`);
    params.push(`%${search.toUpperCase()}%`, `%${search}%`, `%${search}%`, `%${search}%`, search);
  }

  const localBody = String(req.query.local_body ?? '').trim();
  if (localBody) { where.push('pp.local_body_name_ta = ?'); params.push(localBody); }

  const partNo = Number(req.query.part_no);
  if (Number.isInteger(partNo) && partNo > 0) { where.push('v.part_no = ?'); params.push(partNo); }

  const gender = String(req.query.gender ?? '').trim();
  if (gender) { where.push('v.gender = ?'); params.push(gender); }

  const status = String(req.query.status ?? '').trim();
  if (status === 'surveyed') where.push('s.epic_id IS NOT NULL');
  if (status === 'pending') where.push('s.epic_id IS NULL');

  const partyId = Number(req.query.party_id);
  if (Number.isInteger(partyId) && partyId > 0) { where.push('s.party_id = ?'); params.push(partyId); }

  // Also accepts the literal 'me', so the UI can filter "done by me" without
  // knowing its own id in the URL (handled by the caller before this runs).
  const agentId = String(req.query.agent_id ?? '').trim();
  if (agentId) { where.push('s.surveyed_by = ?'); params.push(agentId); }

  if (req.query.include_deleted !== '1') where.push('v.is_deleted = 0');

  return { sql: where.join(' AND '), params };
}

/**
 * GET /api/voters/directory
 * Paged, sortable electoral roll restricted to the caller's booths.
 * `agent_id=me` resolves to the caller's own id — lets any role (including a
 * field agent looking at their own booth) filter "done by me" without needing
 * to already know their own user id.
 */
router.get('/directory', (req, res) => {
  if (req.query.agent_id === 'me') req.query.agent_id = req.user.id;

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
  const f = buildFilter(req);

  const sortKey = String(req.query.sort_by ?? 'voter_sno');
  const sortCol = SORT_COLUMNS[sortKey] ?? SORT_COLUMNS.voter_sno;
  const sortDir = String(req.query.sort_dir ?? 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const total = db.prepare(`SELECT COUNT(*) c ${COUNT_JOINS} WHERE ${f.sql}`).get(...f.params).c;
  const rows = db
    .prepare(
      `SELECT ${VOTER_COLUMNS} ${VOTER_JOINS} WHERE ${f.sql}
        ORDER BY ${sortCol} ${sortDir}, v.part_no, v.voter_sno
        LIMIT ? OFFSET ?`
    )
    .all(...f.params, limit, (page - 1) * limit);

  res.json({
    rows: rows.map((r) => shapeVoter(r)),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    sortBy: sortKey,
    sortDir: sortDir.toLowerCase(),
  });
});

/** GET /api/voters/verify-epic?epic_id=… — registration EPIC check */
router.get('/verify-epic', requireRole(ROLES.A1, ROLES.A2), (req, res) => {
  const epic = String(req.query.epic_id ?? req.query.epic ?? '').trim().toUpperCase();
  if (!epic) return res.status(400).json({ error: 'EPIC ID is required' });

  const voter = db
    .prepare(
      `SELECT v.epic_id, v.name_ta, v.relative_name_ta, v.age, v.gender, v.door_no, v.is_deleted,
              v.part_no, pp.local_body_name_ta, pp.ac_no, pp.ac_name_ta
         FROM voters_master v JOIN polling_parts pp ON pp.part_no = v.part_no
        WHERE UPPER(v.epic_id) = ?`
    )
    .get(epic);

  if (!voter) {
    return res.status(404).json({ verified: false, error: 'EPIC ID not found in the electoral roll' });
  }
  if (voter.is_deleted) {
    return res.status(409).json({ verified: false, error: 'This EPIC ID is marked deleted in the roll' });
  }

  const taken = db.prepare('SELECT mobile_number FROM users WHERE UPPER(epic_id) = ?').get(epic);
  res.json({
    verified: true,
    alreadyRegistered: !!taken,
    registeredMobile: taken?.mobile_number ?? null,
    voter: {
      epicId: voter.epic_id,
      nameTa: voter.name_ta,
      relativeNameTa: voter.relative_name_ta,
      age: voter.age,
      gender: voter.gender,
      doorNo: voter.door_no,
      partNo: voter.part_no,
      localBodyNameTa: voter.local_body_name_ta,
      constituency: `AC ${voter.ac_no} - ${voter.ac_name_ta}`,
    },
  });
});

/** GET /api/voters/:epic — one elector with their survey (incl. custom fields), scope-checked */
router.get('/:epic', (req, res) => {
  const scope = buildPartFilter(req.user, 'v');
  const epic = String(req.params.epic).trim().toUpperCase();
  const row = db
    .prepare(`SELECT ${VOTER_COLUMNS} ${VOTER_JOINS} WHERE UPPER(v.epic_id) = ? AND ${scope.sql}`)
    .get(epic, ...scope.params);

  if (!row) {
    const exists = db.prepare('SELECT 1 FROM voters_master WHERE UPPER(epic_id) = ?').get(epic);
    return res.status(exists ? 403 : 404).json({
      error: exists ? 'This elector is outside your assigned booths' : 'No elector found with this EPIC number',
    });
  }
  res.json(shapeVoter(row, { includeCustomFields: true }));
});

/**
 * POST /api/voters/survey/submit — A1, A2 (correction/oversight) and A3
 * (the original field flow). Uses an UPSERT keyed on epic_id, so re-surveying
 * an elector updates their record instead of creating a duplicate.
 *
 * The agent credited with a survey (`surveyed_by`) is never overwritten by an
 * admin's edit — that would erase who actually did the fieldwork. An admin's
 * touch is recorded separately in `last_updated_by` instead.
 */
router.post('/survey/submit', requireRole(ROLES.A1, ROLES.A2, ROLES.A3), (req, res) => {
  const b = req.body ?? {};
  const epic = String(b.epicId ?? b.epic_id ?? '').trim().toUpperCase();
  const correctedName = String(b.correctedNameTa ?? b.corrected_name_ta ?? '').trim() || null;
  const correctedRelative = String(b.correctedRelativeNameTa ?? b.corrected_relative_name_ta ?? '').trim() || null;
  const phone = String(b.phoneNumber ?? b.phone_number ?? '').trim();
  const casteId = b.casteId ?? b.caste_id ? Number(b.casteId ?? b.caste_id) : null;
  const jobId = b.jobId ?? b.job_id ? Number(b.jobId ?? b.job_id) : null;
  const partyId = b.partyId ?? b.party_id ? Number(b.partyId ?? b.party_id) : null;
  const educationId = b.educationId ?? b.education_id ? Number(b.educationId ?? b.education_id) : null;
  const otherJobText = String(b.otherJobText ?? b.other_job_text ?? '').trim() || null;
  const remarks = String(b.remarks ?? '').trim() || null;
  const customFields = b.customFields && typeof b.customFields === 'object' ? b.customFields : {};

  const fields = {};
  if (!epic) fields.epicId = 'EPIC number is required';
  if (!PHONE_RE.test(phone)) fields.phoneNumber = 'Enter a valid 10-digit number starting 6-9';
  if (!casteId) fields.casteId = 'Select a caste';
  if (!jobId) fields.jobId = 'Select an occupation';
  if (!partyId) fields.partyId = 'Select a party';
  if (Object.keys(fields).length) {
    return res.status(400).json({ error: 'Please complete all required fields', fields });
  }

  const scope = buildPartFilter(req.user, 'v');
  const voter = db
    .prepare(`SELECT v.epic_id, v.is_deleted FROM voters_master v WHERE UPPER(v.epic_id) = ? AND ${scope.sql}`)
    .get(epic, ...scope.params);
  if (!voter) {
    const exists = db.prepare('SELECT 1 FROM voters_master WHERE UPPER(epic_id) = ?').get(epic);
    return res.status(exists ? 403 : 404).json({
      error: exists ? 'This elector is outside your assigned booth' : 'No elector found with this EPIC number',
    });
  }
  if (voter.is_deleted) {
    return res.status(409).json({ error: 'This elector is marked deleted in the roll and cannot be surveyed' });
  }

  for (const [table, id, field, label] of [
    ['caste_master', casteId, 'casteId', 'caste'],
    ['job_master', jobId, 'jobId', 'occupation'],
    ['party_master', partyId, 'partyId', 'party'],
  ]) {
    if (!db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND is_active = 1`).get(id)) {
      return res.status(422).json({ error: `Selected ${label} is no longer available`, fields: { [field]: 'Unavailable' } });
    }
  }
  if (educationId && !db.prepare('SELECT 1 FROM education_master WHERE id = ? AND is_active = 1').get(educationId)) {
    return res.status(422).json({ error: 'Selected education level is no longer available', fields: { educationId: 'Unavailable' } });
  }

  // Every active, required custom field must have a non-empty answer; a value
  // for an inactive/unknown field id is silently ignored (a form the A1
  // disabled mid-survey shouldn't block submission).
  const activeDefs = db.prepare('SELECT id, label, field_type, is_required, options_json FROM survey_field_defs WHERE is_active = 1').all();
  const customFieldErrors = {};
  for (const def of activeDefs) {
    const raw = customFields[def.id];
    const value = raw === undefined || raw === null ? '' : String(raw).trim();
    if (def.is_required && !value) {
      customFieldErrors[`custom_${def.id}`] = `${def.label} is required`;
      continue;
    }
    if (value && def.field_type === 'select') {
      const options = JSON.parse(def.options_json || '[]');
      if (!options.includes(value)) {
        customFieldErrors[`custom_${def.id}`] = `Invalid option for ${def.label}`;
      }
    }
    if (value && def.field_type === 'number' && Number.isNaN(Number(value))) {
      customFieldErrors[`custom_${def.id}`] = `${def.label} must be a number`;
    }
  }
  if (Object.keys(customFieldErrors).length) {
    return res.status(400).json({ error: 'Please correct the custom field values', fields: customFieldErrors });
  }

  const existing = db.prepare('SELECT epic_id, surveyed_by FROM voter_surveys WHERE epic_id = ?').get(voter.epic_id);
  const now = nowIso();
  // A field agent's own credit is preserved even when an admin edits later;
  // a brand-new record (by anyone) credits whoever is submitting it now.
  const surveyedBy = existing ? existing.surveyed_by : req.user.id;

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO voter_surveys
         (epic_id, corrected_name_ta, corrected_relative_name_ta, phone_number,
          caste_id, job_id, party_id, education_id, other_job_text, remarks,
          surveyed_by, last_updated_by, surveyed_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(epic_id) DO UPDATE SET
         corrected_name_ta = excluded.corrected_name_ta,
         corrected_relative_name_ta = excluded.corrected_relative_name_ta,
         phone_number = excluded.phone_number,
         caste_id = excluded.caste_id,
         job_id = excluded.job_id,
         party_id = excluded.party_id,
         education_id = excluded.education_id,
         other_job_text = excluded.other_job_text,
         remarks = excluded.remarks,
         last_updated_by = excluded.last_updated_by,
         updated_at = excluded.updated_at`
    ).run(
      voter.epic_id, correctedName, correctedRelative, phone,
      casteId, jobId, partyId, educationId, otherJobText, remarks,
      surveyedBy, req.user.id, now, now
    );

    const upsertField = db.prepare(
      `INSERT INTO survey_field_values (epic_id, field_id, value) VALUES (?,?,?)
       ON CONFLICT(epic_id, field_id) DO UPDATE SET value = excluded.value`
    );
    for (const def of activeDefs) {
      const raw = customFields[def.id];
      const value = raw === undefined || raw === null ? '' : String(raw).trim();
      if (value) upsertField.run(voter.epic_id, def.id, value);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Could not save the survey', detail: err.message });
  }

  audit(req.user.id, existing ? 'SURVEY_UPDATED' : 'SURVEY_CREATED', 'voter_survey', voter.epic_id, null);

  const fresh = db.prepare(`SELECT ${VOTER_COLUMNS} ${VOTER_JOINS} WHERE v.epic_id = ?`).get(voter.epic_id);
  res.json({
    ok: true,
    updated: !!existing,
    message: existing ? 'Survey record updated' : 'Survey saved successfully',
    voter: shapeVoter(fresh, { includeCustomFields: true }),
  });
});

/** DELETE /api/voters/survey/:epic — A1 only, to undo a bad record */
router.delete('/survey/:epic', requireRole(ROLES.A1), (req, res) => {
  const epic = String(req.params.epic).trim().toUpperCase();
  const info = db.prepare('DELETE FROM voter_surveys WHERE UPPER(epic_id) = ?').run(epic);
  if (!info.changes) return res.status(404).json({ error: 'No survey record for this EPIC' });
  audit(req.user.id, 'SURVEY_DELETED', 'voter_survey', epic, null);
  res.json({ ok: true });
});

export { buildFilter, VOTER_COLUMNS, VOTER_JOINS, shapeVoter };
export default router;
