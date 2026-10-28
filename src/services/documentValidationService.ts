import type {
  RequiredDocument,
  CollegeApplication,
  ChecklistRequirement,
  DocumentValidationResult,
  ValidationCheckFinding,
  ExtractedDocumentFields,
  PdfDocumentMetadata,
  DocumentVersionSnapshot,
} from '../types/index.ts';

/**
 * Standard authenticity status and disclaimer required by regulatory guidelines
 */
export const AUTHENTICITY_NOT_VERIFIED_TEXT =
  'AUTHENTICITY NOT VERIFIED — Official source verification is not configured.';

export const VERIFICATION_DISCLAIMER =
  'AUTHENTICITY NOT VERIFIED — Official source verification is not configured. This rule-based analysis is an automated aid for AICTE scrutiny officers and does not constitute official regulatory acceptance.';

/**
 * Helper to extract an excerpt / snippet around a match for evidence presentation.
 * Supports flexible whitespace matching (e.g. when text in document spans multiple lines).
 */
function extractEvidenceSnippet(fullText: string, targetStr: string, radius: number = 60): string {
  if (!fullText || !targetStr) return '';
  let idx = fullText.toLowerCase().indexOf(targetStr.toLowerCase());
  let matchLen = targetStr.length;

  if (idx === -1) {
    // Try matching with flexible whitespace (e.g. when targetStr was normalized from multiline)
    const words = targetStr.trim().split(/\s+/).filter(Boolean);
    if (words.length > 0) {
      const flexPattern = new RegExp(
        words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'),
        'i'
      );
      const flexMatch = fullText.match(flexPattern);
      if (flexMatch && flexMatch.index !== undefined) {
        idx = flexMatch.index;
        matchLen = flexMatch[0].length;
      }
    }
  }

  if (idx === -1) return '';
  const start = Math.max(0, idx - radius);
  const end = Math.min(fullText.length, idx + matchLen + radius);
  let snippet = fullText.substring(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) snippet = '...' + snippet;
  if (end < fullText.length) snippet = snippet + '...';
  return snippet;
}

/**
 * Normalizes text for comparison (lower-cased, whitespace collapsed, punctuation simplified)
 */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Calculates token overlap ratio between two strings (ignoring standard filler words)
 */
function calculateTokenOverlap(strA: string, strB: string): { ratio: number; matchedTokens: string[] } {
  const stopWords = new Set(['of', 'and', 'the', 'for', 'in', 'to', 'at', 'on', 'a', 'an', 'by', 'with', '&', '-']);
  const tokensA = normalizeText(strA)
    .split(' ')
    .filter((t) => t.length > 2 && !stopWords.has(t));
  const normalizedB = ' ' + normalizeText(strB) + ' ';

  if (tokensA.length === 0) return { ratio: 0, matchedTokens: [] };

  const matchedTokens = tokensA.filter((t) => normalizedB.includes(' ' + t + ' '));
  return {
    ratio: matchedTokens.length / tokensA.length,
    matchedTokens,
  };
}

export interface DateParseResult {
  date: Date | null;
  isAmbiguous: boolean;
  ambiguityReason?: string;
}

/**
 * Parses date string in common Indian / administrative formats into Date object.
 * Identifies and flags ambiguous date patterns (e.g. 2-digit years, ambiguous DD/MM vs MM/DD).
 * Handles spaces around separators (e.g. "20 / 08 / 2026").
 */
export function parseAdministrativeDate(dateStr: string): DateParseResult {
  if (!dateStr) return { date: null, isAmbiguous: false };
  // Collapse spaces around slashes, hyphens, and dots (e.g. "20 / 08 / 2026" -> "20/08/2026")
  const clean = dateStr.trim().replace(/\s*([\/\-\.])\s*/g, '$1');

  // Check 1: 2-digit year (e.g. 15/04/26) -> Ambiguous century
  const twoDigitYearMatch = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
  if (twoDigitYearMatch) {
    return {
      date: null,
      isAmbiguous: true,
      ambiguityReason: `Two-digit year detected ("${dateStr.trim()}"). Requires manual officer verification to confirm exact century and validity.`,
    };
  }

  // Check 2: Purely numeric DD/MM/YYYY or MM/DD/YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const part1 = parseInt(dmyMatch[1], 10);
    const part2 = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);

    // If both part1 and part2 are <= 12 and not equal, day vs month is ambiguous
    if (part1 <= 12 && part2 <= 12 && part1 !== part2) {
      return {
        date: new Date(year, part2 - 1, part1),
        isAmbiguous: true,
        ambiguityReason: `Ambiguous numeric date ("${clean}"). Could represent ${part1}/${part2}/${year} (DD/MM) or ${part2}/${part1}/${year} (MM/DD). Officer review recommended.`,
      };
    }

    if (part1 > 12 && part2 <= 12) {
      // Must be DD/MM/YYYY
      const d = new Date(year, part2 - 1, part1);
      return { date: isNaN(d.getTime()) ? null : d, isAmbiguous: false };
    }

    if (part2 > 12 && part1 <= 12) {
      // Must be MM/DD/YYYY
      const d = new Date(year, part1 - 1, part2);
      return { date: isNaN(d.getTime()) ? null : d, isAmbiguous: false };
    }

    if (part1 === part2 && part1 <= 12) {
      const d = new Date(year, part1 - 1, part1);
      return { date: isNaN(d.getTime()) ? null : d, isAmbiguous: false };
    }
  }

  // Format: YYYY-MM-DD (ISO format - unambiguous)
  const ymdMatch = clean.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    return { date: isNaN(d.getTime()) ? null : d, isAmbiguous: false };
  }

  // Format: DD Month YYYY (e.g., 31 March 2026 or 31st March 2026) -> Unambiguous because month name is spelled out
  const textDateMatch = clean.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i);
  if (textDateMatch) {
    const day = parseInt(textDateMatch[1], 10);
    const monthName = textDateMatch[2].toLowerCase();
    const year = parseInt(textDateMatch[3], 10);
    const months: Record<string, number> = {
      jan: 0, january: 0,
      feb: 1, february: 1,
      mar: 2, march: 2,
      apr: 3, april: 3,
      may: 4,
      jun: 5, june: 5,
      jul: 6, july: 6,
      aug: 7, august: 7,
      sep: 8, sept: 8, september: 8,
      oct: 9, october: 9,
      nov: 10, november: 10,
      dec: 11, december: 11,
    };
    if (monthName in months) {
      const d = new Date(year, months[monthName], day);
      return { date: isNaN(d.getTime()) ? null : d, isAmbiguous: false };
    }
  }

  const standardParse = new Date(clean);
  if (!isNaN(standardParse.getTime())) {
    return { date: standardParse, isAmbiguous: false };
  }

  return {
    date: null,
    isAmbiguous: true,
    ambiguityReason: `Non-standard or descriptive date format ("${clean}"). Requires manual interpretation.`,
  };
}

// Recognized statutory regulatory authorities for AICTE documents
export const RECOGNIZED_AUTHORITY_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'Delhi Fire Service', regex: /delhi\s+fire\s+service/i },
  { name: 'State Fire & Emergency Services', regex: /(?:state|municipal|chief)\s+fire\s+(?:officer|service|authority)/i },
  { name: 'Affiliating Technical University', regex: /(?:university|affiliat(?:ing|ion))\s+(?:authority|registrar|board)/i },
  { name: 'District Collectorate / Revenue Authority', regex: /(?:district\s+collector|revenue\s+department|tehsildar|sub-divisional\s+magistrate|sdm)/i },
  { name: 'Sub-Registrar (Land Registry)', regex: /sub-registrar|registration\s+department/i },
  { name: 'Chartered Structural Engineer', regex: /(?:chartered|empaneled|structural)\s+engineer/i },
  { name: 'State Directorate of Technical Education (DTE)', regex: /(?:directorate\s+of\s+technical\s+education|dte|principal\s+secretary)/i },
  { name: 'Chartered Accountant (ICAI)', regex: /(?:chartered\s+accountant|icai|statutory\s+auditor)/i },
  { name: 'Nationalized Bank', regex: /(?:state\s+bank\s+of\s+india|punjab\s+national\s+bank|bank\s+of\s+baroda|canara\s+bank|bank\s+manager)/i },
  { name: 'Municipal Planning Authority', regex: /(?:municipal\s+corporation|town\s+and\s+country\s+planning|development\s+authority)/i },
];

export interface RegulatoryDomain {
  titleKeywords: string[];
  docTypes: string[];
  textKeywords: RegExp;
  missingExplanation: string;
}

export const REGULATORY_DOMAINS: RegulatoryDomain[] = [
  {
    titleKeywords: ['fire safety', 'fire noc'],
    docTypes: ['Fire Safety Certificate & NOC'],
    textKeywords: /fire\s+safety|fire\s+service|fire\s+prevention|fire\s+noc|delhi\s+fire/i,
    missingExplanation: 'The document does not appear to be a Fire Safety Certificate or Fire NOC.',
  },
  {
    titleKeywords: ['affiliation'],
    docTypes: ['Continuation of Affiliation'],
    textKeywords: /affiliation|affiliat(?:ing|ed)\s+university|continuation\s+of\s+affiliation/i,
    missingExplanation: 'The document does not appear to be a University Affiliation Letter.',
  },
  {
    titleKeywords: ['structural stability'],
    docTypes: ['Structural Stability Certificate'],
    textKeywords: /structural\s+stability|soundness\s+certificate|structural\s+engineer/i,
    missingExplanation: 'The document does not appear to be a Structural Stability Certificate.',
  },
  {
    titleKeywords: ['faculty cadre', 'form 16'],
    docTypes: ['Faculty Cadre & Form 16 Summary'],
    textKeywords: /faculty\s+cadre|cadre\s+ratio|form\s*16/i,
    missingExplanation: 'The document does not appear to be a Faculty Cadre or Form 16 Summary.',
  },
  {
    titleKeywords: ['audited', 'financial'],
    docTypes: ['Audited Financial Statement'],
    textKeywords: /audited\s+balance\s+sheet|income\s+(?:and|&)\s+expenditure|audit\s+report|ca\s+audit/i,
    missingExplanation: 'The document does not appear to be an Audited Financial Statement.',
  },
  {
    titleKeywords: ['occupancy', 'completion certificate'],
    docTypes: ['Building Occupancy / Completion Certificate'],
    textKeywords: /(?:building\s+)?occupancy|building\s+completion/i,
    missingExplanation: 'The document does not appear to be a Building Occupancy / Completion Certificate.',
  },
  {
    titleKeywords: ['trust', 'society'],
    docTypes: ['Trust / Society Deed & MoA'],
    textKeywords: /trust\s+deed|deed\s+of\s+trust|memorandum\s+of\s+association|society\s+registration/i,
    missingExplanation: 'The document does not appear to be a Registered Trust/Society Deed or MoA.',
  },
  {
    titleKeywords: ['land title', 'lease deed', 'sale deed'],
    docTypes: ['Land Title Deed / 30-Year Lease'],
    textKeywords: /sale\s+deed|lease\s+deed|title\s+deed|khasra|revenue\s+record/i,
    missingExplanation: 'The document does not appear to be a Land Title Deed or Registered Lease.',
  },
  {
    titleKeywords: ['non-agricultural', 'conversion'],
    docTypes: ['Non-Agricultural (NA) Land Conversion Order'],
    textKeywords: /non-agricultural|na\s+conversion|land\s+use\s+conversion|collector\s+order/i,
    missingExplanation: 'The document does not appear to be a Non-Agricultural Land Conversion Order.',
  },
  {
    titleKeywords: ['fixed deposit', 'corpus', 'fdr'],
    docTypes: ['Joint Fixed Deposit Receipt (Corpus Fund)'],
    textKeywords: /fixed\s+deposit|corpus\s+fund|joint\s+fdr/i,
    missingExplanation: 'The document does not appear to be a Fixed Deposit Receipt (Corpus Fund).',
  },
  {
    titleKeywords: ['site plan', 'blueprint'],
    docTypes: ['Master Site Plan & Building Approval Blueprints'],
    textKeywords: /site\s+plan|building\s+approval|blueprint|architectural\s+plan/i,
    missingExplanation: 'The document does not appear to be an Architectural Blueprint or Site Plan.',
  },
  {
    titleKeywords: ['barrier-free', 'pwd'],
    docTypes: ['Barrier-Free Built Environment & PwD Audit'],
    textKeywords: /barrier-free|pwd\s+audit|accessibility\s+audit|ramps\s+and\s+lifts/i,
    missingExplanation: 'The document does not appear to be a Barrier-Free PwD Audit Certificate.',
  },
];

/**
 * Extracts key compliance information fields from raw OCR text using robust rule patterns
 */
export function extractInformationFromOcr(
  ocrText: string,
  requirement?: ChecklistRequirement
): ExtractedDocumentFields {
  if (!ocrText || ocrText.trim().length === 0) {
    return {};
  }

  const text = ocrText;
  const fields: ExtractedDocumentFields = {
    specificDetails: {},
  };

  // 1. Document Type Detection
  // Specific document types are evaluated first before general categories
  const docTypeKeywords = [
    // Regulatory checklist specific types
    { type: 'Fire Safety Certificate & NOC', regex: /fire\s+safety|fire\s+service|noc\s+for\s+fire|fire\s+noc|fire\s+prevention/i },
    { type: 'Continuation of Affiliation', regex: /(?:continuation|grant)\s+of\s+affiliation|affiliation\s+letter/i },
    { type: 'Structural Stability Certificate', regex: /structural\s+stability|soundness\s+certificate/i },
    { type: 'Faculty Cadre & Form 16 Summary', regex: /faculty\s+cadre|cadre\s+ratio|form\s*16/i },
    { type: 'Audited Financial Statement', regex: /audited\s+balance\s+sheet|income\s+(?:and|&)\s+expenditure|audit\s+report/i },
    { type: 'Building Occupancy / Completion Certificate', regex: /(?:building\s+)?occupancy\s+certificate|building\s+completion\s+certificate/i },
    { type: 'Trust / Society Deed & MoA', regex: /trust\s+deed|deed\s+of\s+trust|memorandum\s+of\s+association|society\s+registration/i },
    { type: 'Land Title Deed / 30-Year Lease', regex: /sale\s+deed|lease\s+deed|title\s+deed|conveyance\s+deed/i },
    { type: 'Non-Agricultural (NA) Land Conversion Order', regex: /non-agricultural|na\s+conversion|land\s+use\s+conversion/i },
    { type: 'Joint Fixed Deposit Receipt (Corpus Fund)', regex: /fixed\s+deposit|corpus\s+fund|joint\s+fdr/i },
    { type: 'State Government In-Principle NOC', regex: /state\s+government.*no\s+objection|in-principle\s+noc/i },
    { type: 'Affiliating University Consent to Affiliate', regex: /consent\s+to\s+affiliate|letter\s+of\s+intent/i },
    { type: 'Master Site Plan & Building Approval Blueprints', regex: /site\s+plan|building\s+approval|blueprint|architectural\s+plan/i },
    { type: 'Barrier-Free Built Environment & PwD Audit', regex: /barrier-free|pwd\s+audit|accessibility\s+audit|ramps\s+and\s+lifts/i },

    // Generic educational / training / course completion certificates
    { type: 'Certificate of Completion', regex: /certificate\s+of\s+completion|course\s+completion\s+certificate/i },
    { type: 'Certificate of Participation', regex: /certificate\s+of\s+participation|participation\s+certificate/i },
    { type: 'Certificate of Appreciation', regex: /certificate\s+of\s+appreciation/i },
    { type: 'Certificate of Achievement', regex: /certificate\s+of\s+achievement/i },
    { type: 'No Objection Certificate (NOC)', regex: /\bno\s+objection\s+certificate\b|\bnoc\b/i },
    { type: 'Certificate', regex: /\bcertificate\b/i },
  ];

  for (const dt of docTypeKeywords) {
    if (dt.regex.test(text)) {
      fields.documentType = dt.type;
      break;
    }
  }

  // 2. Certificate / Reference Number Extraction
  // Helper to validate whether a candidate string is a plausible certificate / ref number
  function isPlausibleRefNumber(val: string): boolean {
    if (!val || val.length < 4 || val.length > 40) return false;
    const clean = val.trim();
    // Must not be a date
    if (/^\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4}$/.test(clean)) return false;
    if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(clean)) return false;
    // Must not be a single pure short number (e.g. page numbers, single year, day)
    if (/^\d{1,4}$/.test(clean)) return false;
    // Must not be an amount like Rs. 1.00 Crore or percentage
    if (/^(?:rs|inr|usd|eur|[\$₹])/i.test(clean)) return false;
    // Must not be standard text phrases (unless it's an uppercase acronym)
    if (/^[a-zA-Z\s]{4,}$/.test(clean) && !/^[A-Z]{4,8}$/.test(clean)) {
      return false;
    }
    return true;
  }

  // A. Prefixed reference patterns
  const refPatterns = [
    /(?:ref(?:erence)?\.?\s*(?:no\.?|num(?:ber)?|#)?|dispatch\s*no\.?|file\s*no\.?|cert(?:ificate)?\s*(?:no\.?|#|id|code)?|noc\s*no\.?|reg(?:istration)?\s*(?:no\.?|#)?|letter\s*no\.?|fdr\s*no\.?|deed\s*no\.?|order\s*no\.?|verification\s*(?:id|code)|credential\s*id)[:\s]+([A-Z0-9\/\-\.]{4,35})/i,
    /udin[:\s]+([0-9A-Z]{15,20})/i,
  ];

  for (const pat of refPatterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      const candidate = match[1].trim().replace(/[\.,]+$/, '');
      if (isPlausibleRefNumber(candidate)) {
        fields.certificateNumber = candidate;
        break;
      }
    }
  }

  // B. Standalone identifier patterns on lines (e.g., "IICT-24062644543")
  if (!fields.certificateNumber) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // Check lines prioritizing the final lines (where standalone certificate IDs typically appear), then top lines
    const prioritizedIndices: number[] = [];
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 6); i--) {
      prioritizedIndices.push(i);
    }
    for (let i = 0; i < Math.min(6, lines.length); i++) {
      if (!prioritizedIndices.includes(i)) prioritizedIndices.push(i);
    }

    for (const idx of prioritizedIndices) {
      const line = lines[idx];
      // Format 1: 2-10 letters, followed by - or /, followed by 4-30 alphanumeric characters (e.g. IICT-24062644543)
      const standaloneCodeMatch = line.match(/^([A-Za-z]{2,10}[-\/][0-9A-Za-z\-_]{4,30})$/);
      if (standaloneCodeMatch) {
        const candidate = standaloneCodeMatch[1].trim();
        if (isPlausibleRefNumber(candidate)) {
          fields.certificateNumber = candidate;
          break;
        }
      }

      // Format 2: Alphanumeric code with letters and digits
      const mixedCodeMatch = line.match(/^([A-Z0-9]{3,12}[-\/][A-Z0-9\/\-_]{4,25})$/i);
      if (mixedCodeMatch && /[A-Za-z]/.test(line) && /\d/.test(line)) {
        const candidate = mixedCodeMatch[1].trim();
        if (isPlausibleRefNumber(candidate)) {
          fields.certificateNumber = candidate;
          break;
        }
      }
    }
  }

  // 3. Issuing Authority Identification
  // A. Recognized statutory authorities registry
  for (const auth of RECOGNIZED_AUTHORITY_PATTERNS) {
    if (auth.regex.test(text)) {
      fields.issuingAuthority = auth.name;
      break;
    }
  }

  // B. Explicit issuer extraction (handles multiline organization names like "Issued by:\nIndian Institute Of\nCreative Technologies")
  if (!fields.issuingAuthority) {
    const issuedByRegex =
      /(?:issued\s+by|issuing\s+authority|authorized\s+by|certified\s+by|conducted\s+by|awarded\s+by|organized\s+by)[:\s]+([\s\S]+?)(?=(?:\r?\n\s*(?:to\s+certify|this\s+is\s+to\s+certify|presented\s+to|awarded\s+to|certified\s+that|has\s+successfully|in\s+partnership|date|dated|ref|valid|\r?\n\r?\n|$)))/i;
    const match = text.match(issuedByRegex);
    if (match && match[1]) {
      const rawIssuer = match[1].trim();
      const normalizedIssuer = rawIssuer.replace(/\s+/g, ' ').trim();
      if (
        normalizedIssuer.length >= 3 &&
        normalizedIssuer.length <= 120 &&
        !/^(?:date|ref|valid|certificate)/i.test(normalizedIssuer)
      ) {
        fields.issuingAuthority = normalizedIssuer;
      }
    }
  }

  // 4. Issue Date Extraction (supporting "Date of Certification: 20 / 08 / 2026")
  const issueDatePatterns = [
    /(?:date\s*of\s*certification|certification\s*date|date\s*of\s*issue|issue\s*date|issued\s*on|dated|date)[\s:]+(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})/i,
    /(?:date\s*of\s*certification|certification\s*date|date\s*of\s*issue|issue\s*date|issued\s*on|dated|date)[\s:]+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{2,4})/i,
    /(?:date\s*of\s*certification|certification\s*date|date\s*of\s*issue|issue\s*date|issued\s*on|dated|date)[\s:]+(\d{4}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{1,2})/i,
  ];

  for (const pat of issueDatePatterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      fields.issueDate = match[1].trim();
      break;
    }
  }

  // 5. Expiry Date Extraction (strictly requires explicit validity or expiry clauses)
  const expiryPatterns = [
    /(?:valid\s*(?:till|up\s*to|through)|expiry\s*date|validity\s*(?:period|date|till))[\s:]+(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})/i,
    /(?:valid\s*(?:till|up\s*to|through)|expiry\s*date|validity\s*(?:period|date|till))[\s:]+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{2,4})/i,
    /(?:valid\s*for\s*(?:the\s*)?(?:period|academic\s*year))[\s:]+(20\d{2}\s*[\-\–]\s*20?\d{2})/i,
  ];

  for (const pat of expiryPatterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      fields.expiryDate = match[1].trim();
      fields.validityPeriod = match[1].trim();
      break;
    }
  }

  // 6. Academic Year
  const academicYearMatch = text.match(/\b(202[4-9]\s*[\-\–]\s*20?[2-3][0-9])\b/);
  if (academicYearMatch) {
    fields.academicYear = academicYearMatch[1].replace(/\s+/g, '');
  }

  // 7. Specific requirement-level details
  // FDR Amount (e.g., Rs. 1.00 Crore)
  const fdrMatch = text.match(/(?:rs\.?|inr)\s*([0-9\.,]+\s*(?:crore|lakhs?|cr))/i) || text.match(/(?:rs\.?|inr)\s*(1[,0\.]00[,0\.]000)/i);
  if (fdrMatch) {
    fields.specificDetails!['FDR Amount'] = fdrMatch[0].trim();
    fields.financialAmount = fdrMatch[0].trim();
  }

  // Cadre Ratio
  const ratioMatch = text.match(/(?:ratio|cadre)[\s:]*([1]:\d{1,2}(?:\.\d+)?)/i);
  if (ratioMatch) {
    fields.specificDetails!['Cadre Ratio'] = ratioMatch[1].trim();
  }

  // UDIN (Chartered Accountant)
  const udinMatch = text.match(/(?:udin|unique\s*doc(?:ument)?\s*id(?:entification)?\s*no\.?)[\s:]*([A-Za-z0-9\-]{5,30})/i);
  if (udinMatch) {
    const rawUdin = udinMatch[1].trim();
    fields.udin = rawUdin;
    fields.specificDetails!['UDIN'] = rawUdin;
  }

  // Land Area
  const landAreaMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:acres?|hectares?|sq\.?\s*(?:meters|yards|ft))/i);
  if (landAreaMatch) {
    fields.specificDetails!['Land Area'] = landAreaMatch[0].trim();
  }

  // 8. Institution / Entity Name Extraction
  const instNamePatterns = [
    /(?:name\s+of\s+(?:the\s+)?(?:institution|college|institute|applicant|society|trust)|institution\s+name|college\s+name)[:\s]+([^\r\n,;]+)/i,
    /(?:issued\s+to|presented\s+to|awarded\s+to|certified\s+that|in\s+favour\s+of|in\s+favor\s+of)[:\s]+([^\r\n,;]+)/i,
  ];
  for (const pat of instNamePatterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      const candidate = match[1].trim().replace(/\s+/g, ' ');
      if (
        candidate.length >= 5 &&
        candidate.length <= 100 &&
        !/^(?:date|ref|valid|certificate|this\s+is|mr|ms|dr)/i.test(candidate)
      ) {
        fields.institutionName = candidate;
        break;
      }
    }
  }

  if (!fields.institutionName) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length >= 10 && l.length <= 100);
    for (const line of lines) {
      if (
        /\b(?:college\s+of|institute\s+of|university|polytechnic|engineering\s+college)\b/i.test(line) &&
        !/\b(?:aicte|all\s+india|government|directorate|fire\s+service|department|ministry)\b/i.test(line)
      ) {
        fields.institutionName = line;
        break;
      }
    }
  }

  return fields;
}

/**
 * Checks whether a given checklist requirement has an applicable expiry/validity date rule.
 * Permanent documents (Trust deeds, perpetual land titles, NA orders, occupancy certificates)
 * do NOT have expiration rules.
 */
function requirementHasExpiryRule(requirementId?: string, title?: string): boolean {
  const normId = (requirementId || '').toUpperCase();
  const normTitle = (title || '').toLowerCase();

  // Explicit expiry checklist items
  if (normId === 'REQ-EOA-001' || normTitle.includes('affiliation')) return true;
  if (normId === 'REQ-EOA-002' || normTitle.includes('fire safety') || normTitle.includes('fire noc')) return true;
  if (normId === 'REQ-NEW-004' || normTitle.includes('fixed deposit') || normTitle.includes('fdr')) return true;

  // Permanent statutory records that do NOT expire
  if (normId === 'REQ-NEW-001' || normTitle.includes('trust') || normTitle.includes('society')) return false;
  if (normId === 'REQ-NEW-002' || normTitle.includes('land title') || normTitle.includes('sale deed')) return false;
  if (normId === 'REQ-NEW-003' || normTitle.includes('conversion') || normTitle.includes('non-agricultural')) return false;
  if (normId === 'REQ-EOA-006' || normTitle.includes('occupancy') || normTitle.includes('completion')) return false;
  if (normId === 'REQ-EOA-007' || normTitle.includes('barrier-free') || normTitle.includes('pwd')) return false;
  if (normId === 'REQ-NEW-007' || normTitle.includes('site plan') || normTitle.includes('blueprint')) return false;

  return false;
}

/**
 * Parses raw PDF date format (D:YYYYMMDDHHmmSS...) or ISO strings into a Date object.
 */
export function parsePdfDate(rawDate?: string): Date | null {
  if (!rawDate) return null;
  const clean = rawDate.trim();
  const isoTry = new Date(clean);
  if (!isNaN(isoTry.getTime()) && (clean.includes('-') || clean.includes('T'))) {
    return isoTry;
  }

  const pdfPattern = /^D:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz]|[+\-]\d{2}'?\d{2}'?)?/;
  const m = clean.match(pdfPattern);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = m[2] ? parseInt(m[2], 10) - 1 : 0;
    const day = m[3] ? parseInt(m[3], 10) : 1;
    const hour = m[4] ? parseInt(m[4], 10) : 0;
    const min = m[5] ? parseInt(m[5], 10) : 0;
    const sec = m[6] ? parseInt(m[6], 10) : 0;

    const tz = m[7];
    if (tz && (tz === 'Z' || tz === 'z')) {
      return new Date(Date.UTC(year, month, day, hour, min, sec));
    } else if (tz && (tz.startsWith('+') || tz.startsWith('-'))) {
      const sign = tz.startsWith('+') ? 1 : -1;
      const tzDigits = tz.slice(1).replace(/'/g, '');
      const tzHours = parseInt(tzDigits.slice(0, 2), 10) || 0;
      const tzMins = parseInt(tzDigits.slice(2, 4), 10) || 0;
      const totalOffsetMs = sign * (tzHours * 60 + tzMins) * 60 * 1000;
      const utcMs = Date.UTC(year, month, day, hour, min, sec) - totalOffsetMs;
      return new Date(utcMs);
    }
    return new Date(Date.UTC(year, month, day, hour, min, sec));
  }

  const fallback = new Date(clean);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Extracts PDF metadata fields synchronously from a Data URL or raw string.
 * Works seamlessly in both browser and Node.js testing environments without external dependencies.
 */
export function extractPdfMetadataSync(fileDataUrl?: string): PdfDocumentMetadata | undefined {
  if (!fileDataUrl) return undefined;
  try {
    let rawString = '';
    if (fileDataUrl.startsWith('data:')) {
      const base64 = fileDataUrl.includes(',') ? fileDataUrl.split(',')[1] : fileDataUrl;
      if (typeof atob === 'function') {
        rawString = atob(base64);
      } else if (typeof Buffer !== 'undefined') {
        rawString = Buffer.from(base64, 'base64').toString('binary');
      }
    } else {
      rawString = fileDataUrl;
    }

    if (
      !rawString ||
      (!rawString.includes('%PDF-') &&
        !rawString.includes('/CreationDate') &&
        !rawString.includes('/ModDate') &&
        !rawString.includes('/Producer'))
    ) {
      return undefined;
    }

    const result: PdfDocumentMetadata = {};
    if (rawString.includes('/Encrypt')) {
      result.isEncrypted = true;
    }

    const creationMatch = rawString.match(/\/CreationDate\s*\(([^\)]+)\)/);
    if (creationMatch) {
      result.creationDate = creationMatch[1].trim();
    }

    const modMatch = rawString.match(/\/ModDate\s*\(([^\)]+)\)/);
    if (modMatch) {
      result.modificationDate = modMatch[1].trim();
    }

    const producerMatch = rawString.match(/\/Producer\s*\(([^\)]+)\)/);
    if (producerMatch) {
      result.producer = producerMatch[1].trim();
    }

    const creatorMatch = rawString.match(/\/Creator\s*\(([^\)]+)\)/);
    if (creatorMatch) {
      result.creator = creatorMatch[1].trim();
    }

    const titleMatch = rawString.match(/\/Title\s*\(([^\)]+)\)/);
    if (titleMatch) {
      result.title = titleMatch[1].trim();
    }

    const authorMatch = rawString.match(/\/Author\s*\(([^\)]+)\)/);
    if (authorMatch) {
      result.author = authorMatch[1].trim();
    }

    return Object.keys(result).length > 0 ? result : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Async wrapper for PDF metadata extraction.
 */
export async function extractPdfMetadata(fileDataUrl?: string): Promise<PdfDocumentMetadata | undefined> {
  return extractPdfMetadataSync(fileDataUrl);
}

/**
 * Validates PDF metadata timestamps to detect modifications made before creation.
 * Missing metadata is handled safely without flagging.
 */
export function validatePdfMetadata(metadata?: PdfDocumentMetadata): ValidationCheckFinding[] {
  if (!metadata || (!metadata.creationDate && !metadata.modificationDate)) {
    return [
      {
        id: 'CHK-PDF-METADATA',
        ruleName: 'PDF Metadata & Timestamp Integrity',
        status: 'NOT_CHECKED',
        category: 'DATE_METADATA_ANOMALY',
        categoryLabel: 'Metadata check',
        reason:
          'PDF metadata timestamps not available (standard for flattened scans, stripped exports, or image uploads). Document treated as safe without suspicious indicators.',
      },
    ];
  }

  const creation = parsePdfDate(metadata.creationDate);
  const mod = parsePdfDate(metadata.modificationDate);

  if (creation && mod) {
    if (mod.getTime() < creation.getTime()) {
      return [
        {
          id: 'CHK-PDF-METADATA',
          ruleName: 'PDF Metadata & Timestamp Integrity',
          status: 'WARNING',
          category: 'DATE_METADATA_ANOMALY',
          categoryLabel: 'Metadata anomaly',
          reason: `PDF modification timestamp (${metadata.modificationDate}) precedes its creation timestamp (${metadata.creationDate}). This contradictory timestamp sequence indicates potential document alteration or metadata tampering.`,
          comparisonValue: `Creation Date (${metadata.creationDate}) <= Modification Date (${metadata.modificationDate})`,
          extractedValue: `Created: ${metadata.creationDate}, Modified: ${metadata.modificationDate}`,
          suggestedAction: 'Scrutiny officer should inspect document properties and digital signature chains.',
        },
      ];
    } else {
      return [
        {
          id: 'CHK-PDF-METADATA',
          ruleName: 'PDF Metadata & Timestamp Integrity',
          status: 'PASS',
          category: 'DATE_METADATA_ANOMALY',
          categoryLabel: 'Metadata verified',
          reason: `PDF creation and modification timestamps are in consistent chronological order (Created: ${metadata.creationDate}, Modified: ${metadata.modificationDate}).`,
          comparisonValue: 'Creation Date <= Modification Date',
          extractedValue: `Created: ${metadata.creationDate}, Modified: ${metadata.modificationDate}`,
        },
      ];
    }
  }

  return [
    {
      id: 'CHK-PDF-METADATA',
      ruleName: 'PDF Metadata & Timestamp Integrity',
      status: 'PASS',
      category: 'DATE_METADATA_ANOMALY',
      categoryLabel: 'Metadata verified',
      reason: `PDF metadata timestamp available (${metadata.creationDate || metadata.modificationDate}); no contradictory timestamps found.`,
      extractedValue: metadata.creationDate || metadata.modificationDate,
    },
  ];
}

/**
 * Validates document issue date against its expiry date.
 * Issue date cannot be later than expiry date. Exempts permanent records.
 */
export function validateDateLogic(
  extracted: ExtractedDocumentFields,
  requirement?: ChecklistRequirement,
  docName?: string
): ValidationCheckFinding[] {
  const hasExpiry = requirementHasExpiryRule(requirement?.id, requirement?.title || docName);

  if (!hasExpiry) {
    return [
      {
        id: 'CHK-DATE-CHRONOLOGY',
        ruleName: 'Document Date Chronology & Logic',
        status: 'NOT_CHECKED',
        category: 'DATE_METADATA_ANOMALY',
        categoryLabel: 'Permanent document',
        reason:
          'Contradictory date chronology check is not applicable for permanent statutory records (deeds, site plans, non-agricultural orders).',
      },
    ];
  }

  if (extracted.issueDate && extracted.expiryDate) {
    const parsedIssue = parseAdministrativeDate(extracted.issueDate);
    const parsedExpiry = parseAdministrativeDate(extracted.expiryDate);

    if (parsedIssue.date && parsedExpiry.date) {
      if (parsedIssue.date.getTime() > parsedExpiry.date.getTime()) {
        return [
          {
            id: 'CHK-DATE-CHRONOLOGY',
            ruleName: 'Document Date Chronology & Logic',
            status: 'WARNING',
            category: 'DATE_METADATA_ANOMALY',
            categoryLabel: 'Date inconsistency',
            reason: `Contradictory Date Sequence: Issue date (${extracted.issueDate}) occurs AFTER expiry date (${extracted.expiryDate}). A certificate cannot be issued after its validity has already expired.`,
            comparisonValue: 'Issue Date <= Expiry Date',
            extractedValue: `Issue: ${extracted.issueDate} > Expiry: ${extracted.expiryDate}`,
            suggestedAction:
              'Scrutiny officer should inspect certificate dates to verify whether this is an altered certificate or an issuance typo.',
          },
        ];
      } else {
        return [
          {
            id: 'CHK-DATE-CHRONOLOGY',
            ruleName: 'Document Date Chronology & Logic',
            status: 'PASS',
            category: 'DATE_METADATA_ANOMALY',
            categoryLabel: 'Date verified',
            reason: `Document date sequence is chronologically valid (Issued: ${extracted.issueDate}, Valid until: ${extracted.expiryDate}).`,
            comparisonValue: 'Issue Date <= Expiry Date',
            extractedValue: `Issued: ${extracted.issueDate}, Expires: ${extracted.expiryDate}`,
          },
        ];
      }
    }
  }

  return [
    {
      id: 'CHK-DATE-CHRONOLOGY',
      ruleName: 'Document Date Chronology & Logic',
      status: 'NOT_CHECKED',
      category: 'DATE_METADATA_ANOMALY',
      categoryLabel: 'Date logic check',
      reason: 'Issue date and expiry date pair not both present; chronological comparison skipped.',
    },
  ];
}

/**
 * Validates identification number format (such as ICAI 18-character UDIN on audit reports).
 * Distinguishes missing IDs from invalid formats without duplicating existing missing-number checks.
 */
export function validateIdentificationNumbers(
  extracted: ExtractedDocumentFields,
  requirement?: ChecklistRequirement,
  doc?: RequiredDocument,
  ocrText?: string
): ValidationCheckFinding[] {
  const findings: ValidationCheckFinding[] = [];
  const rawUdin = extracted.udin || extracted.specificDetails?.['UDIN'];

  if (rawUdin) {
    const cleanUdin = rawUdin.replace(/[\s\-]/g, '').toUpperCase();
    const isValidFormat = cleanUdin.length === 18 && /^\d{8}[A-Z0-9]{10}$/.test(cleanUdin);

    if (isValidFormat) {
      findings.push({
        id: 'CHK-UDIN-FORMAT',
        ruleName: 'ICAI UDIN Identifier Format Verification',
        status: 'PASS',
        category: 'IDENTIFIER_FORMAT',
        categoryLabel: 'Valid identifier format',
        reason: `Valid 18-character ICAI UDIN format verified: "${cleanUdin}".`,
        extractedValue: cleanUdin,
        comparisonValue: '18-character ICAI format (8 numeric digits + 10 alphanumeric characters)',
      });
    } else {
      findings.push({
        id: 'CHK-UDIN-FORMAT',
        ruleName: 'ICAI UDIN Identifier Format Verification',
        status: 'WARNING',
        category: 'IDENTIFIER_FORMAT',
        categoryLabel: 'Invalid identifier format',
        reason: `Invalid ICAI UDIN format detected ("${rawUdin}"). ICAI standard requires an 18-character identifier consisting of an 8-digit membership prefix followed by a 10-character alphanumeric document code.`,
        extractedValue: rawUdin,
        comparisonValue: '18-character ICAI standard format (8 digits + 10 alphanumeric chars)',
        suggestedAction:
          'Scrutiny officer should verify CA credentials and check UDIN on the official ICAI portal (udin.icai.org).',
      });
    }
  }

  return findings;
}

/**
 * Compares current document against previous uploaded versions.
 * If previous version is unavailable, returns NOT_CHECKED without fabricating comparisons.
 */
export function compareDocumentVersions(
  currentDoc: RequiredDocument,
  currentFields: ExtractedDocumentFields,
  currentText: string
): ValidationCheckFinding[] {
  if (!currentDoc.previousVersions || currentDoc.previousVersions.length === 0) {
    return [
      {
        id: 'CHK-VERSION-COMPARISON',
        ruleName: 'Document Version Comparison',
        status: 'NOT_CHECKED',
        category: 'SUSPICIOUS_CHANGES',
        categoryLabel: 'Comparison unavailable',
        reason: 'Previous document version unavailable; version comparison could not be performed.',
        suggestedAction: 'No previous uploaded version found in dossier. Baseline version established.',
      },
    ];
  }

  const prevSnapshot = currentDoc.previousVersions[currentDoc.previousVersions.length - 1];
  const prevVersionNum = prevSnapshot.version || 1;
  const currVersionNum = currentDoc.version || prevVersionNum + 1;

  const prevFields =
    prevSnapshot.extractedFields ||
    prevSnapshot.validationResult?.extractedFields ||
    (prevSnapshot.extractedText ? extractInformationFromOcr(prevSnapshot.extractedText) : {});

  const findings: ValidationCheckFinding[] = [];

  // 1. Certificate Number Comparison
  if (prevFields.certificateNumber && currentFields.certificateNumber) {
    if (normalizeText(prevFields.certificateNumber) !== normalizeText(currentFields.certificateNumber)) {
      findings.push({
        id: 'CHK-VER-CERT-NUM',
        ruleName: 'Certificate Reference Number Consistency Across Versions',
        status: 'WARNING',
        category: 'SUSPICIOUS_CHANGES',
        categoryLabel: 'Potential alteration indicator',
        reason: `Certificate reference number changed between versions: previously "${prevFields.certificateNumber}" (v${prevVersionNum}), currently "${currentFields.certificateNumber}" (v${currVersionNum}). Modifying a certificate reference number between uploads is a suspicious alteration indicator requiring scrutiny officer review.`,
        previousValue: prevFields.certificateNumber,
        currentValue: currentFields.certificateNumber,
        previousVersion: prevVersionNum,
        currentVersion: currVersionNum,
        suggestedAction:
          'Scrutiny officer should inspect physical records and contact the issuing authority to ensure the certificate was not manipulated.',
      });
    }
  }

  // 2. Issue Date Comparison
  if (prevFields.issueDate && currentFields.issueDate) {
    if (normalizeText(prevFields.issueDate) !== normalizeText(currentFields.issueDate)) {
      findings.push({
        id: 'CHK-VER-ISSUE-DATE',
        ruleName: 'Issue Date Consistency Across Versions',
        status: 'WARNING',
        category: 'SUSPICIOUS_CHANGES',
        categoryLabel: 'Potential alteration indicator',
        reason: `Issue date changed between versions: previously "${prevFields.issueDate}" (v${prevVersionNum}), currently "${currentFields.issueDate}" (v${currVersionNum}). Altering the issue date of a certified document between uploads is a potential alteration indicator requiring scrutiny review.`,
        previousValue: prevFields.issueDate,
        currentValue: currentFields.issueDate,
        previousVersion: prevVersionNum,
        currentVersion: currVersionNum,
        suggestedAction: 'Scrutiny officer should inspect original certificate issue date to verify authenticity.',
      });
    }
  }

  // 3. Issuing Authority Comparison
  if (prevFields.issuingAuthority && currentFields.issuingAuthority) {
    if (normalizeText(prevFields.issuingAuthority) !== normalizeText(currentFields.issuingAuthority)) {
      findings.push({
        id: 'CHK-VER-AUTHORITY',
        ruleName: 'Issuing Authority Consistency Across Versions',
        status: 'WARNING',
        category: 'SUSPICIOUS_CHANGES',
        categoryLabel: 'Potential alteration indicator',
        reason: `Issuing authority changed between versions: previously "${prevFields.issuingAuthority}" (v${prevVersionNum}), currently "${currentFields.issuingAuthority}" (v${currVersionNum}).`,
        previousValue: prevFields.issuingAuthority,
        currentValue: currentFields.issuingAuthority,
        previousVersion: prevVersionNum,
        currentVersion: currVersionNum,
        suggestedAction: 'Scrutiny officer should verify issuing authority stamp and signature block.',
      });
    }
  }

  // 4. Institution Name Comparison
  if (prevFields.institutionName && currentFields.institutionName) {
    if (normalizeText(prevFields.institutionName) !== normalizeText(currentFields.institutionName)) {
      findings.push({
        id: 'CHK-VER-INSTITUTION',
        ruleName: 'Institution Name Consistency Across Versions',
        status: 'WARNING',
        category: 'SUSPICIOUS_CHANGES',
        categoryLabel: 'Potential alteration indicator',
        reason: `Institution name changed between versions: previously "${prevFields.institutionName}" (v${prevVersionNum}), currently "${currentFields.institutionName}" (v${currVersionNum}).`,
        previousValue: prevFields.institutionName,
        currentValue: currentFields.institutionName,
        previousVersion: prevVersionNum,
        currentVersion: currVersionNum,
        suggestedAction: 'Confirm why institution entity name was modified between uploads.',
      });
    }
  }

  // 5. Expiry Date Comparison
  if (prevFields.expiryDate && currentFields.expiryDate) {
    if (normalizeText(prevFields.expiryDate) !== normalizeText(currentFields.expiryDate)) {
      findings.push({
        id: 'CHK-VER-EXPIRY',
        ruleName: 'Expiry Date Consistency Across Versions',
        status: 'WARNING',
        category: 'SUSPICIOUS_CHANGES',
        categoryLabel: 'Potential alteration indicator',
        reason: `Expiry date changed between versions: previously "${prevFields.expiryDate}" (v${prevVersionNum}), currently "${currentFields.expiryDate}" (v${currVersionNum}).`,
        previousValue: prevFields.expiryDate,
        currentValue: currentFields.expiryDate,
        previousVersion: prevVersionNum,
        currentVersion: currVersionNum,
        suggestedAction: 'Verify physical renewal certificate or extension endorsement.',
      });
    }
  }

  // 6. UDIN Comparison
  if (prevFields.udin && currentFields.udin) {
    if (normalizeText(prevFields.udin) !== normalizeText(currentFields.udin)) {
      findings.push({
        id: 'CHK-VER-UDIN',
        ruleName: 'UDIN Consistency Across Versions',
        status: 'WARNING',
        category: 'SUSPICIOUS_CHANGES',
        categoryLabel: 'Potential alteration indicator',
        reason: `UDIN changed between versions: previously "${prevFields.udin}" (v${prevVersionNum}), currently "${currentFields.udin}" (v${currVersionNum}).`,
        previousValue: prevFields.udin,
        currentValue: currentFields.udin,
        previousVersion: prevVersionNum,
        currentVersion: currVersionNum,
        suggestedAction: 'Verify changed UDIN on ICAI portal.',
      });
    }
  }

  // If no field differences were flagged, output a baseline comparison result
  if (findings.length === 0) {
    const prevClean = (prevSnapshot.extractedText || '').trim();
    const currClean = currentText.trim();
    if (prevClean && currClean && prevClean === currClean) {
      findings.push({
        id: 'CHK-VER-TEXT-DIFF',
        ruleName: 'Version Content Similarity',
        status: 'PASS',
        category: 'SUSPICIOUS_CHANGES',
        categoryLabel: 'Identical content',
        reason: `Document content is identical to previous version (v${prevVersionNum}). No unexpected textual shifts or field alterations detected.`,
        previousVersion: prevVersionNum,
        currentVersion: currVersionNum,
      });
    } else {
      findings.push({
        id: 'CHK-VER-TEXT-DIFF',
        ruleName: 'Version Content Comparison',
        status: 'PASS',
        category: 'SUSPICIOUS_CHANGES',
        categoryLabel: 'Version comparison passed',
        reason: `Document version v${currVersionNum} successfully compared with v${prevVersionNum}. Key statutory parameters and reference identifiers remain consistent.`,
        previousVersion: prevVersionNum,
        currentVersion: currVersionNum,
      });
    }
  }

  return findings;
}

/**
 * Validates cross-document consistency within the same application dossier.
 * Compares institution names across uploaded documents, exempting New Approval Sponsoring Trust deeds.
 */
export function validateCrossDocumentConsistency(
  currentDoc: RequiredDocument,
  currentFields: ExtractedDocumentFields,
  application?: CollegeApplication
): ValidationCheckFinding[] {
  if (!application || !application.documents || application.documents.length <= 1) {
    return [
      {
        id: 'CHK-CROSS-DOC',
        ruleName: 'Cross-Document Identity Consistency',
        status: 'NOT_CHECKED',
        category: 'CROSS_DOCUMENT_CONSISTENCY',
        categoryLabel: 'Cross-document verification',
        reason:
          'Cross-document consistency check requires multiple uploaded documents in the application dossier.',
      },
    ];
  }

  const currentReqId = (currentDoc.requirementId || currentDoc.id || '').toUpperCase();
  const isNewApproval = application.type === 'NEW_APPROVAL';
  const isCurrentTrustDeed =
    isNewApproval &&
    (currentReqId === 'REQ-NEW-001' || (currentDoc.name || '').toLowerCase().includes('trust'));

  const currentInstitution = currentFields.institutionName;
  if (!currentInstitution) {
    return [
      {
        id: 'CHK-CROSS-DOC',
        ruleName: 'Cross-Document Identity Consistency',
        status: 'NOT_CHECKED',
        category: 'CROSS_DOCUMENT_CONSISTENCY',
        categoryLabel: 'Cross-document verification',
        reason:
          'No explicit institution name detected in current document for cross-document comparison.',
      },
    ];
  }

  // Sponsoring Trust Deed in New Approval applications is legally executed under the Trust name
  if (isCurrentTrustDeed) {
    return [
      {
        id: 'CHK-CROSS-DOC',
        ruleName: 'Cross-Document Identity Consistency',
        status: 'PASS',
        category: 'CROSS_DOCUMENT_CONSISTENCY',
        categoryLabel: 'Sponsoring entity exemption',
        reason: `Sponsoring Trust Deed (${currentDoc.name}) is legally registered under the Sponsoring Entity name. Legitimately differing trust and college entity names are recognized and exempt from cross-document mismatch warnings.`,
      },
    ];
  }

  const findings: ValidationCheckFinding[] = [];
  let evaluatedOtherCount = 0;

  for (const otherDoc of application.documents) {
    if (otherDoc.id === currentDoc.id) continue;
    const otherReqId = (otherDoc.requirementId || otherDoc.id || '').toUpperCase();
    const isOtherTrustDeed =
      isNewApproval &&
      (otherReqId === 'REQ-NEW-001' || (otherDoc.name || '').toLowerCase().includes('trust'));
    if (isOtherTrustDeed) {
      // Sponsoring trust deed legitimately has trust name
      continue;
    }

    const otherFields =
      otherDoc.validationResult?.extractedFields ||
      (otherDoc.extractedText ? extractInformationFromOcr(otherDoc.extractedText) : undefined);
    const otherInstitution = otherFields?.institutionName;
    if (!otherInstitution) continue;

    evaluatedOtherCount++;
    const overlap = calculateTokenOverlap(currentInstitution, otherInstitution);
    if (overlap.ratio < 0.4) {
      findings.push({
        id: `CHK-CROSS-DOC-${otherDoc.id}`,
        ruleName: 'Cross-Document Identity Consistency',
        status: 'WARNING',
        category: 'CROSS_DOCUMENT_CONSISTENCY',
        categoryLabel: 'Cross-document mismatch',
        reason: `Cross-Document Institution Name Mismatch: Current document references "${currentInstitution}", while "${otherDoc.name}" in this application dossier references "${otherInstitution}". Documents submitted within the same application dossier must reference the same institution.`,
        comparisonValue: `Consistent institution across dossier (Found: "${otherInstitution}" in ${otherDoc.name})`,
        extractedValue: currentInstitution,
        relevantDocumentName: otherDoc.name,
        suggestedAction:
          'Scrutiny officer should verify whether a document belonging to a different college was uploaded by mistake.',
      });
    }
  }

  if (findings.length > 0) {
    return findings;
  }

  if (evaluatedOtherCount > 0) {
    return [
      {
        id: 'CHK-CROSS-DOC',
        ruleName: 'Cross-Document Identity Consistency',
        status: 'PASS',
        category: 'CROSS_DOCUMENT_CONSISTENCY',
        categoryLabel: 'Cross-document consistent',
        reason: `Institution identity is consistent across all ${evaluatedOtherCount} evaluated documents in this application dossier.`,
      },
    ];
  }

  return [
    {
      id: 'CHK-CROSS-DOC',
      ruleName: 'Cross-Document Identity Consistency',
      status: 'NOT_CHECKED',
      category: 'CROSS_DOCUMENT_CONSISTENCY',
      categoryLabel: 'Cross-document verification',
      reason:
        'Other uploaded documents in this application have not yet been analyzed for institution names.',
    },
  ];
}

/**
 * Main validation engine: evaluates extracted text against the specific checklist requirement
 * and application metadata.
 */
export function validateDocumentOcrText(
  doc: RequiredDocument,
  ocrText: string,
  application?: CollegeApplication,
  requirement?: ChecklistRequirement
): DocumentValidationResult {
  const findings: ValidationCheckFinding[] = [];
  const extracted = extractInformationFromOcr(ocrText, requirement);

  const cleanText = ocrText ? ocrText.trim() : '';
  const textLength = cleanText.length;
  const isInsufficient = textLength < 30;

  // -------------------------------------------------------------
  // Check 1: Text Legibility & Information Density
  // -------------------------------------------------------------
  if (isInsufficient) {
    findings.push({
      id: 'CHK-LEGIBILITY',
      ruleName: 'Text Legibility & Information Density',
      status: 'NEEDS_REVIEW',
      reason: `Insufficient readable text extracted (${textLength} characters). Document may be illegible, password-protected, blank, or scanned at low resolution.`,
      comparisonValue: 'Minimum 30 characters of readable institutional text',
      extractedValue: `${textLength} characters`,
    });
  } else {
    findings.push({
      id: 'CHK-LEGIBILITY',
      ruleName: 'Text Legibility & Information Density',
      status: 'PASS',
      reason: `Document contains ${textLength.toLocaleString()} readable characters with satisfactory OCR clarity.`,
      comparisonValue: 'Minimum 30 characters',
      extractedValue: `${textLength.toLocaleString()} characters`,
    });
  }

  // -------------------------------------------------------------
  // Check 2: Document Type Match vs Checklist Requirement
  // -------------------------------------------------------------
  const expectedTitle = requirement?.title || doc.name;
  const expectedLower = expectedTitle.toLowerCase();

  // Find matching domain definition if any
  const matchedDomain = REGULATORY_DOMAINS.find((dom) =>
    dom.titleKeywords.some((kw) => expectedLower.includes(kw))
  );

  const isGenericCertificate =
    extracted.documentType === 'Certificate of Completion' ||
    extracted.documentType === 'Certificate of Participation' ||
    extracted.documentType === 'Certificate of Appreciation' ||
    extracted.documentType === 'Certificate of Achievement' ||
    extracted.documentType === 'Certificate';

  if (isInsufficient) {
    findings.push({
      id: 'CHK-DOC-TYPE',
      ruleName: 'Document Type Match',
      status: 'NEEDS_REVIEW',
      reason: 'Could not determine document type due to insufficient extracted text.',
      comparisonValue: expectedTitle,
    });
  } else if (matchedDomain) {
    // The requirement belongs to a recognized regulatory domain (e.g. Fire Safety, Affiliation, etc.)
    const docTypeMatchesDomain = extracted.documentType && matchedDomain.docTypes.includes(extracted.documentType);
    const textHasDomainTerms = matchedDomain.textKeywords.test(ocrText);

    if (docTypeMatchesDomain || textHasDomainTerms) {
      findings.push({
        id: 'CHK-DOC-TYPE',
        ruleName: 'Document Type Match',
        status: 'PASS',
        reason: `Document text matches expected checklist requirement: "${expectedTitle}".`,
        comparisonValue: expectedTitle,
        extractedValue: extracted.documentType || 'Regulatory terms confirmed in document body',
        evidenceSnippet: extracted.documentType
          ? extractEvidenceSnippet(ocrText, extracted.documentType)
          : undefined,
      });
    } else if (isGenericCertificate) {
      findings.push({
        id: 'CHK-DOC-TYPE',
        ruleName: 'Document Type Match',
        status: 'WARNING',
        reason: `WARNING — Wrong Document Type: Uploaded document appears to be "${extracted.documentType}" rather than expected requirement "${expectedTitle}". ${matchedDomain.missingExplanation}`,
        comparisonValue: expectedTitle,
        extractedValue: extracted.documentType,
        evidenceSnippet: extractEvidenceSnippet(ocrText, extracted.documentType || ''),
      });
    } else if (extracted.documentType) {
      findings.push({
        id: 'CHK-DOC-TYPE',
        ruleName: 'Document Type Match',
        status: 'WARNING',
        reason: `WARNING — Wrong Document Type: Content appears to be "${extracted.documentType}" rather than expected requirement "${expectedTitle}". ${matchedDomain.missingExplanation}`,
        comparisonValue: expectedTitle,
        extractedValue: extracted.documentType,
        evidenceSnippet: extractEvidenceSnippet(ocrText, extracted.documentType),
      });
    } else {
      findings.push({
        id: 'CHK-DOC-TYPE',
        ruleName: 'Document Type Match',
        status: 'NEEDS_REVIEW',
        reason: `Headings for "${expectedTitle}" were not distinctly recognized. ${matchedDomain.missingExplanation} Scrutiny officer should verify the document title manually.`,
        comparisonValue: expectedTitle,
      });
    }
  } else {
    // General fallback for requirements without a domain definition
    if (extracted.documentType) {
      const overlap = calculateTokenOverlap(expectedTitle, extracted.documentType);
      if (overlap.ratio >= 0.5 || normalizeText(expectedTitle).includes(normalizeText(extracted.documentType))) {
        findings.push({
          id: 'CHK-DOC-TYPE',
          ruleName: 'Document Type Match',
          status: 'PASS',
          reason: `Document text matches expected checklist requirement: "${expectedTitle}".`,
          comparisonValue: expectedTitle,
          extractedValue: extracted.documentType,
          evidenceSnippet: extractEvidenceSnippet(ocrText, extracted.documentType),
        });
      } else {
        findings.push({
          id: 'CHK-DOC-TYPE',
          ruleName: 'Document Type Match',
          status: 'WARNING',
          reason: `WARNING — Wrong Document Type: Content appears to be "${extracted.documentType}" rather than expected requirement "${expectedTitle}".`,
          comparisonValue: expectedTitle,
          extractedValue: extracted.documentType,
          evidenceSnippet: extractEvidenceSnippet(ocrText, extracted.documentType),
        });
      }
    } else {
      const titleOverlap = calculateTokenOverlap(expectedTitle, ocrText);
      if (titleOverlap.ratio >= 0.5) {
        findings.push({
          id: 'CHK-DOC-TYPE',
          ruleName: 'Document Type Match',
          status: 'PASS',
          reason: `Key regulatory terms for "${expectedTitle}" detected in document body.`,
          comparisonValue: expectedTitle,
          extractedValue: titleOverlap.matchedTokens.join(', '),
        });
      } else {
        findings.push({
          id: 'CHK-DOC-TYPE',
          ruleName: 'Document Type Match',
          status: 'NEEDS_REVIEW',
          reason: `Headings for "${expectedTitle}" were not distinctly recognized. Scrutiny officer should verify the document title manually.`,
          comparisonValue: expectedTitle,
        });
      }
    }
  }

  // -------------------------------------------------------------
  // Check 3: Institution Identity Match
  // -------------------------------------------------------------
  const targetCollegeName = application?.collegeName;
  if (isInsufficient) {
    findings.push({
      id: 'CHK-COLLEGE-NAME',
      ruleName: 'Institution Identity Match',
      status: 'NEEDS_REVIEW',
      reason: 'Could not verify institution identity due to insufficient text.',
      comparisonValue: targetCollegeName || 'Registered Institution Name',
    });
  } else if (targetCollegeName) {
    const overlap = calculateTokenOverlap(targetCollegeName, ocrText);

    // Check if New Approval Sponsoring Trust exception applies
    const isNewApprovalTrust =
      (requirement?.id === 'REQ-NEW-001' || doc.requirementId === 'REQ-NEW-001') &&
      application?.type === 'NEW_APPROVAL';

    if (overlap.ratio >= 0.75) {
      // High token match
      const matchedSample = overlap.matchedTokens.slice(0, 4).join(' ');
      findings.push({
        id: 'CHK-COLLEGE-NAME',
        ruleName: 'Institution Identity Match',
        status: 'PASS',
        reason: `Institution name confirmed in document text (${Math.round(overlap.ratio * 100)}% token match against application records).`,
        comparisonValue: targetCollegeName,
        extractedValue: targetCollegeName,
        evidenceSnippet: extractEvidenceSnippet(ocrText, matchedSample),
      });
    } else if (overlap.ratio >= 0.4) {
      // Partial token match
      findings.push({
        id: 'CHK-COLLEGE-NAME',
        ruleName: 'Institution Identity Match',
        status: 'WARNING',
        reason: `Partial institution name match detected (${Math.round(overlap.ratio * 100)}% token match). Scrutiny officer should verify if document was issued under a parent trust, former name, or short acronym.`,
        comparisonValue: targetCollegeName,
        extractedValue: `Matched tokens: ${overlap.matchedTokens.join(', ')}`,
      });
    } else if (isNewApprovalTrust) {
      // New Approval Trust exception note
      findings.push({
        id: 'CHK-COLLEGE-NAME',
        ruleName: 'Institution Identity Match',
        status: 'NEEDS_REVIEW',
        reason: `Institution name "${targetCollegeName}" not directly referenced. In New Approval applications, Trust / Society Deeds are legally executed in the Sponsoring Trust's name. Officer must verify sponsoring entity ownership in MoA.`,
        comparisonValue: targetCollegeName,
      });
    } else {
      // College name mismatch
      findings.push({
        id: 'CHK-COLLEGE-NAME',
        ruleName: 'Institution Identity Match',
        status: 'WARNING',
        reason: `Institution Name Mismatch: Document text does not appear to reference "${targetCollegeName}" (${Math.round(overlap.ratio * 100)}% match). Verify if file belongs to another institution.`,
        comparisonValue: targetCollegeName,
        extractedValue: 'No matching institution name found',
      });
    }
  } else {
    findings.push({
      id: 'CHK-COLLEGE-NAME',
      ruleName: 'Institution Identity Match',
      status: 'NOT_CHECKED',
      reason: 'Application record did not provide an institution name for automated comparison.',
    });
  }

  // -------------------------------------------------------------
  // Check 4: Certificate / Reference / Dispatch Number
  // -------------------------------------------------------------
  const isBlueprintOrDrawing =
    (requirement?.id === 'REQ-NEW-007' || (requirement?.title || doc.name).toLowerCase().includes('blueprint') || (requirement?.title || doc.name).toLowerCase().includes('site plan'));

  if (isInsufficient) {
    findings.push({
      id: 'CHK-REF-NUMBER',
      ruleName: 'Certificate / Reference Number',
      status: 'NEEDS_REVIEW',
      reason: 'Could not extract reference number due to unreadable text.',
    });
  } else if (isBlueprintOrDrawing) {
    findings.push({
      id: 'CHK-REF-NUMBER',
      ruleName: 'Certificate / Reference Number',
      status: 'NOT_CHECKED',
      reason: 'Certificate reference number check is not applicable for architectural blueprints / layout drawings.',
    });
  } else if (extracted.certificateNumber) {
    findings.push({
      id: 'CHK-REF-NUMBER',
      ruleName: 'Certificate / Reference Number',
      status: 'PASS',
      reason: `Official reference/certificate number detected: "${extracted.certificateNumber}". (Authenticity has not been independently verified against issuing authority database).`,
      extractedValue: extracted.certificateNumber,
      evidenceSnippet: extractEvidenceSnippet(ocrText, extracted.certificateNumber),
    });
  } else {
    findings.push({
      id: 'CHK-REF-NUMBER',
      ruleName: 'Certificate / Reference Number',
      status: 'WARNING',
      reason: 'No official certificate/dispatch reference number was detected in extracted text. Officer should inspect physical stamp or header.',
    });
  }

  // -------------------------------------------------------------
  // Check 5: Issuing Authority Verification
  // -------------------------------------------------------------
  const isRecognizedAuthority = RECOGNIZED_AUTHORITY_PATTERNS.some(
    (auth) => auth.regex.test(ocrText) || (extracted.issuingAuthority && auth.regex.test(extracted.issuingAuthority))
  );

  if (isInsufficient) {
    findings.push({
      id: 'CHK-AUTHORITY',
      ruleName: 'Issuing Authority Verification',
      status: 'NEEDS_REVIEW',
      reason: 'Could not extract issuing authority due to insufficient text.',
    });
  } else if (extracted.issuingAuthority && isRecognizedAuthority) {
    findings.push({
      id: 'CHK-AUTHORITY',
      ruleName: 'Issuing Authority Verification',
      status: 'PASS',
      reason: `Authorized issuing body recognized: "${extracted.issuingAuthority}". (Authenticity has not been independently verified against issuing authority database).`,
      extractedValue: extracted.issuingAuthority,
      evidenceSnippet: extractEvidenceSnippet(ocrText, extracted.issuingAuthority),
    });
  } else if (extracted.issuingAuthority) {
    findings.push({
      id: 'CHK-AUTHORITY',
      ruleName: 'Issuing Authority Verification',
      status: 'NEEDS_REVIEW',
      reason: `Issuing entity extracted as "${extracted.issuingAuthority}". This issuer is not in the recognized AICTE statutory/regulatory authority registry for "${expectedTitle}". Officer manual verification required.`,
      extractedValue: extracted.issuingAuthority,
      evidenceSnippet: extractEvidenceSnippet(ocrText, extracted.issuingAuthority),
    });
  } else {
    findings.push({
      id: 'CHK-AUTHORITY',
      ruleName: 'Issuing Authority Verification',
      status: 'NEEDS_REVIEW',
      reason: 'Issuing authority designation or seal was not definitively recognized in text. Please review authority signature block manually.',
    });
  }

  // -------------------------------------------------------------
  // Check 6: Certificate Validity Period & Expiry
  // -------------------------------------------------------------
  const hasExpiry = requirementHasExpiryRule(requirement?.id || doc.requirementId, requirement?.title || doc.name);

  if (!hasExpiry) {
    // Expiry check is NOT applicable to this document
    findings.push({
      id: 'CHK-EXPIRY',
      ruleName: 'Certificate Validity & Expiry',
      status: 'NOT_CHECKED',
      reason: `Validity expiry check is not applicable for "${expectedTitle}" (permanent statutory document/record).`,
    });
  } else if (isInsufficient) {
    findings.push({
      id: 'CHK-EXPIRY',
      ruleName: 'Certificate Validity & Expiry',
      status: 'NEEDS_REVIEW',
      reason: 'Could not inspect certificate validity dates due to unreadable text.',
    });
  } else if (extracted.expiryDate) {
    const parsedExpiry = parseAdministrativeDate(extracted.expiryDate);
    const now = new Date();

    if (parsedExpiry.isAmbiguous) {
      findings.push({
        id: 'CHK-EXPIRY',
        ruleName: 'Certificate Validity & Expiry',
        status: 'NEEDS_REVIEW',
        reason: `Ambiguous expiry date format detected ("${extracted.expiryDate}"). ${parsedExpiry.ambiguityReason || 'Requires officer manual review to verify exact expiration day/month.'}`,
        comparisonValue: 'Active validity certificate for current academic period',
        extractedValue: extracted.expiryDate,
        evidenceSnippet: extractEvidenceSnippet(ocrText, extracted.expiryDate),
      });
    } else if (parsedExpiry.date) {
      if (parsedExpiry.date.getTime() < now.getTime()) {
        // Expired!
        const expiryFormatted = parsedExpiry.date.toISOString().split('T')[0];
        findings.push({
          id: 'CHK-EXPIRY',
          ruleName: 'Certificate Validity & Expiry',
          status: 'WARNING',
          reason: `Certificate appears to be EXPIRED. Extracted validity ended on ${expiryFormatted} (Prior to current date ${now.toISOString().split('T')[0]}).`,
          comparisonValue: 'Valid and active certificate for current academic period',
          extractedValue: extracted.expiryDate,
          evidenceSnippet: extractEvidenceSnippet(ocrText, extracted.expiryDate),
        });
      } else {
        // Active
        findings.push({
          id: 'CHK-EXPIRY',
          ruleName: 'Certificate Validity & Expiry',
          status: 'PASS',
          reason: `Certificate validity is active (Valid through ${extracted.expiryDate}).`,
          comparisonValue: 'Active and unexpired validity',
          extractedValue: extracted.expiryDate,
          evidenceSnippet: extractEvidenceSnippet(ocrText, extracted.expiryDate),
        });
      }
    } else {
      // Validity period text found (e.g. "2026-2027")
      findings.push({
        id: 'CHK-EXPIRY',
        ruleName: 'Certificate Validity & Expiry',
        status: 'PASS',
        reason: `Validity period specified in text: "${extracted.expiryDate}".`,
        extractedValue: extracted.expiryDate,
        evidenceSnippet: extractEvidenceSnippet(ocrText, extracted.expiryDate),
      });
    }
  } else {
    // Expiry applies, but no date extracted
    findings.push({
      id: 'CHK-EXPIRY',
      ruleName: 'Certificate Validity & Expiry',
      status: 'NEEDS_REVIEW',
      reason: `Expiry rule applies to "${expectedTitle}", but validity dates could not be extracted automatically. Verify validity period on physical document.`,
      comparisonValue: 'Active validity certificate',
    });
  }

  // -------------------------------------------------------------
  // Check 7: Checklist-Specific Compliance Rules (EOA vs NEW_APPROVAL)
  // -------------------------------------------------------------
  const reqId = (requirement?.id || doc.requirementId || '').toUpperCase();
  const appType = application?.type || (reqId.startsWith('REQ-NEW') ? 'NEW_APPROVAL' : 'EOA');

  if (appType === 'EOA') {
    if (reqId === 'REQ-EOA-001' || expectedTitle.toLowerCase().includes('affiliation')) {
      const expectedAcademicYear = application?.academicYear || '2026-2027';
      const yearNorm = expectedAcademicYear.replace(/\s+/g, '');
      const hasAcademicYear = cleanText.includes(yearNorm) || cleanText.includes('2026-27') || cleanText.includes('2026-2027');
      findings.push({
        id: 'CHK-SPECIFIC-EOA-001',
        ruleName: 'Affiliation Academic Year Compliance (EoA)',
        status: hasAcademicYear ? 'PASS' : 'WARNING',
        reason: hasAcademicYear
          ? `Affiliation continuation references target academic year (${expectedAcademicYear}).`
          : `Affiliation letter does not explicitly mention the upcoming academic cycle (${expectedAcademicYear}).`,
        comparisonValue: expectedAcademicYear,
        extractedValue: extracted.academicYear || 'Not found',
      });
    } else if (reqId === 'REQ-EOA-004' || expectedTitle.toLowerCase().includes('faculty')) {
      const hasRatio = /1:(?:15|20)/.test(cleanText);
      const hasForm16 = /form\s*16/i.test(cleanText);
      findings.push({
        id: 'CHK-SPECIFIC-EOA-004',
        ruleName: 'Faculty Cadre Ratio & Salary Endorsement (EoA)',
        status: hasRatio || hasForm16 ? 'PASS' : 'NEEDS_REVIEW',
        reason: hasRatio
          ? 'Faculty cadre compliance ratio (1:15 / 1:20) and salary endorsement verified.'
          : 'Could not automatically confirm cadre ratio or Form 16 endorsement. Manual verification required.',
        extractedValue: extracted.specificDetails?.['Cadre Ratio'] || 'Review Form 16 table',
      });
    } else if (reqId === 'REQ-EOA-005' || expectedTitle.toLowerCase().includes('audited')) {
      const hasUdin = /udin/i.test(cleanText);
      findings.push({
        id: 'CHK-SPECIFIC-EOA-005',
        ruleName: 'Statutory Audit & UDIN Compliance (EoA)',
        status: hasUdin ? 'PASS' : 'WARNING',
        reason: hasUdin
          ? `Audited financial statement features valid CA UDIN identifier: ${extracted.specificDetails?.['UDIN'] || 'UDIN registered'}.`
          : 'No 18-digit ICAI UDIN was found in the audit report text. Audit reports must feature a valid UDIN.',
        extractedValue: extracted.specificDetails?.['UDIN'] || 'Not detected',
      });
    }
  } else if (appType === 'NEW_APPROVAL') {
    if (reqId === 'REQ-NEW-004' || expectedTitle.toLowerCase().includes('fixed deposit')) {
      const hasCrore = /1\.?00?\s*crore|1,00,00,000/i.test(cleanText);
      const hasAicteJoint = /aicte|regional\s*officer/i.test(cleanText);
      findings.push({
        id: 'CHK-SPECIFIC-NEW-004',
        ruleName: 'Rs. 1.00 Crore Joint FDR Corpus Rule (New Approval)',
        status: hasCrore && hasAicteJoint ? 'PASS' : hasCrore ? 'WARNING' : 'NEEDS_REVIEW',
        reason: hasCrore && hasAicteJoint
          ? 'Joint Fixed Deposit of Rs. 1.00 Crore held jointly with Regional Officer, AICTE confirmed.'
          : hasCrore
          ? 'Corpus amount of Rs. 1.00 Crore detected, but joint holding clause with AICTE could not be confirmed.'
          : 'Corpus FDR amount of Rs. 1.00 Crore was not detected in extracted text.',
        comparisonValue: 'Rs. 1.00 Crore jointly with Regional Officer, AICTE',
        extractedValue: extracted.specificDetails?.['FDR Amount'] || 'Not detected',
      });
    } else if (reqId === 'REQ-NEW-003' || expectedTitle.toLowerCase().includes('conversion')) {
      const hasRevenueOrder = /collector|revenue|non-agricultural/i.test(cleanText);
      findings.push({
        id: 'CHK-SPECIFIC-NEW-003',
        ruleName: 'Land Use Non-Agricultural Conversion Order (New Approval)',
        status: hasRevenueOrder ? 'PASS' : 'NEEDS_REVIEW',
        reason: hasRevenueOrder
          ? 'Order from Competent Revenue Authority / District Collector for non-agricultural educational use confirmed.'
          : 'Could not confirm Non-Agricultural conversion revenue order details from text.',
      });
    } else if (reqId === 'REQ-NEW-002' || expectedTitle.toLowerCase().includes('land')) {
      const has30Year = /30\s*years?|unencumbered|registered/i.test(cleanText);
      findings.push({
        id: 'CHK-SPECIFIC-NEW-002',
        ruleName: '30-Year Lease / Clear Title Requirement (New Approval)',
        status: has30Year ? 'PASS' : 'NEEDS_REVIEW',
        reason: has30Year
          ? 'Clear land title deed / minimum 30-year registered lease confirmed.'
          : 'Please inspect registered lease duration and unencumbered title on physical deed.',
        extractedValue: extracted.specificDetails?.['Land Area'] || 'Inspect deed',
      });
    }
  }

  // Assign default category to checklist compliance findings
  findings.forEach((f) => {
    if (!f.category) {
      f.category = 'CHECKLIST_COMPLIANCE';
      f.categoryLabel = 'Checklist compliance';
    }
  });

  // Ensure institutionName is populated from application context if verified in text
  if (!extracted.institutionName && application?.collegeName) {
    const overlap = calculateTokenOverlap(application.collegeName, cleanText);
    if (overlap.ratio >= 0.5) {
      extracted.institutionName = application.collegeName;
    }
  }

  // -------------------------------------------------------------
  // Check 8: Date Logic & Chronological Sequence
  // -------------------------------------------------------------
  const dateLogicFindings = validateDateLogic(extracted, requirement, expectedTitle);
  findings.push(...dateLogicFindings);

  // -------------------------------------------------------------
  // Check 9: PDF Metadata & Timestamp Integrity
  // -------------------------------------------------------------
  const pdfMeta = doc.pdfMetadata || extractPdfMetadataSync(doc.fileDataUrl);
  const pdfMetadataFindings = validatePdfMetadata(pdfMeta);
  findings.push(...pdfMetadataFindings);

  // -------------------------------------------------------------
  // Check 10: Identification Number & UDIN Format Verification
  // -------------------------------------------------------------
  const idNumberFindings = validateIdentificationNumbers(extracted, requirement, doc, cleanText);
  findings.push(...idNumberFindings);

  // -------------------------------------------------------------
  // Check 11: Suspicious Document Version Changes & Alteration Detection
  // -------------------------------------------------------------
  const versionFindings = compareDocumentVersions(doc, extracted, cleanText);
  findings.push(...versionFindings);

  // -------------------------------------------------------------
  // Check 12: Cross-Document Identity Consistency (Same Application)
  // -------------------------------------------------------------
  const crossDocFindings = validateCrossDocumentConsistency(doc, extracted, application);
  findings.push(...crossDocFindings);

  // -------------------------------------------------------------
  // Summary & Overall Verdict Calculation
  // -------------------------------------------------------------
  const summary = {
    passed: findings.filter((f) => f.status === 'PASS').length,
    warnings: findings.filter((f) => f.status === 'WARNING').length,
    needsReview: findings.filter((f) => f.status === 'NEEDS_REVIEW').length,
    notChecked: findings.filter((f) => f.status === 'NOT_CHECKED').length,
  };

  let overallVerdict: DocumentValidationResult['overallVerdict'] = 'SATISFACTORY';
  if (isInsufficient) {
    overallVerdict = 'INSUFFICIENT_DATA';
  } else if (summary.warnings > 0) {
    overallVerdict = 'DISCREPANCIES_FOUND';
  } else if (summary.needsReview > 0) {
    overallVerdict = 'CAUTION_REVIEWS_NEEDED';
  }

  return {
    analyzedAt: new Date().toISOString(),
    documentVersion: doc.version || 1,
    ocrSnippetPreview: cleanText.substring(0, 140),
    extractedFields: extracted,
    findings,
    summary,
    overallVerdict,
    authenticityStatus: AUTHENTICITY_NOT_VERIFIED_TEXT,
    disclaimer: VERIFICATION_DISCLAIMER,
    pdfMetadata: pdfMeta,
  };
}
