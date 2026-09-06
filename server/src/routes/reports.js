import express from 'express';
import ExcelJS from 'exceljs';
import { db } from '../lib/db.js';
import { authenticate, requireRole, audit, ROLES } from '../lib/auth.js';
import { buildFilter } from './voters.js';

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/reports/export — the filtered result set as an .xlsx workbook.
 *
 * Column headers are Tamil, matching the field the data actually came from, so
 * the sheet is readable by the constituency staff who use it.
 */
router.get('/export', requireRole(ROLES.A1), async (req, res) => {
  const LIMIT = 30000; // guards against an accidental full-roll export exhausting memory
  const f = buildFilter(req);

  const rows = db
    .prepare(
      `SELECT v.epic_id, v.name_ta, v.relative_name_ta, v.relation_type_ta,
              v.part_no, v.door_no, v.age, v.gender, v.voter_sno,
              pp.local_body_name_ta, pp.local_body_type,
              s.corrected_name_ta, s.corrected_relative_name_ta,
              s.phone_number, s.other_job_text, s.surveyed_at,
              cm.name AS caste_name, cm.name_ta AS caste_name_ta, cm.category AS caste_category,
              jm.category AS job_category, jm.category_ta AS job_category_ta,
              jm.name AS job_name, jm.name_ta AS job_name_ta,
              pm.name AS party_name, pm.name_ta AS party_name_ta, pm.party_code,
              u.full_name AS agent_name
         FROM voters_master v
         JOIN polling_parts pp ON pp.part_no = v.part_no
         LEFT JOIN voter_surveys s ON s.epic_id = v.epic_id
         LEFT JOIN caste_master cm ON cm.id = s.caste_id
         LEFT JOIN job_master   jm ON jm.id = s.job_id
         LEFT JOIN party_master pm ON pm.id = s.party_id
         LEFT JOIN users u ON u.id = s.surveyed_by
        WHERE ${f.sql}
        ORDER BY v.part_no, v.voter_sno
        LIMIT ?`
    )
    .all(...f.params, LIMIT);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="vms-survey-report.xlsx"');

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
  const ws = wb.addWorksheet('கணக்கெடுப்பு அறிக்கை', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [
    { header: 'வாக்காளர் அடையாள அட்டை', key: 'epic', width: 18 },
    { header: 'வாக்காளர் பெயர்', key: 'name', width: 22 },
    { header: 'திருத்தப்பட்ட பெயர்', key: 'corrected', width: 22 },
    { header: 'உறவினர் பெயர்', key: 'relative', width: 22 },
    { header: 'உறவு முறை', key: 'relation', width: 14 },
    { header: 'பாகம் எண்', key: 'part', width: 10 },
    { header: 'உள்ளாட்சி அமைப்பு', key: 'localBody', width: 20 },
    { header: 'கதவு எண்', key: 'door', width: 12 },
    { header: 'வயது', key: 'age', width: 8 },
    { header: 'பாலினம்', key: 'gender', width: 12 },
    { header: 'கைபேசி எண்', key: 'phone', width: 15 },
    { header: 'சாதி / சமூகம்', key: 'caste', width: 20 },
    { header: 'இட ஒதுக்கீடு', key: 'casteCategory', width: 12 },
    { header: 'தொழில் பிரிவு', key: 'jobSector', width: 22 },
    { header: 'தொழில்', key: 'job', width: 22 },
    { header: 'கூடுதல் தொழில் குறிப்பு', key: 'otherJob', width: 24 },
    { header: 'அரசியல் சார்பு', key: 'party', width: 18 },
    { header: 'கட்சி குறியீடு', key: 'partyCode', width: 14 },
    { header: 'கணக்கெடுப்பாளர்', key: 'agent', width: 20 },
    { header: 'கணக்கெடுப்பு நாள்', key: 'surveyedAt', width: 20 },
  ];

  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  head.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  head.height = 34;
  head.commit();

  for (const r of rows) {
    ws.addRow({
      epic: r.epic_id,
      name: r.name_ta,
      corrected: r.corrected_name_ta ?? '',
      relative: r.corrected_relative_name_ta ?? r.relative_name_ta ?? '',
      relation: r.relation_type_ta ?? '',
      part: r.part_no,
      localBody: r.local_body_name_ta,
      door: r.door_no ?? '',
      age: r.age ?? '',
      gender: r.gender ?? '',
      phone: r.phone_number ?? '',
      caste: r.caste_name_ta ?? r.caste_name ?? '',
      casteCategory: r.caste_category ?? '',
      jobSector: r.job_category_ta ?? r.job_category ?? '',
      job: r.job_name_ta ?? r.job_name ?? '',
      otherJob: r.other_job_text ?? '',
      party: r.party_name_ta ?? r.party_name ?? '',
      partyCode: r.party_code ?? '',
      agent: r.agent_name ?? '',
      surveyedAt: r.surveyed_at ? new Date(r.surveyed_at).toLocaleString('en-IN') : '',
    }).commit();
  }

  await ws.commit();
  await wb.commit();
  audit(req.user.id, 'EXPORT', 'voters', null, `${rows.length} rows`);
});

export default router;
