import { getPendingBatch, markSynced, markAttempt, outboxStats, pruneSynced } from './outbox.js';

/** Above this many failed attempts on the oldest pending event, escalate the log line — never stop retrying. */
const HIGH_ATTEMPT_WARNING = 20;

let inFlight = false;
let pruneCounter = 0;

async function postBatch(apiUrl, apiKey, events, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl}/api/sync/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        events: events.map((e) => ({
          event_id: e.event_id,
          table_name: e.table_name,
          record_pk: e.record_pk,
          operation: e.operation,
          payload: JSON.parse(e.payload),
          created_at: e.created_at,
        })),
      }),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? `Sync server responded ${res.status}`);
    return body; // { results: [{ event_id, status: 'applied'|'duplicate'|'error', error? }] }
  } finally {
    clearTimeout(timer);
  }
}

async function tick(config) {
  if (inFlight) return; // never let two sync cycles overlap
  inFlight = true;
  try {
    const batch = getPendingBatch(config.batchSize);
    if (!batch.length) return;

    let response;
    try {
      response = await postBatch(config.apiUrl, config.apiKey, batch, config.timeoutMs);
    } catch (err) {
      // Server/internet unavailable: every event in the batch stays 'pending'
      // exactly as it was — nothing to undo. Log once per cycle (not once per
      // event) so an extended outage doesn't spam the log, and try again on
      // the next tick automatically.
      for (const e of batch) markAttempt(e.event_id, err.message);
      console.error(`[sync] batch of ${batch.length} failed: ${err.message}`);
      const stats = outboxStats();
      if (stats.maxPendingAttempts >= HIGH_ATTEMPT_WARNING) {
        console.error(
          `[sync] WARNING: some events have failed ${stats.maxPendingAttempts}+ times — ` +
          `check connectivity to ${config.apiUrl} (${stats.pending} events still pending)`
        );
      }
      return;
    }

    const byId = new Map((response.results ?? []).map((r) => [r.event_id, r]));
    const toMarkSynced = [];
    for (const e of batch) {
      const result = byId.get(e.event_id);
      // 'duplicate' means the server already fully applied this event on an
      // earlier attempt (our own ack was lost, e.g. to a dropped connection) —
      // safe to mark synced, never reprocessed on the MySQL side either way.
      if (result && (result.status === 'applied' || result.status === 'duplicate')) {
        toMarkSynced.push(e.event_id);
      } else {
        markAttempt(e.event_id, result?.error ?? 'No result returned for this event');
      }
    }
    if (toMarkSynced.length) markSynced(toMarkSynced);
    if (toMarkSynced.length < batch.length) {
      console.error(`[sync] ${batch.length - toMarkSynced.length} of ${batch.length} events were rejected by the sync server — will retry`);
    }

    // Housekeeping runs every ~200 successful cycles, not every tick.
    if (++pruneCounter >= 200) {
      pruneCounter = 0;
      const removed = pruneSynced(30);
      if (removed) console.log(`[sync] pruned ${removed} synced outbox rows older than 30 days`);
    }
  } catch (err) {
    console.error('[sync] unexpected error in sync tick:', err);
  } finally {
    inFlight = false;
  }
}

/**
 * Starts the background sync loop. Returns a stop() function, or null if
 * SYNC_API_URL is not configured (sync is opt-in — an instance with nothing
 * set keeps working exactly as before, purely local).
 */
export function startSyncWorker(config) {
  if (!config.apiUrl) {
    console.log('[sync] SYNC_API_URL not set — central MySQL sync is disabled for this instance');
    return null;
  }
  if (!config.apiKey) {
    console.error('[sync] SYNC_API_URL is set but SYNC_API_KEY is missing — sync worker will not start');
    return null;
  }

  console.log(
    `[sync] background sync worker started -> ${config.apiUrl} ` +
    `(every ${config.intervalMs}ms, batches of ${config.batchSize})`
  );

  const timer = setInterval(() => void tick(config), config.intervalMs);
  timer.unref?.(); // a pending sync retry should never keep the process alive on its own
  void tick(config); // also try immediately, rather than waiting a full interval on startup

  return () => clearInterval(timer);
}
