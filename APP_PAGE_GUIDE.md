# 🗳️ Voter Management & Field Survey System (VMS)
## Comprehensive Page-by-Page Feature & Operations Guide

This document provides an exhaustive, page-by-page breakdown of all modules, features, operational workflows, and options available in the Voter Survey & Management System (VMS).

---

## 📑 Table of Contents
1. [User Roles & Access Control Matrix](#1-user-roles--access-control-matrix)
2. [Global Application Shell & Navigation](#2-global-application-shell--navigation)
3. [Authentication Portal (`/login`)](#3-authentication-portal-login)
4. [Super Admin Constituency Dashboard (`/admin/dashboard`)](#4-super-admin-constituency-dashboard-admindashboard)
5. [Voter Directory & Citizen Dossier (`/admin/voters`)](#5-voter-directory--citizen-dossier-adminvoters)
6. [User Accounts & Staff Directory (`/admin/users`)](#6-user-accounts--staff-directory-adminusers)
7. [Create New User & Jurisdiction Assignment (`/admin/users/create`)](#7-create-new-user--jurisdiction-assignment-adminuserscreate)
8. [Master Data Configuration (`/admin/masters`)](#8-master-data-configuration-adminmasters)
   - [8.1 Caste Master Tab](#81-caste-master-சாதி-மாஸ்டர்)
   - [8.2 Job & Occupation Master Tab (2-Tier Hierarchy)](#82-job--occupation-master-தொழில்-மாஸ்டர்)
   - [8.3 Political Party Master Tab (Base64 Image Upload)](#83-political-party-master-கட்சி-மாஸ்டர்)
9. [Supervisor Scoped Dashboard (`/supervisor/dashboard` & `/supervisor/voters`)](#9-supervisor-scoped-dashboard-supervisordashboard)
10. [Field Agent Mobile Survey App (`/survey/booth`)](#10-field-agent-mobile-survey-app-surveybooth)
11. [Excel Report Export Engine (`/api/reports/export`)](#11-excel-report-export-engine-apireportsexport)

---

## 1. User Roles & Access Control Matrix

The system enforces strict Role-Based Access Control (RBAC) via cryptographically signed JWT tokens stored in HttpOnly cookies:

| Role Level | Role Code | Target Audience | Accessible Pages & Routes | Default Landing Page |
| :--- | :--- | :--- | :--- | :--- |
| **Level 1** | `A1_SUPER_ADMIN` | MLA, Campaign Manager, Chief Analyst | `/admin/dashboard`, `/admin/voters`, `/admin/users`, `/admin/users/create`, `/admin/masters`, `/api/reports/export` | `/admin/dashboard` |
| **Level 2** | `A2_SUPERVISOR` | Union / Block Leader, Zone Supervisor | `/supervisor/dashboard`, `/supervisor/voters`, scoped reports | `/supervisor/dashboard` |
| **Level 3** | `A3_FIELD_AGENT` | Booth Level Agent (BLA), Field Surveyor | `/survey/booth` | `/survey/booth` |

---

## 2. Global Application Shell & Navigation

Used across all desktop, tablet, and mobile views for Admin and Supervisor users.

### 2.1 Left Sidebar (`AdminSidebar`)
- **Branding**: Displays the VMS emblem, Pennagaram Constituency badge, and current user role pill (`Super Admin A1` in purple, `Supervisor A2` in blue).
- **Navigation Menu**:
  - 📊 **Dashboard**: Navigates to `/admin/dashboard` or `/supervisor/dashboard`.
  - 🗳️ **Voters Directory**: Instant access to the 245,453 voter electoral roll.
  - ➕ **Create User**: Register new field agents or supervisors.
  - 👥 **User List**: Staff roster and jurisdiction editor.
  - 🗄️ **Master Data**: 2-Tier Master configuration (Castes, Occupations, Parties) — *Visible only to Super Admins*.
- **Responsive Behavior**:
  - **Desktop (≥1024px)**: Permanently docked on the left (64 width).
  - **Tablet & Mobile (<1024px)**: Converts to a sliding drawer with a semi-transparent blurred backdrop overlay. Closes automatically on item selection or backdrop tap.

### 2.2 Sticky Top Header (`AppHeader`)
- **Hamburger Button**: Toggles sidebar drawer on mobile and tablet.
- **Constituency Badge**: Displays "பென்னாகரம் சட்டமன்ற தொகுதி #57" (Pennagaram AC).
- **🖥️ Responsive Device Viewport Switcher**:
  - **`[ 💻 Desktop ]`**: Full 100% responsive desktop layout.
  - **`[ 📱 Tablet ]`**: Constrains viewport into a 768px tablet container with preview borders and shadow.
  - **`[ 📲 Mobile Ready ]`**: Constrains viewport into a 384px smartphone preview frame with device bezel.
  - *Clicking any button instantly highlights that mode and reframes the layout for live testing.*
- **Top-Right Quick Options Menu**:
  - Displays user avatar and active role indicator.
  - Clicking opens a small corner dropdown menu:
    - User mobile number and role title in Tamil.
    - Quick shortcut links to **Admin Dashboard**, **245k Directory**, **User Accounts**, and **Master Data**.
    - **🚪 Logout Button**: Clears authentication cookies and redirects to `/login`.
    - Closes cleanly on outside click or pressing the `Escape` key.

---

## 3. Authentication Portal (`/login`)

**URL**: `/login`  
**Access**: Public (Unauthenticated visitors; automatically redirects logged-in users to their role portal)

### Features & Capabilities:
1. **Bilingual Branding**: "Voter Survey Portal • வாக்காளர் கணக்கெடுப்பு போர்டல்".
2. **Mobile Number Input**:
   - Automatically prefixes `+91`.
   - Validates Indian 10-digit format starting with 6, 7, 8, or 9.
3. **Password Input**:
   - Secure masked input with interactive **Show / Hide Password** eye toggle.
4. **Sign In Button**:
   - Displays spinning indicator while authenticating.
   - Dual password verification: checks modern bcrypt hashes as well as legacy sha256 credentials.
5. **Instant Role-Based Redirection**:
   - Super Admins ➡️ `/admin/dashboard`
   - Supervisors ➡️ `/supervisor/dashboard`
   - Field Survey Agents ➡️ `/survey/booth`
6. **Quick Test Credentials Reference Box**:
   - Lists default credentials for quick testing in development and demonstration environments.

---

## 4. Super Admin Constituency Dashboard (`/admin/dashboard`)

**URL**: `/admin/dashboard`  
**Access**: Super Admin (`A1_SUPER_ADMIN`)

### Features & Capabilities:
1. **Constituency Scope Bar**:
   - Dropdown to filter by Assembly Constituency (AC #57 Pennagaram).
   - **🔄 Refresh Button**: Re-fetches statistics (cached for 60 seconds in-memory for instant 300ms speed).
   - **📥 Download Full Report Button**: Direct link downloading `vms-survey-report.xlsx` containing all 245k voter records with Tamil headers.
2. **4 KPI Summary Cards**:
   - **Total Registered Voters**: Shows total electors (e.g. 244,653) across all 318 booths.
   - **Completed Surveys**: Displays surveyed count, live progress bar clamped between 0% and 100%, and completion percentage.
   - **Pending Voters**: Real-time remaining un-surveyed voters count.
   - **Today's Velocity**: Displays surveys collected today and percentage delta compared to yesterday.
3. **Panchayat & Town Progress Roster**:
   - Search bar to filter panchayats by name in Tamil or English.
   - Table columns:
     - **#**: Serial index.
     - **Panchayat / Town Name**: Clickable link that redirects directly to `/admin/voters` pre-filtered for that specific panchayat!
     - **Local Body Type**: Badges distinguishing `Village Panchayat (கிராம ஊராட்சி)` vs `Town Panchayat (பேரூராட்சி)`.
     - **Booths Count**: Number of polling stations in that panchayat.
     - **Total Voters**: Electors in that body.
     - **Completed Surveys**: Number of voters surveyed.
     - **Pending**: Remaining voters.
     - **Progress %**: Visual color-coded progress bar (red <30%, yellow <70%, green ≥70%).

---

## 5. Voter Directory & Citizen Dossier (`/admin/voters`)

**URL**: `/admin/voters`  
**Access**: Super Admin (`A1_SUPER_ADMIN`) & Supervisor (`A2_SUPERVISOR` - scoped to assigned booths)

### Filter & Search Controls:
1. **Search Bar**:
   - 300ms debounced input.
   - Searches across Tamil Voter Name (`name_ta`), Door Number (`door_no`), or EPIC Card ID (`epic_id`).
   - Includes "X" clear button.
2. **Local Body Dropdown Filter**:
   - Displays all 49 Panchayats and Town Panchayats with their booth counts.
   - Selecting a panchayat automatically resets pagination to Page 1 and filters the Polling Booth dropdown!
3. **Polling Booth Dropdown Filter**:
   - Displays parts within the selected local body (or all 318 parts).
4. **Gender Filter**:
   - All Genders, Male (`ஆண்`), Female (`பெண்`), Third Gender (`மூன்றாம் பாலினம்`).
5. **Survey Status Tabs**:
   - `All Voters`: Total electorate.
   - `✓ Surveyed Only`: Only electors with completed survey dossiers.
   - `⏳ Pending Only`: Electors not yet reached by field agents.
6. **Rows Per Page Selector**: Choose between 10, 25, 50, or 100 voters per page.
7. **Reset All Filters Button**: One-click restore to default view.

### Voter Records Table:
- **S.No**: Official electoral roll serial number.
- **EPIC ID**: Voter ID card number (monospace font).
- **Voter Name**: Tamil name with hover tooltip (`title`) and field-corrected name tag if updated by agent.
- **Relative Name & Relation**: Father / Husband / Mother name with relation type.
- **Age / Gender**: Color-coded gender badge (Blue for Male, Pink for Female, Purple for Third Gender).
- **Door No**: Address door number.
- **Booth & Local Body**: Part number and panchayat name.
- **Survey Status**:
  - `⏳ Pending` grey pill if not surveyed.
  - `✓ Surveyed` green pill with **Political Party Logo**, Party Name, and Mobile Number if surveyed.
- **Inspect Action Button**: Eye icon button opening the complete Citizen Dossier modal.

### Interactive Citizen Dossier Modal:
- **Dismissal Controls**: Closes via "X" button, clicking outside the modal backdrop, or pressing the `Escape` key.
- **Section 1: Official Electoral Roll Details (Read-Only)**:
  - EPIC ID, Serial Number, Voter Full Name (Tamil), Local Body, Polling Booth #, Relation Name, Age, Gender, Door Number, Section Details, Town/Village.
- **Section 2: Field Survey Intelligence (கள கணக்கெடுப்பு முடிவு)**:
  - Mobile Number with direct call icon.
  - Political Party Affiliation with **Official Party Emblem Image** and party title.
  - Caste / Community classification.
  - Occupation / Job title and optional custom profession notes.
  - Field-corrected Tamil names (if voter requested spelling correction).
  - Exact survey timestamp.

---

## 6. User Accounts & Staff Directory (`/admin/users`)

**URL**: `/admin/users`  
**Access**: Super Admin (`A1_SUPER_ADMIN`)

### Features & Capabilities:
1. **Header Action Bar**:
   - Total registered staff count.
   - **🔄 Refresh Button**: Reloads user table.
   - **➕ Create New User Button**: Quick link to user registration page.
2. **Users Roster Table**:
   - **User Mobile**: Registered login phone number (`+91 ...`).
   - **Assigned Role**: Color-coded role badge (`Super Admin A1`, `Supervisor A2`, `Field Agent A3`).
   - **Verified EPIC ID**: Linked voter card ID.
   - **Jurisdiction Scope**: Displays count of assigned polling booths (e.g. `10 Booths assigned (1, 2, 3...)`) or `Global (All 318 Booths)` for admins.
   - **Account Status**: `✓ Active` (green) or `✕ Disabled` (grey).
   - **Created Date**: Registration timestamp.
   - **Actions**: **"Edit" Button** (pencil icon) on every user row.

### Interactive Edit User Modal:
- Clicking **"Edit"** on any user opens the edit modal pre-filled with their details:
  1. **User Role**: Toggle between Supervisor (A2) and Field Agent (A3).
  2. **Account Status**: One-click toggle between `Active (செயலில் உள்ளது)` and `Disabled (முடக்கப்பட்டுள்ளது)`.
  3. **Mobile Number**: Update mobile number with automatic duplicate validation.
  4. **Password Reset (Optional)**: Leave blank to keep existing password, or enter 6+ characters to re-hash and reset.
  5. **Verified EPIC ID**: Update voter card identifier.
  6. **Interactive Jurisdiction Reassignment**:
     - **"⚡ Auto-Select All" Button**: One-click assign all 49 Panchayats and 318 booths.
     - **"Clear" Button**: Deselect all booths.
     - **Panchayat Chips**: Select one or more panchayats to filter polling stations.
     - **Polling Booth Checkbox Chips**: Interactive part buttons pre-checked with user's current assignments.
  7. **Save Changes Button**: Saves updates via `PATCH /api/users/[id]` with real-time feedback.

---

## 7. Create New User & Jurisdiction Assignment (`/admin/users/create`)

**URL**: `/admin/users/create`  
**Access**: Super Admin (`A1_SUPER_ADMIN`)

### Form Fields & Capabilities:
1. **Role Selection**: Radio card selector for `Supervisor (A2)` or `Field Agent (A3)`.
2. **Mobile Number**: 10-digit number (+91). Checks for duplicate registration.
3. **Password**: Minimum 6 characters (hashed with bcrypt 12 rounds).
4. **Optional EPIC ID Verification**:
   - Input EPIC ID and click **"Verify EPIC"**.
   - Queries `voters_master` and previews voter name in Tamil, age, gender, and booth.
5. **Jurisdiction Assignment Engine**:
   - Multi-select Panchayat chips.
   - **"⚡ Auto-Select All" Button** for instant constituency-wide assignment.
   - Polling booth checkboxes with dynamic counts.
6. **Submit Button**: Creates user in transaction, inserts jurisdiction records, and redirects to `/admin/users`.

---

## 8. Master Data Configuration (`/admin/masters`)

**URL**: `/admin/masters`  
**Access**: Super Admin (`A1_SUPER_ADMIN`) exclusively.

Provides three tabs to customize surveys and dropdown options without changing code.

---

### 8.1 Caste Master (சாதி மாஸ்டர்)
- **Search Bar & Status Filter**: Search by caste title in Tamil or English; filter Active vs Disabled.
- **"+ Add New Caste" Modal**:
  - Caste Name (e.g. `BC - Vanniyar / வன்னியர்`).
  - Reservation Category: `OC`, `BC`, `BCM`, `MBC`, `SC`, `ST`.
- **Table Operations**:
  - Toggle `Active / Disabled` switch per row.
  - Edit caste title and reservation category.

---

### 8.2 Job & Occupation Master (தொழில் மாஸ்டர்)
Features a **2-Tier Hierarchy** (Main Sector ➡️ Specific Sub-Job):
- **View Mode Switcher**:
  - **📁 Grouped by Sector (Tree View)**: Shows cards for each of the 6 Main Sectors with nested sub-jobs.
  - **📋 Flat Table View**: Tabular list with search and column sorting.
- **6 Standard Main Sectors**:
  1. Agriculture & Farming (வேளாண்மை மற்றும் பண்ணை)
  2. Daily Wage & Construction (தினசரி கூலி & கட்டுமானம்)
  3. Factory & Manufacturing (தொழிற்சாலை & உற்பத்தி)
  4. Government & Services (அரசுப் பணி & பொதுச் சேவை)
  5. Business & Trade (வணிகம் & சுயதொழில்)
  6. Others / Students / Homemakers (மற்றவை / மாணவர்கள் / இல்லத்தரசி)
- **38 Pre-Configured Sub-Jobs**: Covers local occupations (e.g. Silk Weaver, Mason, Farmer, Govt Teacher, Driver, etc.).
- **"+ Add New Sub-Job" Modal**:
  - Choose Main Sector from dropdown or enter new sector.
  - Enter Sub-Job Title in Tamil and English.
- **Operations**:
  - Quick-toggle status per sub-job.
  - Edit existing titles.

---

### 8.3 Political Party Master (கட்சி மாஸ்டர்)
- **Search & Status Filter**: Filter parties by name or code.
- **"+ Add New Party" & "Edit" Modal**:
  - **Party Title**: Tamil and English name (e.g. `DMK / திராவிட முன்னேற்றக் கழகம்`).
  - **Short Code**: Monospace abbreviation (e.g. `DMK`, `AIADMK`, `BJP`, `TVK`).
  - **Flag / Branding Color**: Color picker and hex code input.
  - **📸 Party Picture File Upload (Stored as Base64 in Database)**:
    - Click to browse or drag & drop any image file (`PNG`, `JPG`, `SVG`, `WebP` up to 2MB).
    - Auto-encodes to a self-contained Base64 Data URL (`data:image/...;base64,...`).
    - **Live Preview Card**: Shows the image, file name, size in KB, `✓ Base64 Image Ready` indicator, and a clear button.
    - Saves directly into SQLite `party_master.symbol_img` column.
    - *Zero external CDN or file server dependency!*
- **Pre-Loaded Official Base64 Parties**:
  - DMK (Rising Sun), AIADMK (Two Leaves), BJP (Lotus), INC (Hand), PMK (Mango), NTK (Mic), TVK (TVK Flag), VCK (Pot), Neutral (Scale), Independent (Star).
- **Operations**:
  - Toggle Active/Inactive status.
  - Real-time updates reflected immediately across Voter Directory and Field Survey forms.

---

## 9. Supervisor Scoped Dashboard (`/supervisor/dashboard`)

**URL**: `/supervisor/dashboard`  
**Access**: Supervisor (`A2_SUPERVISOR`)

### Scoped Features:
1. **Strict Jurisdiction Scoping**: All queries automatically filter by `user_jurisdictions` for that supervisor (e.g. Booths 1-10 = 6,943 voters).
2. **Supervisor KPI Cards**: Scoped Total Voters, Completed Surveys, Pending, Today's velocity.
3. **Field Agent Performance Table**:
   - Roster of all A3 Field Agents operating within supervisor's assigned booths.
   - Shows Agent Mobile, Assigned Booths, Total Surveys Completed, Today's Submissions.
4. **Scoped Directory Link (`/supervisor/voters`)**: Same rich voter search and inspection modal, but restricted strictly to assigned parts.
5. **Security Enforcement**: Supervisors trying to access `/admin/*` routes are blocked and redirected.

---

## 10. Field Agent Mobile Survey App (`/survey/booth`)

**URL**: `/survey/booth`  
**Access**: Field Agent (`A3_FIELD_AGENT`)  
**Design**: Mobile-optimized layout for smartphones in polling stations.

### Mobile Survey Workflow:
1. **Sticky Header**:
   - Agent mobile number and assigned booth badge (e.g. `Part #1`).
   - Live booth progress counter (e.g. `16 / 972 (2%)`) with progress bar.
   - Logout button.
2. **Voter Search Bar**:
   - Fast 300ms debounced search.
   - Search by Voter Name in Tamil, Door Number, or EPIC ID.
   - Restricted strictly to the agent's assigned polling booth.
3. **Voter Cards List**:
   - Shows S.No, Tamil Name, Door No, Age/Gender.
   - `✓ Surveyed` green badge if completed, `Pending` if un-surveyed.
   - Tapping any card opens the Survey Entry Form.
4. **Survey Entry Form**:
   - **Auto-Pre-Fill on Re-Survey**: If opening a voter who was previously surveyed, automatically loads their existing mobile, caste, job sector, sub-job, party, and custom text for review or editing.
   - **Section A: Locked Electoral Roll Data**:
     - EPIC ID, Booth #, Panchayat, Door Number, Age, Gender.
   - **Section B: Field Correction**:
     - Editable first name and relative name in Tamil (allows fixing spelling mistakes on voter ID).
   - **Section C: Survey Intelligence (Mandatory)**:
     - **Mobile Number**: 10-digit phone number (starts with 6-9).
     - **Caste / Community**: Dropdown populated from active Caste Master.
     - **2-Tier Job Selection**:
       1. Select Main Sector (Agriculture, Construction, Factory, Govt, Business, Other) ➡️ Automatically pre-selects the first sub-job!
       2. Select Specific Sub-Job.
       3. Optional custom job text field.
     - **Visual Political Party Cards Grid**:
       - Grid of party cards showing official symbol pictures, party names, and color codes.
       - Tapping a card highlights it with party border and checkmark.
   - **Save & Submit Button**:
     - Shows spinner while submitting.
     - UPSERT logic updates existing survey record without duplicates.
     - Displays 1.5s success confirmation toast.
     - Updates booth survey counter and marks card green in real-time.

---

## 11. Excel Report Export Engine (`/api/reports/export`)

**URL**: `/api/reports/export`  
**Access**: Super Admin (`A1_SUPER_ADMIN`) & Supervisor (`A2_SUPERVISOR`)

### Export Capabilities:
1. **Streaming Excel File (`.xlsx`)**: Fast export using memory streaming.
2. **Tamil Column Headers**:
   - வாக்காளர் அடையாள அட்டை (EPIC ID)
   - வாக்காளர் பெயர் (Voter Name)
   - உறவினர் பெயர் (Relative Name)
   - பாகம் எண் (Part No)
   - உள்ளாட்சி அமைப்பு (Local Body / Panchayat)
   - கதவு எண் (Door No)
   - வயது (Age)
   - பாலினம் (Gender)
   - கைபேசி எண் (Phone Number)
   - சாதி / சமூகம் (Caste / Community)
   - தொழில் பிரிவு (Job Sector)
   - தொழில் (Occupation)
   - அரசியல் சார்பு (Political Party Affiliation)
   - கணக்கெடுப்பு நாள் (Surveyed Timestamp)
3. **Filtering Options**:
   - `?local_body=...`: Export only voters belonging to a selected panchayat.
   - Role-based automatic scoping: Supervisors receive only their assigned booths.
4. **Content-Disposition**: Downloads directly as `vms-survey-report.xlsx`.

---

## 12. Quick Reference Summary Table

| Page Route | Access Level | Primary Function | Key Actions & Options |
| :--- | :--- | :--- | :--- |
| `/login` | Public | Authentication | Mobile + Password login, show password toggle, test credentials |
| `/admin/dashboard` | Super Admin | Constituency Overview | 4 KPI cards, Panchayat breakdown, Excel export, live refresh |
| `/admin/voters` | Admin & Supervisor | Electoral Roll Roster | 245k search, 5 filters, sorting, Citizen Dossier inspection modal |
| `/admin/users` | Super Admin | Staff Directory | User list, active toggle, **Edit User credentials & jurisdictions modal** |
| `/admin/users/create` | Super Admin | User Registration | Create A2/A3 staff, EPIC check, Panchayat & Booth auto-select |
| `/admin/masters` | Super Admin | Master Data Configuration | Caste CRUD, 2-Tier Job sectors (38 sub-jobs), **Base64 Party Picture upload** |
| `/supervisor/dashboard`| Supervisor | Scoped Monitoring | Scoped KPIs (e.g. 6,943 voters), agent tracking, scoped voter directory |
| `/survey/booth` | Field Agent | Mobile Survey Entry | Scoped voter search, re-survey pre-fill, 2-tier job select, visual party grid |
| `/api/reports/export` | Admin & Supervisor | Data Export | Streams `.xlsx` spreadsheet with Tamil headers, full/panchayat filter |
