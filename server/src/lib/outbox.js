import { db } from './db.js';
import { SYNC_TABLES } from '../../../shared/sync-tables.mjs';

export { SYNC_TABLES };

/**
 * Transactional outbox: every INSERT/UPDATE/DELETE on a synced table writes a
 * row here via an AFTER trigger, inside the exact same SQLite transaction as
 * the change itself. That's what makes it crash-safe — the outbox row and the
 * data change either both commit or both roll back together; there is no
 * window where one exists without the other.
 */
export function migrateOutbox() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_outbox (
      event_id    TEXT PRIMARY KEY,
      table_name  TEXT NOT NULL,
      record_pk   TEXT NOT NULL,
      operation   TEXT NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE')),
      payload     TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','synced')),
      attempts    INTEGER NOT NULL DEFAULT 0,
      last_error  TEXT,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      synced_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_pending ON sync_outbox(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_outbox_table   ON sync_outbox(table_name, record_pk);
  `);

  // vms_uuid() (called by every trigger below) is registered unconditionally
  // in db.js the moment this connection is opened — see the comment there.

  for (const [table, { pk, columns }] of Object.entries(SYNC_TABLES)) {
    const newCols = columns.map((c) => `'${c}', NEW.${c}`).join(', ');
    const oldCols = columns.map((c) => `'${c}', OLD.${c}`).join(', ');

    // table/column names here come only from our own hardcoded SYNC_TABLES
    // whitelist (shared/sync-tables.mjs) — never from user input — so building
    // this SQL by string interpolation carries no injection risk.
    //
    // DROP + CREATE (not "IF NOT EXISTS") on every startup: a trigger's body is
    // baked in at creation time, so if SYNC_TABLES ever gains a column, "IF NOT
    // EXISTS" would leave the old trigger — and the old column list — in place
    // forever. Recreating is a few milliseconds and guarantees the trigger
    // always matches the current config.
    db.exec(`
      DROP TRIGGER IF EXISTS trg_outbox_${table}_ai;
      CREATE TRIGGER trg_outbox_${table}_ai
      AFTER INSERT ON ${table} BEGIN
        INSERT INTO sync_outbox (event_id, table_name, record_pk, operation, payload)
        VALUES (vms_uuid(), '${table}', CAST(NEW.${pk} AS TEXT), 'CREATE', json_object(${newCols}));
      END;

      DROP TRIGGER IF EXISTS trg_outbox_${table}_au;
      CREATE TRIGGER trg_outbox_${table}_au
      AFTER UPDATE ON ${table} BEGIN
        INSERT INTO sync_outbox (event_id, table_name, record_pk, operation, payload)
        VALUES (vms_uuid(), '${table}', CAST(NEW.${pk} AS TEXT), 'UPDATE', json_object(${newCols}));
      END;

      DROP TRIGGER IF EXISTS trg_outbox_${table}_ad;
      CREATE TRIGGER trg_outbox_${table}_ad
      AFTER DELETE ON ${table} BEGIN
        INSERT INTO sync_outbox (event_id, table_name, record_pk, operation, payload)
        VALUES (vms_uuid(), '${table}', CAST(OLD.${pk} AS TEXT), 'DELETE', json_object(${oldCols}));
      END;
    `);
  }
}

/** The next batch of events to send, oldest first (preserves write order). */
export function getPendingBatch(limit) {
  return db
    .prepare(
      `SELECT event_id, table_name, record_pk, operation, payload, attempts, created_at
         FROM sync_outbox
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT ?`
    )
    .all(limit);
}

/** Called only after the sync server has durably confirmed these events. */
export function markSynced(eventIds) {
  if (!eventIds.length) return;
  const now = new Date().toISOString();
  const stmt = db.prepare(`UPDATE sync_outbox SET status = 'synced', synced_at = ? WHERE event_id = ?`);
  db.exec('BEGIN');
  try {
    for (const id of eventIds) stmt.run(now, id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Records a failed/unconfirmed attempt; the event stays 'pending' and is retried. */
export function markAttempt(eventId, errorMessage) {
  db.prepare(`UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE event_id = ?`)
    .run(errorMessage ? String(errorMessage).slice(0, 2000) : null, eventId);
}

export function outboxStats() {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'synced'  THEN 1 ELSE 0 END) AS synced,
         COALESCE(MAX(CASE WHEN status = 'pending' THEN attempts END), 0) AS max_pending_attempts
       FROM sync_outbox`
    )
    .get();
  return {
    pending: row.pending ?? 0,
    synced: row.synced ?? 0,
    maxPendingAttempts: row.max_pending_attempts ?? 0,
  };
}

/** Housekeeping: drop synced rows older than N days so the outbox never grows unbounded. */
export function pruneSynced(olderThanDays = 30) {
  const info = db
    .prepare(`DELETE FROM sync_outbox WHERE status = 'synced' AND synced_at < datetime('now', ?)`)
    .run(`-${olderThanDays} days`);
  return info.changes;
}
