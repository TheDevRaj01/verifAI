import type {
  RequiredDocument,
  CollegeApplication,
  DuplicateStatus,
  DuplicateMatchDetail,
  DuplicateDetectionResult,
} from '../types/index.ts';
import { extractInformationFromOcr } from './documentValidationService.ts';

export const DEFAULT_SIMILARITY_THRESHOLD = 0.8;
export const LOCAL_SIMULATION_NOTICE =
  'Local Simulation Mode: Scope is restricted to documents within this institution’s local application records. Global/cross-device database comparison is inactive.';

/**
 * Converts a Base64 data URL or Base64 string into a Uint8Array.
 * Compatible with both Browser (atob) and Node.js environments.
 */
export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64Index = dataUrl.indexOf(';base64,');
  const base64 =
    base64Index !== -1
      ? dataUrl.slice(base64Index + 8)
      : dataUrl.startsWith('data:')
      ? dataUrl.split(',')[1] || ''
      : dataUrl;

  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Calculates SHA-256 cryptographic hash of a file or data payload.
 * Uses the Web Crypto API (crypto.subtle.digest).
 */
export async function calculateFileHash(
  data: ArrayBuffer | Uint8Array | string
): Promise<string> {
  let uint8: Uint8Array;
  if (typeof data === 'string') {
    if (data.startsWith('http://') || data.startsWith('https://')) {
      const response = await fetch(data);
      const buffer = await response.arrayBuffer();
      uint8 = new Uint8Array(buffer);
    } else if (data.startsWith('data:') || data.length > 200) {
      uint8 = dataUrlToUint8Array(data);
    } else {
      uint8 = new TextEncoder().encode(data);
    }
  } else if (data instanceof Uint8Array) {
    uint8 = data;
  } else {
    uint8 = new Uint8Array(data);
  }

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API subtle is not supported in this environment');
  }

  const hashBuffer = await subtle.digest('SHA-256', uint8 as unknown as BufferSource);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalizes certificate / reference numbers for robust matching.
 * Strips whitespace, hyphens, slashes, and special characters.
 */
export function normalizeCertificateNumber(num?: string): string {
  if (!num) return '';
  return num.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

/**
 * Normalizes issuing authority text for robust matching.
 * Strips generic bureaucratic prefixes/suffixes and common punctuation.
 */
export function normalizeAuthority(auth?: string): string {
  if (!auth) return '';
  return auth
    .toLowerCase()
    .replace(/\b(govt|government|dept|department|office|directorate|board|ministry|of|the|for|state|district)\b/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes deterministic Jaccard similarity score based on words and word-bigrams.
 * Returns a number between 0.00 and 1.00.
 */
export function calculateTextSimilarity(textA?: string, textB?: string): number {
  if (!textA || !textB) return 0;
  const cleanA = textA
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const cleanB = textB
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanA || !cleanB) return 0;
  if (cleanA === cleanB) return 1.0;

  const wordsA = cleanA.split(' ').filter((w) => w.length > 2);
  const wordsB = cleanB.split(' ').filter((w) => w.length > 2);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  // Unigram Jaccard
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  let intersectionWords = 0;
  for (const w of setA) {
    if (setB.has(w)) intersectionWords++;
  }
  const unionWords = new Set([...setA, ...setB]).size;
  const wordJaccard = unionWords > 0 ? intersectionWords / unionWords : 0;

  // Bigram Jaccard (captures phrase and sequence structure)
  const getBigrams = (words: string[]) => {
    const bigrams = new Set<string>();
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.add(`${words[i]}_${words[i + 1]}`);
    }
    return bigrams;
  };
  const bigramsA = getBigrams(wordsA);
  const bigramsB = getBigrams(wordsB);

  let bigramJaccard = wordJaccard;
  if (bigramsA.size > 0 && bigramsB.size > 0) {
    let intersectionBigrams = 0;
    for (const b of bigramsA) {
      if (bigramsB.has(b)) intersectionBigrams++;
    }
    const unionBigrams = new Set([...bigramsA, ...bigramsB]).size;
    bigramJaccard = unionBigrams > 0 ? intersectionBigrams / unionBigrams : 0;
  }

  // Blended metric: 40% unigrams + 60% bigrams
  const score = 0.4 * wordJaccard + 0.6 * bigramJaccard;
  return Math.round(score * 100) / 100;
}

export interface DuplicateDetectionOptions {
  similarityThreshold?: number;
  skipCrossAppCheck?: boolean;
}

/**
 * Evaluates duplicate status across:
 * - Method A: Exact cryptographic file hash (SHA-256)
 * - Method B: Certificate information match (Ref No + Issuing Authority)
 * - Method C: OCR text similarity analysis (Deterministic Jaccard >= threshold)
 *
 * Scoped strictly to the same institution (collegeId) to enforce privacy boundaries.
 * Excludes self-comparison of the document's current version.
 */
export async function detectDocumentDuplicates(
  targetDoc: RequiredDocument,
  currentApp: CollegeApplication,
  allCollegeApps: CollegeApplication[] = [],
  options?: DuplicateDetectionOptions
): Promise<DuplicateDetectionResult> {
  const threshold = options?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const matches: DuplicateMatchDetail[] = [];
  let evaluatedDocsCount = 0;

  // If targetDoc has no content, return UNIQUE
  if (
    !targetDoc.fileDataUrl &&
    !targetDoc.fileHash &&
    !targetDoc.extractedText &&
    !targetDoc.ocrResult?.text
  ) {
    return {
      checkedAt: new Date().toISOString(),
      status: 'UNIQUE',
      overallReason: 'No uploaded document content to evaluate for duplicates.',
      comparisonScope: 'NONE',
      matches: [],
      similarityThreshold: threshold,
      evaluatedDocumentsCount: 0,
      notice: LOCAL_SIMULATION_NOTICE,
    };
  }

  // Ensure fileHash on targetDoc if missing but fileDataUrl is present
  let targetHash = targetDoc.fileHash;
  if (!targetHash && targetDoc.fileDataUrl) {
    try {
      targetHash = await calculateFileHash(targetDoc.fileDataUrl);
      targetDoc.fileHash = targetHash;
    } catch {
      // Ignore hash computation failure
    }
  }

  // Target doc OCR text and extracted fields
  const targetOcrText = targetDoc.ocrResult?.text || targetDoc.extractedText || '';
  const targetFields =
    targetDoc.validationResult?.extractedFields ||
    (targetOcrText ? extractInformationFromOcr(targetOcrText) : {});

  const normTargetCert = normalizeCertificateNumber(targetFields.certificateNumber);
  const normTargetAuth = normalizeAuthority(targetFields.issuingAuthority);

  // Scope: Only applications belonging to the same college!
  // STRICT PRIVACY BOUNDARY: Never evaluate other colleges' documents
  const scopedApps = (allCollegeApps || []).filter(
    (app) => app.collegeId === currentApp.collegeId
  );
  // Ensure currentApp is included in comparison pool
  if (!scopedApps.some((a) => a.id === currentApp.id)) {
    scopedApps.push(currentApp);
  }

  let scopeType: DuplicateDetectionResult['comparisonScope'] = 'SAME_APPLICATION';
  if (scopedApps.length > 1) {
    scopeType = 'ALL_COLLEGE_APPLICATIONS';
  }

  for (const app of scopedApps) {
    const isCurrentApp = app.id === currentApp.id;

    for (const cand of app.documents || []) {
      // 1. Self-comparison exclusion:
      // A document must NEVER be compared against its own current version
      const isSameDocId = cand.id === targetDoc.id;
      const isSameRequirement =
        Boolean(cand.requirementId) && cand.requirementId === targetDoc.requirementId;
      const targetVersion = targetDoc.version ?? 1;
      const candVersion = cand.version ?? 1;

      // If it's the exact same document object, or same doc id with same version in the same app, skip!
      if (cand === targetDoc) continue;
      if (isCurrentApp && isSameDocId && candVersion === targetVersion) continue;
      if (isCurrentApp && isSameRequirement && candVersion === targetVersion && cand.id === targetDoc.id) continue;

      // Only evaluate candidates that have actual content uploaded
      if (!cand.fileDataUrl && !cand.fileHash && !cand.ocrResult?.text && !cand.extractedText) {
        continue;
      }

      evaluatedDocsCount++;

      // Candidate hash
      let candHash = cand.fileHash;
      if (!candHash && cand.fileDataUrl) {
        try {
          candHash = await calculateFileHash(cand.fileDataUrl);
          cand.fileHash = candHash;
        } catch {
          // ignore
        }
      }

      // Candidate OCR text and fields
      const candOcrText = cand.ocrResult?.text || cand.extractedText || '';
      const candFields =
        cand.validationResult?.extractedFields ||
        (candOcrText ? extractInformationFromOcr(candOcrText) : {});

      const normCandCert = normalizeCertificateNumber(candFields.certificateNumber);
      const normCandAuth = normalizeAuthority(candFields.issuingAuthority);

      // --- METHOD A: Exact File Match (SHA-256) ---
      if (targetHash && candHash && targetHash.toLowerCase() === candHash.toLowerCase()) {
        const appScopeLabel = isCurrentApp ? 'current application' : `earlier application (${app.id})`;
        matches.push({
          method: 'file_hash',
          status: 'EXACT_DUPLICATE',
          matchedDocumentId: cand.id,
          matchedRequirementTitle: cand.name,
          matchedApplicationId: app.id,
          matchedApplicationType: app.type,
          matchedVersion: cand.version,
          matchedFileName: cand.fileName,
          similarityScore: 1.0,
          reason: `Exact cryptographic match (SHA-256): this exact file was previously uploaded for "${cand.name}" in ${appScopeLabel}.`,
          comparisonDetails: {
            targetValue: targetHash.slice(0, 16) + '...',
            matchedValue: candHash.slice(0, 16) + '...',
            field: 'SHA-256 Hash',
          },
        });
        continue; // Exact match found for this candidate, skip to next candidate
      }

      // --- METHOD B: Certificate Information Match ---
      // Both must have non-empty certificate numbers (min 3 chars)
      if (normTargetCert.length >= 3 && normCandCert.length >= 3) {
        if (normTargetCert === normCandCert) {
          // Certificate numbers match! Now check issuing authority
          const authMatches =
            !normTargetAuth ||
            !normCandAuth ||
            normTargetAuth === normCandAuth ||
            normTargetAuth.includes(normCandAuth) ||
            normCandAuth.includes(normTargetAuth);

          if (authMatches) {
            const appScopeLabel = isCurrentApp ? 'current application' : `application (${app.id})`;
            matches.push({
              method: 'certificate_info',
              status: 'LIKELY_DUPLICATE',
              matchedDocumentId: cand.id,
              matchedRequirementTitle: cand.name,
              matchedApplicationId: app.id,
              matchedApplicationType: app.type,
              matchedVersion: cand.version,
              matchedFileName: cand.fileName,
              similarityScore: 0.95,
              reason: `Matching certificate reference (${targetFields.certificateNumber}) and issuing authority detected in "${cand.name}" (${appScopeLabel}).`,
              comparisonDetails: {
                targetValue: `${targetFields.certificateNumber} (${targetFields.issuingAuthority || 'N/A'})`,
                matchedValue: `${candFields.certificateNumber} (${candFields.issuingAuthority || 'N/A'})`,
                field: 'Certificate Number & Authority',
              },
            });
            continue;
          }
        } else {
          // Different certificate numbers explicitly present!
          // Explicit Rule: Different certificate numbers must not be declared duplicate based on college or document type alone.
        }
      }

      // --- METHOD C: Similar Document Detection (OCR Text Similarity) ---
      if (targetOcrText && candOcrText && targetOcrText.length > 50 && candOcrText.length > 50) {
        const similarity = calculateTextSimilarity(targetOcrText, candOcrText);
        if (similarity >= threshold) {
          const appScopeLabel = isCurrentApp ? 'current application' : `application (${app.id})`;
          matches.push({
            method: 'ocr_similarity',
            status: 'POSSIBLE_DUPLICATE',
            matchedDocumentId: cand.id,
            matchedRequirementTitle: cand.name,
            matchedApplicationId: app.id,
            matchedApplicationType: app.type,
            matchedVersion: cand.version,
            matchedFileName: cand.fileName,
            similarityScore: similarity,
            reason: `High OCR text similarity (${Math.round(similarity * 100)}%) detected with "${cand.name}" (${appScopeLabel}).`,
            comparisonDetails: {
              targetValue: `${targetOcrText.slice(0, 60)}...`,
              matchedValue: `${candOcrText.slice(0, 60)}...`,
              field: 'OCR Text Jaccard Similarity',
            },
          });
        }
      }
    }
  }

  // Aggregate results:
  // Priority: EXACT_DUPLICATE > LIKELY_DUPLICATE > POSSIBLE_DUPLICATE > UNIQUE
  let overallStatus: DuplicateStatus = 'UNIQUE';
  let overallReason = 'No duplicate documents detected across evaluated institutional records.';

  const exactMatch = matches.find((m) => m.status === 'EXACT_DUPLICATE');
  const likelyMatch = matches.find((m) => m.status === 'LIKELY_DUPLICATE');
  const possibleMatch = matches.find((m) => m.status === 'POSSIBLE_DUPLICATE');

  if (exactMatch) {
    overallStatus = 'EXACT_DUPLICATE';
    overallReason = exactMatch.reason;
  } else if (likelyMatch) {
    overallStatus = 'LIKELY_DUPLICATE';
    overallReason = likelyMatch.reason;
  } else if (possibleMatch) {
    overallStatus = 'POSSIBLE_DUPLICATE';
    overallReason = possibleMatch.reason;
  }

  return {
    checkedAt: new Date().toISOString(),
    status: overallStatus,
    overallReason,
    comparisonScope: evaluatedDocsCount > 0 ? scopeType : 'NONE',
    matches,
    similarityThreshold: threshold,
    evaluatedDocumentsCount: evaluatedDocsCount,
    notice: LOCAL_SIMULATION_NOTICE,
  };
}

/**
 * Fast pre-upload helper to detect exact file matches before completing an upload.
 */
export function checkPreUploadDuplicate(
  fileHash: string,
  targetRequirementId: string,
  currentApp: CollegeApplication,
  allCollegeApps: CollegeApplication[] = []
): {
  isDuplicate: boolean;
  matchedRequirementName?: string;
  matchedFileName?: string;
  matchedAppId?: string;
} {
  if (!fileHash) return { isDuplicate: false };

  const scopedApps = (allCollegeApps || []).filter(
    (app) => app.collegeId === currentApp.collegeId
  );
  if (!scopedApps.some((a) => a.id === currentApp.id)) {
    scopedApps.push(currentApp);
  }

  for (const app of scopedApps) {
    for (const doc of app.documents || []) {
      // If inspecting the requirement currently being replaced in the same app, skip
      if (
        app.id === currentApp.id &&
        (doc.requirementId === targetRequirementId || doc.id === targetRequirementId)
      ) {
        continue;
      }
      if (doc.fileHash && doc.fileHash.toLowerCase() === fileHash.toLowerCase()) {
        return {
          isDuplicate: true,
          matchedRequirementName: doc.name,
          matchedFileName: doc.fileName,
          matchedAppId: app.id,
        };
      }
    }
  }
  return { isDuplicate: false };
}
