import test from 'node:test';
import assert from 'node:assert';

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
  canApplicationBeDocumentsVerified,
  reviewApplicationDocument,
  submitCollegeApplication,
  uploadApplicationDocument,
  removeApplicationDocument,
  updateApplicationStatus,
  getChecklistRequirements,
  getApplicationById,
  createOrUpdateApplication,
  saveDocumentOcrResult,
  saveDocumentValidationResult,
  checkDocumentDuplicates,
  initializeLocalStorage,
} from '../src/services/dataService.ts';
import {
  calculateFileHash,
  calculateTextSimilarity,
  normalizeCertificateNumber,
  normalizeAuthority,
  detectDocumentDuplicates,
  checkPreUploadDuplicate,
} from '../src/services/duplicateDetectionService.ts';
import type {
  CollegeApplication,
  RequiredDocument,
} from '../src/types/index.ts';

// Helper to set mock user session
function setSession(user: { role: 'admin' | 'college'; displayName?: string; email?: string; collegeId?: string } | null) {
  if (!user) {
    storageMap.delete('verifai_active_session_v1');
  } else {
    storageMap.set('verifai_active_session_v1', JSON.stringify({ user }));
  }
}

// Reset state before tests
function setupFreshDatabase() {
  storageMap.clear();
  initializeLocalStorage();
}

// Deterministic test data payloads
const sampleFileA = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 Mock Binary PDF File A Content').toString('base64');
const sampleFileB = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 Mock Binary PDF File B Content - Distinct File').toString('base64');
const sampleFileC = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 Mock Binary PDF File C Content - Third Unique File').toString('base64');

// -------------------------------------------------------------
// Test 1: Same file uploaded twice -> Exact Duplicate
// -------------------------------------------------------------
test('1. Same file uploaded twice produces EXACT_DUPLICATE via cryptographic SHA-256 hash', async () => {
  setupFreshDatabase();
  setSession({ role: 'college', collegeId: '1-10972341' });

  const testApp: CollegeApplication = {
    id: 'APP-DUP-001',
    collegeId: '1-10972341',
    collegeName: 'Delhi Institute of Engineering',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering',
    status: 'Draft',
    complianceScore: 0,
    documents: [],
    lastUpdated: '2026-05-01',
  };
  await createOrUpdateApplication(testApp);

  // Upload sampleFileA to REQ-EOA-001
  const appAfterFirst = await uploadApplicationDocument('APP-DUP-001', 'REQ-EOA-001', {
    fileName: 'fire_safety_cert.pdf',
    fileSize: '120 KB',
    fileType: 'application/pdf',
    dataUrl: sampleFileA,
  });

  const firstDoc = appAfterFirst.documents.find((d) => d.id === 'REQ-EOA-001');
  assert.ok(firstDoc?.fileHash, 'First document must have computed SHA-256 hash');
  assert.strictEqual(firstDoc?.duplicateCheckResult?.status, 'UNIQUE', 'First document alone must be UNIQUE');

  // Upload identical sampleFileA to REQ-EOA-002
  const appAfterSecond = await uploadApplicationDocument('APP-DUP-001', 'REQ-EOA-002', {
    fileName: 'structural_stability.pdf',
    fileSize: '120 KB',
    fileType: 'application/pdf',
    dataUrl: sampleFileA,
  });

  const secondDoc = appAfterSecond.documents.find((d) => d.id === 'REQ-EOA-002');
  assert.ok(secondDoc?.fileHash, 'Second document must have fileHash');
  assert.strictEqual(secondDoc?.fileHash, firstDoc?.fileHash, 'Both hashes must match exactly');
  assert.strictEqual(secondDoc?.duplicateCheckResult?.status, 'EXACT_DUPLICATE', 'Duplicate detection must flag EXACT_DUPLICATE');
  assert.strictEqual(secondDoc?.duplicateCheckResult?.matches[0].method, 'file_hash');
  assert.strictEqual(secondDoc?.duplicateCheckResult?.matches[0].matchedDocumentId, 'REQ-EOA-001');
});

// -------------------------------------------------------------
// Test 2: Same file with different filename -> Exact Duplicate
// -------------------------------------------------------------
test('2. Same file with a different filename is accurately detected as EXACT_DUPLICATE', async () => {
  setupFreshDatabase();
  setSession({ role: 'college', collegeId: '1-10972341' });

  const testApp: CollegeApplication = {
    id: 'APP-DUP-002',
    collegeId: '1-10972341',
    collegeName: 'Delhi Institute of Engineering',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering',
    status: 'Draft',
    complianceScore: 0,
    documents: [],
    lastUpdated: '2026-05-01',
  };
  await createOrUpdateApplication(testApp);

  // Upload with name "original_name.pdf"
  await uploadApplicationDocument('APP-DUP-002', 'REQ-EOA-001', {
    fileName: 'original_name.pdf',
    fileSize: '85 KB',
    fileType: 'application/pdf',
    dataUrl: sampleFileB,
  });

  // Upload identical content with completely different name "completely_renamed_scan_v2.pdf"
  const appAfter = await uploadApplicationDocument('APP-DUP-002', 'REQ-EOA-003', {
    fileName: 'completely_renamed_scan_v2.pdf',
    fileSize: '85 KB',
    fileType: 'application/pdf',
    dataUrl: sampleFileB,
  });

  const renamedDoc = appAfter.documents.find((d) => d.id === 'REQ-EOA-003');
  assert.strictEqual(renamedDoc?.duplicateCheckResult?.status, 'EXACT_DUPLICATE');
  assert.strictEqual(renamedDoc?.duplicateCheckResult?.matches[0].method, 'file_hash');
  assert.ok(renamedDoc?.duplicateCheckResult?.matches[0].reason.includes('Exact cryptographic match'));
});

// -------------------------------------------------------------
// Test 3: Same certificate number and issuing authority -> Likely Duplicate
// -------------------------------------------------------------
test('3. Matching certificate number and issuing authority produces LIKELY_DUPLICATE', async () => {
  setupFreshDatabase();

  const app: CollegeApplication = {
    id: 'APP-DUP-003',
    collegeId: '1-10972341',
    collegeName: 'Maharashtra Polytechnic',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Pune',
    discipline: 'Engineering',
    status: 'Submitted',
    complianceScore: 100,
    documents: [
      {
        id: 'REQ-EOA-001',
        name: 'Fire Safety Certificate',
        category: 'Safety',
        isMandatory: true,
        status: 'Uploaded',
        fileHash: 'hash-aaa-111',
        fileName: 'fire_cert_1.pdf',
        fileDataUrl: sampleFileA,
        extractedText: 'Government of Maharashtra Directorate of Fire Services. Certificate No: FS/MH/2026/89421. Issued for educational building safety.',
        ocrResult: {
          text: 'Government of Maharashtra Directorate of Fire Services. Certificate No: FS/MH/2026/89421. Issued for educational building safety.',
          method: 'native_pdf',
          extractedAt: '2026-05-01',
          charCount: 120,
          wordCount: 18,
        },
      },
    ],
    lastUpdated: '2026-05-01',
  };

  // Target doc with distinct file hash but identical certificate number and issuing authority
  const targetDoc: RequiredDocument = {
    id: 'REQ-EOA-002',
    name: 'Building Safety NOC',
    category: 'Safety',
    isMandatory: true,
    status: 'Uploaded',
    fileHash: 'hash-bbb-222',
    fileName: 'fire_cert_different_scan.pdf',
    fileDataUrl: sampleFileB,
    extractedText: 'Dept of Fire Services Govt of Maharashtra. Ref No: FS-MH-2026-89421. Validated building compliance.',
    ocrResult: {
      text: 'Dept of Fire Services Govt of Maharashtra. Ref No: FS-MH-2026-89421. Validated building compliance.',
      method: 'native_pdf',
      extractedAt: '2026-05-01',
      charCount: 110,
      wordCount: 16,
    },
  };

  const result = await detectDocumentDuplicates(targetDoc, app, [app]);
  assert.strictEqual(result.status, 'LIKELY_DUPLICATE');
  assert.strictEqual(result.matches[0].method, 'certificate_info');
  assert.strictEqual(result.matches[0].matchedDocumentId, 'REQ-EOA-001');
  assert.ok(result.matches[0].reason.includes('Matching certificate reference'));
});

// -------------------------------------------------------------
// Test 4: Different certificate numbers -> Not classified as duplicate
// -------------------------------------------------------------
test('4. Different certificate numbers must NOT be declared duplicate based on college or doc type alone', async () => {
  setupFreshDatabase();

  const app: CollegeApplication = {
    id: 'APP-DUP-004',
    collegeId: '1-10972341',
    collegeName: 'Maharashtra Polytechnic',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Pune',
    discipline: 'Engineering',
    status: 'Submitted',
    complianceScore: 100,
    documents: [
      {
        id: 'REQ-EOA-001',
        name: 'Fire Safety Certificate',
        category: 'Safety',
        isMandatory: true,
        status: 'Uploaded',
        fileHash: 'hash-1111',
        fileName: 'cert_block_a.pdf',
        fileDataUrl: sampleFileA,
        extractedText: 'Directorate of Fire Services Government of Maharashtra. Certificate No: FS-MH-2026-0001 for Block A.',
        ocrResult: {
          text: 'Directorate of Fire Services Government of Maharashtra. Certificate No: FS-MH-2026-0001 for Block A.',
          method: 'native_pdf',
          extractedAt: '2026-05-01',
          charCount: 105,
          wordCount: 15,
        },
      },
    ],
    lastUpdated: '2026-05-01',
  };

  // Target doc has DIFFERENT certificate number (FS-MH-2026-0002)
  const targetDoc: RequiredDocument = {
    id: 'REQ-EOA-002',
    name: 'Fire Safety Certificate - Block B',
    category: 'Safety',
    isMandatory: true,
    status: 'Uploaded',
    fileHash: 'hash-2222',
    fileName: 'cert_block_b.pdf',
    fileDataUrl: sampleFileB,
    extractedText: 'Directorate of Fire Services Government of Maharashtra. Certificate No: FS-MH-2026-0002 for Block B.',
    ocrResult: {
      text: 'Directorate of Fire Services Government of Maharashtra. Certificate No: FS-MH-2026-0002 for Block B.',
      method: 'native_pdf',
      extractedAt: '2026-05-01',
      charCount: 105,
      wordCount: 15,
    },
  };

  const result = await detectDocumentDuplicates(targetDoc, app, [app]);
  // Must NOT be declared EXACT_DUPLICATE or LIKELY_DUPLICATE
  assert.notStrictEqual(result.status, 'EXACT_DUPLICATE');
  assert.notStrictEqual(result.status, 'LIKELY_DUPLICATE');
  assert.strictEqual(
    result.matches.some((m) => m.method === 'certificate_info'),
    false,
    'Must not produce a certificate_info match when cert numbers differ'
  );
});

// -------------------------------------------------------------
// Test 5: Highly similar OCR text (>= 80%) -> Possible Duplicate
// -------------------------------------------------------------
test('5. Highly similar OCR text (>= 80%) produces POSSIBLE_DUPLICATE advisory warning', async () => {
  setupFreshDatabase();

  const longTextA = `This is a formal statutory structural stability certificate issued by the competent municipal engineer
to certify that the academic block infrastructure of National College of Engineering has undergone comprehensive physical
inspection and ultrasonic pulse velocity testing, confirming high strength structural safety under seismic zone guidelines for 2026.`;

  const longTextB = `This is a formal statutory structural stability certificate issued by the competent municipal engineer
to certify that the academic block infrastructure of National College of Engineering has undergone comprehensive physical
inspection and ultrasonic pulse velocity testing, confirming high strength structural safety under seismic zone regulations for 2026.`;

  const sim = calculateTextSimilarity(longTextA, longTextB);
  assert.ok(sim >= 0.85, `Similarity must exceed 85%, got: ${sim}`);

  const app: CollegeApplication = {
    id: 'APP-DUP-005',
    collegeId: '1-10972341',
    collegeName: 'National College of Engineering',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering',
    status: 'Submitted',
    complianceScore: 100,
    documents: [
      {
        id: 'REQ-EOA-001',
        name: 'Structural Stability Certificate',
        category: 'Safety',
        isMandatory: true,
        status: 'Uploaded',
        fileHash: 'hash-doc-a',
        fileName: 'stability_doc_1.pdf',
        fileDataUrl: sampleFileA,
        extractedText: longTextA,
        ocrResult: {
          text: longTextA,
          method: 'tesseract',
          extractedAt: '2026-05-01',
          charCount: longTextA.length,
          wordCount: 50,
        },
      },
    ],
    lastUpdated: '2026-05-01',
  };

  const targetDoc: RequiredDocument = {
    id: 'REQ-EOA-002',
    name: 'Building Completion Stability',
    category: 'Safety',
    isMandatory: true,
    status: 'Uploaded',
    fileHash: 'hash-doc-b', // Distinct file
    fileName: 'stability_doc_2.pdf',
    fileDataUrl: sampleFileB,
    extractedText: longTextB,
    ocrResult: {
      text: longTextB,
      method: 'tesseract',
      extractedAt: '2026-05-01',
      charCount: longTextB.length,
      wordCount: 50,
    },
  };

  const result = await detectDocumentDuplicates(targetDoc, app, [app]);
  assert.strictEqual(result.status, 'POSSIBLE_DUPLICATE', 'High text similarity must produce POSSIBLE_DUPLICATE');
  assert.strictEqual(result.matches[0].method, 'ocr_similarity');
  assert.ok(result.matches[0].similarityScore! >= 0.8);
  assert.notStrictEqual(result.status, 'EXACT_DUPLICATE', 'Text similarity alone must not produce EXACT_DUPLICATE');
});

// -------------------------------------------------------------
// Test 6: Generic similar boilerplate text below threshold -> UNIQUE
// -------------------------------------------------------------
test('6. Different documents with generic similar boilerplate text below threshold produce UNIQUE verdict', async () => {
  setupFreshDatabase();

  const textFire = `Government of Karnataka Fire Department NOC. The institutional building complies with standard
water hydrant guidelines, alarm bells, and smoke detectors for higher education campuses.`;

  const textLand = `Registered Land Title Conveyance Deed. 5.5 acres of clear title educational land situated in Bangalore urban
district registered with the Sub-Registrar office for 99-year perpetual lease.`;

  const sim = calculateTextSimilarity(textFire, textLand);
  assert.ok(sim < 0.4, `Boilerplate similarity should be low, got: ${sim}`);

  const app: CollegeApplication = {
    id: 'APP-DUP-006',
    collegeId: '1-10972341',
    collegeName: 'Bangalore Tech Institute',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Karnataka',
    district: 'Bangalore',
    discipline: 'Engineering',
    status: 'Submitted',
    complianceScore: 100,
    documents: [
      {
        id: 'REQ-EOA-001',
        name: 'Fire Safety Certificate',
        category: 'Safety',
        isMandatory: true,
        status: 'Uploaded',
        fileHash: 'hash-fire-cert',
        fileName: 'fire.pdf',
        fileDataUrl: sampleFileA,
        extractedText: textFire,
        ocrResult: { text: textFire, method: 'native_pdf', extractedAt: '2026-05-01', charCount: textFire.length, wordCount: 25 },
      },
    ],
    lastUpdated: '2026-05-01',
  };

  const targetDoc: RequiredDocument = {
    id: 'REQ-EOA-002',
    name: 'Land Title Deed',
    category: 'Land',
    isMandatory: true,
    status: 'Uploaded',
    fileHash: 'hash-land-deed',
    fileName: 'land.pdf',
    fileDataUrl: sampleFileB,
    extractedText: textLand,
    ocrResult: { text: textLand, method: 'native_pdf', extractedAt: '2026-05-01', charCount: textLand.length, wordCount: 25 },
  };

  const result = await detectDocumentDuplicates(targetDoc, app, [app]);
  assert.strictEqual(result.status, 'UNIQUE');
  assert.strictEqual(result.matches.length, 0);
});

// -------------------------------------------------------------
// Test 7: Replacement upload -> Old duplicate results refreshed
// -------------------------------------------------------------
test('7. Replacement upload refreshes duplicate detection results with new file findings', async () => {
  setupFreshDatabase();
  setSession({ role: 'college', collegeId: '1-10972341' });

  const testApp: CollegeApplication = {
    id: 'APP-DUP-007',
    collegeId: '1-10972341',
    collegeName: 'Delhi Institute of Engineering',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering',
    status: 'Draft',
    complianceScore: 0,
    documents: [],
    lastUpdated: '2026-05-01',
  };
  await createOrUpdateApplication(testApp);

  // 1. Upload sampleFileA to REQ-EOA-001
  await uploadApplicationDocument('APP-DUP-007', 'REQ-EOA-001', {
    fileName: 'fire_cert.pdf',
    fileSize: '100 KB',
    fileType: 'application/pdf',
    dataUrl: sampleFileA,
  });

  // 2. Upload identical sampleFileA to REQ-EOA-002 -> Flagged as EXACT_DUPLICATE
  const appStep2 = await uploadApplicationDocument('APP-DUP-007', 'REQ-EOA-002', {
    fileName: 'accidentally_same_file.pdf',
    fileSize: '100 KB',
    fileType: 'application/pdf',
    dataUrl: sampleFileA,
  });

  const docBeforeReplace = appStep2.documents.find((d) => d.id === 'REQ-EOA-002');
  assert.strictEqual(docBeforeReplace?.duplicateCheckResult?.status, 'EXACT_DUPLICATE');

  // 3. Now replace REQ-EOA-002 with unique sampleFileC
  const appStep3 = await uploadApplicationDocument('APP-DUP-007', 'REQ-EOA-002', {
    fileName: 'correct_structural_cert.pdf',
    fileSize: '95 KB',
    fileType: 'application/pdf',
    dataUrl: sampleFileC,
  });

  const docAfterReplace = appStep3.documents.find((d) => d.id === 'REQ-EOA-002');
  assert.strictEqual(docAfterReplace?.version, 2, 'Document version must increment to 2 on replacement');
  assert.notStrictEqual(docAfterReplace?.fileHash, docBeforeReplace?.fileHash, 'File hash must be updated');
  assert.strictEqual(docAfterReplace?.duplicateCheckResult?.status, 'UNIQUE', 'Old duplicate flag must be refreshed to UNIQUE');
});

// -------------------------------------------------------------
// Test 8: Document not compared against itself
// -------------------------------------------------------------
test('8. A document is not compared against its own current version', async () => {
  setupFreshDatabase();

  const doc: RequiredDocument = {
    id: 'REQ-EOA-001',
    requirementId: 'REQ-EOA-001',
    name: 'Fire Safety Certificate',
    category: 'Safety',
    isMandatory: true,
    status: 'Uploaded',
    version: 1,
    fileHash: 'exact-hash-abc-123',
    fileName: 'fire_safety.pdf',
    fileDataUrl: sampleFileA,
    extractedText: 'AICTE Fire Safety Certificate Reference FS-2026-999. Directorate of Fire Services.',
    ocrResult: {
      text: 'AICTE Fire Safety Certificate Reference FS-2026-999. Directorate of Fire Services.',
      method: 'native_pdf',
      extractedAt: '2026-05-01',
      charCount: 85,
      wordCount: 12,
    },
  };

  const app: CollegeApplication = {
    id: 'APP-DUP-008',
    collegeId: '1-10972341',
    collegeName: 'Delhi Institute of Engineering',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering',
    status: 'Submitted',
    complianceScore: 100,
    documents: [doc], // Application only contains this single document
    lastUpdated: '2026-05-01',
  };

  const result = await detectDocumentDuplicates(doc, app, [app]);
  assert.strictEqual(result.status, 'UNIQUE', 'A single document evaluated against itself must remain UNIQUE');
  assert.strictEqual(result.matches.length, 0, 'No self-matches allowed');
});

// -------------------------------------------------------------
// Test 9: EoA and New Approval isolation preserved
// -------------------------------------------------------------
test('9. EoA and New Approval workflows continue functioning independently while cross-app duplicate check captures context', async () => {
  setupFreshDatabase();
  setSession({ role: 'college', collegeId: '1-10972341' });

  // 1. Create previous New Approval application
  const newApp: CollegeApplication = {
    id: 'APP-NEW-001',
    collegeId: '1-10972341',
    collegeName: 'Apex Institute of Technology',
    type: 'NEW_APPROVAL',
    academicYear: '2025-2026',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering',
    status: 'Documents Verified',
    complianceScore: 100,
    documents: [],
    lastUpdated: '2025-06-01',
  };
  await createOrUpdateApplication(newApp);

  await uploadApplicationDocument('APP-NEW-001', 'REQ-NEW-001', {
    fileName: 'society_registration.pdf',
    fileSize: '150 KB',
    fileType: 'application/pdf',
    dataUrl: sampleFileA,
  });

  // 2. Create current EoA application
  const eoaApp: CollegeApplication = {
    id: 'APP-EOA-001',
    collegeId: '1-10972341',
    collegeName: 'Apex Institute of Technology',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering',
    status: 'Draft',
    complianceScore: 0,
    documents: [],
    lastUpdated: '2026-05-01',
  };
  await createOrUpdateApplication(eoaApp);

  // 3. Upload same file to EoA requirement
  const updatedEoaApp = await uploadApplicationDocument('APP-EOA-001', 'REQ-EOA-001', {
    fileName: 'society_registration_copy.pdf',
    fileSize: '150 KB',
    fileType: 'application/pdf',
    dataUrl: sampleFileA,
  });

  const eoaDoc = updatedEoaApp.documents.find((d) => d.id === 'REQ-EOA-001');
  assert.strictEqual(eoaDoc?.duplicateCheckResult?.status, 'EXACT_DUPLICATE');
  assert.strictEqual(eoaDoc?.duplicateCheckResult?.matches[0].matchedApplicationId, 'APP-NEW-001');
  assert.strictEqual(eoaDoc?.duplicateCheckResult?.matches[0].matchedApplicationType, 'NEW_APPROVAL');

  // Verify checklists remain distinct
  const eoaReqs = await getChecklistRequirements('EOA', false);
  const newReqs = await getChecklistRequirements('NEW_APPROVAL', false);
  assert.notStrictEqual(eoaReqs.length, newReqs.length, 'EOA and NEW_APPROVAL have separate checklists');
  assert.ok(eoaReqs.some((r) => r.id === 'REQ-EOA-001'));
  assert.ok(newReqs.some((r) => r.id === 'REQ-NEW-001'));
});

// -------------------------------------------------------------
// Test 10: Existing upload, review, and verification gates unchanged
// -------------------------------------------------------------
test('10. Existing upload, OCR, review actions, and canApplicationBeDocumentsVerified gates remain completely intact', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'AICTE Scrutiny Officer' });

  // Get active EOA requirements
  const eoaReqs = await getChecklistRequirements('EOA', false);
  const activeMandatory = eoaReqs.filter((r) => r.isActive && r.isMandatory);

  // Create an application with all mandatory documents uploaded
  const testDocs: RequiredDocument[] = activeMandatory.map((r, i) => ({
    id: r.id,
    requirementId: r.id,
    name: r.title,
    category: r.category,
    isMandatory: true,
    status: 'Uploaded',
    fileName: `doc_${i}.pdf`,
    fileSize: '100 KB',
    fileDataUrl: 'data:application/pdf;base64,' + Buffer.from(`unique-content-${i}`).toString('base64'),
    fileHash: `hash-test-${i}`,
  }));

  const testApp: CollegeApplication = {
    id: 'APP-GATE-001',
    collegeId: '1-10972341',
    collegeName: 'Delhi Institute of Engineering',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering',
    status: 'Submitted',
    complianceScore: 100,
    documents: testDocs,
    lastUpdated: '2026-05-01',
  };
  await createOrUpdateApplication(testApp);

  // Initially in Submitted status but documents are only 'Uploaded', not 'Accepted'
  const checkInitial = await canApplicationBeDocumentsVerified(testApp);
  assert.strictEqual(checkInitial.canVerify, false, 'Cannot verify while documents are unreviewed');

  // Accept all documents one by one using reviewApplicationDocument
  let currentApp = testApp;
  for (const doc of testDocs) {
    currentApp = await reviewApplicationDocument(currentApp.id, doc.id, { status: 'Accepted' });
  }

  // Now all mandatory documents are accepted
  assert.strictEqual(
    currentApp.status,
    'Documents Verified',
    'Application should transition to Documents Verified when all mandatory docs accepted'
  );

  const checkFinal = await canApplicationBeDocumentsVerified(currentApp);
  assert.strictEqual(checkFinal.canVerify, true, 'Verification gate must pass');
});
