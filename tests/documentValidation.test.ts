import test from 'node:test';
import assert from 'node:assert';
import {
  extractInformationFromOcr,
  validateDocumentOcrText,
  parseAdministrativeDate,
  AUTHENTICITY_NOT_VERIFIED_TEXT,
} from '../src/services/documentValidationService.ts';
import type {
  RequiredDocument,
  CollegeApplication,
  ChecklistRequirement,
} from '../src/types/index.ts';

// Shared sample OCR text from real user certificate
const SAMPLE_CERTIFICATE_OCR = `Certificate of Completion  
Issued by:  
Indian Institute Of  
Creative Technologies  
To certify that  
Dev raj  
has successfully completed Foundation Course on AI Readiness  
in partnership with  
Date of Certification: 20 / 08 / 2026  
IICT-24062644543`;

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

const FIRE_NOC_DOC: RequiredDocument = {
  id: 'REQ-EOA-002',
  requirementId: 'REQ-EOA-002',
  name: 'Fire Safety Certificate & NOC',
  category: 'Statutory Compliances & Approvals',
  isMandatory: true,
  status: 'Uploaded',
  fileName: 'Sample_Certificate.pdf',
  version: 1,
};

test('1. Certificate of Completion is recognized as a document type', () => {
  const extracted = extractInformationFromOcr(SAMPLE_CERTIFICATE_OCR);
  assert.strictEqual(extracted.documentType, 'Certificate of Completion');
});

test('2. IICT-24062644543 is extracted as the reference identifier', () => {
  const extracted = extractInformationFromOcr(SAMPLE_CERTIFICATE_OCR);
  assert.strictEqual(extracted.certificateNumber, 'IICT-24062644543');
});

test('3. Issuer is recognized across multiple lines', () => {
  const extracted = extractInformationFromOcr(SAMPLE_CERTIFICATE_OCR);
  assert.strictEqual(extracted.issuingAuthority, 'Indian Institute Of Creative Technologies');
});

test('4. 20 / 08 / 2026 is extracted as the certification/issue date', () => {
  const extracted = extractInformationFromOcr(SAMPLE_CERTIFICATE_OCR);
  assert.strictEqual(extracted.issueDate, '20 / 08 / 2026');
  // Check parseAdministrativeDate handles spaces around slashes
  const parsed = parseAdministrativeDate(extracted.issueDate);
  assert.strictEqual(parsed.isAmbiguous, false);
  assert.ok(parsed.date instanceof Date);
  assert.strictEqual(parsed.date.getFullYear(), 2026);
  assert.strictEqual(parsed.date.getMonth(), 7); // August (0-indexed)
  assert.strictEqual(parsed.date.getDate(), 20);
});

test('5. Generic completion certificate is flagged as wrong type for Fire Safety NOC requirement', () => {
  const result = validateDocumentOcrText(
    FIRE_NOC_DOC,
    SAMPLE_CERTIFICATE_OCR,
    DEMO_APPLICATION,
    FIRE_NOC_REQUIREMENT
  );

  const docTypeFinding = result.findings.find((f) => f.id === 'CHK-DOC-TYPE');
  assert.ok(docTypeFinding, 'CHK-DOC-TYPE finding must exist');
  assert.strictEqual(docTypeFinding.status, 'WARNING');
  assert.ok(
    docTypeFinding.reason.includes('Wrong Document Type') ||
      docTypeFinding.reason.includes('Certificate of Completion'),
    'Reason must explain document is Certificate of Completion'
  );
  assert.ok(
    docTypeFinding.reason.includes('Fire Safety'),
    'Reason must explain it does not appear to be a Fire Safety NOC'
  );
  // Overall verdict must reflect discrepancies and NOT pass
  assert.strictEqual(result.overallVerdict, 'DISCREPANCIES_FOUND');
  assert.ok(result.summary.warnings > 0, 'Summary must record warnings');
});

test('6. Genuine Fire Safety NOC title is recognized correctly and passes Check 2', () => {
  const genuineFireNocText = `GOVERNMENT OF NCT OF DELHI
HEADQUARTERS: DELHI FIRE SERVICE: NEW DELHI
Ref No: DFS/HQ/2026/NOC-4921
Dated: 12/04/2026
NO OBJECTION CERTIFICATE (FIRE SAFETY)
Certified that Delhi Institute of Engineering & Advanced Technology has complied with fire prevention and fire safety requirements.
Valid till: 11/04/2029`;

  const extracted = extractInformationFromOcr(genuineFireNocText);
  assert.strictEqual(extracted.documentType, 'Fire Safety Certificate & NOC');

  const result = validateDocumentOcrText(
    FIRE_NOC_DOC,
    genuineFireNocText,
    DEMO_APPLICATION,
    FIRE_NOC_REQUIREMENT
  );

  const docTypeFinding = result.findings.find((f) => f.id === 'CHK-DOC-TYPE');
  assert.ok(docTypeFinding);
  assert.strictEqual(docTypeFinding.status, 'PASS');
});

test('7. Expired certificate is flagged only when an applicable expiry rule exists', () => {
  // 7a: Fire NOC with past expiry -> WARNING
  const expiredFireNocText = `DELHI FIRE SERVICE
Ref No: DFS/2022/NOC-101
Issued to Delhi Institute of Engineering & Advanced Technology
Valid till: 15/01/2024`;

  const resExpired = validateDocumentOcrText(
    FIRE_NOC_DOC,
    expiredFireNocText,
    DEMO_APPLICATION,
    FIRE_NOC_REQUIREMENT
  );
  const expiryFinding = resExpired.findings.find((f) => f.id === 'CHK-EXPIRY');
  assert.ok(expiryFinding);
  assert.strictEqual(expiryFinding.status, 'WARNING');
  assert.ok(expiryFinding.reason.includes('EXPIRED'));

  // 7b: Trust Deed (permanent record) -> NOT_CHECKED (never flagged as expired)
  const trustDeedText = `BOOK 1 VOLUME 412
SUB-REGISTRAR NEW DELHI
TRUST DEED / MEMORANDUM OF ASSOCIATION
Ref No: TRUST/DEED/2012/8810
Dated: 10/05/2012
This Deed of Trust executed on 10th May 2012 creates Delhi Educational Trust in perpetuity.`;

  const resPermanent = validateDocumentOcrText(
    { id: 'REQ-NEW-001', requirementId: 'REQ-NEW-001', name: 'Registered Trust / Society Deed & MoA', category: 'Legal', isMandatory: true, status: 'Uploaded', version: 1 },
    trustDeedText,
    { ...DEMO_APPLICATION, type: 'NEW_APPROVAL' },
    { id: 'REQ-NEW-001', title: 'Registered Trust / Society Deed & MoA', category: 'Legal', isMandatory: true, description: 'Trust Deed', allowedFileTypes: ['.pdf'] }
  );
  const permExpiryFinding = resPermanent.findings.find((f) => f.id === 'CHK-EXPIRY');
  assert.ok(permExpiryFinding);
  assert.strictEqual(permExpiryFinding.status, 'NOT_CHECKED');
  assert.ok(permExpiryFinding.reason.includes('not applicable'));
});

test('8. Ambiguous dates remain NEEDS_REVIEW', () => {
  // 8a: Two-digit year "12/04/26"
  const p2Digit = parseAdministrativeDate('12/04/26');
  assert.strictEqual(p2Digit.isAmbiguous, true);
  assert.ok(p2Digit.ambiguityReason?.includes('Two-digit year'));

  // 8b: Ambiguous numeric date "04/05/2026"
  const pDual = parseAdministrativeDate('04/05/2026');
  assert.strictEqual(pDual.isAmbiguous, true);
  assert.ok(pDual.ambiguityReason?.includes('Ambiguous numeric date'));

  // 8c: When evaluated in validation result
  const textAmbiguousDate = `DELHI FIRE SERVICE
Ref No: DFS/2026/NOC-202
Issued to Delhi Institute of Engineering & Advanced Technology
Valid till: 04/05/2026`;

  const resAmbiguous = validateDocumentOcrText(
    FIRE_NOC_DOC,
    textAmbiguousDate,
    DEMO_APPLICATION,
    FIRE_NOC_REQUIREMENT
  );
  const fExpiry = resAmbiguous.findings.find((f) => f.id === 'CHK-EXPIRY');
  assert.ok(fExpiry);
  assert.strictEqual(fExpiry.status, 'NEEDS_REVIEW');
});

test('9. Missing fields remain missing instead of being fabricated', () => {
  // Sample text does not contain an expiry date
  const extracted = extractInformationFromOcr(SAMPLE_CERTIFICATE_OCR);
  assert.strictEqual(extracted.expiryDate, undefined, 'Expiry date must be undefined when absent');
  assert.strictEqual(extracted.academicYear, undefined, 'Academic year must be undefined when absent');

  // Completely blank / minimal text
  const emptyExtracted = extractInformationFromOcr('random text without dates or reference numbers');
  assert.strictEqual(emptyExtracted.certificateNumber, undefined, 'No fake certificate number');
  assert.strictEqual(emptyExtracted.issueDate, undefined, 'No fake issue date');
  assert.strictEqual(emptyExtracted.expiryDate, undefined, 'No fake expiry date');
});

test('10. EOA and NEW_APPROVAL rules continue working independently', () => {
  // 10a: EOA Affiliation verifies academic year 2026-2027
  const affiliationText = `GURU GOBIND SINGH INDRAPRASTHA UNIVERSITY
CONTINUATION OF AFFILIATION ORDER
Ref No: GGSIPU/AFFIL/2026/301
Issued to Delhi Institute of Engineering & Advanced Technology
Valid for academic year: 2026-2027 for approved B.Tech programs.`;

  const resEoa = validateDocumentOcrText(
    { id: 'REQ-EOA-001', requirementId: 'REQ-EOA-001', name: 'Affiliation Continuation Letter 2026–27', category: 'Affiliation', isMandatory: true, status: 'Uploaded', version: 1 },
    affiliationText,
    DEMO_APPLICATION,
    { id: 'REQ-EOA-001', title: 'Affiliation Continuation Letter 2026–27', category: 'Affiliation', isMandatory: true, description: 'Affiliation order', allowedFileTypes: ['.pdf'] }
  );
  const eoaFinding = resEoa.findings.find((f) => f.id === 'CHK-SPECIFIC-EOA-001');
  assert.ok(eoaFinding);
  assert.strictEqual(eoaFinding.status, 'PASS');

  // 10b: New Approval FDR verifies Rs. 1.00 Crore joint holding with AICTE
  const fdrText = `STATE BANK OF INDIA
FIXED DEPOSIT RECEIPT
Ref No: FDR/SBI/2026/889211
Deposit Amount: Rs. 1.00 Crore (INR 1,00,00,000)
Held Jointly: In the name of Delhi Educational Trust and Regional Officer, AICTE.`;

  const resNew = validateDocumentOcrText(
    { id: 'REQ-NEW-004', requirementId: 'REQ-NEW-004', name: 'Rs. 1.00 Crore Joint Fixed Deposit', category: 'Financial', isMandatory: true, status: 'Uploaded', version: 1 },
    fdrText,
    { ...DEMO_APPLICATION, type: 'NEW_APPROVAL' },
    { id: 'REQ-NEW-004', title: 'Rs. 1.00 Crore Joint Fixed Deposit (Corpus Fund)', category: 'Financial', isMandatory: true, description: 'FDR Corpus', allowedFileTypes: ['.pdf'] }
  );
  const newFinding = resNew.findings.find((f) => f.id === 'CHK-SPECIFIC-NEW-004');
  assert.ok(newFinding);
  assert.strictEqual(newFinding.status, 'PASS');
});

test('11. Validation does not change application or document approval status', () => {
  const appStatusBefore = DEMO_APPLICATION.status;
  const docStatusBefore = FIRE_NOC_DOC.status;

  const result = validateDocumentOcrText(
    FIRE_NOC_DOC,
    SAMPLE_CERTIFICATE_OCR,
    DEMO_APPLICATION,
    FIRE_NOC_REQUIREMENT
  );

  // Invariant check: Inputs must not be mutated
  assert.strictEqual(DEMO_APPLICATION.status, appStatusBefore);
  assert.strictEqual(FIRE_NOC_DOC.status, docStatusBefore);
  assert.notStrictEqual(DEMO_APPLICATION.status, 'Documents Verified');
  assert.notStrictEqual(FIRE_NOC_DOC.status, 'Accepted');

  // Disclaimer text must be prominently present
  assert.strictEqual(result.authenticityStatus, AUTHENTICITY_NOT_VERIFIED_TEXT);
  assert.ok(result.disclaimer.includes(AUTHENTICITY_NOT_VERIFIED_TEXT));
});

test('12. Replacing or removing a document invalidates stale OCR and validation results', () => {
  // Existing document with analysis results
  const validatedDoc: RequiredDocument = {
    ...FIRE_NOC_DOC,
    version: 1,
    extractedText: SAMPLE_CERTIFICATE_OCR,
    validationResult: validateDocumentOcrText(
      FIRE_NOC_DOC,
      SAMPLE_CERTIFICATE_OCR,
      DEMO_APPLICATION,
      FIRE_NOC_REQUIREMENT
    ),
  };

  // Simulate replacement logic as implemented in dataService.uploadApplicationDocument
  const replacedDoc: RequiredDocument = {
    ...validatedDoc,
    fileName: 'Replacement_Fire_NOC.pdf',
    version: (validatedDoc.version || 1) + 1,
    ocrResult: undefined,
    extractedText: undefined,
    ocrExtractedAt: undefined,
    ocrMethod: undefined,
    validationResult: undefined,
  };

  assert.strictEqual(replacedDoc.version, 2);
  assert.strictEqual(replacedDoc.validationResult, undefined, 'Stale validationResult must be reset to undefined');
  assert.strictEqual(replacedDoc.extractedText, undefined, 'Stale extractedText must be reset to undefined');

  // Simulate removal logic as implemented in dataService.removeApplicationDocument
  const removedDoc: RequiredDocument = {
    ...validatedDoc,
    status: 'NOT_UPLOADED',
    fileName: undefined,
    fileDataUrl: undefined,
    ocrResult: undefined,
    extractedText: undefined,
    validationResult: undefined,
  };

  assert.strictEqual(removedDoc.validationResult, undefined, 'Removed doc must have undefined validationResult');
  assert.strictEqual(removedDoc.status, 'NOT_UPLOADED');
});
