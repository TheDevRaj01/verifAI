import test from 'node:test';
import assert from 'node:assert';
import {
  extractInformationFromOcr,
  validateDocumentOcrText,
  parseAdministrativeDate,
  parsePdfDate,
  extractPdfMetadataSync,
  validatePdfMetadata,
  validateDateLogic,
  validateIdentificationNumbers,
  compareDocumentVersions,
  validateCrossDocumentConsistency,
  AUTHENTICITY_NOT_VERIFIED_TEXT,
} from '../src/services/documentValidationService.ts';
import {
  calculateFileHash,
  detectDocumentDuplicates,
} from '../src/services/duplicateDetectionService.ts';
import type {
  RequiredDocument,
  CollegeApplication,
  ChecklistRequirement,
  PdfDocumentMetadata,
} from '../src/types/index.ts';

// Test Fixtures
const DEMO_APPLICATION: CollegeApplication = {
  id: 'APP-EOA-2026-001',
  collegeId: '1-10293847',
  collegeName: 'Delhi Institute of Engineering & Advanced Technology',
  type: 'EOA',
  academicYear: '2026-2027',
  status: 'Submitted',
  submissionDate: '2026-10-20',
  complianceScore: 85,
  documents: [],
};

const FIRE_NOC_REQUIREMENT: ChecklistRequirement = {
  id: 'REQ-EOA-002',
  title: 'Fire Safety Certificate & NOC',
  category: 'Statutory Compliances & Approvals',
  isMandatory: true,
  description: 'Valid Fire Safety Certificate issued by State Fire Service or competent municipal authority.',
  allowedFileTypes: ['.pdf', '.jpg', '.png'],
  maxFileSizeMB: 10,
};

const AUDIT_REQUIREMENT: ChecklistRequirement = {
  id: 'REQ-EOA-005',
  title: 'Audited Financial Statement',
  category: 'Financial Disclosures',
  isMandatory: true,
  description: 'Audited Balance Sheet, Income & Expenditure Account with CA UDIN attestation.',
  allowedFileTypes: ['.pdf'],
  maxFileSizeMB: 10,
};

const TRUST_DEED_REQUIREMENT: ChecklistRequirement = {
  id: 'REQ-NEW-001',
  title: 'Registered Trust / Society Deed & MoA',
  category: 'Legal Documents',
  isMandatory: true,
  description: 'Registered Trust Deed or Memorandum of Association establishing sponsoring entity.',
  allowedFileTypes: ['.pdf'],
  maxFileSizeMB: 15,
};

// -----------------------------------------------------------------------------
// Test 1: Issue date occurs after expiry date -> detected
// -----------------------------------------------------------------------------
test('1. Issue date occurs after expiry date is detected as a chronological anomaly', () => {
  const contradictoryDateText = `GOVERNMENT OF NCT OF DELHI
HEADQUARTERS: DELHI FIRE SERVICE
Ref No: DFS/HQ/2026/NOC-4921
Date of Issue: 20/08/2026
Valid till: 15/01/2025
NO OBJECTION CERTIFICATE (FIRE SAFETY)
Certified that Delhi Institute of Engineering & Advanced Technology meets fire standards.`;

  const extracted = extractInformationFromOcr(contradictoryDateText, FIRE_NOC_REQUIREMENT);
  assert.strictEqual(extracted.issueDate, '20/08/2026');
  assert.strictEqual(extracted.expiryDate, '15/01/2025');

  const findings = validateDateLogic(extracted, FIRE_NOC_REQUIREMENT, FIRE_NOC_REQUIREMENT.title);
  const chronologyFinding = findings.find((f) => f.id === 'CHK-DATE-CHRONOLOGY');

  assert.ok(chronologyFinding, 'CHK-DATE-CHRONOLOGY finding must exist');
  assert.strictEqual(chronologyFinding.status, 'WARNING');
  assert.strictEqual(chronologyFinding.category, 'DATE_METADATA_ANOMALY');
  assert.strictEqual(chronologyFinding.categoryLabel, 'Date inconsistency');
  assert.ok(
    chronologyFinding.reason.toLowerCase().includes('after expiry date') ||
      chronologyFinding.reason.toLowerCase().includes('contradictory date sequence'),
    'Reason must explain contradictory date sequence'
  );
  assert.ok(chronologyFinding.suggestedAction, 'Suggested action must be provided for officer');
});

// -----------------------------------------------------------------------------
// Test 2: Valid date sequence -> no contradictory date finding
// -----------------------------------------------------------------------------
test('2. Valid date sequence passes chronological validation without warning', () => {
  const validDateText = `GOVERNMENT OF NCT OF DELHI
DELHI FIRE SERVICE
Ref No: DFS/HQ/2026/NOC-4921
Date of Issue: 12/04/2026
Valid till: 11/04/2029
NO OBJECTION CERTIFICATE (FIRE SAFETY)
Certified that Delhi Institute of Engineering & Advanced Technology meets fire standards.`;

  const extracted = extractInformationFromOcr(validDateText, FIRE_NOC_REQUIREMENT);
  const findings = validateDateLogic(extracted, FIRE_NOC_REQUIREMENT, FIRE_NOC_REQUIREMENT.title);
  const chronologyFinding = findings.find((f) => f.id === 'CHK-DATE-CHRONOLOGY');

  assert.ok(chronologyFinding);
  assert.strictEqual(chronologyFinding.status, 'PASS');
  assert.strictEqual(chronologyFinding.category, 'DATE_METADATA_ANOMALY');
  assert.ok(chronologyFinding.reason.includes('chronologically valid'));
});

// -----------------------------------------------------------------------------
// Test 3: Permanent document without expiry requirement -> no false expiry anomaly
// -----------------------------------------------------------------------------
test('3. Permanent document without expiry requirement does not trigger false expiry anomaly', () => {
  const trustDeedText = `SUB-REGISTRAR NEW DELHI
TRUST DEED / MEMORANDUM OF ASSOCIATION
Ref No: TRUST/DEED/2012/8810
Date of Issue: 10/05/2012
This Deed of Trust executed on 10th May 2012 creates Delhi Educational Trust in perpetuity.`;

  const extracted = extractInformationFromOcr(trustDeedText, TRUST_DEED_REQUIREMENT);
  const findings = validateDateLogic(extracted, TRUST_DEED_REQUIREMENT, TRUST_DEED_REQUIREMENT.title);
  const chronologyFinding = findings.find((f) => f.id === 'CHK-DATE-CHRONOLOGY');

  assert.ok(chronologyFinding);
  assert.strictEqual(chronologyFinding.status, 'NOT_CHECKED');
  assert.strictEqual(chronologyFinding.category, 'DATE_METADATA_ANOMALY');
  assert.ok(chronologyFinding.reason.includes('permanent statutory records'));
});

// -----------------------------------------------------------------------------
// Test 4: Existing expired-document validation -> still works without duplicate warnings
// -----------------------------------------------------------------------------
test('4. Existing expired-document validation continues to flag expired documents independently', () => {
  const expiredText = `DELHI FIRE SERVICE
Ref No: DFS/2022/NOC-101
Issued to Delhi Institute of Engineering & Advanced Technology
Date of Issue: 15/01/2021
Valid till: 15/01/2024`;

  const doc: RequiredDocument = {
    id: 'REQ-EOA-002',
    name: 'Fire Safety Certificate & NOC',
    category: 'Statutory',
    isMandatory: true,
    status: 'Uploaded',
    version: 1,
  };

  const result = validateDocumentOcrText(doc, expiredText, DEMO_APPLICATION, FIRE_NOC_REQUIREMENT);
  const expiryFinding = result.findings.find((f) => f.id === 'CHK-EXPIRY');
  const chronologyFinding = result.findings.find((f) => f.id === 'CHK-DATE-CHRONOLOGY');

  assert.ok(expiryFinding, 'CHK-EXPIRY must exist');
  assert.strictEqual(expiryFinding.status, 'WARNING');
  assert.ok(expiryFinding.reason.includes('EXPIRED'));

  // Chronology is 2021 <= 2024, so chronology check passes and does not emit a duplicate warning
  assert.ok(chronologyFinding);
  assert.strictEqual(chronologyFinding.status, 'PASS');
});

// -----------------------------------------------------------------------------
// Test 5: Existing ambiguous-date validation -> still works without duplicate findings
// -----------------------------------------------------------------------------
test('5. Existing ambiguous-date validation still identifies ambiguous dates as NEEDS_REVIEW', () => {
  const ambiguousText = `DELHI FIRE SERVICE
Ref No: DFS/2026/NOC-202
Issued to Delhi Institute of Engineering & Advanced Technology
Date of Issue: 01/02/2026
Valid till: 04/05/2026`;

  const doc: RequiredDocument = {
    id: 'REQ-EOA-002',
    name: 'Fire Safety Certificate & NOC',
    category: 'Statutory',
    isMandatory: true,
    status: 'Uploaded',
    version: 1,
  };

  const result = validateDocumentOcrText(doc, ambiguousText, DEMO_APPLICATION, FIRE_NOC_REQUIREMENT);
  const expiryFinding = result.findings.find((f) => f.id === 'CHK-EXPIRY');

  assert.ok(expiryFinding);
  assert.strictEqual(expiryFinding.status, 'NEEDS_REVIEW');
  assert.ok(expiryFinding.reason.includes('Ambiguous'));
});

// -----------------------------------------------------------------------------
// Test 6: Valid UDIN format -> no invalid-format finding
// -----------------------------------------------------------------------------
test('6. Valid 18-character ICAI UDIN format is verified and produces PASS', () => {
  const auditTextWithValidUdin = `INDEPENDENT AUDITOR'S REPORT
To the Governing Board of Delhi Institute of Engineering & Advanced Technology
We have audited the Balance Sheet and Income & Expenditure Account for FY 2025-26.
UDIN: 24123456AAAAAB1234
Chartered Accountants
Date: 15/06/2026`;

  const extracted = extractInformationFromOcr(auditTextWithValidUdin, AUDIT_REQUIREMENT);
  assert.strictEqual(extracted.udin, '24123456AAAAAB1234');

  const findings = validateIdentificationNumbers(extracted, AUDIT_REQUIREMENT);
  const udinFinding = findings.find((f) => f.id === 'CHK-UDIN-FORMAT');

  assert.ok(udinFinding, 'CHK-UDIN-FORMAT finding must exist');
  assert.strictEqual(udinFinding.status, 'PASS');
  assert.strictEqual(udinFinding.category, 'IDENTIFIER_FORMAT');
  assert.strictEqual(udinFinding.categoryLabel, 'Valid identifier format');
  assert.ok(udinFinding.reason.includes('Valid 18-character ICAI UDIN'));
});

// -----------------------------------------------------------------------------
// Test 7: Invalid UDIN format -> review finding produced
// -----------------------------------------------------------------------------
test('7. Invalid UDIN format is flagged with an advisory warning for officer review', () => {
  const auditTextWithInvalidUdin = `INDEPENDENT AUDITOR'S REPORT
Balance Sheet and Income & Expenditure Account.
UDIN: 24062644543
Chartered Accountants`;

  const extracted = extractInformationFromOcr(auditTextWithInvalidUdin, AUDIT_REQUIREMENT);
  assert.strictEqual(extracted.udin, '24062644543'); // 11 characters instead of required 18

  const findings = validateIdentificationNumbers(extracted, AUDIT_REQUIREMENT);
  const udinFinding = findings.find((f) => f.id === 'CHK-UDIN-FORMAT');

  assert.ok(udinFinding, 'CHK-UDIN-FORMAT finding must exist');
  assert.strictEqual(udinFinding.status, 'WARNING');
  assert.strictEqual(udinFinding.category, 'IDENTIFIER_FORMAT');
  assert.strictEqual(udinFinding.categoryLabel, 'Invalid identifier format');
  assert.ok(udinFinding.reason.includes('Invalid ICAI UDIN format detected'));
  assert.ok(udinFinding.suggestedAction?.includes('udin.icai.org'));
});

// -----------------------------------------------------------------------------
// Test 8: Missing identifier -> existing check works without duplicate warning
// -----------------------------------------------------------------------------
test('8. Missing identifier is handled by existing check without emitting duplicate format warnings', () => {
  const auditTextWithoutUdin = `INDEPENDENT AUDITOR'S REPORT
Balance Sheet for Delhi Institute of Engineering & Advanced Technology
Report signed by Statutory Auditors.`;

  const doc: RequiredDocument = {
    id: 'REQ-EOA-005',
    name: 'Audited Financial Statement',
    category: 'Financial',
    isMandatory: true,
    status: 'Uploaded',
    version: 1,
  };

  const result = validateDocumentOcrText(doc, auditTextWithoutUdin, DEMO_APPLICATION, AUDIT_REQUIREMENT);

  // Existing check flags missing UDIN
  const eoaAuditFinding = result.findings.find((f) => f.id === 'CHK-SPECIFIC-EOA-005');
  assert.ok(eoaAuditFinding);
  assert.strictEqual(eoaAuditFinding.status, 'WARNING');

  // New format check must NOT emit an invalid-format warning when UDIN is completely missing
  const udinFormatFinding = result.findings.find((f) => f.id === 'CHK-UDIN-FORMAT');
  assert.strictEqual(udinFormatFinding, undefined, 'Must not emit duplicate CHK-UDIN-FORMAT when UDIN is absent');
});

// -----------------------------------------------------------------------------
// Test 9: PDF creation timestamp later than modification timestamp -> detected
// -----------------------------------------------------------------------------
test('9. PDF modification timestamp preceding creation timestamp is detected as metadata anomaly', () => {
  const invertedMeta: PdfDocumentMetadata = {
    creationDate: 'D:20260315103000Z',
    modificationDate: 'D:20260314090000Z', // Mod is 1 day BEFORE Creation!
    producer: 'Adobe Acrobat Pro 2024',
  };

  const findings = validatePdfMetadata(invertedMeta);
  const metaFinding = findings.find((f) => f.id === 'CHK-PDF-METADATA');

  assert.ok(metaFinding);
  assert.strictEqual(metaFinding.status, 'WARNING');
  assert.strictEqual(metaFinding.category, 'DATE_METADATA_ANOMALY');
  assert.strictEqual(metaFinding.categoryLabel, 'Metadata anomaly');
  assert.ok(metaFinding.reason.includes('precedes its creation timestamp'));
  assert.ok(metaFinding.suggestedAction, 'Suggested action provided');
});

// -----------------------------------------------------------------------------
// Test 10: PDF with missing metadata -> handled safely
// -----------------------------------------------------------------------------
test('10. PDF with missing metadata is handled safely as NOT_CHECKED without false suspicious flag', () => {
  const findings = validatePdfMetadata(undefined);
  const metaFinding = findings.find((f) => f.id === 'CHK-PDF-METADATA');

  assert.ok(metaFinding);
  assert.strictEqual(metaFinding.status, 'NOT_CHECKED');
  assert.strictEqual(metaFinding.category, 'DATE_METADATA_ANOMALY');
  assert.ok(metaFinding.reason.includes('flattened scans'));
  assert.ok(metaFinding.reason.includes('safe'));
});

// -----------------------------------------------------------------------------
// Test 11: Previous & current versions with changed cert number -> detected and values displayed
// -----------------------------------------------------------------------------
test('11. Changed certificate number between versions is detected with v1 and v2 values', () => {
  const currentDoc: RequiredDocument = {
    id: 'REQ-EOA-002',
    name: 'Fire Safety Certificate & NOC',
    category: 'Statutory',
    isMandatory: true,
    status: 'Uploaded',
    version: 2,
    previousVersions: [
      {
        version: 1,
        extractedFields: {
          certificateNumber: 'DFS/2025/NOC-1001',
          issuingAuthority: 'Delhi Fire Service',
        },
        extractedText: 'Old certificate DFS/2025/NOC-1001',
      },
    ],
  };

  const currentFields = {
    certificateNumber: 'DFS/2026/NOC-9999',
    issuingAuthority: 'Delhi Fire Service',
  };

  const findings = compareDocumentVersions(currentDoc, currentFields, 'New certificate text DFS/2026/NOC-9999');
  const certNumFinding = findings.find((f) => f.id === 'CHK-VER-CERT-NUM');

  assert.ok(certNumFinding, 'CHK-VER-CERT-NUM finding must exist');
  assert.strictEqual(certNumFinding.status, 'WARNING');
  assert.strictEqual(certNumFinding.category, 'SUSPICIOUS_CHANGES');
  assert.strictEqual(certNumFinding.categoryLabel, 'Potential alteration indicator');
  assert.strictEqual(certNumFinding.previousValue, 'DFS/2025/NOC-1001');
  assert.strictEqual(certNumFinding.currentValue, 'DFS/2026/NOC-9999');
  assert.strictEqual(certNumFinding.previousVersion, 1);
  assert.strictEqual(certNumFinding.currentVersion, 2);
  assert.ok(certNumFinding.reason.includes('changed between versions'));
});

// -----------------------------------------------------------------------------
// Test 12: Previous & current versions with changed issue date -> detected and explained
// -----------------------------------------------------------------------------
test('12. Changed issue date between versions is detected with version labels and explanation', () => {
  const currentDoc: RequiredDocument = {
    id: 'REQ-EOA-002',
    name: 'Fire Safety Certificate & NOC',
    category: 'Statutory',
    isMandatory: true,
    status: 'Uploaded',
    version: 2,
    previousVersions: [
      {
        version: 1,
        extractedFields: {
          certificateNumber: 'DFS/2026/NOC-1001',
          issueDate: '10/01/2025',
        },
      },
    ],
  };

  const currentFields = {
    certificateNumber: 'DFS/2026/NOC-1001',
    issueDate: '25/08/2026',
  };

  const findings = compareDocumentVersions(currentDoc, currentFields, 'Current text');
  const dateFinding = findings.find((f) => f.id === 'CHK-VER-ISSUE-DATE');

  assert.ok(dateFinding, 'CHK-VER-ISSUE-DATE finding must exist');
  assert.strictEqual(dateFinding.status, 'WARNING');
  assert.strictEqual(dateFinding.category, 'SUSPICIOUS_CHANGES');
  assert.strictEqual(dateFinding.previousValue, '10/01/2025');
  assert.strictEqual(dateFinding.currentValue, '25/08/2026');
  assert.ok(dateFinding.reason.includes('Issue date changed between versions'));
});

// -----------------------------------------------------------------------------
// Test 13: Previous version unavailable -> comparison marked unavailable; no fabricated result
// -----------------------------------------------------------------------------
test('13. When previous version is unavailable, comparison is marked NOT_CHECKED without fabricating results', () => {
  const docVersion1: RequiredDocument = {
    id: 'REQ-EOA-002',
    name: 'Fire Safety Certificate & NOC',
    category: 'Statutory',
    isMandatory: true,
    status: 'Uploaded',
    version: 1,
    previousVersions: [],
  };

  const findings = compareDocumentVersions(docVersion1, { certificateNumber: 'DFS/2026/NOC-1001' }, 'Text');
  assert.strictEqual(findings.length, 1);
  const versionFinding = findings[0];

  assert.strictEqual(versionFinding.id, 'CHK-VERSION-COMPARISON');
  assert.strictEqual(versionFinding.status, 'NOT_CHECKED');
  assert.strictEqual(versionFinding.category, 'SUSPICIOUS_CHANGES');
  assert.strictEqual(versionFinding.categoryLabel, 'Comparison unavailable');
  assert.strictEqual(
    versionFinding.reason,
    'Previous document version unavailable; version comparison could not be performed.'
  );
});

// -----------------------------------------------------------------------------
// Test 14: Cross-document institution-name mismatch -> detected when expected to match
// -----------------------------------------------------------------------------
test('14. Cross-document institution-name mismatch in the same application is detected', () => {
  const currentDoc: RequiredDocument = {
    id: 'REQ-EOA-002',
    requirementId: 'REQ-EOA-002',
    name: 'Fire Safety Certificate & NOC',
    category: 'Statutory',
    isMandatory: true,
    status: 'Uploaded',
    version: 1,
  };

  const applicationWithMultipleDocs: CollegeApplication = {
    ...DEMO_APPLICATION,
    documents: [
      currentDoc,
      {
        id: 'REQ-EOA-001',
        requirementId: 'REQ-EOA-001',
        name: 'Affiliation Continuation Letter',
        category: 'Affiliation',
        isMandatory: true,
        status: 'Uploaded',
        version: 1,
        validationResult: {
          analyzedAt: new Date().toISOString(),
          documentVersion: 1,
          ocrSnippetPreview: '',
          extractedFields: {
            institutionName: 'Maharashtra Polytechnic Academy',
          },
          findings: [],
          summary: { passed: 1, warnings: 0, needsReview: 0, notChecked: 0 },
          overallVerdict: 'SATISFACTORY',
          authenticityStatus: AUTHENTICITY_NOT_VERIFIED_TEXT,
          disclaimer: '',
        },
      },
    ],
  };

  const currentFields = {
    institutionName: 'Delhi Institute of Engineering & Advanced Technology',
  };

  const findings = validateCrossDocumentConsistency(currentDoc, currentFields, applicationWithMultipleDocs);
  const crossDocFinding = findings.find((f) => f.id.startsWith('CHK-CROSS-DOC-'));

  assert.ok(crossDocFinding, 'Cross document mismatch finding must exist');
  assert.strictEqual(crossDocFinding.status, 'WARNING');
  assert.strictEqual(crossDocFinding.category, 'CROSS_DOCUMENT_CONSISTENCY');
  assert.strictEqual(crossDocFinding.categoryLabel, 'Cross-document mismatch');
  assert.strictEqual(crossDocFinding.relevantDocumentName, 'Affiliation Continuation Letter');
  assert.ok(crossDocFinding.reason.includes('Cross-Document Institution Name Mismatch'));
});

// -----------------------------------------------------------------------------
// Test 15: Legitimately different sponsoring-trust and college names -> no false mismatch
// -----------------------------------------------------------------------------
test('15. Sponsoring trust and college names legitimately differing in New Approval does not produce false mismatch', () => {
  const trustDoc: RequiredDocument = {
    id: 'REQ-NEW-001',
    requirementId: 'REQ-NEW-001',
    name: 'Registered Trust / Society Deed & MoA',
    category: 'Legal',
    isMandatory: true,
    status: 'Uploaded',
    version: 1,
  };

  const newApprovalApp: CollegeApplication = {
    ...DEMO_APPLICATION,
    type: 'NEW_APPROVAL',
    collegeName: 'Delhi Institute of Engineering & Advanced Technology',
    documents: [
      trustDoc,
      {
        id: 'REQ-NEW-007',
        requirementId: 'REQ-NEW-007',
        name: 'Master Site Plan',
        category: 'Technical',
        isMandatory: true,
        status: 'Uploaded',
        version: 1,
        validationResult: {
          analyzedAt: new Date().toISOString(),
          documentVersion: 1,
          ocrSnippetPreview: '',
          extractedFields: {
            institutionName: 'Delhi Institute of Engineering & Advanced Technology',
          },
          findings: [],
          summary: { passed: 1, warnings: 0, needsReview: 0, notChecked: 0 },
          overallVerdict: 'SATISFACTORY',
          authenticityStatus: AUTHENTICITY_NOT_VERIFIED_TEXT,
          disclaimer: '',
        },
      },
    ],
  };

  const trustFields = {
    institutionName: 'Shri Ram Educational and Charitable Trust',
  };

  const findings = validateCrossDocumentConsistency(trustDoc, trustFields, newApprovalApp);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].id, 'CHK-CROSS-DOC');
  assert.strictEqual(findings[0].status, 'PASS');
  assert.strictEqual(findings[0].categoryLabel, 'Sponsoring entity exemption');
  assert.ok(findings[0].reason.includes('Sponsoring Trust Deed'));
});

// -----------------------------------------------------------------------------
// Test 16: Cross-document identifiers that legitimately differ -> no false mismatch
// -----------------------------------------------------------------------------
test('16. Different reference numbers across different checklist requirements are not falsely flagged', () => {
  const currentDoc: RequiredDocument = {
    id: 'REQ-EOA-002',
    name: 'Fire Safety Certificate & NOC',
    category: 'Statutory',
    isMandatory: true,
    status: 'Uploaded',
    version: 1,
  };

  const applicationWithDifferentRefNumbers: CollegeApplication = {
    ...DEMO_APPLICATION,
    documents: [
      currentDoc,
      {
        id: 'REQ-EOA-001',
        name: 'Affiliation Continuation Letter',
        category: 'Affiliation',
        isMandatory: true,
        status: 'Uploaded',
        version: 1,
        validationResult: {
          analyzedAt: new Date().toISOString(),
          documentVersion: 1,
          ocrSnippetPreview: '',
          extractedFields: {
            institutionName: 'Delhi Institute of Engineering & Advanced Technology',
            certificateNumber: 'GGSIPU/AFFIL/2026/301', // Different ref number
          },
          findings: [],
          summary: { passed: 1, warnings: 0, needsReview: 0, notChecked: 0 },
          overallVerdict: 'SATISFACTORY',
          authenticityStatus: AUTHENTICITY_NOT_VERIFIED_TEXT,
          disclaimer: '',
        },
      },
    ],
  };

  const currentFields = {
    institutionName: 'Delhi Institute of Engineering & Advanced Technology',
    certificateNumber: 'DFS/HQ/2026/NOC-4921', // Different ref number
  };

  const findings = validateCrossDocumentConsistency(currentDoc, currentFields, applicationWithDifferentRefNumbers);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].status, 'PASS');
  assert.strictEqual(findings[0].categoryLabel, 'Cross-document consistent');
});

// -----------------------------------------------------------------------------
// Test 17: EoA workflow -> existing validations continue working
// -----------------------------------------------------------------------------
test('17. EoA checklist rules continue working properly alongside new anomaly checks', () => {
  const eoaAffiliationText = `GURU GOBIND SINGH INDRAPRASTHA UNIVERSITY
CONTINUATION OF AFFILIATION ORDER
Ref No: GGSIPU/AFFIL/2026/301
Issued to Delhi Institute of Engineering & Advanced Technology
Valid for academic year: 2026-2027
Date of Issue: 15/05/2026
Valid till: 30/06/2027`;

  const doc: RequiredDocument = {
    id: 'REQ-EOA-001',
    requirementId: 'REQ-EOA-001',
    name: 'Affiliation Continuation Letter 2026–27',
    category: 'Affiliation',
    isMandatory: true,
    status: 'Uploaded',
    version: 1,
  };

  const req: ChecklistRequirement = {
    id: 'REQ-EOA-001',
    title: 'Affiliation Continuation Letter 2026–27',
    category: 'Affiliation',
    isMandatory: true,
    allowedFileTypes: ['.pdf'],
    maxFileSizeMB: 10,
  };

  const result = validateDocumentOcrText(doc, eoaAffiliationText, DEMO_APPLICATION, req);
  const eoaRuleFinding = result.findings.find((f) => f.id === 'CHK-SPECIFIC-EOA-001');

  assert.ok(eoaRuleFinding);
  assert.strictEqual(eoaRuleFinding.status, 'PASS');
  assert.strictEqual(eoaRuleFinding.category, 'CHECKLIST_COMPLIANCE');
});

// -----------------------------------------------------------------------------
// Test 18: New Approval workflow -> existing validations continue working
// -----------------------------------------------------------------------------
test('18. New Approval checklist rules continue working properly alongside new anomaly checks', () => {
  const fdrText = `STATE BANK OF INDIA
FIXED DEPOSIT RECEIPT
Ref No: FDR/SBI/2026/889211
Deposit Amount: Rs. 1.00 Crore (INR 1,00,00,000)
Held Jointly: In the name of Delhi Educational Trust and Regional Officer, AICTE.
Date of Issue: 10/01/2026
Valid till: 10/01/2036`;

  const doc: RequiredDocument = {
    id: 'REQ-NEW-004',
    requirementId: 'REQ-NEW-004',
    name: 'Rs. 1.00 Crore Joint Fixed Deposit',
    category: 'Financial',
    isMandatory: true,
    status: 'Uploaded',
    version: 1,
  };

  const req: ChecklistRequirement = {
    id: 'REQ-NEW-004',
    title: 'Rs. 1.00 Crore Joint Fixed Deposit (Corpus Fund)',
    category: 'Financial',
    isMandatory: true,
    allowedFileTypes: ['.pdf'],
    maxFileSizeMB: 10,
  };

  const result = validateDocumentOcrText(doc, fdrText, { ...DEMO_APPLICATION, type: 'NEW_APPROVAL' }, req);
  const newRuleFinding = result.findings.find((f) => f.id === 'CHK-SPECIFIC-NEW-004');

  assert.ok(newRuleFinding);
  assert.strictEqual(newRuleFinding.status, 'PASS');
  assert.strictEqual(newRuleFinding.category, 'CHECKLIST_COMPLIANCE');
});

// -----------------------------------------------------------------------------
// Test 19: Duplicate Detection -> existing duplicate tests & functionality continue functioning normally
// -----------------------------------------------------------------------------
test('19. Duplicate detection functionality continues working seamlessly', async () => {
  const fileHash = await calculateFileHash('data:application/pdf;base64,JVBERi0xLjQKJcTl8uXr');
  assert.ok(fileHash && fileHash.length === 64, 'SHA-256 hash must be 64 characters');

  const docA: RequiredDocument = {
    id: 'REQ-EOA-002',
    name: 'Fire Safety Certificate',
    category: 'Statutory',
    isMandatory: true,
    status: 'Uploaded',
    fileHash: 'mockhash1234567890abcdef',
  };

  const docB: RequiredDocument = {
    id: 'REQ-EOA-001',
    name: 'Affiliation Letter',
    category: 'Affiliation',
    isMandatory: true,
    status: 'Uploaded',
    fileHash: 'mockhash1234567890abcdef', // Identical hash!
  };

  const dupResult = await detectDocumentDuplicates(docB, { ...DEMO_APPLICATION, documents: [docA, docB] });
  assert.strictEqual(dupResult.status, 'EXACT_DUPLICATE');
});

// -----------------------------------------------------------------------------
// Test 20: Invariant preservation -> non-destructive; does not change document or application approval status
// -----------------------------------------------------------------------------
test('20. Anomaly validation is strictly advisory and does not mutate application or document review status', () => {
  const initialAppStatus = DEMO_APPLICATION.status;
  const initialDocStatus = 'Uploaded';

  const doc: RequiredDocument = {
    id: 'REQ-EOA-002',
    name: 'Fire Safety Certificate & NOC',
    category: 'Statutory',
    isMandatory: true,
    status: initialDocStatus,
    version: 1,
  };

  // Run validation on contradictory dates
  const result = validateDocumentOcrText(
    doc,
    'Date of Issue: 20/08/2026\nValid till: 10/01/2025',
    DEMO_APPLICATION,
    FIRE_NOC_REQUIREMENT
  );

  // Invariant assertions
  assert.strictEqual(DEMO_APPLICATION.status, initialAppStatus);
  assert.strictEqual(doc.status, initialDocStatus);
  assert.notStrictEqual(doc.status, 'Accepted');
  assert.notStrictEqual(doc.status, 'Replacement Required');
  assert.notStrictEqual(DEMO_APPLICATION.status, 'Documents Verified');

  // Prominently asserts non-verified status
  assert.strictEqual(result.authenticityStatus, AUTHENTICITY_NOT_VERIFIED_TEXT);
});

// -----------------------------------------------------------------------------
// Test 21: UI / View -> verification findings provide categorized output, comparison details, and suggested actions
// -----------------------------------------------------------------------------
test('21. Verification result findings contain structured categories, labels, and suggested actions', () => {
  const currentDoc: RequiredDocument = {
    id: 'REQ-EOA-002',
    name: 'Fire Safety Certificate & NOC',
    category: 'Statutory',
    isMandatory: true,
    status: 'Uploaded',
    version: 2,
    previousVersions: [
      {
        version: 1,
        extractedFields: {
          certificateNumber: 'DFS/2025/NOC-1001',
        },
      },
    ],
  };

  const currentText = `GOVERNMENT OF NCT OF DELHI
DELHI FIRE SERVICE
Ref No: DFS/2026/NOC-9999
Date of Issue: 20/08/2026
Valid till: 15/01/2025
UDIN: 24062644543`;

  const result = validateDocumentOcrText(currentDoc, currentText, DEMO_APPLICATION, FIRE_NOC_REQUIREMENT);

  // Check categories are properly assigned
  const complianceFindings = result.findings.filter((f) => f.category === 'CHECKLIST_COMPLIANCE');
  const anomalyFindings = result.findings.filter((f) => f.category === 'DATE_METADATA_ANOMALY');
  const versionFindings = result.findings.filter((f) => f.category === 'SUSPICIOUS_CHANGES');
  const idFindings = result.findings.filter((f) => f.category === 'IDENTIFIER_FORMAT');
  const crossDocFindings = result.findings.filter((f) => f.category === 'CROSS_DOCUMENT_CONSISTENCY');

  assert.ok(complianceFindings.length > 0, 'Must have checklist compliance findings');
  assert.ok(anomalyFindings.length > 0, 'Must have date/metadata anomaly findings');
  assert.ok(versionFindings.length > 0, 'Must have suspicious version findings');
  assert.ok(idFindings.length > 0, 'Must have identifier format findings');
  assert.ok(crossDocFindings.length > 0, 'Must have cross-document consistency findings');

  // Check version diff fields are present
  const versionCertDiff = versionFindings.find((f) => f.id === 'CHK-VER-CERT-NUM');
  assert.ok(versionCertDiff);
  assert.strictEqual(versionCertDiff.previousValue, 'DFS/2025/NOC-1001');
  assert.strictEqual(versionCertDiff.currentValue, 'DFS/2026/NOC-9999');
  assert.strictEqual(versionCertDiff.previousVersion, 1);
  assert.strictEqual(versionCertDiff.currentVersion, 2);
  assert.ok(versionCertDiff.suggestedAction, 'Must have suggestedAction');
});
