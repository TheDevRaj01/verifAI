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
  initializeLocalStorage,
} from '../src/services/dataService.ts';
import type {
  CollegeApplication,
  RequiredDocument,
  ChecklistRequirement,
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

// -------------------------------------------------------------
// Test 1: One accepted document with other mandatory documents missing
// -------------------------------------------------------------
test('1. One accepted document with other mandatory documents missing cannot become Documents Verified', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'AICTE Scrutiny Officer' });

  // Get active EOA requirements
  const eoaReqs = await getChecklistRequirements('EOA', false);
  const activeMandatory = eoaReqs.filter((r) => r.isActive && r.isMandatory);
  assert.ok(activeMandatory.length >= 2, 'EOA must have multiple mandatory requirements');

  // Create an application with only ONE accepted mandatory document
  const firstReq = activeMandatory[0];
  const testApp: CollegeApplication = {
    id: 'APP-TEST-EOA-001',
    collegeId: '1-10972341',
    collegeName: 'Delhi Institute of Engineering',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering & Technology',
    intakeProposed: 300,
    status: 'Submitted',
    submissionDate: '2026-10-20',
    lastUpdated: '2026-10-20',
    complianceScore: 30,
    flaggedIssuesCount: 0,
    documents: [
      {
        id: firstReq.id,
        requirementId: firstReq.id,
        name: firstReq.title,
        category: firstReq.category,
        isMandatory: true,
        status: 'Accepted',
        fileName: 'Approved_Document.pdf',
        uploadDate: '2026-10-20',
        version: 1,
      },
    ],
  };

  await createOrUpdateApplication(testApp);

  const verification = await canApplicationBeDocumentsVerified(testApp, testApp.documents);
  assert.strictEqual(verification.canVerify, false, 'Must NOT be verifiable with missing mandatory docs');
  assert.ok(
    verification.reason?.includes('has not been uploaded') || verification.reason?.includes('not been explicitly accepted'),
    `Reason must identify the missing requirement: ${verification.reason}`
  );

  // Attempting to manually force status transition must throw an error
  await assert.rejects(
    async () => {
      await updateApplicationStatus(testApp.id, 'Documents Verified');
    },
    (err: Error) => {
      assert.ok(err.message.includes('Cannot transition application to "Documents Verified"'));
      return true;
    }
  );
});

// -------------------------------------------------------------
// Test 2: All mandatory documents accepted
// -------------------------------------------------------------
test('2. All mandatory documents accepted allows transition to Documents Verified', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'AICTE Central Admin' });

  const eoaReqs = await getChecklistRequirements('EOA', false);
  const activeMandatory = eoaReqs.filter((r) => r.isActive && r.isMandatory);

  // Build documents list where EVERY active mandatory requirement is Accepted
  const acceptedDocuments: RequiredDocument[] = activeMandatory.map((req) => ({
    id: req.id,
    requirementId: req.id,
    name: req.title,
    category: req.category,
    isMandatory: true,
    status: 'Accepted',
    fileName: `${req.id}_verified.pdf`,
    uploadDate: '2026-10-21',
    version: 1,
  }));

  const testApp: CollegeApplication = {
    id: 'APP-TEST-EOA-002',
    collegeId: '1-10972341',
    collegeName: 'Delhi Institute of Engineering',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering & Technology',
    intakeProposed: 300,
    status: 'Submitted',
    submissionDate: '2026-10-20',
    lastUpdated: '2026-10-20',
    complianceScore: 100,
    flaggedIssuesCount: 0,
    documents: acceptedDocuments,
  };

  await createOrUpdateApplication(testApp);

  const verification = await canApplicationBeDocumentsVerified(testApp, acceptedDocuments);
  assert.strictEqual(verification.canVerify, true, 'Must verify when all mandatory requirements are Accepted');

  // Status transition to Documents Verified succeeds
  const updatedApp = await updateApplicationStatus(testApp.id, 'Documents Verified', 'Council scrutiny approved.');
  assert.strictEqual(updatedApp.status, 'Documents Verified');

  // Verify audit log exists
  assert.ok(updatedApp.auditLogs && updatedApp.auditLogs.length > 0);
  assert.strictEqual(updatedApp.auditLogs[0].action, 'STATUS_CHANGED');
  assert.ok(updatedApp.auditLogs[0].details.includes('Documents Verified'));
});

// -------------------------------------------------------------
// Test 3: Empty document list safely rejected
// -------------------------------------------------------------
test('3. Empty document list does not pass validation or allow Documents Verified', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'AICTE Central Admin' });

  const emptyApp: CollegeApplication = {
    id: 'APP-TEST-EMPTY',
    collegeId: '1-10972341',
    collegeName: 'Delhi Institute of Engineering',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering & Technology',
    intakeProposed: 300,
    status: 'Submitted',
    submissionDate: '2026-10-20',
    lastUpdated: '2026-10-20',
    complianceScore: 0,
    flaggedIssuesCount: 0,
    documents: [],
  };

  await createOrUpdateApplication(emptyApp);

  const result = await canApplicationBeDocumentsVerified(emptyApp, []);
  assert.strictEqual(result.canVerify, false, 'Must reject empty document dossier');
  assert.ok(result.reason?.includes('zero uploaded documents'));

  await assert.rejects(
    async () => {
      await updateApplicationStatus(emptyApp.id, 'Documents Verified');
    },
    (err: Error) => {
      assert.ok(err.message.includes('zero uploaded documents'));
      return true;
    }
  );
});

// -------------------------------------------------------------
// Test 4: Admin review attempted on a Draft application
// -------------------------------------------------------------
test('4. Admin review attempted on a Draft application throws clear descriptive error', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'AICTE Scrutiny Officer' });

  const draftApp: CollegeApplication = {
    id: 'APP-TEST-DRAFT',
    collegeId: '1-10972341',
    collegeName: 'Delhi Institute of Engineering',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering & Technology',
    intakeProposed: 300,
    status: 'Draft',
    submissionDate: '2026-10-20',
    lastUpdated: '2026-10-20',
    complianceScore: 15,
    flaggedIssuesCount: 0,
    documents: [
      {
        id: 'REQ-EOA-001',
        requirementId: 'REQ-EOA-001',
        name: 'Affiliation Continuation Letter 2026–27',
        category: 'Affiliation',
        isMandatory: true,
        status: 'Uploaded',
        fileName: 'Draft_Affiliation.pdf',
        uploadDate: '2026-10-20',
        version: 1,
      },
    ],
  };

  await createOrUpdateApplication(draftApp);

  // Reviewing document on draft application must throw
  await assert.rejects(
    async () => {
      await reviewApplicationDocument(draftApp.id, 'REQ-EOA-001', {
        status: 'Accepted',
      });
    },
    (err: Error) => {
      assert.ok(err.message.includes('Action Prohibited: Cannot review documents for an application in "Draft" status'));
      return true;
    }
  );

  // Requesting replacement on draft application must also throw
  await assert.rejects(
    async () => {
      await reviewApplicationDocument(draftApp.id, 'REQ-EOA-001', {
        status: 'Replacement Required',
        remarks: 'Draft scan is bad',
      });
    },
    (err: Error) => {
      assert.ok(err.message.includes('Action Prohibited: Cannot review documents for an application in "Draft" status'));
      return true;
    }
  );

  // Manually transitioning Draft application status before submission must throw
  await assert.rejects(
    async () => {
      await updateApplicationStatus(draftApp.id, 'Documents Verified');
    },
    (err: Error) => {
      assert.ok(err.message.includes('Cannot transition a "Draft" application'));
      return true;
    }
  );
});

// -------------------------------------------------------------
// Test 5: Admin review attempted on a submitted application
// -------------------------------------------------------------
test('5. Admin review on a submitted application succeeds and records audit log', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'AICTE Reviewer 1' });

  const submittedApp: CollegeApplication = {
    id: 'APP-TEST-SUBMITTED-005',
    collegeId: '1-10972341',
    collegeName: 'Delhi Institute of Engineering',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering & Technology',
    intakeProposed: 300,
    status: 'Submitted',
    submissionDate: '2026-10-20',
    lastUpdated: '2026-10-20',
    complianceScore: 50,
    flaggedIssuesCount: 0,
    documents: [
      {
        id: 'REQ-EOA-001',
        requirementId: 'REQ-EOA-001',
        name: 'Affiliation Continuation Letter 2026–27',
        category: 'Affiliation',
        isMandatory: true,
        status: 'Uploaded',
        fileName: 'Affiliation_Order.pdf',
        uploadDate: '2026-10-20',
        version: 1,
      },
    ],
  };

  await createOrUpdateApplication(submittedApp);

  const updated = await reviewApplicationDocument(submittedApp.id, 'REQ-EOA-001', {
    status: 'Accepted',
    remarks: 'Valid affiliation order verified against university gazette',
  });

  const reviewedDoc = updated.documents.find((d) => d.id === 'REQ-EOA-001');
  assert.ok(reviewedDoc);
  assert.strictEqual(reviewedDoc.status, 'Accepted');
  assert.strictEqual(reviewedDoc.reviewedBy, 'AICTE Reviewer 1');
  assert.strictEqual(reviewedDoc.adminRemarks, 'Valid affiliation order verified against university gazette');

  // Verify audit log
  assert.ok(updated.auditLogs && updated.auditLogs.length > 0);
  const log = updated.auditLogs[0];
  assert.strictEqual(log.action, 'DOCUMENT_ACCEPTED');
  assert.strictEqual(log.actor, 'AICTE Reviewer 1');
  assert.strictEqual(log.actorRole, 'admin');
  assert.ok(log.details.includes('Affiliation Continuation Letter 2026–27'));
});

// -------------------------------------------------------------
// Test 6: Document replacement invalidating previous validation
// -------------------------------------------------------------
test('6. Document replacement invalidates previous OCR and validation results, resetting status to Uploaded', async () => {
  setupFreshDatabase();
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'Delhi Institute' });

  const appWithDoc: CollegeApplication = {
    id: 'APP-TEST-REPLACE-006',
    collegeId: '1-10972341',
    collegeName: 'Delhi Institute',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering & Technology',
    intakeProposed: 300,
    status: 'Draft',
    submissionDate: '2026-10-20',
    lastUpdated: '2026-10-20',
    complianceScore: 50,
    flaggedIssuesCount: 0,
    documents: [
      {
        id: 'REQ-EOA-002',
        requirementId: 'REQ-EOA-002',
        name: 'Fire Safety Certificate & NOC',
        category: 'Statutory Compliances & Approvals',
        isMandatory: true,
        status: 'Uploaded',
        fileName: 'Old_Fire_NOC.pdf',
        fileSize: '1.2 MB',
        fileType: 'application/pdf',
        uploadDate: '2026-10-15',
        version: 1,
        ocrResult: {
          text: 'OLD OCR TEXT',
          method: 'ocr_pdf',
          extractedAt: '2026-10-15',
          charCount: 12,
          wordCount: 3,
        },
        extractedText: 'OLD OCR TEXT',
        ocrExtractedAt: '2026-10-15',
        ocrMethod: 'ocr_pdf',
        validationResult: {
          analyzedAt: '2026-10-15',
          documentVersion: 1,
          ocrSnippetPreview: 'OLD OCR TEXT',
          extractedFields: {},
          findings: [],
          summary: { passed: 1, warnings: 0, needsReview: 0, notChecked: 0 },
          overallVerdict: 'SATISFACTORY',
          authenticityStatus: 'NOT VERIFIED',
          disclaimer: 'Notice',
        },
      },
    ],
  };

  await createOrUpdateApplication(appWithDoc);

  // College uploads replacement file
  const updated = await uploadApplicationDocument(appWithDoc.id, 'REQ-EOA-002', {
    fileName: 'New_Renewed_Fire_NOC.pdf',
    fileSize: '2.5 MB',
    fileType: 'application/pdf',
  });

  const replacedDoc = updated.documents.find((d) => d.id === 'REQ-EOA-002');
  assert.ok(replacedDoc);
  assert.strictEqual(replacedDoc.fileName, 'New_Renewed_Fire_NOC.pdf');
  assert.strictEqual(replacedDoc.version, 2, 'Version must increment to 2');
  assert.strictEqual(replacedDoc.status, 'Uploaded', 'Status must be Uploaded (NOT auto-accepted)');

  // Critical: Stale OCR and validation results must be reset to undefined
  assert.strictEqual(replacedDoc.ocrResult, undefined);
  assert.strictEqual(replacedDoc.extractedText, undefined);
  assert.strictEqual(replacedDoc.ocrExtractedAt, undefined);
  assert.strictEqual(replacedDoc.ocrMethod, undefined);
  assert.strictEqual(replacedDoc.validationResult, undefined);

  // Verify audit log records DOCUMENT_REPLACED
  assert.ok(updated.auditLogs && updated.auditLogs.length > 0);
  assert.strictEqual(updated.auditLogs[0].action, 'DOCUMENT_REPLACED');
});

// -------------------------------------------------------------
// Test 7: Replacement request and officer remarks
// -------------------------------------------------------------
test('7. Replacement request records officer remarks, updates application to Clarification Requested', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'AICTE Scrutiny Officer Verma' });

  const submittedApp: CollegeApplication = {
    id: 'APP-TEST-REPLACE-REQ-007',
    collegeId: '1-10972341',
    collegeName: 'Delhi Institute',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering & Technology',
    intakeProposed: 300,
    status: 'Submitted',
    submissionDate: '2026-10-20',
    lastUpdated: '2026-10-20',
    complianceScore: 50,
    flaggedIssuesCount: 0,
    documents: [
      {
        id: 'REQ-EOA-003',
        requirementId: 'REQ-EOA-003',
        name: 'Structural Stability Certificate',
        category: 'Statutory Compliances & Approvals',
        isMandatory: true,
        status: 'Uploaded',
        fileName: 'Stability_Certificate.pdf',
        uploadDate: '2026-10-20',
        version: 1,
      },
    ],
  };

  await createOrUpdateApplication(submittedApp);

  const officerRemark = 'Municipal engineer stamp is blurry. Please upload high-resolution scan of page 2.';
  const updated = await reviewApplicationDocument(submittedApp.id, 'REQ-EOA-003', {
    status: 'Replacement Required',
    remarks: officerRemark,
  });

  const doc = updated.documents.find((d) => d.id === 'REQ-EOA-003');
  assert.ok(doc);
  assert.strictEqual(doc.status, 'Replacement Required');
  assert.strictEqual(doc.adminRemarks, officerRemark);
  assert.strictEqual(updated.status, 'Clarification Requested');

  // Verify audit log has the remark
  assert.ok(updated.auditLogs && updated.auditLogs.length > 0);
  const log = updated.auditLogs[0];
  assert.strictEqual(log.action, 'REPLACEMENT_REQUESTED');
  assert.ok(log.details.includes(officerRemark));
});

// -------------------------------------------------------------
// Test 8: College resubmission after clarification
// -------------------------------------------------------------
test('8. College resubmission after clarification requires replacing flagged docs and updates existing record', async () => {
  setupFreshDatabase();

  const eoaReqs = await getChecklistRequirements('EOA', false);
  const activeMandatory = eoaReqs.filter((r) => r.isActive && r.isMandatory);

  // Setup application in Clarification Requested with all mandatory uploaded, but one is Replacement Required
  const docs: RequiredDocument[] = activeMandatory.map((req, idx) => ({
    id: req.id,
    requirementId: req.id,
    name: req.title,
    category: req.category,
    isMandatory: true,
    status: idx === 0 ? 'Replacement Required' : 'Accepted',
    fileName: `${req.id}.pdf`,
    adminRemarks: idx === 0 ? 'Resubmit with seal' : undefined,
    uploadDate: '2026-10-20',
    version: 1,
  }));

  const clarificationApp: CollegeApplication = {
    id: 'APP-TEST-RESUBMIT-008',
    collegeId: '1-10972341',
    collegeName: 'Delhi Institute',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering & Technology',
    intakeProposed: 300,
    status: 'Clarification Requested',
    submissionDate: '2026-10-20',
    lastUpdated: '2026-10-20',
    complianceScore: 85,
    flaggedIssuesCount: 1,
    documents: docs,
  };

  await createOrUpdateApplication(clarificationApp);

  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'Delhi Institute' });

  // Step 8a: Submitting before replacing flagged document must fail
  await assert.rejects(
    async () => {
      await submitCollegeApplication(clarificationApp.id);
    },
    (err: Error) => {
      assert.ok(err.message.includes("flagged as 'Replacement Required' must be replaced"));
      return true;
    }
  );

  // Step 8b: College uploads the replacement file
  const flaggedReqId = activeMandatory[0].id;
  await uploadApplicationDocument(clarificationApp.id, flaggedReqId, {
    fileName: 'Replacement_Clean_Copy.pdf',
    fileSize: '3.0 MB',
    fileType: 'application/pdf',
  });

  // Step 8c: Now submission succeeds
  const resubmittedApp = await submitCollegeApplication(clarificationApp.id);

  // Status is Submitted
  assert.strictEqual(resubmittedApp.status, 'Submitted');
  // Record is updated in place, no duplicate ID
  assert.strictEqual(resubmittedApp.id, clarificationApp.id);
  // Replaced doc is now 'Uploaded'
  const replacedDoc = resubmittedApp.documents.find((d) => d.id === flaggedReqId);
  assert.strictEqual(replacedDoc?.status, 'Uploaded');
  // Audit log records SUBMITTED
  assert.ok(resubmittedApp.auditLogs && resubmittedApp.auditLogs.length > 0);
  assert.strictEqual(resubmittedApp.auditLogs[0].action, 'SUBMITTED');
});

// -------------------------------------------------------------
// Test 9: EOA and NEW_APPROVAL checklist isolation
// -------------------------------------------------------------
test('9. EOA and NEW_APPROVAL checklists remain strictly isolated', async () => {
  setupFreshDatabase();

  const eoaReqs = await getChecklistRequirements('EOA', false);
  const newReqs = await getChecklistRequirements('NEW_APPROVAL', false);

  assert.ok(eoaReqs.length > 0);
  assert.ok(newReqs.length > 0);

  // All EOA requirements must have applicationType === 'EOA'
  for (const r of eoaReqs) {
    assert.strictEqual(r.applicationType, 'EOA');
    assert.ok(r.id.startsWith('REQ-EOA-'));
  }

  // All NEW_APPROVAL requirements must have applicationType === 'NEW_APPROVAL'
  for (const r of newReqs) {
    assert.strictEqual(r.applicationType, 'NEW_APPROVAL');
    assert.ok(r.id.startsWith('REQ-NEW-'));
  }

  // Intersection of IDs must be empty
  const eoaIds = new Set(eoaReqs.map((r) => r.id));
  for (const r of newReqs) {
    assert.strictEqual(eoaIds.has(r.id), false, `Requirement ID ${r.id} must not exist in both checklists`);
  }
});

// -------------------------------------------------------------
// Test 10: Validation not changing approval status
// -------------------------------------------------------------
test('10. Running OCR or validation does not change approval status of document or application', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'AICTE Admin' });

  const testApp: CollegeApplication = {
    id: 'APP-TEST-VAL-010',
    collegeId: '1-10972341',
    collegeName: 'Delhi Institute',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering & Technology',
    intakeProposed: 300,
    status: 'Submitted',
    submissionDate: '2026-10-20',
    lastUpdated: '2026-10-20',
    complianceScore: 50,
    flaggedIssuesCount: 0,
    documents: [
      {
        id: 'REQ-EOA-001',
        requirementId: 'REQ-EOA-001',
        name: 'Affiliation Continuation Letter 2026–27',
        category: 'Affiliation',
        isMandatory: true,
        status: 'Uploaded',
        fileName: 'Affiliation.pdf',
        uploadDate: '2026-10-20',
        version: 1,
      },
    ],
  };

  await createOrUpdateApplication(testApp);

  // Save OCR result
  const afterOcr = await saveDocumentOcrResult(testApp.id, 'REQ-EOA-001', {
    text: 'AFFILIATION ORDER EXTRACTED',
    method: 'native_pdf',
    extractedAt: '2026-10-21',
    charCount: 26,
    wordCount: 3,
  });

  assert.strictEqual(afterOcr.status, 'Submitted', 'App status must not change on OCR save');
  assert.strictEqual(afterOcr.documents[0].status, 'Uploaded', 'Doc status must not change on OCR save');
  assert.notStrictEqual(afterOcr.status, 'Documents Verified');
  assert.notStrictEqual(afterOcr.documents[0].status, 'Accepted');

  // Save validation result
  const afterVal = await saveDocumentValidationResult(testApp.id, 'REQ-EOA-001', {
    analyzedAt: '2026-10-21',
    documentVersion: 1,
    ocrSnippetPreview: 'AFFILIATION ORDER EXTRACTED',
    extractedFields: {},
    findings: [],
    summary: { passed: 3, warnings: 0, needsReview: 0, notChecked: 0 },
    overallVerdict: 'SATISFACTORY',
    authenticityStatus: 'NOT VERIFIED',
    disclaimer: 'Disclaimer',
  });

  assert.strictEqual(afterVal.status, 'Submitted', 'App status must not change on validation save');
  assert.strictEqual(afterVal.documents[0].status, 'Uploaded', 'Doc status must not change on validation save');
  assert.notStrictEqual(afterVal.status, 'Documents Verified');
  assert.notStrictEqual(afterVal.documents[0].status, 'Accepted');
});

// -------------------------------------------------------------
// Test 11: Unauthorized review attempts
// -------------------------------------------------------------
test('11. Unauthorized review attempts are rejected with Access Denied', async () => {
  setupFreshDatabase();

  const testApp: CollegeApplication = {
    id: 'APP-TEST-AUTH-011',
    collegeId: '1-10972341',
    collegeName: 'Delhi Institute',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering & Technology',
    intakeProposed: 300,
    status: 'Submitted',
    submissionDate: '2026-10-20',
    lastUpdated: '2026-10-20',
    complianceScore: 50,
    flaggedIssuesCount: 0,
    documents: [
      {
        id: 'REQ-EOA-001',
        requirementId: 'REQ-EOA-001',
        name: 'Affiliation Continuation Letter 2026–27',
        category: 'Affiliation',
        isMandatory: true,
        status: 'Uploaded',
        fileName: 'Affiliation.pdf',
        uploadDate: '2026-10-20',
        version: 1,
      },
    ],
  };

  await createOrUpdateApplication(testApp);

  // 11a: No active session
  setSession(null);
  await assert.rejects(
    async () => {
      await reviewApplicationDocument(testApp.id, 'REQ-EOA-001', { status: 'Accepted' });
    },
    (err: Error) => {
      assert.ok(err.message.includes('Access Denied'));
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await updateApplicationStatus(testApp.id, 'Approved');
    },
    (err: Error) => {
      assert.ok(err.message.includes('Access Denied'));
      return true;
    }
  );

  // 11b: College role attempting to review documents
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'Delhi Institute' });
  await assert.rejects(
    async () => {
      await reviewApplicationDocument(testApp.id, 'REQ-EOA-001', { status: 'Accepted' });
    },
    (err: Error) => {
      assert.ok(err.message.includes('Access Denied'));
      return true;
    }
  );

  // 11c: College role attempting to submit another college's application
  setSession({ role: 'college', collegeId: '1-99999999', displayName: 'Another College' });
  await assert.rejects(
    async () => {
      await submitCollegeApplication(testApp.id);
    },
    (err: Error) => {
      assert.ok(err.message.includes('Access Denied'));
      return true;
    }
  );
});

// -------------------------------------------------------------
// Test 12: EoA document upload and requirement linkage
// -------------------------------------------------------------
test('12. EoA college dossier correctly links checklist requirements and permits uploading missing documents', async () => {
  setupFreshDatabase();
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'Delhi Institute' });

  // Get active EoA requirements
  const eoaReqs = await getChecklistRequirements('EOA', true);
  assert.ok(eoaReqs.length >= 5, 'EOA must have active requirements configured');

  const app = await getApplicationById('APP-EOA-2026-001');
  assert.ok(app, 'APP-EOA-2026-001 must exist in database');

  // Verify that uploaded demo documents map to requirement IDs
  const req001 = eoaReqs.find((r) => r.id === 'REQ-EOA-001')!;
  const doc001 = app.documents.find((d) => d.requirementId === req001.id || d.id === req001.id);
  assert.ok(doc001, 'REQ-EOA-001 (Affiliation Continuation Letter) must be linked to an uploaded document');
  assert.ok(doc001.fileName, 'Linked document must have a fileName');

  // Find a missing mandatory requirement (e.g. REQ-EOA-003: Structural Stability Certificate)
  const req003 = eoaReqs.find((r) => r.id === 'REQ-EOA-003')!;
  const doc003Before = app.documents.find((d) => (d.requirementId === req003.id || d.id === req003.id) && d.status !== 'NOT_UPLOADED');
  assert.strictEqual(doc003Before, undefined, 'REQ-EOA-003 must initially be unuploaded in demo');

  // Upload missing document as college
  const updatedApp = await uploadApplicationDocument('APP-EOA-2026-001', req003.id, {
    fileName: 'structural_stability_certificate_dieat.pdf',
    fileSize: '2.8 MB',
    fileType: 'application/pdf',
    dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK...',
  });

  const doc003After = updatedApp.documents.find((d) => d.requirementId === req003.id);
  assert.ok(doc003After, 'Uploaded document must now exist for REQ-EOA-003');
  assert.strictEqual(doc003After.fileName, 'structural_stability_certificate_dieat.pdf');
  assert.strictEqual(doc003After.status, 'Uploaded');
  assert.strictEqual(doc003After.version, 1);

  // Now replace the document
  const replacedApp = await uploadApplicationDocument('APP-EOA-2026-001', req003.id, {
    fileName: 'structural_stability_v2_signed.pdf',
    fileSize: '3.1 MB',
    fileType: 'application/pdf',
    dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK...',
  });

  const doc003Replaced = replacedApp.documents.find((d) => d.requirementId === req003.id);
  assert.ok(doc003Replaced);
  assert.strictEqual(doc003Replaced.fileName, 'structural_stability_v2_signed.pdf');
  assert.strictEqual(doc003Replaced.version, 2);

  // Verify New Approval track is completely isolated and unaffected
  const newReqs = await getChecklistRequirements('NEW_APPROVAL', true);
  assert.ok(newReqs.length >= 3, 'NEW_APPROVAL requirements must exist');
  for (const nr of newReqs) {
    assert.strictEqual(nr.applicationType, 'NEW_APPROVAL');
  }
});
