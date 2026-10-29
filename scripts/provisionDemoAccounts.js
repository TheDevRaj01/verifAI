/**
 * VerifAI (SIH 26261) — Secure Demo Account Provisioning Script
 * 
 * Purpose: Provisions standard AICTE evaluation institutions and administrators
 * in Firebase Authentication and Cloud Firestore using the credentials configured in .env.
 * 
 * Usage:
 *   node scripts/provisionDemoAccounts.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment variables from .env
function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found at:', envPath);
    process.exit(1);
  }
  const raw = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    env[key.trim()] = rest.join('=').trim();
  }
  return env;
}

const env = loadEnv();

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('❌ Firebase credentials missing in .env');
  process.exit(1);
}

const DEMO_ACCOUNTS = [
  {
    email: 'admin@aicte.gov.in',
    password: 'Admin@AICTE2026!',
    displayName: 'AICTE Central Scrutiny Officer',
    role: 'admin',
    collegeId: null,
  },
  {
    email: 'scrutiny@aicte-india.org',
    password: 'Admin@AICTE2026!',
    displayName: 'AICTE Scrutiny & Approval Directorate',
    role: 'admin',
    collegeId: null,
  },
  {
    email: 'principal@delhitechnical.edu.in',
    password: 'Password@123',
    displayName: 'Delhi Institute of Engineering & Technology',
    role: 'college',
    collegeId: '1-10972341',
  },
  {
    email: 'director@mumbaipolytechnic.edu.in',
    password: 'Password@123',
    displayName: 'Maharashtra Polytechnic & Technology Academy',
    role: 'college',
    collegeId: '1-24891102',
  },
  {
    email: 'info@karnatakatech.ac.in',
    password: 'Password@123',
    displayName: 'Bengaluru Technical Institute',
    role: 'college',
    collegeId: '1-38290145',
  },
  {
    email: 'registrar@bengalpharmacy.edu.in',
    password: 'Password@123',
    displayName: 'Bengal Institute of Pharmaceutical Sciences',
    role: 'college',
    collegeId: '1-49012389',
  },
  {
    email: 'principal@tnengineering.edu.in',
    password: 'Password@123',
    displayName: 'Tamil Nadu College of Architecture & Planning',
    role: 'college',
    collegeId: '1-51289033',
  },
];

async function provision() {
  console.log('====================================================');
  console.log('   VerifAI SIH 26261 — Demo Account Provisioning');
  console.log('====================================================');
  console.log(`Target Project: ${firebaseConfig.projectId}`);
  console.log(`Total Accounts: ${DEMO_ACCOUNTS.length}\n`);

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  for (let i = 0; i < DEMO_ACCOUNTS.length; i++) {
    const acc = DEMO_ACCOUNTS[i];
    process.stdout.write(`[${i + 1}/${DEMO_ACCOUNTS.length}] ${acc.role.padEnd(8)} | ${acc.email.padEnd(40)} ... `);

    let user;
    try {
      // 1. Try creating account
      const userCred = await createUserWithEmailAndPassword(auth, acc.email, acc.password);
      user = userCred.user;
      process.stdout.write('CREATED -> ');
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        // 2. Already exists, verify login
        try {
          const userCred = await signInWithEmailAndPassword(auth, acc.email, acc.password);
          user = userCred.user;
          process.stdout.write('EXISTS & VERIFIED -> ');
        } catch (loginErr) {
          console.log(`FAILED TO SIGN IN: ${loginErr.message}`);
          continue;
        }
      } else if (err.code === 'auth/operation-not-allowed') {
        console.log('\n❌ ERROR: Email/Password sign-in provider is disabled in Firebase!');
        console.log('👉 Please go to Firebase Console > Authentication > Sign-in method,');
        console.log('   enable "Email/Password", and run this script again.\n');
        process.exit(1);
      } else {
        console.log(`FAILED: ${err.message}`);
        continue;
      }
    }

    // 3. Update display name
    try {
      if (user && user.displayName !== acc.displayName) {
        await updateProfile(user, { displayName: acc.displayName });
      }
    } catch {}

    // 4. Save user metadata to /users/{uid} in Firestore
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: acc.email,
          displayName: acc.displayName,
          role: acc.role,
          collegeId: acc.collegeId || null,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (fsErr) {
        // Firestore write might be restricted by rules
      }
    }

    console.log('READY');
  }

  // Sign in as admin to seed directory data to Firestore
  const COLLEGES = [
    {
      collegeId: '1-10972341',
      collegeName: 'Delhi Institute of Engineering & Technology',
      officialEmail: 'principal@delhitechnical.edu.in',
      state: 'Delhi',
      district: 'New Delhi',
      institutionType: 'Engineering & Technology',
      authorizedPerson: 'Dr. Rameshwar Sharma',
      status: 'Active',
      createdAt: '2021-04-12',
      currentApplicationsCount: 1,
      isDemo: true,
    },
    {
      collegeId: '1-24891102',
      collegeName: 'Maharashtra Polytechnic & Technology Academy',
      officialEmail: 'director@mumbaipolytechnic.edu.in',
      state: 'Maharashtra',
      district: 'Pune',
      institutionType: 'Engineering & Technology',
      authorizedPerson: 'Prof. Anjali Kulkarni',
      status: 'Active',
      createdAt: '2019-06-20',
      currentApplicationsCount: 1,
      isDemo: true,
    },
    {
      collegeId: '1-38290145',
      collegeName: 'Bengaluru Technical Institute',
      officialEmail: 'info@karnatakatech.ac.in',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      institutionType: 'Management & Technology',
      authorizedPerson: 'Dr. S. K. Narayan',
      status: 'Active',
      createdAt: '2022-02-15',
      currentApplicationsCount: 1,
      isDemo: true,
    },
    {
      collegeId: '1-49012389',
      collegeName: 'Bengal Institute of Pharmaceutical Sciences',
      officialEmail: 'registrar@bengalpharmacy.edu.in',
      state: 'West Bengal',
      district: 'Kolkata',
      institutionType: 'Pharmacy',
      authorizedPerson: 'Dr. S. K. Mukherjee',
      status: 'Active',
      createdAt: '2020-08-10',
      currentApplicationsCount: 1,
      isDemo: true,
    },
    {
      collegeId: '1-51289033',
      collegeName: 'Tamil Nadu College of Architecture & Planning',
      officialEmail: 'principal@tnengineering.edu.in',
      state: 'Tamil Nadu',
      district: 'Chennai',
      institutionType: 'Architecture & Planning',
      authorizedPerson: 'Ar. Meenakshi Sundaram',
      status: 'Active',
      createdAt: '2023-01-18',
      currentApplicationsCount: 1,
      isDemo: true,
    },
  ];

  const CHECKLISTS = [
    {
      id: 'REQ-EOA-001',
      applicationType: 'EOA',
      title: 'Previous AICTE Approval / EoA Letter',
      description: 'Official AICTE Extension of Approval letter issued for the preceding academic session (2025-2026).',
      category: 'Regulatory Certificates',
      isMandatory: true,
      allowedFileTypes: ['.pdf'],
      maxFileSizeMB: 5,
      isActive: true,
      displayOrder: 1,
      academicYear: '2026-2027',
    },
    {
      id: 'REQ-EOA-002',
      applicationType: 'EOA',
      title: 'Fire Safety Certificate / NOC',
      description: 'Valid No Objection Certificate from State Fire & Emergency Services Directorate.',
      category: 'Safety & Compliance',
      isMandatory: true,
      allowedFileTypes: ['.pdf'],
      maxFileSizeMB: 5,
      isActive: true,
      displayOrder: 2,
      academicYear: '2026-2027',
    },
    {
      id: 'REQ-EOA-003',
      applicationType: 'EOA',
      title: 'Structural Stability Certificate',
      description: 'Structural soundness and earthquake safety certification signed by a government-empaneled Structural Engineer.',
      category: 'Infrastructure',
      isMandatory: true,
      allowedFileTypes: ['.pdf'],
      maxFileSizeMB: 5,
      isActive: true,
      displayOrder: 3,
      academicYear: '2026-2027',
    },
    {
      id: 'REQ-EOA-004',
      applicationType: 'EOA',
      title: 'Faculty Cadre Ratio & Form 16 Endorsement',
      description: 'Faculty Cadre ratio (1:15 or 1:20) compliance matrix accompanied by Chartered Accountant / Principal signed Form 16.',
      category: 'Faculty',
      isMandatory: true,
      allowedFileTypes: ['.pdf'],
      maxFileSizeMB: 10,
      isActive: true,
      displayOrder: 4,
      academicYear: '2026-2027',
    },
    {
      id: 'REQ-EOA-005',
      applicationType: 'EOA',
      title: 'Audited Financial Statement (Previous FY)',
      description: 'Audited balance sheet, income & expenditure account, and audit report for the preceding financial year with valid UDIN.',
      category: 'Financial Documents',
      isMandatory: true,
      allowedFileTypes: ['.pdf'],
      maxFileSizeMB: 10,
      isActive: true,
      displayOrder: 5,
      academicYear: '2026-2027',
    },
    {
      id: 'REQ-EOA-006',
      applicationType: 'EOA',
      title: 'Building Occupancy / Completion Certificate',
      description: 'Occupancy certificate issued by the competent town planning / development authority.',
      category: 'Infrastructure',
      isMandatory: false,
      allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
      maxFileSizeMB: 5,
      isActive: true,
      displayOrder: 6,
      academicYear: '2026-2027',
    },
    {
      id: 'REQ-EOA-007',
      applicationType: 'EOA',
      title: 'Barrier-Free Built Environment & PwD Audit',
      description: 'Self-attested audit certifying provision of ramps, specialized elevators, and accessible washrooms.',
      category: 'Institutional Details',
      isMandatory: false,
      allowedFileTypes: ['.pdf'],
      maxFileSizeMB: 5,
      isActive: true,
      displayOrder: 7,
      academicYear: '2026-2027',
    },
    {
      id: 'REQ-NEW-001',
      applicationType: 'NEW_APPROVAL',
      title: 'Society / Trust Registration Certificate',
      description: 'Certificate of registration of the sponsoring society or charitable trust under Societies Registration Act.',
      category: 'Institutional Details',
      isMandatory: true,
      allowedFileTypes: ['.pdf'],
      maxFileSizeMB: 5,
      isActive: true,
      displayOrder: 1,
      academicYear: '2026-2027',
    },
    {
      id: 'REQ-NEW-002',
      applicationType: 'NEW_APPROVAL',
      title: 'Registered Land Deed & Non-Encumbrance Certificate',
      description: 'Perpetual title deed or 30-year registered government lease deed in the name of the sponsoring Trust/Society.',
      category: 'Infrastructure',
      isMandatory: true,
      allowedFileTypes: ['.pdf'],
      maxFileSizeMB: 15,
      isActive: true,
      displayOrder: 2,
      academicYear: '2026-2027',
    },
    {
      id: 'REQ-NEW-003',
      applicationType: 'NEW_APPROVAL',
      title: 'Land Use Certificate & Classification NOC',
      description: 'Zoning clearance and conversion certificate authorizing non-agricultural educational establishment.',
      category: 'Infrastructure',
      isMandatory: true,
      allowedFileTypes: ['.pdf'],
      maxFileSizeMB: 5,
      isActive: true,
      displayOrder: 3,
      academicYear: '2026-2027',
    },
    {
      id: 'REQ-NEW-004',
      applicationType: 'NEW_APPROVAL',
      title: 'Master Building Blueprint & Architectural Plan',
      description: 'Complete sanction drawings signed by registered architect and approved by local planning authority.',
      category: 'Infrastructure',
      isMandatory: true,
      allowedFileTypes: ['.pdf'],
      maxFileSizeMB: 15,
      isActive: true,
      displayOrder: 4,
      academicYear: '2026-2027',
    },
    {
      id: 'REQ-NEW-005',
      applicationType: 'NEW_APPROVAL',
      title: 'State Government NOC for New Institution',
      description: 'Formal recommendation and No Objection Certificate issued by State Directorate of Technical Education.',
      category: 'Regulatory Certificates',
      isMandatory: true,
      allowedFileTypes: ['.pdf'],
      maxFileSizeMB: 5,
      isActive: true,
      displayOrder: 5,
      academicYear: '2026-2027',
    },
    {
      id: 'REQ-NEW-006',
      applicationType: 'NEW_APPROVAL',
      title: 'Affiliating University Consent / NOC',
      description: 'Consent for Affiliation from the recognized State or Central affiliating University.',
      category: 'Affiliation',
      isMandatory: true,
      allowedFileTypes: ['.pdf'],
      maxFileSizeMB: 5,
      isActive: true,
      displayOrder: 6,
      academicYear: '2026-2027',
    },
    {
      id: 'REQ-NEW-007',
      applicationType: 'NEW_APPROVAL',
      title: 'Joint Fixed Deposit Receipt (FDR)',
      description: 'FDR created jointly in the name of the Sponsoring Body and Regional Officer, AICTE for Corpus Security Deposit.',
      category: 'Financial Documents',
      isMandatory: true,
      allowedFileTypes: ['.pdf'],
      maxFileSizeMB: 5,
      isActive: true,
      displayOrder: 7,
      academicYear: '2026-2027',
    },
    {
      id: 'REQ-NEW-008',
      applicationType: 'NEW_APPROVAL',
      title: 'Fire Safety Certificate / NOC (New Building)',
      description: 'Provisional or Final Fire Safety Certificate approved for the new educational premises.',
      category: 'Safety & Compliance',
      isMandatory: true,
      allowedFileTypes: ['.pdf'],
      maxFileSizeMB: 5,
      isActive: true,
      displayOrder: 8,
      academicYear: '2026-2027',
    },
  ];

  try {
    await signInWithEmailAndPassword(auth, 'admin@aicte.gov.in', 'Admin@AICTE2026!');
    console.log('\nSeeding colleges directory to Cloud Firestore (/colleges)...');
    for (const col of COLLEGES) {
      try {
        await setDoc(doc(db, 'colleges', col.collegeId), col, { merge: true });
        console.log(`  ✓ Seeded College [${col.collegeId}] ${col.collegeName}`);
      } catch (cErr) {
        // Handled silently if rules not yet published
      }
    }

    console.log('\nSeeding statutory checklist requirements (/checklists)...');
    for (const req of CHECKLISTS) {
      try {
        await setDoc(doc(db, 'checklists', req.id), req, { merge: true });
        console.log(`  ✓ Seeded Requirement [${req.id}] ${req.title}`);
      } catch (rErr) {}
    }

    console.log('\nSeeding baseline evaluation applications (/applications)...');
    const APPLICATIONS = [
      {
        id: 'APP-EOA-2026-001',
        collegeId: '1-10972341',
        collegeName: 'Delhi Institute of Engineering & Technology',
        type: 'EOA',
        academicYear: '2026-2027',
        state: 'Delhi',
        district: 'New Delhi',
        discipline: 'Engineering & Technology (UG/PG)',
        intakeApprovedLastYear: 720,
        intakeProposed: 780,
        status: 'Under Scrutiny',
        submissionDate: '2026-09-15',
        lastUpdated: '2026-10-20',
        complianceScore: 92,
        flaggedIssuesCount: 0,
        isDemo: true,
        remarks: 'Extension requested with 60 additional seats in Artificial Intelligence & Data Science.',
        documents: [
          {
            id: 'doc-1',
            requirementId: 'REQ-EOA-006',
            name: 'Building Occupancy / Completion Certificate',
            category: 'Infrastructure',
            isMandatory: false,
            status: 'Uploaded',
            fileName: 'occupancy_cert_2026.pdf',
            fileSize: '3.4 MB',
            uploadDate: '2026-09-14',
            aiVerificationNote: 'Geo-coordinates verified with cadastral map. Valid till 2031.'
          },
          {
            id: 'doc-2',
            requirementId: 'REQ-EOA-004',
            name: 'Faculty Cadre Ratio & Form 16 Endorsement',
            category: 'Faculty',
            isMandatory: true,
            status: 'Uploaded',
            fileName: 'faculty_cadre_audit.pdf',
            fileSize: '5.1 MB',
            uploadDate: '2026-09-14',
            aiVerificationNote: 'AI cross-checked 84 faculty records with state university portal. Ratio 1:14.8 satisfies norms.'
          },
          {
            id: 'doc-3',
            requirementId: 'REQ-EOA-001',
            name: 'Previous AICTE Approval / EoA Letter',
            category: 'Regulatory Certificates',
            isMandatory: true,
            status: 'Uploaded',
            fileName: 'university_affiliation_draft.pdf',
            fileSize: '1.8 MB',
            uploadDate: '2026-09-15',
            aiVerificationNote: 'Provisional letter submitted. Final university syndicate approval awaited.'
          },
          {
            id: 'doc-4',
            requirementId: 'REQ-EOA-002',
            name: 'Fire Safety Certificate / NOC',
            category: 'Safety & Compliance',
            isMandatory: true,
            status: 'Uploaded',
            fileName: 'fire_safety_noc_dieat.pdf',
            fileSize: '2.2 MB',
            uploadDate: '2026-09-13',
            aiVerificationNote: 'Digital signature verified from Chief Fire Officer department portal.'
          }
        ]
      },
      {
        id: 'APP-EOA-2026-002',
        collegeId: '1-24891102',
        collegeName: 'Maharashtra Polytechnic & Technology Academy',
        type: 'EOA',
        academicYear: '2026-2027',
        state: 'Maharashtra',
        district: 'Pune',
        discipline: 'Engineering & Technology',
        intakeApprovedLastYear: 480,
        intakeProposed: 480,
        status: 'Documents Verified',
        submissionDate: '2026-09-18',
        lastUpdated: '2026-10-18',
        complianceScore: 96,
        flaggedIssuesCount: 0,
        isDemo: true,
        remarks: 'Routine EoA with continuation of existing approved intake.',
        documents: [
          {
            id: 'doc-21',
            requirementId: 'REQ-EOA-005',
            name: 'Mandatory AICTE Anti-Ragging Affidavit',
            category: 'Finance',
            isMandatory: true,
            status: 'Validated',
            fileName: 'financials_23_26.pdf',
            fileSize: '6.7 MB',
            uploadDate: '2026-09-17',
            aiVerificationNote: 'UDIN matching Institute PAN confirmed.'
          },
          {
            id: 'doc-22',
            requirementId: 'REQ-EOA-004',
            name: 'Faculty Cadre Ratio & Form 16 Endorsement',
            category: 'Faculty',
            isMandatory: true,
            status: 'Validated',
            fileName: 'mits_faculty_matrix.pdf',
            fileSize: '4.2 MB',
            uploadDate: '2026-09-18',
            aiVerificationNote: 'AI verified faculty Aadhaar/PAN deduplication index: 100% unique.'
          }
        ]
      },
      {
        id: 'APP-EOA-2026-003',
        collegeId: '1-38290145',
        collegeName: 'Bengaluru Technical Institute',
        type: 'EOA',
        academicYear: '2026-2027',
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        discipline: 'Management & Technology',
        intakeApprovedLastYear: 180,
        intakeProposed: 240,
        status: 'Clarification Requested',
        submissionDate: '2026-09-22',
        lastUpdated: '2026-10-24',
        complianceScore: 78,
        flaggedIssuesCount: 1,
        isDemo: true,
        remarks: 'Clarification sought regarding built-up area and faculty roster.',
        documents: []
      },
      {
        id: 'APP-NEW-2026-101',
        collegeId: '1-49012389',
        collegeName: 'Bengal Institute of Pharmaceutical Sciences',
        type: 'NEW_APPROVAL',
        academicYear: '2026-2027',
        state: 'West Bengal',
        district: 'Kolkata',
        discipline: 'Pharmacy',
        intakeProposed: 240,
        status: 'Under Scrutiny',
        submissionDate: '2026-10-01',
        lastUpdated: '2026-10-22',
        complianceScore: 88,
        flaggedIssuesCount: 0,
        isDemo: true,
        remarks: 'New institution setup by recognized Educational Trust with 5-acre campus.',
        documents: []
      },
      {
        id: 'APP-NEW-2026-102',
        collegeId: '1-51289033',
        collegeName: 'Tamil Nadu College of Architecture & Planning',
        type: 'NEW_APPROVAL',
        academicYear: '2026-2027',
        state: 'Tamil Nadu',
        district: 'Chennai',
        discipline: 'Architecture & Planning',
        intakeProposed: 120,
        status: 'Submitted',
        submissionDate: '2026-10-14',
        lastUpdated: '2026-10-14',
        complianceScore: 84,
        flaggedIssuesCount: 0,
        isDemo: true,
        remarks: 'First-time approval application awaiting scrutiny committee scheduling.',
        documents: []
      }
    ];

    for (const appItem of APPLICATIONS) {
      try {
        await setDoc(doc(db, 'applications', appItem.id), appItem, { merge: true });
        console.log(`  ✓ Seeded Application [${appItem.id}] for College ${appItem.collegeId}`);
      } catch (aErr) {
        console.warn(`  ⚠ Application seed notice [${appItem.id}]:`, aErr.message);
      }
    }
  } catch (seedAllErr) {
    console.warn('Seeding notice:', seedAllErr.message);
  }

  console.log('\n====================================================');
  console.log('✅ Demo accounts provisioning process finished.');
  console.log('====================================================');
  console.log('Evaluation Accounts:');
  console.log('  Admin:   admin@aicte.gov.in               Password: Admin@AICTE2026!');
  console.log('  College: principal@delhitechnical.edu.in       Password: Password@123 (College ID: 1-10972341)');
  console.log('  College: director@mumbaipolytechnic.edu.in     Password: Password@123 (College ID: 1-24891102)');
  console.log('====================================================\n');
}

provision().catch((err) => {
  console.error('\n❌ Unexpected error during provisioning:', err);
  process.exit(1);
});

export { DEMO_ACCOUNTS };
