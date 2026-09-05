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

```bash
npm run setup
```

Installs both workspaces, imports the workbook into SQLite and seeds master data
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
npm test            # 168 API checks across every module and role
```

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
| Excel export | ✅ | ✅ (scoped) | ❌ |
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

```
VMS/
├── server/                      Express 4 REST API (ESM, Node ≥ 22.5)
│   ├── src/
│   │   ├── index.js             wiring, static SPA hosting, error handling
│   │   ├── lib/db.js            node:sqlite connection, schema, indexes
│   │   ├── lib/auth.js          scrypt, JWT cookie, authenticate/requireRole
│   │   ├── lib/scope.js         booth-level jurisdiction — the heart of the RBAC
│   │   └── routes/              auth, users, masters, voters, dashboard, booths, reports
│   └── scripts/
│       ├── import-data.mjs      workbook → SQLite
│       ├── seed-data.mjs        reference data (castes, sectors, party emblems)
│       ├── seed.mjs             masters + demo accounts
│       └── test-api.mjs         the 168-check suite
├── web/                         React 18 + TypeScript + Vite
│   └── src/
│       ├── App.tsx              routes and RBAC guards
│       ├── lib/                 cookie API client, auth context, shared types
│       ├── components/          Shell, BoothPicker, design system, spec widgets
│       ├── pages/               the eleven screens above
│       └── styles/              tokens, component layer, spec additions
└── data/vms.db                  generated SQLite database
```

### Why SQLite rather than PostgreSQL

The schema mirrors a PostgreSQL design with the type mapping `UUID → TEXT`,
`SERIAL → INTEGER PRIMARY KEY AUTOINCREMENT`, `BOOLEAN → INTEGER`,
`TIMESTAMPTZ → TEXT` (ISO-8601 UTC). It uses Node's built-in `node:sqlite`, so the
whole system runs with **no database server to install and no native modules to
compile**. Porting means swapping the driver in `lib/db.js`; the route SQL is
standard.

### Schema

```
polling_parts (part_no PK, ac_no, local_body_name_ta, local_body_type, …)
      ▲                                      ▲
      │ part_no                              │ part_no
voters_master (epic_id PK, voter_sno, name_ta, relative_name_ta, door_no, age, gender)
      ▲ epic_id
voter_surveys (epic_id PK, phone_number, caste_id, job_id, party_id,
               corrected_name_ta, other_job_text, surveyed_by, surveyed_at)
                     │           │          │
             caste_master   job_master   party_master
             (+ category)   (category    (+ party_code,
                             = sector)    color_code,
                                          symbol_img Base64)

users (id PK, mobile_number UNIQUE, password_hash, role, epic_id, is_active)
      ▲ user_id
user_jurisdictions (user_id, part_no)   ← booth-level scope
```

`voter_surveys` is keyed on `epic_id`, so re-surveying an elector is an **UPSERT**
rather than a duplicate row.

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
| GET | `/api/reports/export` | A1, A2 | Filtered result set as `.xlsx` |

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

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | API port |
| `VMS_DB_PATH` | `data/vms.db` | Database location |
| `VMS_JWT_SECRET` | dev fallback | **Set this in production** |
| `VMS_JWT_TTL_SECONDS` | `86400` | Session lifetime |
| `NODE_ENV` | — | `production` enables the `Secure` cookie flag |
