import express from 'express';
import { db } from '../lib/db.js';
import { authenticate, requireRole, ROLES } from '../lib/auth.js';
import { buildPartFilter, visibleUserIds, scopePartNos } from '../lib/scope.js';

const router = express.Router();
router.use(authenticate);

const pct = (done, total) => (total > 0 ? Math.round((done / total) * 1000) / 10 : 0);

/**
 * Dashboard figures are read on nearly every page load and change slowly, so
 * they are memoised per scope for a short window. The key includes the caller's
 * booth list, so one user's cache can never be served to a differently-scoped user.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map();

function cached(key, produce) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = produce();
  cache.set(key, { at: Date.now(), value });
  // Bound the map so a large user base cannot grow it without limit.
  if (cache.size > 200) {
    for (const [k, v] of cache) if (Date.now() - v.at > CACHE_TTL_MS) cache.delete(k);
  }
  return value;
}

export function invalidateDashboardCache() {
  cache.clear();
}

function scopeKey(user) {
  const parts = scopePartNos(user);
  return parts === null ? 'global' : `p:${parts.join(',')}`;
}

/** GET /api/dashboard/stats — headline counters + local-body breakdown */
router.get('/stats', (req, res) => {
  const key = `stats|${scopeKey(req.user)}`;
  const payload = cached(key, () => {
    const scope = buildPartFilter(req.user, 'v');

    const totals = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN s.epic_id IS NOT NULL THEN 1 ELSE 0 END) AS completed
           FROM voters_master v
           LEFT JOIN voter_surveys s ON s.epic_id = v.epic_id
          WHERE v.is_deleted = 0 AND ${scope.sql}`
      )
      .get(...scope.params);

    const total = totals.total ?? 0;
    const completed = totals.completed ?? 0;

    const onDay = (offset) =>
      db.prepare(
        `SELECT COUNT(*) c FROM voter_surveys s
           JOIN voters_master v ON v.epic_id = s.epic_id
          WHERE ${scope.sql} AND v.is_deleted = 0
            AND DATE(s.updated_at) = DATE('now', ?)`
      ).get(...scope.params, offset).c;

    const today = onDay('0 day');
    const yesterday = onDay('-1 day');

    const localBodies = db
      .prepare(
        `SELECT pp.local_body_name_ta AS name, pp.local_body_type AS type,
                COUNT(DISTINCT pp.part_no) AS booths,
                COUNT(v.epic_id) AS total,
                SUM(CASE WHEN s.epic_id IS NOT NULL THEN 1 ELSE 0 END) AS completed
           FROM voters_master v
           JOIN polling_parts pp ON pp.part_no = v.part_no
           LEFT JOIN voter_surveys s ON s.epic_id = v.epic_id
          WHERE v.is_deleted = 0 AND ${scope.sql}
          GROUP BY pp.local_body_name_ta, pp.local_body_type
          ORDER BY total DESC`
      )
      .all(...scope.params)
      .map((r) => ({
        name: r.name,
        type: r.type,
        booths: r.booths,
        total: r.total,
        completed: r.completed ?? 0,
        pending: r.total - (r.completed ?? 0),
        progress: pct(r.completed ?? 0, r.total),
      }));

    const trendRows = db
      .prepare(
        `SELECT DATE(s.updated_at) AS day, COUNT(*) AS count
           FROM voter_surveys s
           JOIN voters_master v ON v.epic_id = s.epic_id
          WHERE ${scope.sql} AND DATE(s.updated_at) >= DATE('now','-13 day')
          GROUP BY day ORDER BY day`
      )
      .all(...scope.params);
    const trendMap = new Map(trendRows.map((t) => [t.day, t.count]));
    const trend = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const day = d.toISOString().slice(0, 10);
      trend.push({ day, count: trendMap.get(day) ?? 0 });
    }

    const ac = db.prepare('SELECT ac_no, ac_name_ta, district_ta FROM polling_parts LIMIT 1').get();

    return {
      scope: req.user.role === ROLES.A1 ? 'global' : 'assigned',
      constituency: ac ? { acNo: ac.ac_no, acNameTa: ac.ac_name_ta, districtTa: ac.district_ta } : null,
      totals: {
        total,
        completed,
        pending: total - completed,
        completionPct: pct(completed, total),
        pendingPct: pct(total - completed, total),
        today,
        yesterday,
        todayDeltaPct: yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : (today > 0 ? 100 : null),
        booths: db.prepare(`SELECT COUNT(DISTINCT v.part_no) c FROM voters_master v WHERE ${scope.sql}`).get(...scope.params).c,
        localBodies: localBodies.length,
      },
      localBodies,
      trend,
    };
  });

  res.json(payload);
});

/** GET /api/dashboard/agents — per-agent productivity, A1 & A2 only */
router.get('/agents', requireRole(ROLES.A1, ROLES.A2), (req, res) => {
  const visible = visibleUserIds(req.user);
  const where = [`u.role = '${ROLES.A3}'`];
  const params = [];
  if (visible !== null) {
    if (!visible.length) return res.json([]);
    where.push(`u.id IN (${visible.map(() => '?').join(',')})`);
    params.push(...visible);
  }

  const rows = db
    .prepare(
      `SELECT u.id, u.full_name, u.mobile_number, u.is_active, u.last_login_at,
              (SELECT COUNT(*) FROM voter_surveys s WHERE s.surveyed_by = u.id) AS surveysDone,
              (SELECT COUNT(*) FROM voter_surveys s WHERE s.surveyed_by = u.id
                 AND DATE(s.updated_at) = DATE('now')) AS todayDone,
              (SELECT COUNT(*) FROM voters_master v WHERE v.is_deleted = 0 AND v.part_no IN
                 (SELECT part_no FROM user_jurisdictions WHERE user_id = u.id)) AS assignedVoters,
              (SELECT GROUP_CONCAT(part_no) FROM (
                 SELECT part_no FROM user_jurisdictions WHERE user_id = u.id ORDER BY part_no
               )) AS partList,
              (SELECT COUNT(*) FROM user_jurisdictions WHERE user_id = u.id) AS boothCount
         FROM users u
        WHERE ${where.join(' AND ')}
        ORDER BY surveysDone DESC`
    )
    .all(...params);

  res.json(
    rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      mobileNumber: r.mobile_number,
      isActive: !!r.is_active,
      lastLoginAt: r.last_login_at,
      surveysDone: r.surveysDone,
      todayDone: r.todayDone,
      assignedVoters: r.assignedVoters,
      boothCount: r.boothCount,
      partList: r.partList ? r.partList.split(',').map(Number) : [],
      progress: pct(r.surveysDone, r.assignedVoters),
      pending: Math.max(0, r.assignedVoters - r.surveysDone),
    }))
  );
});

/** GET /api/dashboard/breakdown — caste / job sector / party / sex / age */
router.get('/breakdown', (req, res) => {
  const key = `breakdown|${scopeKey(req.user)}`;
  const payload = cached(key, () => {
    const scope = buildPartFilter(req.user, 'v');

    const castes = db
      .prepare(
        `SELECT cm.name AS label, cm.name_ta AS labelTa, cm.category, COUNT(*) AS count
           FROM voter_surveys s
           JOIN voters_master v ON v.epic_id = s.epic_id
           JOIN caste_master cm ON cm.id = s.caste_id
          WHERE ${scope.sql} AND v.is_deleted = 0
          GROUP BY cm.id ORDER BY count DESC`
      ).all(...scope.params);

    // Occupation rolls up to the sector, which is what campaign planning uses.
    const jobSectors = db
      .prepare(
        `SELECT jm.category AS label, jm.category_ta AS labelTa, COUNT(*) AS count
           FROM voter_surveys s
           JOIN voters_master v ON v.epic_id = s.epic_id
           JOIN job_master jm ON jm.id = s.job_id
          WHERE ${scope.sql} AND v.is_deleted = 0
          GROUP BY jm.category ORDER BY count DESC`
      ).all(...scope.params);

    const jobs = db
      .prepare(
        `SELECT jm.name AS label, jm.name_ta AS labelTa, jm.category, COUNT(*) AS count
           FROM voter_surveys s
           JOIN voters_master v ON v.epic_id = s.epic_id
           JOIN job_master jm ON jm.id = s.job_id
          WHERE ${scope.sql} AND v.is_deleted = 0
          GROUP BY jm.id ORDER BY count DESC`
      ).all(...scope.params);

    const parties = db
      .prepare(
        `SELECT pm.name AS label, pm.name_ta AS labelTa, pm.party_code AS code,
                pm.color_code AS color, pm.symbol_img AS symbol, COUNT(*) AS count
           FROM voter_surveys s
           JOIN voters_master v ON v.epic_id = s.epic_id
           JOIN party_master pm ON pm.id = s.party_id
          WHERE ${scope.sql} AND v.is_deleted = 0
          GROUP BY pm.id ORDER BY count DESC`
      ).all(...scope.params);

    const gender = db
      .prepare(
        `SELECT COALESCE(v.gender,'—') AS label, COUNT(*) AS count
           FROM voters_master v
          WHERE v.is_deleted = 0 AND ${scope.sql}
          GROUP BY v.gender ORDER BY count DESC`
      ).all(...scope.params);

    const ageBands = db
      .prepare(
        `SELECT CASE
                  WHEN v.age < 25 THEN '18-24'
                  WHEN v.age < 35 THEN '25-34'
                  WHEN v.age < 45 THEN '35-44'
                  WHEN v.age < 60 THEN '45-59'
                  WHEN v.age < 75 THEN '60-74'
                  ELSE '75+' END AS label,
                COUNT(*) AS count
           FROM voters_master v
          WHERE v.is_deleted = 0 AND v.age IS NOT NULL AND ${scope.sql}
          GROUP BY label ORDER BY label`
      ).all(...scope.params);

    return { castes, jobSectors, jobs, parties, gender, ageBands };
  });

  res.json(payload);
});

/** GET /api/dashboard/recent — latest survey activity feed */
router.get('/recent', (req, res) => {
  const scope = buildPartFilter(req.user, 'v');
  const limit = Math.min(50, Math.max(5, Number(req.query.limit) || 10));
  const rows = db
    .prepare(
      `SELECT s.epic_id, s.corrected_name_ta, s.phone_number, s.updated_at,
              v.name_ta, v.part_no,
              pp.local_body_name_ta,
              u.full_name AS agent_name,
              pm.name AS party_name, pm.color_code, pm.symbol_img
         FROM voter_surveys s
         JOIN voters_master v ON v.epic_id = s.epic_id
         JOIN polling_parts pp ON pp.part_no = v.part_no
         LEFT JOIN users u ON u.id = s.surveyed_by
         LEFT JOIN party_master pm ON pm.id = s.party_id
        WHERE ${scope.sql}
        ORDER BY s.updated_at DESC LIMIT ?`
    )
    .all(...scope.params, limit);

  res.json(rows.map((r) => ({
    epicId: r.epic_id,
    nameTa: r.corrected_name_ta ?? r.name_ta,
    phoneNumber: r.phone_number,
    updatedAt: r.updated_at,
    partNo: r.part_no,
    localBodyNameTa: r.local_body_name_ta,
    agentName: r.agent_name,
    partyName: r.party_name,
    colorCode: r.color_code,
    symbolImg: r.symbol_img,
  })));
});

/** GET /api/dashboard/audit — recent system activity, A1 only */
router.get('/audit', requireRole(ROLES.A1), (req, res) => {
  const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 50));
  res.json(
    db.prepare(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.detail, a.created_at,
              u.full_name, u.mobile_number, u.role
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.id DESC LIMIT ?`
    ).all(limit)
  );
});

export default router;
