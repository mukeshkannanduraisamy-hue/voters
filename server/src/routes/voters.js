import express from 'express';
import { db, nowIso, withTransaction } from '../lib/db.js';
import { authenticate, requireRole, audit, ROLES } from '../lib/auth.js';
import { buildPartFilter } from '../lib/scope.js';
import { invalidateDashboardCache } from './dashboard.js';
import { getPublishedSchema, validateSubmission } from '../lib/formSchema.js';

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

/**
 * Stored answers for the dynamic (non system-bound) fields of one survey.
 *
 * Answers are keyed by the field's stable key and read back through whatever
 * schema is live now, so a field that was later renamed, reordered or retired
 * still resolves to the label it should display — and an answer whose field is
 * gone from the form entirely is still returned (flagged orphaned) rather than
 * silently disappearing from the record.
 */
async function customFieldsFor(epicId, schemaFields) {
  const rows = await db
    .prepare('SELECT field_key, value FROM vms_survey_answers WHERE epic_id = ?')
    .all(epicId);
  if (!rows.length) return [];

  const byKey = new Map((schemaFields ?? []).map((f) => [f.key, f]));
  return rows
    .filter((r) => r.value !== null && r.value !== '')
    .map((r) => {
      const def = byKey.get(r.field_key);
      return {
        key: r.field_key,
        label: def?.label ?? r.field_key,
        labelTa: def?.labelTa ?? null,
        fieldType: def?.type ?? 'text',
        isActive: def ? def.active !== false : false,
        orphaned: !def,
        value: r.value,
      };
    });
}

async function shapeVoter(r, { includeCustomFields = false, schemaFields = null } = {}) {
  if (!r) return null;
  const customFields = includeCustomFields && r.survey_epic
    ? await customFieldsFor(r.epic_id, schemaFields ?? (await getPublishedSchema()).fields)
    : undefined;
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
          customFields,
        }
      : null,
  };
}

const SORT_COLUMNS = {
  voter_sno: 'v.voter_sno',
  name: 'v.name_ta',
  age: 'v.age',
  door_no: 'v.door_no',
  part_no: 'v.part_no',
  epic_id: 'v.epic_id',
  surveyed_at: 's.surveyed_at',
};

async function buildFilter(req) {
  const scope = await buildPartFilter(req.user, 'v');
  const where = [scope.sql];
  const params = [...scope.params];

  const search = String(req.query.search ?? req.query.q ?? '').trim();
  if (search) {
    const isNum = /^\d+$/.test(search);
    if (isNum) {
      where.push(`(
        UPPER(v.epic_id) LIKE ?
        OR v.name_ta LIKE ?
        OR v.relative_name_ta LIKE ?
        OR v.door_no LIKE ?
        OR v.voter_sno = ?
      )`);
      params.push(`%${search.toUpperCase()}%`, `%${search}%`, `%${search}%`, `%${search}%`, Number(search));
    } else {
      where.push(`(
        UPPER(v.epic_id) LIKE ?
        OR v.name_ta LIKE ?
        OR v.relative_name_ta LIKE ?
        OR v.door_no LIKE ?
      )`);
      params.push(`%${search.toUpperCase()}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
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

  const agentId = String(req.query.agent_id ?? '').trim();
  if (agentId) { where.push('s.surveyed_by = ?'); params.push(agentId); }

  if (req.query.include_deleted !== '1') where.push('v.is_deleted = 0');

  return { sql: where.join(' AND '), params };
}

/**
 * GET /api/voters/directory
 */
router.get('/directory', async (req, res, next) => {
  try {
    if (req.query.agent_id === 'me') req.query.agent_id = req.user.id;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
    const f = await buildFilter(req);

    const sortKey = String(req.query.sort_by ?? 'voter_sno');
    const sortCol = SORT_COLUMNS[sortKey] ?? SORT_COLUMNS.voter_sno;
    const sortDir = String(req.query.sort_dir ?? 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const totalRow = await db.prepare(`SELECT COUNT(*) c ${COUNT_JOINS} WHERE ${f.sql}`).get(...f.params);
    const total = totalRow?.c ?? 0;

    const rows = await db
      .prepare(
        `SELECT ${VOTER_COLUMNS} ${VOTER_JOINS} WHERE ${f.sql}
          ORDER BY ${sortCol} ${sortDir}, v.part_no, v.voter_sno
          LIMIT ? OFFSET ?`
      )
      .all(...f.params, limit, (page - 1) * limit);

    const shapedRows = await Promise.all(rows.map((r) => shapeVoter(r)));

    res.json({
      rows: shapedRows,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      sortBy: sortKey,
      sortDir: sortDir.toLowerCase(),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/voters/verify-epic?epic_id=… */
router.get('/verify-epic', requireRole(ROLES.A1, ROLES.A2), async (req, res, next) => {
  try {
    const epic = String(req.query.epic_id ?? req.query.epic ?? '').trim().toUpperCase();
    if (!epic) return res.status(400).json({ error: 'EPIC ID is required' });

    const voter = await db
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

    const taken = await db.prepare('SELECT mobile_number FROM users WHERE UPPER(epic_id) = ?').get(epic);
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
  } catch (err) {
    next(err);
  }
});

/** GET /api/voters/:epic */
router.get('/:epic', async (req, res, next) => {
  try {
    const scope = await buildPartFilter(req.user, 'v');
    const epic = String(req.params.epic).trim().toUpperCase();
    const row = await db
      .prepare(`SELECT ${VOTER_COLUMNS} ${VOTER_JOINS} WHERE UPPER(v.epic_id) = ? AND ${scope.sql}`)
      .get(epic, ...scope.params);

    if (!row) {
      const exists = await db.prepare('SELECT 1 FROM voters_master WHERE UPPER(epic_id) = ?').get(epic);
      return res.status(exists ? 403 : 404).json({
        error: exists ? 'This elector is outside your assigned booths' : 'No elector found with this EPIC number',
      });
    }
    res.json(await shapeVoter(row, { includeCustomFields: true }));
  } catch (err) {
    next(err);
  }
});

/**
 * The flat field names older clients post, mapped onto the schema keys the
 * seeded system-bound fields use. Keeping this means a client that hasn't been
 * refreshed (or the A1/A2 edit modal) still submits successfully against the
 * schema-driven validator, instead of silently sending nothing.
 */
const LEGACY_ALIASES = {
  phoneNumber: 'phone_number',
  phone_number: 'phone_number',
  casteId: 'caste_id',
  caste_id: 'caste_id',
  jobId: 'job_id',
  job_id: 'job_id',
  partyId: 'party_id',
  party_id: 'party_id',
  educationId: 'education_id',
  education_id: 'education_id',
  otherJobText: 'other_job_text',
  other_job_text: 'other_job_text',
  remarks: 'remarks',
  sector: 'job_sector',
  job_sector: 'job_sector',
};

/** Builds the answer map from either the new `answers` object or a legacy flat body. */
function buildSubmission(body, fields) {
  const known = new Set(fields.map((f) => f.key));
  const out = {};

  for (const [alias, key] of Object.entries(LEGACY_ALIASES)) {
    if (body[alias] !== undefined && known.has(key) && out[key] === undefined) {
      out[key] = body[alias];
    }
  }
  // Anything already using schema keys at the top level (older custom fields).
  for (const key of known) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  // The canonical shape wins wherever it is present.
  if (body.answers && typeof body.answers === 'object') Object.assign(out, body.answers);
  return out;
}

/**
 * POST /api/voters/survey/submit
 */
router.post('/survey/submit', requireRole(ROLES.A1, ROLES.A2, ROLES.A3), async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const epic = String(b.epicId ?? b.epic_id ?? '').trim().toUpperCase();
    const correctedName = String(b.correctedNameTa ?? b.corrected_name_ta ?? '').trim() || null;
    const correctedRelative = String(b.correctedRelativeNameTa ?? b.corrected_relative_name_ta ?? '').trim() || null;

    if (!epic) {
      return res.status(400).json({ error: 'Please correct the invalid fields', fields: { epicId: 'EPIC number is required' } });
    }

    const scope = await buildPartFilter(req.user, 'v');
    const voter = await db
      .prepare(`SELECT v.epic_id, v.is_deleted FROM voters_master v WHERE UPPER(v.epic_id) = ? AND ${scope.sql}`)
      .get(epic, ...scope.params);
    if (!voter) {
      const exists = await db.prepare('SELECT 1 FROM voters_master WHERE UPPER(epic_id) = ?').get(epic);
      return res.status(exists ? 403 : 404).json({
        error: exists ? 'This elector is outside your assigned booth' : 'No elector found with this EPIC number',
      });
    }
    if (voter.is_deleted) {
      return res.status(409).json({ error: 'This elector is marked deleted in the roll and cannot be surveyed' });
    }

    // Everything in Sections C/D is now governed by the published schema, so
    // the server validates against exactly the form the agent was shown —
    // required flags, types, ranges, patterns, and that every chosen master
    // option is still active. Legacy clients that still post the old flat
    // field names keep working via `answers` falling back to the body itself.
    const schema = await getPublishedSchema();
    const submitted = buildSubmission(b, schema.fields);
    const { systemValues, answers, errors, codes } = await validateSubmission(schema.fields, submitted);

    if (Object.keys(errors).length) {
      // Errors are echoed under the schema key *and* the legacy camelCase name
      // so a client built against either shape can highlight the right input.
      const fields = { ...errors };
      for (const [alias, key] of Object.entries(LEGACY_ALIASES)) {
        if (errors[key] !== undefined && alias !== key) fields[alias] = errors[key];
      }
      // A retired master option is "well-formed but no longer selectable" —
      // that kept its own 422 before this became schema-driven, so it still does.
      const allUnavailable = Object.keys(errors).every((k) => codes[k] === 'unavailable');
      return res.status(allUnavailable ? 422 : 400).json({
        error: allUnavailable
          ? `Selected ${Object.keys(errors).length > 1 ? 'options are' : 'option is'} no longer available`
          : 'Please correct the highlighted fields',
        fields,
      });
    }

    const existing = await db.prepare('SELECT epic_id, surveyed_by FROM voter_surveys WHERE epic_id = ?').get(voter.epic_id);
    const surveyedBy = existing ? existing.surveyed_by : req.user.id;

    // The survey row and its dynamic answers must land together — withTransaction
    // holds one connection for the whole block, so a failure partway through
    // rolls the whole submission back rather than half-saving it.
    await withTransaction(async (trx) => {
      await trx.prepare(
        `INSERT INTO voter_surveys
           (epic_id, corrected_name_ta, corrected_relative_name_ta, phone_number,
            caste_id, job_id, party_id, education_id, other_job_text, remarks,
            surveyed_by, last_updated_by, surveyed_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())
         ON DUPLICATE KEY UPDATE
           corrected_name_ta = VALUES(corrected_name_ta),
           corrected_relative_name_ta = VALUES(corrected_relative_name_ta),
           phone_number = VALUES(phone_number),
           caste_id = VALUES(caste_id),
           job_id = VALUES(job_id),
           party_id = VALUES(party_id),
           education_id = VALUES(education_id),
           other_job_text = VALUES(other_job_text),
           remarks = VALUES(remarks),
           last_updated_by = VALUES(last_updated_by),
           updated_at = NOW()`
      ).run(
        voter.epic_id, correctedName, correctedRelative,
        systemValues.phone_number ?? '',
        systemValues.caste_id ?? null, systemValues.job_id ?? null,
        systemValues.party_id ?? null, systemValues.education_id ?? null,
        systemValues.other_job_text ?? null, systemValues.remarks ?? null,
        surveyedBy, req.user.id
      );

      const upsertAnswer = trx.prepare(
        `INSERT INTO vms_survey_answers (epic_id, field_key, value) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`
      );
      for (const [key, value] of Object.entries(answers)) {
        // A null here means "this field was left blank or its parent condition
        // hid it" — store the cleared state rather than leaving a stale answer.
        await upsertAnswer.run(voter.epic_id, key, value);
      }
    });

    audit(req.user.id, existing ? 'SURVEY_UPDATED' : 'SURVEY_CREATED', 'voter_survey', voter.epic_id,
      `form v${schema.version}`);
    invalidateDashboardCache();

    const fresh = await db.prepare(`SELECT ${VOTER_COLUMNS} ${VOTER_JOINS} WHERE v.epic_id = ?`).get(voter.epic_id);
    const shapedVoter = await shapeVoter(fresh, { includeCustomFields: true, schemaFields: schema.fields });
    res.json({
      ok: true,
      updated: !!existing,
      message: existing ? 'Survey record updated' : 'Survey saved successfully',
      voter: shapedVoter,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/voters/surveys/all
 */
router.delete('/surveys/all', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    if (req.body?.confirm !== 'DELETE ALL SURVEYS') {
      return res.status(400).json({ error: 'Send { "confirm": "DELETE ALL SURVEYS" } to proceed. This cannot be undone.' });
    }
    await db.exec('DELETE FROM survey_field_values');
    await db.exec('DELETE FROM vms_survey_answers');
    const info = await db.prepare('DELETE FROM voter_surveys').run();
    audit(req.user.id, 'ALL_SURVEYS_CLEARED', 'voter_surveys', 'all', `${info.changes} surveys deleted`);
    invalidateDashboardCache();
    res.json({ ok: true, deleted: info.changes });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/voters/survey/:epic */
router.delete('/survey/:epic', requireRole(ROLES.A1), async (req, res, next) => {
  try {
    const epic = String(req.params.epic).trim().toUpperCase();
    const info = await db.prepare('DELETE FROM voter_surveys WHERE UPPER(epic_id) = ?').run(epic);
    if (!info.changes) return res.status(404).json({ error: 'No survey record for this EPIC' });
    await db.prepare('DELETE FROM vms_survey_answers WHERE UPPER(epic_id) = ?').run(epic);
    audit(req.user.id, 'SURVEY_DELETED', 'voter_survey', epic, null);
    invalidateDashboardCache();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export { buildFilter, VOTER_COLUMNS, VOTER_JOINS, shapeVoter };
export default router;
