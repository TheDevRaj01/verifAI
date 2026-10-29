import React, { useState, useEffect } from 'react';
import { CollegeApplication, RequiredDocument, ApplicationStatus, ChecklistRequirement } from '../../types';
import {
  reviewApplicationDocument,
  updateApplicationStatus,
  getApplicationFileBlob,
  getApplicationById,
  getChecklistRequirements,
} from '../../services/dataService';
import {
  X,
  Building2,
  FileText,
  CheckCircle,
  AlertTriangle,
  Clock,
  MapPin,
  Calendar,
  Layers,
  ShieldCheck,
  Award,
  Eye,
  Check,
  AlertCircle,
  History,
  Download,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Copy,
} from 'lucide-react';
import { DocumentOcrViewer } from './DocumentOcrViewer';
import { getSampleDocumentPdfDataUrl } from '../../services/sampleDocumentGenerator';
import { RegulatoryComplianceSection } from './RegulatoryComplianceSection';
import { AuthorityVerificationSection } from './AuthorityVerificationSection';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface Props {
  application: CollegeApplication;
  onClose: () => void;
  onUpdate?: () => void;
}

export const ApplicationDetailModal: React.FC<Props> = ({ application: initialApp, onClose, onUpdate }) => {
  const [app, setApp] = useState<CollegeApplication>(initialApp);
  const [activeTab, setActiveTab] = useState<'documents' | 'compliance' | 'authority' | 'audit' | 'overview'>('documents');
  const [viewingDoc, setViewingDoc] = useState<RequiredDocument | null>(null);
  const [replacementPromptDoc, setReplacementPromptDoc] = useState<RequiredDocument | null>(null);
  const [replacementRemarks, setReplacementRemarks] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);
  const [statusChangeRemark, setStatusChangeRemark] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [blobLoading, setBlobLoading] = useState(false);
  const [loadedBlobUrl, setLoadedBlobUrl] = useState<string | null>(null);
  const [checklistReqs, setChecklistReqs] = useState<ChecklistRequirement[]>([]);

  useEffect(() => {
    if (initialApp?.id) {
      getApplicationById(initialApp.id, true)
        .then((fresh) => {
          if (fresh) setApp(fresh);
        })
        .catch((err) => console.warn('[VerifAI] Failed to refresh application detail:', err));

      getChecklistRequirements(initialApp.type, false)
        .then((reqs) => {
          setChecklistReqs(reqs);
        })
        .catch((err) => console.warn('[VerifAI] Failed to load checklist requirements in modal:', err));
    }
  }, [initialApp?.id, initialApp?.type]);

  useEffect(() => {
    if (!viewingDoc) {
      setLoadedBlobUrl(null);
      return;
    }
    if (viewingDoc.fileDataUrl || viewingDoc.fileUrl) {
      setLoadedBlobUrl(viewingDoc.fileUrl || viewingDoc.fileDataUrl || null);
      return;
    }
    if (viewingDoc.fileBlobId) {
      setBlobLoading(true);
      getApplicationFileBlob(app.id, viewingDoc.fileBlobId)
        .then((url) => {
          if (url) {
            setLoadedBlobUrl(url);
          } else {
            const sampleUrl = getSampleDocumentPdfDataUrl(
              viewingDoc.requirementId || viewingDoc.id,
              viewingDoc.name,
              app.collegeName,
              app.academicYear
            );
            setLoadedBlobUrl(sampleUrl);
          }
        })
        .catch((err) => {
          console.warn('[VerifAI] Failed to load document blob:', err);
          const sampleUrl = getSampleDocumentPdfDataUrl(
            viewingDoc.requirementId || viewingDoc.id,
            viewingDoc.name,
            app.collegeName,
            app.academicYear
          );
          setLoadedBlobUrl(sampleUrl);
        })
        .finally(() => {
          setBlobLoading(false);
        });
    } else {
      const sampleUrl = getSampleDocumentPdfDataUrl(
        viewingDoc.requirementId || viewingDoc.id,
        viewingDoc.name,
        app.collegeName,
        app.academicYear
      );
      setLoadedBlobUrl(sampleUrl);
    }
  }, [viewingDoc, app.id, app.collegeName, app.academicYear]);

  const handleAcceptDoc = async (doc: RequiredDocument) => {
    if (app.status === 'Draft') {
      setErrorMsg('Action Prohibited: Cannot accept documents for an application in "Draft" status. The institution must submit the application before official review.');
      return;
    }
    setLoadingAction(true);
    setErrorMsg(null);
    try {
      const updated = await reviewApplicationDocument(app.id, doc.id, {
        status: 'Accepted',
        remarks: 'Approved by AICTE Scrutiny Officer',
      });
      setApp(updated);
      setSuccessMsg(`Document "${doc.name}" marked as Accepted.`);
      if (onUpdate) onUpdate();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update document status.');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleOpenReplacementModal = (doc: RequiredDocument) => {
    if (app.status === 'Draft') {
      setErrorMsg('Action Prohibited: Cannot request replacements for an application in "Draft" status. The institution must submit the application before official review.');
      return;
    }
    setReplacementPromptDoc(doc);
    setReplacementRemarks(doc.adminRemarks || '');
    setErrorMsg(null);
  };

  const handleConfirmReplacement = async () => {
    if (!replacementPromptDoc) return;
    if (app.status === 'Draft') {
      setErrorMsg('Action Prohibited: Cannot request replacements for an application in "Draft" status. The institution must submit the application before official review.');
      return;
    }
    if (!replacementRemarks.trim()) {
      setErrorMsg('Mandatory: Please provide a specific reason for requesting document replacement.');
      return;
    }

    setLoadingAction(true);
    setErrorMsg(null);
    try {
      const updated = await reviewApplicationDocument(app.id, replacementPromptDoc.id, {
        status: 'Replacement Required',
        remarks: replacementRemarks.trim(),
      });
      setApp(updated);
      setSuccessMsg(`Replacement requested for "${replacementPromptDoc.name}". Remarks saved.`);
      setReplacementPromptDoc(null);
      setReplacementRemarks('');
      if (onUpdate) onUpdate();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit replacement request.');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleChangeApplicationStatus = async (newStatus: ApplicationStatus) => {
    if (app.status === 'Draft' && (newStatus === 'Documents Verified' || newStatus === 'Approved')) {
      setErrorMsg(`Action Prohibited: Cannot transition a "Draft" application to "${newStatus}". The institution must submit the application first.`);
      return;
    }

    // Validate if attempting to approve an application with issues
    const hasReplacementRequired = app.documents.some((d) => d.status === 'Replacement Required');
    if (newStatus === 'Approved' && hasReplacementRequired) {
      setErrorMsg('Cannot approve application: One or more documents currently require replacement.');
      return;
    }

    setLoadingAction(true);
    setErrorMsg(null);
    try {
      const updated = await updateApplicationStatus(app.id, newStatus, statusChangeRemark);
      setApp(updated);
      setSuccessMsg(`Application status updated to "${newStatus}".`);
      setStatusChangeRemark('');
      if (onUpdate) onUpdate();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update application status.');
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                app.type === 'EOA' ? 'bg-blue-600 text-white' : 'bg-indigo-600 text-white'
              }`}>
                {app.type === 'EOA' ? 'Extension of Approval (EoA)' : 'New Approval Application'}
              </span>
              <span className="font-mono text-xs text-slate-400">
                Ref: {app.id}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                app.status === 'Approved'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : app.status === 'Clarification Requested'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
              }`}>
                Status: {app.status}
              </span>
            </div>
            <h3 className="text-lg font-bold text-white">
              {app.collegeName}
            </h3>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-sky-400" />
              <span>{app.district}, {app.state}</span>
              <span>•</span>
              <span className="font-mono text-sky-300">AICTE ID: {app.collegeId}</span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notifications */}
        {errorMsg && (
          <div className="px-6 py-2.5 bg-rose-50 border-b border-rose-200 text-xs text-rose-800 flex items-center justify-between font-medium">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="p-0.5 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="px-6 py-2.5 bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-800 flex items-center justify-between font-medium">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="p-0.5 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-6 pt-3 gap-4 text-xs font-semibold bg-slate-50">
          <button
            onClick={() => setActiveTab('documents')}
            className={`pb-2.5 px-1 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'documents'
                ? 'border-blue-700 text-blue-800 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Document Scrutiny ({app.documents.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('compliance')}
            className={`pb-2.5 px-1 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'compliance'
                ? 'border-blue-700 text-blue-800 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Regulatory & Infrastructure Compliance</span>
            {app.regulatoryComplianceAssessment?.discrepancies && app.regulatoryComplianceAssessment.discrepancies.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                {app.regulatoryComplianceAssessment.discrepancies.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('authority')}
            className={`pb-2.5 px-1 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'authority'
                ? 'border-blue-700 text-blue-800 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Award className="w-4 h-4 text-indigo-600" />
            <span>Original Issuing Authority</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-2.5 px-1 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'border-blue-700 text-blue-800 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Audit History ({app.auditLogs?.length || 0})</span>
          </button>
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-2.5 px-1 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'border-blue-700 text-blue-800 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Institution Overview</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto">
          {/* TAB 1: Document Scrutiny */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              {app.status === 'Draft' && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold">Draft Application — Pre-Submission Inspection Only</p>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      This application is currently in <strong>Draft</strong> status and has not yet been submitted by the institution.
                      You may inspect uploaded proofs, but review decisions (Accept / Request Replacement) and scrutiny approval are locked until the institution formally submits the application.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Submitted Compliance Documents
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Inspect uploaded proofs, verify against norms, and approve or request replacements with remarks.
                  </p>
                </div>
              </div>

              {app.documents.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 border border-slate-200 rounded-xl bg-slate-50">
                  No documents attached to this application dossier yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {app.documents.map((doc) => {
                    const hasFile = Boolean(doc.fileName && doc.status !== 'NOT_UPLOADED');
                    return (
                      <div key={doc.id} className="p-4 space-y-2 text-xs hover:bg-slate-50/50 transition-colors">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          {/* Left: Document info */}
                          <div className="space-y-1 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <FileText className="w-4 h-4 text-blue-700 flex-shrink-0" />
                              <span className="font-bold text-slate-900">{doc.name}</span>
                              {doc.isMandatory && (
                                <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.2 rounded font-medium">
                                  Mandatory
                                </span>
                              )}
                              <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.2 rounded font-medium">
                                {doc.category}
                              </span>
                            </div>

                            {hasFile ? (
                              <p className="text-[11px] text-slate-500">
                                File: <code className="text-slate-800 font-mono font-semibold">{doc.fileName}</code> ({doc.fileSize || 'N/A'})
                                {doc.uploadDate && <span> • Uploaded on: {doc.uploadDate}</span>}
                                {doc.version && doc.version > 1 && (
                                  <span className="text-blue-700 font-bold ml-1">(Version {doc.version})</span>
                                )}
                              </p>
                            ) : (
                              <p className="text-[11px] text-amber-700 font-medium">
                                ⚠ Document has not been uploaded by the institution.
                              </p>
                            )}

                            {/* Officer remarks if present */}
                            {doc.adminRemarks && (
                              <div className={`p-2 rounded-lg text-[11px] flex items-start gap-1.5 ${
                                doc.status === 'Replacement Required'
                                  ? 'bg-rose-50 border border-rose-200 text-rose-800'
                                  : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                              }`}>
                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                <div>
                                  <strong>Officer Remarks ({doc.reviewedBy || 'AICTE'}):</strong> {doc.adminRemarks}
                                  {doc.reviewedAt && <span className="text-slate-400 text-[10px] ml-1">({doc.reviewedAt})</span>}
                                </div>
                              </div>
                            )}

                            {doc.aiVerificationNote && (
                              <div className="bg-slate-50 border border-slate-200 p-2 rounded-lg text-[11px] text-slate-700 flex items-start gap-1.5">
                                <ShieldCheck className="w-3.5 h-3.5 text-blue-700 flex-shrink-0 mt-0.5" />
                                <span><strong>AI Pre-Audit Note:</strong> {doc.aiVerificationNote}</span>
                              </div>
                            )}

                            {/* Duplicate Document Advisory Alert */}
                            {doc.duplicateCheckResult && doc.duplicateCheckResult.status !== 'UNIQUE' && (
                              <div
                                className={`p-2 rounded-lg text-[11px] flex items-start gap-1.5 ${
                                  doc.duplicateCheckResult.status === 'EXACT_DUPLICATE'
                                    ? 'bg-rose-50 border border-rose-200 text-rose-800'
                                    : doc.duplicateCheckResult.status === 'LIKELY_DUPLICATE'
                                    ? 'bg-amber-50 border border-amber-200 text-amber-800'
                                    : 'bg-yellow-50 border border-yellow-200 text-yellow-800'
                                }`}
                              >
                                <Copy className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <strong>Duplicate Advisory:</strong>
                                    <span className="font-bold text-[9px] uppercase px-1.5 py-0.2 rounded bg-white/70 border border-current">
                                      {doc.duplicateCheckResult.status.replace('_', ' ')}
                                    </span>
                                  </div>
                                  <p className="leading-tight">{doc.duplicateCheckResult.overallReason}</p>
                                  <span className="text-[10px] block opacity-75 italic">
                                    Officer decision support only • Final determination rests with reviewing officer.
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Right: Status badge & Actions */}
                          <div className="flex flex-col sm:items-end gap-1.5 flex-shrink-0">
                            <div className="flex flex-wrap items-center gap-1">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                doc.status === 'Accepted' || doc.status === 'Validated'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : doc.status === 'Replacement Required' || doc.status === 'Flagged'
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : doc.status === 'Uploaded'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                {doc.status === 'Uploaded' ? 'Awaiting Review' : doc.status}
                              </span>

                              {doc.duplicateCheckResult && doc.duplicateCheckResult.status !== 'UNIQUE' && (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                    doc.duplicateCheckResult.status === 'EXACT_DUPLICATE'
                                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                                      : doc.duplicateCheckResult.status === 'LIKELY_DUPLICATE'
                                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                                      : 'bg-yellow-100 text-yellow-800 border-yellow-300'
                                  }`}
                                >
                                  {doc.duplicateCheckResult.status.replace('_', ' ')}
                                </span>
                              )}

                              {doc.authorityVerificationResult && (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                    doc.authorityVerificationResult.isManualReview && doc.authorityVerificationResult.status === 'VERIFIED'
                                      ? 'bg-emerald-100 text-emerald-900 border-emerald-400 font-black'
                                      : doc.authorityVerificationResult.status === 'VERIFIED'
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                      : doc.authorityVerificationResult.status === 'DETAILS_MISMATCH' ||
                                        doc.authorityVerificationResult.status === 'RECORD_NOT_FOUND'
                                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                                      : doc.authorityVerificationResult.status === 'EXPIRED'
                                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                                      : doc.authorityVerificationResult.status === 'MANUAL_REVIEW_REQUIRED'
                                      ? 'bg-orange-100 text-orange-800 border-orange-300'
                                      : 'bg-slate-100 text-slate-700 border-slate-300'
                                  }`}
                                >
                                  {doc.authorityVerificationResult.isManualReview && doc.authorityVerificationResult.status === 'VERIFIED'
                                    ? 'MANUALLY VERIFIED'
                                    : `Auth: ${doc.authorityVerificationResult.status.replace(/_/g, ' ')}`}
                                </span>
                              )}
                            </div>

                            {hasFile && (
                              <div className="flex items-center gap-1.5 pt-1">
                                <button
                                  onClick={() => setViewingDoc(doc)}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                                  title="Inspect file"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Inspect</span>
                                </button>

                                <button
                                  onClick={() => handleAcceptDoc(doc)}
                                  disabled={loadingAction || doc.status === 'Accepted' || app.status === 'Draft'}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                                    app.status === 'Draft'
                                      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                      : doc.status === 'Accepted'
                                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 opacity-60'
                                      : 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm'
                                  }`}
                                  title={app.status === 'Draft' ? 'Action disabled: Application is in Draft status' : 'Approve Document'}
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Accept</span>
                                </button>

                                <button
                                  onClick={() => handleOpenReplacementModal(doc)}
                                  disabled={loadingAction || app.status === 'Draft'}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shadow-sm ${
                                    app.status === 'Draft'
                                      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                      : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200'
                                  }`}
                                  title={app.status === 'Draft' ? 'Action disabled: Application is in Draft status' : 'Request Replacement with Remarks'}
                                >
                                  <AlertCircle className="w-3 h-3 text-rose-600" />
                                  <span>Request Replacement</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Missing / Un-uploaded Statutory Requirements */}
              {(() => {
                const missingReqs = checklistReqs.filter(
                  (req) =>
                    req.isActive &&
                    !app.documents?.some(
                      (d) =>
                        (d.id === req.id ||
                          d.requirementId === req.id ||
                          (d.name && req.title && d.name.trim().toLowerCase() === req.title.trim().toLowerCase())) &&
                        d.status !== 'NOT_UPLOADED' &&
                        Boolean(d.fileName)
                    )
                );

                if (missingReqs.length === 0) return null;

                return (
                  <div className="space-y-3 pt-3 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                          <span>Missing Statutory Requirements ({missingReqs.length})</span>
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Mandatory norm documents mandated for {app.type === 'EOA' ? 'Extension of Approval' : 'New Approval'} not yet submitted by institution.
                        </p>
                      </div>
                    </div>
                    <div className="divide-y divide-amber-200 border border-amber-200 rounded-xl overflow-hidden bg-amber-50/40">
                      {missingReqs.map((req) => (
                        <div key={req.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-amber-700 flex-shrink-0" />
                              <span className="font-bold text-slate-900">{req.title}</span>
                              {req.isMandatory && (
                                <span className="text-[10px] bg-rose-100 text-rose-800 border border-rose-200 px-1.5 py-0.2 rounded font-bold">
                                  Mandatory
                                </span>
                              )}
                              <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.2 rounded">
                                {req.category}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600">{req.description}</p>
                          </div>
                          <div className="flex-shrink-0">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              Pending Institution Upload
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB: Regulatory & Infrastructure Compliance */}
          {activeTab === 'compliance' && (
            <ErrorBoundary
              fallbackTitle="Regulatory & Infrastructure Compliance Section"
              fallbackMessage="An unexpected issue occurred while rendering the regulatory compliance assessment. All institution documents, scrutiny actions, and audit logs remain intact."
            >
              <RegulatoryComplianceSection
                application={app}
                onApplicationUpdate={(updatedApp) => {
                  setApp(updatedApp);
                  onUpdate?.();
                }}
              />
            </ErrorBoundary>
          )}

          {/* TAB: Original Issuing Authority Verification */}
          {activeTab === 'authority' && (
            <ErrorBoundary
              fallbackTitle="Original Issuing Authority Verification Section"
              fallbackMessage="An unexpected issue occurred while rendering the authority verification section. All institution documents, scrutiny actions, and audit logs remain intact."
            >
              <AuthorityVerificationSection
                application={app}
                onApplicationUpdate={(updatedApp) => {
                  setApp(updatedApp);
                  onUpdate?.();
                }}
              />
            </ErrorBoundary>
          )}

          {/* TAB 2: Audit History */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Application Scrutiny & Document Audit Trail
              </h4>

              {(!app.auditLogs || app.auditLogs.length === 0) ? (
                <div className="p-8 text-center text-xs text-slate-500 border border-slate-200 rounded-xl bg-slate-50">
                  No audit logs recorded for this dossier yet.
                </div>
              ) : (
                <div className="relative border-l-2 border-slate-200 ml-4 space-y-4 my-2">
                  {app.auditLogs.map((log) => (
                    <div key={log.id} className="relative pl-6">
                      <div className={`absolute -left-1.5 top-1.5 w-3 h-3 rounded-full border-2 border-white ${
                        log.actorRole === 'admin' ? 'bg-amber-600' : 'bg-blue-600'
                      }`} />
                      <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-900">
                            {log.action.replace('_', ' ')}
                          </span>
                          <span className="text-slate-400 font-mono">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-slate-700 leading-relaxed text-[11px]">
                          {log.details}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Actor: <strong className="text-slate-700">{log.actor}</strong> ({log.actorRole === 'admin' ? 'AICTE Scrutiny Officer' : 'College Representative'})
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] text-slate-400 font-medium">Scrutiny Status</span>
                  <p className="text-xs font-bold text-slate-900 mt-1">{app.status}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] text-slate-400 font-medium">Compliance Score</span>
                  <p className="text-xs font-bold text-emerald-700 mt-1">{app.complianceScore}%</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] text-slate-400 font-medium">Proposed Intake</span>
                  <p className="text-xs font-bold text-blue-900 mt-1">{app.intakeProposed} Seats</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] text-slate-400 font-medium">Academic Year</span>
                  <p className="text-xs font-bold text-slate-900 mt-1">{app.academicYear}</p>
                </div>
              </div>

              <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4 text-xs space-y-1.5">
                <p className="font-bold text-blue-950">Discipline / Program:</p>
                <p className="text-blue-900">{app.discipline}</p>
                {app.remarks && (
                  <p className="text-slate-600 pt-1">
                    <strong>Institution Remarks:</strong> {app.remarks}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Council Scrutiny Decision Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Award className="w-4 h-4 text-blue-700" />
              <span>Update Overall Application Scrutiny Status</span>
            </h4>
            <p className="text-[11px] text-slate-500">
              Note: Do not automatically approve applications merely because documents have been attached. Verify adherence to statutory land, faculty, and FDR requirements.
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              {(['Under Scrutiny', 'Documents Verified', 'Clarification Requested', 'Approved', 'Rejected'] as ApplicationStatus[]).map((st) => (
                <button
                  key={st}
                  disabled={loadingAction || app.status === st}
                  onClick={() => handleChangeApplicationStatus(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    app.status === st
                      ? 'bg-blue-900 text-white border-blue-900 cursor-default shadow-sm'
                      : st === 'Approved'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                      : st === 'Rejected'
                      ? 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between text-xs">
          <div className="text-[11px] text-slate-500">
            Last modified: {app.lastUpdated}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Close Inspection
          </button>
        </div>
      </div>

      {/* Document View / Inspection Modal */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                  {viewingDoc.category}
                </span>
                <h4 className="text-sm font-bold text-slate-900">{viewingDoc.name}</h4>
              </div>
              <button
                onClick={() => setViewingDoc(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400">File Name:</span>
                  <p className="font-mono font-bold text-slate-800 truncate" title={viewingDoc.fileName}>{viewingDoc.fileName || 'Not available'}</p>
                </div>
                <div>
                  <span className="text-slate-400">File Size:</span>
                  <p className="font-bold text-slate-800">{viewingDoc.fileSize || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Upload Date:</span>
                  <p className="font-bold text-slate-800">{viewingDoc.uploadDate || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Current Status:</span>
                  <p className="font-bold text-blue-700">{viewingDoc.status}</p>
                </div>
              </div>

              {/* Document display preview */}
                {(() => {
                  if (blobLoading) {
                    return (
                      <div className="py-6 flex flex-col items-center justify-center space-y-2">
                        <Clock className="w-6 h-6 text-blue-600 animate-spin" />
                        <p className="text-xs text-slate-600">Retrieving document from Cloud Firestore...</p>
                      </div>
                    );
                  }

                  const url = loadedBlobUrl || viewingDoc.fileUrl || viewingDoc.fileDataUrl;
                  const isImage = (url && url.startsWith('data:image')) ||
                    (viewingDoc.fileType && viewingDoc.fileType.toLowerCase().startsWith('image')) ||
                    /\.(jpe?g|png|webp|gif)$/i.test(viewingDoc.fileName || '');

                  if (url && isImage) {
                    return (
                      <img
                        src={url}
                        alt={viewingDoc.name}
                        className="max-h-60 mx-auto rounded border"
                      />
                    );
                  }

                  return (
                    <div className="py-4 space-y-2">
                      <FileText className="w-10 h-10 text-blue-600 mx-auto" />
                      <p className="font-bold text-slate-800 text-xs">
                        {viewingDoc.fileName || `${viewingDoc.name}.pdf`}
                      </p>
                      <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                        Authorized Scrutiny Dossier. Verified and indexed in AICTE Central Records.
                      </p>
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={viewingDoc.fileName || 'document.pdf'}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-800 hover:bg-blue-900 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>View / Download Original File</span>
                        </a>
                      )}
                    </div>
                  );
                })()}
            </div>

            {/* AI Document OCR & Text Intelligence Viewer */}
            <DocumentOcrViewer
              doc={{ ...viewingDoc, fileDataUrl: loadedBlobUrl || viewingDoc.fileUrl || viewingDoc.fileDataUrl }}
              appId={app.id}
              application={app}
              onOcrSaved={(updatedDoc) => {
                setViewingDoc(updatedDoc);
                setApp((prev) => ({
                  ...prev,
                  documents: prev.documents.map((d) =>
                    d.id === updatedDoc.id || d.requirementId === updatedDoc.id ? updatedDoc : d
                  ),
                }));
                if (onUpdate) onUpdate();
              }}
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setViewingDoc(null)}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-900"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replacement Request Modal */}
      {replacementPromptDoc && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 text-xs">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <h4 className="text-base font-bold text-slate-900">Request Document Replacement</h4>
            </div>

            <p className="text-slate-600 leading-relaxed text-[11px]">
              You are requesting a replacement for{' '}
              <strong className="text-slate-900">"{replacementPromptDoc.name}"</strong>.
              AICTE regulatory protocols mandate providing a clear, actionable reason to the institution.
            </p>

            <div className="space-y-1">
              <label className="font-bold text-slate-800">
                Reason / Clarification Required <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={replacementRemarks}
                onChange={(e) => setReplacementRemarks(e.target.value)}
                placeholder="e.g. The submitted fire NOC has expired. Please upload a renewal certificate issued by the competent authority with current validity..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-1 focus:ring-rose-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setReplacementPromptDoc(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReplacement}
                disabled={loadingAction || !replacementRemarks.trim()}
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-lg shadow disabled:opacity-50"
              >
                Submit Replacement Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
