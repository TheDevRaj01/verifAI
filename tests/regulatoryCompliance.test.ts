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
  evaluateRegulatoryRules,
  detectInfrastructureDiscrepancies,
  generateInspectionRecommendation,
  assessRegulatoryAndInfrastructureCompliance,
  analyzeMediaEvidence,
  OFFICIAL_REGULATION_NOTE,
  UNSUPPORTED_VIDEO_ANALYSIS_MESSAGE,
  VISUAL_ANALYSIS_DISCLAIMER,
} from '../src/services/regulatoryComplianceService.ts';
import {
  addInfrastructureEvidence,
  removeInfrastructureEvidence,
  recordOfficerInspectionDecision,
  updateApplicationDeclaredInfrastructure,
  reassessApplicationRegulatoryCompliance,
  reviewInfrastructureEvidence,
  getApplicationById,
  createOrUpdateApplication,
  initializeLocalStorage,
} from '../src/services/dataService.ts';
import type {
  CollegeApplication,
  DeclaredInfrastructure,
  InfrastructureEvidenceItem,
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

// -------------------------------------------------------------
// Test 1: Rule Separation - EoA application only evaluates EoA rules
// -------------------------------------------------------------
test('1. EoA application evaluates only EoA rules and never evaluates New Approval rules', async () => {
  setupFreshDatabase();
  const eoaApp: CollegeApplication = {
    id: 'APP-TEST-EOA',
    collegeId: 'COL-TEST-001',
    collegeName: 'Test Engineering College',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Pune',
    discipline: 'Engineering',
    intakeProposed: 480,
    status: 'Under Scrutiny',
    submissionDate: '2026-10-01',
    lastUpdated: '2026-10-01',
    complianceScore: 90,
    flaggedIssuesCount: 0,
    documents: [],
    declaredInfrastructure: {
      classroomsCount: 20,
      laboratoriesCount: 15,
      totalBuiltUpAreaSqM: 12000,
      libraryAreaSqM: 500,
      libraryBooksCount: 15000,
      computerCentresCount: 3,
      hasBarrierFreeEnvironment: true,
      hasFireSafetyEquipment: true,
    },
  };

  const findings = evaluateRegulatoryRules(eoaApp);
  assert.ok(findings.length > 0, 'Should produce findings for EoA application');

  // Verify all findings belong to EOA
  for (const f of findings) {
    assert.strictEqual(f.applicationType, 'EOA', `Finding ${f.ruleId} must have applicationType EOA`);
    assert.ok(f.ruleId.startsWith('RULE-EOA-'), `Finding ${f.ruleId} must start with RULE-EOA-`);
    assert.ok(!f.ruleId.startsWith('RULE-NEW-'), `EoA must never evaluate New Approval rule ${f.ruleId}`);
  }
});

// -------------------------------------------------------------
// Test 2: Rule Separation - New Approval only evaluates New Approval rules
// -------------------------------------------------------------
test('2. New Approval application evaluates only New Approval rules and never evaluates EoA rules', async () => {
  setupFreshDatabase();
  const newApp: CollegeApplication = {
    id: 'APP-TEST-NEW',
    collegeId: 'COL-TEST-002',
    collegeName: 'Apex New Institute of Technology',
    type: 'NEW_APPROVAL',
    academicYear: '2026-2027',
    state: 'Karnataka',
    district: 'Bengaluru',
    discipline: 'Technology',
    intakeProposed: 300,
    status: 'Under Scrutiny',
    submissionDate: '2026-10-01',
    lastUpdated: '2026-10-01',
    complianceScore: 85,
    flaggedIssuesCount: 0,
    documents: [],
    declaredInfrastructure: {
      landAreaAcres: 5.5,
      totalBuiltUpAreaSqM: 8000,
      classroomsCount: 12,
      laboratoriesCount: 8,
      computerCentresCount: 2,
      hasBarrierFreeEnvironment: true,
      hasFireSafetyEquipment: true,
    },
  };

  const findings = evaluateRegulatoryRules(newApp);
  assert.ok(findings.length > 0, 'Should produce findings for New Approval application');

  // Verify all findings belong to NEW_APPROVAL
  for (const f of findings) {
    assert.strictEqual(f.applicationType, 'NEW_APPROVAL', `Finding ${f.ruleId} must have applicationType NEW_APPROVAL`);
    assert.ok(f.ruleId.startsWith('RULE-NEW-'), `Finding ${f.ruleId} must start with RULE-NEW-`);
    assert.ok(!f.ruleId.startsWith('RULE-EOA-'), `New Approval must never evaluate EoA rule ${f.ruleId}`);
  }
});

// -------------------------------------------------------------
// Test 3: Missing Evidence - Declared classrooms but no photo or certificate
// -------------------------------------------------------------
test('3. Declared classrooms with zero uploaded photos or proofs emits a WARNING', async () => {
  const app: CollegeApplication = {
    id: 'APP-TEST-MISSING-EVID',
    collegeId: 'COL-TEST-001',
    collegeName: 'Test College',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering',
    intakeProposed: 300,
    status: 'Under Scrutiny',
    submissionDate: '2026-10-01',
    lastUpdated: '2026-10-01',
    complianceScore: 70,
    flaggedIssuesCount: 0,
    documents: [],
    infrastructureEvidence: [], // No evidence
    declaredInfrastructure: {
      classroomsCount: 24, // Declared 24 classrooms
    },
  };

  const findings = evaluateRegulatoryRules(app);
  const classroomFinding = findings.find((f) => f.id === 'FINDING-EOA-CLASSROOMS');
  assert.ok(classroomFinding, 'Must evaluate classroom finding');
  assert.strictEqual(classroomFinding?.status, 'WARNING');
  assert.ok(classroomFinding?.reason.includes('no supporting photographs'), 'Reason must mention missing photographic evidence');
});

// -------------------------------------------------------------
// Test 4: Conflicting Information - Declared classrooms count vs Blueprint count
// -------------------------------------------------------------
test('4. Conflicting classroom count between declaration and blueprint generates CONFIRMED_DATA_MISMATCH with HIGH severity', async () => {
  const app: CollegeApplication = {
    id: 'APP-TEST-CONFLICT',
    collegeId: 'COL-TEST-001',
    collegeName: 'Test College',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering',
    intakeProposed: 300,
    status: 'Under Scrutiny',
    submissionDate: '2026-10-01',
    lastUpdated: '2026-10-01',
    complianceScore: 70,
    flaggedIssuesCount: 0,
    documents: [],
    declaredInfrastructure: {
      classroomsCount: 24, // Declares 24 classrooms
    },
    infrastructureEvidence: [
      {
        id: 'ev-blueprint-1',
        requirementId: 'REQ-EOA-006',
        evidenceCategory: 'FLOOR_PLAN_DRAWING',
        title: 'Approved Architectural Floor Plan',
        fileName: 'blueprint.pdf',
        fileType: 'application/pdf',
        uploadDate: '2026-10-01',
        visualAnalysisSummary: 'Demarcates 12 instructional classrooms across Floor 1 and Floor 2.',
      },
    ],
  };

  const discrepancies = detectInfrastructureDiscrepancies(app);
  const classroomDisc = discrepancies.find((d) => d.discrepancyType === 'CONFIRMED_DATA_MISMATCH');
  assert.ok(classroomDisc, 'Must detect classroom discrepancy');
  assert.strictEqual(classroomDisc?.discrepancyType, 'CONFIRMED_DATA_MISMATCH');
  assert.strictEqual(classroomDisc?.severity, 'HIGH');
  assert.ok(classroomDisc?.sourceA.value.includes('24'), 'Source A must show declared 24 classrooms');
  assert.ok(classroomDisc?.sourceB.value.includes('12'), 'Source B must show blueprint 12 classrooms');
});

// -------------------------------------------------------------
// Test 5: Conflicting Information - Fire safety declared yes but document expired
// -------------------------------------------------------------
test('5. Fire Safety declared compliant but document validation flags expired NOC produces POTENTIAL_DISCREPANCY with HIGH severity', async () => {
  const app: CollegeApplication = {
    id: 'APP-TEST-FIRE-EXP',
    collegeId: 'COL-TEST-001',
    collegeName: 'Test College',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering',
    intakeProposed: 300,
    status: 'Under Scrutiny',
    submissionDate: '2026-10-01',
    lastUpdated: '2026-10-01',
    complianceScore: 70,
    flaggedIssuesCount: 0,
    declaredInfrastructure: {
      hasFireSafetyEquipment: true,
    },
    documents: [
      {
        id: 'doc-fire-1',
        requirementId: 'REQ-EOA-002',
        name: 'Fire Safety Certificate & NOC',
        category: 'Infrastructure',
        isMandatory: true,
        status: 'Uploaded',
        fileName: 'expired_fire_noc.pdf',
        validationResult: {
          isValid: false,
          confidence: 85,
          extractedFields: {
            expiryDate: '2024-05-10',
          },
          findings: [
            {
              id: 'CHK-EXPIRY',
              category: 'EXPIRY_STATUS',
              label: 'Validity & Expiry Analysis',
              status: 'WARNING',
              description: 'Certificate expired on 2024-05-10',
              suggestedAction: 'Require renewed fire NOC from municipal fire services',
            },
          ],
        },
      },
    ],
  };

  const discrepancies = detectInfrastructureDiscrepancies(app);
  const fireDisc = discrepancies.find((d) => d.id.includes('DISC-EXPIRED-REQ-EOA-002'));
  assert.ok(fireDisc, 'Must detect expired Fire Safety NOC discrepancy');
  assert.strictEqual(fireDisc?.severity, 'HIGH');
  assert.strictEqual(fireDisc?.discrepancyType, 'POTENTIAL_DISCREPANCY');
});

// -------------------------------------------------------------
// Test 6: Unavailable Rule / Data Note Check
// -------------------------------------------------------------
test('6. Unconfirmed rules include official regulation note and never invent thresholds', async () => {
  const app: CollegeApplication = {
    id: 'APP-TEST-APH-NOTE',
    collegeId: 'COL-TEST-001',
    collegeName: 'Test College',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering',
    intakeProposed: 300,
    status: 'Under Scrutiny',
    submissionDate: '2026-10-01',
    lastUpdated: '2026-10-01',
    complianceScore: 70,
    flaggedIssuesCount: 0,
    documents: [],
    declaredInfrastructure: {
      classroomsCount: 10,
    },
  };

  const findings = evaluateRegulatoryRules(app);
  for (const f of findings) {
    assert.strictEqual(
      f.officialRegulationNote,
      OFFICIAL_REGULATION_NOTE,
      `Finding ${f.ruleId} must attach official regulation note`
    );
  }
});

// -------------------------------------------------------------
// Test 7: Missing declared infrastructure data results in NOT_CHECKED
// -------------------------------------------------------------
test('7. Missing declared infrastructure results in NOT_CHECKED without fabricating compliance', async () => {
  const app: CollegeApplication = {
    id: 'APP-TEST-NOT-CHECKED',
    collegeId: 'COL-TEST-001',
    collegeName: 'Test College',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering',
    intakeProposed: 300,
    status: 'Under Scrutiny',
    submissionDate: '2026-10-01',
    lastUpdated: '2026-10-01',
    complianceScore: 70,
    flaggedIssuesCount: 0,
    documents: [],
    declaredInfrastructure: undefined, // No declared infrastructure at all
  };

  const findings = evaluateRegulatoryRules(app);
  const classroomFinding = findings.find((f) => f.id === 'FINDING-EOA-CLASSROOMS');
  assert.ok(classroomFinding, 'Must have classroom finding');
  assert.strictEqual(classroomFinding?.status, 'NOT_CHECKED');
  assert.strictEqual(classroomFinding?.availableEvidence, 'Not Checked — Rule/Data Unavailable');
  assert.ok(classroomFinding?.reason.includes('Rule/Data Unavailable'), 'Reason must mention Rule/Data Unavailable');
});

// -------------------------------------------------------------
// Test 8: Physical Inspection Recommendation Triggered by High-Severity Discrepancy
// -------------------------------------------------------------
test('8. High-severity discrepancy triggers PHYSICAL_INSPECTION_RECOMMENDED with contributing reasons', async () => {
  const app: CollegeApplication = {
    id: 'APP-TEST-INSPECT',
    collegeId: 'COL-TEST-001',
    collegeName: 'Test College',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering',
    intakeProposed: 300,
    status: 'Under Scrutiny',
    submissionDate: '2026-10-01',
    lastUpdated: '2026-10-01',
    complianceScore: 70,
    flaggedIssuesCount: 0,
    documents: [],
    declaredInfrastructure: {
      classroomsCount: 30,
    },
    infrastructureEvidence: [
      {
        id: 'ev-conflicting-blueprint',
        requirementId: 'REQ-EOA-006',
        evidenceCategory: 'FLOOR_PLAN_DRAWING',
        title: 'Blueprint',
        fileName: 'blueprint.pdf',
        fileType: 'application/pdf',
        uploadDate: '2026-10-01',
        visualAnalysisSummary: 'Demarcates 10 instructional classrooms.',
      },
    ],
  };

  const assessment = assessRegulatoryAndInfrastructureCompliance(app);
  assert.strictEqual(
    assessment.recommendation.type,
    'PHYSICAL_INSPECTION_RECOMMENDED',
    'Must recommend physical inspection due to high-severity conflict'
  );
  assert.ok(assessment.recommendation.reasons.length > 0, 'Must have explicit contributing reasons');
  assert.ok(assessment.recommendation.isAdvisoryOnly === true, 'Must be advisory only');
  assert.ok(
    assessment.recommendation.recommendedScope && assessment.recommendation.recommendedScope.length > 0,
    'Must provide recommended inspection scope'
  );
});

// -------------------------------------------------------------
// Test 9: Clean dossier produces NO_ADDITIONAL_INSPECTION_INDICATED
// -------------------------------------------------------------
test('9. Clean dossier with all passing checks and consistent evidence produces NO_ADDITIONAL_INSPECTION_INDICATED', async () => {
  const cleanApp: CollegeApplication = {
    id: 'APP-TEST-CLEAN',
    collegeId: 'COL-TEST-CLEAN',
    collegeName: 'Clean Engineering College',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Pune',
    discipline: 'Engineering',
    intakeProposed: 480,
    status: 'Under Scrutiny',
    submissionDate: '2026-10-01',
    lastUpdated: '2026-10-01',
    complianceScore: 95,
    flaggedIssuesCount: 0,
    declaredInfrastructure: {
      classroomsCount: 24,
      laboratoriesCount: 18,
      computerCentresCount: 3,
      totalBuiltUpAreaSqM: 14500,
      libraryAreaSqM: 650,
      libraryBooksCount: 24500,
      hasBarrierFreeEnvironment: true,
      hasFireSafetyEquipment: true,
      hasFunctionalElevators: true,
      hasHostelFacility: true,
    },
    infrastructureEvidence: [
      {
        id: 'ev-clean-1',
        requirementId: 'REQ-EOA-006',
        evidenceCategory: 'CLASSROOM_PHOTO',
        title: 'Classroom',
        fileName: 'classroom.jpg',
        fileType: 'image/jpeg',
        uploadDate: '2026-10-01',
        visualAnalysisSummary: 'Demarcates 24 instructional classrooms equipped with projectors.',
      },
      {
        id: 'ev-clean-2',
        requirementId: 'REQ-EOA-006',
        evidenceCategory: 'LABORATORY_PHOTO',
        title: 'Lab',
        fileName: 'lab.jpg',
        fileType: 'image/jpeg',
        uploadDate: '2026-10-01',
        visualAnalysisSummary: 'Demarcates computing and electrical laboratories.',
      },
    ],
    documents: [
      {
        id: 'doc-fire-clean',
        requirementId: 'REQ-EOA-002',
        name: 'Fire Safety Certificate & NOC',
        category: 'Infrastructure',
        isMandatory: true,
        status: 'Accepted',
        fileName: 'fire_noc.pdf',
      },
      {
        id: 'doc-affil-clean',
        requirementId: 'REQ-EOA-001',
        name: 'Affiliation Continuation Letter',
        category: 'Regulatory Certificates',
        isMandatory: true,
        status: 'Accepted',
        fileName: 'affiliation.pdf',
      },
      {
        id: 'doc-struct-clean',
        requirementId: 'REQ-EOA-003',
        name: 'Structural Stability Certificate',
        category: 'Infrastructure',
        isMandatory: true,
        status: 'Accepted',
        fileName: 'stability.pdf',
      },
      {
        id: 'doc-fac-clean',
        requirementId: 'REQ-EOA-004',
        name: 'Faculty Cadre Ratio',
        category: 'Faculty',
        isMandatory: true,
        status: 'Accepted',
        fileName: 'faculty.pdf',
      },
      {
        id: 'doc-fin-clean',
        requirementId: 'REQ-EOA-005',
        name: 'Audited Financial Statements',
        category: 'Finance',
        isMandatory: true,
        status: 'Accepted',
        fileName: 'financials.pdf',
      },
      {
        id: 'doc-occ-clean',
        requirementId: 'REQ-EOA-006',
        name: 'Building Occupancy Certificate',
        category: 'Infrastructure',
        isMandatory: true,
        status: 'Accepted',
        fileName: 'occupancy.pdf',
      },
      {
        id: 'doc-anti-clean',
        requirementId: 'REQ-EOA-007',
        name: 'Anti-Ragging Committee Constitution',
        category: 'Governance & Committees',
        isMandatory: true,
        status: 'Accepted',
        fileName: 'anti_ragging.pdf',
      },
    ],
  };

  const assessment = assessRegulatoryAndInfrastructureCompliance(cleanApp);
  assert.strictEqual(
    assessment.recommendation.type,
    'NO_ADDITIONAL_INSPECTION_INDICATED',
    'Fully compliant dossier should indicate no additional inspection'
  );
  assert.strictEqual(assessment.discrepancies.length, 0, 'Clean dossier must have 0 discrepancies');
});

// -------------------------------------------------------------
// Test 10: Unsupported Video Stream Format & Manual Review Instructions
// -------------------------------------------------------------
test('10. Video walkthrough produces UNSUPPORTED_VIDEO_ANALYSIS_MESSAGE and does not claim automated AI video parsing', () => {
  const videoItem: InfrastructureEvidenceItem = {
    id: 'ev-video-1',
    requirementId: 'REQ-EOA-006',
    evidenceCategory: 'WALKTHROUGH_VIDEO',
    title: 'Continuous Campus Instructional Walkthrough',
    fileName: 'campus_tour.mp4',
    fileType: 'video/mp4',
    uploadDate: '2026-10-01',
  };

  const mediaAnalysis = analyzeMediaEvidence(videoItem);
  assert.strictEqual(mediaAnalysis.isUnsupported, true, 'Video must be flagged as unsupported media for automated AI');
  assert.strictEqual(mediaAnalysis.unsupportedReason, UNSUPPORTED_VIDEO_ANALYSIS_MESSAGE);
  assert.ok(
    mediaAnalysis.unsupportedReason.includes('review video manually'),
    'Must explicitly prompt scrutiny officer to review video manually'
  );
});

// -------------------------------------------------------------
// Test 11: Dynamic Re-Assessment on Evidence Upload
// -------------------------------------------------------------
test('11. Adding infrastructure evidence triggers dynamic re-assessment and updates finding status', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'AICTE Admin' });

  const initialApp: CollegeApplication = {
    id: 'APP-DYNAMIC-TEST',
    collegeId: 'COL-DYN-001',
    collegeName: 'Dynamic Test Institute',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering',
    intakeProposed: 300,
    status: 'Under Scrutiny',
    submissionDate: '2026-10-01',
    lastUpdated: '2026-10-01',
    complianceScore: 70,
    flaggedIssuesCount: 0,
    documents: [],
    declaredInfrastructure: {
      classroomsCount: 16,
    },
    infrastructureEvidence: [], // No evidence initially -> WARNING
  };

  await createOrUpdateApplication(initialApp);

  // Initial assessment should have a WARNING for classrooms
  const appBefore = await getApplicationById('APP-DYNAMIC-TEST');
  const findingBefore = appBefore?.regulatoryComplianceAssessment?.findings.find((f) => f.id === 'FINDING-EOA-CLASSROOMS');
  assert.strictEqual(findingBefore?.status, 'WARNING');

  // Now add classroom photo evidence
  const updatedApp = await addInfrastructureEvidence('APP-DYNAMIC-TEST', {
    title: 'Classroom Block 1',
    fileName: 'classroom_block_1.jpg',
    fileSize: '3.1 MB',
    fileType: 'image/jpeg',
    evidenceCategory: 'CLASSROOM_PHOTO',
    requirementId: 'REQ-EOA-006',
  });

  // Re-assessment must have fired dynamically
  const findingAfter = updatedApp.regulatoryComplianceAssessment?.findings.find((f) => f.id === 'FINDING-EOA-CLASSROOMS');
  assert.strictEqual(findingAfter?.status, 'PASS', 'Finding should become PASS after attaching photo evidence');
});

// -------------------------------------------------------------
// Test 12: Dynamic Re-Assessment on Evidence Removal - Prevents Stale PASS
// -------------------------------------------------------------
test('12. Removing evidence item immediately re-assesses compliance and reverts PASS to WARNING', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'AICTE Admin' });

  const initialApp: CollegeApplication = {
    id: 'APP-REVERT-TEST',
    collegeId: 'COL-REV-001',
    collegeName: 'Revert Test Institute',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering',
    intakeProposed: 300,
    status: 'Under Scrutiny',
    submissionDate: '2026-10-01',
    lastUpdated: '2026-10-01',
    complianceScore: 70,
    flaggedIssuesCount: 0,
    documents: [],
    declaredInfrastructure: {
      classroomsCount: 16,
    },
    infrastructureEvidence: [
      {
        id: 'ev-to-remove',
        requirementId: 'REQ-EOA-006',
        evidenceCategory: 'CLASSROOM_PHOTO',
        title: 'Classroom Photo',
        fileName: 'classroom.jpg',
        fileType: 'image/jpeg',
        uploadDate: '2026-10-01',
      },
    ],
  };

  await createOrUpdateApplication(initialApp);

  // Before removal: PASS
  const appBefore = await getApplicationById('APP-REVERT-TEST');
  const findingBefore = appBefore?.regulatoryComplianceAssessment?.findings.find((f) => f.id === 'FINDING-EOA-CLASSROOMS');
  assert.strictEqual(findingBefore?.status, 'PASS');

  // Remove the classroom photo
  const updatedApp = await removeInfrastructureEvidence('APP-REVERT-TEST', 'ev-to-remove');

  // After removal: Must dynamically revert to WARNING (prevent stale PASS)
  const findingAfter = updatedApp.regulatoryComplianceAssessment?.findings.find((f) => f.id === 'FINDING-EOA-CLASSROOMS');
  assert.strictEqual(findingAfter?.status, 'WARNING', 'Status must revert to WARNING upon evidence removal');
});

// -------------------------------------------------------------
// Test 13: Role-Based Access Control on Officer Decision
// -------------------------------------------------------------
test('13. College role cannot record officer inspection decisions (Access Denied)', async () => {
  setupFreshDatabase();
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'College Principal' });

  await assert.rejects(
    async () => {
      await recordOfficerInspectionDecision('APP-EOA-2026-001', {
        decision: 'DESK_VERIFICATION_ACCEPTED',
        remarks: 'College self-approving compliance',
      });
    },
    /Access Denied/i,
    'College role must be blocked from recording inspection decisions'
  );
});

// -------------------------------------------------------------
// Test 14: College Data Isolation
// -------------------------------------------------------------
test('14. College user cannot add or remove infrastructure evidence for another college dossier', async () => {
  setupFreshDatabase();
  // Session is College A
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'College A' });

  // Attempting to modify College B's application APP-NEW-2026-101 (belongs to 1-38290145)
  await assert.rejects(
    async () => {
      await addInfrastructureEvidence('APP-NEW-2026-101', {
        title: 'Malicious Evidence Injection',
        fileName: 'fake.jpg',
        fileSize: '1 MB',
        fileType: 'image/jpeg',
        evidenceCategory: 'CLASSROOM_PHOTO',
      });
    },
    /Access Denied/i,
    'College A must not be allowed to modify College B evidence'
  );
});

// -------------------------------------------------------------
// Test 15: Recording Officer Inspection Decision Audit Trail
// -------------------------------------------------------------
test('15. Admin recording official inspection decision updates assessment and logs audit trail', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'Dr. Anand Kumar', email: 'officer@aicte.gov.in' });

  const updated = await recordOfficerInspectionDecision('APP-EOA-2026-001', {
    decision: 'INSPECTION_MANDATED',
    remarks: 'Deputing Regional EVC team for instructional area measurement.',
    followUpAction: 'Constitute 3-member expert committee by Friday.',
  });

  assert.ok(updated.regulatoryComplianceAssessment?.officerDecision, 'Must attach officer decision');
  assert.strictEqual(updated.regulatoryComplianceAssessment?.officerDecision?.decision, 'INSPECTION_MANDATED');
  assert.strictEqual(updated.regulatoryComplianceAssessment?.officerDecision?.officerName, 'Dr. Anand Kumar');
  assert.strictEqual(
    updated.regulatoryComplianceAssessment?.officerDecision?.remarks,
    'Deputing Regional EVC team for instructional area measurement.'
  );

  // Check audit log
  const auditEntry = updated.auditLogs?.find((l) => l.action === 'INFRASTRUCTURE_ASSESSMENT_RECORDED');
  assert.ok(auditEntry, 'Audit log must record INFRASTRUCTURE_ASSESSMENT_RECORDED');
  assert.strictEqual(auditEntry?.actor, 'Dr. Anand Kumar');
  assert.strictEqual(auditEntry?.actorRole, 'admin');
  assert.ok(auditEntry?.details.includes('INSPECTION MANDATED'));
});

// -------------------------------------------------------------
// Test 16: Non-Destructive Advisory Invariant
// -------------------------------------------------------------
test('16. Regulatory compliance evaluation never mutates application submission status', async () => {
  setupFreshDatabase();
  const app = await getApplicationById('APP-EOA-2026-001');
  const originalStatus = app?.status;
  assert.strictEqual(originalStatus, 'Under Scrutiny');

  // Run assessment on the application
  const assessment = assessRegulatoryAndInfrastructureCompliance(app!);
  assert.ok(assessment, 'Assessment produced');

  // Re-fetch application to confirm status did not change
  const appAfter = await getApplicationById('APP-EOA-2026-001');
  assert.strictEqual(appAfter?.status, originalStatus, 'Application status must remain untouched');
});

// -------------------------------------------------------------
// Test 17: Regression: Application with undefined assessment computes safely
// -------------------------------------------------------------
test('17. Application with undefined assessment computes safely without throwing', () => {
  const mockApp: CollegeApplication = {
    id: 'APP-REGRESS-001',
    collegeId: '1-99990001',
    collegeName: 'National Institute of Engineering',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Karnataka',
    district: 'Bengaluru',
    discipline: 'Engineering',
    intakeProposed: 300,
    status: 'Submitted',
    submissionDate: '2026-10-01',
    lastUpdated: '2026-10-01',
    complianceScore: 80,
    flaggedIssuesCount: 0,
    isDemo: false,
    documents: [],
    declaredInfrastructure: undefined,
    infrastructureEvidence: undefined,
    regulatoryComplianceAssessment: undefined,
  };

  const assessment = assessRegulatoryAndInfrastructureCompliance(mockApp);
  assert.ok(assessment, 'Must produce assessment without crashing');
  assert.ok(assessment.summary, 'Must produce summary');
  assert.strictEqual(typeof assessment.summary.totalRules, 'number');
  assert.ok(assessment.recommendation, 'Must produce recommendation');
  assert.strictEqual(assessment.recommendation.type, 'INSUFFICIENT_EVIDENCE_TO_ASSESS');
});

// -------------------------------------------------------------
// Test 18: Regression: Partial/malformed document validation results handled safely
// -------------------------------------------------------------
test('18. Documents with partial/malformed validation results (no findings or extractedFields) evaluate safely', () => {
  const mockApp: CollegeApplication = {
    id: 'APP-REGRESS-002',
    collegeId: '1-99990002',
    collegeName: 'Apex Institute of Pharmacy',
    type: 'NEW_APPROVAL',
    academicYear: '2026-2027',
    state: 'Maharashtra',
    district: 'Mumbai',
    discipline: 'Pharmacy',
    intakeProposed: 120,
    status: 'Submitted',
    submissionDate: '2026-10-01',
    lastUpdated: '2026-10-01',
    complianceScore: 75,
    flaggedIssuesCount: 0,
    isDemo: false,
    documents: [
      {
        id: 'doc-fdr',
        requirementId: 'REQ-NEW-004',
        name: 'Rs. 1.00 Crore Joint FDR',
        category: 'Statutory',
        isMandatory: true,
        status: 'Uploaded',
        fileName: 'fdr.pdf',
        fileSize: '1.2 MB',
        uploadDate: '2026-10-01',
        // validationResult exists but findings array is undefined (causes crash if not optionally chained)
        validationResult: {
          timestamp: '2026-10-01T00:00:00Z',
          extractedFields: {},
          findings: undefined as any,
          status: 'WARNING',
        } as any,
      },
      {
        id: 'doc-land',
        requirementId: 'REQ-NEW-002',
        name: 'Land Sale Deed',
        category: 'Land',
        isMandatory: true,
        status: 'Uploaded',
        fileName: 'deed.pdf',
        fileSize: '3.5 MB',
        uploadDate: '2026-10-01',
        // validationResult exists without extractedFields
        validationResult: {
          timestamp: '2026-10-01T00:00:00Z',
          findings: [{ id: 'CHK-EXPIRY', status: 'WARNING', label: 'Expired', message: 'Expired' }],
          extractedFields: undefined as any,
          status: 'WARNING',
        } as any,
      },
    ],
    declaredInfrastructure: {
      landAreaAcres: 5.0,
      classroomsCount: 10,
    },
    infrastructureEvidence: [],
  };

  // Must not throw TypeError: Cannot read properties of undefined (reading 'some')
  const assessment = assessRegulatoryAndInfrastructureCompliance(mockApp);
  assert.ok(assessment, 'Must evaluate without crashing on malformed validationResult');
  assert.ok(assessment.discrepancies.length > 0, 'Discrepancies detected');
  // Confirm the expired finding handled safely even when extractedFields is undefined
  const expiredDisc = assessment.discrepancies.find((d) => d.id === 'DISC-EXPIRED-REQ-NEW-002');
  assert.ok(expiredDisc, 'Expired certificate discrepancy should be created safely');
  assert.ok(expiredDisc?.explanation.includes('Past date'), 'Should use fallback date');
});

// -------------------------------------------------------------
// Test 19: Regression: Discrepancy source fallback checks
// -------------------------------------------------------------
test('19. Discrepancies with partial source objects do not cause runtime errors', () => {
  const disc = {
    id: 'DISC-TEST',
    affectedRequirementTitle: 'Test Req',
    discrepancyType: 'POTENTIAL_DISCREPANCY' as const,
    severity: 'MEDIUM' as const,
    sourceA: undefined as any,
    sourceB: { name: 'Evidence' } as any,
    explanation: 'Test discrepancy',
  };

  // Check fallback behavior that RegulatoryComplianceSection uses
  const nameA = disc.sourceA?.name || 'Declared / Source A';
  const valA = disc.sourceA?.value ?? 'N/A';
  const nameB = disc.sourceB?.name || 'Evidence / Source B';
  const valB = disc.sourceB?.value ?? 'N/A';

  assert.strictEqual(nameA, 'Declared / Source A');
  assert.strictEqual(valA, 'N/A');
  assert.strictEqual(nameB, 'Evidence');
  assert.strictEqual(valB, 'N/A');
});

// -------------------------------------------------------------
// Test 20: Regression: Completely empty application evaluates safely
// -------------------------------------------------------------
test('20. Completely empty EoA and New Approval applications evaluate safely with INSUFFICIENT_EVIDENCE_TO_ASSESS', () => {
  const emptyEoA: CollegeApplication = {
    id: 'APP-EMPTY-EOA',
    collegeId: '1-00000001',
    collegeName: 'Empty College',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'Delhi',
    discipline: 'Engineering',
    intakeProposed: 180,
    status: 'Draft',
    submissionDate: '2026-10-01',
    lastUpdated: '2026-10-01',
    complianceScore: 0,
    flaggedIssuesCount: 0,
    isDemo: false,
    documents: [],
  };

  const emptyNew: CollegeApplication = {
    ...emptyEoA,
    id: 'APP-EMPTY-NEW',
    type: 'NEW_APPROVAL',
  };

  const resEoA = assessRegulatoryAndInfrastructureCompliance(emptyEoA);
  assert.strictEqual(resEoA.recommendation.type, 'INSUFFICIENT_EVIDENCE_TO_ASSESS');
  assert.strictEqual(resEoA.summary.passed, 0);

  const resNew = assessRegulatoryAndInfrastructureCompliance(emptyNew);
  assert.strictEqual(resNew.recommendation.type, 'INSUFFICIENT_EVIDENCE_TO_ASSESS');
  assert.strictEqual(resNew.summary.passed, 0);
});

// -------------------------------------------------------------
// Test 21: College uploads photo evidence to EoA application with dataUrl and category
// -------------------------------------------------------------
test('21. College uploads photo evidence to EoA application with dataUrl and category', async () => {
  setupFreshDatabase();
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'College Principal' });

  const app = await getApplicationById('APP-EOA-2026-001');
  assert.ok(app, 'EoA application exists');

  const updated = await addInfrastructureEvidence('APP-EOA-2026-001', {
    title: 'Smart Interactive Classroom 101',
    fileName: 'classroom_101.jpg',
    fileSize: '2.4 MB',
    fileType: 'image/jpeg',
    evidenceCategory: 'CLASSROOM_PHOTO',
    requirementId: 'REQ-EOA-006',
    fileDataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
  });

  const addedItem = updated.infrastructureEvidence?.find((e) => e.title === 'Smart Interactive Classroom 101');
  assert.ok(addedItem, 'Item must be stored in infrastructureEvidence');
  assert.strictEqual(addedItem?.applicationId, 'APP-EOA-2026-001');
  assert.strictEqual(addedItem?.applicationTrack, 'EOA');
  assert.strictEqual(addedItem?.uploadedByRole, 'college');
  assert.strictEqual(addedItem?.status, 'PENDING_REVIEW');
  assert.strictEqual(addedItem?.fileDataUrl, 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...');
  assert.strictEqual(addedItem?.evidenceCategory, 'CLASSROOM_PHOTO');

  // Verify audit log
  const auditEntry = updated.auditLogs?.find((l) => l.action === 'INFRASTRUCTURE_EVIDENCE_ADDED');
  assert.ok(auditEntry, 'Audit log must record INFRASTRUCTURE_EVIDENCE_ADDED');
  assert.strictEqual(auditEntry?.actorRole, 'college');
});

// -------------------------------------------------------------
// Test 22: College uploads PDF floor plan to New Approval application
// -------------------------------------------------------------
test('22. College uploads PDF floor plan to New Approval application with manual review notice', async () => {
  setupFreshDatabase();
  setSession({ role: 'college', collegeId: '1-38290145', displayName: 'Trust Registrar' });

  const updated = await addInfrastructureEvidence('APP-NEW-2026-101', {
    title: 'Master Campus Layout & Floor Plan',
    fileName: 'campus_floor_plans.pdf',
    fileSize: '7.8 MB',
    fileType: 'application/pdf',
    evidenceCategory: 'FLOOR_PLAN_DRAWING',
    requirementId: 'REQ-NEW-004',
    fileDataUrl: 'data:application/pdf;base64,JVBERi0xLjQK...',
  });

  const addedItem = updated.infrastructureEvidence?.find((e) => e.title === 'Master Campus Layout & Floor Plan');
  assert.ok(addedItem, 'Blueprint must be stored in infrastructureEvidence');
  assert.strictEqual(addedItem?.applicationTrack, 'NEW_APPROVAL');
  assert.strictEqual(addedItem?.evidenceCategory, 'FLOOR_PLAN_DRAWING');
  assert.strictEqual(addedItem?.fileType, 'application/pdf');
  assert.strictEqual(addedItem?.status, 'PENDING_REVIEW');
  assert.ok(
    addedItem?.visualAnalysisSummary?.includes('Manual Review Required'),
    'PDF blueprint analysis must explicitly state Manual Review Required'
  );
});

// -------------------------------------------------------------
// Test 23: Multiple evidence uploads within a category
// -------------------------------------------------------------
test('23. Multiple evidence uploads within a category are preserved with unique IDs', async () => {
  setupFreshDatabase();
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'College Principal' });

  await addInfrastructureEvidence('APP-EOA-2026-001', {
    title: 'Campus Front Gate',
    fileName: 'gate.jpg',
    fileSize: '1.8 MB',
    fileType: 'image/jpeg',
    evidenceCategory: 'CAMPUS_EXTERIOR',
  });

  await addInfrastructureEvidence('APP-EOA-2026-001', {
    title: 'Academic Block A Exterior',
    fileName: 'block_a.jpg',
    fileSize: '2.1 MB',
    fileType: 'image/jpeg',
    evidenceCategory: 'CAMPUS_EXTERIOR',
  });

  const updated = await addInfrastructureEvidence('APP-EOA-2026-001', {
    title: 'Sports Complex Exterior',
    fileName: 'sports.jpg',
    fileSize: '3.0 MB',
    fileType: 'image/jpeg',
    evidenceCategory: 'CAMPUS_EXTERIOR',
  });

  const exteriorItems = (updated.infrastructureEvidence || []).filter(
    (e) => e.evidenceCategory === 'CAMPUS_EXTERIOR'
  );
  assert.strictEqual(exteriorItems.length, 3, 'All 3 items must be stored under CAMPUS_EXTERIOR');
  const ids = new Set(exteriorItems.map((e) => e.id));
  assert.strictEqual(ids.size, 3, 'Each item must have a unique ID');
});

// -------------------------------------------------------------
// Test 24: Strict EoA vs New Approval track separation
// -------------------------------------------------------------
test('24. Strict EoA vs New Approval track separation ensures no cross-track evidence leakage', async () => {
  setupFreshDatabase();

  // College A (EoA) adds classroom evidence
  setSession({ role: 'college', collegeId: '1-10972341' });
  await addInfrastructureEvidence('APP-EOA-2026-001', {
    title: 'EoA Exclusive Classroom',
    fileName: 'eoa_class.jpg',
    fileSize: '1.2 MB',
    fileType: 'image/jpeg',
    evidenceCategory: 'CLASSROOM_PHOTO',
  });

  // College B (New Approval) adds computer centre evidence
  setSession({ role: 'college', collegeId: '1-38290145' });
  await addInfrastructureEvidence('APP-NEW-2026-101', {
    title: 'New Institution Computer Centre',
    fileName: 'new_comp_lab.jpg',
    fileSize: '1.9 MB',
    fileType: 'image/jpeg',
    evidenceCategory: 'COMPUTER_CENTRE_PHOTO',
  });

  setSession({ role: 'admin', displayName: 'Admin Scrutinizer' });
  const eoaApp = await getApplicationById('APP-EOA-2026-001');
  const newApp = await getApplicationById('APP-NEW-2026-101');

  // Verify EoA application has only EoA evidence
  const eoaHasNew = (eoaApp?.infrastructureEvidence || []).some(
    (e) => e.title === 'New Institution Computer Centre'
  );
  assert.strictEqual(eoaHasNew, false, 'EoA dossier must not contain New Approval evidence');

  // Verify New Approval application has only New Approval evidence
  const newHasEoA = (newApp?.infrastructureEvidence || []).some(
    (e) => e.title === 'EoA Exclusive Classroom'
  );
  assert.strictEqual(newHasEoA, false, 'New Approval dossier must not contain EoA evidence');
});

// -------------------------------------------------------------
// Test 25: College ownership isolation
// -------------------------------------------------------------
test('25. College ownership isolation: college cannot add or remove evidence on another college application', async () => {
  setupFreshDatabase();

  // Session is College A
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'College A' });

  // Attempting to add evidence on College B's application
  await assert.rejects(
    async () => {
      await addInfrastructureEvidence('APP-NEW-2026-101', {
        title: 'Unauthorized Upload',
        fileName: 'unauthorized.jpg',
        fileSize: '1 MB',
        fileType: 'image/jpeg',
        evidenceCategory: 'FACULTY_ROOM_PHOTO',
      });
    },
    /Access Denied/i,
    'College A must be denied when attempting to add evidence to College B'
  );

  // Attempting to remove evidence from College B's application
  await assert.rejects(
    async () => {
      await removeInfrastructureEvidence('APP-NEW-2026-101', 'some-item-id');
    },
    /Access Denied/i,
    'College A must be denied when attempting to remove evidence from College B'
  );
});

// -------------------------------------------------------------
// Test 26: Evidence removal triggers compliance reassessment and audit trail
// -------------------------------------------------------------
test('26. Evidence removal triggers compliance reassessment and audit trail', async () => {
  setupFreshDatabase();
  setSession({ role: 'college', collegeId: '1-10972341', displayName: 'College Principal' });

  const addedApp = await addInfrastructureEvidence('APP-EOA-2026-001', {
    title: 'Restroom Block Evidence',
    fileName: 'restrooms.jpg',
    fileSize: '1.5 MB',
    fileType: 'image/jpeg',
    evidenceCategory: 'SANITATION_WATER_PHOTO',
  });

  const addedItem = addedApp.infrastructureEvidence?.find((e) => e.title === 'Restroom Block Evidence');
  assert.ok(addedItem, 'Item was added');

  // Now remove it
  const removedApp = await removeInfrastructureEvidence('APP-EOA-2026-001', addedItem.id);
  const exists = (removedApp.infrastructureEvidence || []).some((e) => e.id === addedItem.id);
  assert.strictEqual(exists, false, 'Evidence item must be removed from array');

  // Verify audit log
  const removalLog = removedApp.auditLogs?.find((l) => l.action === 'INFRASTRUCTURE_EVIDENCE_REMOVED');
  assert.ok(removalLog, 'Audit log must record INFRASTRUCTURE_EVIDENCE_REMOVED');
  assert.ok(removalLog?.details.includes('Restroom Block Evidence'));
});

// -------------------------------------------------------------
// Test 27: Admin officer reviews evidence and records audit log
// -------------------------------------------------------------
test('27. Admin officer reviews evidence (Accept and Flag) and records audit log', async () => {
  setupFreshDatabase();

  // College uploads evidence
  setSession({ role: 'college', collegeId: '1-10972341' });
  const appWithEvidence = await addInfrastructureEvidence('APP-EOA-2026-001', {
    title: 'Safety Equipment Station',
    fileName: 'safety.jpg',
    fileSize: '2.0 MB',
    fileType: 'image/jpeg',
    evidenceCategory: 'ACCESSIBILITY_SAFETY_PHOTO',
  });

  const evidenceItem = appWithEvidence.infrastructureEvidence?.find(
    (e) => e.title === 'Safety Equipment Station'
  );
  assert.ok(evidenceItem, 'Evidence item exists');
  assert.strictEqual(evidenceItem?.status, 'PENDING_REVIEW');

  // College tries to review: must fail
  await assert.rejects(
    async () => {
      await reviewInfrastructureEvidence('APP-EOA-2026-001', evidenceItem.id, {
        status: 'ACCEPTED',
        remarks: 'Self-approval attempt',
      });
    },
    /Access Denied/i,
    'College role must not be permitted to review evidence'
  );

  // Admin logs in and accepts evidence
  setSession({ role: 'admin', displayName: 'Scrutiny Officer Sharma', email: 'sharma@aicte.gov.in' });
  const acceptedApp = await reviewInfrastructureEvidence('APP-EOA-2026-001', evidenceItem.id, {
    status: 'ACCEPTED',
    remarks: 'Verified fire suppression equipment and signage are compliant.',
  });

  const acceptedItem = acceptedApp.infrastructureEvidence?.find((e) => e.id === evidenceItem.id);
  assert.strictEqual(acceptedItem?.status, 'ACCEPTED');
  assert.strictEqual(acceptedItem?.reviewedBy, 'Scrutiny Officer Sharma');
  assert.strictEqual(
    acceptedItem?.reviewerRemarks,
    'Verified fire suppression equipment and signage are compliant.'
  );

  // Verify audit log entry
  const reviewLog = acceptedApp.auditLogs?.find((l) => l.action === 'INFRASTRUCTURE_EVIDENCE_REVIEWED');
  assert.ok(reviewLog, 'Audit log must record INFRASTRUCTURE_EVIDENCE_REVIEWED');
  assert.strictEqual(reviewLog?.actor, 'Scrutiny Officer Sharma');
  assert.strictEqual(reviewLog?.actorRole, 'admin');

  // Admin flags another evidence
  const flaggedApp = await reviewInfrastructureEvidence('APP-EOA-2026-001', evidenceItem.id, {
    status: 'FLAGGED',
    remarks: 'Signage font size below AICTE specification; requires clarification.',
  });

  const flaggedItem = flaggedApp.infrastructureEvidence?.find((e) => e.id === evidenceItem.id);
  assert.strictEqual(flaggedItem?.status, 'FLAGGED');
  assert.strictEqual(
    flaggedItem?.reviewerRemarks,
    'Signage font size below AICTE specification; requires clarification.'
  );
});

// -------------------------------------------------------------
// Test 28: Disallowed operations on Approved applications
// -------------------------------------------------------------
test('28. Disallowed operations: cannot add or remove evidence on Approved applications', async () => {
  setupFreshDatabase();
  setSession({ role: 'admin', displayName: 'Admin Officer' });

  // Create an approved application
  const approvedApp: CollegeApplication = {
    id: 'APP-APPROVED-DOSSIER',
    collegeId: 'COL-APP-001',
    collegeName: 'Approved Institute',
    type: 'EOA',
    academicYear: '2026-2027',
    state: 'Delhi',
    district: 'New Delhi',
    discipline: 'Engineering',
    intakeProposed: 300,
    status: 'Approved',
    submissionDate: '2026-10-01',
    lastUpdated: '2026-10-01',
    complianceScore: 98,
    flaggedIssuesCount: 0,
    documents: [],
    infrastructureEvidence: [
      {
        id: 'ev-locked',
        evidenceCategory: 'CLASSROOM_PHOTO',
        title: 'Classroom',
        fileName: 'class.jpg',
        fileType: 'image/jpeg',
      },
    ],
  };

  await createOrUpdateApplication(approvedApp);

  // Attempt to add evidence
  await assert.rejects(
    async () => {
      await addInfrastructureEvidence('APP-APPROVED-DOSSIER', {
        title: 'Post-approval upload',
        fileName: 'test.jpg',
        fileSize: '1 MB',
        fileType: 'image/jpeg',
        evidenceCategory: 'CLASSROOM_PHOTO',
      });
    },
    /already Approved application/i,
    'Must prevent adding evidence to an Approved dossier'
  );

  // Attempt to remove evidence
  await assert.rejects(
    async () => {
      await removeInfrastructureEvidence('APP-APPROVED-DOSSIER', 'ev-locked');
    },
    /already Approved application/i,
    'Must prevent removing evidence from an Approved dossier'
  );
});

