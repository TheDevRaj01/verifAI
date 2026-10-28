import React, { useState } from 'react';
import type {
  CollegeApplication,
  RequiredDocument,
  AuthorityVerificationStatus,
  AuthorityFieldComparison,
  AuthorityVerificationRecord,
  IssuingAuthorityProfile,
} from '../../types/index.ts';
import {
  findAuthorityProfile,
  getAuthorityProfiles,
} from '../../services/issuingAuthorityVerificationService.ts';
import {
  verifyDocumentWithIssuingAuthority,
  recordManualAuthorityVerification,
  getActiveSession,
} from '../../services/dataService.ts';
import {
  Award,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ExternalLink,
  History,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  RefreshCw,
  Info,
  Check,
  X,
  UserCheck,
  Building,
  Scale,
  Globe,
  QrCode,
  FileText,
} from 'lucide-react';

interface Props {
  application: CollegeApplication;
  onApplicationUpdate?: (app: CollegeApplication) => void;
}

export const AuthorityVerificationSection: React.FC<Props> = ({
  application,
  onApplicationUpdate,
}) => {
  const session = getActiveSession();
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal states
  const [comparingDoc, setComparingDoc] = useState<RequiredDocument | null>(null);
  const [manualReviewDoc, setManualReviewDoc] = useState<RequiredDocument | null>(null);
  const [historyDoc, setHistoryDoc] = useState<RequiredDocument | null>(null);

  // Manual review form states (Guided Manual Verification)
  const [manualMethod, setManualMethod] = useState<'Official Portal' | 'QR' | 'Other'>('Official Portal');
  const [manualDecision, setManualDecision] = useState<'VERIFIED' | 'MISMATCH_FOUND' | 'UNABLE_TO_VERIFY'>('VERIFIED');
  const [manualOfficialSource, setManualOfficialSource] = useState<string>('');
  const [manualReferenceChecked, setManualReferenceChecked] = useState<string>('');
  const [manualRemarks, setManualRemarks] = useState<string>('');
  const [submittingManual, setSubmittingManual] = useState<boolean>(false);

  // Helper to extract reference / certificate number from OCR or prior checks
  const getDocumentReferenceNumber = (doc: RequiredDocument): string | null => {
    return (
      doc.authorityVerificationResult?.referenceNumberChecked ||
      doc.validationResult?.extractedFields?.certificateNumber ||
      doc.validationResult?.extractedFields?.udin ||
      doc.validationResult?.extractedFields?.specificDetails?.['Reference Number'] ||
      doc.validationResult?.extractedFields?.specificDetails?.['Certificate Number'] ||
      doc.validationResult?.extractedFields?.specificDetails?.['FDR Number'] ||
      doc.authorityVerificationHistory?.[0]?.referenceNumberChecked ||
      null
    );
  };

  // Helper to determine status badges
  const getStatusBadge = (status?: AuthorityVerificationStatus, isManual?: boolean) => {
    if (isManual && status === 'VERIFIED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-400 shadow-2xs tracking-tight">
          <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
          MANUALLY VERIFIED
        </span>
      );
    }
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            Verified (Test Vector)
          </span>
        );
      case 'DETAILS_MISMATCH':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            {isManual ? 'Mismatch Found (Manual)' : 'Details Mismatch'}
          </span>
        );
      case 'RECORD_NOT_FOUND':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Record Not Found
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Official Record Expired
          </span>
        );
      case 'MANUAL_REVIEW_REQUIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-300">
            <UserCheck className="w-3.5 h-3.5 text-orange-600" />
            {isManual ? 'Unable to Verify (Manual)' : 'Manual Review Required'}
          </span>
        );
      case 'NOT_CONFIGURED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <Info className="w-3.5 h-3.5 text-slate-500" />
            Integration Not Configured
          </span>
        );
      case 'SOURCE_UNAVAILABLE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <AlertCircle className="w-3.5 h-3.5 text-slate-500" />
            Official Portal Unavailable
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
            <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
            Verification Pending
          </span>
        );
      case 'VERIFICATION_FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
            Verification Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            Not Verified
          </span>
        );
    }
  };

  // Compute docs with matching profiles
  const docsWithProfiles = application.documents.map((doc) => {
    const profile = findAuthorityProfile(doc, application.type);
    return { doc, profile };
  });

  const verifiedCount = docsWithProfiles.filter(
    ({ doc }) => doc.authorityVerificationResult?.status === 'VERIFIED'
  ).length;

  const mismatchCount = docsWithProfiles.filter(
    ({ doc }) =>
      doc.authorityVerificationResult?.status === 'DETAILS_MISMATCH' ||
      doc.authorityVerificationResult?.status === 'RECORD_NOT_FOUND'
  ).length;

  const expiredCount = docsWithProfiles.filter(
    ({ doc }) => doc.authorityVerificationResult?.status === 'EXPIRED'
  ).length;

  const manualCount = docsWithProfiles.filter(
    ({ doc }) => doc.authorityVerificationResult?.status === 'MANUAL_REVIEW_REQUIRED'
  ).length;

  // Filter documents
  const filteredDocs = docsWithProfiles.filter(({ profile }) => {
    if (selectedFilter === 'ALL') return true;
    return profile?.authorityId === selectedFilter || profile?.department === selectedFilter;
  });

  // Action: Trigger verification
  const handleVerify = async (doc: RequiredDocument) => {
    setLoadingDocId(doc.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const updated = await verifyDocumentWithIssuingAuthority(application.id, doc.id);
      if (onApplicationUpdate) {
        onApplicationUpdate(updated);
      }
      const updatedDoc = updated.documents.find((d) => d.id === doc.id);
      const res = updatedDoc?.authorityVerificationResult;
      setSuccessMsg(
        `Verification executed for "${doc.name}": Status is "${res?.status || 'COMPLETED'}". ${res?.summary || ''}`
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to execute authority verification.');
    } finally {
      setLoadingDocId(null);
    }
  };

  // Action: Open guided manual review modal
  const handleOpenManualReview = (doc: RequiredDocument, profile?: IssuingAuthorityProfile | null) => {
    setManualReviewDoc(doc);
    setManualMethod('Official Portal');
    setManualDecision('VERIFIED');
    setManualOfficialSource(profile?.officialVerificationUrl || profile?.authorityName || 'Official Statutory Registry');
    const existingRef = getDocumentReferenceNumber(doc) || '';
    setManualReferenceChecked(existingRef);
    setManualRemarks('');
  };

  // Action: Submit manual review
  const handleSubmitManualReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualReviewDoc) return;
    if (!manualRemarks.trim()) {
      setErrorMsg('Mandatory Remarks required: Please record your verification findings and basis.');
      return;
    }
    if (!manualOfficialSource.trim()) {
      setErrorMsg('Official Source is required: State the portal, registry, or direct verification reference used.');
      return;
    }

    setSubmittingManual(true);
    setErrorMsg(null);
    try {
      const updated = await recordManualAuthorityVerification(
        application.id,
        manualReviewDoc.id,
        {
          decision: manualDecision,
          method: manualMethod,
          officialSourceUsed: manualOfficialSource.trim(),
          referenceNumberChecked: manualReferenceChecked.trim() || undefined,
          remarks: manualRemarks.trim(),
        }
      );
      if (onApplicationUpdate) {
        onApplicationUpdate(updated);
      }
      setSuccessMsg(
        `Manual verification recorded for "${manualReviewDoc.name}": Result marked as ${
          manualDecision === 'VERIFIED' ? 'MANUALLY VERIFIED' : manualDecision
        }.`
      );
      setManualReviewDoc(null);
      setManualRemarks('');
      setManualOfficialSource('');
      setManualReferenceChecked('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record manual review.');
    } finally {
      setSubmittingManual(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Safeguards Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-800 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                Statutory Authority Verification
              </span>
              <span className="text-xs text-slate-400">
                Track: {application.type === 'EOA' ? 'Extension of Approval' : 'New Approval'}
              </span>
            </div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-indigo-400" />
              Verification Through Original Issuing Authority
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
              Cross-verifies certificates against original statutory registries (ICAI UDIN, Fire Services, Land Revenue, Joint FDR Banks, Affiliating Universities). Results are established only through configured authority APIs, verified registries, or authorized administrator manual determinations.
            </p>
          </div>
        </div>

        {/* Safeguard Indicators */}
        <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300">
          <div className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Authentic Integrations:</strong> Never fabricates live verification. Unintegrated portals fallback to manual verification.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Scale className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Independent Decisions:</strong> QR extraction or signature presence alone does not establish official authenticity.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Building className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Full Audit Trail:</strong> Every automated inquiry and officer manual review is timestamped and recorded.
            </span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between font-medium">
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
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between font-medium">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="p-0.5 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Eligible Documents
          </span>
          <span className="text-xl font-bold text-slate-800 mt-0.5 block">
            {docsWithProfiles.length}
          </span>
        </div>

        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 shadow-sm">
          <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            Verified
          </span>
          <span className="text-xl font-bold text-emerald-900 mt-0.5 block">
            {verifiedCount}
          </span>
        </div>

        <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-3 shadow-sm">
          <span className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider block flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            Mismatches
          </span>
          <span className="text-xl font-bold text-rose-900 mt-0.5 block">
            {mismatchCount}
          </span>
        </div>

        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 shadow-sm">
          <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Expired / Flagged
          </span>
          <span className="text-xl font-bold text-amber-900 mt-0.5 block">
            {expiredCount}
          </span>
        </div>

        <div className="bg-orange-50/60 border border-orange-200 rounded-xl p-3 shadow-sm">
          <span className="text-[11px] font-semibold text-orange-800 uppercase tracking-wider block flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-orange-600" />
            Manual Review Req.
          </span>
          <span className="text-xl font-bold text-orange-900 mt-0.5 block">
            {manualCount}
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2 text-xs font-medium">
        <span className="text-slate-500 font-semibold mr-1">Filter Authority:</span>
        {[
          { key: 'ALL', label: 'All Documents' },
          { key: 'AUTH_FIRE_DEPT', label: 'Fire Department' },
          { key: 'AUTH_ICAI_UDIN', label: 'ICAI (UDIN)' },
          { key: 'AUTH_REVENUE_LAND', label: 'Land Revenue' },
          { key: 'AUTH_BANK_FDR', label: 'Scheduled Bank (FDR)' },
          { key: 'AUTH_STATE_DTE_UNIV', label: 'Affiliating University' },
          { key: 'AUTH_PWD_STRUCTURAL', label: 'PWD / Municipal' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setSelectedFilter(f.key)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              selectedFilter === f.key
                ? 'bg-blue-700 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Documents List */}
      <div className="space-y-4">
        {filteredDocs.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
            <p className="text-sm font-medium text-slate-600">No documents match the selected authority filter.</p>
          </div>
        ) : (
          filteredDocs.map(({ doc, profile }) => {
            const result = doc.authorityVerificationResult;
            const hasFile = Boolean(doc.fileDataUrl || doc.fileName || doc.status !== 'NOT_UPLOADED');
            const isVerifying = loadingDocId === doc.id;
            const historyCount = doc.authorityVerificationHistory?.length || 0;
            const refNumber = getDocumentReferenceNumber(doc);

            return (
              <div
                key={doc.id}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-slate-300 transition-all space-y-3"
              >
                {/* Document & Authority Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {doc.requirementId || doc.id}
                      </span>
                      <h4 className="font-bold text-slate-900 text-sm">{doc.name}</h4>
                      {getStatusBadge(result?.status, result?.isManualReview)}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 pt-0.5">
                      {/* Issuing Authority Name & Department */}
                      {profile ? (
                        <span className="flex items-center gap-1 text-indigo-700 font-semibold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                          <Building className="w-3.5 h-3.5" />
                          {profile.authorityName} ({profile.department})
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">No specific authority mapping</span>
                      )}

                      {/* Certificate / Reference Number */}
                      <span className="flex items-center gap-1.5 text-slate-700 font-mono text-[11px] bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200">
                        <FileText className="w-3 h-3 text-slate-500" />
                        <span className="font-sans font-semibold text-slate-500">Ref/Cert #:</span>
                        <span className="font-bold text-slate-900">
                          {refNumber || <span className="text-slate-400 font-normal italic">Not extracted</span>}
                        </span>
                      </span>

                      {profile && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            profile.integrationStatus === 'CONFIGURED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : profile.integrationStatus === 'BACKEND_SERVICE_REQUIRED'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          Interface: {profile.integrationStatus}
                        </span>
                      )}

                      {doc.fileName && (
                        <span className="text-slate-500 font-mono text-[11px]">
                          File: {doc.fileName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Top-Right Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                    {/* Action 1: Open Official Portal in a new browser tab */}
                    {profile?.officialVerificationUrl ? (
                      <a
                        href={profile.officialVerificationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 text-xs font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-1 transition-colors border border-blue-200 shadow-2xs"
                        title={`Open official portal: ${profile.officialVerificationUrl}`}
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                        <span>Open Official Portal</span>
                      </a>
                    ) : (
                      <span
                        className="px-2 py-1 text-[11px] font-medium text-slate-400 bg-slate-50 rounded-lg flex items-center gap-1 border border-dashed border-slate-200"
                        title="Official portal URL not configured for this authority profile"
                      >
                        <Info className="w-3 h-3 text-slate-400" />
                        <span>Portal Not Configured</span>
                      </span>
                    )}

                    {/* Action 2: Previous Verification Attempts */}
                    {historyCount > 0 && (
                      <button
                        onClick={() => setHistoryDoc(doc)}
                        className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 transition-colors border border-slate-200"
                      >
                        <History className="w-3.5 h-3.5 text-slate-500" />
                        <span>Previous Attempts ({historyCount})</span>
                      </button>
                    )}

                    {/* Action 3: Guided Manual Verification */}
                    <button
                      onClick={() => handleOpenManualReview(doc, profile)}
                      className="px-3 py-1 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
                      title="Open guided manual verification workflow"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Record Verification Result</span>
                    </button>

                    {/* Action 4: Run Adapter Check (test vectors) */}
                    {hasFile && (
                      <button
                        onClick={() => handleVerify(doc)}
                        disabled={isVerifying}
                        className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg flex items-center gap-1 transition-colors border border-slate-200"
                        title="Run automated adapter test vector check"
                      >
                        {isVerifying ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin text-slate-500" />
                            <span>Checking...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3 h-3 text-slate-500" />
                            <span>Test Adapter</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Details / Verification findings panel */}
                {result ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-800">Method Used:</span>
                        <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                          {result.manualVerificationMethod || result.method.replace(/_/g, ' ')}
                        </span>
                        {result.referenceNumberChecked && (
                          <span className="text-[11px] text-slate-700 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                            Ref Checked: <strong>{result.referenceNumberChecked}</strong>
                          </span>
                        )}
                        {result.verifiedAt && (
                          <span className="text-slate-400">
                            Verified on {new Date(result.verifiedAt).toLocaleString()}
                          </span>
                        )}
                      </div>

                      {result.details && result.details.length > 0 && (
                        <button
                          onClick={() => setComparingDoc(doc)}
                          className="font-bold text-blue-700 hover:text-blue-900 underline flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          View Field Comparison ({result.details.length} fields)
                        </button>
                      )}
                    </div>

                    <p className="text-slate-700 font-medium leading-relaxed">
                      {result.summary}
                    </p>

                    {result.reviewerRemarks && (
                      <p className="text-slate-500 italic text-[11px]">
                        Officer Remarks: {result.reviewerRemarks} (Reviewer: {result.reviewerName || 'AICTE Officer'})
                      </p>
                    )}

                    {/* Official source details */}
                    {result.officialSource && (
                      <div className="mt-2 pt-2 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-400 block">Authority:</span>
                          <span className="font-semibold text-slate-800">
                            {result.authorityName || result.officialSource.name}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Source Interface:</span>
                          <span className="font-mono font-semibold text-slate-800">
                            {result.officialSource.endpointType || 'REGISTRY'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Matches:</span>
                          <span className="font-semibold text-emerald-700">
                            {result.matchedFieldsCount} fields
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Mismatches:</span>
                          <span className="font-semibold text-rose-700">
                            {result.mismatchedFieldsCount} fields
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-50/70 border border-slate-200/60 rounded-lg p-2.5 text-xs text-slate-500 flex items-center justify-between">
                    <span>
                      {hasFile
                        ? 'Certificate uploaded. Click "Verify with Authority" to check with statutory registry or record officer manual verification.'
                        : 'No document uploaded yet for this requirement.'}
                    </span>
                    {hasFile && !isVerifying && (
                      <span className="text-blue-600 font-medium">Ready for verification</span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* MODAL 1: Side-by-Side Field Comparison Modal */}
      {comparingDoc && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Scale className="w-5 h-5 text-indigo-400" />
                  Field Comparison: Submitted vs Official Registry
                </h3>
                <p className="text-xs text-slate-300">
                  Document: {comparingDoc.name} ({comparingDoc.requirementId})
                </p>
              </div>
              <button
                onClick={() => setComparingDoc(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <th className="p-2.5 font-bold">Field Name</th>
                      <th className="p-2.5 font-bold">Submitted in Application</th>
                      <th className="p-2.5 font-bold">Official Registry Record</th>
                      <th className="p-2.5 font-bold text-center">Match Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {comparingDoc.authorityVerificationResult?.details?.map((c: AuthorityFieldComparison, i: number) => {
                      const isMatch = c.match;
                      return (
                        <tr
                          key={i}
                          className={
                            !isMatch
                              ? 'bg-rose-50/70'
                              : 'bg-emerald-50/40'
                          }
                        >
                          <td className="p-2.5 font-semibold text-slate-800">
                            {c.label || c.field}
                          </td>
                          <td className="p-2.5 text-slate-700 font-mono">
                            {c.submittedValue || <span className="text-slate-400 italic">Not extracted</span>}
                          </td>
                          <td className="p-2.5 text-slate-700 font-mono">
                            {c.officialValue || <span className="text-slate-400 italic">Not in official registry</span>}
                          </td>
                          <td className="p-2.5 text-center">
                            {isMatch ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                <Check className="w-3 h-3 text-emerald-600" /> Match
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                                <X className="w-3 h-3 text-rose-600" /> Mismatch
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {comparingDoc.authorityVerificationResult?.summary && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700">
                  <span className="font-bold text-slate-800 block mb-1">Verification Assessment:</span>
                  <p>{comparingDoc.authorityVerificationResult.summary}</p>
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setComparingDoc(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-colors"
              >
                Close Comparison
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Record Verification Result Modal (Guided Manual Workflow) */}
      {manualReviewDoc && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="bg-indigo-900 text-white p-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 uppercase tracking-wider">
                    AICTE Officer Guided Workflow
                  </span>
                </div>
                <h3 className="text-base font-bold text-white flex items-center gap-2 mt-1">
                  <UserCheck className="w-5 h-5 text-indigo-300" />
                  Record Verification Result
                </h3>
                <p className="text-xs text-indigo-200">
                  Document: {manualReviewDoc.name} ({manualReviewDoc.requirementId || manualReviewDoc.id})
                </p>
              </div>
              <button
                onClick={() => setManualReviewDoc(null)}
                className="p-1 rounded-lg text-indigo-200 hover:text-white hover:bg-indigo-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitManualReview} className="p-6 space-y-4 text-xs">
              {/* Mandatory Scrutiny Banner */}
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-amber-900 space-y-1">
                <span className="font-bold flex items-center gap-1.5 text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  Guided Verification Safeguard
                </span>
                <p className="text-[11px] leading-relaxed">
                  Record official determinations conducted on authentic statutory portals, QR verification endpoints, or physical inspection desks. This decision will be permanently logged as <strong>MANUALLY VERIFIED</strong> in the tamper-evident audit history.
                </p>
              </div>

              {/* Field 1: Verification Method */}
              <div>
                <label className="font-bold text-slate-800 block mb-1.5">
                  1. Verification Method <span className="text-rose-600">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'Official Portal', label: 'Official Portal', icon: Globe },
                    { id: 'QR', label: 'QR Code', icon: QrCode },
                    { id: 'Other', label: 'Other / Desk', icon: FileText },
                  ].map((m) => {
                    const Icon = m.icon;
                    const isSelected = manualMethod === m.id;
                    return (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => setManualMethod(m.id as any)}
                        className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg border text-xs font-semibold transition-all ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-600 text-indigo-900 ring-2 ring-indigo-400'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isSelected ? 'text-indigo-600' : 'text-slate-500'}`} />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Field 2: Official Source Used */}
              <div>
                <label className="font-bold text-slate-800 block mb-1">
                  2. Official Source Used <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={manualOfficialSource}
                  onChange={(e) => setManualOfficialSource(e.target.value)}
                  placeholder="e.g. State Fire Services Registry, ICAI UDIN Portal, Mahabhulekh"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                  required
                />
              </div>

              {/* Field 3: Certificate / Reference Number Checked */}
              <div>
                <label className="font-bold text-slate-800 block mb-1">
                  3. Certificate / Reference Number Checked
                </label>
                <input
                  type="text"
                  value={manualReferenceChecked}
                  onChange={(e) => setManualReferenceChecked(e.target.value)}
                  placeholder="e.g. MH-FIRE-2024-8891, 24054321AAAAA1234, FDR-992381"
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Pre-populated from OCR extracted reference if available. Edit if verified with a different reference ID.
                </span>
              </div>

              {/* Field 4: Result / Determination */}
              <div>
                <label className="font-bold text-slate-800 block mb-1.5">
                  4. Verification Determination / Result <span className="text-rose-600">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'VERIFIED', label: 'Verified Authentic', color: 'emerald' },
                    { value: 'MISMATCH_FOUND', label: 'Mismatch Found', color: 'rose' },
                    { value: 'UNABLE_TO_VERIFY', label: 'Unable to Verify', color: 'slate' },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-lg border cursor-pointer font-semibold text-center transition-all ${
                        manualDecision === opt.value
                          ? opt.color === 'emerald'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-400'
                            : opt.color === 'rose'
                            ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-400'
                            : 'bg-slate-100 border-slate-500 text-slate-800 ring-2 ring-slate-400'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="manualDecision"
                        value={opt.value}
                        checked={manualDecision === opt.value}
                        onChange={() => setManualDecision(opt.value as any)}
                        className="sr-only"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Field 5: Mandatory Remarks */}
              <div>
                <label className="font-bold text-slate-800 block mb-1">
                  5. Mandatory Officer Remarks / Justification <span className="text-rose-600">*</span>
                </label>
                <textarea
                  rows={3}
                  value={manualRemarks}
                  onChange={(e) => setManualRemarks(e.target.value)}
                  placeholder="Provide explicit explanation of verification basis, matching certificate parameters, or identified discrepancy details..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                  required
                />
              </div>

              {/* Field 6 & 7: Verification Date/Time and Logged-In Administrator Identity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <div>
                  <span className="font-semibold text-slate-500 block text-[11px]">
                    6. Verification Date & Time:
                  </span>
                  <span className="font-mono font-bold text-slate-800 block mt-0.5">
                    {new Date().toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 block text-[11px]">
                    7. Logged-in Administrator Identity:
                  </span>
                  <span className="font-bold text-slate-900 block mt-0.5">
                    {session?.user?.displayName || 'AICTE Officer'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono block">
                    {session?.user?.email || 'admin@aicte-india.org'} ({session?.user?.role === 'admin' ? 'AICTE Scrutiny Officer' : session?.user?.role || 'admin'})
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setManualReviewDoc(null)}
                  className="px-3.5 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingManual}
                  className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg font-bold shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>{submittingManual ? 'Saving Decision...' : 'Record Verification Result'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Verification History Timeline Modal */}
      {historyDoc && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-400" />
                  Authority Verification History
                </h3>
                <p className="text-xs text-slate-300">
                  Document: {historyDoc.name} ({historyDoc.requirementId})
                </p>
              </div>
              <button
                onClick={() => setHistoryDoc(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {(!historyDoc.authorityVerificationHistory || historyDoc.authorityVerificationHistory.length === 0) ? (
                <p className="text-xs text-slate-500 italic">No history records found for this document.</p>
              ) : (
                <div className="relative border-l-2 border-slate-200 ml-3 space-y-4">
                  {historyDoc.authorityVerificationHistory.map((rec: AuthorityVerificationRecord, idx: number) => {
                    const statusText = rec.failureReason || rec.manualReviewReason || rec.suggestedNextAction || 'Verification completed';
                    return (
                      <div key={rec.id || idx} className="ml-4 relative">
                        <div className="absolute -left-[23px] top-1 w-3 h-3 rounded-full bg-indigo-600 ring-4 ring-white" />
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-slate-900">
                              Attempt #{historyDoc.authorityVerificationHistory!.length - idx}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {new Date(rec.attemptTimestamp).toLocaleString()}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {getStatusBadge(rec.status, rec.isManualReview)}
                            <span className="font-mono text-[10px] bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                              Method: {rec.manualVerificationMethod || rec.method.replace(/_/g, ' ')}
                            </span>
                            {rec.referenceNumberChecked && (
                              <span className="text-[10px] text-slate-700 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                                Ref Checked: {rec.referenceNumberChecked}
                              </span>
                            )}
                            {rec.reviewer?.name && (
                              <span className="text-[10px] text-indigo-700 font-semibold">
                                Officer: {rec.reviewer.name}
                              </span>
                            )}
                          </div>

                          <p className="text-slate-700 font-medium">{statusText}</p>

                          {rec.reviewer?.remarks && (
                            <p className="text-slate-600 italic text-[11px] bg-white/80 p-2 rounded border border-slate-200">
                              Officer Remarks: "{rec.reviewer.remarks}"
                            </p>
                          )}

                          {rec.officialSource?.name && (
                            <p className="text-[11px] text-slate-500">
                              Source: <span className="font-mono">{rec.officialSource.name}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setHistoryDoc(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
