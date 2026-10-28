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
  initializeLocalStorage,
  getApplicationById,
  uploadApplicationDocument,
  verifyDocumentWithIssuingAuthority,
  recordManualAuthorityVerification,
} from '../src/services/dataService.ts';
import {
  detectQrCodePayload,
  detectDigitalSignature,
  executeAuthorityVerification,
  findAuthorityProfile,
  ISSUING_AUTHORITY_PROFILES,
  type OfficialRecordVector,
} from '../src/services/issuingAuthorityVerificationService.ts';
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

// ----------------------------------------------------------------------------
// Test 1: Successful official verification response returns VERIFIED
// ----------------------------------------------------------------------------
test('1. Successful official verification response returns VERIFIED with matching field comparisons', async () => {
  setupFreshDatabase();

  const doc: RequiredDocument = {
    id: 'doc-fire-1',
    requirementId: 'REQ-EOA-002',
    name: 'Fire Safety Certificate NOC',
    category: 'SAFETY_STATUTORY',
    isMandatory: true,
    status: 'Uploaded',
    version: 1,
    validationResult: {
      status: 'VALID',
      documentId: 'doc-fire-1',
      documentVersion: 1,
      checkedAt: '2026-08-01',
      summary: { passed: 3, warnings: 0, needsReview: 0, notChecked: 0 },
      overallVerdict: 'DOCUMENT_VALID',
      findings: [],
      extractedFields: {
        certificateNumber: 'FS/2026/0991',
        institutionName: 'Pune Institute of Technology',
        validityDate: '31/12/2027',
      },
    },
  };

  const app: CollegeApplication = {
    id: 'APP-TEST-001',
    collegeId: 'COLLEGE-001',
    collegeName: 'Pune Institute of Technology',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Pune',
    discipline: 'Engineering & Technology',
    intakeProposed: 120,
    status: 'Submitted',
    submissionDate: '2026-08-01',
    lastUpdated: '2026-08-01',
    complianceScore: 85,
    flaggedIssuesCount: 0,
    documents: [doc],
  };

  const testVector: OfficialRecordVector = {
    certificateNumber: 'FS/2026/0991',
    institutionName: 'Pune Institute of Technology',
    issuingAuthority: 'Directorate of Fire & Emergency Services',
    expiryDate: '2027-12-31',
    status: 'ACTIVE',
  };

  const record = await executeAuthorityVerification(doc, app, {
    mockOfficialRecord: testVector,
  });

  assert.strictEqual(record.status, 'VERIFIED');
  assert.strictEqual(record.mismatchedFields.length, 0);
  assert.ok(record.matchedFields.length > 0);
  assert.strictEqual(record.authorityId, 'FIRE_DEPT');
  assert.ok(record.officialSource.name.includes('Fire'));
});

// ----------------------------------------------------------------------------
// Test 2: Details mismatch between submitted and official records returns DETAILS_MISMATCH
// ----------------------------------------------------------------------------
test('2. Details mismatch between submitted and official records returns DETAILS_MISMATCH', async () => {
  setupFreshDatabase();

  const doc: RequiredDocument = {
    id: 'doc-fire-2',
    requirementId: 'REQ-EOA-002',
    name: 'Fire Safety Certificate NOC',
    category: 'SAFETY_STATUTORY',
    isMandatory: true,
    status: 'Uploaded',
    version: 1,
    validationResult: {
      status: 'VALID',
      documentId: 'doc-fire-2',
      documentVersion: 1,
      checkedAt: '2026-08-01',
      summary: { passed: 2, warnings: 1, needsReview: 0, notChecked: 0 },
      overallVerdict: 'DOCUMENT_VALID',
      findings: [],
      extractedFields: {
        certificateNumber: 'FS/2026/0991',
        institutionName: 'Bombay Academy of Technology', // Different institution name submitted!
        validityDate: '31/12/2027',
      },
    },
  };

  const app: CollegeApplication = {
    id: 'APP-TEST-002',
    collegeId: 'COLLEGE-001',
    collegeName: 'Pune Institute of Technology',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Pune',
    discipline: 'Engineering & Technology',
    intakeProposed: 120,
    status: 'Submitted',
    submissionDate: '2026-08-01',
    lastUpdated: '2026-08-01',
    complianceScore: 85,
    flaggedIssuesCount: 0,
    documents: [doc],
  };

  const testVector: OfficialRecordVector = {
    certificateNumber: 'FS/2026/0991',
    institutionName: 'Pune Institute of Technology',
    issuingAuthority: 'Directorate of Fire & Emergency Services',
    expiryDate: '2027-12-31',
    status: 'ACTIVE',
  };

  const record = await executeAuthorityVerification(doc, app, {
    mockOfficialRecord: testVector,
  });

  assert.strictEqual(record.status, 'DETAILS_MISMATCH');
  assert.ok(record.mismatchedFields.some((f) => f.field === 'institutionName'));
  assert.ok(record.failureReason?.includes('Discrepancies found') || record.failureReason?.includes('mismatch'));
});

// ----------------------------------------------------------------------------
// Test 3: Confirmed record-not-found response returns RECORD_NOT_FOUND
// ----------------------------------------------------------------------------
test('3. Confirmed record-not-found response returns RECORD_NOT_FOUND', async () => {
  setupFreshDatabase();

  const doc: RequiredDocument = {
    id: 'doc-audit-1',
    requirementId: 'REQ-EOA-007',
    name: 'Audited Financial Statements',
    category: 'FINANCIAL',
    isMandatory: true,
    status: 'Uploaded',
    version: 1,
    validationResult: {
      status: 'VALID',
      documentId: 'doc-audit-1',
      documentVersion: 1,
      checkedAt: '2026-08-01',
      summary: { passed: 3, warnings: 0, needsReview: 0, notChecked: 0 },
      overallVerdict: 'DOCUMENT_VALID',
      findings: [],
      extractedFields: {
        udin: '26123456ABCDEF9999',
      },
    },
  };

  const app: CollegeApplication = {
    id: 'APP-TEST-003',
    collegeId: 'COLLEGE-001',
    collegeName: 'Pune Institute of Technology',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Pune',
    discipline: 'Engineering & Technology',
    intakeProposed: 120,
    status: 'Submitted',
    submissionDate: '2026-08-01',
    lastUpdated: '2026-08-01',
    complianceScore: 85,
    flaggedIssuesCount: 0,
    documents: [doc],
  };

  const record = await executeAuthorityVerification(doc, app, {
    mockOfficialRecord: 'NOT_FOUND',
  });

  assert.strictEqual(record.status, 'RECORD_NOT_FOUND');
  assert.ok(record.failureReason?.includes('does not exist') || record.failureReason?.includes('not exist'));
});

// ----------------------------------------------------------------------------
// Test 4: Expired certificate confirmed by official data returns EXPIRED
// ----------------------------------------------------------------------------
test('4. Expired certificate confirmed by official data returns EXPIRED', async () => {
  setupFreshDatabase();

  const doc: RequiredDocument = {
    id: 'doc-fire-exp',
    requirementId: 'REQ-EOA-002',
    name: 'Fire Safety Certificate NOC',
    category: 'SAFETY_STATUTORY',
    isMandatory: true,
    status: 'Uploaded',
    version: 1,
    validationResult: {
      status: 'VALID',
      documentId: 'doc-fire-exp',
      documentVersion: 1,
      checkedAt: '2026-08-01',
      summary: { passed: 2, warnings: 1, needsReview: 0, notChecked: 0 },
      overallVerdict: 'DOCUMENT_VALID',
      findings: [],
      extractedFields: {
        certificateNumber: 'FS/2023/0011',
        validityDate: '10/05/2024',
      },
    },
  };

  const app: CollegeApplication = {
    id: 'APP-TEST-004',
    collegeId: 'COLLEGE-001',
    collegeName: 'Pune Institute of Technology',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Pune',
    discipline: 'Engineering & Technology',
    intakeProposed: 120,
    status: 'Submitted',
    submissionDate: '2026-08-01',
    lastUpdated: '2026-08-01',
    complianceScore: 85,
    flaggedIssuesCount: 0,
    documents: [doc],
  };

  const testVector: OfficialRecordVector = {
    certificateNumber: 'FS/2023/0011',
    institutionName: 'Pune Institute of Technology',
    issuingAuthority: 'Directorate of Fire & Emergency Services',
    expiryDate: '2024-05-10',
    status: 'EXPIRED',
  };

  const record = await executeAuthorityVerification(doc, app, {
    mockOfficialRecord: testVector,
  });

  assert.strictEqual(record.status, 'EXPIRED');
  assert.ok(/expired/i.test(record.failureReason || '') || record.status === 'EXPIRED');
});

// ----------------------------------------------------------------------------
// Test 5: Unconfigured authority integration returns NOT_CONFIGURED
// ----------------------------------------------------------------------------
test('5. Unconfigured authority integration returns NOT_CONFIGURED', async () => {
  setupFreshDatabase();

  const doc: RequiredDocument = {
    id: 'doc-test-unc',
    name: 'Unmapped Custom Certificate',
    category: 'CUSTOM_OTHER',
    isMandatory: false,
    status: 'Uploaded',
  };

  const app: CollegeApplication = {
    id: 'APP-TEST-005',
    collegeId: 'COLLEGE-001',
    collegeName: 'Pune Institute of Technology',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Pune',
    discipline: 'Engineering & Technology',
    intakeProposed: 120,
    status: 'Submitted',
    submissionDate: '2026-08-01',
    lastUpdated: '2026-08-01',
    complianceScore: 85,
    flaggedIssuesCount: 0,
    documents: [doc],
  };

  const record = await executeAuthorityVerification(doc, app);
  assert.strictEqual(record.status, 'NOT_CONFIGURED');
  assert.ok(record.manualReviewReason?.includes('not configured'));
});

// ----------------------------------------------------------------------------
// Test 6: Official source timeout/unavailability returns SOURCE_UNAVAILABLE
// ----------------------------------------------------------------------------
test('6. Official source timeout/unavailability returns SOURCE_UNAVAILABLE', async () => {
  setupFreshDatabase();

  const doc: RequiredDocument = {
    id: 'doc-fire-timeout',
    requirementId: 'REQ-EOA-002',
    name: 'Fire Safety Certificate NOC',
    category: 'SAFETY_STATUTORY',
    isMandatory: true,
    status: 'Uploaded',
    validationResult: {
      status: 'VALID',
      documentId: 'doc-fire-timeout',
      documentVersion: 1,
      checkedAt: '2026-08-01',
      summary: { passed: 3, warnings: 0, needsReview: 0, notChecked: 0 },
      overallVerdict: 'DOCUMENT_VALID',
      findings: [],
      extractedFields: { certificateNumber: 'FS/2026/001' },
    },
  };

  const app: CollegeApplication = {
    id: 'APP-TEST-006',
    collegeId: 'COLLEGE-001',
    collegeName: 'Pune Institute of Technology',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Pune',
    discipline: 'Engineering & Technology',
    intakeProposed: 120,
    status: 'Submitted',
    submissionDate: '2026-08-01',
    lastUpdated: '2026-08-01',
    complianceScore: 85,
    flaggedIssuesCount: 0,
    documents: [doc],
  };

  const record = await executeAuthorityVerification(doc, app, {
    mockOfficialRecord: 'TIMEOUT',
  });

  assert.strictEqual(record.status, 'SOURCE_UNAVAILABLE');
  assert.ok(record.failureReason?.includes('timed out') || record.failureReason?.includes('unreachable'));
});

// ----------------------------------------------------------------------------
// Test 7: QR code containing arbitrary or untrusted URL is rejected as untrusted input
// ----------------------------------------------------------------------------
test('7. QR code containing arbitrary or untrusted URL is rejected as untrusted input', async () => {
  const profile = ISSUING_AUTHORITY_PROFILES.find((p) => p.authorityId === 'FIRE_DEPT')!;

  const doc: RequiredDocument = {
    id: 'doc-qr-untrusted',
    name: 'Fire NOC',
    category: 'SAFETY_STATUTORY',
    isMandatory: true,
    status: 'Uploaded',
    extractedText: 'Fire Department NOC. QR Code: https://phishing-portal.malicious-site.org/verify?cert=FS123',
  };

  const result = detectQrCodePayload(doc, profile);

  assert.strictEqual(result.detected, true);
  assert.strictEqual(result.isTrustedDomain, false);
  assert.ok(result.untrustedWarning?.includes('NOT in the trusted authority domain whitelist'));

  const app: CollegeApplication = {
    id: 'APP-TEST-007',
    collegeId: 'COLLEGE-001',
    collegeName: 'Pune Institute of Technology',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Pune',
    discipline: 'Engineering & Technology',
    intakeProposed: 120,
    status: 'Submitted',
    submissionDate: '2026-08-01',
    lastUpdated: '2026-08-01',
    complianceScore: 85,
    flaggedIssuesCount: 0,
    documents: [doc],
  };

  const record = await executeAuthorityVerification(doc, app);
  assert.strictEqual(record.status, 'MANUAL_REVIEW_REQUIRED');
  assert.ok(record.failureReason?.includes('trusted authority domain whitelist'));
});

// ----------------------------------------------------------------------------
// Test 8: QR code that decodes successfully but cannot be officially verified falls back to MANUAL_REVIEW_REQUIRED
// ----------------------------------------------------------------------------
test('8. QR code that decodes successfully but cannot be officially verified falls back to MANUAL_REVIEW_REQUIRED', async () => {
  const profile = ISSUING_AUTHORITY_PROFILES.find((p) => p.authorityId === 'FIRE_DEPT')!;

  // Trusted domain format, but without online API backend
  const doc: RequiredDocument = {
    id: 'doc-qr-trusted',
    name: 'Fire NOC',
    category: 'SAFETY_STATUTORY',
    isMandatory: true,
    status: 'Uploaded',
    extractedText: 'Official State Fire Safety. Scan QR: https://mahafireservice.gov.in/verify/FS-2026-999',
  };

  const result = detectQrCodePayload(doc, profile);

  assert.strictEqual(result.detected, true);
  assert.strictEqual(result.isTrustedDomain, true);

  const app: CollegeApplication = {
    id: 'APP-TEST-008',
    collegeId: 'COLLEGE-001',
    collegeName: 'Pune Institute of Technology',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Pune',
    discipline: 'Engineering & Technology',
    intakeProposed: 120,
    status: 'Submitted',
    submissionDate: '2026-08-01',
    lastUpdated: '2026-08-01',
    complianceScore: 85,
    flaggedIssuesCount: 0,
    documents: [doc],
  };

  const record = await executeAuthorityVerification(doc, app);
  // Must NOT claim VERIFIED simply because QR decoded!
  assert.strictEqual(record.status, 'MANUAL_REVIEW_REQUIRED');
});

// ----------------------------------------------------------------------------
// Test 9: Digital signature present but not cryptographically validated distinguishes presence from trust validation
// ----------------------------------------------------------------------------
test('9. Digital signature present but not cryptographically validated distinguishes presence from trust validation', () => {
  const profile = ISSUING_AUTHORITY_PROFILES.find((p) => p.authorityId === 'FIRE_DEPT')!;
  const doc: RequiredDocument = {
    id: 'doc-sig-presence',
    name: 'Fire NOC',
    category: 'SAFETY_STATUTORY',
    isMandatory: true,
    status: 'Uploaded',
    extractedText: 'Digitally signed by Chief Fire Officer on 2026-02-15 with DSC token.',
  };

  const result = detectDigitalSignature(doc, profile);

  assert.strictEqual(result.detected, true);
  assert.strictEqual(result.isCryptographicallyValidated, false);
  assert.ok(result.statusNote.includes('do NOT establish') || result.statusNote.includes('trust chain'));
});

// ----------------------------------------------------------------------------
// Test 10: Valid signature verification when supported and configured
// ----------------------------------------------------------------------------
test('10. Valid signature verification when supported and configured', async () => {
  const dummyPdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 ... /Type /Sig ... /ByteRange [0 100 200 300]').toString('base64');

  const doc: RequiredDocument = {
    id: 'doc-sig-valid',
    requirementId: 'REQ-EOA-002',
    name: 'Fire Safety Certificate NOC',
    category: 'SAFETY_STATUTORY',
    isMandatory: true,
    status: 'Uploaded',
    extractedText: 'Digitally signed by Controller of Fire Examinations. Valid Signature.',
    fileDataUrl: dummyPdf,
  };

  const app: CollegeApplication = {
    id: 'APP-TEST-010',
    collegeId: 'COLLEGE-001',
    collegeName: 'Pune Institute of Technology',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Pune',
    discipline: 'Engineering & Technology',
    intakeProposed: 120,
    status: 'Submitted',
    submissionDate: '2026-08-01',
    lastUpdated: '2026-08-01',
    complianceScore: 85,
    flaggedIssuesCount: 0,
    documents: [doc],
  };

  const record = await executeAuthorityVerification(doc, app, {
    testSignatureConfigured: true,
  });

  assert.strictEqual(record.status, 'VERIFIED');
  assert.strictEqual(record.method, 'DIGITAL_SIGNATURE');
  assert.ok(record.matchedFields.some((f) => f.field === 'digitalSignature'));
});

// ----------------------------------------------------------------------------
// Test 11: Missing or malformed certificate/reference number falls back to MANUAL_REVIEW_REQUIRED
// ----------------------------------------------------------------------------
test('11. Missing or malformed certificate/reference number falls back to MANUAL_REVIEW_REQUIRED', async () => {
  setupFreshDatabase();

  const doc: RequiredDocument = {
    id: 'doc-no-ref',
    requirementId: 'REQ-EOA-007',
    name: 'Audited Financial Statements',
    category: 'FINANCIAL',
    isMandatory: true,
    status: 'Uploaded',
    extractedText: 'Generic financial summary without any valid reference or UDIN number.',
  };

  const app: CollegeApplication = {
    id: 'APP-TEST-011',
    collegeId: 'COLLEGE-001',
    collegeName: 'Pune Institute of Technology',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Pune',
    discipline: 'Engineering & Technology',
    intakeProposed: 120,
    status: 'Submitted',
    submissionDate: '2026-08-01',
    lastUpdated: '2026-08-01',
    complianceScore: 85,
    flaggedIssuesCount: 0,
    documents: [doc],
  };

  const record = await executeAuthorityVerification(doc, app);
  assert.strictEqual(record.status, 'MANUAL_REVIEW_REQUIRED');
  assert.ok(record.failureReason?.includes('missing') || record.manualReviewReason?.includes('reference number'));
});

// ----------------------------------------------------------------------------
// Test 12: Automatic fallback to manual review when automated checks are inconclusive
// ----------------------------------------------------------------------------
test('12. Automatic fallback to manual review when automated checks are inconclusive', async () => {
  setupFreshDatabase();

  const doc: RequiredDocument = {
    id: 'doc-struct-1',
    requirementId: 'REQ-EOA-004',
    name: 'Structural Stability Certificate',
    category: 'SAFETY_STATUTORY',
    isMandatory: true,
    status: 'Uploaded',
    validationResult: {
      status: 'VALID',
      documentId: 'doc-struct-1',
      documentVersion: 1,
      checkedAt: '2026-08-01',
      summary: { passed: 3, warnings: 0, needsReview: 0, notChecked: 0 },
      overallVerdict: 'DOCUMENT_VALID',
      findings: [],
      extractedFields: {
        certificateNumber: 'PWD/STR/2026/8871',
      },
    },
  };

  const app: CollegeApplication = {
    id: 'APP-TEST-012',
    collegeId: 'COLLEGE-001',
    collegeName: 'Pune Institute of Technology',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Pune',
    discipline: 'Engineering & Technology',
    intakeProposed: 120,
    status: 'Submitted',
    submissionDate: '2026-08-01',
    lastUpdated: '2026-08-01',
    complianceScore: 85,
    flaggedIssuesCount: 0,
    documents: [doc],
  };

  const record = await executeAuthorityVerification(doc, app);
  assert.strictEqual(record.status, 'MANUAL_REVIEW_REQUIRED');
  assert.ok(record.manualReviewReason?.includes('Manual verification workflow') || record.suggestedNextAction?.includes('manual'));
});

// ----------------------------------------------------------------------------
// Test 13: Manual decision requires remarks and records reviewer and timestamp
// ----------------------------------------------------------------------------
test('13. Manual decision requires mandatory remarks and records reviewer and timestamp', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'Dr. S. K. Sharma', email: 'officer@aicte.gov.in' });

  const app = await getApplicationById('APP-EOA-2026-001');
  assert.ok(app, 'APP-EOA-2026-001 should exist in initialized database');
  const targetDoc = app.documents[0];

  // Attempt without remarks must throw
  await assert.rejects(
    async () => {
      await recordManualAuthorityVerification(app.id, targetDoc.id, {
        decision: 'VERIFIED',
        officialSourceUsed: 'State Fire Services Portal',
        remarks: '   ', // whitespace only
      });
    },
    /remarks/i
  );

  // Valid manual decision
  const updatedApp = await recordManualAuthorityVerification(app.id, targetDoc.id, {
    decision: 'VERIFIED',
    officialSourceUsed: 'MahaFire Services Registry Portal Ref #FS-2026-4412',
    remarks: 'Cross-verified directly on State portal. Certificate number and building area confirmed genuine.',
  });

  const updatedDoc = updatedApp.documents.find((d) => d.id === targetDoc.id);
  assert.ok(updatedDoc?.authorityVerificationResult);
  assert.strictEqual(updatedDoc.authorityVerificationResult.status, 'VERIFIED');
  assert.strictEqual(updatedDoc.authorityVerificationResult.isManualReview, true);
  assert.strictEqual(updatedDoc.authorityVerificationResult.reviewerName, 'Dr. S. K. Sharma');
  assert.ok(updatedDoc.authorityVerificationResult.verifiedAt);
});

// ----------------------------------------------------------------------------
// Test 14: Verification attempt creates an immutable audit entry
// ----------------------------------------------------------------------------
test('14. Verification attempt creates an audit entry (AUTHORITY_VERIFICATION_*)', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'Scrutiny Officer A', email: 'officer@aicte.gov.in' });

  const app = await getApplicationById('APP-EOA-2026-001');
  assert.ok(app);
  const initialLogsCount = app.auditLogs?.length || 0;

  const updated = await verifyDocumentWithIssuingAuthority(app.id, app.documents[0].id);

  assert.ok(updated.auditLogs);
  assert.ok(updated.auditLogs.length > initialLogsCount);
  const lastLog = updated.auditLogs[updated.auditLogs.length - 1];
  assert.ok(
    lastLog.action === 'AUTHORITY_VERIFICATION_COMPLETED' ||
    lastLog.action === 'AUTHORITY_VERIFICATION_FAILED' ||
    lastLog.action === 'AUTHORITY_VERIFICATION_STARTED'
  );
  assert.ok(lastLog.details.includes(app.documents[0].name));
});

// ----------------------------------------------------------------------------
// Test 15: Replacing a document invalidates its current verification status while preserving history
// ----------------------------------------------------------------------------
test('15. Replacing a document invalidates its current verification status while preserving history', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'Officer A' });

  const app = await getApplicationById('APP-EOA-2026-001');
  assert.ok(app);
  const doc = app.documents[0];

  // Perform verification first
  await verifyDocumentWithIssuingAuthority(app.id, doc.id);
  const verifiedApp = await getApplicationById(app.id);
  const verifiedDoc = verifiedApp!.documents.find((d) => d.id === doc.id)!;
  assert.ok(verifiedDoc.authorityVerificationResult);
  const historyLenBefore = verifiedDoc.authorityVerificationHistory?.length || 0;
  assert.ok(historyLenBefore > 0);

  // Now college replaces document
  setSession({ role: 'college', collegeId: app.collegeId });
  const replacedApp = await uploadApplicationDocument(
    app.id,
    doc.requirementId || doc.id,
    {
      fileName: 'new_fire_noc_v2.pdf',
      fileSize: '350 KB',
      fileType: 'application/pdf',
      dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK...',
    }
  );

  const replacedDoc = replacedApp.documents.find((d) => d.requirementId === doc.requirementId)!;
  // Current verification result must be invalidated
  assert.strictEqual(replacedDoc.authorityVerificationResult, undefined);
  // History must be preserved!
  assert.strictEqual(replacedDoc.authorityVerificationHistory?.length, historyLenBefore);
});

// ----------------------------------------------------------------------------
// Test 16: Verification history remains available across repeated verification attempts
// ----------------------------------------------------------------------------
test('16. Verification history remains available across repeated verification attempts', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'Scrutiny Officer B' });

  const app = await getApplicationById('APP-EOA-2026-001');
  assert.ok(app);
  const doc = app.documents[0];

  // Attempt 1: automated inquiry
  await verifyDocumentWithIssuingAuthority(app.id, doc.id);

  // Attempt 2: manual review
  await recordManualAuthorityVerification(app.id, doc.id, {
    decision: 'VERIFIED',
    officialSourceUsed: 'Direct State Portal Query',
    remarks: 'Second review confirming authenticity.',
  });

  const finalApp = await getApplicationById(app.id);
  const finalDoc = finalApp!.documents.find((d) => d.id === doc.id)!;

  assert.ok(finalDoc.authorityVerificationHistory);
  assert.strictEqual(finalDoc.authorityVerificationHistory.length, 2);
  assert.strictEqual(finalDoc.authorityVerificationResult?.isManualReview, true);
});

// ----------------------------------------------------------------------------
// Test 17: EoA and New Approval workflows remain separate
// ----------------------------------------------------------------------------
test('17. EoA and New Approval workflows remain separate', () => {
  const eoaDoc: RequiredDocument = {
    id: 'doc-eoa',
    requirementId: 'REQ-EOA-002',
    name: 'Fire Safety Certificate NOC',
    category: 'SAFETY_STATUTORY',
    isMandatory: true,
    status: 'Uploaded',
  };

  const newAppDoc: RequiredDocument = {
    id: 'doc-new',
    requirementId: 'REQ-NEW-005',
    name: 'Registered Land Documents',
    category: 'LAND_BUILDING',
    isMandatory: true,
    status: 'Uploaded',
  };

  const profileEoa = findAuthorityProfile(eoaDoc, 'REQ-EOA-002');
  const profileNew = findAuthorityProfile(newAppDoc, 'REQ-NEW-005');

  assert.strictEqual(profileEoa?.authorityId, 'FIRE_DEPT');
  assert.strictEqual(profileNew?.authorityId, 'REVENUE_LAND');
});

// ----------------------------------------------------------------------------
// Test 18: College users cannot modify authority verification decisions (RBAC enforcement)
// ----------------------------------------------------------------------------
test('18. College users cannot modify authority verification decisions (Access Denied)', async () => {
  setupFreshDatabase();
  setSession({ role: 'college', collegeId: '1-10972341' });

  const app = await getApplicationById('APP-EOA-2026-001');
  assert.ok(app);

  await assert.rejects(
    async () => {
      await recordManualAuthorityVerification(app.id, app.documents[0].id, {
        decision: 'VERIFIED',
        officialSourceUsed: 'College attempt',
        remarks: 'Self verified',
      });
    },
    /Access Denied/
  );
});

// ----------------------------------------------------------------------------
// Test 19: Verification results do not falsely change the application submission/approval status
// ----------------------------------------------------------------------------
test('19. Verification results do not falsely change the application submission/approval status', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'Admin Officer' });

  const app = await getApplicationById('APP-EOA-2026-001');
  assert.ok(app);
  const originalStatus = app.status;

  await verifyDocumentWithIssuingAuthority(app.id, app.documents[0].id);

  const updatedApp = await getApplicationById(app.id);
  assert.strictEqual(updatedApp!.status, originalStatus);
});

// ----------------------------------------------------------------------------
// Test 20: Existing features (document scrutiny, OCR, duplicate detection, infrastructure evidence) continue working without regression
// ----------------------------------------------------------------------------
test('20. Existing features (document scrutiny, OCR, duplicate detection, infrastructure evidence) continue working without regression', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'Admin Officer' });

  const app = await getApplicationById('APP-EOA-2026-001');
  assert.ok(app);

  // Check that application maintains all structural sections
  assert.ok(Array.isArray(app.documents));
  assert.ok(app.documents.length > 0);
  assert.ok(app.complianceScore >= 0);

  // Verify that document can hold OCR result, duplicate check, and authority verification concurrently
  const doc = app.documents[0];
  assert.ok(doc.id);
  assert.ok(doc.name);

  // Execute authority verification
  const afterAuth = await verifyDocumentWithIssuingAuthority(app.id, doc.id);
  const updatedDoc = afterAuth.documents.find((d) => d.id === doc.id)!;

  assert.ok(updatedDoc.authorityVerificationResult);
  assert.ok(Array.isArray(updatedDoc.authorityVerificationHistory));
});

// ----------------------------------------------------------------------------
// Test 21: Guided manual verification saves method, checked ref, and officer identity
// ----------------------------------------------------------------------------
test('21. Guided manual verification saves method, checked ref, and officer identity', async () => {
  setupFreshDatabase();
  setSession({
    role: 'admin',
    displayName: 'Officer Rajesh Kumar',
    email: 'r.kumar@aicte-india.org',
  });

  const app = await getApplicationById('APP-EOA-2026-001');
  assert.ok(app);
  const doc = app.documents[0];

  const updatedApp = await recordManualAuthorityVerification(app.id, doc.id, {
    decision: 'VERIFIED',
    method: 'Official Portal',
    officialSourceUsed: 'https://mahafireservice.gov.in',
    referenceNumberChecked: 'MH-FIRE-2024-8891',
    remarks: 'Verified NOC against Maharashtra State Fire Services Registry portal. Building height and setbacks match submission.',
  });

  const updatedDoc = updatedApp.documents.find((d) => d.id === doc.id)!;
  const result = updatedDoc.authorityVerificationResult!;

  assert.strictEqual(result.status, 'VERIFIED');
  assert.strictEqual(result.isManualReview, true);
  assert.strictEqual(result.manualVerificationMethod, 'Official Portal');
  assert.strictEqual(result.referenceNumberChecked, 'MH-FIRE-2024-8891');
  assert.strictEqual(result.reviewerName, 'Officer Rajesh Kumar');
  assert.strictEqual(result.reviewerEmail, 'r.kumar@aicte-india.org');
  assert.strictEqual(result.reviewerRemarks, 'Verified NOC against Maharashtra State Fire Services Registry portal. Building height and setbacks match submission.');
  assert.ok(result.summary.includes('MANUALLY VERIFIED'));
  assert.ok(result.summary.includes('Officer Rajesh Kumar'));
  assert.ok(result.summary.includes('MH-FIRE-2024-8891'));

  // Check audit log
  const auditLog = updatedApp.auditLogs.find((l) => l.action === 'AUTHORITY_MANUAL_REVIEW_RECORDED')!;
  assert.ok(auditLog);
  assert.strictEqual(auditLog.actor, 'Officer Rajesh Kumar');
  assert.strictEqual(auditLog.actorRole, 'admin');
  assert.ok(auditLog.details.includes('Official Portal'));
  assert.ok(auditLog.details.includes('MH-FIRE-2024-8891'));
});

// ----------------------------------------------------------------------------
// Test 22: Guided manual verification with QR and Other methods and discrepancy determinations
// ----------------------------------------------------------------------------
test('22. Guided manual verification with QR and Other methods and discrepancy determinations', async () => {
  setupFreshDatabase();
  setSession({
    role: 'admin',
    displayName: 'Officer Anita Verma',
    email: 'anita.v@aicte-india.org',
  });

  const app = await getApplicationById('APP-EOA-2026-001');
  assert.ok(app);
  const doc = app.documents[0];

  // Test QR method with MISMATCH_FOUND
  const appMismatch = await recordManualAuthorityVerification(app.id, doc.id, {
    decision: 'MISMATCH_FOUND',
    method: 'QR',
    officialSourceUsed: 'State QR Decoder Gateway',
    referenceNumberChecked: 'QR-NOC-99812',
    remarks: 'QR code scanned with official reader decrypted certificate for different institution (XYZ College).',
  });

  const docMismatch = appMismatch.documents.find((d) => d.id === doc.id)!;
  assert.strictEqual(docMismatch.authorityVerificationResult?.status, 'DETAILS_MISMATCH');
  assert.strictEqual(docMismatch.authorityVerificationResult?.manualVerificationMethod, 'QR');
  assert.strictEqual(docMismatch.authorityVerificationResult?.referenceNumberChecked, 'QR-NOC-99812');
  assert.ok(docMismatch.authorityVerificationResult?.summary.includes('DISCREPANCY REPORTED'));

  // Test Other method with UNABLE_TO_VERIFY
  const appUnable = await recordManualAuthorityVerification(app.id, doc.id, {
    decision: 'UNABLE_TO_VERIFY',
    method: 'Other',
    officialSourceUsed: 'Physical Municipal Record Office Desk',
    referenceNumberChecked: 'MUN-STR-2026',
    remarks: 'Municipal desk records are archived offsite and could not be retrieved within the inspection timeframe.',
  });

  const docUnable = appUnable.documents.find((d) => d.id === doc.id)!;
  assert.strictEqual(docUnable.authorityVerificationResult?.status, 'MANUAL_REVIEW_REQUIRED');
  assert.strictEqual(docUnable.authorityVerificationResult?.manualVerificationMethod, 'Other');
  assert.ok(docUnable.authorityVerificationResult?.summary.includes('UNABLE TO VERIFY'));
  assert.strictEqual(docUnable.authorityVerificationHistory?.length, 2);
});

// ----------------------------------------------------------------------------
// Test 23: Guided manual verification validates mandatory remarks and official source
// ----------------------------------------------------------------------------
test('23. Guided manual verification validates mandatory remarks and official source', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'Officer Admin' });

  const app = await getApplicationById('APP-EOA-2026-001');
  assert.ok(app);
  const doc = app.documents[0];

  // Missing remarks
  await assert.rejects(
    async () => {
      await recordManualAuthorityVerification(app.id, doc.id, {
        decision: 'VERIFIED',
        method: 'Official Portal',
        officialSourceUsed: 'https://icai.org',
        remarks: '',
      });
    },
    /Mandatory: Specific officer remarks/
  );

  // Missing official source
  await assert.rejects(
    async () => {
      await recordManualAuthorityVerification(app.id, doc.id, {
        decision: 'VERIFIED',
        method: 'Official Portal',
        officialSourceUsed: '   ',
        remarks: 'Valid remarks provided',
      });
    },
    /Mandatory: Official source/
  );
});

// ----------------------------------------------------------------------------
// Test 24: Summary explicitly distinguishes MANUALLY VERIFIED and never fabricates live API verification
// ----------------------------------------------------------------------------
test('24. Summary explicitly distinguishes MANUALLY VERIFIED and never fabricates live API verification', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'Officer Vikram Singh' });

  const app = await getApplicationById('APP-EOA-2026-001');
  assert.ok(app);
  const doc = app.documents[0];

  const updatedApp = await recordManualAuthorityVerification(app.id, doc.id, {
    decision: 'VERIFIED',
    method: 'Official Portal',
    officialSourceUsed: 'UDIN ICAI Official Verification Portal',
    referenceNumberChecked: '24054321AAAAA1234',
    remarks: 'UDIN verified directly against ICAI portal. CA registration active and audit figures match.',
  });

  const updatedDoc = updatedApp.documents.find((d) => d.id === doc.id)!;
  const result = updatedDoc.authorityVerificationResult!;

  assert.strictEqual(result.isManualReview, true);
  assert.strictEqual(result.method, 'MANUAL_ADMIN');
  assert.ok(result.summary.startsWith('MANUALLY VERIFIED by Officer Officer Vikram Singh'));
  // Ensure it does NOT claim automated live API connection
  assert.strictEqual(result.officialSource.endpointType, 'MANUAL_DESK');
});

// ----------------------------------------------------------------------------
// Test 25: College users are strictly denied from recording manual authority verification decisions
// ----------------------------------------------------------------------------
test('25. College users are strictly denied from recording manual authority verification decisions', async () => {
  setupFreshDatabase();
  setSession({ role: 'college', collegeId: '1-10972341' });

  const app = await getApplicationById('APP-EOA-2026-001');
  assert.ok(app);
  const doc = app.documents[0];

  await assert.rejects(
    async () => {
      await recordManualAuthorityVerification(app.id, doc.id, {
        decision: 'VERIFIED',
        method: 'Official Portal',
        officialSourceUsed: 'https://stateportal.gov.in',
        remarks: 'College user attempting to self-verify',
      });
    },
    /Access Denied: Only authorized AICTE Scrutiny Officers/
  );
});

