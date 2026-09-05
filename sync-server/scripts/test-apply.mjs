/**
 * Unit tests for the transactional-apply logic, using a fake MySQL connection
 * that records every call instead of hitting a real database.
 *
 *   node scripts/test-apply.mjs
 *
 * This does NOT require DB_HOST/credentials or a live MySQL server — it
 * verifies the idempotency and rollback semantics of processEventWithConn()
 * directly, which is the part that actually has to be correct for "MySQL must
 * handle duplicate event_id safely" and "crash-safe so no local changes are
 * lost" to hold. Full end-to-end verification against the real MySQL server
 * still requires the target database to exist (see README).
 */
import { processEventWithConn } from '../src/lib/processEvent.js';

function makeFakeConn({ failLedgerWith, failApplyWith } = {}) {
  const calls = [];
  return {
    calls,
    async beginTransaction() { calls.push(['BEGIN']); },
    async commit() { calls.push(['COMMIT']); },
    async rollback() { calls.push(['ROLLBACK']); },
    async query(sql, params) {
      const isLedger = sql.includes('INSERT INTO sync_events');
      calls.push(['QUERY', sql.trim().split('\n')[0].trim(), params]);
      if (isLedger && failLedgerWith) {
        const err = new Error('Duplicate entry for key PRIMARY');
        err.code = failLedgerWith;
        throw err;
      }
      if (!isLedger && failApplyWith) {
        throw new Error(failApplyWith);
      }
      return [{ affectedRows: 1 }];
    },
  };
}

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
}

const run = async () => {
console.log('\n  sync-server apply-logic tests (no MySQL connection required)\n');

// 1. CREATE applies, commits, and normalizes the ISO timestamp for MySQL.
{
  const conn = makeFakeConn();
  const r = await processEventWithConn(conn, {
    event_id: 'e1', table_name: 'caste_master', record_pk: '5', operation: 'CREATE',
    payload: { id: 5, name: 'Test', name_ta: null, category: 'BC', is_active: 1, created_at: '2026-01-01T00:00:00.000Z' },
  });
  check('CREATE returns applied', r.status === 'applied', JSON.stringify(r));
  check('CREATE commits', conn.calls.some((c) => c[0] === 'COMMIT'));
  const upsert = conn.calls.find((c) => c[1]?.startsWith('INSERT INTO caste_master'));
  check('CREATE builds an ON DUPLICATE KEY UPDATE upsert', /ON DUPLICATE KEY UPDATE/.test(upsert?.[1] ?? ''), upsert?.[1]);
  check('CREATE normalizes the ISO timestamp to MySQL DATETIME', upsert?.[2]?.includes('2026-01-01 00:00:00'), JSON.stringify(upsert?.[2]));
}

// 2. UPDATE behaves the same as CREATE (both upsert — that's the point of ON DUPLICATE KEY UPDATE).
{
  const conn = makeFakeConn();
  const r = await processEventWithConn(conn, {
    event_id: 'e2', table_name: 'party_master', record_pk: '3', operation: 'UPDATE',
    payload: { id: 3, name: 'DMK', name_ta: null, party_code: 'DMK', color_code: '#DC2626', symbol_img: null, is_active: 1, created_at: null },
  });
  check('UPDATE returns applied', r.status === 'applied');
  check('UPDATE issues an upsert against party_master', conn.calls.some((c) => c[1]?.startsWith('INSERT INTO party_master')));
}

// 3. DELETE issues a plain DELETE keyed on the table's primary key.
{
  const conn = makeFakeConn();
  const r = await processEventWithConn(conn, {
    event_id: 'e3', table_name: 'voter_surveys', record_pk: 'IEB123', operation: 'DELETE', payload: {},
  });
  check('DELETE returns applied', r.status === 'applied');
  const del = conn.calls.find((c) => c[1]?.startsWith('DELETE FROM voter_surveys'));
  check('DELETE targets the correct row by primary key', del?.[2]?.[0] === 'IEB123', JSON.stringify(del));
}

// 4. Duplicate event_id -> rolls back, reports 'duplicate', mirror table is never touched a second time.
{
  const conn = makeFakeConn({ failLedgerWith: 'ER_DUP_ENTRY' });
  const r = await processEventWithConn(conn, {
    event_id: 'e4', table_name: 'caste_master', record_pk: '5', operation: 'CREATE', payload: { id: 5 },
  });
  check('duplicate event_id reports status=duplicate (not an error)', r.status === 'duplicate', JSON.stringify(r));
  check('duplicate rolls back the no-op transaction', conn.calls.some((c) => c[0] === 'ROLLBACK'));
  check('duplicate never re-applies to the mirror table', !conn.calls.some((c) => c[1]?.startsWith('INSERT INTO caste_master')));
}

// 5. A failure while applying rolls back the WHOLE transaction, including the
//    ledger insert — so a retry is a clean first attempt, not stuck forever.
{
  const conn = makeFakeConn({ failApplyWith: 'mirror table apply blew up' });
  const r = await processEventWithConn(conn, {
    event_id: 'e5', table_name: 'caste_master', record_pk: '5', operation: 'CREATE', payload: { id: 5 },
  });
  check('apply failure reports status=error', r.status === 'error', JSON.stringify(r));
  check('apply failure rolls back', conn.calls.some((c) => c[0] === 'ROLLBACK'));
  check('apply failure never commits (nothing half-applied)', !conn.calls.some((c) => c[0] === 'COMMIT'));
  check('error message is passed through for logging/diagnosis', r.error === 'mirror table apply blew up');
}

// 6. A table outside the whitelist is rejected before ever touching the connection.
{
  const conn = makeFakeConn();
  const r = await processEventWithConn(conn, {
    event_id: 'e6', table_name: 'not_a_real_table', record_pk: '1', operation: 'CREATE', payload: {},
  });
  check('unknown table is rejected', r.status === 'error' && /not sync-enabled/.test(r.error), r.error);
  check('unknown table never opens a transaction', conn.calls.length === 0);
}

// 7. Malformed events (missing fields) are rejected the same way.
{
  const conn = makeFakeConn();
  const r = await processEventWithConn(conn, { event_id: 'e7', table_name: 'caste_master' });
  check('missing operation/record_pk is rejected', r.status === 'error');
  check('malformed event never opens a transaction', conn.calls.length === 0);
}

// 8. An unrecognised operation string is rejected.
{
  const conn = makeFakeConn();
  const r = await processEventWithConn(conn, {
    event_id: 'e8', table_name: 'caste_master', record_pk: '5', operation: 'PATCH', payload: {},
  });
  check('unknown operation is rejected', r.status === 'error' && /Unknown operation/.test(r.error), r.error);
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`  ${pass} passed   ${fail ? `${fail} failed` : '0 failed'}`);
console.log(`${'═'.repeat(60)}\n`);
process.exit(fail ? 1 : 0);
};

run().catch((e) => { console.error('TEST RUNNER CRASHED:', e); process.exit(1); });
