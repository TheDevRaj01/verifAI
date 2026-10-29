export type UserRole = 'college' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  collegeId?: string; // Set if role === 'college'
  createdAt: string;
}

export type ApplicationType = 'EOA' | 'NEW_APPROVAL';

export type ApplicationStatus =
  | 'Draft'
  | 'Submitted'
  | 'Under Scrutiny'
  | 'Documents Verified'
  | 'Clarification Requested'
  | 'Approved'
  | 'Rejected';

export type DocumentStatus =
  | 'NOT_UPLOADED'
  | 'Uploaded'
  | 'Accepted'
  | 'Replacement Required'
  | 'Pending'
  | 'Validated'
  | 'Flagged';

export interface ChecklistRequirement {
  id: string;
  applicationType: ApplicationType;
  title: string;
  description: string;
  category: string;
  isMandatory: boolean;
  allowedFileTypes: string[]; // e.g. ['.pdf', '.jpg', '.jpeg', '.png']
  maxFileSizeMB: number;
  isActive: boolean;
  displayOrder: number;
  academicYear?: string;
  isDemo?: boolean;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
}

export type OcrMethod = 'native_pdf' | 'ocr_pdf' | 'ocr_image';

export interface DocumentOcrResult {
  text: string;
  method: OcrMethod;
  extractedAt: string;
  charCount: number;
  wordCount: number;
  pageCount?: number;
  confidence?: number;
  language?: string;
}

export type ValidationCheckStatus = 'PASS' | 'WARNING' | 'NEEDS_REVIEW' | 'NOT_CHECKED';

export type FindingCategory =
  | 'CHECKLIST_COMPLIANCE'
  | 'SUSPICIOUS_CHANGES'
  | 'DATE_METADATA_ANOMALY'
  | 'IDENTIFIER_FORMAT'
  | 'CROSS_DOCUMENT_CONSISTENCY';

export interface ValidationCheckFinding {
  id: string;
  ruleName: string;
  status: ValidationCheckStatus;
  reason: string;
  category?: FindingCategory;
  categoryLabel?: string;
  evidenceSnippet?: string;
  comparisonValue?: string;
  extractedValue?: string;
  previousValue?: string;
  currentValue?: string;
  previousVersion?: number;
  currentVersion?: number;
  relevantDocumentName?: string;
  suggestedAction?: string;
}

export interface ExtractedDocumentFields {
  documentType?: string;
  institutionName?: string;
  certificateNumber?: string;
  issuingAuthority?: string;
  issueDate?: string;
  expiryDate?: string;
  validityPeriod?: string;
  academicYear?: string;
  udin?: string;
  financialAmount?: string;
  specificDetails?: Record<string, string>;
}

export interface PdfDocumentMetadata {
  creationDate?: string;
  modificationDate?: string;
  producer?: string;
  creator?: string;
  title?: string;
  author?: string;
  isEncrypted?: boolean;
  rawInfo?: Record<string, string>;
}

export interface DocumentVersionSnapshot {
  version: number;
  fileName?: string;
  fileSize?: string;
  fileType?: string;
  uploadDate?: string;
  fileDataUrl?: string;
  fileUrl?: string;
  storagePath?: string;
  fileBlobId?: string;
  fileHash?: string;
  extractedText?: string;
  ocrResult?: DocumentOcrResult;
  validationResult?: DocumentValidationResult;
  extractedFields?: ExtractedDocumentFields;
  pdfMetadata?: PdfDocumentMetadata;
}

export interface DocumentValidationResult {
  analyzedAt: string;
  documentVersion: number;
  ocrSnippetPreview: string;
  extractedFields: ExtractedDocumentFields;
  findings: ValidationCheckFinding[];
  summary: {
    passed: number;
    warnings: number;
    needsReview: number;
    notChecked: number;
  };
  overallVerdict: 'SATISFACTORY' | 'CAUTION_REVIEWS_NEEDED' | 'DISCREPANCIES_FOUND' | 'INSUFFICIENT_DATA';
  authenticityStatus: string;
  disclaimer: string;
  pdfMetadata?: PdfDocumentMetadata;
}

export type DuplicateStatus = 'EXACT_DUPLICATE' | 'LIKELY_DUPLICATE' | 'POSSIBLE_DUPLICATE' | 'UNIQUE';

export type DuplicateDetectionMethod = 'file_hash' | 'certificate_info' | 'ocr_similarity';

export interface DuplicateMatchDetail {
  method: DuplicateDetectionMethod;
  status: DuplicateStatus;
  matchedDocumentId: string;
  matchedRequirementTitle: string;
  matchedApplicationId: string;
  matchedApplicationType: ApplicationType;
  matchedVersion?: number;
  matchedFileName?: string;
  similarityScore?: number;
  reason: string;
  comparisonDetails?: {
    targetValue?: string;
    matchedValue?: string;
    field?: string;
  };
}

export interface DuplicateDetectionResult {
  checkedAt: string;
  status: DuplicateStatus;
  overallReason: string;
  comparisonScope: 'SAME_APPLICATION' | 'SAME_COLLEGE_PREVIOUS_APPLICATIONS' | 'ALL_COLLEGE_APPLICATIONS' | 'NONE';
  matches: DuplicateMatchDetail[];
  similarityThreshold: number;
  evaluatedDocumentsCount: number;
  notice: string;
}

export type AuthorityVerificationStatus =
  | 'VERIFIED'
  | 'DETAILS_MISMATCH'
  | 'RECORD_NOT_FOUND'
  | 'EXPIRED'
  | 'PENDING'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'SOURCE_UNAVAILABLE'
  | 'NOT_CONFIGURED'
  | 'VERIFICATION_FAILED';

export type AuthorityVerificationMethod =
  | 'OFFICIAL_API'
  | 'QR_CODE'
  | 'DIGITAL_SIGNATURE'
  | 'REFERENCE_REGISTRY'
  | 'MANUAL_ADMIN';

export type AuthorityIntegrationStatus =
  | 'CONFIGURED'
  | 'NOT_CONFIGURED'
  | 'BACKEND_SERVICE_REQUIRED'
  | 'DISABLED';

export interface AuthorityFieldComparison {
  field: string;
  label: string;
  submittedValue?: string;
  officialValue?: string;
  match: boolean;
  reason?: string;
}

export interface IssuingAuthorityProfile {
  authorityId: string;
  authorityName: string;
  department: string;
  certificateTypes: string[];
  requirementIds: string[];
  officialVerificationUrl?: string;
  supportedMethods: AuthorityVerificationMethod[];
  integrationStatus: AuthorityIntegrationStatus;
  requiredFields: string[];
  trustedDomains: string[];
  notes: string;
  lastCheckedAt?: string;
}

export interface AuthorityVerificationRecord {
  id: string;
  applicationId: string;
  applicationTrack: ApplicationType;
  documentId: string;
  requirementId?: string;
  documentVersion: number;
  fileHash?: string;
  authorityId: string;
  authorityName: string;
  method: AuthorityVerificationMethod;
  officialSource: {
    name: string;
    url?: string;
    endpointType?: 'LIVE_API' | 'OFFICIAL_PORTAL' | 'MANUAL_DESK' | 'UNCONFIGURED_ADAPTER';
  };
  maskedReferenceNumber?: string;
  attemptTimestamp: string;
  completedTimestamp?: string;
  status: AuthorityVerificationStatus;
  matchedFields: AuthorityFieldComparison[];
  mismatchedFields: AuthorityFieldComparison[];
  failureReason?: string;
  manualReviewReason?: string;
  suggestedNextAction?: string;
  isManualReview: boolean;
  manualVerificationMethod?: 'Official Portal' | 'QR' | 'Other';
  referenceNumberChecked?: string;
  reviewer?: {
    id: string;
    name: string;
    email?: string;
    role: string;
    decision: 'VERIFIED' | 'MISMATCH_FOUND' | 'UNABLE_TO_VERIFY';
    manualVerificationMethod?: 'Official Portal' | 'QR' | 'Other';
    referenceNumberChecked?: string;
    remarks: string;
    officialSourceUsed: string;
    reviewedAt: string;
  };
}

export interface AuthorityVerificationResult {
  recordId: string;
  status: AuthorityVerificationStatus;
  method: AuthorityVerificationMethod;
  authorityId: string;
  authorityName: string;
  officialSource: {
    name: string;
    url?: string;
    endpointType?: 'LIVE_API' | 'OFFICIAL_PORTAL' | 'MANUAL_DESK' | 'UNCONFIGURED_ADAPTER';
  };
  verifiedAt: string;
  documentVersion: number;
  isManualReview: boolean;
  manualVerificationMethod?: 'Official Portal' | 'QR' | 'Other';
  referenceNumberChecked?: string;
  matchedFieldsCount: number;
  mismatchedFieldsCount: number;
  summary: string;
  details?: AuthorityFieldComparison[];
  reviewerDecision?: 'VERIFIED' | 'MISMATCH_FOUND' | 'UNABLE_TO_VERIFY';
  reviewerRemarks?: string;
  reviewerName?: string;
  reviewerEmail?: string;
}

export interface RequiredDocument {
  id: string;
  requirementId?: string;
  name: string;
  category: string;
  isMandatory: boolean;
  status: DocumentStatus;
  fileName?: string;
  fileSize?: string;
  fileType?: string;
  uploadDate?: string;
  fileDataUrl?: string;
  fileUrl?: string;
  storagePath?: string;
  fileBlobId?: string;
  adminRemarks?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  version?: number;
  aiVerificationNote?: string;
  ocrResult?: DocumentOcrResult;
  extractedText?: string;
  ocrExtractedAt?: string;
  ocrMethod?: OcrMethod;
  validationResult?: DocumentValidationResult;
  fileHash?: string;
  duplicateCheckResult?: DuplicateDetectionResult;
  previousVersions?: DocumentVersionSnapshot[];
  pdfMetadata?: PdfDocumentMetadata;
  authorityVerificationResult?: AuthorityVerificationResult;
  authorityVerificationHistory?: AuthorityVerificationRecord[];
}

export interface DeclaredInfrastructure {
  landAreaAcres?: number;
  totalBuiltUpAreaSqM?: number;
  classroomsCount?: number;
  laboratoriesCount?: number;
  libraryAreaSqM?: number;
  libraryBooksCount?: number;
  computerCentresCount?: number;
  hasBarrierFreeEnvironment?: boolean;
  hasFireSafetyEquipment?: boolean;
  hasFunctionalElevators?: boolean;
  hasHostelFacility?: boolean;
}

export type InfrastructureEvidenceType =
  | 'CAMPUS_EXTERIOR'
  | 'CLASSROOM_PHOTO'
  | 'LABORATORY_PHOTO'
  | 'LIBRARY_PHOTO'
  | 'COMPUTER_CENTRE_PHOTO'
  | 'FACULTY_ROOM_PHOTO'
  | 'SANITATION_WATER_PHOTO'
  | 'ACCESSIBILITY_SAFETY_PHOTO'
  | 'FLOOR_PLAN_DRAWING'
  | 'OTHER_INFRASTRUCTURE_EVIDENCE'
  // Backward compatibility aliases
  | 'BUILDING_EXTERIOR_PHOTO'
  | 'WALKTHROUGH_VIDEO'
  | 'STATUTORY_RECORD';

export interface InfrastructureEvidenceItem {
  id: string;
  applicationId?: string;
  applicationTrack?: ApplicationType;
  requirementId?: string;
  title: string;
  fileName: string;
  fileSize?: string;
  fileType: string;
  fileDataUrl?: string;
  fileUrl?: string;
  storagePath?: string;
  fileBlobId?: string;
  evidenceCategory: InfrastructureEvidenceType;
  uploadDate: string;
  uploadedBy?: string;
  uploadedByRole?: 'college' | 'admin';
  status?: 'PENDING_REVIEW' | 'REVIEWED' | 'ACCEPTED' | 'FLAGGED';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewerRemarks?: string;
  visualAnalysisSummary?: string;
  isUnsupportedMedia?: boolean;
  unsupportedMediaReason?: string;
  associatedRequirementTitle?: string;
}

export type ComplianceCheckStatus = 'PASS' | 'WARNING' | 'NEEDS_REVIEW' | 'NOT_CHECKED';
export type DiscrepancyType = 'CONFIRMED_DATA_MISMATCH' | 'POTENTIAL_DISCREPANCY' | 'INSUFFICIENT_EVIDENCE';
export type DiscrepancySeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RegulatoryComplianceFinding {
  id: string;
  ruleId: string;
  ruleTitle: string;
  category: 'INFRASTRUCTURE' | 'LAND_BUILDING' | 'ACADEMIC_FACILITIES' | 'SAFETY_REGULATORY' | 'FACULTY_ADMIN';
  applicationType: ApplicationType;
  expectedCondition: string;
  availableEvidence: string;
  status: ComplianceCheckStatus;
  reason: string;
  officialRegulationNote: string;
  referencedDocumentId?: string;
  referencedDocumentName?: string;
}

export interface InfrastructureDiscrepancy {
  id: string;
  affectedRequirementId?: string;
  affectedRequirementTitle: string;
  discrepancyType: DiscrepancyType;
  severity: DiscrepancySeverity;
  sourceA: { name: string; value: string };
  sourceB: { name: string; value: string };
  explanation: string;
  suggestedAction: string;
  existingFindingReference?: string;
}

export type InspectionRecommendationType =
  | 'PHYSICAL_INSPECTION_RECOMMENDED'
  | 'OFFICER_REVIEW_REQUIRED'
  | 'INSUFFICIENT_EVIDENCE_TO_ASSESS'
  | 'NO_ADDITIONAL_INSPECTION_INDICATED';

export interface InspectionRecommendation {
  type: InspectionRecommendationType;
  title: string;
  reasons: string[];
  recommendedScope?: string[];
  isAdvisoryOnly: boolean;
}

export interface OfficerInspectionDecision {
  decision:
    | 'INSPECTION_MANDATED'
    | 'DESK_VERIFICATION_ACCEPTED'
    | 'CLARIFICATION_REQUIRED'
    | 'PENDING_OFFICER_REVIEW';
  officerName: string;
  officerRole: UserRole;
  recordedAt: string;
  remarks: string;
  followUpAction?: string;
}

export interface RegulatoryComplianceAssessment {
  assessedAt: string;
  assessedVersion: number;
  applicationType: ApplicationType;
  findings: RegulatoryComplianceFinding[];
  evidenceList: InfrastructureEvidenceItem[];
  discrepancies: InfrastructureDiscrepancy[];
  recommendation: InspectionRecommendation;
  officerDecision?: OfficerInspectionDecision;
  summary: {
    totalRules: number;
    passed: number;
    warnings: number;
    needsReview: number;
    notChecked: number;
  };
}

export interface ApplicationAuditLog {
  id: string;
  timestamp: string;
  action:
    | 'SUBMITTED'
    | 'DOCUMENT_UPLOADED'
    | 'DOCUMENT_REPLACED'
    | 'DOCUMENT_REMOVED'
    | 'DOCUMENT_ACCEPTED'
    | 'REPLACEMENT_REQUESTED'
    | 'STATUS_CHANGED'
    | 'INFRASTRUCTURE_ASSESSMENT_RECORDED'
    | 'INFRASTRUCTURE_EVIDENCE_ADDED'
    | 'INFRASTRUCTURE_EVIDENCE_REMOVED'
    | 'INFRASTRUCTURE_EVIDENCE_REVIEWED'
    | 'AUTHORITY_VERIFICATION_STARTED'
    | 'AUTHORITY_VERIFICATION_COMPLETED'
    | 'AUTHORITY_VERIFICATION_FAILED'
    | 'AUTHORITY_MANUAL_REVIEW_RECORDED'
    | 'STORAGE_MIGRATION';
  actor: string;
  actorRole: UserRole;
  details: string;
}

export interface CollegeApplication {
  id: string;
  collegeId: string;
  collegeName: string;
  type: ApplicationType;
  academicYear: string;
  state: string;
  district: string;
  discipline: string; // e.g. "Engineering & Technology", "Management"
  intakeApprovedLastYear?: number;
  intakeProposed: number;
  status: ApplicationStatus;
  submissionDate: string;
  lastUpdated: string;
  complianceScore: number; // 0-100 preview score
  flaggedIssuesCount: number;
  documents: RequiredDocument[];
  auditLogs?: ApplicationAuditLog[];
  remarks?: string;
  isDemo?: boolean;
  declaredInfrastructure?: DeclaredInfrastructure;
  infrastructureEvidence?: InfrastructureEvidenceItem[];
  regulatoryComplianceAssessment?: RegulatoryComplianceAssessment;
}

export type IdRequestStatus = 'Pending' | 'Approved' | 'Rejected';

export interface UniqueIdRequest {
  id: string;
  collegeName: string;
  officialEmail: string;
  institutionType: string;
  address: string;
  state: string;
  district: string;
  pinCode: string;
  authorizedPersonName: string;
  authorizedPersonDesignation: string;
  contactNumber: string;
  requestDate: string;
  status: IdRequestStatus;
  generatedCollegeId?: string;
  reviewRemarks?: string;
  reviewedAt?: string;
}

export interface CollegeAccount {
  collegeId: string;
  collegeName: string;
  officialEmail: string;
  state: string;
  district: string;
  institutionType: string;
  authorizedPerson: string;
  status: 'Active' | 'Suspended';
  createdAt: string;
  currentApplicationsCount: number;
  isDemo?: boolean;
}
