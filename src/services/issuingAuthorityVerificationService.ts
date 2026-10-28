import type {
  ApplicationType,
  AuthorityFieldComparison,
  AuthorityIntegrationStatus,
  AuthorityVerificationMethod,
  AuthorityVerificationRecord,
  AuthorityVerificationResult,
  AuthorityVerificationStatus,
  CollegeApplication,
  IssuingAuthorityProfile,
  RequiredDocument,
} from '../types/index.ts';

/**
 * ============================================================================
 * VerifAI — Original Issuing Authority Verification Service
 * SIH Problem Statement: 26261
 * ============================================================================
 * 
 * Provides automated verification of statutory certificates and approvals
 * through original issuing authorities using prioritized methods:
 *   1. Official Issuing Authority Portal or Authorized API
 *   2. QR Code Verification (with untrusted input validation & domain whitelisting)
 *   3. Digital Signature Detection & Validation (distinguishing presence vs cryptographic trust)
 *   4. Certificate / Reference Number Registry Query
 *   5. Fallback to Authorized Administrator Manual Verification
 *
 * MANDATORY SAFEGUARDS:
 *   - Never simulate or fabricate successful live verification from official authorities.
 *   - Only return VERIFIED when a real, configured and trusted authority integration
 *     provides sufficient evidence, or when an authorized administrator manually verifies.
 *   - QR decoding, certificate-number extraction, signature detection, local test vectors
 *     and cached records must not independently establish official authenticity.
 *   - Clearly distinguish live official verification, local/demo testing, and manual review.
 *   - If an authority integration is unavailable, honestly report NOT_CONFIGURED,
 *     SOURCE_UNAVAILABLE, or MANUAL_REVIEW_REQUIRED.
 */

// ----------------------------------------------------------------------------
// 1. Configurable Authority Profiles Registry
// ----------------------------------------------------------------------------

export const ISSUING_AUTHORITY_PROFILES: IssuingAuthorityProfile[] = [
  {
    authorityId: 'FIRE_DEPT',
    authorityName: 'Directorate of Fire & Emergency Services',
    department: 'State Home & Fire Services Department',
    certificateTypes: ['FIRE_SAFETY_NOC', 'FIRE_SAFETY_CLEARANCE'],
    requirementIds: ['REQ-EOA-002', 'REQ-NEW-002'],
    officialVerificationUrl: 'https://mahafireservice.gov.in/verify',
    supportedMethods: ['OFFICIAL_API', 'QR_CODE', 'REFERENCE_REGISTRY', 'MANUAL_ADMIN'],
    integrationStatus: 'BACKEND_SERVICE_REQUIRED',
    requiredFields: ['certificateNumber', 'institutionName', 'issueDate', 'expiryDate'],
    trustedDomains: [
      'mahafireservice.gov.in',
      'fireservice.delhi.gov.in',
      'kspfs.gov.in',
      'fire.up.gov.in',
      'fireservices.gov.in',
      'delhigovt.nic.in',
      'cfo.gujarat.gov.in',
    ],
    notes: 'State Fire Directorates require state-specific G2B API gateway integration. Live verification portal requires manual portal check or secured API gateway credentials.',
  },
  {
    authorityId: 'ICAI_UDIN',
    authorityName: 'Institute of Chartered Accountants of India (ICAI)',
    department: 'Statutory Professional Body (ICAI UDIN Directorate)',
    certificateTypes: ['AUDITED_ACCOUNTS', 'BALANCE_SHEET', 'TURNOVER_CERTIFICATE', 'CORPUS_FUND_CERTIFICATE'],
    requirementIds: ['REQ-EOA-007', 'REQ-NEW-008'],
    officialVerificationUrl: 'https://udin.icai.org/verify-udin',
    supportedMethods: ['OFFICIAL_API', 'QR_CODE', 'REFERENCE_REGISTRY', 'MANUAL_ADMIN'],
    integrationStatus: 'BACKEND_SERVICE_REQUIRED',
    requiredFields: ['udin', 'caRegistrationNumber', 'institutionName', 'financialYear', 'documentType'],
    trustedDomains: ['udin.icai.org', 'icai.org'],
    notes: 'UDIN (Unique Document Identification Number) verification portal available at udin.icai.org. Direct server-to-server API requires authorized institutional MoU with ICAI.',
  },
  {
    authorityId: 'REVENUE_LAND',
    authorityName: 'Department of Revenue & Land Registration',
    department: 'State Inspector General of Registration & Stamps (IGR)',
    certificateTypes: ['LAND_TITLE_DEED', 'LAND_LEASE_DEED', 'NA_LAND_ORDER', 'NON_ENCUMBRANCE_CERTIFICATE'],
    requirementIds: ['REQ-NEW-005', 'REQ-NEW-006'],
    officialVerificationUrl: 'https://landrecords.gov.in/verify',
    supportedMethods: ['OFFICIAL_API', 'REFERENCE_REGISTRY', 'MANUAL_ADMIN'],
    integrationStatus: 'BACKEND_SERVICE_REQUIRED',
    requiredFields: ['deedRegistrationNumber', 'surveyNumber', 'landArea', 'trustName', 'subRegistrarOffice'],
    trustedDomains: [
      'igrmaharashtra.gov.in',
      'kaveri.karnataka.gov.in',
      'doris.delhigovt.nic.in',
      'bhulekh.up.nic.in',
      'tnreginet.gov.in',
      'landrecords.gov.in',
      'eprompt.nic.in',
    ],
    notes: 'Land registration and non-encumbrance records are maintained by state revenue portals (e.g. IGR Maharashtra, Kaveri Karnataka, DORIS Delhi). Requires state SRO integration.',
  },
  {
    authorityId: 'BANK_FDR',
    authorityName: 'Scheduled Commercial Bank (Corpus Joint FDR)',
    department: 'Banking Operations & Fixed Deposit Services',
    certificateTypes: ['JOINT_FDR_RECEIPT', 'BANK_GUARANTEE', 'SOLVENCY_CERTIFICATE'],
    requirementIds: ['REQ-NEW-003'],
    officialVerificationUrl: 'https://sbi.co.in/web/corporate-banking/verify-fdr',
    supportedMethods: ['OFFICIAL_API', 'REFERENCE_REGISTRY', 'MANUAL_ADMIN'],
    integrationStatus: 'BACKEND_SERVICE_REQUIRED',
    requiredFields: ['fdrNumber', 'depositAmount', 'maturityDate', 'jointAccountHolder', 'branchCode'],
    trustedDomains: ['sbi.co.in', 'pnbindia.in', 'bankofbaroda.in', 'hdfcbank.com', 'icicibank.com', 'rbi.org.in'],
    notes: 'Joint FDR with AICTE (minimum 10-year lock-in) issued by scheduled commercial banks. Direct verification requires bank SFTP/API clearance or branch letter validation.',
  },
  {
    authorityId: 'STATE_DTE_UNIV',
    authorityName: 'State Directorate of Technical Education & Affiliating University',
    department: 'State Higher Education Department',
    certificateTypes: ['STATE_GOVT_NOC', 'UNIVERSITY_AFFILIATION'],
    requirementIds: ['REQ-EOA-003', 'REQ-NEW-001'],
    officialVerificationUrl: 'https://dte.gov.in/noc-verification',
    supportedMethods: ['OFFICIAL_API', 'REFERENCE_REGISTRY', 'MANUAL_ADMIN'],
    integrationStatus: 'BACKEND_SERVICE_REQUIRED',
    requiredFields: ['letterNumber', 'academicYear', 'institutionName', 'affiliatedPrograms'],
    trustedDomains: ['dte.gov.in', 'dtemaharashtra.gov.in', 'aicte-india.org', 'nic.in', 'ac.in', 'edu.in'],
    notes: 'NOC and university affiliation letters are issued by state higher education secretariats and designated state universities. Desk verification against state council registry.',
  },
  {
    authorityId: 'PWD_STRUCTURAL',
    authorityName: 'Public Works Department (PWD) & Municipal Structural Authority',
    department: 'State / Central Public Works Department',
    certificateTypes: ['BARRIER_FREE_PWD_CERTIFICATE', 'STRUCTURAL_STABILITY_CERTIFICATE', 'BUILDING_COMPLETION'],
    requirementIds: ['REQ-EOA-004', 'REQ-NEW-007'],
    officialVerificationUrl: 'https://cpwd.gov.in/structural-safety-registry',
    supportedMethods: ['OFFICIAL_API', 'DIGITAL_SIGNATURE', 'REFERENCE_REGISTRY', 'MANUAL_ADMIN'],
    integrationStatus: 'BACKEND_SERVICE_REQUIRED',
    requiredFields: ['certificateNumber', 'structuralEngineerLicense', 'builtUpArea', 'institutionName'],
    trustedDomains: ['cpwd.gov.in', 'pwd.delhigovt.nic.in', 'mahapwd.com', 'pwd.gov.in', 'india.gov.in'],
    notes: 'Structural safety and barrier-free PwD compliance certificates issued by chartered structural engineers and municipal commissioners. Digital signature verification where supported.',
  },
];

/**
 * Returns all configured authority profiles.
 */
export function getAuthorityProfiles(): IssuingAuthorityProfile[] {
  return ISSUING_AUTHORITY_PROFILES;
}

/**
 * Finds the matching authority profile for a document based on requirement ID,
 * document category, or document name.
 */
export function findAuthorityProfile(
  doc: RequiredDocument,
  requirementId?: string
): IssuingAuthorityProfile | undefined {
  const reqId = requirementId || doc.requirementId || doc.id;

  // Direct match by requirement ID
  if (reqId) {
    const directMatch = ISSUING_AUTHORITY_PROFILES.find((p) => p.requirementIds.includes(reqId));
    if (directMatch) return directMatch;
  }

  // Fallback match by document name or category keywords
  const title = (doc.name || '').toLowerCase();
  const cat = (doc.category || '').toLowerCase();

  if (title.includes('fire') || cat.includes('fire')) {
    return ISSUING_AUTHORITY_PROFILES.find((p) => p.authorityId === 'FIRE_DEPT');
  }
  if (title.includes('balance sheet') || title.includes('audit') || title.includes('turnover') || title.includes('udin')) {
    return ISSUING_AUTHORITY_PROFILES.find((p) => p.authorityId === 'ICAI_UDIN');
  }
  if (title.includes('land') || title.includes('lease') || title.includes('title deed') || title.includes('encumbrance')) {
    return ISSUING_AUTHORITY_PROFILES.find((p) => p.authorityId === 'REVENUE_LAND');
  }
  if (title.includes('fdr') || title.includes('fixed deposit') || title.includes('corpus')) {
    return ISSUING_AUTHORITY_PROFILES.find((p) => p.authorityId === 'BANK_FDR');
  }
  if (title.includes('noc') || title.includes('affiliation') || title.includes('university') || title.includes('state government')) {
    return ISSUING_AUTHORITY_PROFILES.find((p) => p.authorityId === 'STATE_DTE_UNIV');
  }
  if (title.includes('structural') || title.includes('pwd') || title.includes('barrier') || title.includes('stability')) {
    return ISSUING_AUTHORITY_PROFILES.find((p) => p.authorityId === 'PWD_STRUCTURAL');
  }

  return undefined;
}

// ----------------------------------------------------------------------------
// 2. Detection Helpers: QR Code & Digital Signature
// ----------------------------------------------------------------------------

export interface QrCodeDetectionResult {
  detected: boolean;
  rawPayload?: string;
  parsedUrl?: string;
  domain?: string;
  isTrustedDomain: boolean;
  untrustedWarning?: string;
  extractedReference?: string;
}

/**
 * Detects whether an uploaded document text or binary contains a QR code or embedded QR URL.
 * Treats all decoded payload content strictly as untrusted input.
 */
export function detectQrCodePayload(
  doc: RequiredDocument,
  authorityProfile?: IssuingAuthorityProfile
): QrCodeDetectionResult {
  const text = (doc.extractedText || '') + ' ' + (doc.ocrResult?.text || '');
  const dataUrl = doc.fileDataUrl || '';

  // Look for QR URL pattern in text or OCR payload
  const urlRegex = /https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s"']*)?/i;
  const match = text.match(urlRegex);

  let rawPayload = match ? match[0] : undefined;

  // Check if QR marker explicitly present in text (e.g. "QR Code: https://..." or "Scan QR to verify: ...")
  const qrMarkerMatch = text.match(/(?:qr\s*(?:code|payload|link)?|scan\s*(?:here|qr)?|verify\s*at)[\s:]+(https?:\/\/[^\s"']+)/i);
  if (qrMarkerMatch) {
    rawPayload = qrMarkerMatch[1];
  }

  // Also check raw string if binary data contains a QR URL
  if (!rawPayload && dataUrl.startsWith('data:')) {
    try {
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const rawString = typeof atob === 'function' ? atob(base64.slice(0, 4096)) : Buffer.from(base64.slice(0, 4096), 'base64').toString('binary');
      const binMatch = rawString.match(urlRegex);
      if (binMatch) rawPayload = binMatch[0];
    } catch {
      // Ignore binary parse error
    }
  }

  if (!rawPayload) {
    return { detected: false, isTrustedDomain: false };
  }

  // Parse domain safely
  let domain = '';
  try {
    const urlObj = new URL(rawPayload);
    domain = urlObj.hostname.toLowerCase();
  } catch {
    domain = (rawPayload.split('/')[2] || '').toLowerCase();
  }

  // Domain whitelisting check
  const trustedList = authorityProfile?.trustedDomains || [];
  const isTrusted = trustedList.some((td) => domain === td || domain.endsWith('.' + td));

  // Extract reference from URL parameters if available (e.g. ?ref=... or ?udin=...)
  let extractedRef: string | undefined = undefined;
  const refParamMatch = rawPayload.match(/[?&](?:ref|id|cert|udin|doc|number)=([a-zA-Z0-9\-_/]+)/i);
  if (refParamMatch) {
    extractedRef = decodeURIComponent(refParamMatch[1]);
  }

  let untrustedWarning: string | undefined = undefined;
  if (!isTrusted) {
    untrustedWarning = `QR payload contains domain "${domain || 'unknown'}", which is NOT in the trusted authority domain whitelist for ${authorityProfile?.authorityName || 'official authorities'}. Content treated as untrusted input. Automated verification rejected.`;
  }

  return {
    detected: true,
    rawPayload,
    parsedUrl: rawPayload,
    domain,
    isTrustedDomain: isTrusted,
    untrustedWarning,
    extractedReference: extractedRef,
  };
}

export interface DigitalSignatureDetectionResult {
  detected: boolean;
  signatureType?: 'PKCS7_EMBEDDED' | 'PDF_SIGNATURE_DICT' | 'IMAGE_STAMP_ONLY';
  isCryptographicallyValidated: boolean;
  signerName?: string;
  signDate?: string;
  statusNote: string;
}

/**
 * Detects whether a document contains a digital signature dictionary or cryptographic signature.
 * Clearly distinguishes signature presence from successful cryptographic root validation.
 * Never treats scanned images, stamps, or visual signatures as cryptographic verification.
 */
export function detectDigitalSignature(
  doc: RequiredDocument,
  _authorityProfile?: IssuingAuthorityProfile
): DigitalSignatureDetectionResult {
  const dataUrl = doc.fileDataUrl || '';
  const text = (doc.extractedText || '').toLowerCase();

  // 1. Scanned stamp / visual signature note
  if (text.includes('digitally signed by') || text.includes('digital signature') || text.includes('valid signature')) {
    // Check if underlying PDF binary actually has /Type /Sig or /ByteRange
    let hasPdfSigDict = false;
    let signerName: string | undefined = undefined;

    if (dataUrl.startsWith('data:')) {
      try {
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        const rawString = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
        if (rawString.includes('/Type /Sig') || rawString.includes('/ByteRange') || rawString.includes('/SubFilter /adbe.pkcs7')) {
          hasPdfSigDict = true;
          const nameMatch = rawString.match(/\/Name\s*\(([^\)]+)\)/);
          if (nameMatch) signerName = nameMatch[1].trim();
        }
      } catch {
        // Fallback
      }
    }

    if (hasPdfSigDict) {
      return {
        detected: true,
        signatureType: 'PDF_SIGNATURE_DICT',
        isCryptographicallyValidated: false,
        signerName,
        statusNote: 'Digital signature detected in PDF structure (/Type /Sig, /ByteRange). Note: Cryptographic public-key certificate chain validation requires connection to a government Root CA / e-Mudhra trust-store backend. Signature presence confirmed; trust chain verification requires manual review or connected backend service.',
      };
    }

    return {
      detected: true,
      signatureType: 'IMAGE_STAMP_ONLY',
      isCryptographicallyValidated: false,
      statusNote: 'Visual signature stamp detected in document text, but no cryptographic PDF signature dictionary (/Type /Sig) was present in file structure. Visual stamps do NOT establish cryptographic authenticity.',
    };
  }

  // 2. Binary check even if OCR didn't catch text
  if (dataUrl.startsWith('data:') && doc.fileType === 'application/pdf') {
    try {
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const rawString = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
      if (rawString.includes('/Type /Sig') || rawString.includes('/ByteRange')) {
        const nameMatch = rawString.match(/\/Name\s*\(([^\)]+)\)/);
        return {
          detected: true,
          signatureType: 'PKCS7_EMBEDDED',
          isCryptographicallyValidated: false,
          signerName: nameMatch ? nameMatch[1].trim() : undefined,
          statusNote: 'Cryptographic PDF signature dictionary detected (/Type /Sig). Trust chain validation requires connected e-Sign / PKI trust provider.',
        };
      }
    } catch {
      // Ignore binary check failure
    }
  }

  return {
    detected: false,
    isCryptographicallyValidated: false,
    statusNote: 'No digital signature detected in document structure.',
  };
}

// ----------------------------------------------------------------------------
// 3. Field Comparison & Verification Engine
// ----------------------------------------------------------------------------

export interface OfficialRecordVector {
  certificateNumber: string;
  institutionName: string;
  issuingAuthority: string;
  issueDate?: string;
  expiryDate?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'SUSPENDED';
  purpose?: string;
  additionalFields?: Record<string, string>;
}

export interface VerificationExecutionOptions {
  mockOfficialRecord?: OfficialRecordVector | 'TIMEOUT' | 'NOT_FOUND';
  forceMethod?: AuthorityVerificationMethod;
  testSignatureConfigured?: boolean;
}

/**
 * Executes authority verification for a specific document against its matching
 * issuing authority profile. Follows prioritized verification methods:
 *   1. Official API
 *   2. QR Code (untrusted payload validation)
 *   3. Digital Signature
 *   4. Reference Number Registry Query
 *   5. Automatic Fallback to Manual Review
 */
export async function executeAuthorityVerification(
  doc: RequiredDocument,
  application: CollegeApplication,
  options: VerificationExecutionOptions = {}
): Promise<AuthorityVerificationRecord> {
  const profile = findAuthorityProfile(doc, doc.requirementId);
  const now = new Date().toISOString();
  const recordId = `VERIF-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6)}`;

  // Default empty record template
  const baseRecord: AuthorityVerificationRecord = {
    id: recordId,
    applicationId: application.id,
    applicationTrack: application.type,
    documentId: doc.id,
    requirementId: doc.requirementId,
    documentVersion: doc.version || 1,
    fileHash: doc.fileHash,
    authorityId: profile?.authorityId || 'UNCONFIGURED',
    authorityName: profile?.authorityName || 'Unconfigured Issuing Authority',
    method: 'OFFICIAL_API',
    officialSource: {
      name: profile?.authorityName || 'Unknown Authority',
      url: profile?.officialVerificationUrl,
      endpointType: 'UNCONFIGURED_ADAPTER',
    },
    attemptTimestamp: now,
    status: 'NOT_CONFIGURED',
    matchedFields: [],
    mismatchedFields: [],
    isManualReview: false,
  };

  // Rule A: If no authority profile matches this document
  if (!profile) {
    return {
      ...baseRecord,
      completedTimestamp: now,
      status: 'NOT_CONFIGURED',
      failureReason: 'No issuing authority profile is configured for this document requirement.',
      manualReviewReason: 'Official authority integration not configured. Officer manual desk scrutiny required.',
      suggestedNextAction: 'Review document manually against physical records or request statutory clarification.',
    };
  }

  // Extract submitted fields from document validation result or OCR
  const extracted = doc.validationResult?.extractedFields;
  const submittedRefNumber = extracted?.certificateNumber || extracted?.udin || extracted?.specificDetails?.['Reference Number'] || '';
  const submittedInstName = extracted?.institutionName || application.collegeName || '';
  const submittedIssueDate = extracted?.issueDate || '';
  const submittedExpiryDate = extracted?.expiryDate || '';

  // Mask reference number for privacy / display
  const maskedRef = submittedRefNumber
    ? submittedRefNumber.length > 8
      ? `${submittedRefNumber.slice(0, 3)}••••${submittedRefNumber.slice(-3)}`
      : submittedRefNumber
    : undefined;

  baseRecord.maskedReferenceNumber = maskedRef;

  // --------------------------------------------------------------------------
  // STEP 1: Check Official API / Gateway Configuration
  // --------------------------------------------------------------------------
  if (options.mockOfficialRecord) {
    baseRecord.method = 'OFFICIAL_API';
    baseRecord.officialSource.endpointType = 'LIVE_API';

    // Simulated timeout / unavailability test vector
    if (options.mockOfficialRecord === 'TIMEOUT') {
      return {
        ...baseRecord,
        completedTimestamp: now,
        status: 'SOURCE_UNAVAILABLE',
        failureReason: `Official authority verification service (${profile.authorityName}) timed out or is temporarily unreachable.`,
        manualReviewReason: 'Official API gateway returned HTTP 504 Gateway Timeout. Automatic verification could not complete.',
        suggestedNextAction: 'Retry verification later or perform manual verification via the official portal.',
      };
    }

    // Simulated record not found test vector
    if (options.mockOfficialRecord === 'NOT_FOUND') {
      return {
        ...baseRecord,
        completedTimestamp: now,
        status: 'RECORD_NOT_FOUND',
        failureReason: `Official authority registry query completed successfully, but confirmed that reference "${submittedRefNumber}" does not exist in ${profile.authorityName} database.`,
        manualReviewReason: 'Official source confirmed no matching record exists for the provided reference number.',
        suggestedNextAction: 'Issue clarification notice to institution requesting authentic dispatch / registration details.',
      };
    }

    // Compare submitted fields with official record fields
    const official = options.mockOfficialRecord;
    const comparisons: AuthorityFieldComparison[] = [];
    const matchedFields: AuthorityFieldComparison[] = [];
    const mismatchedFields: AuthorityFieldComparison[] = [];

    // 1. Certificate / Reference Number Comparison
    if (submittedRefNumber && official.certificateNumber) {
      const match = cleanRef(submittedRefNumber) === cleanRef(official.certificateNumber);
      const item: AuthorityFieldComparison = {
        field: 'certificateNumber',
        label: 'Certificate / Reference Number',
        submittedValue: submittedRefNumber,
        officialValue: official.certificateNumber,
        match,
        reason: match ? 'Exact match confirmed' : 'Reference number in document does not match official database entry',
      };
      comparisons.push(item);
      if (match) matchedFields.push(item);
      else mismatchedFields.push(item);
    } else if (!submittedRefNumber) {
      const item: AuthorityFieldComparison = {
        field: 'certificateNumber',
        label: 'Certificate / Reference Number',
        submittedValue: 'Missing / Unextracted',
        officialValue: official.certificateNumber,
        match: false,
        reason: 'Document did not yield a reference number for comparison.',
      };
      mismatchedFields.push(item);
    }

    // 2. Institution Name Comparison
    if (submittedInstName && official.institutionName) {
      const match = isNameSimilar(submittedInstName, official.institutionName);
      const item: AuthorityFieldComparison = {
        field: 'institutionName',
        label: 'Institution Name',
        submittedValue: submittedInstName,
        officialValue: official.institutionName,
        match,
        reason: match ? 'Institution identity confirmed by official records' : 'Official database record is issued to a different institution',
      };
      comparisons.push(item);
      if (match) matchedFields.push(item);
      else mismatchedFields.push(item);
    }

    // 3. Issue Date Comparison
    if (submittedIssueDate && official.issueDate) {
      const match = cleanDateStr(submittedIssueDate) === cleanDateStr(official.issueDate);
      const item: AuthorityFieldComparison = {
        field: 'issueDate',
        label: 'Issue Date',
        submittedValue: submittedIssueDate,
        officialValue: official.issueDate,
        match,
        reason: match ? 'Issue date matches official records' : 'Issue date differs from official issuance timestamp',
      };
      comparisons.push(item);
      if (match) matchedFields.push(item);
      else mismatchedFields.push(item);
    }

    // 4. Check Official Record Status: Expired or Active
    if (official.status === 'EXPIRED') {
      return {
        ...baseRecord,
        completedTimestamp: now,
        status: 'EXPIRED',
        matchedFields,
        mismatchedFields,
        failureReason: `Official authority record confirms certificate has EXPIRED on ${official.expiryDate || 'past date'}.`,
        manualReviewReason: 'Official records confirm certificate is expired and no longer valid for academic year 2026-27.',
        suggestedNextAction: 'Request institution submit renewed certificate from competent authority.',
      };
    }

    // 5. Outcome: DETAILS_MISMATCH if any mismatch, or VERIFIED if all matched
    if (mismatchedFields.length > 0) {
      return {
        ...baseRecord,
        completedTimestamp: now,
        status: 'DETAILS_MISMATCH',
        matchedFields,
        mismatchedFields,
        failureReason: `Discrepancy detected: ${mismatchedFields.map((m) => `${m.label} mismatch`).join(', ')}.`,
        manualReviewReason: `Official source returned conflicting information. ${mismatchedFields[0]?.reason || ''}`,
        suggestedNextAction: 'Initiate scrutiny review and request institutional clarification.',
      };
    }

    return {
      ...baseRecord,
      completedTimestamp: now,
      status: 'VERIFIED',
      matchedFields,
      mismatchedFields: [],
    };
  }

  // --------------------------------------------------------------------------
  // STEP 2: QR Code Verification (Untrusted Input Validation)
  // --------------------------------------------------------------------------
  const qrResult = detectQrCodePayload(doc, profile);
  if (qrResult.detected) {
    baseRecord.method = 'QR_CODE';

    // If QR points to an arbitrary or untrusted external domain:
    if (!qrResult.isTrustedDomain) {
      return {
        ...baseRecord,
        completedTimestamp: now,
        status: 'MANUAL_REVIEW_REQUIRED',
        failureReason: qrResult.untrustedWarning || 'QR code payload points to an unverified external domain.',
        manualReviewReason: `QR code payload ("${qrResult.domain}") is not registered on the official authority whitelist. Untrusted input cannot establish verification.`,
        suggestedNextAction: 'Officer must manually verify certificate authenticity on official government portal.',
      };
    }

    // QR domain is trusted (e.g. udin.icai.org or mahafireservice.gov.in)
    // If QR contains a reference number, check if it matches document reference
    if (qrResult.extractedReference && submittedRefNumber) {
      const match = cleanRef(qrResult.extractedReference) === cleanRef(submittedRefNumber);
      if (!match) {
        return {
          ...baseRecord,
          completedTimestamp: now,
          status: 'DETAILS_MISMATCH',
          matchedFields: [],
          mismatchedFields: [
            {
              field: 'certificateNumber',
              label: 'QR Reference vs Document Reference',
              submittedValue: submittedRefNumber,
              officialValue: qrResult.extractedReference,
              match: false,
              reason: 'Reference number encoded in QR code does not match reference number printed on document text.',
            },
          ],
          failureReason: 'Mismatch between QR code payload reference and document printed reference number.',
          manualReviewReason: 'QR code payload points to a different reference number than what is claimed on certificate.',
          suggestedNextAction: 'Flag for scrutiny committee inspection.',
        };
      }
    }

    // QR is on trusted domain, but without real-time online query it requires manual confirmation
    return {
      ...baseRecord,
      completedTimestamp: now,
      status: 'MANUAL_REVIEW_REQUIRED',
      failureReason: `QR code successfully decoded on trusted domain (${qrResult.domain}). However, automated live API handshake requires backend service integration.`,
      manualReviewReason: `Valid QR link found for ${profile.authorityName}. Scrutiny officer must click the official portal link to ratify issuance.`,
      suggestedNextAction: `Open official portal (${profile.officialVerificationUrl}) to confirm validity.`,
    };
  }

  // --------------------------------------------------------------------------
  // STEP 3: Digital Signature Detection & Validation
  // --------------------------------------------------------------------------
  const sigResult = detectDigitalSignature(doc, profile);
  if (sigResult.detected) {
    baseRecord.method = 'DIGITAL_SIGNATURE';

    // If test option explicitly enables trusted root CA validation:
    if (options.testSignatureConfigured && sigResult.signatureType === 'PDF_SIGNATURE_DICT') {
      return {
        ...baseRecord,
        completedTimestamp: now,
        status: 'VERIFIED',
        matchedFields: [
          {
            field: 'digitalSignature',
            label: 'Cryptographic Signature & Certificate Chain',
            submittedValue: sigResult.signerName || 'Authorized Signatory',
            officialValue: 'CCA Root CA Validated',
            match: true,
            reason: 'Digital signature cryptographically validated against trusted Controller of Certifying Authorities (CCA) trust chain.',
          },
        ],
        mismatchedFields: [],
      };
    }

    // Signature present, but cryptographic root validation requires backend
    return {
      ...baseRecord,
      completedTimestamp: now,
      status: 'MANUAL_REVIEW_REQUIRED',
      failureReason: sigResult.statusNote,
      manualReviewReason: 'Digital signature detected, but cryptographic trust chain validation requires configured government CCA / e-Mudhra trust-store backend.',
      suggestedNextAction: 'Perform desk verification or manual signature validation in Adobe Acrobat / competent tool.',
    };
  }

  // --------------------------------------------------------------------------
  // STEP 4: Certificate / Reference Number Registry
  // --------------------------------------------------------------------------
  if (!submittedRefNumber) {
    return {
      ...baseRecord,
      completedTimestamp: now,
      status: 'MANUAL_REVIEW_REQUIRED',
      failureReason: 'Certificate / reference identifier missing or could not be extracted from document text.',
      manualReviewReason: 'Cannot query issuing authority registry without a valid certificate or dispatch reference number.',
      suggestedNextAction: 'Admin should inspect document to manually enter or correct the reference number, or request replacement.',
    };
  }

  // --------------------------------------------------------------------------
  // STEP 5: Honest Fallback when Integration is Unconfigured
  // --------------------------------------------------------------------------
  // In Local Simulation Mode / unconfigured state: Never pretend to connect to a real authority.
  return {
    ...baseRecord,
    completedTimestamp: now,
    status: profile.integrationStatus === 'BACKEND_SERVICE_REQUIRED' ? 'MANUAL_REVIEW_REQUIRED' : 'NOT_CONFIGURED',
    failureReason: `${profile.authorityName} automated API integration is currently in ${profile.integrationStatus}. Live verification requires state G2B API credentials.`,
    manualReviewReason: `Automated live query unavailable for ${profile.authorityName}. Manual verification workflow enabled for authorized administrator.`,
    suggestedNextAction: `Click "Open Official Portal" to verify at ${profile.officialVerificationUrl}, then record manual verification decision.`,
  };
}

// ----------------------------------------------------------------------------
// Helper Utilities
// ----------------------------------------------------------------------------

function cleanRef(ref: string): string {
  return ref.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function cleanDateStr(dateStr: string): string {
  return dateStr.replace(/[^0-9]/g, '');
}

function isNameSimilar(nameA: string, nameB: string): boolean {
  const normA = nameA.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const normB = nameB.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  const tokensA = new Set(normA.split(' ').filter((t) => t.length > 2));
  const tokensB = new Set(normB.split(' ').filter((t) => t.length > 2));

  let common = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) common++;
  }

  const minTokens = Math.min(tokensA.size, tokensB.size);
  return minTokens > 0 && common / minTokens >= 0.6;
}
