import express from 'express';
import { db } from '../lib/db.js';
import { authenticate } from '../lib/auth.js';
import { assignableParts, buildPartFilter } from '../lib/scope.js';

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/booths — the booths and local bodies the caller may see.
 * Already scope-filtered, so a supervisor's dropdowns can never list a booth
 * outside their jurisdiction.
 */
router.get('/', (req, res) => {
  res.json(assignableParts(req.user));
});

/** GET /api/booths/local-bodies — panchayat/town list with booth and voter counts */
router.get('/local-bodies', (req, res) => {
  const scope = buildPartFilter(req.user, 'v');
  const rows = db
    .prepare(
      `SELECT pp.local_body_name_ta AS name, pp.local_body_type AS type,
              COUNT(DISTINCT pp.part_no) AS booths,
              COUNT(v.epic_id) AS voters
         FROM voters_master v
         JOIN polling_parts pp ON pp.part_no = v.part_no
        WHERE v.is_deleted = 0 AND ${scope.sql}
        GROUP BY pp.local_body_name_ta, pp.local_body_type
        ORDER BY voters DESC`
    )
    .all(...scope.params);
  res.json(rows);
});

/** GET /api/booths/:partNo — one booth's detail, scope-checked */
router.get('/:partNo', (req, res) => {
  const partNo = Number(req.params.partNo);
  if (!Number.isInteger(partNo)) return res.status(400).json({ error: 'Invalid booth number' });

  const allowed = assignableParts(req.user).parts.some((p) => p.part_no === partNo);
  if (!allowed) return res.status(403).json({ error: 'This booth is outside your jurisdiction' });

  const row = db
    .prepare(
      `SELECT pp.*,
              (SELECT COUNT(*) FROM voters_master v WHERE v.part_no = pp.part_no AND v.is_deleted = 0) AS voter_count,
              (SELECT COUNT(*) FROM voters_master v
                 JOIN voter_surveys s ON s.epic_id = v.epic_id
                WHERE v.part_no = pp.part_no AND v.is_deleted = 0) AS surveyed_count
         FROM polling_parts pp WHERE pp.part_no = ?`
    )
    .get(partNo);
  if (!row) return res.status(404).json({ error: 'Booth not found' });
  res.json(row);
});

export default router;
