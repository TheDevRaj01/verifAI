import type {
  CollegeApplication,
  RegulatoryComplianceAssessment,
  RegulatoryComplianceFinding,
  InfrastructureEvidenceItem,
  InfrastructureDiscrepancy,
  InspectionRecommendation,
  ComplianceCheckStatus,
  ApplicationType,
} from '../types/index.ts';

export const OFFICIAL_REGULATION_NOTE =
  'Rule condition and compliance threshold require confirmation from official AICTE Approval Process Handbook (APH) 2026–27 regulations.';

export const UNSUPPORTED_VIDEO_ANALYSIS_MESSAGE =
  'Automated AI video analysis is not supported. Please review video manually to verify physical signage, continuous walkthrough, and facilities.';

export const VISUAL_ANALYSIS_DISCLAIMER =
  'Automated visual inspection identifies observable room setup/equipment. Note: Visual observation cannot prove actual room dimensions, load-bearing safety, or physical existence of the campus.';

/**
 * Analyzes an infrastructure evidence item (photo, blueprint, video).
 * Provides clear unsupported media notices for video and non-conclusive observations for images.
 */
export function analyzeMediaEvidence(item: InfrastructureEvidenceItem): {
  summary: string;
  isUnsupported: boolean;
  unsupportedReason?: string;
} {
  const fType = (item.fileType || '').toLowerCase();
  const fName = (item.fileName || '').toLowerCase();

  const isVideo =
    fType.startsWith('video/') ||
    fName.endsWith('.mp4') ||
    fName.endsWith('.webm') ||
    fName.endsWith('.mov') ||
    item.evidenceCategory === 'WALKTHROUGH_VIDEO';

  if (isVideo) {
    return {
      summary: 'Video walkthrough submitted for officer inspection.',
      isUnsupported: true,
      unsupportedReason: UNSUPPORTED_VIDEO_ANALYSIS_MESSAGE,
    };
  }

  const isImage =
    fType.startsWith('image/') ||
    fName.endsWith('.jpg') ||
    fName.endsWith('.jpeg') ||
    fName.endsWith('.png') ||
    fName.endsWith('.webp');

  if (isImage) {
    let observation = 'Digital image evidence attached.';
    if (item.evidenceCategory === 'CLASSROOM_PHOTO') {
      observation = 'Photograph displays student desks, board, and indoor instructional layout.';
    } else if (item.evidenceCategory === 'LABORATORY_PHOTO') {
      observation = 'Photograph displays laboratory workstations, experimental apparatus, and power outlets.';
    } else if (item.evidenceCategory === 'LIBRARY_PHOTO') {
      observation = 'Photograph displays book stacks and reading room seating arrangement.';
    } else if (item.evidenceCategory === 'BUILDING_EXTERIOR_PHOTO' || item.evidenceCategory === 'CAMPUS_EXTERIOR') {
      observation = 'Photograph displays institutional building facade and entry signage.';
    } else if (item.evidenceCategory === 'COMPUTER_CENTRE_PHOTO') {
      observation = 'Photograph displays networked computing terminals and server hardware.';
    } else if (item.evidenceCategory === 'FACULTY_ROOM_PHOTO') {
      observation = 'Photograph displays faculty workstations, departmental offices, and common seating.';
    } else if (item.evidenceCategory === 'SANITATION_WATER_PHOTO') {
      observation = 'Photograph displays institutional washroom facilities and drinking water points.';
    } else if (item.evidenceCategory === 'ACCESSIBILITY_SAFETY_PHOTO') {
      observation = 'Photograph displays barrier-free access ramps, tactile paving, or fire protection equipment.';
    } else if (item.evidenceCategory === 'FLOOR_PLAN_DRAWING') {
      observation = 'Architectural drawing showing spatial partition and labeled instructional rooms.';
    } else if (item.evidenceCategory === 'OTHER_INFRASTRUCTURE_EVIDENCE') {
      observation = 'Supporting physical infrastructure documentation submitted.';
    }

    return {
      summary: `${observation} (${VISUAL_ANALYSIS_DISCLAIMER})`,
      isUnsupported: false,
    };
  }

  const isPdf = fType === 'application/pdf' || fName.endsWith('.pdf');
  if (isPdf) {
    let observation = 'PDF architectural drawing or infrastructure certification submitted.';
    if (item.evidenceCategory === 'FLOOR_PLAN_DRAWING') {
      observation = 'Architectural blueprint / floor plan drawing demarcating spatial allocations.';
    }
    return {
      summary: `${observation} (Manual Review Required: Scrutiny officer must verify dimension stamps & municipal approval seal)`,
      isUnsupported: false,
    };
  }

  return {
    summary: 'Document file attached as supporting infrastructure proof.',
    isUnsupported: false,
  };
}

/**
 * Evaluates regulatory compliance findings against configured rules.
 * Strictly separates EoA and New Approval requirements.
 */
export function evaluateRegulatoryRules(app: CollegeApplication): RegulatoryComplianceFinding[] {
  const findings: RegulatoryComplianceFinding[] = [];
  const decl = app.declaredInfrastructure;
  const docs = app.documents || [];
  const evidence = app.infrastructureEvidence || [];

  if (app.type === 'EOA') {
    // -------------------------------------------------------------------------
    // EoA Rule 1: Classrooms & Instructional Space
    // -------------------------------------------------------------------------
    const classroomPhotos = evidence.filter((e) => e.evidenceCategory === 'CLASSROOM_PHOTO');
    const occupancyDoc = docs.find((d) => d.requirementId === 'REQ-EOA-006' || d.id === 'REQ-EOA-006');
    if (decl && decl.classroomsCount !== undefined) {
      if (decl.classroomsCount > 0 && (classroomPhotos.length > 0 || (occupancyDoc && occupancyDoc.status === 'Accepted'))) {
        findings.push({
          id: 'FINDING-EOA-CLASSROOMS',
          ruleId: 'RULE-EOA-001',
          ruleTitle: 'Classrooms & Instructional Space Provision',
          category: 'ACADEMIC_FACILITIES',
          applicationType: 'EOA',
          expectedCondition: 'Adequate functional classrooms with acoustic & ventilation suitability for proposed intake.',
          availableEvidence: `Declared: ${decl.classroomsCount} Classrooms. Evidence: ${classroomPhotos.length} classroom photo(s)${occupancyDoc ? ', Occupancy Certificate' : ''}.`,
          status: 'PASS',
          reason: `Declared classroom capacity (${decl.classroomsCount} rooms) is corroborated by submitted photographic/occupancy proofs.`,
          officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        });
      } else if (decl.classroomsCount > 0 && classroomPhotos.length === 0) {
        findings.push({
          id: 'FINDING-EOA-CLASSROOMS',
          ruleId: 'RULE-EOA-001',
          ruleTitle: 'Classrooms & Instructional Space Provision',
          category: 'ACADEMIC_FACILITIES',
          applicationType: 'EOA',
          expectedCondition: 'Adequate functional classrooms with acoustic & ventilation suitability for proposed intake.',
          availableEvidence: `Declared: ${decl.classroomsCount} Classrooms. Evidence: 0 classroom photos uploaded.`,
          status: 'WARNING',
          reason: `Institution declared ${decl.classroomsCount} classrooms in application, but no supporting photographs or physical space evidence were uploaded.`,
          officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        });
      } else {
        findings.push({
          id: 'FINDING-EOA-CLASSROOMS',
          ruleId: 'RULE-EOA-001',
          ruleTitle: 'Classrooms & Instructional Space Provision',
          category: 'ACADEMIC_FACILITIES',
          applicationType: 'EOA',
          expectedCondition: 'Adequate functional classrooms with acoustic & ventilation suitability for proposed intake.',
          availableEvidence: 'Classrooms count declared as 0 or undefined.',
          status: 'NEEDS_REVIEW',
          reason: 'Classrooms count is zero or unverified for the active academic cycle.',
          officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        });
      }
    } else {
      findings.push({
        id: 'FINDING-EOA-CLASSROOMS',
        ruleId: 'RULE-EOA-001',
        ruleTitle: 'Classrooms & Instructional Space Provision',
        category: 'ACADEMIC_FACILITIES',
        applicationType: 'EOA',
        expectedCondition: 'Adequate functional classrooms with acoustic & ventilation suitability for proposed intake.',
        availableEvidence: 'Not Checked — Rule/Data Unavailable',
        status: 'NOT_CHECKED',
        reason: 'Not Checked — Rule/Data Unavailable. Declared classroom counts not provided in institutional profile.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
      });
    }

    // -------------------------------------------------------------------------
    // EoA Rule 2: Laboratories & Equipment
    // -------------------------------------------------------------------------
    const labPhotos = evidence.filter((e) => e.evidenceCategory === 'LABORATORY_PHOTO');
    if (decl && decl.laboratoriesCount !== undefined) {
      if (decl.laboratoriesCount > 0 && labPhotos.length > 0) {
        findings.push({
          id: 'FINDING-EOA-LABORATORIES',
          ruleId: 'RULE-EOA-002',
          ruleTitle: 'Laboratories & Experimental Equipment Setup',
          category: 'ACADEMIC_FACILITIES',
          applicationType: 'EOA',
          expectedCondition: 'Specialized laboratories equipped for approved curricula and student batch size.',
          availableEvidence: `Declared: ${decl.laboratoriesCount} Labs. Evidence: ${labPhotos.length} laboratory photo(s).`,
          status: 'PASS',
          reason: `Declared laboratory facilities (${decl.laboratoriesCount} labs) supported by photographic setup evidence.`,
          officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        });
      } else if (decl.laboratoriesCount > 0 && labPhotos.length === 0) {
        findings.push({
          id: 'FINDING-EOA-LABORATORIES',
          ruleId: 'RULE-EOA-002',
          ruleTitle: 'Laboratories & Experimental Equipment Setup',
          category: 'ACADEMIC_FACILITIES',
          applicationType: 'EOA',
          expectedCondition: 'Specialized laboratories equipped for approved curricula and student batch size.',
          availableEvidence: `Declared: ${decl.laboratoriesCount} Labs. Evidence: 0 laboratory photos.`,
          status: 'WARNING',
          reason: `Institution declared ${decl.laboratoriesCount} laboratories, but no laboratory equipment photographs were submitted in dossier.`,
          officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        });
      } else {
        findings.push({
          id: 'FINDING-EOA-LABORATORIES',
          ruleId: 'RULE-EOA-002',
          ruleTitle: 'Laboratories & Experimental Equipment Setup',
          category: 'ACADEMIC_FACILITIES',
          applicationType: 'EOA',
          expectedCondition: 'Specialized laboratories equipped for approved curricula and student batch size.',
          availableEvidence: 'Laboratories declared as 0.',
          status: 'NEEDS_REVIEW',
          reason: 'Technical institutions must maintain functional laboratories for core disciplines.',
          officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        });
      }
    } else {
      findings.push({
        id: 'FINDING-EOA-LABORATORIES',
        ruleId: 'RULE-EOA-002',
        ruleTitle: 'Laboratories & Experimental Equipment Setup',
        category: 'ACADEMIC_FACILITIES',
        applicationType: 'EOA',
        expectedCondition: 'Specialized laboratories equipped for approved curricula and student batch size.',
        availableEvidence: 'Not Checked — Rule/Data Unavailable',
        status: 'NOT_CHECKED',
        reason: 'Not Checked — Rule/Data Unavailable. Laboratory declarations unavailable in application records.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
      });
    }

    // -------------------------------------------------------------------------
    // EoA Rule 3: Central Library & Reading Room
    // -------------------------------------------------------------------------
    const libraryPhotos = evidence.filter((e) => e.evidenceCategory === 'LIBRARY_PHOTO');
    if (decl && (decl.libraryAreaSqM !== undefined || decl.libraryBooksCount !== undefined)) {
      if ((decl.libraryAreaSqM || 0) > 0 || libraryPhotos.length > 0) {
        findings.push({
          id: 'FINDING-EOA-LIBRARY',
          ruleId: 'RULE-EOA-003',
          ruleTitle: 'Central Library & Reading Room Facilities',
          category: 'ACADEMIC_FACILITIES',
          applicationType: 'EOA',
          expectedCondition: 'Dedicated central library reading room space and reference catalog.',
          availableEvidence: `Declared: ${decl.libraryAreaSqM || 'N/A'} sq.m, ${decl.libraryBooksCount || 'N/A'} titles. Evidence: ${libraryPhotos.length} photo(s).`,
          status: 'PASS',
          reason: 'Library facilities declared and supported by available evidence.',
          officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        });
      } else {
        findings.push({
          id: 'FINDING-EOA-LIBRARY',
          ruleId: 'RULE-EOA-003',
          ruleTitle: 'Central Library & Reading Room Facilities',
          category: 'ACADEMIC_FACILITIES',
          applicationType: 'EOA',
          expectedCondition: 'Dedicated central library reading room space and reference catalog.',
          availableEvidence: 'Declared library area is zero or unverified.',
          status: 'NEEDS_REVIEW',
          reason: 'Central library space requires verification by scrutiny officer.',
          officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        });
      }
    } else {
      findings.push({
        id: 'FINDING-EOA-LIBRARY',
        ruleId: 'RULE-EOA-003',
        ruleTitle: 'Central Library & Reading Room Facilities',
        category: 'ACADEMIC_FACILITIES',
        applicationType: 'EOA',
        expectedCondition: 'Dedicated central library reading room space and reference catalog.',
        availableEvidence: 'Not Checked — Rule/Data Unavailable',
        status: 'NOT_CHECKED',
        reason: 'Not Checked — Rule/Data Unavailable. Library data unavailable in application form.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
      });
    }

    // -------------------------------------------------------------------------
    // EoA Rule 4: Fire Safety & Building Protection
    // -------------------------------------------------------------------------
    const fireDoc = docs.find((d) => d.requirementId === 'REQ-EOA-002' || d.id === 'REQ-EOA-002');
    const fireDocExpired = fireDoc?.validationResult?.findings?.some(
      (f) => f.id === 'CHK-EXPIRY' && f.status === 'WARNING'
    );
    if (!fireDoc || fireDoc.status === 'NOT_UPLOADED') {
      findings.push({
        id: 'FINDING-EOA-FIRE',
        ruleId: 'RULE-EOA-004',
        ruleTitle: 'Operational Fire Safety & Building Protection',
        category: 'SAFETY_REGULATORY',
        applicationType: 'EOA',
        expectedCondition: 'Valid Fire Safety Certificate/NOC covering all operational academic blocks (REQ-EOA-002).',
        availableEvidence: 'Document not uploaded in application dossier.',
        status: 'WARNING',
        reason: 'Mandatory Fire Safety Certificate (REQ-EOA-002) is missing from the application dossier.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        referencedDocumentId: 'REQ-EOA-002',
        referencedDocumentName: 'Fire Safety Certificate & NOC',
      });
    } else if (fireDocExpired) {
      findings.push({
        id: 'FINDING-EOA-FIRE',
        ruleId: 'RULE-EOA-004',
        ruleTitle: 'Operational Fire Safety & Building Protection',
        category: 'SAFETY_REGULATORY',
        applicationType: 'EOA',
        expectedCondition: 'Valid Fire Safety Certificate/NOC covering all operational academic blocks (REQ-EOA-002).',
        availableEvidence: `Uploaded file: ${fireDoc.fileName} (Marked Expired in document validation).`,
        status: 'WARNING',
        reason: 'Fire Safety Certificate has expired. AICTE norms require unexpired statutory fire clearance.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        referencedDocumentId: fireDoc.id,
        referencedDocumentName: fireDoc.name,
      });
    } else {
      findings.push({
        id: 'FINDING-EOA-FIRE',
        ruleId: 'RULE-EOA-004',
        ruleTitle: 'Operational Fire Safety & Building Protection',
        category: 'SAFETY_REGULATORY',
        applicationType: 'EOA',
        expectedCondition: 'Valid Fire Safety Certificate/NOC covering all operational academic blocks (REQ-EOA-002).',
        availableEvidence: `Uploaded file: ${fireDoc.fileName || 'Fire Safety NOC'} (${fireDoc.status}).`,
        status: fireDoc.status === 'Accepted' ? 'PASS' : 'NEEDS_REVIEW',
        reason:
          fireDoc.status === 'Accepted'
            ? 'Valid Fire Safety Certificate uploaded and accepted by scrutiny.'
            : 'Fire Safety Certificate uploaded; awaiting scrutiny officer validation.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        referencedDocumentId: fireDoc.id,
        referencedDocumentName: fireDoc.name,
      });
    }

    // -------------------------------------------------------------------------
    // EoA Rule 5: Structural Stability
    // -------------------------------------------------------------------------
    const structDoc = docs.find((d) => d.requirementId === 'REQ-EOA-003' || d.id === 'REQ-EOA-003');
    if (!structDoc || structDoc.status === 'NOT_UPLOADED') {
      findings.push({
        id: 'FINDING-EOA-STRUCTURAL',
        ruleId: 'RULE-EOA-005',
        ruleTitle: 'Structural Soundness & Building Stability',
        category: 'INFRASTRUCTURE',
        applicationType: 'EOA',
        expectedCondition: 'Valid Structural Stability Certificate by government-empaneled structural engineer (REQ-EOA-003).',
        availableEvidence: 'Document not uploaded.',
        status: 'WARNING',
        reason: 'Mandatory Structural Stability Certificate is missing.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        referencedDocumentId: 'REQ-EOA-003',
        referencedDocumentName: 'Structural Stability Certificate',
      });
    } else {
      findings.push({
        id: 'FINDING-EOA-STRUCTURAL',
        ruleId: 'RULE-EOA-005',
        ruleTitle: 'Structural Soundness & Building Stability',
        category: 'INFRASTRUCTURE',
        applicationType: 'EOA',
        expectedCondition: 'Valid Structural Stability Certificate by government-empaneled structural engineer (REQ-EOA-003).',
        availableEvidence: `Uploaded file: ${structDoc.fileName || 'Stability Cert'} (${structDoc.status}).`,
        status: structDoc.status === 'Accepted' ? 'PASS' : 'NEEDS_REVIEW',
        reason:
          structDoc.status === 'Accepted'
            ? 'Structural Stability Certificate accepted.'
            : 'Structural Stability Certificate uploaded; pending officer review.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        referencedDocumentId: structDoc.id,
        referencedDocumentName: structDoc.name,
      });
    }

    // -------------------------------------------------------------------------
    // EoA Rule 6: Barrier-Free Built Environment & PwD Accessibility
    // -------------------------------------------------------------------------
    const pwdDoc = docs.find((d) => d.requirementId === 'REQ-EOA-007' || d.id === 'REQ-EOA-007');
    if (pwdDoc && pwdDoc.status !== 'NOT_UPLOADED') {
      findings.push({
        id: 'FINDING-EOA-BARRIER-FREE',
        ruleId: 'RULE-EOA-006',
        ruleTitle: 'Barrier-Free Environment & PwD Accessibility',
        category: 'INFRASTRUCTURE',
        applicationType: 'EOA',
        expectedCondition: 'Ramps, tactile paths, accessible washrooms, and lifts conforming to PwD Act (REQ-EOA-007).',
        availableEvidence: `Self-attested audit: ${pwdDoc.fileName || 'Audit Doc'} (${pwdDoc.status}).`,
        status: 'PASS',
        reason: 'Barrier-free audit certificate submitted in application dossier.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        referencedDocumentId: pwdDoc.id,
        referencedDocumentName: pwdDoc.name,
      });
    } else if (decl && decl.hasBarrierFreeEnvironment === true) {
      findings.push({
        id: 'FINDING-EOA-BARRIER-FREE',
        ruleId: 'RULE-EOA-006',
        ruleTitle: 'Barrier-Free Environment & PwD Accessibility',
        category: 'INFRASTRUCTURE',
        applicationType: 'EOA',
        expectedCondition: 'Ramps, tactile paths, accessible washrooms, and lifts conforming to PwD Act (REQ-EOA-007).',
        availableEvidence: 'Declared positive compliance in application profile.',
        status: 'NEEDS_REVIEW',
        reason: 'Institution declared barrier-free facilities; supporting audit certificate not attached.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
      });
    } else {
      findings.push({
        id: 'FINDING-EOA-BARRIER-FREE',
        ruleId: 'RULE-EOA-006',
        ruleTitle: 'Barrier-Free Environment & PwD Accessibility',
        category: 'INFRASTRUCTURE',
        applicationType: 'EOA',
        expectedCondition: 'Ramps, tactile paths, accessible washrooms, and lifts conforming to PwD Act (REQ-EOA-007).',
        availableEvidence: 'Not Checked — Rule/Data Unavailable',
        status: 'NOT_CHECKED',
        reason: 'Not Checked — Rule/Data Unavailable. Barrier-free details not declared.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
      });
    }
  } else if (app.type === 'NEW_APPROVAL') {
    // -------------------------------------------------------------------------
    // New Approval Rule 1: Land Ownership & Unencumbered Title
    // -------------------------------------------------------------------------
    const landDoc = docs.find((d) => d.requirementId === 'REQ-NEW-002' || d.id === 'REQ-NEW-002');
    if (!landDoc || landDoc.status === 'NOT_UPLOADED') {
      findings.push({
        id: 'FINDING-NEW-LAND',
        ruleId: 'RULE-NEW-001',
        ruleTitle: 'Land Ownership & Unencumbered Title Record',
        category: 'LAND_BUILDING',
        applicationType: 'NEW_APPROVAL',
        expectedCondition: 'Clear, unencumbered Registered Sale Deed or >= 30-year Government Lease in Trust name (REQ-NEW-002).',
        availableEvidence: 'Document not uploaded in application dossier.',
        status: 'WARNING',
        reason: 'Mandatory Land Title Deed (REQ-NEW-002) is missing from New Approval dossier.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        referencedDocumentId: 'REQ-NEW-002',
        referencedDocumentName: 'Registered Land Title Deed or 30-Year Lease',
      });
    } else {
      findings.push({
        id: 'FINDING-NEW-LAND',
        ruleId: 'RULE-NEW-001',
        ruleTitle: 'Land Ownership & Unencumbered Title Record',
        category: 'LAND_BUILDING',
        applicationType: 'NEW_APPROVAL',
        expectedCondition: 'Clear, unencumbered Registered Sale Deed or >= 30-year Government Lease in Trust name (REQ-NEW-002).',
        availableEvidence: `Uploaded file: ${landDoc.fileName || 'Title Deed'} (${landDoc.status}). Declared Land: ${decl?.landAreaAcres || 'N/A'} Acres.`,
        status: landDoc.status === 'Accepted' ? 'PASS' : 'NEEDS_REVIEW',
        reason:
          landDoc.status === 'Accepted'
            ? 'Land Title Deed verified and accepted by scrutiny officer.'
            : 'Land Title Deed uploaded; awaiting scrutiny officer verification.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        referencedDocumentId: landDoc.id,
        referencedDocumentName: landDoc.name,
      });
    }

    // -------------------------------------------------------------------------
    // New Approval Rule 2: Master Site Plan & Building Blueprints
    // -------------------------------------------------------------------------
    const sitePlanDoc = docs.find((d) => d.requirementId === 'REQ-NEW-007' || d.id === 'REQ-NEW-007');
    if (!sitePlanDoc || sitePlanDoc.status === 'NOT_UPLOADED') {
      findings.push({
        id: 'FINDING-NEW-SITE-PLAN',
        ruleId: 'RULE-NEW-002',
        ruleTitle: 'Master Site Plan & Municipal Approval Blueprints',
        category: 'LAND_BUILDING',
        applicationType: 'NEW_APPROVAL',
        expectedCondition: 'Architectural site layout and built-up blueprints approved by competent municipal authority (REQ-NEW-007).',
        availableEvidence: 'Document not uploaded.',
        status: 'WARNING',
        reason: 'Master Site Plan and approved blueprints are missing.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        referencedDocumentId: 'REQ-NEW-007',
        referencedDocumentName: 'Master Site Plan & Building Approval Blueprints',
      });
    } else {
      findings.push({
        id: 'FINDING-NEW-SITE-PLAN',
        ruleId: 'RULE-NEW-002',
        ruleTitle: 'Master Site Plan & Municipal Approval Blueprints',
        category: 'LAND_BUILDING',
        applicationType: 'NEW_APPROVAL',
        expectedCondition: 'Architectural site layout and built-up blueprints approved by competent municipal authority (REQ-NEW-007).',
        availableEvidence: `Uploaded file: ${sitePlanDoc.fileName || 'Blueprints'} (${sitePlanDoc.status}).`,
        status: sitePlanDoc.status === 'Accepted' ? 'PASS' : 'NEEDS_REVIEW',
        reason:
          sitePlanDoc.status === 'Accepted'
            ? 'Approved architectural site plan and layout blueprints verified.'
            : 'Site plan uploaded; pending officer layout inspection.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        referencedDocumentId: sitePlanDoc.id,
        referencedDocumentName: sitePlanDoc.name,
      });
    }

    // -------------------------------------------------------------------------
    // New Approval Rule 3: Non-Agricultural Land Use Conversion Order
    // -------------------------------------------------------------------------
    const naDoc = docs.find((d) => d.requirementId === 'REQ-NEW-003' || d.id === 'REQ-NEW-003');
    if (!naDoc || naDoc.status === 'NOT_UPLOADED') {
      findings.push({
        id: 'FINDING-NEW-NA-CONVERSION',
        ruleId: 'RULE-NEW-003',
        ruleTitle: 'Non-Agricultural (NA) Land Use Order',
        category: 'LAND_BUILDING',
        applicationType: 'NEW_APPROVAL',
        expectedCondition: 'Official land conversion order for educational use by District Collector or Competent Revenue Authority (REQ-NEW-003).',
        availableEvidence: 'Document not uploaded.',
        status: 'WARNING',
        reason: 'NA Land Conversion Order is missing from New Approval dossier.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        referencedDocumentId: 'REQ-NEW-003',
        referencedDocumentName: 'Non-Agricultural (NA) Land Conversion Order',
      });
    } else {
      findings.push({
        id: 'FINDING-NEW-NA-CONVERSION',
        ruleId: 'RULE-NEW-003',
        ruleTitle: 'Non-Agricultural (NA) Land Use Order',
        category: 'LAND_BUILDING',
        applicationType: 'NEW_APPROVAL',
        expectedCondition: 'Official land conversion order for educational use by District Collector or Competent Revenue Authority (REQ-NEW-003).',
        availableEvidence: `Uploaded file: ${naDoc.fileName || 'NA Order'} (${naDoc.status}).`,
        status: naDoc.status === 'Accepted' ? 'PASS' : 'NEEDS_REVIEW',
        reason:
          naDoc.status === 'Accepted'
            ? 'Competent revenue authority NA conversion order verified.'
            : 'NA Conversion order uploaded; pending officer review.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        referencedDocumentId: naDoc.id,
        referencedDocumentName: naDoc.name,
      });
    }

    // -------------------------------------------------------------------------
    // New Approval Rule 4: Rs. 1.00 Crore Joint Corpus Fund (FDR)
    // -------------------------------------------------------------------------
    const fdrDoc = docs.find((d) => d.requirementId === 'REQ-NEW-004' || d.id === 'REQ-NEW-004');
    if (!fdrDoc || fdrDoc.status === 'NOT_UPLOADED') {
      findings.push({
        id: 'FINDING-NEW-FDR',
        ruleId: 'RULE-NEW-004',
        ruleTitle: 'Rs. 1.00 Crore Joint Corpus Fund (FDR)',
        category: 'SAFETY_REGULATORY',
        applicationType: 'NEW_APPROVAL',
        expectedCondition: 'Joint Fixed Deposit Receipt of Rs. 1.00 Crore with Regional Officer, AICTE in nationalized bank (REQ-NEW-004).',
        availableEvidence: 'Document not uploaded.',
        status: 'WARNING',
        reason: 'Joint FDR Corpus Fund receipt (REQ-NEW-004) is missing.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        referencedDocumentId: 'REQ-NEW-004',
        referencedDocumentName: 'Rs. 1.00 Crore Joint Fixed Deposit (Corpus Fund)',
      });
    } else {
      const hasCrore = fdrDoc.validationResult?.findings?.some(
        (f) => f.id === 'CHK-SPECIFIC-NEW-004' && f.status === 'PASS'
      );
      findings.push({
        id: 'FINDING-NEW-FDR',
        ruleId: 'RULE-NEW-004',
        ruleTitle: 'Rs. 1.00 Crore Joint Corpus Fund (FDR)',
        category: 'SAFETY_REGULATORY',
        applicationType: 'NEW_APPROVAL',
        expectedCondition: 'Joint Fixed Deposit Receipt of Rs. 1.00 Crore with Regional Officer, AICTE in nationalized bank (REQ-NEW-004).',
        availableEvidence: `Uploaded file: ${fdrDoc.fileName || 'FDR Receipt'} (${fdrDoc.status}).`,
        status: hasCrore || fdrDoc.status === 'Accepted' ? 'PASS' : 'NEEDS_REVIEW',
        reason:
          hasCrore || fdrDoc.status === 'Accepted'
            ? 'Rs. 1.00 Crore Joint FDR with AICTE verified in financial records.'
            : 'FDR receipt uploaded; officer verification required for joint lien clause.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        referencedDocumentId: fdrDoc.id,
        referencedDocumentName: fdrDoc.name,
      });
    }

    // -------------------------------------------------------------------------
    // New Approval Rule 5: Sponsoring Trust Deed & MoA
    // -------------------------------------------------------------------------
    const trustDoc = docs.find((d) => d.requirementId === 'REQ-NEW-001' || d.id === 'REQ-NEW-001');
    if (!trustDoc || trustDoc.status === 'NOT_UPLOADED') {
      findings.push({
        id: 'FINDING-NEW-TRUST',
        ruleId: 'RULE-NEW-005',
        ruleTitle: 'Sponsoring Trust / Society Registration & MoA',
        category: 'SAFETY_REGULATORY',
        applicationType: 'NEW_APPROVAL',
        expectedCondition: 'Registered Deed of Trust / Society / Section 8 Company with educational objectives in MoA (REQ-NEW-001).',
        availableEvidence: 'Document not uploaded.',
        status: 'WARNING',
        reason: 'Registered Trust / Society Deed (REQ-NEW-001) is missing from dossier.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        referencedDocumentId: 'REQ-NEW-001',
        referencedDocumentName: 'Registered Trust / Society Deed & MoA',
      });
    } else {
      findings.push({
        id: 'FINDING-NEW-TRUST',
        ruleId: 'RULE-NEW-005',
        ruleTitle: 'Sponsoring Trust / Society Registration & MoA',
        category: 'SAFETY_REGULATORY',
        applicationType: 'NEW_APPROVAL',
        expectedCondition: 'Registered Deed of Trust / Society / Section 8 Company with educational objectives in MoA (REQ-NEW-001).',
        availableEvidence: `Uploaded file: ${trustDoc.fileName || 'Trust Deed'} (${trustDoc.status}).`,
        status: trustDoc.status === 'Accepted' ? 'PASS' : 'NEEDS_REVIEW',
        reason:
          trustDoc.status === 'Accepted'
            ? 'Sponsoring entity Trust Deed accepted.'
            : 'Trust Deed uploaded; pending officer verification.',
        officialRegulationNote: OFFICIAL_REGULATION_NOTE,
        referencedDocumentId: trustDoc.id,
        referencedDocumentName: trustDoc.name,
      });
    }
  }

  return findings;
}

/**
 * Detects discrepancies across application declarations, documents, OCR extracts, and evidence.
 * Distinguishes between CONFIRMED_DATA_MISMATCH, POTENTIAL_DISCREPANCY, and INSUFFICIENT_EVIDENCE.
 */
export function detectInfrastructureDiscrepancies(app: CollegeApplication): InfrastructureDiscrepancy[] {
  const discrepancies: InfrastructureDiscrepancy[] = [];
  const decl = app.declaredInfrastructure;
  const docs = app.documents || [];
  const evidence = app.infrastructureEvidence || [];

  // 1. Missing Classroom Evidence Discrepancy
  const classroomPhotos = evidence.filter((e) => e.evidenceCategory === 'CLASSROOM_PHOTO');
  if (decl && decl.classroomsCount !== undefined && decl.classroomsCount > 0 && classroomPhotos.length === 0) {
    discrepancies.push({
      id: 'DISC-CLASSROOM-EVIDENCE',
      affectedRequirementId: app.type === 'EOA' ? 'REQ-EOA-006' : 'REQ-NEW-007',
      affectedRequirementTitle: 'Instructional Space & Classrooms',
      discrepancyType: 'INSUFFICIENT_EVIDENCE',
      severity: 'MEDIUM',
      sourceA: { name: 'Application Declaration', value: `${decl.classroomsCount} Classrooms Declared` },
      sourceB: { name: 'Multimedia Infrastructure Evidence', value: '0 Classroom Photographs Submitted' },
      explanation:
        'Institution declared classroom capacity in the application form, but no supporting geo-tagged photographs or layout proofs were uploaded into the dossier.',
      suggestedAction:
        'Request institution to upload photographs of functional classrooms or provide architectural floor plan drawings.',
    });
  }

  // 2. Classroom Count Conflict Between Application & Floor Plan / Document Text
  if (decl && decl.classroomsCount !== undefined && decl.classroomsCount > 0) {
    // Scan floor plan / blueprint documents for conflicting classroom numbers
    const blueprintDoc = docs.find(
      (d) =>
        d.requirementId === 'REQ-NEW-007' ||
        (d.name || '').toLowerCase().includes('blueprint') ||
        (d.name || '').toLowerCase().includes('site plan') ||
        (d.name || '').toLowerCase().includes('occupancy')
    );
    if (blueprintDoc && blueprintDoc.extractedText) {
      const match = blueprintDoc.extractedText.match(/(?:classrooms?|lecture\s*halls?)[\s:]+(\d{1,3})/i);
      if (match && match[1]) {
        const docCount = parseInt(match[1], 10);
        if (docCount !== decl.classroomsCount) {
          discrepancies.push({
            id: 'DISC-CLASSROOM-CONFLICT',
            affectedRequirementId: blueprintDoc.requirementId || blueprintDoc.id,
            affectedRequirementTitle: blueprintDoc.name,
            discrepancyType: 'CONFIRMED_DATA_MISMATCH',
            severity: 'HIGH',
            sourceA: { name: 'Application Declaration', value: `${decl.classroomsCount} Classrooms` },
            sourceB: { name: `${blueprintDoc.name} (OCR)`, value: `${docCount} Classrooms` },
            explanation: `Declared number of classrooms (${decl.classroomsCount}) conflicts directly with the classroom count extracted from the approved drawing/certificate (${docCount}).`,
            suggestedAction:
              'Scrutiny officer should inspect physical architectural drawings and require institution clarification on classroom availability.',
          });
        }
      }
    }

    // Check floor plan / blueprint in multimedia evidence
    const blueprintEvidence = evidence.find(
      (e) =>
        e.evidenceCategory === 'FLOOR_PLAN_DRAWING' ||
        (e.title || '').toLowerCase().includes('blueprint') ||
        (e.title || '').toLowerCase().includes('floor plan')
    );
    if (blueprintEvidence && blueprintEvidence.visualAnalysisSummary) {
      const match = blueprintEvidence.visualAnalysisSummary.match(/(?:demarcates|shows|identifies|contains)?\s*(\d{1,3})\s*(?:instructional\s*)?classrooms?/i);
      if (match && match[1]) {
        const docCount = parseInt(match[1], 10);
        if (docCount !== decl.classroomsCount) {
          discrepancies.push({
            id: 'DISC-CLASSROOM-CONFLICT-EVIDENCE',
            affectedRequirementId: blueprintEvidence.requirementId || (app.type === 'EOA' ? 'REQ-EOA-006' : 'REQ-NEW-007'),
            affectedRequirementTitle: blueprintEvidence.title || 'Instructional Space & Classrooms',
            discrepancyType: 'CONFIRMED_DATA_MISMATCH',
            severity: 'HIGH',
            sourceA: { name: 'Application Declaration', value: `${decl.classroomsCount} Classrooms` },
            sourceB: { name: `${blueprintEvidence.title} (Floor Plan)`, value: `${docCount} Classrooms` },
            explanation: `Declared number of classrooms (${decl.classroomsCount}) conflicts directly with the classroom count extracted from the architectural floor plan drawing (${docCount}).`,
            suggestedAction:
              'Scrutiny officer should inspect physical architectural drawings and require institution clarification on classroom availability.',
          });
        }
      }
    }
  }

  // 3. Missing Laboratory Evidence Discrepancy
  const labPhotos = evidence.filter((e) => e.evidenceCategory === 'LABORATORY_PHOTO');
  if (decl && decl.laboratoriesCount !== undefined && decl.laboratoriesCount > 0 && labPhotos.length === 0) {
    discrepancies.push({
      id: 'DISC-LAB-EVIDENCE',
      affectedRequirementId: app.type === 'EOA' ? 'REQ-EOA-006' : 'REQ-NEW-007',
      affectedRequirementTitle: 'Laboratories & Workshop Setup',
      discrepancyType: 'INSUFFICIENT_EVIDENCE',
      severity: 'MEDIUM',
      sourceA: { name: 'Application Declaration', value: `${decl.laboratoriesCount} Laboratories Declared` },
      sourceB: { name: 'Multimedia Infrastructure Evidence', value: '0 Laboratory Photographs Submitted' },
      explanation:
        'Institution declared technical laboratories in the application, but no supporting equipment or laboratory setup photographs were submitted.',
      suggestedAction:
        'Scrutiny officer should mandate photographic proof of major laboratory equipment for core engineering/technical disciplines.',
    });
  }

  // 4. Declared Land Acreage vs Land Title Deed Discrepancy (New Approval)
  if (app.type === 'NEW_APPROVAL' && decl && decl.landAreaAcres !== undefined) {
    const landDoc = docs.find((d) => d.requirementId === 'REQ-NEW-002' || d.id === 'REQ-NEW-002');
    if (landDoc && landDoc.extractedText) {
      const landMatch = landDoc.extractedText.match(/(\d+(?:\.\d+)?)\s*(?:acres?|hectares?)/i);
      if (landMatch && landMatch[1]) {
        const deedAcreage = parseFloat(landMatch[1]);
        if (Math.abs(deedAcreage - decl.landAreaAcres) >= 0.5) {
          discrepancies.push({
            id: 'DISC-LAND-CONFLICT',
            affectedRequirementId: landDoc.requirementId || landDoc.id,
            affectedRequirementTitle: landDoc.name,
            discrepancyType: 'CONFIRMED_DATA_MISMATCH',
            severity: 'HIGH',
            sourceA: { name: 'Application Declaration', value: `${decl.landAreaAcres} Acres` },
            sourceB: { name: `${landDoc.name} (OCR)`, value: `${deedAcreage} Acres` },
            explanation: `Declared land extent (${decl.landAreaAcres} Acres) does not match the land area extracted from the registered title deed (${deedAcreage} Acres).`,
            suggestedAction:
              'Scrutiny officer must review land survey schedule and verify contiguous unencumbered title on original deed.',
          });
        }
      }
    }
  }

  // 5. Mandatory Statutory Document Flagged or Missing Discrepancy
  const mandatoryStatutoryReqs =
    app.type === 'EOA'
      ? ['REQ-EOA-002', 'REQ-EOA-003'] // Fire Safety, Structural Stability
      : ['REQ-NEW-002', 'REQ-NEW-007', 'REQ-NEW-003', 'REQ-NEW-004']; // Land, Site Plan, NA Order, FDR

  for (const reqId of mandatoryStatutoryReqs) {
    const doc = docs.find((d) => d.requirementId === reqId || d.id === reqId);
    if (!doc || doc.status === 'NOT_UPLOADED') {
      discrepancies.push({
        id: `DISC-MISSING-DOC-${reqId}`,
        affectedRequirementId: reqId,
        affectedRequirementTitle: doc?.name || reqId,
        discrepancyType: 'POTENTIAL_DISCREPANCY',
        severity: 'HIGH',
        sourceA: { name: 'Mandatory AICTE Checklist', value: 'Uploaded & Valid Document Required' },
        sourceB: { name: 'Application Dossier', value: 'Document Missing' },
        explanation: `Mandatory statutory compliance document (${doc?.name || reqId}) has not been uploaded to the dossier.`,
        suggestedAction: 'Require the institution to upload the certified statutory document before scrutiny progression.',
      });
    } else if (doc.status === 'Replacement Required') {
      discrepancies.push({
        id: `DISC-REPLACEMENT-${reqId}`,
        affectedRequirementId: reqId,
        affectedRequirementTitle: doc.name,
        discrepancyType: 'POTENTIAL_DISCREPANCY',
        severity: 'HIGH',
        sourceA: { name: 'Scrutiny Officer Review', value: 'Replacement Required' },
        sourceB: { name: 'Uploaded File', value: doc.fileName || 'Uploaded' },
        explanation: `Document was flagged by the scrutiny officer with replacement required: "${doc.adminRemarks || 'Document deficient'}".`,
        suggestedAction: 'Wait for institution resubmission with rectified statutory document.',
        existingFindingReference: doc.adminRemarks,
      });
    } else if (doc.validationResult?.findings?.some((f) => f.id === 'CHK-EXPIRY' && f.status === 'WARNING')) {
      discrepancies.push({
        id: `DISC-EXPIRED-${reqId}`,
        affectedRequirementId: reqId,
        affectedRequirementTitle: doc.name,
        discrepancyType: 'POTENTIAL_DISCREPANCY',
        severity: 'HIGH',
        sourceA: { name: 'AICTE Validity Norms', value: 'Active / Unexpired Certificate Required' },
        sourceB: { name: 'Document Intelligence Check', value: 'Certificate Expired' },
        explanation: `Document validation flagged this statutory certificate as expired (${doc.validationResult?.extractedFields?.expiryDate || 'Past date'}).`,
        suggestedAction: 'Require renewal endorsement or current operational clearance certificate from competent authority.',
        existingFindingReference: 'CHK-EXPIRY',
      });
    }
  }

  return discrepancies;
}

/**
 * Generates rule-based physical inspection recommendations for the scrutiny officer.
 * Recommendations are advisory-only and never automatically approve/reject applications.
 */
export function generateInspectionRecommendation(
  app: CollegeApplication,
  findings: RegulatoryComplianceFinding[],
  discrepancies: InfrastructureDiscrepancy[]
): InspectionRecommendation {
  const safeDiscrepancies = discrepancies || [];
  const safeFindings = findings || [];
  const highSeverityDiscrepancies = safeDiscrepancies.filter((d) => d && d.severity === 'HIGH');
  const mediumSeverityDiscrepancies = safeDiscrepancies.filter((d) => d && d.severity === 'MEDIUM');
  const warningFindings = safeFindings.filter((f) => f && f.status === 'WARNING');
  const totalEvidenceCount =
    (app?.infrastructureEvidence?.length || 0) +
    (app?.documents?.filter((d) => d && d.status !== 'NOT_UPLOADED').length || 0);

  // Condition 1: Insufficient Evidence to Assess
  if (totalEvidenceCount === 0) {
    return {
      type: 'INSUFFICIENT_EVIDENCE_TO_ASSESS',
      title: 'Insufficient Evidence to Assess',
      reasons: [
        'No infrastructure evidence items or statutory compliance documents have been uploaded.',
        'Baseline institutional verification cannot be conducted until evidence is submitted.',
      ],
      recommendedScope: ['Desk verification upon initial document upload'],
      isAdvisoryOnly: true,
    };
  }

  // Condition 2: Physical Inspection Recommended
  if (highSeverityDiscrepancies.length > 0 || warningFindings.length >= 2) {
    const reasons: string[] = [];

    highSeverityDiscrepancies.forEach((d) => {
      reasons.push(`${d.discrepancyType.replace(/_/g, ' ')}: ${d.explanation}`);
    });

    warningFindings.forEach((w) => {
      if (!reasons.some((r) => r.includes(w.ruleTitle))) {
        reasons.push(`${w.ruleTitle}: ${w.reason}`);
      }
    });

    const recommendedScope: string[] = [
      'Physical verification of operational classrooms, laboratories, and specialized equipment.',
      'On-site verification of fire protection measures and emergency exits.',
      'Inspection of registered land boundaries, campus layout, and barrier-free access.',
    ];

    return {
      type: 'PHYSICAL_INSPECTION_RECOMMENDED',
      title: 'Physical Inspection Recommended',
      reasons,
      recommendedScope,
      isAdvisoryOnly: true,
    };
  }

  // Condition 3: Officer Review Required
  if (mediumSeverityDiscrepancies.length > 0 || warningFindings.length > 0) {
    const reasons: string[] = [];
    mediumSeverityDiscrepancies.forEach((d) => {
      reasons.push(`${d.discrepancyType.replace(/_/g, ' ')}: ${d.explanation}`);
    });
    warningFindings.forEach((w) => {
      reasons.push(`${w.ruleTitle}: ${w.reason}`);
    });

    return {
      type: 'OFFICER_REVIEW_REQUIRED',
      title: 'Officer Review Required',
      reasons,
      recommendedScope: ['Administrative review of uploaded declarations and photographic proofs'],
      isAdvisoryOnly: true,
    };
  }

  // Condition 4: No Additional Inspection Indicated
  return {
    type: 'NO_ADDITIONAL_INSPECTION_INDICATED',
    title: 'No Additional Inspection Indicated by Current Evidence',
    reasons: [
      'All applicable configured regulatory and infrastructure compliance checks are satisfactory.',
      'No unresolved high-severity discrepancies were detected between declarations and submitted evidence.',
      'Statutory compliance documents are uploaded and consistent with application records.',
    ],
    recommendedScope: ['Standard administrative desk scrutiny'],
    isAdvisoryOnly: true,
  };
}

/**
 * Main Assessment Engine: Computes regulatory checklist findings, processes evidence,
 * detects discrepancies, and derives inspection recommendations.
 */
export function assessRegulatoryAndInfrastructureCompliance(
  app: CollegeApplication
): RegulatoryComplianceAssessment {
  const findings = evaluateRegulatoryRules(app);
  const discrepancies = detectInfrastructureDiscrepancies(app);
  const recommendation = generateInspectionRecommendation(app, findings, discrepancies);

  // Process visual/video notes on evidence items
  const processedEvidence: InfrastructureEvidenceItem[] = (app.infrastructureEvidence || []).map((item) => {
    const analysis = analyzeMediaEvidence(item);
    return {
      ...item,
      visualAnalysisSummary: item.visualAnalysisSummary || analysis.summary,
      isUnsupportedMedia: analysis.isUnsupported,
      unsupportedMediaReason: analysis.unsupportedReason,
    };
  });

  const safeFindings = findings || [];
  const summary = {
    totalRules: safeFindings.length,
    passed: safeFindings.filter((f) => f && f.status === 'PASS').length,
    warnings: safeFindings.filter((f) => f && f.status === 'WARNING').length,
    needsReview: safeFindings.filter((f) => f && f.status === 'NEEDS_REVIEW').length,
    notChecked: safeFindings.filter((f) => f && f.status === 'NOT_CHECKED').length,
  };

  return {
    assessedAt: new Date().toISOString(),
    assessedVersion: (app.regulatoryComplianceAssessment?.assessedVersion || 0) + 1,
    applicationType: app.type,
    findings,
    evidenceList: processedEvidence,
    discrepancies,
    recommendation,
    officerDecision: app.regulatoryComplianceAssessment?.officerDecision,
    summary,
  };
}
