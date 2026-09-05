import express from 'express';
import { pool } from '../lib/db.js';
import { SYNC_TABLES, SYNC_OPERATIONS, applyEvent } from '../lib/tables.js';

const router = express.Router();
const MAX_BATCH = 500;

/**
 * Processes one event inside its own transaction and returns the outcome the
 * client's outbox needs to decide what to mark synced.
 *
 * Idempotency is the whole point here: the ledger INSERT and the mirror-table
 * apply happen in the *same* transaction, committed together only on success.
 *   - If the INSERT hits the ledger's PRIMARY KEY (event_id) on a duplicate,
 *     this event was already fully applied and committed on a previous
 *     attempt — roll back this no-op transaction and report 'duplicate'
 *     (success, without touching the mirror table a second time).
 *   - If applying to the mirror table throws for any other reason, the whole
 *     transaction rolls back *including* the ledger insert — so a failed
 *     attempt leaves no trace, and the next retry is a clean first attempt
 *     rather than being stuck believing it already succeeded.
 */
async function processEvent(evt) {
  const { event_id, table_name, record_pk, operation, payload } = evt ?? {};

  if (!event_id || !table_name || !record_pk || !operation) {
    return { event_id: event_id ?? null, status: 'error', error: 'Missing required event fields' };
  }
  if (!SYNC_TABLES[table_name]) {
    return { event_id, status: 'error', error: `Table "${table_name}" is not sync-enabled` };
  }
  if (!SYNC_OPERATIONS.includes(operation)) {
    return { event_id, status: 'error', error: `Unknown operation "${operation}"` };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    try {
      await conn.query(
        'INSERT INTO sync_events (event_id, table_name, record_pk, operation, payload) VALUES (?, ?, ?, ?, ?)',
        [event_id, table_name, String(record_pk), operation, JSON.stringify(payload ?? {})]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        await conn.rollback();
        return { event_id, status: 'duplicate' };
      }
      throw err;
    }

    await applyEvent(conn, { table_name, record_pk: String(record_pk), operation, payload: payload ?? {} });
    await conn.commit();
    return { event_id, status: 'applied' };
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error(`[sync-server] event ${event_id} (${table_name}/${operation}) failed:`, err.message);
    return { event_id, status: 'error', error: err.message };
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
