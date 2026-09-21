/**
 * Targeted regression test for the master-category / master-item "is this
 * option in use?" business rule (routes/masterCategories.js).
 *
 * The rule must be: an option is "in use" only if a survey answer for a field
 * that is actually bound to that option's category holds that option's id.
 * Matching by value alone (ignoring which field the answer belongs to) is
 * wrong — two unrelated fields can hold the same numeric-looking string by
 * coincidence (e.g. a free-text field answered "5" looks identical to a
 * master item with id 5).
 *
 *   node scripts/test-master-categories.mjs [baseUrl]
 *
 * Requires a server already running against a database seeded with
 * scripts/seed-synthetic-test-data.mjs (or any DB with an A1 login and at
 * least one un-surveyed elector).
 */
const BASE = process.argv[2] || 'http://localhost:4099';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}

const run = async () => {
  console.log(`\n  Master-category usage-check test → ${BASE}\n`);

  const login = await api('POST', '/api/auth/login', { body: { mobileNumber: '9876543210', password: 'admin123' } });
  check('A1 login', login.status === 200 && !!login.data.token);
  const T1 = login.data.token;

  // ---- set up a fresh custom category with three items ----------------------
  const suffix = Date.now().toString(36);
  const catRes = await api('POST', '/api/master-categories', { token: T1, body: { name: `Test Category ${suffix}` } });
  check('creates custom category', catRes.status === 201, JSON.stringify(catRes.data));
  const catKey = catRes.data.key;
  const catId = catRes.data.id;

  const itemX = await api('POST', `/api/master-categories/${catId}/items`, { token: T1, body: { name: 'Option X' } });
  const itemY = await api('POST', `/api/master-categories/${catId}/items`, { token: T1, body: { name: 'Option Y' } });
  const itemZ = await api('POST', `/api/master-categories/${catId}/items`, { token: T1, body: { name: 'Option Z (never used)' } });
  check('creates three items', itemX.status === 201 && itemY.status === 201 && itemZ.status === 201);
  const idX = itemX.data.id, idY = itemY.data.id, idZ = itemZ.data.id;

  // ---- add a field bound to this category, plus an unrelated free-text field
  const draftRes = await api('GET', '/api/form-schema/draft', { token: T1 });
  const baseFields = draftRes.data.draft.fields;
  const testFieldKey = `mc_test_field_${suffix}`;
  const unrelatedKey = `mc_unrelated_${suffix}`;
  const fields = [
    ...baseFields,
    { key: testFieldKey, type: 'select', label: 'Test bound field', bind: null, source: { kind: 'master', master: catKey } },
    { key: unrelatedKey, type: 'text', label: 'Unrelated free text', bind: null },
  ];
  const putRes = await api('PUT', '/api/form-schema/draft', { token: T1, body: { fields, title: draftRes.data.draft.title, titleTa: draftRes.data.draft.titleTa } });
  check('draft accepts the new fields', putRes.status === 200, JSON.stringify(putRes.data));

  const pub1 = await api('POST', '/api/form-schema/publish', { token: T1, body: {} });
  check('publishes version with the bound field', pub1.status === 200, JSON.stringify(pub1.data));

  // ---- find an un-surveyed elector to answer against -------------------------
  const dir = await api('GET', '/api/voters/directory?status=pending&limit=1', { token: T1 });
  check('found an un-surveyed elector', dir.status === 200 && dir.data.rows.length >= 1, JSON.stringify(dir.data).slice(0, 200));
  const epicId = dir.data.rows[0].epicId;

  // The unrelated free-text field's answer happens to be item Y's numeric id,
  // as a plain string, purely by coincidence — it has nothing to do with this
  // category. Item X is answered through the field that is genuinely bound.
  const submit = await api('POST', '/api/voters/survey/submit', {
    token: T1,
    body: { epicId, answers: { [testFieldKey]: String(idX), [unrelatedKey]: String(idY) } },
  });
  check('submits a survey answering both fields', submit.status === 200, JSON.stringify(submit.data).slice(0, 300));

  // ---- 1. correct field + correct value -> item IS in use --------------------
  const delX1 = await api('DELETE', `/api/master-categories/items/${idX}`, { token: T1 });
  check('item genuinely answered is blocked from deletion (409)', delX1.status === 409, `got ${delX1.status}`);

  // ---- 2. different field + same numeric value -> item is NOT in use ---------
  const delY1 = await api('DELETE', `/api/master-categories/items/${idY}`, { token: T1 });
  check('item only coincidentally matched by an unrelated field deletes cleanly (200)', delY1.status === 200, `got ${delY1.status}: ${JSON.stringify(delY1.data)}`);

  // ---- 3. no answer at all -> item is not in use ------------------------------
  const delZ1 = await api('DELETE', `/api/master-categories/items/${idZ}`, { token: T1 });
  check('item with no answers at all deletes cleanly (200)', delZ1.status === 200, `got ${delZ1.status}`);

  // ---- category-level delete should also be blocked while X is answered ------
  const catDel1 = await api('DELETE', `/api/master-categories/${catId}`, { token: T1 });
  check('category delete is blocked while a field is bound to it (409, bound-in-draft check)', catDel1.status === 409);

  // ---- 4/5/6. historical answers survive across schema versions --------------
  // Unbind the field from this master in a NEW draft, publish it (version 2+),
  // archiving version 1 — the answer recorded against version 1 must still be
  // found by the usage check, because fieldKeysBoundToMaster scans every
  // schema version, not just the currently-published one.
  const draft2 = await api('GET', '/api/form-schema/draft', { token: T1 });
  const fields2 = draft2.data.draft.fields.filter((f) => f.key !== testFieldKey);
  await api('PUT', '/api/form-schema/draft', { token: T1, body: { fields: fields2, title: draft2.data.draft.title, titleTa: draft2.data.draft.titleTa } });
  const pub2 = await api('POST', '/api/form-schema/publish', { token: T1, body: {} });
  check('publishes a second version with the field removed', pub2.status === 200 && pub2.data.version > pub1.data.version, JSON.stringify(pub2.data));

  const delX2 = await api('DELETE', `/api/master-categories/items/${idX}`, { token: T1 });
  check('item stays protected by its historical (now-archived-schema) answer', delX2.status === 409, `got ${delX2.status}`);

  console.log(`\n${'='.repeat(60)}\n  ${pass} passed   ${fail} failed\n${'='.repeat(60)}\n`);
  process.exitCode = fail ? 1 : 0;
};

run().catch((err) => { console.error('TEST RUNNER CRASHED:', err); process.exitCode = 1; });
