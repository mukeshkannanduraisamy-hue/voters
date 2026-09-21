# 🗳️ Voter Management & Field Survey System (VMS)

A three-tier RBAC portal for electoral verification, door-to-door field surveys and
live progress analytics, loaded with the real Tamil Nadu electoral roll.

**Constituency:** AC **#58** பென்னாகரம் (Pennagaram), Dharmapuri District
**245,453 roll records · 244,653 live electors · 318 polling booths · 48 local bodies**

> **Note on the AC number.** The system displays **#58**, taken from the roll itself
> (`ac_no = '58'`, and the source PDFs are named `…S22-58-SIR-FinalRoll…`). If the
> intended constituency really is #57, it is a one-row update — the number is
> data-driven, never hardcoded.

---

## Quick start

The app is **direct-MySQL only** (see [Architecture](#architecture)) — there is
no offline/SQLite mode to fall back to, so a real MySQL database is required
even for local development.

**1. Create `server/.env`** (copy from `server/.env.example`) with a MySQL
connection your machine can reach — `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME` — plus a `VMS_JWT_SECRET` of your choosing. The server
refuses to start without every one of these; there is no hardcoded fallback.

```bash
npm run setup
```

Installs both workspaces, imports the workbook into MySQL and seeds master data
plus demo accounts (about a minute — it parses a 21 MB workbook).

```bash
npm run build && npm start
```

Open **http://localhost:4000**.

### Demo credentials

| Role | Mobile | Password | Scope |
|---|---|---|---|
| A1 Super Admin | `9876543210` | `admin123` | Global — all 318 booths |
| A2 Supervisor | `9840123456` | `super123` | 10 booths · 6,943 electors |
| A3 Field Agent | `9845012345` | `agent123` | 2 booths · 339 electors |
| A3 Field Agent | `9840223344` | `agent123` | 2 booths · 1,095 electors |

The login screen lists these and fills them on click.

### Development & tests

```bash
npm run dev:api     # API with --watch on :4000
npm run dev:web     # Vite dev server on :5173, proxying /api
npm test            # 200+ API checks across every module and role — needs a real
                    #   database; NEVER point this at production (see Testing below)
npm run sync:test    # 20 legacy transactional-outbox apply-logic checks (no MySQL needed)
```

### Testing — never against production

`npm test` logs in, creates/edits/deletes users, publishes form schema
versions, and writes survey answers. **Never point `DB_HOST`/`DB_NAME` (or the
`BASE` URL passed to `scripts/test-api.mjs`) at the production database or a
production-connected server.** There is no read-only mode.

To test safely, point `server/.env` (or env vars on the command that starts
the server) at a disposable MySQL instance instead — a local MySQL/MariaDB
install, a throwaway container, or an ephemeral in-process server such as
[`mysql-memory-server`](https://www.npmjs.com/package/mysql-memory-server).
Then, against that database only:

```bash
DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... DB_NAME=... DB_SSL=false \
  node scripts/init-mysql.mjs               # creates the vms_ schema
DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... DB_NAME=... DB_SSL=false \
  node scripts/migrate-form-builder.mjs     # adds the form-builder schema
DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... DB_NAME=... DB_SSL=false \
  node scripts/seed-synthetic-test-data.mjs # fabricated booths/electors + demo accounts —
                                             #   refuses to run unless DB_NAME contains "test"
```

Then start the server against that same database (same env vars, plus `PORT`
to avoid clashing with a real instance) and run `node scripts/test-api.mjs
http://localhost:<that port>`. `seed-synthetic-test-data.mjs` never touches
the real electoral roll — it fabricates its own small set of booths and
electors, which is enough for every RBAC, scoping, and business-logic check
in the suite (booth/voter *counts* in the assertions are read from
`/api/health` rather than hardcoded, so the suite adapts to whatever database
it's pointed at).

---

## Authentication

JWT (`HS256`, 24 h) issued on login and stored in a hardened cookie:

```
Set-Cookie: vms_token=…; Max-Age=86400; Path=/; HttpOnly; SameSite=Lax[; Secure in production]
```

The cookie is `HttpOnly`, so page JavaScript can neither read nor leak the session.
A bearer header is also accepted, which keeps the API scriptable for tooling and
tests. The user row is re-read on every request, so disabling an account or
changing its role takes effect immediately rather than at token expiry.

Passwords are hashed with scrypt (random 16-byte salt, 64-byte key) and compared
in constant time. Login returns an identical message for an unknown mobile and a
wrong password, so the endpoint cannot be used to enumerate accounts.

---

## Roles & permission matrix

Jurisdiction is anchored on the **polling booth (part)** — how the Election
Commission actually partitions an electorate. A supervisor owns a set of booths,
an agent owns theirs. Local body is an attribute of the booth, not a level of the
permission tree, so a booth is never reachable by two different paths.

| | A1 Super Admin | A2 Supervisor | A3 Field Agent |
|---|---|---|---|
| Scope | Global (318 booths) | Assigned booths | Assigned booths |
| Home route | `/admin/dashboard` | `/supervisor/dashboard` | `/survey/booth` |
| Create A2 | ✅ | ❌ | ❌ |
| Create A3 | ✅ | ✅ (own scope only) | ❌ |
| Master data | ✅ manage | read-only dropdowns | read-only dropdowns |
| Voters directory | all | in scope | in scope |
| Field survey | ❌ | ❌ | ✅ |
| Excel export | ✅ | ❌ | ❌ |
| Activity log | ✅ | ❌ | ❌ |

A scoped user with no assignment resolves to `1=0` — they see nothing rather than
everything, which is the safe direction to fail.

---

## Pages

| Route | Roles | What it does |
|---|---|---|
| `/login` | public | Mobile + password, sets the session cookie |
| `/admin/dashboard` | A1 | Global counters, 14-day trend, panchayat breakdown, agent roster |
| `/supervisor/dashboard` | A2 | The same, restricted to assigned booths |
| `/admin/voters` · `/supervisor/voters` | A1 · A2 | Sortable, filterable roll with the citizen dossier modal |
| `/survey/booth` | A3 | Mobile field survey — locked roll data, 2-tier occupation, party grid |
| `/admin/users` | A1, A2 | Account roster with edit, enable/disable, delete |
| `/admin/users/create` | A1, A2 | Registration with EPIC verification and booth assignment |
| `/admin/masters` | A1 | Caste / Job / Party masters |
| `/admin/audit` | A1 | Every login, account change, master edit and survey write |
| `/analytics` | A1, A2 | Sex & age from the roll; caste, occupation and party from surveys |
| `/profile` | all | Account details, jurisdiction, password change |

### Global shell

Every admin and supervisor page shares a shell with:

- **Device viewport simulator** — `Desktop · Tablet · Mobile Ready` pills in the
  header render the live page inside a 768 px or 384 px bezelled device frame, so
  a campaign manager can preview the field-agent experience from a desktop.
- **Quick options menu** — avatar dropdown with booth/elector/status counts, the
  Tamil role title, shortcuts to every module, and Sign Out. Closes on outside
  click or `Escape`.
- **Responsive drawer** — below 860 px the sidebar becomes a sliding overlay.
- **Light / dark theme**, remembered per browser.

---

## Master data

### Caste master
Each entry carries a **reservation category** (`OC`, `BC`, `BCM`, `MBC`, `SC`,
`ST`, `OTHER`) alongside English and Tamil names. 18 entries are seeded.

### Job master — two-tier
One table, two tiers: `category` is the sector, `name` the sub-job. **6 sectors,
38 sub-jobs** covering the occupations actually found around Dharmapuri
(sericulture, silk weaving, stone quarrying, agriculture, government service,
trade). The UI offers a grouped sector tree and a flat searchable table.

In the survey form, choosing a sector auto-selects its first sub-job, so the pair
is never left half-set.

### Party master — Base64 emblems
Each party has a code, a flag colour and a **`symbol_img` holding a self-contained
Base64 data URL**. Admins upload a picture (PNG/JPG/SVG/WebP, ≤ 2 MB) which the
browser reads via `FileReader` and stores inline — **no CDN, no file server, no
broken-image states**. 11 parties ship with inline SVG emblems.

The server accepts `data:` URLs only. An external URL would be an SSRF and
tracking vector, so it is rejected.

---

## Architecture

> **This section describes the system as it runs today.** The project started on
> SQLite with a separate `sync-server` mirroring writes to MySQL (see
> [Legacy: the SQLite + sync-server design](#legacy-the-sqlite--sync-server-design)
> below); commit `6490f7d` ("migrate database directly to MySQL on Hostinger")
> switched `server/` to talk to MySQL directly instead. The docs had drifted from
> that change until this pass — the tree and schema below match the current code.

```
VMS/
├── server/                      Express 4 REST API (ESM) — talks to MySQL directly
│   ├── src/
│   │   ├── index.js             wiring, static SPA hosting, error handling
│   │   ├── lib/db.js            mysql2 pool + a better-sqlite3-shaped query
│   │   │                        wrapper (prepare().get/all/run), SQLite→MySQL
│   │   │                        SQL translation, table name prefixing (vms_*)
│   │   ├── lib/auth.js          scrypt, JWT cookie, authenticate/requireRole
│   │   ├── lib/scope.js         booth-level jurisdiction — the heart of the RBAC
│   │   ├── lib/backup.js        mysqldump-based backup snapshots
│   │   ├── lib/formSchema.js    dynamic form builder: schema validation + submission validation
│   │   ├── lib/outbox.js,       legacy transactional-outbox code from the SQLite
│   │   │   syncWorker.js        design; not imported by index.js — dead code, kept
│   │   │                        only for the sync-server unit tests. See the legacy
│   │   │                        section below before relying on either of these.
│   │   └── routes/              auth, users, masters, master-categories, form-schema,
│   │                            voters, dashboard, booths, reports, backups, sync
│   └── scripts/
│       ├── init-mysql.mjs           creates the vms_* MySQL schema (idempotent)
│       ├── migrate-form-builder.mjs adds the form-builder + custom-masters schema
│       ├── import-data.mjs          workbook → MySQL
│       ├── seed-data.mjs            reference data (castes, sectors, party emblems)
│       ├── seed.mjs                 masters + demo accounts
│       ├── test-api.mjs             the 200+-check API suite
│       ├── test-master-categories.mjs  targeted usage-check regression tests
│       └── seed-synthetic-test-data.mjs  fabricated booths/electors for safe testing
├── sync-server/                 Legacy central ingestion API — see the legacy
│                                 section below. Not wired up to `server/` today;
│                                 `server/` no longer emits any sync events for it
│                                 to receive.
├── shared/sync-tables.mjs       legacy: table whitelist for the SQLite outbox triggers
├── web/                         React 18 + TypeScript + Vite
│   └── src/
│       ├── App.tsx              routes and RBAC guards
│       ├── lib/                 cookie API client, auth context, shared types
│       ├── components/          Shell, BoothPicker, design system, spec widgets
│       ├── pages/               the screens above
│       └── styles/              tokens, component layer, spec additions
└── data/                        legacy SQLite artifacts from before the MySQL migration
```

### Database: direct MySQL (Hostinger)

`server/src/lib/db.js` opens a `mysql2` connection pool straight to the central
MySQL database and exposes a `better-sqlite3`-shaped API (`db.prepare(sql).get()
/.all()/.run()`) so the route code above it still reads like synchronous SQLite —
`translateSql()` rewrites the SQLite-flavoured SQL the routes write (`COLLATE
NOCASE`, `ON CONFLICT ... DO NOTHING`, `strftime`, etc.) into MySQL syntax, and
every application table name is transparently prefixed with `vms_` (so `voters_master`
in a route's SQL string resolves to the real table `vms_voters_master`).

Configure the connection via `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` /
`DB_NAME` in `server/.env` — see [Configuration](#configuration). **There is no
SQLite fallback for the application data anymore**; `data/vms.db` is a leftover
from before the migration and is not read by the running server.

### Schema

```
vms_polling_parts (part_no PK, ac_no, local_body_name_ta, local_body_type, …)
      ▲                                      ▲
      │ part_no                              │ part_no
vms_voters_master (epic_id PK, voter_sno, name_ta, relative_name_ta, door_no, age, gender)
      ▲ epic_id
vms_voter_surveys (epic_id PK, phone_number, caste_id, job_id, party_id, education_id,
                    corrected_name_ta, other_job_text, surveyed_by, surveyed_at)
                     │           │          │           │
             vms_caste_master  vms_job_master  vms_party_master  vms_education_master
             (+ category)      (category       (+ party_code,
                                = sector)       color_code,
                                                symbol_img Base64)

vms_users (id PK, mobile_number UNIQUE, password_hash, role, epic_id, is_active)
      ▲ user_id
vms_user_jurisdictions (user_id, part_no)   ← booth-level scope

-- Dynamic form builder (added by migrate-form-builder.mjs):
vms_form_schemas (versioned field definitions: draft/published/archived)
vms_survey_answers (epic_id, field_key, value)   ← custom-field answers, keyed by
                                                     stable field key, no FK to the
                                                     field definition (renaming or
                                                     retiring a field never deletes
                                                     a citizen's recorded answer)
vms_master_categories / vms_master_items   ← admin-defined lookup lists beyond the
                                              four built-in masters above
```

`vms_voter_surveys` is keyed on `epic_id`, so re-surveying an elector is an
**UPSERT** (`INSERT ... ON DUPLICATE KEY UPDATE`) rather than a duplicate row.

---

## Legacy: the SQLite + sync-server design

Everything in this section describes how the system worked **before** the direct
MySQL migration and is **not active in the code that runs today**:

- `server/src/lib/outbox.js` and `server/src/lib/syncWorker.js` implement a
  SQLite transactional outbox (AFTER triggers + a background batch-sync loop to
  `sync-server`). Neither is imported by `server/src/index.js` anymore — they
  only exist so `sync-server`'s own unit tests keep working, and because they
  document a pattern worth keeping if a future multi-writer deployment needs it.
- `sync-server/` is a separate deployable Express service that used to be the
  only thing holding MySQL credentials, applying batched outbox events from
  `server/` to MySQL in an idempotent, crash-safe way (idempotency ledger
  `sync_events`, one MySQL transaction per event, duplicate/rollback handling —
  see `sync-server/src/lib/processEvent.js`). With `server/` now writing to
  MySQL directly, nothing calls `sync-server`'s `/api/sync/ingest` endpoint.
- `shared/sync-tables.mjs` is the table whitelist the outbox triggers and
  `sync-server`'s mirror-table DDL were both built from.
- `GET /api/sync/status` now just reports the static "direct MySQL, always
  connected" status (see `server/src/routes/sync.js`) — the pending/synced
  counters it used to report no longer mean anything, because nothing writes to
  `sync_outbox` anymore.

If you don't need a second, independently-writable SQLite instance syncing into
the same MySQL database, you can ignore `sync-server/`, `shared/sync-tables.mjs`,
`outbox.js` and `syncWorker.js` entirely — they cost nothing at runtime (they're
never imported) but are kept for `npm run sync:test` and as a reference design.
Verify the legacy apply logic still holds with:

```bash
npm run sync:test
```

---

## API

| Method | Route | Roles | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | public | Sets `vms_token`, returns user + `redirectTo` |
| GET | `/api/auth/me` | all | Current identity, re-read from the DB |
| POST | `/api/auth/logout` | all | Clears the cookie |
| POST | `/api/auth/change-password` | all | Self-service password change |
| GET | `/api/voters/directory` | all | Paged, sortable, filtered roll within scope |
| GET | `/api/voters/:epic` | all | One elector with their survey |
| GET | `/api/voters/verify-epic` | A1, A2 | Validates an EPIC against the roll |
| POST | `/api/voters/survey/submit` | A3 | Save or update a field survey (UPSERT) |
| GET | `/api/users/list` | A1, A2 | Paged, scope-filtered account list |
| GET | `/api/users/jurisdictions` | A1, A2 | Assignable booths, grouped by local body |
| POST | `/api/users/create` | A1, A2 | Create A2/A3 with booth assignment |
| PATCH | `/api/users/:id` | A1, A2 | Profile, status, password, role, booths |
| POST | `/api/users/:id/toggle` | A1, A2 | Enable / disable |
| DELETE | `/api/users/:id` | A1 | Remove an account |
| GET | `/api/masters/dropdowns` | all | Castes, job sectors + sub-jobs, parties |
| GET/POST/PATCH/DELETE | `/api/masters/{caste\|job\|party}` | A1 | Master CRUD |
| GET | `/api/dashboard/stats` | all | Counters, local-body breakdown, 14-day trend |
| GET | `/api/dashboard/agents` | A1, A2 | Per-agent productivity |
| GET | `/api/dashboard/breakdown` | all | Caste / sector / job / party / sex / age |
| GET | `/api/dashboard/audit` | A1 | Activity log |
| GET | `/api/booths` | all | Booths and local bodies within scope |
| GET | `/api/sync/status` | A1 | Outbox health: pending/synced counts, target URL |
| GET | `/api/reports/export` | A1 | Filtered result set as `.xlsx` |

Errors return `{ error, fields? }`, where `fields` maps a form field to its
message so the UI can highlight the offending input.

Dashboard statistics are memoised for 60 s per scope; the cache key includes the
caller's booth list, so one user's figures can never be served to another.

---

## Excel report

`GET /api/reports/export` streams `vms-survey-report.xlsx` with Tamil headers on
the sheet `கணக்கெடுப்பு அறிக்கை`:

| # | Column | # | Column |
|---|---|---|---|
| 1 | வாக்காளர் அடையாள அட்டை | 11 | கைபேசி எண் |
| 2 | வாக்காளர் பெயர் | 12 | சாதி / சமூகம் |
| 3 | திருத்தப்பட்ட பெயர் | 13 | இட ஒதுக்கீடு |
| 4 | உறவினர் பெயர் | 14 | தொழில் பிரிவு |
| 5 | உறவு முறை | 15 | தொழில் |
| 6 | பாகம் எண் | 16 | கூடுதல் தொழில் குறிப்பு |
| 7 | உள்ளாட்சி அமைப்பு | 17 | அரசியல் சார்பு |
| 8 | கதவு எண் | 18 | கட்சி குறியீடு |
| 9 | வயது | 19 | கணக்கெடுப்பாளர் |
| 10 | பாலினம் | 20 | கணக்கெடுப்பு நாள் |

The export respects the caller's scope and current filters, and is capped at
60,000 rows so a mis-clicked full export cannot exhaust memory.

---

## Data notes

The roll export needed cleaning on the way in:

- **Local body type** is derived from the section markers the roll itself carries:
  `(பே)` → Town Panchayat (29 booths), `(வ.கி)` → Village Panchayat (289 booths).
- **Spelling drift** — the same place appears as `தர்மபுரி` and `தர்ம்புரி`, and one
  panchayat has three spellings. The importer canonicalises each name to its most
  frequent form, which is why 49 raw strings resolve to 48 clean local bodies.
- **Deleted electors** — 800 rows are flagged `is_deleted`. They are imported for
  completeness but excluded from every count, search and survey, which is why
  245,453 roll records yield 244,653 live electors.
- The roll's summary sheet declares 245,252 voters while the detail sheet holds
  245,453 rows. Both figures print at the end of an import so the discrepancy is
  visible rather than silently reconciled.

Tamil text is stored and displayed as-is throughout, with Noto Sans Tamil applied
to the columns that carry it.

---

## Configuration

`server/.env` (loaded via `--env-file-if-exists`; copy from `server/.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | API port |
| `DB_HOST` | **required** | MySQL host. The process refuses to start without it — see the security note below. |
| `DB_PORT` | `3306` | MySQL port (not a secret; a real default is safe here) |
| `DB_USER` | **required** | MySQL user |
| `DB_PASSWORD` | **required** | MySQL password |
| `DB_NAME` | **required** | MySQL database name |
| `DB_SSL` | on | Set to `false` to disable `rejectUnauthorized: false` TLS |
| `VMS_JWT_SECRET` | **required** | JWT signing secret. The process refuses to start without it. |
| `VMS_JWT_TTL_SECONDS` | `86400` | Session lifetime |
| `NODE_ENV` | — | `production` enables the `Secure` cookie flag |
| `CRON_SECRET` | — | Shared key for the external `GET /api/internal/backup-cron` trigger |
| `BOOTSTRAP_ADMIN_MOBILE` | `9999999999` | Only consulted the very first time the database has zero A1 accounts — see the admin bootstrap note below |
| `SYNC_API_URL` / `SYNC_API_KEY` / `SYNC_BATCH_SIZE` / `SYNC_INTERVAL_MS` / `SYNC_TIMEOUT_MS` | — | **Legacy, currently inert** — see [Legacy: the SQLite + sync-server design](#legacy-the-sqlite--sync-server-design). Nothing in `index.js` starts the worker that would read these. |

> **Security note (resolved).** `server/src/lib/db.js` and `server/src/lib/auth.js`
> used to hard-code production-shaped fallback values for `DB_HOST`/`DB_USER`/
> `DB_PASSWORD`/`DB_NAME` and `VMS_JWT_SECRET` — committed to this repository's
> history. Both now throw a clear startup error via `requireEnv()`
> (`server/src/lib/env.js`) if any of these are missing, instead of silently
> falling back to a hardcoded value. **The password that fallback used to expose
> must still be treated as compromised** — anyone with repository access (past
> or present) could read it from git history — and should be rotated on the
> hosting panel regardless of this code fix; changing the code cannot undo an
> already-committed secret's exposure.
>
> **Admin bootstrap.** `migrate()` used to unconditionally ensure one specific
> hardcoded mobile number existed with the hardcoded password `admin123` on
> *every* server startup — a standing, predictable backdoor. It now only ever
> creates an account when the database has zero `A1_SUPER_ADMIN` rows at all
> (a fresh deployment), using a randomly generated password that is printed
> once to the server log and never stored in plaintext. Log in with it
> immediately and set a real password from the profile page. This never fires
> again once any A1 account exists, so it can't reset or recreate an existing
> admin's credentials.

`sync-server/.env` — only relevant if you still run the legacy service (copy from `sync-server/.env.example`):

| Variable | Purpose |
|---|---|
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Its own MySQL connection (unlike `server/`'s `db.js`, `sync-server/`'s has no hard-coded fallback — it reads only from env) |
| `SYNC_API_KEY` | Must match `server/.env`'s `SYNC_API_KEY` exactly |
| `PORT` | Sync-server's own port (default `4500`) |
