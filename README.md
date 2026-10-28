# VerifAI — AI-Assisted Application Validation for AICTE

> **Smart India Hackathon (SIH) — Problem Statement 26261**  
> An automated, intelligent, and officer-guided validation platform for AICTE approval scrutiny, document forensics, cross-application duplicate detection, infrastructure compliance, and original issuing authority verification.

---

## Table of Contents
1. [Overview & Problem Context](#overview--problem-context)
2. [Key Features & System Capabilities](#key-features--system-capabilities)
3. [Technology Stack](#technology-stack)
4. [Project Directory & File Structure](#project-directory--file-structure)
5. [Prerequisites & System Requirements](#prerequisites--system-requirements)
6. [Setup & Installation](#setup--installation)
7. [Operating Modes](#operating-modes)
   - [Local Simulation Mode (Default)](#local-simulation-mode-default)
   - [Live Firebase Mode](#live-firebase-mode)
8. [Demo Credentials & Sample Dossiers](#demo-credentials--sample-dossiers)
9. [Automated Test Suite](#automated-test-suite)
10. [Core Safeguards & Compliance Rules](#core-safeguards--compliance-rules)
11. [License & Acknowledgments](#license--acknowledgments)

---

## Overview & Problem Context

The **All India Council for Technical Education (AICTE)** processes thousands of institutional applications annually across two distinct statutory streams:
1. **Extension of Approval (EoA):** Existing approved institutions seeking annual continuation of courses and approved intake.
2. **New Approval:** Newly proposed institutions seeking initial establishment approval, demanding extensive scrutiny of land deeds, joint fixed deposits, structural stability, municipal approvals, and affiliating university NOCs.

### The Challenge
Scrutiny officers face severe bottlenecks and security vulnerabilities:
- **High Document Volume:** Each application includes dozens of statutory certificates, audited balance sheets, affidavits, and blueprints.
- **Fraudulent & Recycled Proofs:** Documents submitted by one institution are sometimes re-used or slightly modified across different colleges or tracks.
- **Inconsistent Disclosures:** Discrepancies between declared infrastructure (e.g., land, classrooms, laboratories) and uploaded physical evidence or architectural plans.
- **Verification Gaps with Issuing Authorities:** High administrative overhead verifying certificates with statutory bodies (Fire Services, ICAI UDIN, Land Revenue, Banks, PWD, and Universities).

### The VerifAI Solution
**VerifAI** is an AI-assisted, officer-supervised validation platform that automates document OCR extraction, performs digital forensics and tamper detection, computes cross-application duplicate indices, evaluates institutional infrastructure against AICTE regulatory norms, and guides administrators through official issuing authority verification with an immutable, tamper-evident audit history.

---

## Key Features & System Capabilities

### 1. Dual Track Isolation (EoA vs New Approval)
- Strictly separates workflows, document checklists, and regulatory assessment rules for **Extension of Approval (EoA)** and **New Approval**.
- Prevents cross-track leakage while maintaining cross-application duplicate detection.

### 2. Document Intelligence & OCR Extraction
- **In-Browser Client-Side Processing:** Extracts text directly using `pdfjs-dist` (v6.4) and `tesseract.js` (v7.0) with zero sensitive document leakage to untrusted third-party APIs.
- **Automated Field Extraction:** Recognizes certificate numbers, Chartered Accountant UDINs, issue dates, expiry dates, validity periods, financial values, and institution names.

### 3. Forensic Anomaly & Tampering Detection
- Scrutinizes embedded PDF metadata (`Producer`, `Creator`, creation vs modification timestamps).
- Flags chronological impossibilities (e.g., certificate issue date preceding PDF creation timestamp).
- Detects software manipulation indicators (e.g., edited using consumer image manipulation tools).

### 4. Cross-Application Duplicate Detection
- Multi-vector comparison across all submitted college dossiers:
  - **Cryptographic File Hash:** Exact duplicate detection via SHA-256 fingerprinting.
  - **Certificate Information Matching:** Identifies when the same certificate or UDIN is claimed by multiple institutions.
  - **OCR Text Jaccard Similarity:** Identifies near-duplicate documents with identical body text above an 80% threshold.

### 5. Regulatory & Infrastructure Compliance Engine
- Checks institutional infrastructure disclosures against configured statutory AICTE requirements:
  - Land Area (acres / square meters) against discipline and location norms.
  - Total Built-Up Area against instructional and administrative requirements.
  - Instructional Facilities: Classroom counts, laboratories, computer centers, and libraries.
  - Statutory Amenities: Fire safety compliance, barrier-free environment for PwD, and functional elevators.
- Generates transparent findings with discrepancy severity (`HIGH`, `MEDIUM`, `LOW`) and automated recommendations for physical inspection.

### 6. Infrastructure Visual Evidence Review
- Dedicated photo and document upload section for college applicants across 6 categories:
  - Classroom Photos & Smart Boards
  - Laboratories & Specialized Equipment
  - Central Library & Reading Room
  - Fire Fighting & Life Safety Installations
  - Barrier-Free Environment & PwD Ramps
  - Functional Elevators / Lifts
- Real-time review and scrutiny by AICTE officers with timestamped accept/flag actions.

### 7. Guided Verification Through Original Issuing Authority
- Maps statutory documents to their respective issuing authorities:
  - **Directorate of Fire Services:** Fire Safety Certificate / NOC (`REQ-EOA-002`, `REQ-NEW-002`)
  - **ICAI UDIN Directorate:** Audited Statements & Balance Sheets (`REQ-EOA-007`, `REQ-NEW-008`)
  - **Dept. of Revenue & Land Records:** Registered Land Deed & Non-Encumbrance (`REQ-NEW-005`, `REQ-NEW-006`)
  - **Scheduled Commercial Banks:** Joint Fixed Deposit Receipt (`REQ-NEW-003`)
  - **Affiliating University / State DTE:** Affiliation Order / State Government NOC (`REQ-EOA-005`, `REQ-NEW-007`)
  - **PWD / Municipal Authority:** Structural Stability Certificate (`REQ-EOA-004`, `REQ-NEW-004`)
- **Open Official Portal Action:** Opens verified official websites in a new tab with `target="_blank" rel="noopener noreferrer"`.
- **7-Field Guided Manual Verification Modal:**
  1. Verification Method: `Official Portal` | `QR Code` | `Other / Desk`
  2. Official Source Used (URL, Registry, or Portal name)
  3. Certificate / Reference Number Checked
  4. Verification Determination: `Verified Authentic` | `Mismatch Found` | `Unable to Verify`
  5. Mandatory Officer Remarks (strictly validated non-empty)
  6. Live Verification Date & Time
  7. Logged-in Administrator Identity (Name, Email, Role)
- **Prominent Transparency Badging:** Verified manual records are explicitly labeled **`MANUALLY VERIFIED`** across all scrutiny screens.

### 8. Strict Role-Based Access Control (RBAC) & Audit Log
- **AICTE Scrutiny Officers (`admin`):** Full scrutiny rights, document review, compliance determinations, and authority verification recording.
- **College Applicants (`college`):** Strictly restricted to managing their own institutional application, uploading proofs, and viewing read-only verification statuses.
- **Tamper-Evident Audit History:** Every action (document upload, replacement, acceptance, scrutiny review, and manual verification) is appended to an immutable audit log.

---

## Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend Framework** | React 18.3, TypeScript 5.6, Vite 5.4 |
| **Styling & UI Components** | Tailwind CSS 3.4, PostCSS, Autoprefixer, Lucide React (Icons) |
| **Client-Side Document AI** | PDF.js (`pdfjs-dist` v6.4), Tesseract OCR (`tesseract.js` v7.0) |
| **Storage & Persistence** | Dual-mode: Browser `localStorage` (Simulation) / Firebase Cloud Firestore |
| **Authentication** | Dual-mode: In-memory session simulation / Firebase Authentication |
| **Testing & Quality Assurance** | Node.js Test Runner (`--test --experimental-strip-types`) |

---

## Project Directory & File Structure

```
verifAI/
├── index.html                      # HTML5 entrypoint with Google Fonts and meta tags
├── package.json                    # Project dependencies and script definitions
├── tsconfig.json                   # TypeScript compiler configuration
├── vite.config.ts                  # Vite bundler build and plugin configuration
├── tailwind.config.js              # Tailwind CSS utility theme configuration
├── postcss.config.js               # PostCSS plugin pipeline
├── firestore.rules                 # Production Firestore security and RBAC rules
├── storage.rules                   # Production Cloud Storage security rules
│
├── src/
│   ├── main.tsx                    # React application bootstrap root
│   ├── App.tsx                     # Top-level view router and notification provider
│   ├── index.css                   # Global styles and Tailwind utility directives
│   ├── vite-env.d.ts               # Vite TypeScript environment declarations
│   │
│   ├── types/
│   │   └── index.ts                # Master TypeScript schemas and domain interfaces
│   │
│   ├── data/
│   │   └── demoData.ts             # Pre-seeded AICTE institutions, applications, and checklist items
│   │
│   ├── context/
│   │   └── AuthContext.tsx         # Authentication provider supporting simulation and live Firebase
│   │
│   ├── services/
│   │   ├── authService.ts          # Authentication abstraction (Admin & College RBAC)
│   │   ├── dataService.ts          # Core persistence engine (applications, documents, audit logs)
│   │   ├── ocrService.ts           # PDF.js and Tesseract.js client-side OCR extraction
│   │   ├── documentValidationService.ts # Document intelligence, dates, UDINs, and anomaly checks
│   │   ├── duplicateDetectionService.ts  # File hashing, info matching, and OCR Jaccard similarity
│   │   ├── regulatoryComplianceService.ts# AICTE statutory infrastructure compliance engine
│   │   ├── issuingAuthorityVerificationService.ts # Authority registry mappings and QR/signature checks
│   │   └── firebase.ts             # Firebase client SDK initialization and mode detection
│   │
│   └── components/
│       ├── common/
│       │   ├── Header.tsx          # Official AICTE portal header with role navigation
│       │   ├── Footer.tsx          # Government of India / AICTE standard footer
│       │   ├── ConfigNotice.tsx    # Live indicator for Local Simulation vs Firebase Cloud Mode
│       │   └── ErrorBoundary.tsx   # React error boundary for resilient section rendering
│       │
│       ├── landing/
│       │   └── LandingPage.tsx     # Hero landing portal with quick navigation and overview
│       │
│       ├── college/
│       │   ├── CollegePortal.tsx   # Institutional dashboard for application tracking
│       │   ├── CollegeLoginModal.tsx # College authentication modal with quick-demo credentials
│       │   ├── RequestIdModal.tsx  # New AICTE Unique Institution ID application flow
│       │   ├── EoASection.tsx      # Extension of Approval application workflow
│       │   ├── NewApprovalSection.tsx # New Approval establishment application workflow
│       │   ├── CollegeDocumentChecklist.tsx # Document upload, OCR preview, and status viewer
│       │   └── CollegeInfrastructureSection.tsx # Photographic and visual evidence upload
│       │
│       └── admin/
│           ├── AdminPortal.tsx     # Central AICTE Scrutiny Officer dashboard
│           ├── AdminLoginModal.tsx # Secure admin login modal with demo credentials
│           ├── AdminDocumentSection.tsx # Document review, scrutiny acceptance, and replacement
│           ├── ApplicationDetailModal.tsx # Multi-tab detailed dossier scrutiny modal
│           ├── DocumentOcrViewer.tsx # Deep document inspection, OCR text, metadata, and forensics
│           ├── AuthorityVerificationSection.tsx # Original issuing authority verification workflow
│           ├── RegulatoryComplianceSection.tsx # Infrastructure norms compliance assessment
│           ├── ChecklistManagementSection.tsx # AICTE checklist requirement configuration
│           └── IdRequestsSection.tsx # Unique Institution ID review and approval queue
│
└── tests/
    ├── workflowValidation.test.ts          # 12 tests: Document workflows, approvals, and checklists
    ├── documentValidation.test.ts          # 12 tests: OCR parsing, validity dates, and UDIN checks
    ├── duplicateDetection.test.ts          # 10 tests: File hash, certificate match, and OCR similarity
    ├── documentAnomalies.test.ts           # 21 tests: PDF forensics, timestamp anomalies, and tampering
    ├── regulatoryCompliance.test.ts        # 28 tests: AICTE infrastructure compliance and visual evidence
    └── issuingAuthorityVerification.test.ts# 25 tests: Authority verification, guided manual review, and RBAC
```

---

## Prerequisites & System Requirements

- **Operating System:** macOS, Linux, or Windows (WSL recommended)
- **Node.js:** v18.0.0 or higher (v20+ recommended for `--experimental-strip-types`)
- **Package Manager:** `npm` v9.0.0 or higher
- **Web Browser:** Modern Chromium-based browser (Chrome, Edge, Brave), Firefox, or Safari (supporting Canvas and Web Workers for OCR).

---

## Setup & Installation

### 1. Clone or Extract the Repository
```bash
cd "SIH 26261 a"
```

### 2. Install Project Dependencies
```bash
npm install
```

### 3. Start the Development Server
```bash
npm run dev
```
The application will launch locally at `http://localhost:5173/`.

### 4. Build for Production
To verify production bundling and asset compilation:
```bash
npm run build
```
To preview the built production bundle:
```bash
npm run preview
```

---

## Operating Modes

VerifAI automatically detects its environment and switches seamlessly between two modes:

### Local Simulation Mode (Default)
- **No external cloud setup or API keys required.**
- All applications, unique IDs, document uploads, and audit records are persisted in browser `localStorage`.
- Pre-seeded with 5 realistic AICTE institutions across Delhi, Maharashtra, Karnataka, Tamil Nadu, and Uttar Pradesh.
- Allows complete demonstration of all features: OCR, document validation, forensic checks, duplicate detection, infrastructure evidence, and guided manual authority verification.

### Live Firebase Mode
To connect the application to your live Firebase Cloud environment:
1. Create a Firebase project at the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Authentication** (Email/Password provider).
3. Enable **Cloud Firestore** and deploy `firestore.rules`.
4. Enable **Cloud Storage** and deploy `storage.rules`.
5. Copy your Firebase web credentials into a `.env` file in the root directory:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```
6. Restart the development server (`npm run dev`). VerifAI will automatically detect the configuration and connect to Firebase.

---

## Demo Credentials & Sample Dossiers

The platform includes convenient one-click demo fill buttons on all login modals.

### 1. AICTE Scrutiny Officer (Admin)
- **Email:** `admin@aicte.gov.in`
- **Password:** `Admin@AICTE2026!`
- **Role:** Central Scrutiny Officer
- **Capabilities:** Review all applications, inspect forensic metadata, trigger authority verification, record guided manual reviews, approve unique IDs, and configure checklists.

### 2. College Institutional Accounts
| Institution Name | AICTE Unique ID | Password | Stream |
| :--- | :--- | :--- | :--- |
| **Delhi Institute of Engineering & Advanced Technology** | `1-10972341` | `Password@123` | Engineering (EoA) |
| **Maharashtra Institute of Technical Sciences** | `1-24891102` | `Password@123` | Engineering (New Approval) |
| **Karnataka Apex Academy of Management & Technology** | `1-38290145` | `Password@123` | Management (EoA) |
| **Tamil Nadu College of Architecture & Planning** | `1-49012389` | `Password@123` | Architecture (New Approval) |
| **Aryavart Institute of Pharmaceutical Studies** | `1-51289033` | `Password@123` | Pharmacy (EoA) |

---

## Automated Test Suite

VerifAI contains a comprehensive automated test suite consisting of **108 tests** covering all domain services, verification logic, and security rules.

### Running All Tests
```bash
npm test
```

### Test Suite Breakdown
| Test File | Test Count | Scope & Verifications |
| :--- | :---: | :--- |
| `tests/workflowValidation.test.ts` | 12 | Document approval gates, replacement requests, clarification workflows, and checklist integrity. |
| `tests/documentValidation.test.ts` | 12 | OCR parsing, certificate number extraction, validity dates, UDIN checking, and authority mapping. |
| `tests/duplicateDetection.test.ts` | 10 | SHA-256 hash detection, certificate matching across institutions, and OCR text Jaccard similarity. |
| `tests/documentAnomalies.test.ts` | 21 | PDF creation timestamp anomalies, software producer tampering indicators, and metadata validation. |
| `tests/regulatoryCompliance.test.ts` | 28 | AICTE infrastructure rules (land, built-up area, classrooms, labs), photo evidence reviews, and track separation. |
| `tests/issuingAuthorityVerification.test.ts` | 25 | Issuing authority registries, QR domain whitelisting, digital signatures, guided manual workflow, and RBAC. |
| **Total Tests** | **108** | **100% Pass Rate (0 failures)** |

### Static Type Checking
```bash
npx tsc --noEmit
```

---

## Core Safeguards & Compliance Rules

To guarantee legal validity and administrative accountability, VerifAI strictly adheres to the following core safeguards:

1. **No Simulated or Fabricated Official Verifications:** The system never simulates or mocks a live API connection to an issuing authority.
2. **Prominent `MANUALLY VERIFIED` Labeling:** Every verification determination performed by a scrutiny officer is explicitly badged as **`MANUALLY VERIFIED`** with the officer's name, email, verification method, timestamp, and justification remarks.
3. **QR Codes & Signatures Do Not Independently Establish Authenticity:**
   - QR payloads from unwhitelisted domains are rejected as untrusted input.
   - Visual stamps and signatures without cryptographic validation are flagged as requiring manual desk inspection.
4. **Transparent Status Reporting:** When authority APIs are unavailable or unconfigured, the system honestly reports `NOT_CONFIGURED`, `SOURCE_UNAVAILABLE`, or `MANUAL_REVIEW_REQUIRED`.
5. **Role-Based Isolation:** College users are strictly restricted to read-only views of authority verification statuses; only authorized administrators can record verification decisions.

---

## License & Acknowledgments

- **Developed for:** Smart India Hackathon (SIH) — Problem Statement 26261.
- **Organization:** All India Council for Technical Education (AICTE), Ministry of Education, Government of India.
- **License:** Open for official evaluation and implementation under AICTE Hackathon guidelines.
