import express from 'express';
import { pool } from '../lib/db.js';
import { processEventWithConn } from '../lib/processEvent.js';

const router = express.Router();
const MAX_BATCH = 500;

async function processEvent(evt) {
  const conn = await pool.getConnection();
  try {
    return await processEventWithConn(conn, evt);
  } finally {
    conn.release();
  }
}

/** POST /api/sync/ingest — { events: [...] } -> { results: [{event_id, status, error?}] } */
router.post('/ingest', async (req, res) => {
  const events = Array.isArray(req.body?.events) ? req.body.events : null;
  if (!events) return res.status(400).json({ error: 'Body must be { events: [...] }' });
  if (events.length === 0) return res.json({ results: [] });
  if (events.length > MAX_BATCH) {
    return res.status(400).json({ error: `A batch may contain at most ${MAX_BATCH} events` });
  }

  // Sequential, not parallel: events in a batch can touch the same row (e.g.
  // an UPDATE right after the CREATE that made it), and applying them out of
  // order would silently corrupt the mirror. The client sends them oldest
  // first, so processing in array order preserves that.
  const results = [];
  for (const evt of events) results.push(await processEvent(evt));

  res.json({ results });
});

export default router;
