/**
 * End-to-end check for the Dynamic Form Builder + Master Data Hub.
 *   node scripts/test-form-builder.mjs [baseUrl]
 *
 * Covers schema CRUD, RBAC, validation rules, conditional visibility,
 * master-data binding, publish/versioning and historical-data protection.
 */
const BASE = process.argv[2] || 'http://localhost:4000';

let pass = 0, fail = 0;
const failures = [];
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  \x1b[32mPASS\x1b[0m ${name}`); }
  else { fail++; failures.push(name); console.log(`  \x1b[31mFAIL\x1b[0m ${name} ${extra}`); }
};
const section = (t) => console.log(`\n\x1b[36m── ${t} ──\x1b[0m`);

async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-json */ }
  return { status: res.status, data };
}
const login = (m, p) => api('POST', '/api/auth/login', { body: { mobileNumber: m, password: p } });

const run = async () => {
console.log(`\n  Form Builder test suite -> ${BASE}`);

const a1 = (await login('8144928022', 'admin123')).data.token;
const a2 = (await login('9840123456', 'super123')).data.token;
const a3 = (await login('9845012345', 'agent123')).data.token;

/* ------------------------------------------------ published schema */
section('Published schema');
const pub = await api('GET', '/api/form-schema/published', { token: a3 });
check('agent can read the published schema', pub.status === 200 && Array.isArray(pub.data.fields));
check('a version is live', pub.data.version >= 1, `got v${pub.data.version}`);
check('phone field is bound to its real column',
  pub.data.fields.find((f) => f.key === 'phone_number')?.bind === 'phone_number');
check('caste field binds to the caste master',
  pub.data.fields.find((f) => f.key === 'caste_id')?.source?.master === 'caste');

/* ------------------------------------------------ RBAC */
section('Role-based access control');
check('A2 cannot read the draft (403)', (await api('GET', '/api/form-schema/draft', { token: a2 })).status === 403);
check('A3 cannot read the draft (403)', (await api('GET', '/api/form-schema/draft', { token: a3 })).status === 403);
check('A3 cannot publish (403)', (await api('POST', '/api/form-schema/publish', { token: a3 })).status === 403);
check('A2 cannot publish (403)', (await api('POST', '/api/form-schema/publish', { token: a2 })).status === 403);
check('A2 cannot create a master category (403)',
  (await api('POST', '/api/master-categories', { token: a2, body: { name: 'X' } })).status === 403);
check('A2 CAN read master categories (needed for filters)',
  (await api('GET', '/api/master-categories', { token: a2 })).status === 200);

/* ------------------------------------------------ custom masters */
section('Custom master categories');
const stamp = Date.now();
const mk = await api('POST', '/api/master-categories', { token: a1, body: { name: `ZZ Welfare ${stamp}`, nameTa: 'நலத்திட்டம்' } });
check('A1 creates a custom category', mk.status === 201 && !!mk.data.id, JSON.stringify(mk.data));
const catId = mk.data.id, catKey = mk.data.key;

const it1 = await api('POST', `/api/master-categories/${catId}/items`, { token: a1, body: { name: 'Free Bus Pass', nameTa: 'இலவச பேருந்து' } });
const it2 = await api('POST', `/api/master-categories/${catId}/items`, { token: a1, body: { name: 'Housing Scheme' } });
check('A1 adds bilingual options', it1.status === 201 && it2.status === 201);
check('duplicate option rejected 409',
  (await api('POST', `/api/master-categories/${catId}/items`, { token: a1, body: { name: 'Free Bus Pass' } })).status === 409);

const opts = await api('GET', `/api/master-categories/${catKey}/options`, { token: a3 });
check('agent resolves the options for binding', opts.status === 200 && opts.data.length === 2, JSON.stringify(opts.data));
check('options carry Tamil labels', opts.data.some((o) => o.labelTa === 'இலவச பேருந்து'));

/* ------------------------------------------------ schema validation */
section('Schema validation');
const draft = await api('GET', '/api/form-schema/draft', { token: a1 });
check('A1 reads the draft', draft.status === 200 && Array.isArray(draft.data.draft.fields));

check('invalid field key rejected 400',
  (await api('PUT', '/api/form-schema/draft', { token: a1, body: { fields: [{ key: 'BAD KEY', type: 'text', label: 'x' }] } })).status === 400);
check('unknown field type rejected 400',
  (await api('PUT', '/api/form-schema/draft', { token: a1, body: { fields: [{ key: 'ok_key', type: 'hologram', label: 'x' }] } })).status === 400);
check('duplicate key rejected 400',
  (await api('PUT', '/api/form-schema/draft', { token: a1, body: { fields: [
    { key: 'a_f', type: 'text', label: 'A' }, { key: 'a_f', type: 'text', label: 'B' }] } })).status === 400);
check('bad regex rejected 400',
  (await api('PUT', '/api/form-schema/draft', { token: a1, body: { fields: [
    { key: 'r_f', type: 'text', label: 'R', validation: { regex: '([unclosed' } }] } })).status === 400);

const fwd = await api('PUT', '/api/form-schema/draft', { token: a1, body: { fields: [
  { key: 'child_f', type: 'text', label: 'Child', visibility: { field: 'parent_f', op: 'eq', value: 'y' } },
  { key: 'parent_f', type: 'text', label: 'Parent' }] } });
check('forward-referencing show/hide rule rejected 400', fwd.status === 400, JSON.stringify(fwd.data?.error));

const dbl = await api('PUT', '/api/form-schema/draft', { token: a1, body: { fields: [
  { key: 'p1', type: 'phone', label: 'P1', bind: 'phone_number' },
  { key: 'p2', type: 'phone', label: 'P2', bind: 'phone_number' }] } });
check('two fields on one system column rejected 400', dbl.status === 400, JSON.stringify(dbl.data?.error));

/* ------------------------------------------------ build + publish */
section('Build and publish');
// Strip any leftovers from a previous run so the suite is safely re-runnable
// against the live database (keys must be unique, so blind appending would
// fail the second time around).
const TEST_KEYS = new Set(['has_ration', 'ration_type', 'schemes', 'hh_size']);
const baseFields = draft.data.draft.fields.filter((f) => !TEST_KEYS.has(f.key));
const newFields = [
  ...baseFields,
  { key: 'has_ration', type: 'radio', label: 'Ration card holder?', labelTa: 'குடும்ப அட்டை உள்ளதா?',
    width: 'half', required: true,
    source: { kind: 'static', options: [{ value: 'yes', label: 'Yes', labelTa: 'ஆம்' }, { value: 'no', label: 'No', labelTa: 'இல்லை' }] } },
  { key: 'ration_type', type: 'select', label: 'Ration card type', width: 'half',
    source: { kind: 'static', options: [{ value: 'APL', label: 'APL' }, { value: 'BPL', label: 'BPL' }] },
    visibility: { field: 'has_ration', op: 'eq', value: 'yes' } },
  { key: 'schemes', type: 'multiselect', label: 'Welfare schemes', width: 'full',
    source: { kind: 'master', master: catKey } },
  { key: 'hh_size', type: 'number', label: 'Household size', width: 'third', validation: { min: 1, max: 30 } },
];

const save = await api('PUT', '/api/form-schema/draft', { token: a1, body: { fields: newFields } });
check('A1 saves a valid draft', save.status === 200, JSON.stringify(save.data?.error));
const beforePublish = await api('GET', '/api/form-schema/published', { token: a3 });
const liveKeysBefore = beforePublish.data.fields.map((f) => f.key);
check('saving the draft does NOT change what agents see',
  !liveKeysBefore.includes('has_ration'), JSON.stringify(liveKeysBefore));
check('draft reports itself as dirty', (await api('GET', '/api/form-schema/draft', { token: a1 })).data.dirty === true);

const publish = await api('POST', '/api/form-schema/publish', { token: a1, body: {} });
check('A1 publishes the next version', publish.status === 200 && publish.data.version > beforePublish.data.version,
  JSON.stringify(publish.data?.error));
const pub2 = await api('GET', '/api/form-schema/published', { token: a3 });
check('agents get the new form with no deploy', pub2.data.version === publish.data.version && pub2.data.fields.length === newFields.length);
check('publish auto-wrote a change summary', !!publish.data.changeSummary, publish.data.changeSummary);

/* ------------------------------------------------ submission validation */
section('Submission validated against the published schema');
const dir = await api('GET', '/api/voters/directory?limit=1', { token: a3 });
const epic = dir.data.rows[0].epicId;

const missing = await api('POST', '/api/voters/survey/submit', { token: a3, body: { epicId: epic, answers: {} } });
check('required dynamic field enforced (400)', missing.status === 400 && !!missing.data.fields?.has_ration, JSON.stringify(missing.data));
check('number above max rejected (400)',
  (await api('POST', '/api/voters/survey/submit', { token: a3, body: { epicId: epic, answers: { has_ration: 'no', hh_size: '99' } } }))
    .data?.fields?.hh_size !== undefined);
check('option outside the static list rejected (400)',
  (await api('POST', '/api/voters/survey/submit', { token: a3, body: { epicId: epic, answers: { has_ration: 'maybe' } } }))
    .data?.fields?.has_ration !== undefined);
check('unknown master id rejected (400)',
  (await api('POST', '/api/voters/survey/submit', { token: a3, body: { epicId: epic, answers: { has_ration: 'no', schemes: ['9999999'] } } }))
    .data?.fields?.schemes !== undefined);
check('bad phone pattern rejected (400)',
  (await api('POST', '/api/voters/survey/submit', { token: a3, body: { epicId: epic, answers: { has_ration: 'no', phone_number: '12345' } } }))
    .data?.fields?.phone_number !== undefined);

const good = await api('POST', '/api/voters/survey/submit', { token: a3, body: { epicId: epic, answers: {
  phone_number: '9840112233', has_ration: 'yes', ration_type: 'BPL',
  schemes: [opts.data[0].value, opts.data[1].value], hh_size: '4',
} } });
check('a valid submission is accepted', good.status === 200 && good.data.ok, JSON.stringify(good.data).slice(0, 200));
check('system-bound phone landed in its real column', good.data.voter?.survey?.phoneNumber === '9840112233');
const cf = good.data.voter?.survey?.customFields ?? [];
check('custom answer stored and labelled', cf.find((c) => c.key === 'ration_type')?.value === 'BPL', JSON.stringify(cf));
check('multiselect stored as a list',
  JSON.parse(cf.find((c) => c.key === 'schemes')?.value || '[]').length === 2);

/* ------------------------------------------------ conditional clearing */
section('Conditional logic clears hidden answers');
// `schemes` is resubmitted unchanged here on purpose: the point of this check
// is that flipping has_ration clears ONLY the field its rule hides, and leaves
// every other answer alone (the next section depends on schemes surviving).
const flip = await api('POST', '/api/voters/survey/submit', { token: a3, body: { epicId: epic, answers: {
  phone_number: '9840112233', has_ration: 'no', ration_type: 'APL', hh_size: '4',
  schemes: [opts.data[0].value, opts.data[1].value],
} } });
const flipped = flip.data?.voter?.survey?.customFields ?? [];
check('hiding the parent clears the child answer',
  flip.status === 200 && !flipped.some((c) => c.key === 'ration_type' && c.value),
  JSON.stringify(flipped));
check('other answers are untouched by the clear',
  flipped.some((c) => c.key === 'schemes' && c.value), JSON.stringify(flipped));

/* ------------------------------------------------ history protection */
section('Historical data protection');
check('cannot hard-delete a master option a survey used (409)',
  (await api('DELETE', `/api/master-categories/items/${opts.data[0].value}`, { token: a1 })).status === 409);
check('deactivating it instead succeeds',
  (await api('PATCH', `/api/master-categories/items/${opts.data[0].value}`, { token: a1, body: { isActive: false } })).status === 200);
check('deactivated option disappears from new dropdowns',
  (await api('GET', `/api/master-categories/${catKey}/options`, { token: a3 })).data.length === 1);
const stillThere = await api('GET', `/api/voters/${epic}`, { token: a3 });
check('but the historical answer still reads back',
  (stillThere.data?.survey?.customFields ?? []).some((c) => c.key === 'schemes'), JSON.stringify(stillThere.data?.survey?.customFields));
check('cannot delete a category still bound to a form field (409)',
  (await api('DELETE', `/api/master-categories/${catId}`, { token: a1 })).status === 409);

/* ------------------------------------------------ removing a field keeps answers */
section('Removing a field never destroys its answers');
const trimmed = newFields.filter((f) => f.key !== 'schemes' && f.key !== 'ration_type');
await api('PUT', '/api/form-schema/draft', { token: a1, body: { fields: trimmed } });
const pubTrim = await api('POST', '/api/form-schema/publish', { token: a1, body: { changeSummary: 'Removed two fields' } });
check('publishes the trimmed form', pubTrim.status === 200);
const afterRemove = await api('GET', `/api/voters/${epic}`, { token: a3 });
const orphans = (afterRemove.data?.survey?.customFields ?? []).filter((c) => c.orphaned);
check('answers for removed fields survive, flagged orphaned', orphans.length >= 1, JSON.stringify(afterRemove.data?.survey?.customFields));

/* ------------------------------------------------ versions */
section('Versioning');
const versions = await api('GET', '/api/form-schema/versions', { token: a1 });
check('version history is listed', versions.status === 200 && versions.data.length >= 2,
  JSON.stringify(versions.data?.map?.((v) => v.version)));
check('restore loads an old version into the draft',
  (await api('POST', '/api/form-schema/restore/1', { token: a1 })).status === 200);
check('revert resets the draft to what is live',
  (await api('POST', '/api/form-schema/revert', { token: a1 })).status === 200);
check('after revert the draft is clean', (await api('GET', '/api/form-schema/draft', { token: a1 })).data.dirty === false);

/* ------------------------------------------------ cleanup */
section('Cleanup');
// The category is no longer bound to any live field (it was trimmed out and
// republished above), but real answers still point at its options — so the
// answer-integrity rule must still refuse the delete. Deactivating is the
// supported way to retire it without breaking those records.
const cleanCat = await api('DELETE', `/api/master-categories/${catId}`, { token: a1 });
check('delete still refused while answers reference it (409)', cleanCat.status === 409, JSON.stringify(cleanCat.data?.error));
check('retiring it by deactivation works instead',
  (await api('PATCH', `/api/master-categories/${catId}`, { token: a1, body: { isActive: false } })).status === 200);

// Put the live form back exactly as it was before this run, so repeatedly
// testing against the real database never leaves agents looking at test fields.
await api('PUT', '/api/form-schema/draft', { token: a1, body: {
  fields: baseFields, title: draft.data.draft.title, titleTa: draft.data.draft.titleTa } });
const restored = await api('POST', '/api/form-schema/publish', { token: a1, body: { changeSummary: 'Restored after automated test run' } });
const liveAfter = await api('GET', '/api/form-schema/published', { token: a3 });
check('live form restored to its pre-test shape',
  restored.status === 200 && !liveAfter.data.fields.some((f) => TEST_KEYS.has(f.key)),
  JSON.stringify(liveAfter.data.fields.map((f) => f.key)));

console.log(`\n${'='.repeat(56)}`);
console.log(`  \x1b[32m${pass} passed\x1b[0m   ${fail ? `\x1b[31m${fail} failed\x1b[0m` : '0 failed'}`);
if (failures.length) for (const f of failures) console.log(`   • ${f}`);
console.log(`${'='.repeat(56)}\n`);
process.exit(fail ? 1 : 0);
};

run().catch((e) => { console.error('\nCRASHED:', e); process.exit(1); });
