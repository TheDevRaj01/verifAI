import test from 'node:test';
import assert from 'node:assert/strict';

// In-Memory Storage Setup for Node.js Test Execution
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
  saveDocumentOcrResult,
  saveDocumentValidationResult,
  getApplicationById,
  initializeLocalStorage,
  uploadApplicationDocument,
  getApplicationFileBlob,
} from '../src/services/dataService.ts';
import { extractTextFromDocument } from '../src/services/ocrService.ts';
import { getSampleDocumentPdfDataUrl } from '../src/services/sampleDocumentGenerator.ts';
import type {
  CollegeApplication,
  RequiredDocument,
  DocumentOcrResult,
  DocumentValidationResult,
} from '../src/types/index.ts';

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

test('1. Empty or null document data throws clear descriptive error', async () => {
  await assert.rejects(
    async () => {
      await extractTextFromDocument('');
    },
    {
      message: 'No document data available for OCR extraction.',
    }
  );
});

test('2. Corrupted PDF data throws user-friendly diagnostic error', async () => {
  // A data URL marked as application/pdf but containing corrupted junk
  const corruptPdfData = 'data:application/pdf;base64,' + Buffer.from('NOT_A_VALID_PDF_HEADER').toString('base64');
  await assert.rejects(
    async () => {
      await extractTextFromDocument(corruptPdfData, 'application/pdf', 'corrupt.pdf');
    },
    (err: Error) => {
      return (
        err.message.includes('Unable to parse PDF document') ||
        err.message.includes('PDF')
      );
    }
  );
});

test('3. saveDocumentOcrResult persists OCR details onto target document in dossier', async () => {
  resetDb();
  setSession({ role: 'admin', email: 'admin@aicte.gov.in' });

  const ocrResult: DocumentOcrResult = {
    text: 'MUNICIPAL CORPORATION OF DELHI\nBUILDING OCCUPANCY / COMPLETION CERTIFICATE\nRef: MCD/BOC/2026/9021\nDate: 20/08/2026',
    method: 'native_pdf',
    extractedAt: '2026-10-29T10:00:00.000Z',
    charCount: 110,
    wordCount: 14,
    pageCount: 1,
    confidence: 98,
    language: 'eng',
  };

  const updatedApp = await saveDocumentOcrResult('APP-EOA-2026-001', 'REQ-EOA-006', ocrResult);
  const doc = updatedApp.documents.find((d) => d.id === 'doc-1' || d.requirementId === 'REQ-EOA-006');

  assert.ok(doc, 'Target document must exist');
  assert.strictEqual(doc.extractedText, ocrResult.text);
  assert.strictEqual(doc.ocrMethod, 'native_pdf');
  assert.strictEqual(doc.ocrExtractedAt, '2026-10-29T10:00:00.000Z');
  assert.deepStrictEqual(doc.ocrResult, ocrResult);
});

test('4. saveDocumentOcrResult automatically re-triggers duplicate detection', async () => {
  resetDb();
  setSession({ role: 'admin', email: 'admin@aicte.gov.in' });

  const ocrResult: DocumentOcrResult = {
    text: 'MUNICIPAL CORPORATION OF DELHI\nBUILDING OCCUPANCY / COMPLETION CERTIFICATE\nRef: MCD/BOC/2026/9021\nDate: 20/08/2026',
    method: 'native_pdf',
    extractedAt: '2026-10-29T10:00:00.000Z',
    charCount: 110,
    wordCount: 14,
    pageCount: 1,
    confidence: 98,
    language: 'eng',
  };

  const updatedApp = await saveDocumentOcrResult('APP-EOA-2026-001', 'REQ-EOA-006', ocrResult);
  const doc = updatedApp.documents.find((d) => d.id === 'doc-1' || d.requirementId === 'REQ-EOA-006');

  assert.ok(doc, 'Target document must exist');
  assert.ok(doc.duplicateCheckResult, 'Duplicate check result must be automatically computed');
  assert.ok(['UNIQUE', 'EXACT_DUPLICATE', 'LIKELY_DUPLICATE', 'POSSIBLE_DUPLICATE'].includes(doc.duplicateCheckResult.status));
});

test('5. saveDocumentValidationResult records validation findings without mutating document or application status', async () => {
  resetDb();
  setSession({ role: 'admin', email: 'admin@aicte.gov.in' });

  const initialApp = await getApplicationById('APP-EOA-2026-001');
  assert.ok(initialApp);
  const initialAppStatus = initialApp.status;
  const targetDocInitial = initialApp.documents.find((d) => d.id === 'doc-1' || d.requirementId === 'REQ-EOA-006');
  assert.ok(targetDocInitial);
  const initialDocStatus = targetDocInitial.status;

  const sampleValidation: DocumentValidationResult = {
    analyzedAt: new Date().toISOString(),
    documentVersion: 1,
    ocrSnippetPreview: 'Sample preview',
    extractedFields: {
      certificateNumber: 'MCD/BOC/2026/9021',
      issuingAuthority: 'Municipal Corporation',
      issueDate: '20/08/2026',
    },
    findings: [
      {
        id: 'CHK-LEGIBILITY',
        ruleName: 'Text Legibility & Information Density',
        status: 'PASS',
        reason: 'Sufficient readable text',
      },
      {
        id: 'CHK-DOC-TYPE',
        ruleName: 'Document Type Match',
        status: 'PASS',
        reason: 'Matches Building Occupancy Certificate',
      },
    ],
    summary: { passed: 2, warnings: 0, needsReview: 0, notChecked: 0 },
    overallVerdict: 'SATISFACTORY',
    authenticityStatus: 'AUTHENTICITY NOT VERIFIED',
    disclaimer: 'Advisory aid only',
  };

  const updatedApp = await saveDocumentValidationResult('APP-EOA-2026-001', 'REQ-EOA-006', sampleValidation);
  const updatedDoc = updatedApp.documents.find((d) => d.id === 'doc-1' || d.requirementId === 'REQ-EOA-006');

  assert.ok(updatedDoc);
  assert.deepStrictEqual(updatedDoc.validationResult, sampleValidation);
  assert.strictEqual(updatedDoc.status, initialDocStatus, 'Document status must NOT be changed by automated validation');
  assert.strictEqual(updatedApp.status, initialAppStatus, 'Application status must NOT be changed by automated validation');
});

test('6. Admin can save OCR and validation findings across institutional boundaries', async () => {
  resetDb();
  // Session is an AICTE scrutiny officer with role 'admin'
  setSession({ role: 'admin', email: 'scrutiny@aicte-india.org' });

  const ocrResult: DocumentOcrResult = {
    text: 'BUILDING OCCUPANCY / COMPLETION CERTIFICATE\nMCD Engineering Department',
    method: 'native_pdf',
    extractedAt: '2026-10-29T10:15:00.000Z',
    charCount: 68,
    wordCount: 7,
    pageCount: 1,
    confidence: 95,
    language: 'eng',
  };

  // APP-EOA-2026-001 belongs to collegeId '1-10972341', not the admin
  const res = await saveDocumentOcrResult('APP-EOA-2026-001', 'REQ-EOA-006', ocrResult);
  assert.ok(res, 'Admin must be permitted to save OCR findings for any application');
  const doc = res.documents.find((d) => d.id === 'doc-1' || d.requirementId === 'REQ-EOA-006');
  assert.strictEqual(doc?.extractedText, ocrResult.text);
});

test('7. Uploaded document stripped for Firestore keeps fileBlobId accessible via getApplicationFileBlob', async () => {
  resetDb();
  setSession({ role: 'college', collegeId: '1-10972341', email: 'principal@delhitechnical.edu.in' });

  const sampleBase64 = 'data:application/pdf;base64,' + Buffer.from('SAMPLE_PDF_BINARY_PAYLOAD').toString('base64');
  const uploadRes = await uploadApplicationDocument(
    'APP-EOA-2026-001',
    'REQ-EOA-002',
    {
      fileName: 'Fire_Safety_Certificate_v1.pdf',
      fileSize: '150 KB',
      fileType: 'application/pdf',
      dataUrl: sampleBase64,
    }
  );

  const uploadedDoc = uploadRes.documents.find((d) => d.requirementId === 'REQ-EOA-002');
  assert.ok(uploadedDoc, 'Uploaded doc must exist');
  assert.ok(uploadedDoc.fileBlobId, 'Uploaded doc must have fileBlobId');

  // Verify getApplicationFileBlob retrieves the binary payload
  const retrievedPayload = await getApplicationFileBlob('APP-EOA-2026-001', uploadedDoc.fileBlobId);
  assert.ok(retrievedPayload, 'File blob must be retrieved from storage');
  assert.strictEqual(retrievedPayload, sampleBase64);
});

test('8. getSampleDocumentPdfDataUrl generates valid PDF Data URL and extractTextFromDocument extracts textual content', async () => {
  const samplePdfDataUrl = getSampleDocumentPdfDataUrl(
    'REQ-EOA-002',
    'Fire Safety Certificate & NOC',
    'Delhi Institute of Engineering & Technology',
    '2026-2027'
  );

  assert.ok(samplePdfDataUrl.startsWith('data:application/pdf;base64,'), 'Must return standard PDF Data URL');
  const result = await extractTextFromDocument(samplePdfDataUrl);
  assert.ok(result.text.length > 50, 'Must extract meaningful text from generated statutory PDF');
  assert.ok(result.text.includes('DELHI FIRE SERVICE') || result.text.includes('FIRE SAFETY'), 'Must contain statutory authority title');
  assert.ok(result.confidence > 80, 'Must have high confidence for digital native text');
});

test('9. extractTextFromDocument handles raw Base64 without data URI scheme by sniffing %PDF- magic bytes', async () => {
  const samplePdfDataUrl = getSampleDocumentPdfDataUrl(
    'REQ-EOA-001',
    'Affiliation Continuation Letter 2026-27',
    'Delhi Institute of Engineering & Technology',
    '2026-2027'
  );

  const rawBase64Only = samplePdfDataUrl.split(',')[1];
  assert.ok(!rawBase64Only.startsWith('data:'), 'Should be raw base64 string');
  const result = await extractTextFromDocument(rawBase64Only);
  assert.ok(result.text.length > 50, 'Must parse raw Base64 PDF by detecting %PDF- magic bytes');
  assert.ok(result.text.includes('AFFILIATION') || result.text.includes('UNIVERSITY'), 'Must extract affiliation content');
});

test('10. extractTextFromDocument handles PDF with application/octet-stream MIME type', async () => {
  const samplePdfDataUrl = getSampleDocumentPdfDataUrl(
    'REQ-EOA-006',
    'Building Occupancy / Completion Certificate',
    'Delhi Institute of Engineering & Technology',
    '2026-2027'
  );

  const octetStreamDataUrl = samplePdfDataUrl.replace('application/pdf', 'application/octet-stream');
  const result = await extractTextFromDocument(octetStreamDataUrl);
  assert.ok(result.text.length > 50, 'Must detect PDF stream despite octet-stream MIME');
  assert.ok(result.text.includes('OCCUPANCY') || result.text.includes('COMPLETION'), 'Must extract occupancy content');
});

test('11. Initial demo application documents can be extracted for OCR without throwing missing data errors', async () => {
  resetDb();
  setSession({ role: 'admin', email: 'admin@aicte.gov.in' });

  const app = await getApplicationById('APP-EOA-2026-001');
  assert.ok(app, 'Demo app must exist');
  assert.ok(app.documents && app.documents.length > 0, 'Must have documents');

  for (const doc of app.documents) {
    let payload = doc.fileDataUrl || doc.fileUrl;
    if (!payload && doc.fileBlobId) {
      payload = await getApplicationFileBlob(app.id, doc.fileBlobId);
    }
    if (!payload) {
      payload = getSampleDocumentPdfDataUrl(doc.requirementId || doc.id, doc.name, app.collegeName, app.academicYear);
    }

    assert.ok(payload, `Payload must be available for ${doc.name}`);
    const ocrResult = await extractTextFromDocument(payload);
    assert.ok(ocrResult.text.length > 30, `Text must be extracted for ${doc.name}`);
  }
});

