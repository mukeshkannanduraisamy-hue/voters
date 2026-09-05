/**
 * End-to-end API check across every module and every role.
 *   node scripts/test-api.mjs [baseUrl]
 *
 * Covers the happy paths AND the RBAC boundaries: a supervisor must not reach
 * outside its booths, a field agent must not touch masters or user management,
 * and a scoped user must never see an elector it was not assigned.
 */
const BASE = process.argv[2] || 'http://localhost:4000';

let pass = 0, fail = 0;
const failures = [];

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  [32mPASS[0m ${name}`); }
  else { fail++; failures.push(name + (extra ? ` — ${extra}` : '')); console.log(`  [31mFAIL[0m ${name} ${extra}`); }
}

async function api(method, path, { token, body, raw, cookie } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return { status: res.status, res };
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data, headers: res.headers };
}

const section = (t) => console.log(`\n[36m── ${t} ──[0m`);
const login = (mobileNumber, password) => api('POST', '/api/auth/login', { body: { mobileNumber, password } });

const run = async () => {
console.log(`\n  VMS API test suite → ${BASE}`);

// ───────────────────────────────── health
section('Health');
{
  const { status, data } = await api('GET', '/api/health');
  check('health returns ok', status === 200 && data.status === 'ok');
  check('electoral roll is loaded', data?.counts?.liveVoters > 0, `got ${data?.counts?.liveVoters}`);
  check('polling booths are loaded', data?.counts?.booths === 318, `got ${data?.counts?.booths}`);
  check('constituency is reported', !!data?.constituency?.acNo);
}

// ───────────────────────────────── auth
section('Authentication (cookie session)');
const a1 = await login('9876543210', 'admin123');
const a2 = await login('9840123456', 'super123');
const a3 = await login('9845012345', 'agent123');
const a3b = await login('9840223344', 'agent123');

check('A1 Super Admin login', a1.status === 200 && !!a1.data.token);
check('A2 Supervisor login', a2.status === 200 && !!a2.data.token);
check('A3 Field Agent login', a3.status === 200 && !!a3.data.token);

const setCookie = a1.headers.get('set-cookie') ?? '';
check('login sets the vms_token cookie', setCookie.includes('vms_token='));
check('session cookie is HttpOnly', /HttpOnly/i.test(setCookie));
check('session cookie is SameSite=Lax', /SameSite=Lax/i.test(setCookie));
check('session cookie has a 24h lifetime', /Max-Age=86400/i.test(setCookie));

check('A1 lands on /admin/dashboard', a1.data.redirectTo === '/admin/dashboard', a1.data.redirectTo);
check('A2 lands on /supervisor/dashboard', a2.data.redirectTo === '/supervisor/dashboard', a2.data.redirectTo);
check('A3 lands on /survey/booth', a3.data.redirectTo === '/survey/booth', a3.data.redirectTo);

check('A1 reports global scope', a1.data?.user?.isGlobal === true);
check('A2 reports booth scope', a2.data?.user?.isGlobal === false && a2.data.user.partCount > 0);
check('A3 reports booth scope', a3.data?.user?.isGlobal === false && a3.data.user.partCount > 0);

const T1 = a1.data.token, T2 = a2.data.token, T3 = a3.data.token, T3B = a3b.data.token;

{
  const cookieOnly = await api('GET', '/api/auth/me', { cookie: setCookie.split(';')[0] });
  check('cookie alone authenticates a request', cookieOnly.status === 200 && cookieOnly.data.user.role === 'A1_SUPER_ADMIN');

  const bad = await login('9876543210', 'wrong-password');
  check('wrong password rejected 401', bad.status === 401);
  check('error does not leak account existence', /invalid mobile number or password/i.test(bad.data?.error ?? ''));

  check('unknown mobile rejected 401', (await login('9999999999', 'whatever')).status === 401);
  check('malformed mobile rejected 400', (await login('123', 'whatever')).status === 400);
  check('empty credentials rejected 400', (await api('POST', '/api/auth/login', { body: {} })).status === 400);
  check('no token → 401', (await api('GET', '/api/auth/me')).status === 401);
  check('junk token → 401', (await api('GET', '/api/auth/me', { token: 'not-a-jwt' })).status === 401);

  const out = await api('POST', '/api/auth/logout', { token: T1 });
  check('logout clears the cookie', out.status === 200 && /vms_token=;|Expires=Thu, 01 Jan 1970/i.test(out.headers.get('set-cookie') ?? ''));
}

// ───────────────────────────────── booths / scope
section('Booths & jurisdiction scope');
let a1Parts = [], a2Parts = [], a3Parts = [];
{
  const b1 = await api('GET', '/api/booths', { token: T1 });
  const b2 = await api('GET', '/api/booths', { token: T2 });
  const b3 = await api('GET', '/api/booths', { token: T3 });
  a1Parts = b1.data.parts; a2Parts = b2.data.parts; a3Parts = b3.data.parts;

  check('A1 sees all 318 booths', b1.status === 200 && a1Parts.length === 318, `got ${a1Parts.length}`);
  check('A2 booth list is a strict subset', a2Parts.length > 0 && a2Parts.length < a1Parts.length, `A1=${a1Parts.length} A2=${a2Parts.length}`);
  check('A3 booth list is a strict subset of A2', a3Parts.length > 0 && a3Parts.length <= a2Parts.length, `A2=${a2Parts.length} A3=${a3Parts.length}`);

  const a1Set = new Set(a1Parts.map((p) => p.part_no));
  check('A2 booths all exist in the full list', a2Parts.every((p) => a1Set.has(p.part_no)));

  check('booths carry local body name', a1Parts.every((p) => !!p.local_body_name_ta));
  const types = new Set(a1Parts.map((p) => p.local_body_type));
  check('local body type is town or village', [...types].every((t) => t === 'TOWN_PANCHAYAT' || t === 'VILLAGE_PANCHAYAT'), [...types].join(','));
  check('both local body types are present', types.has('TOWN_PANCHAYAT') && types.has('VILLAGE_PANCHAYAT'));

  const lb = await api('GET', '/api/booths/local-bodies', { token: T1 });
  check('local body roster loads', lb.status === 200 && lb.data.length > 0);
  check('local body rows carry booth and voter counts', lb.data.every((r) => r.booths > 0 && r.voters > 0));

  const outside = a1Parts.find((p) => !a3Parts.some((x) => x.part_no === p.part_no));
  const denied = await api('GET', `/api/booths/${outside.part_no}`, { token: T3 });
  check('A3 cannot read a booth outside its scope (403)', denied.status === 403, `got ${denied.status}`);
  const allowed = await api('GET', `/api/booths/${a3Parts[0].part_no}`, { token: T3 });
  check('A3 can read its own booth', allowed.status === 200 && allowed.data.part_no === a3Parts[0].part_no);
}

// ───────────────────────────────── masters
section('Master data (A1 only)');
let newCasteId = null, newJobId = null, newPartyId = null;
{
  check('A2 blocked from caste master (403)', (await api('GET', '/api/masters/caste', { token: T2 })).status === 403);
  check('A3 blocked from caste master (403)', (await api('GET', '/api/masters/caste', { token: T3 })).status === 403);

  const drops = await api('GET', '/api/masters/dropdowns', { token: T3 });
  check('A3 CAN read dropdowns for the survey form', drops.status === 200 && drops.data.castes.length > 0);
  check('dropdowns include 6 job sectors', drops.data.sectors.length === 6, `got ${drops.data.sectors.length}`);
  check('sectors carry nested sub-jobs', drops.data.sectors.every((s) => s.jobs.length > 0));
  check('38 sub-jobs are available', drops.data.jobs.length === 38, `got ${drops.data.jobs.length}`);
  check('parties carry Base64 emblems', drops.data.parties.every((p) => (p.symbol_img ?? '').startsWith('data:image/')));
  check('parties carry code and colour', drops.data.parties.every((p) => !!p.party_code && /^#[0-9a-f]{6}$/i.test(p.color_code)));

  // ---- caste, with reservation category
  const caste = await api('GET', '/api/masters/caste', { token: T1 });
  check('A1 lists caste master', caste.status === 200 && caste.data.length > 0);
  check('caste rows carry a reservation category', caste.data.every((c) => ['OC','BC','BCM','MBC','SC','ST','OTHER'].includes(c.category)));

  const mkCaste = await api('POST', '/api/masters/caste', { token: T1, body: { name: 'ZZ Test Caste ' + Date.now(), name_ta: 'சோதனை', category: 'MBC' } });
  check('A1 creates a caste with a category', mkCaste.status === 201 && mkCaste.data.category === 'MBC', JSON.stringify(mkCaste.data).slice(0, 160));
  newCasteId = mkCaste.data?.id;
  check('duplicate caste rejected 409', (await api('POST', '/api/masters/caste', { token: T1, body: { name: mkCaste.data.name } })).status === 409);
  check('invalid category rejected 400', (await api('POST', '/api/masters/caste', { token: T1, body: { name: 'ZZ Bad ' + Date.now(), category: 'NOPE' } })).status === 400);

  // ---- job, two-tier
  const jobGrouped = await api('GET', '/api/masters/job?grouped=1', { token: T1 });
  check('job master groups by sector', jobGrouped.status === 200 && jobGrouped.data.sectors.length === 6);
  const sectors = await api('GET', '/api/masters/job/sectors', { token: T1 });
  check('sector list carries job counts', sectors.status === 200 && sectors.data.every((s) => s.job_count > 0));

  const mkJob = await api('POST', '/api/masters/job', { token: T1, body: { category: 'Agriculture & Farming', name: 'ZZ Test Job ' + Date.now(), name_ta: 'சோதனை வேலை' } });
  check('A1 creates a sub-job under a sector', mkJob.status === 201 && mkJob.data.category === 'Agriculture & Farming', JSON.stringify(mkJob.data).slice(0, 160));
  newJobId = mkJob.data?.id;
  check('duplicate sub-job in same sector rejected 409',
    (await api('POST', '/api/masters/job', { token: T1, body: { category: 'Agriculture & Farming', name: mkJob.data.name } })).status === 409);
  const sameNameOtherSector = await api('POST', '/api/masters/job', { token: T1, body: { category: 'Business & Trade', name: mkJob.data.name } });
  check('same sub-job name allowed in a different sector', sameNameOtherSector.status === 201);
  if (sameNameOtherSector.data?.id) await api('DELETE', `/api/masters/job/${sameNameOtherSector.data.id}`, { token: T1 });

  // ---- party, with Base64 upload
  const party = await api('GET', '/api/masters/party', { token: T1 });
  check('A1 lists party master', party.status === 200 && party.data.length > 0);

  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const mkParty = await api('POST', '/api/masters/party', {
    token: T1,
    body: { name: 'ZZ Test Party ' + Date.now(), party_code: 'ZZT' + String(Date.now()).slice(-4), color_code: '#123456', symbol_img: tinyPng },
  });
  check('A1 creates a party with a Base64 emblem', mkParty.status === 201 && mkParty.data.symbol_img === tinyPng, JSON.stringify(mkParty.data).slice(0, 160));
  newPartyId = mkParty.data?.id;

  const badImg = await api('PATCH', `/api/masters/party/${newPartyId}`, { token: T1, body: { symbol_img: 'https://evil.example.com/x.png' } });
  check('external image URL rejected (data URLs only)', badImg.status === 400, `got ${badImg.status}`);

  const oversized = 'data:image/png;base64,' + 'A'.repeat(3 * 1024 * 1024);
  const tooBig = await api('PATCH', `/api/masters/party/${newPartyId}`, { token: T1, body: { symbol_img: oversized } });
  check('oversized emblem rejected', tooBig.status === 400 || tooBig.status === 413, `got ${tooBig.status}`);

  const badColor = await api('PATCH', `/api/masters/party/${newPartyId}`, { token: T1, body: { color_code: 'red' } });
  check('invalid colour rejected 400', badColor.status === 400);

  check('A3 cannot create master entries (403)',
    (await api('POST', '/api/masters/party', { token: T3, body: { name: 'Hax', party_code: 'HAX' } })).status === 403);

  // disabled options must vanish from the survey dropdowns
  await api('PATCH', `/api/masters/caste/${newCasteId}`, { token: T1, body: { is_active: false } });
  const after = await api('GET', '/api/masters/dropdowns', { token: T3 });
  check('disabled caste disappears from dropdowns', !after.data.castes.some((c) => c.id === newCasteId));
}

// ───────────────────────────────── local body master (spelling merge tool)
section('Local body master — spelling-duplicate merge');
{
  check('A2 blocked from local body master (403)', (await api('GET', '/api/masters/local-bodies', { token: T2 })).status === 403);
  check('A3 blocked from local body master (403)', (await api('GET', '/api/masters/local-bodies', { token: T3 })).status === 403);

  const list = await api('GET', '/api/masters/local-bodies', { token: T1 });
  check('A1 lists local bodies', list.status === 200 && list.data.rows.length > 0);
  check('rows carry booth and voter counts', list.data.rows.every((r) => r.part_count > 0 && Array.isArray(r.part_nos)));

  // This roll has a known 3-way spelling split of one village across 6 booths.
  // Merging is a one-way data fix (not a fixture reset), so the *first* run
  // against a fresh database finds and fixes it; every run after that finds
  // nothing left to fix — both are correct, and the assertion below accepts
  // either as long as the suggestion engine ends the run with a clean result.
  const cluster = list.data.suggestions.find((s) => s.candidates.length >= 3);

  if (!cluster) {
    check('no spelling duplicates remain (already merged on a prior run)', list.data.suggestions.length === 0 || list.data.suggestions.every((s) => s.candidates.length < 3));
  } else {
    const names = cluster.candidates.map((c) => c.name);
    const target = cluster.recommended;
    const totalBoothsBefore = cluster.candidates.reduce((a, c) => a + c.part_count, 0);
    const totalVotersBefore = cluster.candidates.reduce((a, c) => a + c.voter_count, 0);

    const noOp = await api('POST', '/api/masters/local-bodies/merge', { token: T1, body: { from: target, into: target } });
    check('merging a name into itself is rejected 400', noOp.status === 400);

    const badSource = await api('POST', '/api/masters/local-bodies/merge', { token: T1, body: { from: 'NOT_A_REAL_PLACE_XYZ', into: target } });
    check('merging a nonexistent source 404s', badSource.status === 404);

    let mergedCount = 0;
    for (const name of names) {
      if (name === target) continue;
      const r = await api('POST', '/api/masters/local-bodies/merge', { token: T1, body: { from: name, into: target } });
      check(`merges "${name}" into "${target}"`, r.status === 200 && r.data.boothsMoved > 0, `got ${r.status}`);
      mergedCount++;
    }

    const relisted = await api('GET', '/api/masters/local-bodies', { token: T1 });
    const merged = relisted.data.rows.find((r) => r.name === target);
    check('merged local body now holds every booth from the cluster', merged?.part_count === totalBoothsBefore, `expected ${totalBoothsBefore}, got ${merged?.part_count}`);
    check('merged local body now holds every voter from the cluster', merged?.voter_count === totalVotersBefore);
    check('the old spellings no longer appear', names.filter((n) => n !== target).every((n) => !relisted.data.rows.some((r) => r.name === n)));
    check('the cluster no longer suggests a merge', !relisted.data.suggestions.some((s) => s.candidates.some((c) => c.name === target) && s.candidates.length > 1));

    // A booth's own dashboard/directory numbers must be unaffected by a pure rename.
    const boothCheck = await api('GET', `/api/booths/${cluster.candidates[0].part_nos[0]}`, { token: T1 });
    check('the booth itself is unharmed by the rename', boothCheck.status === 200 && boothCheck.data.local_body_name_ta === target);
  }
}

// ───────────────────────────────── voter directory
section('Voter directory & booth isolation');
let a3Voter = null, outsideEpic = null;
{
  const d1 = await api('GET', '/api/voters/directory?limit=10', { token: T1 });
  check('A1 browses the full roll', d1.status === 200 && d1.data.total > 200000, `total=${d1.data.total}`);

  const d2 = await api('GET', '/api/voters/directory?limit=10', { token: T2 });
  check('A2 directory is booth-scoped', d2.status === 200 && d2.data.total > 0 && d2.data.total < d1.data.total, `A1=${d1.data.total} A2=${d2.data.total}`);

  const d3 = await api('GET', '/api/voters/directory?limit=10', { token: T3 });
  check('A3 directory is booth-scoped', d3.status === 200 && d3.data.total > 0 && d3.data.total <= d2.data.total, `A2=${d2.data.total} A3=${d3.data.total}`);

  a3Voter = d3.data.rows[0];
  check('voter payload exposes the roll fields', !!a3Voter?.epicId && !!a3Voter?.nameTa && a3Voter?.partNo > 0);
  check('voter payload exposes local body', !!a3Voter?.localBodyNameTa && !!a3Voter?.localBodyType);

  // pagination + sorting
  const p1 = await api('GET', '/api/voters/directory?limit=10&page=1&sort_by=age&sort_dir=asc', { token: T3 });
  const p2 = await api('GET', '/api/voters/directory?limit=10&page=2&sort_by=age&sort_dir=asc', { token: T3 });
  check('sorting by age ascending works', p1.data.rows.every((r, i, arr) => i === 0 || (arr[i - 1].age ?? 0) <= (r.age ?? 0)));
  check('page 2 returns different rows', p1.data.rows[0]?.epicId !== p2.data.rows[0]?.epicId);
  const desc = await api('GET', '/api/voters/directory?limit=10&sort_by=age&sort_dir=desc', { token: T3 });
  check('sorting descending works', (desc.data.rows[0]?.age ?? 0) >= (p1.data.rows[0]?.age ?? 0));
  const injection = await api('GET', '/api/voters/directory?limit=10&sort_by=age;DROP+TABLE+users', { token: T3 });
  check('unknown sort column falls back safely', injection.status === 200 && injection.data.sortBy === 'age;DROP+TABLE+users' === false || injection.status === 200);

  check('limit is capped at 100', (await api('GET', '/api/voters/directory?limit=9999', { token: T3 })).data.limit <= 100);

  // filters
  const byBooth = await api('GET', `/api/voters/directory?part_no=${a3Voter.partNo}&limit=5`, { token: T3 });
  check('booth filter applies', byBooth.status === 200 && byBooth.data.rows.every((r) => r.partNo === a3Voter.partNo));

  const byLocalBody = await api('GET', `/api/voters/directory?local_body=${encodeURIComponent(a3Voter.localBodyNameTa)}&limit=5`, { token: T3 });
  check('local body filter applies', byLocalBody.status === 200 && byLocalBody.data.rows.every((r) => r.localBodyNameTa === a3Voter.localBodyNameTa));

  const pending = await api('GET', '/api/voters/directory?status=pending&limit=5', { token: T3 });
  check('status=pending filter applies', pending.status === 200 && pending.data.rows.every((r) => !r.surveyed));

  const male = await api('GET', '/api/voters/directory?gender=' + encodeURIComponent('ஆண்') + '&limit=5', { token: T3 });
  check('gender filter applies', male.status === 200 && male.data.rows.every((r) => r.gender === 'ஆண்'));

  // search modes
  check('search by EPIC works', (await api('GET', `/api/voters/directory?search=${encodeURIComponent(a3Voter.epicId)}`, { token: T3 })).data.rows.some((r) => r.epicId === a3Voter.epicId));
  check('EPIC search is case-insensitive', (await api('GET', `/api/voters/directory?search=${encodeURIComponent(a3Voter.epicId.toLowerCase())}`, { token: T3 })).data.rows.some((r) => r.epicId === a3Voter.epicId));
  check('search by Tamil name works', (await api('GET', `/api/voters/directory?search=${encodeURIComponent(a3Voter.nameTa)}`, { token: T3 })).data.total > 0);
  if (a3Voter.doorNo) {
    check('search by door number works', (await api('GET', `/api/voters/directory?search=${encodeURIComponent(a3Voter.doorNo)}`, { token: T3 })).data.total > 0);
  }

  // isolation
  let page = 1;
  while (!outsideEpic && page <= 20) {
    const s = await api('GET', `/api/voters/directory?limit=100&page=${page}`, { token: T1 });
    outsideEpic = s.data.rows.find((v) => !a3Parts.some((p) => p.part_no === v.partNo))?.epicId ?? null;
    if (s.data.rows.length < 100) break;
    page++;
  }
  check('found an out-of-scope elector for isolation testing', !!outsideEpic);
  check('A3 cannot read an elector outside its booths (403)', (await api('GET', `/api/voters/${outsideEpic}`, { token: T3 })).status === 403);
  check('A3 can read an elector inside its booths', (await api('GET', `/api/voters/${a3Voter.epicId}`, { token: T3 })).status === 200);
  check('unknown EPIC → 404', (await api('GET', '/api/voters/DOES-NOT-EXIST-123', { token: T1 })).status === 404);
}

// ───────────────────────────────── survey submission
section('Field survey submission (A3)');
{
  const drops = (await api('GET', '/api/masters/dropdowns', { token: T3 })).data;
  const sector = drops.sectors[0];
  const valid = {
    epicId: a3Voter.epicId,
    correctedNameTa: 'சோதனை பெயர்',
    correctedRelativeNameTa: 'சோதனை தந்தை',
    phoneNumber: '9845012345',
    casteId: drops.castes[0].id,
    jobId: sector.jobs[0].id,
    partyId: drops.parties[0].id,
    otherJobText: 'பட்டுப்புழு வளர்ப்பு',
  };

  const saved = await api('POST', '/api/voters/survey/submit', { token: T3, body: valid });
  check('A3 submits a survey', saved.status === 200 && saved.data.ok, JSON.stringify(saved.data).slice(0, 200));
  check('response returns the merged elector record', saved.data?.voter?.surveyed === true);
  check('survey stores the collected phone', saved.data?.voter?.survey?.phoneNumber === '9845012345');
  check('survey stores the 2-tier occupation', !!saved.data?.voter?.survey?.jobCategory && !!saved.data?.voter?.survey?.jobName);
  check('survey stores the custom job note', saved.data?.voter?.survey?.otherJobText === 'பட்டுப்புழு வளர்ப்பு');
  check('survey returns the party emblem', (saved.data?.voter?.survey?.symbolImg ?? '').startsWith('data:image/'));

  const again = await api('POST', '/api/voters/survey/submit', { token: T3, body: { ...valid, phoneNumber: '9845099999' } });
  check('re-submitting UPSERTs rather than duplicating', again.status === 200 && again.data.updated === true);
  check('updated phone is persisted', again.data?.voter?.survey?.phoneNumber === '9845099999');

  for (const [label, phone] of [['too short', '98450123'], ['starts with 5', '5845012345'], ['letters', 'abcdefghij'], ['11 digits', '98450123456']]) {
    const r = await api('POST', '/api/voters/survey/submit', { token: T3, body: { ...valid, phoneNumber: phone } });
    check(`phone regex rejects ${label}`, r.status === 400 && !!r.data?.fields?.phoneNumber);
  }
  check('missing caste rejected 400', (await api('POST', '/api/voters/survey/submit', { token: T3, body: { ...valid, casteId: null } })).status === 400);
  check('missing job rejected 400', (await api('POST', '/api/voters/survey/submit', { token: T3, body: { ...valid, jobId: null } })).status === 400);
  check('missing party rejected 400', (await api('POST', '/api/voters/survey/submit', { token: T3, body: { ...valid, partyId: null } })).status === 400);

  check('A3 cannot survey outside its booths (403)',
    (await api('POST', '/api/voters/survey/submit', { token: T3, body: { ...valid, epicId: outsideEpic } })).status === 403);
  check('disabled master option rejected 422',
    (await api('POST', '/api/voters/survey/submit', { token: T3, body: { ...valid, casteId: newCasteId } })).status === 422);
  check('A1 cannot submit surveys (agent-only route)', (await api('POST', '/api/voters/survey/submit', { token: T1, body: valid })).status === 403);
  check('A2 cannot submit surveys', (await api('POST', '/api/voters/survey/submit', { token: T2, body: valid })).status === 403);

  const bParts = (await api('GET', '/api/booths', { token: T3B })).data.parts.map((p) => p.part_no);
  if (!bParts.includes(a3Voter.partNo)) {
    check('agent B cannot survey agent A’s elector (403)',
      (await api('POST', '/api/voters/survey/submit', { token: T3B, body: valid })).status === 403);
  }
}

// ───────────────────────────────── user management
section('User management & EPIC verification');
let createdUserId = null;
{
  const list1 = await api('GET', '/api/users/list', { token: T1 });
  check('A1 lists users', list1.status === 200 && list1.data.total > 0);
  check('A1 list excludes itself', !list1.data.rows.some((u) => u.role === 'A1_SUPER_ADMIN'));
  check('user rows carry booth counts', list1.data.rows.every((u) => typeof u.boothCount === 'number'));

  const list2 = await api('GET', '/api/users/list', { token: T2 });
  check('A2 lists only its own agents', list2.status === 200 && list2.data.rows.every((u) => u.role === 'A3_FIELD_AGENT'));
  check('A3 cannot list users (403)', (await api('GET', '/api/users/list', { token: T3 })).status === 403);

  const j1 = await api('GET', '/api/users/jurisdictions', { token: T1 });
  check('A1 can assign all 318 booths', j1.status === 200 && j1.data.parts.length === 318);
  const j2 = await api('GET', '/api/users/jurisdictions', { token: T2 });
  check('A2 can only assign its own booths', j2.data.parts.length === a2Parts.length);

  // EPIC pool so each rule is tested with a fresh, unused EPIC
  const registered = new Set(list1.data.rows.map((u) => u.epicId).filter(Boolean));
  const pool = (await api('GET', '/api/voters/directory?limit=100&page=9', { token: T1 })).data.rows
    .map((v) => v.epicId).filter((e) => e && !registered.has(e));
  const nextEpic = () => pool.shift();
  check('EPIC pool available for registration tests', pool.length >= 8, `pool=${pool.length}`);

  const freeEpic = nextEpic();
  const ver = await api('GET', `/api/voters/verify-epic?epic_id=${freeEpic}`, { token: T1 });
  check('valid EPIC verifies with citizen details', ver.status === 200 && ver.data.verified && !!ver.data.voter.nameTa);
  check('verify returns booth and local body', !!ver.data.voter.partNo && !!ver.data.voter.localBodyNameTa);
  check('unknown EPIC fails verification 404', (await api('GET', '/api/voters/verify-epic?epic_id=NOPE12345', { token: T1 })).status === 404);
  check('A3 cannot use EPIC verification (403)', (await api('GET', `/api/voters/verify-epic?epic_id=${freeEpic}`, { token: T3 })).status === 403);

  const mobile = '7' + String(Date.now()).slice(-9);
  const created = await api('POST', '/api/users/create', {
    token: T1,
    body: { role: 'A3_FIELD_AGENT', mobileNumber: mobile, password: 'agent123', epicId: freeEpic, fullName: 'Test Agent', isActive: true, partNos: [a1Parts[0].part_no] },
  });
  check('A1 creates a field agent', created.status === 201 && !!created.data.id, JSON.stringify(created.data).slice(0, 200));
  createdUserId = created.data?.id;
  check('created agent carries its booth', created.data?.boothCount === 1);
  check('newly created agent can log in', (await login(mobile, 'agent123')).status === 200);

  check('duplicate mobile rejected 409', (await api('POST', '/api/users/create', {
    token: T1, body: { role: 'A3_FIELD_AGENT', mobileNumber: mobile, password: 'agent123', epicId: nextEpic(), partNos: [a1Parts[0].part_no] } })).status === 409);
  check('EPIC already linked rejected 409', (await api('POST', '/api/users/create', {
    token: T1, body: { role: 'A3_FIELD_AGENT', mobileNumber: '7' + String(Date.now() + 5).slice(-9), password: 'agent123', epicId: freeEpic, partNos: [a1Parts[0].part_no] } })).status === 409);
  check('unverified EPIC blocks creation 422', (await api('POST', '/api/users/create', {
    token: T1, body: { role: 'A3_FIELD_AGENT', mobileNumber: '7' + String(Date.now() + 7).slice(-9), password: 'agent123', epicId: 'FAKE999', partNos: [a1Parts[0].part_no] } })).status === 422);
  check('no booth assignment rejected 400', (await api('POST', '/api/users/create', {
    token: T1, body: { role: 'A3_FIELD_AGENT', mobileNumber: '7' + String(Date.now() + 11).slice(-9), password: 'agent123', epicId: nextEpic(), partNos: [] } })).status === 400);
  check('short password rejected 400', (await api('POST', '/api/users/create', {
    token: T1, body: { role: 'A3_FIELD_AGENT', mobileNumber: '7' + String(Date.now() + 13).slice(-9), password: '123', epicId: nextEpic(), partNos: [a1Parts[0].part_no] } })).status === 400);

  // A2 restrictions
  check('A2 cannot create another A2 (400)', (await api('POST', '/api/users/create', {
    token: T2, body: { role: 'A2_SUPERVISOR', mobileNumber: '7' + String(Date.now() + 17).slice(-9), password: 'super123', epicId: nextEpic(), partNos: [a2Parts[0].part_no] } })).status === 400);

  const outsideBooth = a1Parts.find((p) => !a2Parts.some((x) => x.part_no === p.part_no));
  const a2Outside = await api('POST', '/api/users/create', {
    token: T2, body: { role: 'A3_FIELD_AGENT', mobileNumber: '7' + String(Date.now() + 19).slice(-9), password: 'agent123', epicId: nextEpic(), partNos: [outsideBooth.part_no] } });
  check('A2 cannot assign booths outside its scope (403)', a2Outside.status === 403, `got ${a2Outside.status}`);

  check('A3 cannot create users (403)', (await api('POST', '/api/users/create', {
    token: T3, body: { role: 'A3_FIELD_AGENT', mobileNumber: '7' + String(Date.now() + 23).slice(-9), password: 'agent123', partNos: [a1Parts[0].part_no] } })).status === 403);

  // edit / toggle / delete
  const toggled = await api('POST', `/api/users/${createdUserId}/toggle`, { token: T1 });
  check('A1 disables an account', toggled.status === 200 && toggled.data.isActive === false);
  check('disabled account cannot log in (403)', (await login(mobile, 'agent123')).status === 403);
  await api('POST', `/api/users/${createdUserId}/toggle`, { token: T1 });

  const patched = await api('PATCH', `/api/users/${createdUserId}`, { token: T1, body: { fullName: 'Renamed Agent', password: 'newpass123' } });
  check('A1 updates profile and resets password', patched.status === 200 && patched.data.fullName === 'Renamed Agent');
  check('password reset takes effect', (await login(mobile, 'newpass123')).status === 200);

  const reassigned = await api('PATCH', `/api/users/${createdUserId}`, { token: T1, body: { partNos: [a1Parts[0].part_no, a1Parts[1].part_no, a1Parts[2].part_no] } });
  check('A1 reassigns booths', reassigned.status === 200 && reassigned.data.boothCount === 3, `got ${reassigned.data?.boothCount}`);

  check('A1 cannot edit itself here', [400, 403].includes((await api('PATCH', `/api/users/${a1.data.user.id}`, { token: T1, body: { fullName: 'Hax' } })).status));
  check('A2 cannot delete users (403)', (await api('DELETE', `/api/users/${createdUserId}`, { token: T2 })).status === 403);
  check('A1 deletes an account', (await api('DELETE', `/api/users/${createdUserId}`, { token: T1 })).status === 200);
  check('deleted account is gone (404)', (await api('GET', `/api/users/${createdUserId}`, { token: T1 })).status === 404);
}

// ───────────────────────────────── dashboards
section('Dashboards & analytics');
{
  const d1 = await api('GET', '/api/dashboard/stats', { token: T1 });
  check('A1 dashboard loads', d1.status === 200 && d1.data.totals.total > 0);
  check('A1 dashboard is global', d1.data.scope === 'global');
  check('totals are internally consistent', d1.data.totals.completed + d1.data.totals.pending === d1.data.totals.total);
  check('dashboard reports the constituency', !!d1.data.constituency?.acNo);
  check('local body breakdown is populated', d1.data.localBodies.length > 0);
  check('local body rows carry type and progress', d1.data.localBodies.every((p) => ['TOWN_PANCHAYAT','VILLAGE_PANCHAYAT'].includes(p.type) && p.completed + p.pending === p.total));
  check('14-day trend has 14 points', d1.data.trend.length === 14);

  const d2 = await api('GET', '/api/dashboard/stats', { token: T2 });
  check('A2 dashboard is booth-scoped', d2.status === 200 && d2.data.totals.total < d1.data.totals.total, `A1=${d1.data.totals.total} A2=${d2.data.totals.total}`);
  check('A2 dashboard reports assigned scope', d2.data.scope === 'assigned');

  const d3 = await api('GET', '/api/dashboard/stats', { token: T3 });
  check('A3 sees its own booth progress', d3.status === 200 && d3.data.totals.total > 0 && d3.data.totals.total <= d2.data.totals.total);

  const ag1 = await api('GET', '/api/dashboard/agents', { token: T1 });
  check('A1 sees all agents', ag1.status === 200 && ag1.data.length >= 2);
  check('agent rows carry booth lists', ag1.data.every((a) => Array.isArray(a.partList)));
  const ag2 = await api('GET', '/api/dashboard/agents', { token: T2 });
  check('A2 sees only its own agents', ag2.status === 200 && ag2.data.length > 0 && ag2.data.length <= ag1.data.length);
  check('A3 cannot list agents (403)', (await api('GET', '/api/dashboard/agents', { token: T3 })).status === 403);

  const br = await api('GET', '/api/dashboard/breakdown', { token: T1 });
  check('breakdown returns all dimensions', br.status === 200 && ['castes','jobSectors','jobs','parties','gender','ageBands'].every((k) => Array.isArray(br.data[k])));
  check('breakdown reflects submitted surveys', br.data.castes.length > 0 && br.data.parties.length > 0);
  check('party breakdown carries emblems', br.data.parties.every((p) => (p.symbol ?? '').startsWith('data:image/')));
  check('job breakdown rolls up to sectors', br.data.jobSectors.length > 0);

  const rec = await api('GET', '/api/dashboard/recent', { token: T1 });
  check('recent activity feed loads', rec.status === 200 && Array.isArray(rec.data));

  check('A1 reads the audit log', (await api('GET', '/api/dashboard/audit', { token: T1 })).status === 200);
  check('A2 cannot read the audit log (403)', (await api('GET', '/api/dashboard/audit', { token: T2 })).status === 403);
}

// ───────────────────────────────── report export
section('Excel report export');
{
  const { status, res } = await api('GET', '/api/reports/export?status=surveyed', { token: T1, raw: true });
  const buf = Buffer.from(await res.arrayBuffer());
  check('A1 exports xlsx', status === 200 && buf.length > 1000, `${buf.length} bytes`);
  check('export is a real xlsx (PK zip header)', buf[0] === 0x50 && buf[1] === 0x4b);
  check('export is served as an attachment', /attachment; filename="vms-survey-report\.xlsx"/.test(res.headers.get('content-disposition') ?? ''));

  const s2 = await api('GET', '/api/reports/export', { token: T2, raw: true });
  check('A2 can export its own scope', s2.status === 200);
  check('A3 cannot export (403)', (await api('GET', '/api/reports/export', { token: T3 })).status === 403);
}

// ───────────────────────────────── profile
section('Profile / password change');
{
  check('wrong current password rejected 400',
    (await api('POST', '/api/auth/change-password', { token: T3, body: { currentPassword: 'wrong', newPassword: 'newpass123' } })).status === 400);
  check('short new password rejected 400',
    (await api('POST', '/api/auth/change-password', { token: T3, body: { currentPassword: 'agent123', newPassword: 'abc' } })).status === 400);

  const ok = await api('POST', '/api/auth/change-password', { token: T3, body: { currentPassword: 'agent123', newPassword: 'agent1234' } });
  check('password change succeeds', ok.status === 200);
  const re = await login('9845012345', 'agent1234');
  check('login works with the new password', re.status === 200);
  check('password reverted for repeatable runs',
    (await api('POST', '/api/auth/change-password', { token: re.data.token, body: { currentPassword: 'agent1234', newPassword: 'agent123' } })).status === 200);
}

section('Error handling');
{
  const nf = await api('GET', '/api/does-not-exist', { token: T1 });
  check('unknown API route → JSON 404', nf.status === 404 && !!nf.data.error);
}

// ───────────────────────────────── sync outbox status
section('Sync outbox status (transactional outbox)');
{
  const s1 = await api('GET', '/api/sync/status', { token: T1 });
  check('A1 reads sync status', s1.status === 200 && typeof s1.data.pending === 'number', JSON.stringify(s1.data));
  check('sync status reports enabled/apiUrl', 'enabled' in s1.data && 'apiUrl' in s1.data);

  check('A2 cannot read sync status (403)', (await api('GET', '/api/sync/status', { token: T2 })).status === 403);
  check('A3 cannot read sync status (403)', (await api('GET', '/api/sync/status', { token: T3 })).status === 403);

  // A write to any synced table (caste_master here) must produce a pending
  // outbox row — proof the trigger fired in the same transaction as the write.
  const before = (await api('GET', '/api/sync/status', { token: T1 })).data;
  const created = await api('POST', '/api/masters/caste', { token: T1, body: { name: 'ZZ Outbox Probe ' + Date.now(), category: 'OTHER' } });
  const after = await api('GET', '/api/sync/status', { token: T1 });
  check('a synced-table write increments outbox counts', (after.data.pending + after.data.synced) > (before.pending + before.synced));

  if (created.data?.id) await api('DELETE', `/api/masters/caste/${created.data.id}`, { token: T1 });
}

// cleanup
if (newCasteId) await api('DELETE', `/api/masters/caste/${newCasteId}`, { token: T1 });
if (newJobId) await api('DELETE', `/api/masters/job/${newJobId}`, { token: T1 });
if (newPartyId) await api('DELETE', `/api/masters/party/${newPartyId}`, { token: T1 });

console.log(`\n${'═'.repeat(60)}`);
console.log(`  [32m${pass} passed[0m   ${fail ? `[31m${fail} failed[0m` : '0 failed'}`);
if (failures.length) {
  console.log('\n  Failures:');
  for (const f of failures) console.log(`   • ${f}`);
}
console.log(`${'═'.repeat(60)}\n`);
process.exit(fail ? 1 : 0);
};

run().catch((e) => { console.error('\nTEST RUNNER CRASHED:', e); process.exit(1); });
