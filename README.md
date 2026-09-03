# 🗳️ Voter Survey & Management System (VMS)

An enterprise-grade, high-performance Electoral Roll Analytics and Field Survey Management System built with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, and **SQLite**.

Designed for Assembly Constituencies across Tamil Nadu, pre-configured with **245,453 voter records**, **318 polling stations**, and **49 local bodies** (Panchayats & Towns).

---

## 🌟 Key Features

### 1. 👑 Super Admin Portal (A1)
- **Global Dashboard**: Real-time KPI summary (Total Voters, Surveyed, Pending, Velocity), multi-constituency dropdown selector, and Panchayat-wise progress tracking.
- **Advanced Voter Directory (`/admin/voters`)**:
  - Full server-side pagination across 245,453 voters (25, 50, or 100 rows per page).
  - Deep-linked from Panchayat rows on the dashboard.
  - Multi-column search (Tamil Name, Relative Name, EPIC ID, Door Number).
  - Filters for Local Body, Booth Part #, Gender (ஆண் / பெண் / மூன்றாம் பாலினம்), and Survey Status.
  - Interactive Voter Detail Inspection Modal.
- **User Management (`/admin/users`)**: Create and manage Supervisors (A2) and Field Agents (A3) with dynamic multi-select jurisdiction assignment (no EPIC requirement).
- **Master Data Configuration (`/admin/masters`)**: Manage Castes, 2-Tier Occupational Hierarchy, and Political Parties with active toggles.
- **Reports Export**: Streaming `.xlsx` Excel export with scoped and filtered support.

### 2. 📋 Supervisor Portal (A2)
- **Jurisdiction-Scoped Dashboard (`/supervisor/dashboard`)**: Analytics strictly isolated to assigned polling booths.
- **Scoped Voter Directory (`/supervisor/voters`)**: Access only voters in assigned booths.
- **Field Agent Monitoring**: Real-time agent progress and survey metrics.

### 3. 📱 Field Agent Mobile Survey (A3)
- **Mobile-Optimized Interface (`/survey/booth`)**: Touch-friendly, sticky header with online/offline detection.
- **Voter Search**: Search voters in assigned booth by EPIC, Tamil name, Relative name, or Door number.
- **Structured Survey Form**:
  - Section 1 (Read-Only): Citizen electoral roll record.
  - Section 2 (Corrections): Optional name corrections in Tamil.
  - Section 3 (Intelligence Collection):
    - Phone number (10-digit validation).
    - Caste / Community dropdown.
    - **2-Tier Job Selector**: Main Sector (Agriculture, Govt, Private, Business, Daily Wage, Others) ➔ Specific Role Sub-Dropdown ➔ "Others" free text input.
    - Political party leaning.
  - Instant submission with booth progress counters.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ or 20+
- npm

### Installation
```bash
# Clone the repository
git clone https://github.com/mukeshkannanduraisamy-hue/vms-webapp.git
cd vms-webapp

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔐 Default Demo Accounts

| Role | Mobile Number | Password |
| :--- | :--- | :--- |
| **Super Admin (A1)** | `9876543210` | `admin123` |
| **Supervisor (A2)** | `9840123456` | `supervisor123` |
| **Field Agent (A3)** | `9845012345` | `agent123` |

---

## 🏗️ Architecture & Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS, Lucide Icons, Noto Sans Tamil font
- **Database**: SQLite via `better-sqlite3` with WAL mode
- **Authentication**: JWT (`jose`) stored in HttpOnly cookies + Role-Based Middleware
- **Validation**: Zod schema validation
- **Spreadsheet Engine**: `xlsx` (SheetJS)

---

## 📄 License
Private & Proprietary. All rights reserved.
