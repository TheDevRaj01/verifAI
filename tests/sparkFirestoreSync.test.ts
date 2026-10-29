import test from 'node:test';
import assert from 'node:assert/strict';

// -------------------------------------------------------------
// In-Memory Storage Setup for Node.js Test Execution
// -------------------------------------------------------------
const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => storageMap.get(k) ?? null,
  setItem: (k: string, v: any) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
  get length() {
    return storageMap.size;
  },
  key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
};

import {
  MAX_SPARK_FILE_BYTES,
  getDataUrlByteSize,
  compressImageForUpload,
  stripBinaryPayloadsForFirestore,
  uploadApplicationDocument,
  removeApplicationDocument,
  addInfrastructureEvidence,
  removeInfrastructureEvidence,
  getApplicationById,
  getApplications,
  createOrUpdateApplication,
  getApplicationFileBlob,
  initializeLocalStorage,
} from '../src/services/dataService.ts';
import type { CollegeApplication, RequiredDocument, InfrastructureEvidenceItem } from '../src/types/index.ts';

function setSession(user: { role: 'admin' | 'college'; displayName?: string; email?: string; collegeId?: string } | null) {
  if (!user) {
    storageMap.delete('verifai_active_session_v1');
  } else {
    storageMap.set('verifai_active_session_v1', JSON.stringify({ user }));
  }
}

function resetDb() {
  storageMap.clear();
  initializeLocalStorage();
}

test('1. getDataUrlByteSize accurately computes raw byte length from Base64 string', () => {
  // 100 bytes of raw data -> 136 base64 chars
  const rawBytes = 100;
  const dummyBase64 = 'A'.repeat(Math.ceil((rawBytes * 4) / 3));
  const dataUrl = `data:application/pdf;base64,${dummyBase64}`;
  
  const computed = getDataUrlByteSize(dataUrl);
  assert.ok(Math.abs(computed - rawBytes) <= 2, `Computed ${computed} should be close to ${rawBytes}`);

  // Test with empty or invalid
  assert.equal(getDataUrlByteSize(''), 0);
  assert.equal(getDataUrlByteSize('plain_text_without_comma'), Math.round(('plain_text_without_comma'.length * 3) / 4));
});

test('2. MAX_SPARK_FILE_BYTES enforces 500 KiB limit with safe margin below Firestore 1 MiB', () => {
  assert.equal(MAX_SPARK_FILE_BYTES, 512000, 'MAX_SPARK_FILE_BYTES must be 512,000 bytes (500 KiB)');
  
  // Calculate maximum Base64 expansion
  const maxBase64Chars = Math.ceil((MAX_SPARK_FILE_BYTES * 4) / 3);
  const approxDocSize = maxBase64Chars + 2000; // adding metadata overhead
  
  assert.ok(
    approxDocSize < 750000,
    `Document size with 500 KiB payload (~${approxDocSize} bytes) must be < 750,000 bytes, well below 1,048,576 bytes`
  );
  
  const safetyMarginBytes = 1048576 - approxDocSize;
  assert.ok(safetyMarginBytes > 300000, `Headroom must exceed 300 KB (actual: ${safetyMarginBytes} bytes)`);
});

test('3. uploadApplicationDocument rejects oversized non-image PDF (> 500 KiB) with clear error', async () => {
  resetDb();
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'MIT Pune' });

  // Create a 600 KiB fake payload
  const oversizedBytes = 600 * 1024;
  const oversizedBase64 = 'B'.repeat(Math.ceil((oversizedBytes * 4) / 3));
  const oversizedDataUrl = `data:application/pdf;base64,${oversizedBase64}`;

  await assert.rejects(
    async () => {
      await uploadApplicationDocument('APP-EOA-2026-001', 'REQ-EOA-001', {
        fileName: 'Massive_Land_Records.pdf',
        fileSize: '600 KB',
        fileType: 'application/pdf',
        dataUrl: oversizedDataUrl,
      });
    },
    (err: any) => {
      assert.ok(err.message.includes('exceeds the Spark Free Tier limit of 500 KB'));
      assert.ok(err.message.includes('Massive_Land_Records.pdf'));
      return true;
    }
  );
});

test('4. compressImageForUpload safely handles image data URLs and falls back gracefully in Node', async () => {
  const dummyImageDataUrl = 'data:image/jpeg;base64,' + 'C'.repeat(1000);
  const result = await compressImageForUpload(dummyImageDataUrl);
  assert.ok(typeof result === 'string');
  assert.ok(result.startsWith('data:image/'));

  // Non-image should return original
  const textDataUrl = 'data:application/pdf;base64,12345';
  const textResult = await compressImageForUpload(textDataUrl);
  assert.equal(textResult, textDataUrl);
});

test('5. stripBinaryPayloadsForFirestore ensures main application document stays lightweight (< 25 KB)', () => {
  // Create an application with multiple heavy fileDataUrls where fileBlobId is set
  const heavyData = 'data:application/pdf;base64,' + 'X'.repeat(400000);
  const testApp: CollegeApplication = {
    id: 'APP-TEST-001',
    collegeId: '1-10972341',
    collegeName: 'Test College',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Pune',
    discipline: 'Engineering',
    intakeProposed: 300,
    status: 'Submitted',
    submissionDate: '2026-10-28',
    lastUpdated: '2026-10-28',
    complianceScore: 100,
    flaggedIssuesCount: 0,
    documents: [
      {
        id: 'doc-1',
        requirementId: 'REQ-EOA-001',
        name: 'Land Deed',
        category: 'Land',
        isMandatory: true,
        status: 'Uploaded',
        fileName: 'land_deed.pdf',
        fileSize: '300 KB',
        fileType: 'application/pdf',
        fileBlobId: 'blob_REQ-EOA-001_v1_1234',
        fileDataUrl: heavyData, // Heavy Base64
        version: 1,
        previousVersions: [
          {
            version: 1,
            fileName: 'land_v0.pdf',
            fileBlobId: 'blob_REQ-EOA-001_v0_0001',
            fileDataUrl: heavyData, // Heavy Base64
          },
        ],
      },
    ],
    infrastructureEvidence: [
      {
        id: 'evid-1',
        title: 'Classroom Photo',
        fileName: 'classroom.jpg',
        fileType: 'image/jpeg',
        evidenceCategory: 'CLASSROOM_PHOTO',
        uploadDate: '2026-10-28',
        fileBlobId: 'blob_evid_1',
        fileDataUrl: heavyData, // Heavy Base64
      },
    ],
  };

  const stripped = stripBinaryPayloadsForFirestore(testApp);

  // fileDataUrl must be stripped from document, previous versions, and evidence
  assert.equal(stripped.documents[0].fileDataUrl, undefined);
  assert.equal(stripped.documents[0].fileBlobId, 'blob_REQ-EOA-001_v1_1234');
  assert.equal(stripped.documents[0].previousVersions![0].fileDataUrl, undefined);
  assert.equal(stripped.documents[0].previousVersions![0].fileBlobId, 'blob_REQ-EOA-001_v0_0001');
  assert.equal(stripped.infrastructureEvidence![0].fileDataUrl, undefined);
  assert.equal(stripped.infrastructureEvidence![0].fileBlobId, 'blob_evid_1');

  // Verify JSON size of sanitized document is tiny (< 25 KB)
  const jsonSize = Buffer.byteLength(JSON.stringify(stripped), 'utf8');
  assert.ok(jsonSize < 25000, `Stripped application size (${jsonSize} bytes) must be < 25 KB`);
});

test('6. Institutional data isolation: College A cannot upload documents to College B dossier', async () => {
  resetDb();
  // Active session as College A (MIT Pune: 1-10972341)
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'MIT Pune' });

  // Attempt upload to College B's application (COEP: 1-24891102)
  await assert.rejects(
    async () => {
      await uploadApplicationDocument('APP-EOA-2026-002', 'REQ-EOA-001', {
        fileName: 'Unauthorized_Upload.pdf',
        fileSize: '50 KB',
        fileType: 'application/pdf',
        dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK...',
      });
    },
    (err: any) => {
      assert.ok(err.message.includes('Access Denied'));
      return true;
    }
  );
});

test('7. Institutional data isolation: College A cannot add infrastructure evidence to College B dossier', async () => {
  resetDb();
  // Active session as College A (MIT Pune: 1-10972341)
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'MIT Pune' });

  await assert.rejects(
    async () => {
      await addInfrastructureEvidence('APP-EOA-2026-002', {
        title: 'Tampered Evidence',
        fileName: 'tampered.jpg',
        fileType: 'image/jpeg',
        evidenceCategory: 'CLASSROOM_PHOTO',
        fileDataUrl: 'data:image/jpeg;base64,123',
      });
    },
    (err: any) => {
      assert.ok(err.message.includes('Access Denied'));
      return true;
    }
  );
});

test('8. Lifecycle Status Guard: Cannot add or remove evidence on an Approved application', async () => {
  resetDb();
  // Active session as MIT Pune
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'MIT Pune' });

  // First change APP-EOA-2026-001 to Approved in local simulation to test lifecycle guard
  const app = await getApplicationById('APP-EOA-2026-001', true);
  assert.ok(app);
  app.status = 'Approved';
  await createOrUpdateApplication(app);

  await assert.rejects(
    async () => {
      await addInfrastructureEvidence('APP-EOA-2026-001', {
        title: 'Late Evidence',
        fileName: 'photo.jpg',
        fileType: 'image/jpeg',
        evidenceCategory: 'CAMPUS_ENTRANCE_PHOTO',
        fileDataUrl: 'data:image/jpeg;base64,123',
      });
    },
    (err: any) => {
      assert.ok(err.message.includes('Action Prohibited') || err.message.includes('Approved'));
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await removeInfrastructureEvidence('APP-EOA-2026-001', 'any-evidence-id');
    },
    (err: any) => {
      assert.ok(err.message.includes('Action Prohibited') || err.message.includes('Approved'));
      return true;
    }
  );
});

test('9. Local Simulation Mode remains 100% operational when Firebase is unconfigured', async () => {
  resetDb();
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'MIT Pune' });

  // Upload valid document < 500 KiB in simulation mode
  const validDataUrl = 'data:application/pdf;base64,' + 'A'.repeat(5000);
  const updatedApp = await uploadApplicationDocument('APP-EOA-2026-001', 'REQ-EOA-002', {
    fileName: 'Fire_Safety_Certificate_2026.pdf',
    fileSize: '4 KB',
    fileType: 'application/pdf',
    dataUrl: validDataUrl,
  });

  assert.ok(updatedApp);
  const doc = updatedApp.documents.find((d) => d.requirementId === 'REQ-EOA-002');
  assert.ok(doc);
  assert.equal(doc.status, 'Uploaded');
  assert.equal(doc.fileName, 'Fire_Safety_Certificate_2026.pdf');
  assert.ok(doc.fileBlobId);

  // Retrieve via getApplicationFileBlob
  const retrieved = await getApplicationFileBlob(updatedApp.id, doc.fileBlobId!);
  assert.equal(retrieved, validDataUrl);
});

test('10. Document replacement preserves old version in previousVersions with fileBlobId intact', async () => {
  resetDb();
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'MIT Pune' });

  const v1Data = 'data:application/pdf;base64,' + '1'.repeat(2000);
  const appV1 = await uploadApplicationDocument('APP-EOA-2026-001', 'REQ-EOA-004', {
    fileName: 'Structural_Stability_v1.pdf',
    fileSize: '2 KB',
    fileType: 'application/pdf',
    dataUrl: v1Data,
  });

  const docV1 = appV1.documents.find((d) => d.requirementId === 'REQ-EOA-004');
  assert.ok(docV1);
  const v1BlobId = docV1.fileBlobId;

  // Replace with v2
  const v2Data = 'data:application/pdf;base64,' + '2'.repeat(2500);
  const appV2 = await uploadApplicationDocument('APP-EOA-2026-001', 'REQ-EOA-004', {
    fileName: 'Structural_Stability_v2.pdf',
    fileSize: '2.5 KB',
    fileType: 'application/pdf',
    dataUrl: v2Data,
  });

  const docV2 = appV2.documents.find((d) => d.requirementId === 'REQ-EOA-004');
  assert.ok(docV2);
  assert.equal(docV2.version, (docV1.version || 1) + 1);
  assert.ok(docV2.previousVersions && docV2.previousVersions.length > 0);
  
  const snapshot = docV2.previousVersions[docV2.previousVersions.length - 1];
  assert.equal(snapshot.fileName, 'Structural_Stability_v1.pdf');
  assert.equal(snapshot.fileBlobId, v1BlobId);
});

test('11. stripBinaryPayloadsForFirestore strips undefined fields to prevent Firestore setDoc errors', () => {
  const newAppWithUndefined: any = {
    id: 'APP-NEW_APPROVAL-2026-138',
    collegeId: '1-24891102',
    collegeName: 'Maharashtra Polytechnic & Technology Academy',
    type: 'NEW_APPROVAL',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Pune',
    discipline: 'Engineering & Technology',
    intakeApprovedLastYear: undefined, // Must be stripped!
    intakeProposed: 300,
    status: 'Draft',
    submissionDate: '2026-10-29',
    lastUpdated: '2026-10-29',
    complianceScore: 85,
    flaggedIssuesCount: 0,
    documents: [
      {
        id: 'REQ-NEW-001',
        requirementId: 'REQ-NEW-001',
        name: 'Society Registration',
        category: 'Institutional Details',
        isMandatory: true,
        status: 'Uploaded',
        fileName: 'trust_registration.pdf',
        fileSize: '150 KB',
        fileType: 'application/pdf',
        fileBlobId: 'blob_REQ-NEW-001_v1_9999',
        fileDataUrl: 'data:application/pdf;base64,AAAA',
        version: 1,
        fileUrl: undefined, // Must be stripped!
        ocrResult: undefined, // Must be stripped!
        previousVersions: [],
      },
    ],
    auditLogs: [],
    declaredInfrastructure: undefined, // Must be stripped!
  };

  const stripped = stripBinaryPayloadsForFirestore(newAppWithUndefined);

  // Assert undefined fields were eliminated
  assert.strictEqual('intakeApprovedLastYear' in stripped, false, 'intakeApprovedLastYear must not exist in payload');
  assert.strictEqual('declaredInfrastructure' in stripped, false, 'declaredInfrastructure must not exist in payload');
  assert.strictEqual('fileDataUrl' in stripped.documents[0], false, 'fileDataUrl must be stripped');
  assert.strictEqual('ocrResult' in stripped.documents[0], false, 'ocrResult must not exist in document');
  assert.strictEqual('fileUrl' in stripped.documents[0], false, 'fileUrl must not exist in document');
  
  // Verify deep scan: no undefined value exists anywhere in the resulting object
  const jsonStr = JSON.stringify(stripped);
  assert.ok(!jsonStr.includes(':undefined'));
});

test('12. uploadApplicationDocument succeeds on applications in Under Scrutiny status', async () => {
  resetDb();
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'Delhi Institute of Engineering' });

  // Baseline application APP-EOA-2026-001 has status 'Under Scrutiny'
  const appBefore = await getApplicationById('APP-EOA-2026-001');
  assert.ok(appBefore, 'APP-EOA-2026-001 must exist');
  assert.strictEqual(appBefore.status, 'Under Scrutiny');

  // Upload missing requirement REQ-EOA-003
  const dummyDataUrl = 'data:application/pdf;base64,' + 'M'.repeat(2000);
  const updated = await uploadApplicationDocument('APP-EOA-2026-001', 'REQ-EOA-003', {
    fileName: 'structural_stability_dieat.pdf',
    fileSize: '45 KB',
    fileType: 'application/pdf',
    dataUrl: dummyDataUrl,
  });

  assert.ok(updated, 'Update must return updated application');
  const uploadedDoc = updated.documents.find((d) => d.requirementId === 'REQ-EOA-003' || d.id === 'REQ-EOA-003');
  assert.ok(uploadedDoc, 'Uploaded document must exist for REQ-EOA-003');
  assert.strictEqual(uploadedDoc.status, 'Uploaded');
  assert.strictEqual(uploadedDoc.fileName, 'structural_stability_dieat.pdf');
  assert.strictEqual(uploadedDoc.requirementId, 'REQ-EOA-003');

  // Verify audit log was recorded
  assert.ok(
    updated.auditLogs.some((l) => l.action === 'DOCUMENT_UPLOADED' && l.details.includes('Structural Stability Certificate'))
  );
});

test('13. Admin and checklist matching properly resolves uploaded documents by requirementId or id', async () => {
  resetDb();
  const app = await getApplicationById('APP-EOA-2026-001');
  assert.ok(app);

  // APP-EOA-2026-001 has documents with legacy IDs ('doc-1', 'doc-2', 'doc-3', 'doc-4')
  // mapped to requirements: REQ-EOA-006, REQ-EOA-004, REQ-EOA-001, REQ-EOA-002
  const matchDoc1 = app.documents.find((d) => d.id === 'REQ-EOA-001' || d.requirementId === 'REQ-EOA-001');
  assert.ok(matchDoc1, 'Must match doc-3 via requirementId REQ-EOA-001');
  assert.strictEqual(matchDoc1.id, 'doc-3');

  const matchDoc2 = app.documents.find((d) => d.id === 'REQ-EOA-002' || d.requirementId === 'REQ-EOA-002');
  assert.ok(matchDoc2, 'Must match doc-4 via requirementId REQ-EOA-002');
  assert.strictEqual(matchDoc2.id, 'doc-4');

  // REQ-EOA-003 is initially missing
  const matchDoc3 = app.documents.find((d) => d.id === 'REQ-EOA-003' || d.requirementId === 'REQ-EOA-003');
  assert.strictEqual(matchDoc3, undefined, 'REQ-EOA-003 must be missing initially');
});

test('14. Resilient local-first dual storage preserves uploaded documents across cloud sync boundaries', async () => {
  resetDb();
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'Delhi Institute of Engineering' });

  const dummyDataUrl = 'data:application/pdf;base64,' + 'Z'.repeat(1500);
  const updated = await uploadApplicationDocument('APP-EOA-2026-001', 'REQ-EOA-005', {
    fileName: 'fire_safety_noc_2026.pdf',
    fileSize: '32 KB',
    fileType: 'application/pdf',
    dataUrl: dummyDataUrl,
  });

  assert.ok(updated);
  assert.ok(updated.documents.some((d) => d.requirementId === 'REQ-EOA-005' && d.fileName === 'fire_safety_noc_2026.pdf'));

  // Switch to admin session
  setSession({ role: 'admin', email: 'admin@aicte.gov.in', displayName: 'Central Scrutiny Officer' });

  // Admin retrieves the application dossier
  const adminApp = await getApplicationById('APP-EOA-2026-001', true);
  assert.ok(adminApp, 'Admin must be able to load application');
  const uploadedInAdmin = adminApp.documents.find((d) => d.requirementId === 'REQ-EOA-005');
  assert.ok(uploadedInAdmin, 'Uploaded document must be present in admin dossier');
  assert.strictEqual(uploadedInAdmin.fileName, 'fire_safety_noc_2026.pdf');
  assert.strictEqual(uploadedInAdmin.status, 'Uploaded');
});

test('15. Newly uploaded institution documents are visible in Admin getApplications overview', async () => {
  resetDb();
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'Delhi Institute of Engineering' });

  const dummyDataUrl = 'data:application/pdf;base64,' + 'P'.repeat(1800);
  await uploadApplicationDocument('APP-EOA-2026-001', 'REQ-EOA-003', {
    fileName: 'stability_cert_2026.pdf',
    fileSize: '28 KB',
    fileType: 'application/pdf',
    dataUrl: dummyDataUrl,
  });

  // Switch to AICTE administrator session
  setSession({ role: 'admin', email: 'admin@aicte.gov.in', displayName: 'AICTE Administrator' });

  const allApps = await getApplications({ type: 'EOA' });
  const eoaApp = allApps.find((a) => a.id === 'APP-EOA-2026-001');
  assert.ok(eoaApp, 'EOA application must be listed in admin overview');

  const doc = eoaApp.documents.find((d) => d.requirementId === 'REQ-EOA-003' || d.fileName === 'stability_cert_2026.pdf');
  assert.ok(doc, 'Uploaded stability certificate must be present in admin application overview');
  assert.strictEqual(doc.status, 'Uploaded');
  assert.strictEqual(doc.fileName, 'stability_cert_2026.pdf');
});
