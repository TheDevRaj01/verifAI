/**
 * Generates valid standard PDF 1.4 Data URLs for institutional compliance documents.
 * Ensures that all documents in the dossier (including pre-seeded demo files) have
 * valid, parseable binary payloads ready for in-browser PDF extraction and OCR analysis.
 */

interface DocumentContentDefinition {
  title: string;
  subtitle: string;
  refNo: string;
  issueDate: string;
  expiryDate?: string;
  authority: string;
  extraLines: string[];
}

export function getSampleDocumentContent(
  reqId: string,
  docName: string,
  collegeName: string,
  academicYear: string = '2026-2027'
): DocumentContentDefinition {
  const normId = (reqId || '').toUpperCase();
  const normName = (docName || '').toLowerCase();

  if (normId === 'REQ-EOA-002' || normName.includes('fire safety') || normName.includes('fire noc')) {
    return {
      title: 'GOVERNMENT OF NCT OF DELHI — DELHI FIRE SERVICE',
      subtitle: 'NO OBJECTION CERTIFICATE (FIRE & LIFE SAFETY)',
      refNo: 'DFS/HQ/2026/NOC-4921',
      issueDate: '20/08/2026',
      expiryDate: '19/08/2029',
      authority: 'Delhi Fire Service',
      extraLines: [
        `Issued to: ${collegeName}`,
        'Premises: Main Academic Campus, Sector 12, Dwarka, New Delhi 110078',
        'Certified compliant with Rule 33 of Delhi Fire Service Rules 2010 and National Building Code Part IV.',
        'Fire hydrants, automatic smoke detectors, pressurized stairwells, and wet risers operational.',
      ],
    };
  }

  if (normId === 'REQ-EOA-001' || normName.includes('affiliation')) {
    return {
      title: 'AFFILIATING TECHNICAL UNIVERSITY OF THE STATE',
      subtitle: `GRANT OF CONTINUATION OF AFFILIATION (${academicYear})`,
      refNo: 'UNIV/AFFIL/2026/8942',
      issueDate: '15/07/2026',
      expiryDate: '30/06/2027',
      authority: 'Affiliating Technical University',
      extraLines: [
        `Issued to: ${collegeName}`,
        `Academic Cycle: Continuation of affiliation granted for the Academic Year ${academicYear}.`,
        'Approved Programs: B.Tech Computer Science, Artificial Intelligence, Electronics & Mechanical.',
        'Sanctioned under Section 28 of the Technical Universities Act.',
      ],
    };
  }

  if (normId === 'REQ-EOA-006' || normName.includes('occupancy') || normName.includes('completion')) {
    return {
      title: 'MUNICIPAL PLANNING & DEVELOPMENT AUTHORITY',
      subtitle: 'BUILDING OCCUPANCY AND COMPLETION CERTIFICATE',
      refNo: 'MCD/BOC/2026/9021',
      issueDate: '14/09/2026',
      authority: 'Municipal Planning Authority',
      extraLines: [
        `Issued to: ${collegeName}`,
        'Site Address: Plot No. 42, Institutional Area, Knowledge Corridor',
        'Total Built-Up Area: 14,500 sq. meters across 4-story instructional blocks.',
        'Certified that construction satisfies approved architectural blueprints and structural stability norms.',
      ],
    };
  }

  if (normId === 'REQ-EOA-004' || normName.includes('faculty') || normName.includes('cadre')) {
    return {
      title: 'STATE DIRECTORATE OF TECHNICAL EDUCATION',
      subtitle: 'FACULTY CADRE RATIO & FORM 16 SUMMARY ENDORSEMENT',
      refNo: 'FCR/2026/ENG-104',
      issueDate: '14/09/2026',
      authority: 'State Directorate of Technical Education (DTE)',
      extraLines: [
        `Institution: ${collegeName}`,
        'Faculty Cadre Ratio: Confirmed 1:15 compliance for approved intake of students.',
        'Form 16 Endorsement: Verified 84 full-time teaching faculty with statutory tax deductions on record.',
        'Cadre Distribution: 6 Professors, 18 Associate Professors, and 60 Assistant Professors.',
      ],
    };
  }

  if (normId === 'REQ-EOA-005' || normName.includes('audit') || normName.includes('financial')) {
    return {
      title: 'CHARTERED ACCOUNTANTS & STATUTORY AUDITORS',
      subtitle: 'INDEPENDENT AUDITOR\'S REPORT & AUDITED FINANCIAL STATEMENT',
      refNo: 'AUDIT/2026/CA-8891',
      issueDate: '10/08/2026',
      authority: 'Chartered Accountant (ICAI)',
      extraLines: [
        `Audited Entity: ${collegeName}`,
        'UDIN: 26084921AAAAAA8921',
        'Audited Balance Sheet and Income & Expenditure Account examined for the preceding financial year.',
        'Books of accounts represent true and fair view in accordance with accounting standards in India.',
      ],
    };
  }

  if (normId === 'REQ-NEW-004' || normName.includes('fixed deposit') || normName.includes('fdr') || normName.includes('corpus')) {
    return {
      title: 'STATE BANK OF INDIA — MAIN INSTITUTIONAL BRANCH',
      subtitle: 'JOINT FIXED DEPOSIT RECEIPT (AICTE CORPUS FUND)',
      refNo: 'FDR/SBI/2026/778901',
      issueDate: '12/08/2026',
      expiryDate: '11/08/2036',
      authority: 'Nationalized Bank',
      extraLines: [
        `Depositor: Sponsoring Trust for ${collegeName}`,
        'FDR Amount: Rs. 1.00 Crore (Rupees One Crore Only / Rs. 1,00,00,000/-)',
        'Joint Holding: Pledged jointly with Regional Officer, AICTE for a tenure of 10 years.',
        'No lien or premature encashment permitted without prior written consent from AICTE.',
      ],
    };
  }

  if (normId === 'REQ-NEW-001' || normName.includes('trust') || normName.includes('society')) {
    return {
      title: 'OFFICE OF THE SUB-REGISTRAR / CHARITY COMMISSIONER',
      subtitle: 'REGISTERED TRUST DEED & MEMORANDUM OF ASSOCIATION',
      refNo: 'REG/SOC/2022/4512',
      issueDate: '15/03/2022',
      authority: 'Sub-Registrar (Land Registry)',
      extraLines: [
        `Sponsoring Entity: Educational Trust for ${collegeName}`,
        'Registered under Societies Registration Act XXI of 1860.',
        'Objects of the Trust: Promotion of technical and professional higher education without commercial motive.',
        'Trustees verified with official seal and permanent registration entry.',
      ],
    };
  }

  if (normId === 'REQ-NEW-002' || normName.includes('land title') || normName.includes('lease deed')) {
    return {
      title: 'REVENUE DEPARTMENT / SUB-REGISTRAR OF ASSURANCES',
      subtitle: 'REGISTERED 30-YEAR LAND LEASE DEED & REVENUE RECORD',
      refNo: 'DEED/REV/2024/9912',
      issueDate: '10/05/2024',
      authority: 'District Collectorate / Revenue Authority',
      extraLines: [
        `Lessee Institution: ${collegeName}`,
        'Land Area: 10.5 Acres unencumbered contiguous educational institutional land.',
        'Lease Term: Registered minimum 30-year unencumbered lease running through May 2054.',
        'Revenue Record: Khasra No. 142/1, 142/2 entered in official land registration register.',
      ],
    };
  }

  if (normId === 'REQ-NEW-003' || normName.includes('conversion') || normName.includes('non-agricultural')) {
    return {
      title: 'OFFICE OF THE DISTRICT COLLECTOR & MAGISTRATE',
      subtitle: 'NON-AGRICULTURAL (NA) LAND CONVERSION ORDER',
      refNo: 'COLL/REV/NA/2024/3120',
      issueDate: '20/06/2024',
      authority: 'District Collectorate / Revenue Authority',
      extraLines: [
        `Applicant: Sponsoring Society of ${collegeName}`,
        'Order: Sanction granted under Section 44 of Land Revenue Code for educational non-agricultural use.',
        'Total Converted Area: 10.5 Acres in revenue block verified unencumbered.',
        'Compliance with environmental zoning and master plan setbacks confirmed.',
      ],
    };
  }

  if (normId === 'REQ-NEW-005' || normName.includes('state') || normName.includes('in-principle')) {
    return {
      title: 'STATE GOVERNMENT — HIGHER & TECHNICAL EDUCATION DEPARTMENT',
      subtitle: 'STATE GOVERNMENT IN-PRINCIPLE NO OBJECTION CERTIFICATE',
      refNo: 'DTE/NOC/2026/4102',
      issueDate: '15/07/2026',
      authority: 'State Directorate of Technical Education (DTE)',
      extraLines: [
        `Applicant: ${collegeName}`,
        'State Government in-principle No Objection Certificate for starting new technical institution.',
        'Verified in public interest with regional technical workforce requirement demand assessment.',
      ],
    };
  }

  if (normId === 'REQ-NEW-006' || normName.includes('consent to affiliate')) {
    return {
      title: 'AFFILIATING TECHNICAL UNIVERSITY',
      subtitle: 'CONSENT TO AFFILIATE & LETTER OF INTENT',
      refNo: 'UNIV/CTA/2026/6712',
      issueDate: '01/08/2026',
      authority: 'Affiliating Technical University',
      extraLines: [
        `Applicant Institution: ${collegeName}`,
        'Consent to Affiliate granted for starting undergraduate technical degree courses.',
        'Inspection committee report confirmed compliance with university affiliation statutes.',
      ],
    };
  }

  if (normId === 'REQ-NEW-007' || normName.includes('site plan') || normName.includes('blueprint')) {
    return {
      title: 'MUNICIPAL TOWN & COUNTRY PLANNING AUTHORITY',
      subtitle: 'MASTER SITE PLAN & SANCTIONED ARCHITECTURAL BLUEPRINTS',
      refNo: 'MTP/BP/2025/1198',
      issueDate: '10/11/2025',
      authority: 'Municipal Planning Authority',
      extraLines: [
        `Educational Institution: ${collegeName}`,
        'Sanctioned architectural building layout drawings and campus master site development plan.',
        'Classrooms, engineering laboratories, administrative chambers, and circulation spaces verified.',
      ],
    };
  }

  if (normId === 'REQ-NEW-008' || normId === 'REQ-EOA-007' || normName.includes('barrier-free') || normName.includes('pwd')) {
    return {
      title: 'PUBLIC WORKS DEPARTMENT / ACCREDITED ACCESSIBILITY AUDIT',
      subtitle: 'BARRIER-FREE BUILT ENVIRONMENT & PWD AUDIT CERTIFICATE',
      refNo: 'PWD/A11Y/2026/3041',
      issueDate: '05/09/2026',
      authority: 'Chartered Structural Engineer',
      extraLines: [
        `Institution: ${collegeName}`,
        'Accessibility Audit: Certified 100% barrier-free environment for persons with disabilities (PwD).',
        'Standard non-slip access ramps, designated functional elevators, tactile paving, and disabled-friendly toilets confirmed.',
      ],
    };
  }

  if (normName.includes('structural') || normName.includes('stability')) {
    return {
      title: 'EMPANELED CHARTERED STRUCTURAL ENGINEER & PWD',
      subtitle: 'STRUCTURAL STABILITY & SOUNDNESS CERTIFICATE',
      refNo: 'SEC/STRUCT/2026/5120',
      issueDate: '18/08/2026',
      authority: 'Chartered Structural Engineer',
      extraLines: [
        `Institution: ${collegeName}`,
        'Visual and load calculation inspection confirms multistory reinforced concrete frames satisfy IS 456 & IS 1893 seismic codes.',
        'Structure is sound and fit for regular higher educational instructional use.',
      ],
    };
  }

  // Generic fallback certificate
  return {
    title: 'OFFICIAL REGULATORY & STATUTORY COMPLIANCE DOSSIER',
    subtitle: (docName || 'COMPLIANCE CERTIFICATE').toUpperCase(),
    refNo: `REG/AIC/${Date.now().toString().slice(-6)}`,
    issueDate: '15/08/2026',
    authority: 'State Directorate of Technical Education (DTE)',
    extraLines: [
      `Issued to: ${collegeName}`,
      `Checklist Requirement Reference: ${reqId || 'STATUTORY_RECORD'}`,
      'Submitted for official scrutiny and validation under AICTE Approval Process Handbook norms.',
      'Verified in accordance with statutory rules and institutional declarations.',
    ],
  };
}

/**
 * Builds a standard, clean PDF 1.4 document stream and returns a base64 Data URL.
 */
export function createSamplePdfDataUrl(
  title: string,
  lines: string[],
  metadata?: {
    certNumber?: string;
    authority?: string;
    issueDate?: string;
    expiryDate?: string;
  }
): string {
  const sanitize = (s: string) => s.replace(/[()\\\/]/g, ' ').replace(/\s+/g, ' ').trim();

  const streamLines: string[] = [
    'BT',
    '/F1 13 Tf',
    '72 730 Td',
    `(${sanitize(title)}) Tj`,
    '/F1 10 Tf',
  ];

  let yOffset = -26;

  if (metadata?.certNumber) {
    streamLines.push(`0 ${yOffset} Td`);
    streamLines.push(`(Reference No: ${sanitize(metadata.certNumber)}) Tj`);
    yOffset = -18;
  }

  if (metadata?.issueDate) {
    streamLines.push(`0 ${yOffset} Td`);
    streamLines.push(`(Date of Issue: ${sanitize(metadata.issueDate)}) Tj`);
    yOffset = -18;
  }

  if (metadata?.expiryDate) {
    streamLines.push(`0 ${yOffset} Td`);
    streamLines.push(`(Valid till: ${sanitize(metadata.expiryDate)}) Tj`);
    yOffset = -18;
  }

  if (metadata?.authority) {
    streamLines.push(`0 ${yOffset} Td`);
    streamLines.push(`(Issuing Authority: ${sanitize(metadata.authority)}) Tj`);
    yOffset = -22;
  }

  for (const line of lines) {
    if (!line) continue;
    streamLines.push(`0 ${yOffset} Td`);
    streamLines.push(`(${sanitize(line)}) Tj`);
    yOffset = -18;
  }

  streamLines.push('ET');
  const streamContent = streamLines.join('\n');
  const streamLen = typeof Buffer !== 'undefined'
    ? Buffer.byteLength(streamContent)
    : new TextEncoder().encode(streamContent).length;

  const creationDate = 'D:20260820100000Z';
  const modDate = 'D:20260820120000Z';

  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length ${streamLen} >> stream
${streamContent}
endstream
endobj
6 0 obj << /Title (${sanitize(title)}) /CreationDate (${creationDate}) /ModDate (${modDate}) /Producer (VerifAI Regulatory PDF Engine) >> endobj
xref
0 7
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000236 00000 n 
0000000305 00000 n 
0000000450 00000 n 
trailer << /Size 7 /Root 1 0 R /Info 6 0 R >>
startxref
${560 + streamLen}
%%EOF`;

  let base64: string;
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(pdf, 'utf-8').toString('base64');
  } else if (typeof btoa === 'function') {
    const bytes = new TextEncoder().encode(pdf);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  } else {
    throw new Error('Base64 encoding not supported');
  }

  return `data:application/pdf;base64,${base64}`;
}

/**
 * Returns a valid PDF Data URL for any given compliance document in an application dossier.
 */
export function getSampleDocumentPdfDataUrl(
  reqId: string,
  docName: string,
  collegeName: string = 'Authorized Technical Institution',
  academicYear: string = '2026-2027'
): string {
  const content = getSampleDocumentContent(reqId, docName, collegeName, academicYear);
  return createSamplePdfDataUrl(
    content.title,
    [content.subtitle, ...content.extraLines],
    {
      certNumber: content.refNo,
      authority: content.authority,
      issueDate: content.issueDate,
      expiryDate: content.expiryDate,
    }
  );
}
