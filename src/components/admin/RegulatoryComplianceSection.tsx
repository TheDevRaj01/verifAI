import React, { useState } from 'react';
import {
  CollegeApplication,
  ComplianceCheckStatus,
  DiscrepancySeverity,
  InfrastructureEvidenceItem,
  InfrastructureEvidenceType,
  OfficerInspectionDecision,
  RegulatoryComplianceAssessment,
} from '../../types/index.ts';
import {
  assessRegulatoryAndInfrastructureCompliance,
  OFFICIAL_REGULATION_NOTE,
  UNSUPPORTED_VIDEO_ANALYSIS_MESSAGE,
  VISUAL_ANALYSIS_DISCLAIMER,
} from '../../services/regulatoryComplianceService';
import {
  addInfrastructureEvidence,
  removeInfrastructureEvidence,
  recordOfficerInspectionDecision,
  reassessApplicationRegulatoryCompliance,
  reviewInfrastructureEvidence,
} from '../../services/dataService';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  AlertCircle,
  ShieldAlert,
  Info,
  Camera,
  Video,
  Layers,
  Trash2,
  Plus,
  RefreshCw,
  Building,
  UserCheck,
  Eye,
  Check,
  X,
  Clock,
  ExternalLink,
  Maximize2,
} from 'lucide-react';

interface Props {
  application: CollegeApplication;
  onApplicationUpdate?: (updatedApp: CollegeApplication) => void;
}

export const RegulatoryComplianceSection: React.FC<Props> = ({
  application,
  onApplicationUpdate,
}) => {
  // Ensure we have an active, complete assessment
  const assessment: RegulatoryComplianceAssessment = (() => {
    try {
      if (
        application?.regulatoryComplianceAssessment?.summary &&
        application?.regulatoryComplianceAssessment?.recommendation &&
        Array.isArray(application?.regulatoryComplianceAssessment?.findings)
      ) {
        return application.regulatoryComplianceAssessment;
      }
      return assessRegulatoryAndInfrastructureCompliance(application);
    } catch (e) {
      console.warn('[VerifAI] Falling back to default assessment due to calculation error:', e);
      return {
        assessedAt: new Date().toISOString(),
        assessedVersion: 1,
        applicationType: application?.type || 'EOA',
        findings: [],
        evidenceList: application?.infrastructureEvidence || [],
        discrepancies: [],
        recommendation: {
          type: 'INSUFFICIENT_EVIDENCE_TO_ASSESS',
          title: 'Assessment in progress',
          reasons: ['Initial dossier baseline assessment pending.'],
          recommendedScope: ['Standard desk verification'],
          isAdvisoryOnly: true,
        },
        summary: {
          totalRules: 0,
          passed: 0,
          warnings: 0,
          needsReview: 0,
          notChecked: 0,
        },
      };
    }
  })();

  // Findings filter
  const [findingFilter, setFindingFilter] = useState<'ALL' | ComplianceCheckStatus>('ALL');
  const [evidenceFilter, setEvidenceFilter] = useState<'ALL' | InfrastructureEvidenceType>('ALL');

  // Preview & Review UI state for infrastructure evidence
  const [previewItem, setPreviewItem] = useState<InfrastructureEvidenceItem | null>(null);
  const [reviewModalItem, setReviewModalItem] = useState<InfrastructureEvidenceItem | null>(null);
  const [reviewStatusInput, setReviewStatusInput] = useState<'ACCEPTED' | 'FLAGGED'>('ACCEPTED');
  const [reviewRemarksInput, setReviewRemarksInput] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // UI state for adding new evidence
  const [showAddEvidenceModal, setShowAddEvidenceModal] = useState(false);
  const [newEvidenceTitle, setNewEvidenceTitle] = useState('');
  const [newEvidenceCategory, setNewEvidenceCategory] = useState<InfrastructureEvidenceType>('CLASSROOM_PHOTO');
  const [newEvidenceFileName, setNewEvidenceFileName] = useState('');
  const [newEvidenceFileSize, setNewEvidenceFileSize] = useState('2.5 MB');
  const [newEvidenceReqId, setNewEvidenceReqId] = useState('');
  const [newEvidenceNotes, setNewEvidenceNotes] = useState('');

  // UI state for officer decision
  const [selectedDecision, setSelectedDecision] = useState<OfficerInspectionDecision['decision']>(
    assessment?.officerDecision?.decision || 'INSPECTION_MANDATED'
  );
  const [officerRemarks, setOfficerRemarks] = useState(assessment?.officerDecision?.remarks || '');
  const [officerFollowUp, setOfficerFollowUp] = useState(assessment?.officerDecision?.followUpAction || '');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Manual video review toggle
  const [reviewedVideos, setReviewedVideos] = useState<Record<string, boolean>>({});

  const isEoA = application?.type === 'EOA';
  const trackLabel = isEoA
    ? 'Extension of Approval (EoA) Regulatory Track'
    : 'New Approval / Setting Up New Institution Regulatory Track';

  // Filtered findings
  const findingsList = assessment?.findings || [];
  const filteredFindings = findingsList.filter((f) => {
    if (findingFilter === 'ALL') return true;
    return f?.status === findingFilter;
  });

  // Filtered evidence (supporting aliases)
  const evidenceList = application?.infrastructureEvidence || assessment?.evidenceList || [];
  const filteredEvidence = evidenceList.filter((e) => {
    if (evidenceFilter === 'ALL') return true;
    if (evidenceFilter === 'CAMPUS_EXTERIOR' && e?.evidenceCategory === 'BUILDING_EXTERIOR_PHOTO') return true;
    if (evidenceFilter === 'BUILDING_EXTERIOR_PHOTO' && e?.evidenceCategory === 'CAMPUS_EXTERIOR') return true;
    return e?.evidenceCategory === evidenceFilter;
  });

  // Officer review handler for evidence item
  const handleReviewEvidence = async (
    evidenceItem: InfrastructureEvidenceItem,
    status: 'ACCEPTED' | 'FLAGGED',
    remarks?: string
  ) => {
    setActionError(null);
    setIsSubmittingReview(true);
    try {
      const defaultRemark =
        status === 'ACCEPTED'
          ? 'Evidence inspected and accepted by Scrutiny Committee.'
          : 'Flagged for inspection follow-up or deficiency clarification.';
      const resolvedRemarks = remarks !== undefined ? remarks : (evidenceItem.reviewerRemarks || defaultRemark);
      const updated = await reviewInfrastructureEvidence(application.id, evidenceItem.id, {
        status,
        remarks: resolvedRemarks,
      });
      onApplicationUpdate?.(updated);
      setActionSuccess(`Evidence item "${evidenceItem.title}" marked as ${status}.`);
      setReviewModalItem(null);
      if (previewItem && previewItem.id === evidenceItem.id) {
        setPreviewItem({
          ...previewItem,
          status,
          reviewerRemarks: resolvedRemarks,
          reviewedAt: new Date().toISOString(),
          reviewedBy: 'AICTE Scrutiny Officer (Admin)',
        });
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to update evidence review status.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Re-assess application manually
  const handleReassess = async () => {
    setIsRefreshing(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const updated = await reassessApplicationRegulatoryCompliance(application.id);
      onApplicationUpdate?.(updated);
      setActionSuccess('Regulatory and infrastructure compliance re-evaluated successfully.');
    } catch (err: any) {
      setActionError(err.message || 'Failed to re-evaluate compliance.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Add evidence
  const handleAddEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvidenceTitle.trim() || !newEvidenceFileName.trim()) {
      setActionError('Title and file name are required.');
      return;
    }
    setActionError(null);
    try {
      const fileType = newEvidenceCategory === 'WALKTHROUGH_VIDEO'
        ? 'video/mp4'
        : newEvidenceCategory === 'FLOOR_PLAN_DRAWING'
        ? 'application/pdf'
        : 'image/jpeg';

      const updated = await addInfrastructureEvidence(application.id, {
        title: newEvidenceTitle.trim(),
        fileName: newEvidenceFileName.trim(),
        fileSize: newEvidenceFileSize || '3.0 MB',
        fileType,
        evidenceCategory: newEvidenceCategory,
        requirementId: newEvidenceReqId.trim() || undefined,
      });

      onApplicationUpdate?.(updated);
      setShowAddEvidenceModal(false);
      setNewEvidenceTitle('');
      setNewEvidenceFileName('');
      setNewEvidenceNotes('');
      setActionSuccess('Infrastructure evidence added and compliance re-evaluated.');
    } catch (err: any) {
      setActionError(err.message || 'Failed to add infrastructure evidence.');
    }
  };

  // Remove evidence
  const handleRemoveEvidence = async (evidenceId: string) => {
    if (!confirm('Are you sure you want to remove this evidence item? Compliance will be re-evaluated.')) return;
    setActionError(null);
    try {
      const updated = await removeInfrastructureEvidence(application.id, evidenceId);
      onApplicationUpdate?.(updated);
      setActionSuccess('Evidence removed. Compliance re-evaluated dynamically.');
    } catch (err: any) {
      setActionError(err.message || 'Failed to remove evidence.');
    }
  };

  // Record Officer Inspection Decision
  const handleRecordDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!officerRemarks.trim()) {
      setActionError('Scrutiny officer remarks are mandatory to record an official decision.');
      return;
    }
    setIsSubmittingDecision(true);
    setActionError(null);
    try {
      const updated = await recordOfficerInspectionDecision(application.id, {
        decision: selectedDecision,
        remarks: officerRemarks.trim(),
        followUpAction: officerFollowUp.trim() || undefined,
      });
      onApplicationUpdate?.(updated);
      setActionSuccess('Official scrutiny decision recorded in audit trail.');
    } catch (err: any) {
      setActionError(err.message || 'Failed to record officer decision.');
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  // Helper status color badges
  const getStatusBadge = (status: ComplianceCheckStatus) => {
    switch (status) {
      case 'PASS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle className="w-3 h-3" /> PASS
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3 h-3" /> WARNING
          </span>
        );
      case 'NEEDS_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            <ShieldAlert className="w-3 h-3" /> NEEDS REVIEW
          </span>
        );
      case 'NOT_CHECKED':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <HelpCircle className="w-3 h-3" /> NOT CHECKED
          </span>
        );
    }
  };

  // Helper severity badges
  const getSeverityBadge = (severity: DiscrepancySeverity) => {
    switch (severity) {
      case 'HIGH':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            HIGH SEVERITY
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            MEDIUM
          </span>
        );
      case 'LOW':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
            LOW
          </span>
        );
    }
  };

  const rec = assessment?.recommendation || {
    type: 'INSUFFICIENT_EVIDENCE_TO_ASSESS',
    title: 'Assessment in progress',
    reasons: ['Initial dossier baseline assessment pending.'],
    recommendedScope: ['Standard desk verification'],
    isAdvisoryOnly: true,
  };

  const summary = assessment?.summary || {
    totalRules: 0,
    passed: 0,
    warnings: 0,
    needsReview: 0,
    notChecked: 0,
  };

  const discrepanciesList = assessment?.discrepancies || [];

  return (
    <div className="space-y-8">
      {/* SECTION HEADER */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
              <h3 className="text-xl font-bold tracking-tight text-white">
                Regulatory & Infrastructure Compliance Assessment
              </h3>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Automated AICTE regulatory rules engine & physical evidence review. Evaluates institutional spaces,
              statutory clearances, and infrastructure proofs against configured AICTE APH requirements.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                <Building className="w-3.5 h-3.5 text-indigo-300" />
                {trackLabel}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                Application: <strong className="text-white ml-0.5">{application?.id || 'N/A'}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={handleReassess}
              disabled={isRefreshing}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
              title="Re-run compliance engine"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Re-evaluating...' : 'Re-assess Rules'}</span>
            </button>
            <button
              onClick={() => setShowAddEvidenceModal(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Attach Evidence</span>
            </button>
          </div>
        </div>

        {/* Global Action Alerts */}
        {actionError && (
          <div className="mt-4 p-3 bg-rose-500/20 border border-rose-500/50 rounded-xl flex items-center gap-2 text-xs text-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
        {actionSuccess && (
          <div className="mt-4 p-3 bg-emerald-500/20 border border-emerald-500/50 rounded-xl flex items-center gap-2 text-xs text-emerald-200">
            <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}
      </div>

      {/* METRIC COUNTERS */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm text-center">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Rules</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{summary.totalRules}</p>
        </div>
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 shadow-sm text-center">
          <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Pass</p>
          <p className="text-2xl font-black text-emerald-800 mt-1">{summary.passed}</p>
        </div>
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3.5 shadow-sm text-center">
          <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Warnings</p>
          <p className="text-2xl font-black text-amber-800 mt-1">{summary.warnings}</p>
        </div>
        <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3.5 shadow-sm text-center">
          <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Needs Review</p>
          <p className="text-2xl font-black text-blue-800 mt-1">{summary.needsReview}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-sm text-center">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Not Checked</p>
          <p className="text-2xl font-black text-slate-700 mt-1">{summary.notChecked}</p>
        </div>
      </div>

      {/* PANEL 4: PHYSICAL INSPECTION RECOMMENDATION CARD (Prominently displayed) */}
      <div
        className={`rounded-2xl p-6 border shadow-sm transition-all ${
          rec.type === 'PHYSICAL_INSPECTION_RECOMMENDED'
            ? 'bg-amber-50/80 border-amber-300 text-amber-950'
            : rec.type === 'OFFICER_REVIEW_REQUIRED'
            ? 'bg-blue-50/80 border-blue-300 text-blue-950'
            : rec.type === 'INSUFFICIENT_EVIDENCE_TO_ASSESS'
            ? 'bg-slate-100 border-slate-300 text-slate-900'
            : 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {rec.type === 'PHYSICAL_INSPECTION_RECOMMENDED' ? (
                <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
              ) : rec.type === 'OFFICER_REVIEW_REQUIRED' ? (
                <ShieldAlert className="w-6 h-6 text-blue-600 flex-shrink-0" />
              ) : rec.type === 'INSUFFICIENT_EVIDENCE_TO_ASSESS' ? (
                <HelpCircle className="w-6 h-6 text-slate-600 flex-shrink-0" />
              ) : (
                <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0" />
              )}
              <h4 className="text-base font-bold tracking-tight">
                Physical Inspection Recommendation:{' '}
                <span className="underline decoration-current/40">
                  {(rec.type || 'INSUFFICIENT_EVIDENCE_TO_ASSESS').replace(/_/g, ' ')}
                </span>
              </h4>
            </div>
            <p className="text-xs leading-relaxed max-w-3xl font-medium">
              {rec.title}
            </p>

            {/* Contributing Reasons */}
            {rec.reasons && rec.reasons.length > 0 && (
              <div className="pt-2">
                <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">
                  Contributing Factors / Discrepancies:
                </p>
                <ul className="list-disc list-inside mt-1 space-y-1 text-xs">
                  {rec.reasons.map((r: string, i: number) => (
                    <li key={i} className="leading-snug">{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggested Scope */}
            {rec.recommendedScope && rec.recommendedScope.length > 0 && (
              <div className="pt-2">
                <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">
                  Recommended Inspection Scope:
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {rec.recommendedScope.map((scope: string, idx: number) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-white/70 border border-current/20 shadow-2xs"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="self-end md:self-start flex-shrink-0">
            <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold bg-white/80 border border-current/20 shadow-xs">
              Algorithmic Advisory Only
            </span>
          </div>
        </div>

        {/* Advisory Disclaimer */}
        <div className="mt-4 pt-3 border-t border-current/20 flex items-start gap-2 text-[11px] opacity-85 leading-relaxed">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            This physical inspection recommendation is advisory and generated algorithmically to assist the scrutiny committee.
            Official inspection decisions must be ratified or recorded by authorized AICTE scrutiny officers.
          </span>
        </div>
      </div>

      {/* PANEL 3: POTENTIAL DISCREPANCIES TABLE */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-indigo-700" />
              <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Cross-Verification & Discrepancy Detection
              </h4>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                {discrepanciesList.length} identified
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Correlates declared infrastructure metrics, uploaded documents, OCR extracts, and physical evidence items.
            </p>
          </div>
        </div>

        {/* Non-fraudulent advisory note */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2 text-xs text-slate-600">
          <Info className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Advisory Note:</strong> Detected discrepancies represent data variance or evidentiary gaps
            requiring human review. The platform does not assert fraud or intentional misrepresentation without formal
            procedural inquiry.
          </p>
        </div>

        {discrepanciesList.length === 0 ? (
          <div className="p-6 text-center border border-emerald-200 bg-emerald-50/50 rounded-xl">
            <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
            <h5 className="text-xs font-bold text-emerald-900">Zero Discrepancies Detected</h5>
            <p className="text-xs text-emerald-700 mt-0.5">
              All declared infrastructure figures align with uploaded certificates, blueprints, and physical evidence records.
            </p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200">
            {discrepanciesList.map((disc) => (
              <div key={disc.id || Math.random().toString()} className="p-4 space-y-3 hover:bg-slate-50/60 transition-colors text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {getSeverityBadge(disc.severity || 'LOW')}
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                      {(disc.discrepancyType || 'DISCREPANCY').replace(/_/g, ' ')}
                    </span>
                    <span className="font-bold text-slate-900">{disc.affectedRequirementTitle || 'Compliance Requirement'}</span>
                  </div>
                  {disc.affectedRequirementId && (
                    <span className="text-[11px] text-slate-500 font-mono">
                      Requirement: {disc.affectedRequirementId}
                    </span>
                  )}
                </div>

                <p className="text-slate-800 leading-relaxed font-medium">
                  {disc.explanation || 'Discrepancy identified between declared information and submitted evidence.'}
                </p>

                {/* Source Comparison Table */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="font-bold text-slate-600 text-[10px] uppercase tracking-wider block">
                      {disc.sourceA?.name || 'Declared / Source A'}:
                    </span>
                    <span className="text-slate-900 font-mono mt-0.5 block">{disc.sourceA?.value ?? 'N/A'}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600 text-[10px] uppercase tracking-wider block">
                      {disc.sourceB?.name || 'Evidence / Source B'}:
                    </span>
                    <span className="text-slate-900 font-mono mt-0.5 block">{disc.sourceB?.value ?? 'N/A'}</span>
                  </div>
                </div>

                {disc.suggestedAction && (
                  <div className="flex items-start gap-1.5 text-indigo-900 bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-100">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-700 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Recommended Action:</strong> {disc.suggestedAction}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PANEL 1: AICTE REGULATORY RULES CHECKLIST SUMMARY */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-700" />
              <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                AICTE Regulatory Rules & Requirements
              </h4>
            </div>
            <p className="text-xs text-slate-500">
              Track-specific rules configured for {isEoA ? 'Extension of Approval' : 'New Approval'}.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(['ALL', 'PASS', 'WARNING', 'NEEDS_REVIEW', 'NOT_CHECKED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFindingFilter(st)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                  findingFilter === st
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Findings Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200">
          {filteredFindings.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No regulatory checks found matching filter "{findingFilter}".
            </div>
          ) : (
            filteredFindings.map((finding) => (
              <div key={finding.id} className="p-4 space-y-2 hover:bg-slate-50/50 transition-colors text-xs">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-blue-700 text-[11px] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {finding.ruleId}
                      </span>
                      <h5 className="font-bold text-slate-900">{finding.ruleTitle}</h5>
                      <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                        {finding.category.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 text-slate-700">
                      <div>
                        <span className="font-semibold text-slate-500 text-[10px] uppercase tracking-wider block">
                          Expected Regulatory Condition:
                        </span>
                        <span className="text-slate-800">{finding.expectedCondition}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-500 text-[10px] uppercase tracking-wider block">
                          Available Institutional Evidence:
                        </span>
                        <span className="text-slate-800">
                          {finding.status === 'NOT_CHECKED'
                            ? 'Not Checked — Rule/Data Unavailable'
                            : finding.availableEvidence}
                        </span>
                      </div>
                    </div>

                    {finding.reason && (
                      <p className="text-[11px] text-slate-600 pt-1">
                        <strong>Reason:</strong> {finding.reason}
                      </p>
                    )}

                    {finding.officialRegulationNote && (
                      <div className="p-2 bg-amber-50/70 border border-amber-200 rounded-lg text-[11px] text-amber-900 flex items-start gap-1.5 mt-1">
                        <Info className="w-3.5 h-3.5 text-amber-700 flex-shrink-0 mt-0.5" />
                        <span>{finding.officialRegulationNote}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-shrink-0 self-start sm:self-auto">
                    {getStatusBadge(finding.status)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* PANEL 2: INFRASTRUCTURE EVIDENCE REVIEW */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-indigo-700" />
              <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Infrastructure Evidence Review
              </h4>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                {evidenceList.length} items
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Photographs, architectural blueprints, statutory certificates, and video walkthrough submissions.
            </p>
          </div>

          {/* Evidence Category Filter */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(
              [
                { id: 'ALL', label: 'All Categories' },
                { id: 'CAMPUS_EXTERIOR', label: 'Campus & Exterior' },
                { id: 'CLASSROOM_PHOTO', label: 'Classrooms' },
                { id: 'LABORATORY_PHOTO', label: 'Labs & Workshops' },
                { id: 'LIBRARY_PHOTO', label: 'Library' },
                { id: 'COMPUTER_CENTRE_PHOTO', label: 'Computer Labs' },
                { id: 'FACULTY_ROOM_PHOTO', label: 'Faculty Rooms' },
                { id: 'SANITATION_WATER_PHOTO', label: 'Sanitation & Water' },
                { id: 'ACCESSIBILITY_SAFETY_PHOTO', label: 'Safety & PwD' },
                { id: 'FLOOR_PLAN_DRAWING', label: 'Floor Plans' },
                { id: 'OTHER_INFRASTRUCTURE_EVIDENCE', label: 'Other' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setEvidenceFilter(cat.id as any)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                  evidenceFilter === cat.id
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Global Visual Analysis Disclaimer */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2 text-xs text-blue-900">
          <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Visual Evidence Disclaimer:</strong> {VISUAL_ANALYSIS_DISCLAIMER}
          </p>
        </div>

        {/* Evidence Grid */}
        {filteredEvidence.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
            No infrastructure evidence items attached for the selected category.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredEvidence.map((item) => {
              const isVideo =
                item.evidenceCategory === 'WALKTHROUGH_VIDEO' ||
                item.isUnsupportedMedia ||
                (item.fileType && item.fileType.startsWith('video/'));
              const isPdf =
                item.evidenceCategory === 'FLOOR_PLAN_DRAWING' ||
                item.fileType?.includes('pdf') ||
                item.fileName?.toLowerCase().endsWith('.pdf');

              return (
                <div
                  key={item.id}
                  className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white hover:border-slate-300 transition-all shadow-2xs flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isVideo ? (
                          <div className="p-2 rounded-lg bg-rose-50 text-rose-700">
                            <Video className="w-5 h-5" />
                          </div>
                        ) : isPdf ? (
                          <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700">
                            <Layers className="w-5 h-5" />
                          </div>
                        ) : (
                          <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
                            <Camera className="w-5 h-5" />
                          </div>
                        )}
                        <div>
                          <h5 className="font-bold text-slate-900 text-xs">{item.title}</h5>
                          <p className="text-[11px] text-slate-500 font-mono">
                            {item.fileName} • {item.fileSize || 'N/A'}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveEvidence(item.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        title="Remove evidence"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Metadata Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-700">
                        {(item.evidenceCategory || 'EVIDENCE').replace(/_/g, ' ')}
                      </span>
                      {item.applicationTrack && (
                        <span className="px-2 py-0.5 rounded font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {item.applicationTrack === 'NEW_APPROVAL' ? 'New Approval Dossier' : 'EoA Dossier'}
                        </span>
                      )}
                      {item.uploadedByRole && (
                        <span className="px-2 py-0.5 rounded font-medium bg-slate-100 text-slate-600">
                          {item.uploadedByRole === 'admin' ? 'Uploaded by Admin' : 'Submitted by College'}
                        </span>
                      )}
                      {item.requirementId && (
                        <span className="px-2 py-0.5 rounded font-mono bg-blue-50 text-blue-800">
                          {item.requirementId}
                        </span>
                      )}
                      {/* Review Status Badge */}
                      {item.status === 'ACCEPTED' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle className="w-2.5 h-2.5" /> Accepted
                        </span>
                      ) : item.status === 'FLAGGED' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800 border border-rose-300">
                          <AlertCircle className="w-2.5 h-2.5" /> Flagged
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          <Clock className="w-2.5 h-2.5" /> Pending Review
                        </span>
                      )}
                    </div>

                    {/* Thumbnail & Observable Details */}
                    {item.fileDataUrl ? (
                      <div className="flex gap-3 items-start">
                        {isPdf ? (
                          <div
                            onClick={() => setPreviewItem(item)}
                            className="w-20 h-20 rounded-lg border border-indigo-200 bg-indigo-50/70 flex flex-col items-center justify-center p-1.5 text-indigo-700 cursor-pointer hover:bg-indigo-100 transition-colors flex-shrink-0 text-center"
                            title="Click to inspect PDF blueprint"
                          >
                            <Layers className="w-6 h-6 mb-1 text-indigo-600" />
                            <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-800">
                              PDF Drawing
                            </span>
                          </div>
                        ) : (
                          <div
                            onClick={() => setPreviewItem(item)}
                            className="relative group w-20 h-20 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0 cursor-pointer shadow-xs bg-slate-100"
                            title="Click to view full preview"
                          >
                            <img
                              src={item.fileDataUrl}
                              alt={item.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                              <Eye className="w-4 h-4" />
                            </div>
                          </div>
                        )}

                        <div className="flex-1 space-y-1">
                          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                            <p className="font-semibold text-slate-800 text-[11px]">Observable Details:</p>
                            <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-3">
                              {item.visualAnalysisSummary || 'Visual evidence attached for scrutiny review.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : isVideo ? (
                      /* VIDEO HANDLING: Unsupported Message & Documented Manual Review Workflow */
                      <div className="space-y-2 pt-1">
                        <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-lg text-xs text-rose-900 space-y-1">
                          <p className="font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
                            <span>Unsupported Video Stream Format</span>
                          </p>
                          <p className="text-[11px] leading-relaxed text-rose-800">
                            {UNSUPPORTED_VIDEO_ANALYSIS_MESSAGE}
                          </p>
                        </div>

                        {/* Documented Manual Review Instructions */}
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 space-y-1.5">
                          <p className="font-bold text-[11px] text-slate-900 uppercase tracking-wider">
                            Documented Manual Video Review Workflow:
                          </p>
                          <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-slate-600">
                            <li>Check continuous unbroken camera movement from campus entrance to labs.</li>
                            <li>Confirm prominent physical signage displays "{application?.collegeName || 'Institution'}".</li>
                            <li>Verify instructional computer terminals and laboratory equipment match declarations.</li>
                            <li>Ensure emergency exit pathways and fire suppression gear are clearly visible.</li>
                          </ol>

                          <div className="pt-2 flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(reviewedVideos[item.id])}
                                onChange={(e) =>
                                  setReviewedVideos((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.checked,
                                  }))
                                }
                                className="w-3.5 h-3.5 text-blue-600 rounded"
                              />
                              <span className="text-[11px] font-semibold text-slate-800">
                                Scrutiny Officer Manual Inspection Completed
                              </span>
                            </label>
                            {reviewedVideos[item.id] && (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                                Verified Manually
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* PHOTO / BLUEPRINT OBSERVATIONS (no fileDataUrl) */
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                        <p className="font-semibold text-slate-800 text-[11px]">Observable Details:</p>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          {item.visualAnalysisSummary ||
                            'Standard architectural submission attached. Verified by institutional representative.'}
                        </p>
                      </div>
                    )}

                    {/* Existing Review Remarks (if any) */}
                    {(item.status === 'ACCEPTED' || item.status === 'FLAGGED' || item.reviewerRemarks) && (
                      <div
                        className={`p-2.5 rounded-lg border text-xs space-y-0.5 ${
                          item.status === 'ACCEPTED'
                            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                            : 'bg-rose-50/60 border-rose-200 text-rose-900'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold text-[11px]">
                          <span>
                            Officer Review: {item.status === 'ACCEPTED' ? 'Accepted' : 'Flagged for Follow-up'}
                          </span>
                          {item.reviewedAt && (
                            <span className="font-normal text-slate-500 text-[10px]">
                              {new Date(item.reviewedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {item.reviewerRemarks && (
                          <p className="text-[11px] italic">"{item.reviewerRemarks}"</p>
                        )}
                        {item.reviewedBy && (
                          <p className="text-[10px] text-slate-500 font-medium">
                            — Reviewed by {item.reviewedBy}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isSubmittingReview}
                        onClick={() => handleReviewEvidence(item, 'ACCEPTED')}
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors shadow-2xs ${
                          item.status === 'ACCEPTED'
                            ? 'bg-emerald-700 text-white'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                        }`}
                        title="Mark evidence as Accepted"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Accept</span>
                      </button>
                      <button
                        type="button"
                        disabled={isSubmittingReview}
                        onClick={() => {
                          setReviewModalItem(item);
                          setReviewStatusInput('FLAGGED');
                          setReviewRemarksInput(item.reviewerRemarks || '');
                        }}
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors shadow-2xs ${
                          item.status === 'FLAGGED'
                            ? 'bg-rose-700 text-white'
                            : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                        }`}
                        title="Flag evidence with remarks"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Flag</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* PANEL 5: OFFICER REVIEW STATUS & DECISION FORM */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-indigo-700" />
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Scrutiny Committee Inspection Decision & Audit Trail
            </h4>
          </div>
          <p className="text-xs text-slate-500">
            Advisory system outputs must be ratified or modified by authorized AICTE scrutiny officers.
          </p>
        </div>

        {/* Existing Decision Card (if any recorded) */}
        {assessment?.officerDecision && (
          <div className="p-4 bg-slate-900 text-white rounded-xl space-y-2 border border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500 text-white">
                  {(assessment.officerDecision.decision || 'INSPECTION_MANDATED').replace(/_/g, ' ')}
                </span>
                <span className="text-xs text-slate-300">
                  Recorded by <strong>{assessment.officerDecision.officerName || 'Officer'}</strong> ({assessment.officerDecision.officerRole || 'Scrutiny Officer'})
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {assessment.officerDecision.recordedAt ? new Date(assessment.officerDecision.recordedAt).toLocaleString() : 'Recently'}
              </span>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">
              <strong>Official Remarks:</strong> {assessment.officerDecision.remarks || 'No remarks recorded.'}
            </p>
            {assessment.officerDecision.followUpAction && (
              <p className="text-xs text-indigo-300">
                <strong>Follow-Up Directive:</strong> {assessment.officerDecision.followUpAction}
              </p>
            )}
          </div>
        )}

        {/* Form to Record / Update Official Decision */}
        <form onSubmit={handleRecordDecision} className="space-y-4 pt-2">
          <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Record Official Scrutiny Decision
          </h5>

          {/* Decision Options */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                value: 'INSPECTION_MANDATED',
                title: 'Mandate Physical Inspection',
                desc: 'Depute Expert Visit Committee (EVC) for on-site physical measurement and verification.',
                color: 'hover:border-amber-400',
              },
              {
                value: 'DESK_VERIFICATION_ACCEPTED',
                title: 'Accept Desk Verification',
                desc: 'Satisfied with documentary proofs & photos. Waive physical inspection for this cycle.',
                color: 'hover:border-emerald-400',
              },
              {
                value: 'CLARIFICATION_REQUIRED',
                title: 'Request Clarification Memo',
                desc: 'Issue notice to institution to resolve architectural or compliance variance.',
                color: 'hover:border-blue-400',
              },
            ].map((opt) => (
              <label
                key={opt.value}
                className={`p-3.5 border rounded-xl cursor-pointer transition-all flex flex-col justify-between space-y-1.5 ${
                  selectedDecision === opt.value
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-xs'
                    : `border-slate-200 bg-white ${opt.color}`
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">{opt.title}</span>
                  <input
                    type="radio"
                    name="decision"
                    value={opt.value}
                    checked={selectedDecision === opt.value}
                    onChange={() => setSelectedDecision(opt.value as any)}
                    className="w-3.5 h-3.5 text-indigo-600"
                  />
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">{opt.desc}</p>
              </label>
            ))}
          </div>

          {/* Remarks Textarea */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">
              Official Scrutiny Remarks & Findings <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={officerRemarks}
              onChange={(e) => setOfficerRemarks(e.target.value)}
              rows={3}
              placeholder="Detail specific observations, justification for physical inspection or acceptance, and notes for the regional committee..."
              className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              required
            />
          </div>

          {/* Follow-up Action Input */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">
              Follow-up Action Directive (Optional)
            </label>
            <input
              type="text"
              value={officerFollowUp}
              onChange={(e) => setOfficerFollowUp(e.target.value)}
              placeholder="e.g. Schedule Regional EVC visit for Block A measurement within 14 calendar days"
              className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmittingDecision}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
          >
            <UserCheck className="w-4 h-4" />
            <span>{isSubmittingDecision ? 'Recording Decision...' : 'Record Official Scrutiny Decision'}</span>
          </button>
        </form>

        {/* Audit Trail for Infrastructure Events */}
        {application?.auditLogs && application.auditLogs.length > 0 && (
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Infrastructure & Compliance Audit Trail
            </h5>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              {application.auditLogs
                .filter((log) =>
                  log?.action &&
                  [
                    'INFRASTRUCTURE_ASSESSMENT_RECORDED',
                    'INFRASTRUCTURE_EVIDENCE_ADDED',
                    'INFRASTRUCTURE_EVIDENCE_REMOVED',
                    'INFRASTRUCTURE_EVIDENCE_REVIEWED',
                  ].includes(log.action)
                )
                .map((log) => (
                  <div key={log.id || Math.random().toString()} className="p-3 text-xs space-y-1 hover:bg-slate-50">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-bold text-slate-800">
                        {String(log.action).replace(/_/g, ' ')}
                      </span>
                      <span className="font-mono">{log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}</span>
                    </div>
                    <p className="text-slate-700 leading-relaxed text-[11px]">{log.details}</p>
                    <p className="text-[10px] text-slate-400">Actor: {log.actor} ({log.actorRole})</p>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* MODAL: ADD INFRASTRUCTURE EVIDENCE */}
      {showAddEvidenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-indigo-700" />
                <h4 className="text-sm font-bold text-slate-900">Attach Infrastructure Evidence</h4>
              </div>
              <button
                onClick={() => setShowAddEvidenceModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddEvidence} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">Evidence Title *</label>
                <input
                  type="text"
                  required
                  value={newEvidenceTitle}
                  onChange={(e) => setNewEvidenceTitle(e.target.value)}
                  placeholder="e.g. Mechanical Engineering Workshop Floor Photo"
                  className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block">Category *</label>
                  <select
                    value={newEvidenceCategory}
                    onChange={(e) => setNewEvidenceCategory(e.target.value as any)}
                    className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="CAMPUS_EXTERIOR">Campus & Building Exterior</option>
                    <option value="CLASSROOM_PHOTO">Classroom Photo</option>
                    <option value="LABORATORY_PHOTO">Laboratory & Workshop Photo</option>
                    <option value="LIBRARY_PHOTO">Library & Reading Room</option>
                    <option value="COMPUTER_CENTRE_PHOTO">Computer Centre / Labs</option>
                    <option value="FACULTY_ROOM_PHOTO">Faculty Cabins / Rooms</option>
                    <option value="SANITATION_WATER_PHOTO">Toilets, Sanitation & Water</option>
                    <option value="ACCESSIBILITY_SAFETY_PHOTO">Accessibility (PwD) & Safety</option>
                    <option value="FLOOR_PLAN_DRAWING">Building Floor Plan / Layout (PDF/Image)</option>
                    <option value="OTHER_INFRASTRUCTURE_EVIDENCE">Other Infrastructure Evidence</option>
                    <option value="WALKTHROUGH_VIDEO">Walkthrough Video</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block">Requirement Code</label>
                  <input
                    type="text"
                    value={newEvidenceReqId}
                    onChange={(e) => setNewEvidenceReqId(e.target.value)}
                    placeholder={isEoA ? 'e.g. REQ-EOA-006' : 'e.g. REQ-NEW-004'}
                    className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block">File Name *</label>
                  <input
                    type="text"
                    required
                    value={newEvidenceFileName}
                    onChange={(e) => setNewEvidenceFileName(e.target.value)}
                    placeholder="e.g. workshop_block_b.jpg"
                    className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block">File Size</label>
                  <input
                    type="text"
                    value={newEvidenceFileSize}
                    onChange={(e) => setNewEvidenceFileSize(e.target.value)}
                    placeholder="e.g. 3.2 MB"
                    className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">Scrutinizer / Evidence Notes</label>
                <textarea
                  value={newEvidenceNotes}
                  onChange={(e) => setNewEvidenceNotes(e.target.value)}
                  rows={2}
                  placeholder="Observable details or spatial references..."
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddEvidenceModal(false)}
                  className="px-4 py-2 border rounded-lg font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm"
                >
                  Attach & Re-evaluate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PREVIEW INFRASTRUCTURE EVIDENCE */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-indigo-700" />
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{previewItem.title}</h4>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {previewItem.fileName} • {previewItem.fileSize || 'N/A'} • {previewItem.evidenceCategory.replace(/_/g, ' ')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewItem(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {/* Media Content */}
            <div className="bg-slate-950 rounded-xl p-2 flex items-center justify-center min-h-[240px] max-h-[460px] overflow-hidden">
              {previewItem.fileDataUrl ? (
                previewItem.fileType?.includes('pdf') || previewItem.fileName?.toLowerCase().endsWith('.pdf') ? (
                  <div className="text-center p-8 text-white space-y-3">
                    <Layers className="w-16 h-16 text-indigo-400 mx-auto" />
                    <div>
                      <p className="text-sm font-bold">Architectural Blueprint / Layout Document</p>
                      <p className="text-xs text-slate-300 font-mono mt-1">{previewItem.fileName}</p>
                    </div>
                    <a
                      href={previewItem.fileDataUrl}
                      download={previewItem.fileName}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Download / Open PDF Blueprint</span>
                    </a>
                  </div>
                ) : (
                  <img
                    src={previewItem.fileDataUrl}
                    alt={previewItem.title}
                    className="max-h-[440px] w-auto max-w-full object-contain rounded-lg"
                  />
                )
              ) : (
                <div className="text-center p-8 text-slate-300 space-y-2">
                  <Camera className="w-12 h-12 text-slate-500 mx-auto" />
                  <p className="text-xs">No media preview available for this simulated item.</p>
                </div>
              )}
            </div>

            {/* Observable details */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              <span className="font-bold text-slate-800 text-[11px] block">AICTE Regulatory Observation:</span>
              <p className="text-slate-700 leading-relaxed text-[11px]">
                {previewItem.visualAnalysisSummary || 'Standard submission attached. Verified by institutional representative.'}
              </p>
            </div>

            {/* Review Status & Actions in Preview Modal */}
            <div className="p-4 bg-slate-100 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Officer Scrutiny Decision:
                </span>
                {previewItem.status === 'ACCEPTED' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <CheckCircle className="w-3.5 h-3.5" /> Accepted
                  </span>
                ) : previewItem.status === 'FLAGGED' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                    <AlertCircle className="w-3.5 h-3.5" /> Flagged
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    <Clock className="w-3.5 h-3.5" /> Pending Review
                  </span>
                )}
              </div>

              {previewItem.reviewerRemarks && (
                <p className="text-xs italic text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200">
                  "{previewItem.reviewerRemarks}"
                  {previewItem.reviewedBy && (
                    <span className="block not-italic text-[10px] text-slate-400 mt-1">
                      — {previewItem.reviewedBy} on {new Date(previewItem.reviewedAt || Date.now()).toLocaleDateString()}
                    </span>
                  )}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isSubmittingReview}
                  onClick={() => handleReviewEvidence(previewItem, 'ACCEPTED')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Accept Evidence</span>
                </button>
                <button
                  type="button"
                  disabled={isSubmittingReview}
                  onClick={() => {
                    setReviewModalItem(previewItem);
                    setReviewStatusInput('FLAGGED');
                    setReviewRemarksInput(previewItem.reviewerRemarks || '');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors"
                >
                  <AlertCircle className="w-4 h-4" />
                  <span>Flag / Add Remarks</span>
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setPreviewItem(null)}
                className="px-4 py-1.5 text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: OFFICER REVIEW REMARKS */}
      {reviewModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-700" />
                <h4 className="text-sm font-bold text-slate-900">Scrutiny Review & Remarks</h4>
              </div>
              <button
                onClick={() => setReviewModalItem(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="text-xs space-y-3">
              <p className="text-slate-600">
                Reviewing <strong>{reviewModalItem.title}</strong> ({reviewModalItem.evidenceCategory.replace(/_/g, ' ')})
              </p>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">Review Decision *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewStatusInput('ACCEPTED')}
                    className={`py-2 px-3 rounded-lg font-bold border flex items-center justify-center gap-1.5 transition-colors ${
                      reviewStatusInput === 'ACCEPTED'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Accept</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewStatusInput('FLAGGED')}
                    className={`py-2 px-3 rounded-lg font-bold border flex items-center justify-center gap-1.5 transition-colors ${
                      reviewStatusInput === 'FLAGGED'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <AlertCircle className="w-4 h-4" />
                    <span>Flag Evidence</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 block">Officer Remarks / Instructions</label>
                <textarea
                  rows={3}
                  value={reviewRemarksInput}
                  onChange={(e) => setReviewRemarksInput(e.target.value)}
                  placeholder="Enter remarks, e.g. Deficient lighting or missing safety signage noticed..."
                  className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setReviewModalItem(null)}
                  className="px-3 py-1.5 rounded-lg font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmittingReview}
                  onClick={() => handleReviewEvidence(reviewModalItem, reviewStatusInput, reviewRemarksInput)}
                  className="px-4 py-1.5 rounded-lg font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  {isSubmittingReview ? 'Saving...' : 'Save Decision'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
