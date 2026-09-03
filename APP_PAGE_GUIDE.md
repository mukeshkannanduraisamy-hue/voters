# 🗳️ Voter Management & Field Survey System (VMS)
# 📖 Complete Page-by-Page Architectural, Operational & User Manual

> **System Version**: Production v1.0.0 (Build `704222c`)  
> **Constituency**: AC #57 Pennagaram, Dharmapuri District, Tamil Nadu (பென்னாகரம் சட்டமன்ற தொகுதி)  
> **Total Registered Electors**: 245,453 voters across 318 Polling Stations and 49 Local Bodies  
> **Live Production URL**: [https://voters-kcnb.onrender.com](https://voters-kcnb.onrender.com)  
> **Local Development URL**: [http://localhost:3000](http://localhost:3000)

---

## 📑 Complete Document Index

1. [System Architecture & RBAC Security Model](#1-system-architecture--rbac-security-model)
2. [Global Application Shell & Viewport Simulator](#2-global-application-shell--viewport-simulator)
3. [Page 1: Authentication Portal (`/login`)](#page-1-authentication-portal-login)
4. [Page 2: Super Admin Constituency Dashboard (`/admin/dashboard`)](#page-2-super-admin-constituency-dashboard-admindashboard)
5. [Page 3: Voter Directory & Citizen Dossier (`/admin/voters`)](#page-3-voter-directory--citizen-dossier-adminvoters)
6. [Page 4: User Accounts & Staff Management (`/admin/users`)](#page-4-user-accounts--staff-management-adminusers)
7. [Page 5: Create User & Jurisdiction Assignment (`/admin/users/create`)](#page-5-create-user--jurisdiction-assignment-adminuserscreate)
8. [Page 6: Master Data Management (`/admin/masters`)](#page-6-master-data-management-adminmasters)
   - [6.1 Caste Master (சாதி மாஸ்டர்)](#61-caste-master-சாதி-மாஸ்டர்)
   - [6.2 Job / Occupation Master (தொழில் மாஸ்டர் — 2-Tier Sector Hierarchy)](#62-job--occupation-master-தொழில்-மாஸ்டர்--2-tier-sector-hierarchy)
   - [6.3 Political Party Master (கட்சி மாஸ்டர் — Base64 Image Upload)](#63-political-party-master-கட்சி-மாஸ்டர்--base64-image-upload)
9. [Page 7: Supervisor Scoped Dashboard (`/supervisor/dashboard`)](#page-7-supervisor-scoped-dashboard-supervisordashboard)
10. [Page 8: Supervisor Scoped Voter Directory (`/supervisor/voters`)](#page-8-supervisor-scoped-voter-directory-supervisorvoters)
11. [Page 9: Field Agent Mobile Survey Portal (`/survey/booth`)](#page-9-field-agent-mobile-survey-portal-surveybooth)
12. [Page 10: Excel Report Export Engine (`/api/reports/export`)](#page-10-excel-report-export-engine-apireportsexport)
13. [Database Schema & Table Reference Guide](#13-database-schema--table-reference-guide)

---

## 1. System Architecture & RBAC Security Model

The system enforces a 3-tier Role-Based Access Control (RBAC) hierarchy. Authentication relies on **JSON Web Tokens (JWT)** signed with `HS256`, stored in a hardened cookie named `vms_token` (`HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production).

```
                      ┌─────────────────────────────────┐
                      │      JWT Authentication         │
                      │  (Cookie: vms_token / 24h Exp)  │
                      └────────────────┬────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│  A1_SUPER_ADMIN  │          │  A2_SUPERVISOR   │          │  A3_FIELD_AGENT  │
│  Global Scope    │          │  Assigned Booths │          │  Single Booth    │
│  (All 318 Parts) │          │  (e.g. 1-10)     │          │  (e.g. Part #1)  │
└────────┬─────────┘          └────────┬─────────┘          └────────┬─────────┘
         │                             │                             │
         ├► /admin/dashboard           ├► /supervisor/dashboard      └► /survey/booth
         ├► /admin/voters              ├► /supervisor/voters            (Mobile Only)
         ├► /admin/users               └► Scoped Reports (.xlsx)
         ├► /admin/users/create
         ├► /admin/masters
         └► Global Reports (.xlsx)
```

### Route-Level Protection Guard (`middleware.ts` & API Guards)
- If an unauthenticated user visits any protected route (`/admin/*`, `/supervisor/*`, `/survey/*`), they are immediately redirected to `/login`.
- If an `A2_SUPERVISOR` attempts to access `/admin/dashboard` or `/admin/masters`, they receive a `403 Forbidden` response and are redirected to `/supervisor/dashboard`.
- If an `A3_FIELD_AGENT` attempts to access `/admin/*` or `/supervisor/*`, they are redirected to `/survey/booth`.
- Super Admins have unrestricted access to all administration modules.

---

## 2. Global Application Shell & Viewport Simulator

Shared by all Admin and Supervisor pages (`/admin/*` and `/supervisor/*`) via `DashboardShell` (`components/layout/dashboard-shell.tsx`) and `AppHeader` (`components/layout/app-header.tsx`).

### Visual Wireframe:
```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [☰]  🗳️ VMS • Pennagaram AC #57  │  [💻 Desktop]  •  [📱 Tablet]  •  [📲 Mobile Ready]  │  [👤 +91 9876543210 ▾] │
├───────────────────┬─────────────────────────────────────────────────────────────────────────────────────┤
│ 📊 Dashboard      │                                                                                     │
│ 🗳️ Voters (245k)   │                                                                                     │
│ ➕ Create User     │                                     MAIN CONTENT                                    │
│ 👥 User List      │                                (Responsive Viewport)                                │
│ 🗄️ Master Data    │                                                                                     │
│                   │                                                                                     │
│ [A1 Super Admin]  │                                                                                     │
│ [🚪 Sign Out]     │                                                                                     │
└───────────────────┴─────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Details:

#### 1. Left Sidebar Navigation (`AdminSidebar`)
- **Branding Section**:
  - Logo icon: `Vote` in a blue-to-indigo rounded badge.
  - Title: **"VMS Admin"** (English) and **"வாக்காளர் போர்டல்"** (Tamil).
  - Subtitle: **"Pennagaram AC #57 - Dharmapuri"**.
- **Navigation Links**:
  1. **Dashboard** (`/admin/dashboard` or `/supervisor/dashboard`): Metric cards & panchayat rosters.
  2. **Voters Directory** (`/admin/voters` or `/supervisor/voters`): Complete 245k electoral roll with search and citizen dossier modal.
  3. **Create User** (`/admin/users/create`): Staff registration form.
  4. **User List** (`/admin/users`): Staff accounts roster with edit credentials & jurisdiction assignment.
  5. **Master Data** (`/admin/masters`): Caste, 2-Tier Occupation, and Party symbol master (*Visible only to `A1_SUPER_ADMIN`*).
- **Responsive Drawer Behavior**:
  - **Desktop (≥1024px)**: Fixed 64-width left dock.
  - **Tablet & Phone (<1024px)**: Transforms into a sliding overlay drawer with backdrop blur. Automatically collapses upon route navigation or backdrop tap.
- **Footer Profile & Logout**:
  - Displays user avatar, phone number (+91), role badge, and red **"Sign Out"** button.

#### 2. Sticky Top Header (`AppHeader`)
- **Mobile Menu Trigger (`[☰]` Hamburger Button)**: Slides open the navigation drawer on mobile/tablet.
- **Constituency Information**:
  - Tamil badge: **"பென்னாகரம் சட்டமன்ற தொகுதி"** (Pennagaram Legislative Assembly Constituency).
  - English badge: **"Pennagaram AC #57 - Dharmapuri"**.
- **🖥️ Responsive Device Viewport Switcher**:
  - Three interactive pill buttons allowing campaign managers to preview the entire application in any device factor directly from their computer:
    - **`[ 💻 Desktop ]`**: Restores full 100% responsive desktop layout.
    - **`[ 📱 Tablet ]`**: Constrains the active page into a centered 768px tablet container with shadow borders.
    - **`[ 📲 Mobile Ready ]`**: Constrains the active page into a centered 384px smartphone preview frame with hardware bezel.
    - *The selected mode receives an active color badge (`blue` for Desktop/Tablet, `emerald` for Mobile Ready).*
- **Top-Right Quick Options Menu**:
  - Circular avatar with user initials and role color badge.
  - Clicking toggles a dropdown card:
    - User phone number, role title in Tamil, and verification status.
    - Direct shortcut buttons to **Admin Dashboard**, **245k Directory**, **User Accounts**, and **Master Data**.
    - **Sign Out Button**: Calls `/api/auth/logout`, clears JWT cookie, and redirects to `/login`.
    - Automatically closes on outside click or pressing the **`Escape`** key.

---

## Page 1: Authentication Portal (`/login`)

* **URL Route**: `/login`
* **Access Level**: Public (Unauthenticated)
* **Underlying API**: `POST /api/auth/login`, `GET /api/auth/me`
* **Target Audience**: All system users (Admins, Supervisors, Field Surveyors)

```
┌────────────────────────────────────────────────────────┐
│                   🗳️ Voter Survey Portal                │
│             பென்னாகரம் தொகுதி - தர்மபுரி                 │
├────────────────────────────────────────────────────────┤
│ Mobile Number:                                         │
│ [+91] [ 9876543210                                  ]  │
│                                                        │
│ Password:                                              │
│ [ ••••••••••••                                   👁️ ]  │
│                                                        │
│ [          🚀 Sign In to Portal (உள்நுழைக)          ]  │
├────────────────────────────────────────────────────────┤
│ Quick Test Credentials:                                │
│ • A1 Super Admin: 9876543210 / admin123                │
│ • A2 Supervisor:  9840123456 / super123                │
│ • A3 Field Agent: 9845012345 / agent123                │
└────────────────────────────────────────────────────────┘
```

### Complete Feature & Option Breakdown:
1. **Header Branding**:
   - Bilingual title: "Voter Survey Portal • வாக்காளர் கணக்கெடுப்பு போர்டல்".
   - Subtitle: "Pennagaram AC #57, Dharmapuri District".
2. **Mobile Number Input Field**:
   - **Label**: `Mobile Number (கைபேசி எண்)`.
   - **Input Prefix**: Hardcoded `+91` flag badge.
   - **Validation Rules**: Must be exactly 10 digits; first digit must be `6`, `7`, `8`, or `9` (Regex: `/^[6-9]\d{9}$/`).
   - **Auto-Formatting**: Rejects alphabetical characters and symbols automatically.
3. **Password Input Field**:
   - **Label**: `Password (கடவுச்சொல்)`.
   - **Show / Hide Password Toggle**: Eye icon button (`Eye` / `EyeOff`) that toggles input type between `password` and `text`.
   - **Validation**: Minimum 6 characters.
4. **Sign In Action Button**:
   - Displays animated spinning icon (`RefreshCw`) and text `"Signing in..."` while authenticating.
   - Disables user input during request to prevent duplicate submissions.
5. **Backend Authentication & Hashing**:
   - Looks up user by `mobile_number` in `users` table.
   - Verifies password against `password_hash` using `bcrypt.compare()` (with fallback SHA256 verification for legacy seed accounts).
   - Generates JWT containing `{ sub: user.id, role: user.role, mobileNumber: user.mobile_number }`.
   - Sets secure cookie `vms_token` (`maxAge: 86400` = 24 hours).
6. **Automated Role Routing**:
   - `A1_SUPER_ADMIN` ➡️ Redirected to `/admin/dashboard`.
   - `A2_SUPERVISOR` ➡️ Redirected to `/supervisor/dashboard`.
   - `A3_FIELD_AGENT` ➡️ Redirected to `/survey/booth`.
7. **Error Handling**:
   - Invalid credentials: Red banner `"Invalid mobile number or password (தவறான கைபேசி எண் அல்லது கடவுச்சொல்)"`.
   - Inactive account: Red banner `"Account is disabled. Please contact Super Admin"`.
8. **Test Accounts Reference Card**:
   - Pre-rendered quick-fill card with test accounts for fast demonstration and QA testing.

---

## Page 2: Super Admin Constituency Dashboard (`/admin/dashboard`)

* **URL Route**: `/admin/dashboard`
* **Access Level**: Super Admin (`A1_SUPER_ADMIN`)
* **Underlying APIs**: `GET /api/dashboard/stats?ac_no=57`, `GET /api/reports/export`
* **Performance Benchmark**: High-speed cached endpoint (~300ms latency, 60s in-memory TTL)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Global Constituency Dashboard                                                                          │
│ AC #57 Pennagaram • 318 Polling Stations • 49 Local Bodies             [🔄 Refresh]  [📥 Export Excel]  │
├───────────────────┬───────────────────┬───────────────────┬────────────────────────────────────────────┤
│ TOTAL VOTERS      │ COMPLETED SURVEYS │ PENDING VOTERS    │ TODAY'S VELOCITY                           │
│ 244,653           │ 16 (0.01%)        │ 244,637           │ 1 Surveys                                  │
│ Registered        │ [====        ]    │ Remaining         │ +100% vs Yesterday                         │
├───────────────────┴───────────────────┴───────────────────┴────────────────────────────────────────────┤
│ PANCHAYAT & TOWN BREAKDOWN                                            [🔍 Search Panchayat...        ] │
├────┬─────────────────────────────┬────────────────────┬────────┬──────────────┬───────────┬────────────┤
│ #  │ Panchayat Name (Tamil)      │ Local Body Type    │ Booths │ Total Voters │ Completed │ Progress % │
├────┼─────────────────────────────┼────────────────────┼────────┼──────────────┼───────────┼────────────┤
│ 1  │ பென்னாகரம் (Pennagaram)     │ Town Panchayat     │ 18     │ 14,210       │ 6         │ 0.04% [==] │
│ 2  │ பிக்கிலி (Pikkili)          │ Village Panchayat  │ 6      │ 4,890        │ 2         │ 0.04% [==] │
│ 3  │ ஒகேனக்கல் (Hogenakkal)      │ Village Panchayat  │ 4      │ 3,120        │ 1         │ 0.03% [==] │
└────┴─────────────────────────────┴────────────────────┴────────┴──────────────┴───────────┴────────────┘
```

### Complete Feature & Option Breakdown:
1. **Constituency Scope Bar**:
   - **AC Selector Dropdown**: Pennagaram AC #57 (extensible to other constituencies).
   - **🔄 Refresh Button**: Manually busts or refreshes statistics cache with a spinning loader.
   - **📥 Download Full Report Button**: Direct link triggering download of `vms-survey-report.xlsx` containing all 245k records.
2. **4 KPI Summary Cards**:
   - **Card 1: Total Registered Voters**: Total voter population (`244,653`) from `voters_master WHERE is_deleted = 0`.
   - **Card 2: Completed Surveys**: Total surveyed electors with dynamic progress bar clamped between 0% and 100%.
   - **Card 3: Pending Electors**: Calculated as `Total Voters - Completed Surveys`.
   - **Card 4: Today's Velocity**: Submissions timestamped today (`DATE(surveyed_at) = DATE('now')`) and delta percentage compared to yesterday's count (`((today - yesterday) / yesterday) * 100`).
3. **Panchayat & Town Progress Roster**:
   - **Search Input**: Live filter across 49 local bodies by Tamil or English name.
   - **Interactive Table Columns**:
     - **#**: Serial index number.
     - **Panchayat Name**: Rendered in Tamil (`Noto Sans Tamil`). **Clicking any panchayat name automatically navigates to `/admin/voters` pre-filtered for that specific panchayat!**
     - **Local Body Type Badge**: Distinguishes `Town Panchayat (பேரூராட்சி)` in blue vs `Village Panchayat (கிராம ஊராட்சி)` in emerald.
     - **Booths Count**: Number of polling stations located in that panchayat.
     - **Total Electors**: Total registered voters in that panchayat.
     - **Completed**: Number of completed surveys.
     - **Pending**: Un-surveyed electors remaining.
     - **Progress Bar**: Color-coded progress bar:
       - 🔴 Red: `< 30%` completed.
       - 🟡 Amber / Yellow: `30% - 69%` completed.
       - 🟢 Green: `≥ 70%` completed.

---

## Page 3: Voter Directory & Citizen Dossier (`/admin/voters`)

* **URL Route**: `/admin/voters` (or `/supervisor/voters`)
* **Access Level**: Super Admin (`A1`) & Supervisor (`A2` - scoped)
* **Underlying API**: `GET /api/voters/directory` (with query parameters `page`, `limit`, `search`, `local_body`, `part_no`, `gender`, `status`, `sort_by`, `sort_dir`)
* **Database Indexes Used**: `idx_vm_name`, `idx_vm_part_no`, `idx_vm_epic`, `idx_vm_gender`, `idx_vs_epic`

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Electoral Roll Directory (வாக்காளர் பட்டியல்) • 244,653 Electors                                       │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [🔍 Search by Name (Tamil), Door No, or EPIC ID...                       ]  [All Local Bodies ▾]       │
│ [All Polling Booths ▾]  [Gender: All ▾]  [Status: All | ✓ Surveyed | ⏳ Pending]  [Rows: 25 ▾]  [🔄 Reset]│
├──────┬────────────┬──────────────────┬─────────────────┬───────────┬─────────┬────────┬────────┬───────┤
│ S.No │ EPIC ID    │ Voter Name (Ta)  │ Relative Name   │ Age/Sex   │ Door No │ Part # │ Status │ Action│
├──────┼────────────┼──────────────────┼─────────────────┼───────────┼─────────┼────────┼────────┼───────┤
│ 1    │ IEB0787739 │ முருகன்          │ கந்தசாமி (தந்தை)│ 42 / ஆண்  │ 2/14    │ Part 1 │ ⏳ Pend│ [👁️] │
│ 2    │ IEB1234567 │ கவிதா            │ முருகன் (கணவர்) │ 38 / பெண் │ 2/14    │ Part 1 │ ✓ DMK  │ [👁️] │
└──────┴────────────┴──────────────────┴─────────────────┴───────────┴─────────┴────────┴────────┴───────┘
```

### Complete Feature & Option Breakdown:
1. **Search & Filter Controls**:
   - **Search Bar**: 300ms debounced input. Queries Tamil name, Address door number, or Voter EPIC ID simultaneously.
   - **Local Body Dropdown (49 Panchayats)**: Lists all 49 Panchayats with part counts. Selecting a panchayat automatically filters the Booth dropdown and resets pagination to Page 1.
   - **Polling Booth Dropdown (318 Parts)**: Lists all polling stations; auto-filtered when a Panchayat is selected.
   - **Gender Filter**: All Genders, Male (`ஆண்`), Female (`பெண்`), Third Gender (`மூன்றாம் பாலினம்`).
   - **Survey Status Filter Pills**:
     - `All Voters`: Total dataset.
     - `✓ Surveyed Only`: Displays only voters with collected survey records.
     - `⏳ Pending Only`: Displays only electors who haven't been surveyed.
   - **Rows Per Page Selector**: 10, 25, 50, or 100 rows per page.
   - **Reset Filters Button**: Clears all filters and returns to default roster.
2. **Interactive Voter Roster Table**:
   - **S.No**: Electoral serial number within booth.
   - **EPIC ID**: Official Voter ID Card code in monospace font.
   - **Voter Name (Tamil)**: Full name in Tamil with hover `title` tooltip. If the field surveyor submitted a spelling correction, a blue `[திருத்தப்பட்டது]` tag is displayed alongside.
   - **Relative Name & Type**: Father/Husband/Mother name with relationship badge (`தந்தை`, `கணவர்`, `தாய்`).
   - **Age / Gender**: Blue pill for Male, Pink pill for Female, Purple pill for Third Gender.
   - **Door No**: House / Door number.
   - **Booth & Local Body**: Part number and panchayat name.
   - **Survey Status Column**:
     - Un-surveyed: Grey badge `⏳ Pending`.
     - Surveyed: Green badge `✓ Surveyed` with **Official Political Party Emblem Image**, Party Title, and Phone Number.
   - **Action Button**: Eye icon button (`[👁️]`) to inspect the Citizen Dossier.
3. **Citizen Dossier Modal (வாக்காளர் விபரம்)**:
   - Clicking any voter row opens a full-screen centered modal with blurred backdrop overlay.
   - **Dismissal Controls**: Closes via "X" button, clicking outside the modal content, or pressing the `Escape` key.
   - **Tab / Section 1: Official Electoral Roll Records (Read-Only)**:
     - EPIC ID, Serial No, Voter Tamil Name, Relative Name, Age, Gender, Door No, Part No, Panchayat, Section Title, Town/Village.
   - **Tab / Section 2: Field Survey Intelligence (கள கணக்கெடுப்பு விபரம்)**:
     - Survey Status badge (`Completed` / `Pending`).
     - **Phone Number**: Voter contact number with direct `tel:` call button.
     - **Political Party Affiliation**: Official party emblem image, party name, and branding color.
     - **Caste & Community**: Community title (e.g. `BC - Vanniyar`, `MBC`, `SC`).
     - **Occupation & Sector**: 2-Tier profession title (e.g. `Agriculture > Silk Weaver`) and custom job notes.
     - **Field Name Corrections**: Corrected Tamil voter name and relative name if submitted.
     - **Survey Timestamp**: Exact date and time survey was recorded.

---

## Page 4: User Accounts & Staff Management (`/admin/users`)

* **URL Route**: `/admin/users`
* **Access Level**: Super Admin (`A1_SUPER_ADMIN`)
* **Underlying APIs**: `GET /api/users/list`, `GET /api/users/[id]`, `PATCH /api/users/[id]`, `DELETE /api/users/[id]`

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Staff & Agent Management (பயனர்கள் பட்டியல்)                           [🔄 Refresh]  [➕ Create User]  │
├─────────────────┬──────────────────┬─────────────┬──────────────────────────┬───────────┬──────────────┤
│ Mobile Number   │ Assigned Role    │ EPIC ID     │ Jurisdiction Scope       │ Status    │ Actions      │
├─────────────────┼──────────────────┼─────────────┼──────────────────────────┼───────────┼──────────────┤
│ +91 9840123456  │ A2_SUPERVISOR    │ IEB0787739  │ 10 Booths assigned (1-10)│ ✓ Active  │ [✏️ Edit]    │
│ +91 9845012345  │ A3_FIELD_AGENT   │ IEB1234567  │ 1 Booth assigned (Part 1)│ ✓ Active  │ [✏️ Edit]    │
│ +91 9840223344  │ A3_FIELD_AGENT   │ —           │ 3 Booths assigned (2,3,4)│ ✕ Disabled│ [✏️ Edit]    │
└─────────────────┴──────────────────┴─────────────┴──────────────────────────┴───────────┴──────────────┘
```

### Complete Feature & Option Breakdown:
1. **User Roster Table**:
   - **Mobile Number**: Login phone number.
   - **Assigned Role Badge**: Purple for `A1_SUPER_ADMIN`, Blue for `A2_SUPERVISOR`, Emerald for `A3_FIELD_AGENT`.
   - **Verified EPIC ID**: Linked elector card ID.
   - **Jurisdiction Scope**: Displays total assigned booths and part numbers (e.g. `10 Booths assigned (1, 2, 3...)`) or `Global (All 318 Booths)`.
   - **Account Status**: Green `✓ Active` or Grey `✕ Disabled`.
   - **Actions Column**: Blue **"Edit"** button (pencil icon) on every user row.
2. **Interactive Edit User Modal**:
   - Clicking **"Edit"** on any user opens the Edit User Modal:
     - **Role Selector**: Radio toggle between `Supervisor (A2)` and `Field Agent (A3)`.
     - **Status Toggle**: One-click switch between `Active (செயலில் உள்ளது)` and `Disabled (முடக்கப்பட்டுள்ளது)`.
     - **Mobile Number Input**: Allows updating user phone number with duplicate detection.
     - **Password Reset Input (Optional)**: Leave blank to preserve current password, or enter 6+ characters to re-hash and update with bcrypt (12 rounds).
     - **Verified EPIC ID Input**: Update or link voter card identifier.
     - **Jurisdiction Assignment Control**:
       - **"⚡ Auto-Select All" Button**: One-click assigns all 49 Panchayats and 318 booths.
       - **"Clear" Button**: Deselects all booths.
       - **Panchayat Chips**: Select one or more panchayats to filter polling stations.
       - **Polling Booth Checkbox Chips**: Interactive part buttons pre-checked with user's current assignments.
     - **Save Changes Button**: Submits `PATCH /api/users/[id]` with real-time feedback and auto-refreshes the roster.

---

## Page 5: Create User & Jurisdiction Assignment (`/admin/users/create`)

* **URL Route**: `/admin/users/create`
* **Access Level**: Super Admin (`A1_SUPER_ADMIN`)
* **Underlying APIs**: `POST /api/users/create`, `GET /api/voters/verify-epic?epic_id=...`, `GET /api/users/jurisdictions`

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Register New Staff User (புதிய பயனர் பதிவு)                                                            │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Select Role:     (o) Supervisor (A2)         ( ) Field Agent (A3)                                   │
│                                                                                                        │
│ 2. Credentials:     Mobile: [+91] [ 9840123456           ]   Password: [ ••••••••••••             ]    │
│                                                                                                        │
│ 3. Voter EPIC:      [ IEB0787739                         ]   [ 🔍 Verify EPIC ]                        │
│                     ┌────────────────────────────────────────────────────────────────────────────┐     │
│                     │ ✓ Verified: முருகன் | 42 / ஆண் | Part 1 - பென்னாகரம் (Pennagaram)           │     │
│                     └────────────────────────────────────────────────────────────────────────────┘     │
│ 4. Assign Booths:   [ ⚡ Auto-Select All ]  [ Clear ]                                                   │
│                     Panchayats: [✓ Pennagaram] [✓ Pikkili] [ Hogenakkal ] ...                          │
│                     Booths:     [✓ Part 1] [✓ Part 2] [✓ Part 3] [ Part 4] [ Part 5] ... (3 selected)   │
│                                                                                                        │
│ [                     ➕ Create User Account & Assign Jurisdictions                                  ] │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Complete Feature & Option Breakdown:
1. **Role Radio Selector**:
   - **Supervisor (A2)**: Zone supervisor managing multiple polling booths and field agents.
   - **Field Agent (A3)**: Ground agent collecting door-to-door surveys within assigned booth(s).
2. **Mobile Number Field**:
   - Enforces 10-digit Indian mobile format (`/^[6-9]\d{9}$/`).
   - Checks database for duplicate registration and displays immediate error if already registered.
3. **Password Field**:
   - Minimum 6 characters. Hashed via bcrypt (12 salt rounds) before database storage.
4. **Optional Voter EPIC Verification**:
   - Enter voter ID number and click **"Verify EPIC"**.
   - Queries `voters_master` and displays green preview card with Voter Name in Tamil, Age, Gender, Booth #, and Panchayat.
5. **Cascading Jurisdiction Assignment**:
   - **"⚡ Auto-Select All" Button**: Immediately selects all 49 Panchayats and all 318 Polling Booths.
   - **"Clear" Button**: Deselects all booths.
   - **Panchayat Filter Chips**: Click to select one or more panchayats to narrow down the polling booth checkboxes.
   - **Polling Booth Checkboxes**: Grid of booth buttons displaying Part Number and Voter Count.
6. **Submit Action**:
   - Inserts record into `users` table and batch-inserts assigned booths into `user_jurisdictions` within a single atomic SQLite transaction.
   - On success, redirects to `/admin/users` with confirmation toast.

---

## Page 6: Master Data Management (`/admin/masters`)

* **URL Route**: `/admin/masters`
* **Access Level**: Super Admin (`A1_SUPER_ADMIN`) exclusively
* **Underlying APIs**: `GET /api/masters/dropdowns`, `POST /api/masters/[type]`, `PATCH /api/masters/[type]` (`type` = `caste`, `job`, `party`)

This page provides three dedicated tabs to manage reference datasets without editing application code:

---

### 6.1 Caste Master (சாதி மாஸ்டர்)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Caste Categories Master (சாதி முதன்மை தரவு)                            [🔍 Search]  [➕ Add New Caste] │
├────┬─────────────────────────────┬──────────────────────┬─────────────┬────────────────────────────────┤
│ #  │ Caste Title (Tamil)         │ Reservation Category │ Status      │ Actions                        │
├────┼─────────────────────────────┼──────────────────────┼─────────────┼────────────────────────────────┤
│ 1  │ வன்னியர் (Vanniyar)         │ MBC                  │ [✓ Active ] │ [✏️ Edit]  [Toggle Status]      │
│ 2  │ கவுண்டர் (Gounder)          │ BC                   │ [✓ Active ] │ [✏️ Edit]  [Toggle Status]      │
│ 3  │ ஆதி திராவிடர் (Adi Dravidar) │ SC                   │ [✓ Active ] │ [✏️ Edit]  [Toggle Status]      │
└────┴─────────────────────────────┴──────────────────────┴─────────────┴────────────────────────────────┘
```

#### Features & Options:
- **Search & Status Filter**: Search by caste title in Tamil or English; filter by Active vs Disabled.
- **"+ Add New Caste" Modal**:
  - Caste Title in Tamil & English (e.g. `BC - Vanniyar / வன்னியர்`).
  - Reservation Category Dropdown: `OC (Open Competition)`, `BC (Backward Class)`, `BCM (BC Muslim)`, `MBC (Most Backward Class)`, `SC (Scheduled Caste)`, `ST (Scheduled Tribe)`.
- **Table Operations**:
  - Active/Disabled toggle switch on each row (optimistically updates UI and updates `caste_master.is_active`).
  - Edit caste title and reservation category.

---

### 6.2 Job / Occupation Master (தொழில் மாஸ்டர் — 2-Tier Sector Hierarchy)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Occupation Master (தொழில் முதன்மை தரவு)             [📁 Grouped View] [📋 Flat View]  [➕ Add Sub-Job]  │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 📁 AGRICULTURE & FARMING (வேளாண்மை) [8 Sub-Jobs]                                                       │
│    • விவசாயி (Farmer) [Active]  • விவசாய கூலி (Agri Labourer) [Active]  • பட்டு வளர்ப்பு (Sericulture) ...│
│ 📁 DAILY WAGE & CONSTRUCTION (தினசரி கூலி) [6 Sub-Jobs]                                               │
│    • கொத்தனார் (Mason) [Active]  • தச்சர் (Carpenter) [Active]  • பெயிண்டர் (Painter) [Active] ...     │
│ 📁 FACTORY & MANUFACTURING (தொழிற்சாலை) [5 Sub-Jobs]                                                   │
│    • நெசவாளர் (Weaver) [Active]  • ஆலைத் தொழிலாளி (Mill Worker) [Active] ...                          │
│ 📁 GOVERNMENT & SERVICES (அரசுப் பணி) [6 Sub-Jobs]                                                    │
│    • அரசு ஆசிரியர் (Govt Teacher) [Active]  • காவலர் (Police) [Active]  • துப்புரவு பணியாளர் ...         │
│ 📁 BUSINESS & TRADE (வணிகம்) [7 Sub-Jobs]                                                             │
│    • மளிகைக் கடை (Grocery) [Active]  • ஆட்டோ ஓட்டுநர் (Auto Driver) [Active] ...                      │
│ 📁 OTHERS / STUDENTS / HOMEMAKERS (மற்றவை) [6 Sub-Jobs]                                               │
│    • இல்லத்தரசி (Homemaker) [Active]  • மாணவர் (Student) [Active]  • ஓய்வுபெற்றவர் (Retired) ...        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Features & Options:
- **View Mode Switcher**:
  - **📁 Grouped by Sector (Tree View)**: Visual accordion view showing each of the 6 Main Sectors with nested sub-job badge chips.
  - **📋 Flat Table View**: Tabular list with search, sector column, and sorting.
- **6 Standard Sectors & 38 Sub-Jobs**:
  - Covers all prevalent occupations in Dharmapuri and Western Tamil Nadu (Sericulture, Silk Weaving, Stone Quarrying, Agriculture, Govt Service, Trade).
- **"+ Add New Sub-Job" Modal**:
  - Main Sector Dropdown (or enter custom sector title).
  - Sub-Job Title in Tamil & English.
- **Operations**:
  - Toggle Active/Disabled status per sub-job.
  - Edit sub-job title and sector assignment.

---

### 6.3 Political Party Master (கட்சி மாஸ்டர் — Base64 Image Upload)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Political Party Master (கட்சி முதன்மை தரவு)                            [🔍 Search]  [➕ Add New Party] │
├────┬────────┬──────────────┬──────────────┬─────────────┬─────────────┬────────────────────────────────┤
│ #  │ Symbol │ Party Code   │ Party Name   │ Flag Color  │ Status      │ Actions                        │
├────┼────────┼──────────────┼──────────────┼─────────────┼─────────────┼────────────────────────────────┤
│ 1  │  [☀️]  │ DMK          │ தி.மு.க      │ #DC2626     │ [✓ Active ] │ [✏️ Edit]  [Toggle Status]      │
│ 2  │  [🍃]  │ AIADMK       │ அ.தி.மு.க    │ #16A34A     │ [✓ Active ] │ [✏️ Edit]  [Toggle Status]      │
│ 3  │  [🪷]  │ BJP          │ பா.ஜ.க       │ #EA580C     │ [✓ Active ] │ [✏️ Edit]  [Toggle Status]      │
│ 4  │  [✋]  │ INC          │ காங்கிரஸ்    │ #2563EB     │ [✓ Active ] │ [✏️ Edit]  [Toggle Status]      │
│ 5  │  [🥭]  │ PMK          │ பா.ம.க       │ #CA8A04     │ [✓ Active ] │ [✏️ Edit]  [Toggle Status]      │
│ 6  │  [📢]  │ NTK          │ நாம் தமிழர்  │ #B91C1C     │ [✓ Active ] │ [✏️ Edit]  [Toggle Status]      │
│ 7  │  [🚩]  │ TVK          │ த.வெ.க       │ #991B1B     │ [✓ Active ] │ [✏️ Edit]  [Toggle Status]      │
│ 8  │  [🏺]  │ VCK          │ வி.சி.க      │ #4338CA     │ [✓ Active ] │ [✏️ Edit]  [Toggle Status]      │
└────┴────────┴──────────────┴──────────────┴─────────────┴─────────────┴────────────────────────────────┘
```

#### Features & Options:
- **Search & Status Filter**: Search by party name or code.
- **"+ Add New Party" & "Edit" Modal**:
  - **Party Name**: Full title in Tamil & English (e.g. `DMK / திராவிட முன்னேற்றக் கழகம்`).
  - **Party Code**: Abbreviation (e.g. `DMK`, `AIADMK`, `BJP`, `TVK`).
  - **Flag / Branding Color**: Native color picker + hex code input.
  - **📸 Party Picture File Upload (Stored as Base64 in Database)**:
    - Dedicated dropzone: Click to browse or drag & drop any image file (`PNG`, `JPG`, `SVG`, `WebP` up to 2MB).
    - Client-side `FileReader` encodes image into a self-contained Base64 Data URL (`data:image/svg+xml;base64,...` or `data:image/png;base64,...`).
    - **Live Preview Card**: Shows rendered picture, file name, size in KB, and `✓ Base64 Image Ready` indicator.
    - Stored directly in `party_master.symbol_img` column in SQLite.
    - Zero external CDN or file server dependency — pictures render instantly!
    - Clear / remove button.
- **Pre-Loaded Official Base64 Parties**:
  - DMK (Rising Sun), AIADMK (Two Leaves), BJP (Lotus), INC (Hand), PMK (Mango), NTK (Mic), TVK (TVK Flag), VCK (Pot), Neutral (Balance Scale), Independent (Star).

---

## Page 7: Supervisor Scoped Dashboard (`/supervisor/dashboard`)

* **URL Route**: `/supervisor/dashboard`
* **Access Level**: Supervisor (`A2_SUPERVISOR`)
* **Underlying API**: `GET /api/dashboard/stats` (automatically scoped to supervisor's assigned booths)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Zone Supervisor Dashboard (மண்டல மேற்பார்வையாளர் டாஷ்போர்டு)                                           │
│ Scoped Jurisdictions: Booths 1-10 (Pennagaram Town & Rural) • 6,943 Electors                           │
├───────────────────┬───────────────────┬───────────────────┬────────────────────────────────────────────┤
│ ASSIGNED VOTERS   │ COMPLETED SURVEYS │ PENDING VOTERS    │ TODAY'S VELOCITY                           │
│ 6,943             │ 16 (0.23%)        │ 6,927             │ 1 Surveys                                  │
├───────────────────┴───────────────────┴───────────────────┴────────────────────────────────────────────┤
│ FIELD AGENT PERFORMANCE ROSTER                                                                         │
├────┬─────────────────────────────┬────────────────────┬──────────────────────┬─────────────────────────┤
│ #  │ Agent Mobile                │ Assigned Booths    │ Completed Surveys    │ Today's Velocity        │
├────┼─────────────────────────────┼────────────────────┼──────────────────────┼─────────────────────────┤
│ 1  │ +91 9845012345              │ Part 1, Part 2     │ 10                   │ 1 today                 │
│ 2  │ +91 9840223344              │ Part 3, Part 4     │ 6                    │ 0 today                 │
└────┴─────────────────────────────┴────────────────────┴──────────────────────┴─────────────────────────┘
```

### Complete Feature & Option Breakdown:
1. **Strict Jurisdiction Isolation**:
   - All statistics and queries filter through `buildPartFilter(userId, 'A2_SUPERVISOR')`.
   - Supervisor only sees data for their assigned polling booths (e.g. Parts 1-10 = 6,943 voters).
2. **Scoped KPI Cards**:
   - Assigned Electors, Completed Surveys, Pending Electors, and Today's Velocity.
3. **Field Agent Performance Table**:
   - Lists all A3 field agents operating within the supervisor's jurisdiction.
   - Shows Agent Phone Number, Assigned Booths, Total Completed Surveys, and Velocity.
4. **Scoped Directory Navigation**: Quick link to `/supervisor/voters` to inspect voters only within assigned parts.

---

## Page 8: Supervisor Scoped Voter Directory (`/supervisor/voters`)

* **URL Route**: `/supervisor/voters`
* **Access Level**: Supervisor (`A2_SUPERVISOR`)
* **Underlying API**: `GET /api/voters/directory` (restricted to supervisor's parts)

Identical to the Super Admin Voter Directory (`/admin/voters`), with the following security safeguards:
- **Part Isolation**: Polling Booth and Local Body dropdowns only display parts assigned to that supervisor.
- **Data Protection**: Searching or filtering voters outside the assigned parts returns zero results.
- **Full Dossier Inspection**: Supervisor can open the Citizen Dossier for any elector within their assigned booths.

---

## Page 9: Field Agent Mobile Survey Portal (`/survey/booth`)

* **URL Route**: `/survey/booth`
* **Access Level**: Field Agent (`A3_FIELD_AGENT`)
* **Design Philosophy**: Mobile-first touch interface tailored for smartphones in polling stations

```
┌────────────────────────────────────────────────────────┐
│ 🗳️ VMS Survey • Booth #1 (பென்னாகரம்)                  │
│ Agent: +91 9845012345  •  Done: 16 / 972 (2%)  [SignOut]│
├────────────────────────────────────────────────────────┤
│ [🔍 Search Voter by Name, Door No, or EPIC ID...     ] │
├────────────────────────────────────────────────────────┤
│ 1. முருகன் (Murugan)                     Door: 2/14    │
│    S.No: 1 • Age: 42 • Male (ஆண்)     [ ⏳ Pending   ] │
├────────────────────────────────────────────────────────┤
│ 2. கவிதா (Kavitha)                       Door: 2/14    │
│    S.No: 2 • Age: 38 • Female (பெண்)   [ ✓ Surveyed  ] │
└────────────────────────────────────────────────────────┘
```

### Mobile Survey Workflow:

#### 1. Sticky Mobile Header:
- Displays assigned booth number (`Part #1 - Pennagaram`).
- Live progress counter (`16 / 972 (2%)`) with progress bar.
- Logout button.

#### 2. Fast Debounced Search:
- Search input debounced at 300ms.
- Search by Tamil Name, Address Door Number, or EPIC Card ID.
- Restricted strictly to the agent's assigned polling booth.

#### 3. Interactive Voter Survey Form:
Tapping any voter card opens the touch-friendly survey modal:

```
┌────────────────────────────────────────────────────────┐
│ 📝 Voter Survey • முருகன் (Murugan)                    │
├────────────────────────────────────────────────────────┤
│ SECTION A: ELECTORAL ROLL DATA (LOCKED)                │
│ EPIC: IEB0787739  •  Part 1  •  Door: 2/14  •  Age: 42 │
├────────────────────────────────────────────────────────┤
│ SECTION B: FIELD CORRECTIONS (OPTIONAL)                │
│ Corrected Name (Tamil):     [ முருகன்                 ]│
│ Corrected Relative (Tamil): [ கந்தசாமி                ]│
├────────────────────────────────────────────────────────┤
│ SECTION C: SURVEY INTELLIGENCE (MANDATORY)             │
│ Phone Number:               [+91] [ 9840112233       ] │
│ Caste / Community:          [ BC - Vanniyar ▾        ] │
│                                                        │
│ 2-Tier Occupation:                                     │
│ 1. Main Sector:             [ 📁 Agriculture ▾       ] │
│    ↳ (Auto-selects first sub-job!)                     │
│ 2. Specific Sub-Job:        [ விவசாயி (Farmer) ▾     ] │
│ Optional Custom Job Text:   [ பட்டுப்புழு வளர்ப்பு     ]│
│                                                        │
│ Political Leaning (Visual Grid):                       │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐          │
│ │ [☀️] DMK   │ │ [🍃] AIADMK│ │ [🪷] BJP   │          │
│ └────────────┘ └────────────┘ └────────────┘          │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐          │
│ │ [✋] INC   │ │ [🥭] PMK   │ │ [📢] NTK   │          │
│ └────────────┘ └────────────┘ └────────────┘          │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐          │
│ │ [🚩] TVK   │ │ [🏺] VCK   │ │ [⚖️] Neutral│          │
│ └────────────┘ └────────────┘ └────────────┘          │
│                                                        │
│ [           ✅ Save & Submit Survey (சமர்ப்பி)         ] │
└────────────────────────────────────────────────────────┘
```

#### Form Capabilities & Validation Rules:
1. **Auto-Pre-Fill on Re-Survey**:
   - If opening an elector who was previously surveyed, the form automatically pre-fills with their existing phone number, caste, job sector, sub-job, party, and custom notes.
2. **Section A (Locked Official Records)**:
   - EPIC ID, Serial No, Part No, Panchayat, Door No, Age, Gender (uneditable).
3. **Section B (Field Name Corrections)**:
   - Allows correcting clerical misspellings on the voter card.
4. **Section C (Mandatory Intelligence)**:
   - **Phone Number**: Validates 10-digit Indian format (`/^[6-9]\d{9}$/`).
   - **Caste Dropdown**: Populated dynamically from active records in `caste_master`.
   - **2-Tier Cascading Job Selector**:
     - Selecting a Main Sector automatically pre-selects the first sub-job.
     - Sub-Job dropdown filters to show only jobs under that sector.
     - Optional custom job text field.
   - **Visual Party Cards Grid**:
     - Touch grid displaying official Base64 emblem pictures, party short codes, and color accents.
     - Tapping a party card highlights it with a colored border and checkmark.
5. **Submission**:
   - Save button shows animated spinner while submitting.
   - Uses SQLite `INSERT OR REPLACE` (UPSERT) to avoid duplicate survey entries.
   - Shows a 1.5s green confirmation toast, updates the booth survey counter, and marks the voter card green in real-time.

---

## Page 10: Excel Report Export Engine (`/api/reports/export`)

* **URL Route**: `/api/reports/export`
* **Access Level**: Super Admin & Supervisor
* **Output Format**: Streaming Excel file (`.xlsx`)
* **Content-Disposition**: `attachment; filename="vms-survey-report.xlsx"`

### Report Attributes & Column Schema:
| Column # | Tamil Column Header | English Meaning | Source Field |
| :--- | :--- | :--- | :--- |
| 1 | வாக்காளர் அடையாள அட்டை | EPIC ID | `voters_master.epic_id` |
| 2 | வாக்காளர் பெயர் | Voter Full Name | `voters_master.name_ta` |
| 3 | திருத்தப்பட்ட பெயர் | Field-Corrected Name | `voter_surveys.corrected_name_ta` |
| 4 | உறவினர் பெயர் | Relative Name | `voters_master.relative_name_ta` |
| 5 | உறவு முறை | Relation Type | `voters_master.relation_type_ta` |
| 6 | பாகம் எண் | Polling Part Number | `voters_master.part_no` |
| 7 | உள்ளாட்சி அமைப்பு | Local Body / Panchayat | `polling_parts.local_body_name_ta` |
| 8 | கதவு எண் | Door / House Number | `voters_master.door_no` |
| 9 | வயது | Age | `voters_master.age` |
| 10 | பாலினம் | Gender | `voters_master.gender` |
| 11 | கைபேசி எண் | Mobile Phone Number | `voter_surveys.phone_number` |
| 12 | சாதி / சமூகம் | Caste / Community | `caste_master.name` |
| 13 | தொழில் பிரிவு | Job Sector | `job_master.category` |
| 14 | தொழில் | Occupation / Sub-Job | `job_master.name` |
| 15 | கூடுதல் தொழில் குறிப்பு | Custom Profession Notes | `voter_surveys.other_job_text` |
| 16 | அரசியல் சார்பு | Political Party Affiliation | `party_master.name` |
| 17 | கட்சி குறியீடு | Party Short Code | `party_master.party_code` |
| 18 | கணக்கெடுப்பு நாள் | Surveyed Timestamp | `voter_surveys.surveyed_at` |

---

## 13. Database Schema & Table Reference Guide

All data resides in `vms.db` (SQLite 3 with WAL journal mode, 32MB cache, memory temp store, and 12 performance indexes).

```
┌─────────────────────────────────┐           ┌──────────────────────────────────┐
│          polling_parts          │           │          voters_master           │
├─────────────────────────────────┤           ├──────────────────────────────────┤
│ part_no (PK)                    │◄────┐     │ voter_sno                        │
│ ac_no                           │     │     │ part_no (FK) ────────────────────┤
│ local_body_name_ta              │     │     │ epic_id (PK) ──────────────┐     │
│ local_body_type                 │     │     │ name_ta                    │     │
└─────────────────────────────────┘     │     │ relative_name_ta           │     │
                                        │     │ door_no, age, gender       │     │
┌─────────────────────────────────┐     │     └────────────────────────────┼─────┘
│        user_jurisdictions       │     │                                  │
├─────────────────────────────────┤     │     ┌────────────────────────────┼─────┐
│ user_id (FK) ─────────────┐     │     │     │       voter_surveys        │     │
│ part_no (FK) ─────────────┼─────┴─────┘     ├────────────────────────────┼─────┤
└───────────────────────────┼─────┐           │ epic_id (PK, FK) ──────────┘     │
                            │     │           │ phone_number                     │
┌───────────────────────────┴─┐   │           │ caste_id (FK) ─────────────┐     │
│            users            │   │           │ job_id (FK) ─────────┐     │     │
├─────────────────────────────┤   │           │ party_id (FK) ─┐     │     │     │
│ id (PK)                     │   │           │ surveyed_at    │     │     │     │
│ mobile_number (UNIQUE)      │   │           └────────────────┼─────┼─────┼─────┘
│ password_hash               │   │                            │     │     │
│ role (A1 / A2 / A3)         │   │                            │     │     │
│ is_active                   │   │   ┌────────────────────────┘     │     │
└─────────────────────────────┘   │   │                              │     │
                                  ▼   ▼                              ▼     ▼
┌───────────────────────────────────────┐ ┌──────────────────────────────────────┐
│             party_master              │ │             caste_master             │
├───────────────────────────────────────┤ ├──────────────────────────────────────┤
│ id (PK), name, party_code             │ │ id (PK), name, category, is_active   │
│ color_code, is_active                 │ └──────────────────────────────────────┘
│ symbol_img (TEXT - Base64 Data URL)   │ ┌──────────────────────────────────────┐
└───────────────────────────────────────┘ │              job_master              │
                                          ├──────────────────────────────────────┤
                                          │ id (PK), category (Sector), name     │
                                          │ is_active                            │
                                          └──────────────────────────────────────┘
```
