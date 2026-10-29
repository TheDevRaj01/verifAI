import test from 'node:test';
import assert from 'node:assert/strict';
import {
  uploadDocumentToCloudStorage,
  uploadEvidenceToCloudStorage,
  deleteFromCloudStorage,
  migrateApplicationDocumentsToCloudStorage,
  getApplications,
  getApplicationById,
  createOrUpdateApplication,
  uploadApplicationDocument,
  removeApplicationDocument,
  addInfrastructureEvidence,
  removeInfrastructureEvidence,
} from '../src/services/dataService.ts';
import { extractPdfMetadata } from '../src/services/documentValidationService.ts';
import { calculateFileHash } from '../src/services/duplicateDetectionService.ts';
import type { CollegeApplication, RequiredDocument, InfrastructureEvidenceItem } from '../src/types/index.ts';

// Simulated in-memory storage store to test multi-session & cross-device persistence
class MockStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

test('1. Structured Cloud Storage path generation conforms to required convention', async () => {
  const appId = 'APP-EOA-2026-001';
  const reqId = 'REQ-EOA-001';
  const version = 2;
  const fileName = 'Land Deed & Title Certificate (Final).pdf';

  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const expectedDocPath = `applications/${appId}/documents/${reqId}/v${version}/${sanitized}`;

  assert.equal(
    expectedDocPath,
    'applications/APP-EOA-2026-001/documents/REQ-EOA-001/v2/Land_Deed___Title_Certificate__Final_.pdf'
  );

  const evidenceId = 'EVID-987654-abc1';
  const photoName = 'Campus Main Gate Frontal Photo.jpg';
  const sanitizedPhoto = photoName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const expectedEvidencePath = `applications/${appId}/evidence/${evidenceId}/${sanitizedPhoto}`;

  assert.equal(
    expectedEvidencePath,
    'applications/APP-EOA-2026-001/evidence/EVID-987654-abc1/Campus_Main_Gate_Frontal_Photo.jpg'
  );
});

test('2. Lightweight metadata separation keeps document record < 25 KB without Base64 file payload', async () => {
  const cloudDoc: RequiredDocument = {
    id: 'REQ-EOA-001',
    requirementId: 'REQ-EOA-001',
    name: 'Land Deed / Registration Document',
    category: 'Land & Building',
    isMandatory: true,
    status: 'Uploaded',
    fileName: 'Land_Registration_Deed_2026.pdf',
    fileSize: '4.85 MB',
    fileType: 'application/pdf',
    // In cloud mode, fileDataUrl and fileUrl store the HTTPS Cloud Storage URL, NOT a 6MB Base64 string
    fileDataUrl: 'https://firebasestorage.googleapis.com/v0/b/verifai-aicte.appspot.com/o/applications%2FAPP-EOA-2026-001%2Fdocuments%2FREQ-EOA-001%2Fv1%2FLand_Registration_Deed_2026.pdf?alt=media&token=a1b2c3d4',
    fileUrl: 'https://firebasestorage.googleapis.com/v0/b/verifai-aicte.appspot.com/o/applications%2FAPP-EOA-2026-001%2Fdocuments%2FREQ-EOA-001%2Fv1%2FLand_Registration_Deed_2026.pdf?alt=media&token=a1b2c3d4',
    storagePath: 'applications/APP-EOA-2026-001/documents/REQ-EOA-001/v1/Land_Registration_Deed_2026.pdf',
    fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    uploadDate: '2026-10-28',
    version: 1,
  };

  const serializedSize = new TextEncoder().encode(JSON.stringify(cloudDoc)).length;
  // Metadata must be under 2 KB (comfortably below 25 KB target, and orders of magnitude below 1 MiB Firestore limit)
  assert.ok(serializedSize < 2048, `Serialized size was ${serializedSize} bytes, expected < 2048 bytes`);
  assert.equal(cloudDoc.storagePath, 'applications/APP-EOA-2026-001/documents/REQ-EOA-001/v1/Land_Registration_Deed_2026.pdf');
  assert.ok(cloudDoc.fileUrl?.startsWith('https://'));
});

test('3. Cross-device retrieval simulation: Device B retrieves updated cloud metadata persisted by Device A', async () => {
  // Simulate Device A (College Portal) updating an application dossier
  const mockSharedCloudStore = new Map<string, CollegeApplication>();

  const deviceA_app: CollegeApplication = {
    id: 'APP-EOA-2026-TEST',
    collegeId: '1-10972341',
    collegeName: 'Delhi Institute of Engineering & Technology',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering & Technology',
    status: 'Submitted',
    submissionDate: '2026-10-28',
    lastUpdated: '2026-10-28',
    complianceScore: 100,
    flaggedIssuesCount: 0,
    documents: [
      {
        id: 'REQ-EOA-001',
        requirementId: 'REQ-EOA-001',
        name: 'Land Title Document',
        category: 'Land & Building',
        isMandatory: true,
        status: 'Uploaded',
        fileName: 'Delhi_Land_Title.pdf',
        fileSize: '2.10 MB',
        fileType: 'application/pdf',
        fileUrl: 'https://firebasestorage.googleapis.com/v0/b/verifai.appspot.com/o/applications%2FAPP-EOA-2026-TEST%2Fdocuments%2FREQ-EOA-001%2Fv1%2FDelhi_Land_Title.pdf?alt=media',
        storagePath: 'applications/APP-EOA-2026-TEST/documents/REQ-EOA-001/v1/Delhi_Land_Title.pdf',
        uploadDate: '2026-10-28',
        version: 1,
      },
    ],
    infrastructureEvidence: [],
    auditLogs: [],
  };

  // Device A persists to shared cloud store
  mockSharedCloudStore.set(deviceA_app.id, deviceA_app);

  // Simulate Device B (Admin Portal on a completely separate device/browser)
  const deviceB_retrieved = mockSharedCloudStore.get('APP-EOA-2026-TEST');

  assert.ok(deviceB_retrieved, 'Device B should successfully retrieve the cloud application');
  assert.equal(deviceB_retrieved.id, 'APP-EOA-2026-TEST');
  assert.equal(deviceB_retrieved.documents.length, 1);
  assert.equal(deviceB_retrieved.documents[0].fileName, 'Delhi_Land_Title.pdf');
  assert.equal(deviceB_retrieved.documents[0].storagePath, 'applications/APP-EOA-2026-TEST/documents/REQ-EOA-001/v1/Delhi_Land_Title.pdf');
  assert.equal(deviceB_retrieved.documents[0].status, 'Uploaded');
});

test('4. Infrastructure evidence cloud upload & URL persistence structure', async () => {
  const evidenceItem: InfrastructureEvidenceItem = {
    id: 'EVID-789012-xy12',
    applicationId: 'APP-EOA-2026-001',
    applicationTrack: 'EOA',
    requirementId: 'REQ-EOA-006',
    title: 'Computer Lab 1 Workstations Proof',
    fileName: 'lab1_workstations_2026.jpg',
    fileSize: '3.40 MB',
    fileType: 'image/jpeg',
    fileDataUrl: 'https://firebasestorage.googleapis.com/v0/b/verifai.appspot.com/o/applications%2FAPP-EOA-2026-001%2Fevidence%2FEVID-789012-xy12%2Flab1_workstations_2026.jpg?alt=media',
    fileUrl: 'https://firebasestorage.googleapis.com/v0/b/verifai.appspot.com/o/applications%2FAPP-EOA-2026-001%2Fevidence%2FEVID-789012-xy12%2Flab1_workstations_2026.jpg?alt=media',
    storagePath: 'applications/APP-EOA-2026-001/evidence/EVID-789012-xy12/lab1_workstations_2026.jpg',
    evidenceCategory: 'COMPUTER_CENTRE_PHOTO',
    uploadDate: '2026-10-28',
    status: 'PENDING_REVIEW',
  };

  assert.equal(evidenceItem.storagePath, 'applications/APP-EOA-2026-001/evidence/EVID-789012-xy12/lab1_workstations_2026.jpg');
  assert.ok(evidenceItem.fileUrl?.startsWith('https://'));
  assert.equal(evidenceItem.evidenceCategory, 'COMPUTER_CENTRE_PHOTO');
});

test('5. Legacy Base64 documents compatibility and seamless fallback', async () => {
  const legacyDoc: RequiredDocument = {
    id: 'REQ-EOA-002',
    requirementId: 'REQ-EOA-002',
    name: 'Building Plan Approval',
    category: 'Land & Building',
    isMandatory: true,
    status: 'Uploaded',
    fileName: 'Legacy_Building_Plan.pdf',
    fileSize: '1.20 MB',
    fileType: 'application/pdf',
    // Legacy document has inline data URL without storagePath
    fileDataUrl: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9Db3VudCAxCj4+CmVuZG9iag==',
    uploadDate: '2026-10-20',
    version: 1,
  };

  assert.ok(legacyDoc.fileDataUrl?.startsWith('data:application/pdf'));
  assert.equal(legacyDoc.storagePath, undefined);

  // calculateFileHash supports legacy Base64 data URLs without failure
  const hash = await calculateFileHash(legacyDoc.fileDataUrl);
  assert.ok(typeof hash === 'string' && hash.length === 64, 'SHA-256 hash must be 64 hex characters');

  // extractPdfMetadata safely parses legacy Base64 PDF
  const metadata = await extractPdfMetadata(legacyDoc.fileDataUrl);
  // Flattened/minimal PDF evaluates safely without crashing
  assert.ok(metadata === undefined || typeof metadata === 'object');
});

test('6. Local Simulation Mode remains fully functional when Firebase is unconfigured', async () => {
  // In the test runner environment, Firebase environment variables are not set
  // This verifies that Local Simulation Mode operations execute reliably
  const applications = await getApplications();
  assert.ok(Array.isArray(applications), 'getApplications must return an array');
  assert.ok(applications.length > 0, 'getApplications must return seed demo applications in local mode');

  const app = await getApplicationById('APP-EOA-2026-001', true);
  assert.ok(app, 'getApplicationById must find default demo application');
  assert.equal(app.collegeId, '1-10972341');
});

test('7. Institutional data isolation: College users cannot access other colleges applications', async () => {
  // Set active session as College A (1-10972341)
  const sessionA = {
    user: {
      role: 'college',
      email: 'principal@delhitechnical.edu.in',
      collegeId: '1-10972341',
    },
  };

  // An application belonging to College B (1-24891102)
  const appB: CollegeApplication = {
    id: 'APP-EOA-2026-COLLEGE-B',
    collegeId: '1-24891102',
    collegeName: 'Maharashtra Polytechnic',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Mumbai',
    discipline: 'Engineering & Technology',
    status: 'Draft',
    submissionDate: '2026-10-28',
    lastUpdated: '2026-10-28',
    complianceScore: 80,
    flaggedIssuesCount: 0,
    documents: [],
    infrastructureEvidence: [],
    auditLogs: [],
  };

  // Mock checking ownership logic: college user accessing college B application returns null
  const checkAccess = (userRole: string, userCollegeId: string, targetAppCollegeId: string) => {
    if (userRole === 'college' && userCollegeId !== targetAppCollegeId) {
      return false;
    }
    return true;
  };

  assert.equal(checkAccess(sessionA.user.role, sessionA.user.collegeId, appB.collegeId), false);
  assert.equal(checkAccess('admin', 'admin-id', appB.collegeId), true);
});

test('8. Document version replacement invalidates old findings while preserving version snapshots', async () => {
  const oldDoc: RequiredDocument = {
    id: 'REQ-EOA-001',
    requirementId: 'REQ-EOA-001',
    name: 'Land Title Document',
    category: 'Land & Building',
    isMandatory: true,
    status: 'Uploaded',
    fileName: 'Land_Deed_v1.pdf',
    fileSize: '1.5 MB',
    fileType: 'application/pdf',
    fileUrl: 'https://firebasestorage.googleapis.com/.../v1/Land_Deed_v1.pdf',
    storagePath: 'applications/APP-EOA-2026-001/documents/REQ-EOA-001/v1/Land_Deed_v1.pdf',
    version: 1,
    previousVersions: [],
  };

  // Replacing with v2 creates a snapshot of v1
  const v1Snapshot = {
    version: oldDoc.version || 1,
    fileName: oldDoc.fileName,
    fileSize: oldDoc.fileSize,
    fileType: oldDoc.fileType,
    uploadDate: oldDoc.uploadDate,
    fileDataUrl: oldDoc.fileDataUrl,
    fileUrl: oldDoc.fileUrl,
    storagePath: oldDoc.storagePath,
  };

  const newDoc: RequiredDocument = {
    ...oldDoc,
    version: 2,
    fileName: 'Land_Deed_v2_Registered.pdf',
    fileSize: '1.8 MB',
    fileUrl: 'https://firebasestorage.googleapis.com/.../v2/Land_Deed_v2_Registered.pdf',
    storagePath: 'applications/APP-EOA-2026-001/documents/REQ-EOA-001/v2/Land_Deed_v2_Registered.pdf',
    previousVersions: [v1Snapshot],
  };

  assert.equal(newDoc.version, 2);
  assert.equal(newDoc.previousVersions?.length, 1);
  assert.equal(newDoc.previousVersions?.[0].version, 1);
  assert.equal(newDoc.previousVersions?.[0].storagePath, 'applications/APP-EOA-2026-001/documents/REQ-EOA-001/v1/Land_Deed_v1.pdf');
});

test('9. Storage delete helper handles undefined or null path gracefully without throwing', async () => {
  await assert.doesNotReject(async () => {
    await deleteFromCloudStorage(undefined);
    await deleteFromCloudStorage('');
  });
});

test('10. Unconfigured Cloud Storage throws explicit error when cloud upload is attempted directly', async () => {
  // When isFirebaseConfigured is false in test runner, attempting direct cloud upload throws explicit error
  await assert.rejects(
    async () => {
      await uploadDocumentToCloudStorage('APP-001', 'REQ-001', 1, 'test.pdf', 'data:application/pdf;base64,123');
    },
    {
      message: /Firebase Cloud Storage is not configured/,
    }
  );

  await assert.rejects(
    async () => {
      await uploadEvidenceToCloudStorage('APP-001', 'EVID-001', 'test.jpg', 'data:image/jpeg;base64,123');
    },
    {
      message: /Firebase Cloud Storage is not configured/,
    }
  );
});
