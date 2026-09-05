import { SYNC_TABLES, SYNC_OPERATIONS, applyEvent } from './tables.js';

/**
 * Applies one event using an already-acquired connection. Separated from the
 * route handler (which owns acquiring/releasing the connection from the pool)
 * so this — the part that actually matters — can be unit-tested with a fake
 * connection, with no real MySQL required.
 *
 * Idempotency is the whole point: the ledger INSERT and the mirror-table apply
 * happen in the *same* transaction, committed together only on success.
 *   - If the INSERT hits the ledger's PRIMARY KEY (event_id) on a duplicate,
 *     this event was already fully applied and committed on a previous
 *     attempt — roll back this no-op transaction and report 'duplicate'
 *     (success, without touching the mirror table a second time).
 *   - If applying to the mirror table throws for any other reason, the whole
 *     transaction rolls back *including* the ledger insert — so a failed
 *     attempt leaves no trace, and the next retry is a clean first attempt
 *     rather than being stuck believing it already succeeded.
 */
export async function processEventWithConn(conn, evt) {
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

  await conn.beginTransaction();
  try {
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
  }
}
