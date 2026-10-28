import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  ApplicationType,
  CollegeApplication,
  ChecklistRequirement,
  RequiredDocument,
} from '../../types';
import {
  getChecklistRequirements,
  uploadApplicationDocument,
  removeApplicationDocument,
  submitCollegeApplication,
  createOrUpdateApplication,
  getApplications,
} from '../../services/dataService';
import {
  calculateFileHash,
  checkPreUploadDuplicate,
} from '../../services/duplicateDetectionService';
import {
  FileCheck,
  UploadCloud,
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  Eye,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Send,
  Save,
  Check,
  X,
  ShieldCheck,
  Info,
  Download,
  Lock,
  Layers,
  Sparkles,
  Copy,
} from 'lucide-react';

interface Props {
  applicationType: ApplicationType;
  application?: CollegeApplication | null;
  onApplicationUpdated: (app: CollegeApplication) => void;
}

export const CollegeDocumentChecklist: React.FC<Props> = ({
  applicationType,
  application: initialApp,
  onApplicationUpdated,
}) => {
  const { user, college } = useAuth();
  const [app, setApp] = useState<CollegeApplication | null>(initialApp || null);
  const [requirements, setRequirements] = useState<ChecklistRequirement[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // File Upload handling
  const [uploadingReqId, setUploadingReqId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<RequiredDocument | null>(null);

  // Pre-upload Duplicate Advisory State
  const [preUploadWarning, setPreUploadWarning] = useState<{
    isOpen: boolean;
    req: ChecklistRequirement;
    fileData: { fileName: string; fileSize: string; fileType: string; dataUrl: string };
    matchedRequirementName?: string;
    matchedFileName?: string;
    matchedAppId?: string;
  } | null>(null);

  // Modals
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [missingDocsModalOpen, setMissingDocsModalOpen] = useState(false);
  const [missingDocsList, setMissingDocsList] = useState<string[]>([]);

  // Category filter
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  useEffect(() => {
    setApp(initialApp || null);
  }, [initialApp]);

  useEffect(() => {
    loadActiveRequirements();
  }, [applicationType]);

  const loadActiveRequirements = async () => {
    setLoading(true);
    try {
      // Colleges only see active requirements
      const list = await getChecklistRequirements(applicationType, true);
      setRequirements(list);
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to load checklist requirements.');
    } finally {
      setLoading(false);
    }
  };

  const showNotice = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Helper to ensure an application record exists before uploading
  const ensureApplicationExists = async (): Promise<CollegeApplication> => {
    if (app && app.id) return app;

    if (!college) throw new Error('College profile not found. Please re-login.');

    const newApp: Partial<CollegeApplication> & { collegeId: string; type: ApplicationType } = {
      collegeId: college.collegeId,
      collegeName: college.collegeName,
      type: applicationType,
      academicYear: '2026-2027',
      state: college.state,
      district: college.district,
      discipline: college.institutionType || 'Engineering & Technology',
      intakeProposed: applicationType === 'EOA' ? 780 : 240,
      status: 'Draft',
      documents: [],
      complianceScore: 0,
      flaggedIssuesCount: 0,
      remarks: 'Application draft initialized by institution.',
    };

    const created = await createOrUpdateApplication(newApp);
    setApp(created);
    onApplicationUpdated(created);
    return created;
  };

  const handleTriggerUpload = (reqId: string) => {
    const input = fileInputRefs.current[reqId];
    if (input) {
      input.click();
    }
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    req: ChecklistRequirement
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const fileName = file.name;
    const fileSizeMB = file.size / (1024 * 1024);

    // 1. Validate File Size
    if (fileSizeMB > req.maxFileSizeMB) {
      showNotice(
        'error',
        `File "${fileName}" exceeds the maximum allowed size of ${req.maxFileSizeMB} MB (${fileSizeMB.toFixed(
          1
        )} MB). Please compress the file before uploading.`
      );
      e.target.value = '';
      return;
    }

    // 2. Validate File Extension
    const ext = '.' + fileName.split('.').pop()?.toLowerCase();
    const isAllowed = req.allowedFileTypes.some((t) => t.toLowerCase() === ext);
    if (!isAllowed) {
      showNotice(
        'error',
        `File format "${ext}" is not permitted for "${req.title}". Permitted formats: ${req.allowedFileTypes.join(
          ', '
        )}.`
      );
      e.target.value = '';
      return;
    }

    // 3. Process File Upload (Data URL for Simulation Mode & Persistent Demo)
    setUploadingReqId(req.id);
    setActionLoading(true);

    try {
      const targetApp = await ensureApplicationExists();

      // Read file into Data URL
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        try {
          const fileData = {
            fileName,
            fileSize: `${(file.size / 1024).toFixed(0)} KB`,
            fileType: file.type || ext,
            dataUrl,
          };

          // Pre-upload cryptographic hash duplicate advisory check
          try {
            const fileHash = await calculateFileHash(dataUrl);
            const allApps = await getApplications({ collegeId: targetApp.collegeId });
            const preCheck = checkPreUploadDuplicate(fileHash, req.id, targetApp, allApps);
            if (preCheck.isDuplicate) {
              setPreUploadWarning({
                isOpen: true,
                req,
                fileData,
                matchedRequirementName: preCheck.matchedRequirementName,
                matchedFileName: preCheck.matchedFileName,
                matchedAppId: preCheck.matchedAppId,
              });
              setUploadingReqId(null);
              setActionLoading(false);
              e.target.value = '';
              return;
            }
          } catch (hashErr) {
            console.warn('[VerifAI] Pre-upload duplicate check error:', hashErr);
          }

          await executeUpload(req, fileData);
        } catch (uploadErr: any) {
          showNotice('error', uploadErr.message || 'Upload failed.');
        } finally {
          setUploadingReqId(null);
          setActionLoading(false);
          e.target.value = '';
        }
      };

      reader.onerror = () => {
        showNotice('error', 'Error reading selected file.');
        setUploadingReqId(null);
        setActionLoading(false);
        e.target.value = '';
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      showNotice('error', err.message || 'Error initializing application for upload.');
      setUploadingReqId(null);
      setActionLoading(false);
      e.target.value = '';
    }
  };

  const executeUpload = async (
    req: ChecklistRequirement,
    fileData: { fileName: string; fileSize: string; fileType: string; dataUrl: string }
  ) => {
    setActionLoading(true);
    setUploadingReqId(req.id);
    try {
      const targetApp = await ensureApplicationExists();
      const updated = await uploadApplicationDocument(targetApp.id, req.id, fileData);
      setApp(updated);
      onApplicationUpdated(updated);
      showNotice('success', `Document "${req.title}" (${fileData.fileName}) uploaded successfully.`);
    } catch (uploadErr: any) {
      showNotice('error', uploadErr.message || 'Upload failed.');
    } finally {
      setUploadingReqId(null);
      setActionLoading(false);
    }
  };

  const handleRemoveFile = async (reqId: string, docName: string) => {
    if (!app) return;
    setActionLoading(true);
    try {
      const updated = await removeApplicationDocument(app.id, reqId);
      setApp(updated);
      onApplicationUpdated(updated);
      showNotice('success', `Removed uploaded file for "${docName}".`);
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to remove file.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    setActionLoading(true);
    try {
      const targetApp = await ensureApplicationExists();
      const updated = await createOrUpdateApplication({
        ...targetApp,
        lastUpdated: new Date().toISOString().split('T')[0],
      });
      setApp(updated);
      onApplicationUpdated(updated);
      showNotice('success', 'Application draft and uploaded files saved successfully.');
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to save draft.');
    } finally {
      setActionLoading(false);
    }
  };

  // Helper to reliably match uploaded document to requirement across ID, requirementId, or normalized name
  const findUploadedDoc = (req: ChecklistRequirement): RequiredDocument | undefined => {
    if (!app?.documents || app.documents.length === 0) return undefined;
    return app.documents.find((d) => {
      if (d.status === 'NOT_UPLOADED' || !d.fileName) return false;
      if (d.id === req.id || d.requirementId === req.id) return true;
      if (d.name && req.title && d.name.trim().toLowerCase() === req.title.trim().toLowerCase()) return true;
      // Legacy demo ID mapping for EoA track
      if (req.id === 'REQ-EOA-001' && (d.id === 'doc-3' || d.name.toLowerCase().includes('affiliation'))) return true;
      if (req.id === 'REQ-EOA-002' && (d.id === 'doc-4' || d.name.toLowerCase().includes('fire safety'))) return true;
      if (req.id === 'REQ-EOA-004' && (d.id === 'doc-2' || d.name.toLowerCase().includes('faculty cadre'))) return true;
      if (req.id === 'REQ-EOA-006' && (d.id === 'doc-1' || d.name.toLowerCase().includes('occupancy'))) return true;
      return false;
    });
  };

  const handleInitiateSubmit = async () => {
    if (!app) {
      showNotice('error', 'Please upload required documents before submitting.');
      return;
    }

    // Check mandatory compliance
    const activeMandatory = requirements.filter((r) => r.isMandatory);
    const missing: string[] = [];

    for (const req of activeMandatory) {
      const uploaded = findUploadedDoc(req);
      if (!uploaded) {
        missing.push(req.title);
      }
    }

    if (missing.length > 0) {
      setMissingDocsList(missing);
      setMissingDocsModalOpen(true);
    } else {
      setConfirmSubmitOpen(true);
    }
  };

  const handleFinalSubmit = async () => {
    if (!app) return;
    setActionLoading(true);
    try {
      const updated = await submitCollegeApplication(app.id);
      setApp(updated);
      onApplicationUpdated(updated);
      setConfirmSubmitOpen(false);
      showNotice('success', 'Application submitted successfully to AICTE Central Scrutiny!');
    } catch (err: any) {
      showNotice('error', err.message || 'Submission failed.');
    } finally {
      setActionLoading(false);
    }
  };

  // Progress calculations
  const mandatoryRequirements = requirements.filter((r) => r.isMandatory);
  const completedMandatoryDocs = mandatoryRequirements.filter((req) => Boolean(findUploadedDoc(req)));
  const mandatoryProgressPct =
    mandatoryRequirements.length > 0
      ? Math.round((completedMandatoryDocs.length / mandatoryRequirements.length) * 100)
      : 100;

  // Filtered requirements
  const filteredRequirements = requirements.filter((r) =>
    selectedCategory === 'ALL' ? true : r.category === selectedCategory
  );
  const categories = Array.from(new Set(requirements.map((r) => r.category)));

  const isSubmitted = app?.status === 'Submitted' || app?.status === 'Documents Verified' || app?.status === 'Approved';
  const hasReplacementRequests = app?.documents?.some((d) => d.status === 'Replacement Required');

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold shadow-sm transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-rose-50 text-rose-900 border-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="p-1 hover:bg-black/5 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Replacement Required Urgent Callout */}
      {hasReplacementRequests && (
        <div className="bg-rose-50 border-2 border-rose-400 rounded-xl p-4 flex items-start gap-3 text-xs text-rose-950 shadow-sm animate-pulse">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-sm">Action Required: Document Replacement Requested by AICTE</p>
            <p className="text-rose-800 leading-relaxed text-[11px]">
              AICTE Scrutiny Officers have reviewed your application and requested replacement for one or more documents. 
              Please inspect the highlighted requirements below, review the officer's remarks, and upload corrected documents.
            </p>
          </div>
        </div>
      )}

      {/* Progress & Compliance Tracker Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                Dossier Completion Tracker
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {applicationType === 'EOA' ? 'EoA Compliance Track' : 'New Approval Pathway'}
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              Mandatory Document Requirements: {completedMandatoryDocs.length} of {mandatoryRequirements.length} Completed
            </h3>
          </div>

          <div className="text-right">
            <span className="text-2xl font-black text-blue-800">{mandatoryProgressPct}%</span>
            <p className="text-[10px] text-slate-500">
              {mandatoryProgressPct === 100 ? 'All Mandatory Docs Uploaded' : 'Mandatory items pending'}
            </p>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              mandatoryProgressPct === 100
                ? 'bg-emerald-600'
                : mandatoryProgressPct > 50
                ? 'bg-blue-600'
                : 'bg-amber-500'
            }`}
            style={{ width: `${mandatoryProgressPct}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500 border-t border-slate-100">
          <div className="flex items-center gap-4">
            <span>Total Active Requirements: <strong className="text-slate-700">{requirements.length}</strong></span>
            <span>•</span>
            <span>Mandatory: <strong className="text-rose-700">{mandatoryRequirements.length}</strong></span>
            <span>•</span>
            <span>Optional: <strong className="text-slate-700">{requirements.length - mandatoryRequirements.length}</strong></span>
          </div>
          <div className="text-slate-400">
            Current Application Status: <strong className="text-slate-700">{app?.status || 'Draft'}</strong>
          </div>
        </div>
      </div>

      {/* Illustrative Demo Notice Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
        <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-800 leading-relaxed">
          <strong>Illustrative Demo Checklist:</strong> The document list shown is based on illustrative sample requirements configured in the prototype. 
          The AICTE Administrator can dynamically update, enable, or add statutory rules matching the official Approval Process Handbook.
        </p>
      </div>

      {/* Categories Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              selectedCategory === 'ALL'
                ? 'bg-blue-800 text-white font-bold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Categories ({requirements.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-blue-800 text-white font-bold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Save Draft Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveDraft}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Draft</span>
          </button>
        </div>
      </div>

      {/* Requirements List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
            Loading active checklist requirements...
          </div>
        ) : filteredRequirements.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
            No active requirements configured for this category.
          </div>
        ) : (
          filteredRequirements.map((req) => {
            const uploadedDoc = findUploadedDoc(req);
            const isUploaded = Boolean(uploadedDoc);
            const isReplacementRequired = uploadedDoc?.status === 'Replacement Required';
            const isAccepted = uploadedDoc?.status === 'Accepted';
            // Replacement is permitted if officer requested replacement OR if document is not yet accepted and application is not final-approved
            const isReplacementPermitted = isReplacementRequired || (!isAccepted && app?.status !== 'Approved');

            return (
              <div
                key={req.id}
                className={`bg-white rounded-xl border transition-all p-4.5 space-y-3 shadow-sm ${
                  isReplacementRequired
                    ? 'border-rose-400 bg-rose-50/20 ring-1 ring-rose-300'
                    : isAccepted
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : isUploaded
                    ? 'border-blue-200'
                    : 'border-slate-200'
                }`}
              >
                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={(el) => (fileInputRefs.current[req.id] = el)}
                  accept={req.allowedFileTypes.join(',')}
                  onChange={(e) => handleFileChange(e, req)}
                  className="hidden"
                />

                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  {/* Left: Info */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-700 flex-shrink-0" />
                      <h4 className="font-bold text-xs text-slate-900">
                        {req.title}
                      </h4>

                      {req.isMandatory ? (
                        <span className="text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.2 rounded-full">
                          Mandatory
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.2 rounded-full">
                          Optional
                        </span>
                      )}

                      <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.2 rounded-full">
                        {req.category}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {req.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 pt-0.5">
                      <span>
                        Permitted Formats: <strong className="text-slate-700 font-mono">{req.allowedFileTypes.join(', ')}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Max Size: <strong className="text-slate-700">{req.maxFileSizeMB} MB</strong>
                      </span>
                    </div>

                    {/* Replacement Officer Remarks Alert */}
                    {isReplacementRequired && uploadedDoc?.adminRemarks && (
                      <div className="bg-rose-50 border border-rose-300 rounded-lg p-2.5 text-xs text-rose-900 space-y-0.5 mt-2">
                        <div className="flex items-center gap-1.5 font-bold text-rose-800">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                          <span>AICTE Officer Scrutiny Remark: Replacement Required</span>
                        </div>
                        <p className="text-[11px] text-rose-950 font-medium pl-5">
                          "{uploadedDoc.adminRemarks}"
                        </p>
                      </div>
                    )}

                    {/* Accepted seal */}
                    {isAccepted && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs text-emerald-900 flex items-center gap-1.5 mt-2">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-semibold">
                          Verified & Accepted by AICTE Scrutiny Officer
                        </span>
                      </div>
                    )}

                    {/* Uploaded File Details */}
                    {isUploaded && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs flex flex-wrap items-center justify-between gap-2 mt-1">
                        <div className="flex items-center gap-2">
                          <FileCheck className="w-3.5 h-3.5 text-blue-700" />
                          <span className="font-mono text-slate-900 font-semibold">{uploadedDoc?.fileName}</span>
                          <span className="text-[11px] text-slate-500">({uploadedDoc?.fileSize})</span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          Uploaded: {uploadedDoc?.uploadDate}
                        </span>
                      </div>
                    )}

                    {/* Duplicate Document Advisory Alert */}
                    {uploadedDoc?.duplicateCheckResult &&
                      uploadedDoc.duplicateCheckResult.status !== 'UNIQUE' && (
                        <div
                          className={`rounded-lg p-2.5 text-xs border mt-2 space-y-1 ${
                            uploadedDoc.duplicateCheckResult.status === 'EXACT_DUPLICATE'
                              ? 'bg-rose-50 border-rose-200 text-rose-900'
                              : uploadedDoc.duplicateCheckResult.status === 'LIKELY_DUPLICATE'
                              ? 'bg-amber-50 border-amber-200 text-amber-900'
                              : 'bg-yellow-50 border-yellow-200 text-yellow-900'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 font-bold">
                              <Copy className="w-3.5 h-3.5" />
                              <span>
                                {uploadedDoc.duplicateCheckResult.status === 'EXACT_DUPLICATE'
                                  ? 'Advisory: Exact Duplicate File Detected'
                                  : uploadedDoc.duplicateCheckResult.status === 'LIKELY_DUPLICATE'
                                  ? 'Advisory: Likely Duplicate Certificate Reference'
                                  : 'Advisory: High Text Similarity Warning'}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold bg-white/80 border border-current">
                              {uploadedDoc.duplicateCheckResult.status.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-[11px] leading-relaxed">
                            {uploadedDoc.duplicateCheckResult.overallReason}
                          </p>
                          {uploadedDoc.duplicateCheckResult.matches.length > 0 && (
                            <div className="text-[10px] opacity-85 pt-1 space-y-0.5">
                              {uploadedDoc.duplicateCheckResult.matches.map((m, mIdx) => (
                                <div key={mIdx} className="flex items-center gap-1">
                                  <span>• Reference:</span>
                                  <strong className="font-semibold">{m.matchedRequirementTitle}</strong>
                                  {m.matchedFileName && <span>({m.matchedFileName})</span>}
                                  {m.similarityScore && m.similarityScore < 1 && (
                                    <span>— {Math.round(m.similarityScore * 100)}% similarity</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="text-[9px] opacity-75 italic pt-0.5">
                            {uploadedDoc.duplicateCheckResult.notice} Submission remains enabled. AICTE scrutiny officers will make the final regulatory assessment.
                          </p>
                        </div>
                      )}

                    {/* Authority Verification Status (Read-Only for College) */}
                    {uploadedDoc?.authorityVerificationResult && (
                      <div
                        className={`rounded-lg p-2.5 text-xs border mt-2 space-y-1 ${
                          uploadedDoc.authorityVerificationResult.status === 'VERIFIED'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : uploadedDoc.authorityVerificationResult.status === 'DETAILS_MISMATCH' ||
                              uploadedDoc.authorityVerificationResult.status === 'RECORD_NOT_FOUND'
                            ? 'bg-rose-50 border-rose-200 text-rose-900'
                            : uploadedDoc.authorityVerificationResult.status === 'EXPIRED'
                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>
                              {uploadedDoc.authorityVerificationResult.isManualReview && uploadedDoc.authorityVerificationResult.status === 'VERIFIED'
                                ? 'Statutory Authority Verification: Manually Verified by AICTE Officer'
                                : uploadedDoc.authorityVerificationResult.status === 'VERIFIED'
                                ? 'Statutory Authority Verification: Verified'
                                : uploadedDoc.authorityVerificationResult.status === 'DETAILS_MISMATCH'
                                ? 'Statutory Verification: Discrepancy Reported'
                                : uploadedDoc.authorityVerificationResult.status === 'RECORD_NOT_FOUND'
                                ? 'Statutory Verification: Record Not Found in Registry'
                                : uploadedDoc.authorityVerificationResult.status === 'EXPIRED'
                                ? 'Statutory Verification: Certificate Expired'
                                : 'Statutory Verification: Manual Review in Progress'}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded font-black bg-white/90 border border-current">
                            {uploadedDoc.authorityVerificationResult.isManualReview && uploadedDoc.authorityVerificationResult.status === 'VERIFIED'
                              ? 'MANUALLY VERIFIED'
                              : uploadedDoc.authorityVerificationResult.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed">
                          {uploadedDoc.authorityVerificationResult.summary}
                        </p>
                        <p className="text-[9px] opacity-75 italic pt-0.5">
                          Read-only authority status. Official determination is conducted by AICTE Scrutiny Officers.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 self-start flex-shrink-0 pt-1">
                    {/* Status Badge */}
                    <span
                      className={`px-3 py-1 rounded-full text-center text-[10px] font-bold ${
                        isAccepted
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : isReplacementRequired
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : isUploaded
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {isAccepted
                        ? 'Accepted'
                        : isReplacementRequired
                        ? 'Replacement Required'
                        : isUploaded
                        ? 'Uploaded'
                        : 'Not Uploaded'}
                    </span>

                    {/* Upload Document Action (when document has not yet been uploaded) */}
                    {!isUploaded && (
                      <button
                        onClick={() => handleTriggerUpload(req.id)}
                        disabled={actionLoading || uploadingReqId === req.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm bg-blue-800 hover:bg-blue-900 text-white"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>
                          {uploadingReqId === req.id ? 'Processing...' : 'Upload Document'}
                        </span>
                      </button>
                    )}

                    {/* Replace Document Action (when document is uploaded and replacement is permitted) */}
                    {isUploaded && isReplacementPermitted && (
                      <button
                        onClick={() => handleTriggerUpload(req.id)}
                        disabled={actionLoading || uploadingReqId === req.id}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm ${
                          isReplacementRequired
                            ? 'bg-rose-700 hover:bg-rose-800 text-white'
                            : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>
                          {uploadingReqId === req.id
                            ? 'Processing...'
                            : isReplacementRequired
                            ? 'Upload Replacement'
                            : 'Replace Document'}
                        </span>
                      </button>
                    )}

                    {/* View Action */}
                    {isUploaded && (
                      <button
                        onClick={() => setPreviewDoc(uploadedDoc || null)}
                        className="px-2.5 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                        title="View Document"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-700" />
                        <span>View</span>
                      </button>
                    )}

                    {/* Remove Action */}
                    {isUploaded && !isAccepted && isReplacementPermitted && (
                      <button
                        onClick={() => handleRemoveFile(req.id, req.title)}
                        disabled={actionLoading}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200"
                        title="Remove Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Submission Gate & Actions */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h4 className="text-sm font-bold text-white">
              AICTE Compliance Dossier Submission Gate
            </h4>
          </div>
          <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
            All active mandatory documents must be uploaded and valid before formal submission to the Council. 
            Once submitted, your application will enter the scrutiny committee pipeline.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={handleSaveDraft}
            disabled={actionLoading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
          >
            Save Draft
          </button>

          <button
            onClick={handleInitiateSubmit}
            disabled={actionLoading || isSubmitted}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 ${
              isSubmitted
                ? 'bg-emerald-800/80 text-emerald-200 cursor-default'
                : mandatoryProgressPct === 100
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-blue-700 hover:bg-blue-600 text-white'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>
              {isSubmitted
                ? 'Application Dossier Submitted'
                : 'Submit Application for AICTE Scrutiny'}
            </span>
          </button>
        </div>
      </div>

      {/* Missing Mandatory Documents Modal */}
      {missingDocsModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 text-xs">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto border border-rose-300">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                Cannot Submit: Missing Mandatory Documents
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Council scrutiny regulations require all mandatory documents to be uploaded prior to submission.
              </p>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1.5">
              <p className="font-bold text-rose-900 text-[11px] uppercase tracking-wider">
                Missing Documents ({missingDocsList.length}):
              </p>
              <ul className="list-disc list-inside space-y-1 text-rose-800 text-xs">
                {missingDocsList.map((item, idx) => (
                  <li key={idx} className="font-medium">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-center pt-2">
              <button
                onClick={() => setMissingDocsModalOpen(false)}
                className="px-5 py-2 bg-blue-800 hover:bg-blue-900 text-white rounded-lg text-xs font-bold shadow"
              >
                Return to Checklist & Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submission Confirmation Modal */}
      {confirmSubmitOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 text-xs">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center mx-auto border border-blue-300">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                Confirm Application Submission
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                You are about to formally submit the{' '}
                <strong className="text-slate-900">
                  {applicationType === 'EOA' ? 'Extension of Approval' : 'New Technical Institution'}
                </strong>{' '}
                dossier for <strong className="text-slate-900">{college?.collegeName}</strong>.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-[11px] text-blue-900 space-y-1">
              <p className="font-bold">Statutory Declaration:</p>
              <p className="leading-relaxed">
                I hereby declare that all uploaded documents and submitted figures are authentic copies of official institutional records and conform strictly to the AICTE Approval Process Handbook (APH) norms.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setConfirmSubmitOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Review Checklist
              </button>
              <button
                onClick={handleFinalSubmit}
                disabled={actionLoading}
                className="px-5 py-2 bg-blue-800 hover:bg-blue-900 text-white rounded-lg text-xs font-bold shadow"
              >
                Confirm & Submit Application
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document View / Inspection Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                  {previewDoc.category}
                </span>
                <h4 className="text-sm font-bold text-slate-900">{previewDoc.name}</h4>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400">File Name:</span>
                  <p className="font-mono font-bold text-slate-800">{previewDoc.fileName}</p>
                </div>
                <div>
                  <span className="text-slate-400">File Size:</span>
                  <p className="font-bold text-slate-800">{previewDoc.fileSize}</p>
                </div>
                <div>
                  <span className="text-slate-400">Upload Date:</span>
                  <p className="font-bold text-slate-800">{previewDoc.uploadDate}</p>
                </div>
                <div>
                  <span className="text-slate-400">Review Status:</span>
                  <p className="font-bold text-blue-700">{previewDoc.status}</p>
                </div>
              </div>

              {/* Display preview */}
              <div className="border border-slate-200 rounded-lg p-6 bg-white text-center space-y-3">
                {previewDoc.fileDataUrl && previewDoc.fileDataUrl.startsWith('data:image') ? (
                  <img
                    src={previewDoc.fileDataUrl}
                    alt={previewDoc.name}
                    className="max-h-64 mx-auto rounded border"
                  />
                ) : (
                  <div className="py-6 space-y-2">
                    <FileText className="w-12 h-12 text-blue-600 mx-auto" />
                    <p className="font-bold text-slate-800 text-xs">
                      {previewDoc.fileName}
                    </p>
                    <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                      Document verified in local college application dossier.
                    </p>
                    {previewDoc.fileDataUrl && (
                      <a
                        href={previewDoc.fileDataUrl}
                        download={previewDoc.fileName || 'document.pdf'}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-800 hover:bg-blue-900 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Copy</span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-900"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Upload Exact Duplicate Warning Modal */}
      {preUploadWarning && preUploadWarning.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-rose-100 text-rose-700 rounded-xl flex-shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-black text-slate-900">
                  Exact Duplicate File Detected
                </h4>
                <p className="text-xs text-slate-600">
                  Pre-upload integrity check identified that this exact file has already been uploaded for another requirement in your institutional records.
                </p>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-950 space-y-1.5 font-medium">
              <div className="flex justify-between">
                <span className="text-slate-500">Attempted Upload For:</span>
                <span className="font-bold text-slate-800">{preUploadWarning.req.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Selected File:</span>
                <span className="font-mono font-bold text-slate-800">{preUploadWarning.fileData.fileName}</span>
              </div>
              {preUploadWarning.matchedRequirementName && (
                <div className="flex justify-between border-t border-rose-200/80 pt-1.5">
                  <span className="text-slate-500">Previously Uploaded For:</span>
                  <span className="font-bold text-rose-800">{preUploadWarning.matchedRequirementName}</span>
                </div>
              )}
              {preUploadWarning.matchedFileName && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Existing File Name:</span>
                  <span className="font-mono text-rose-800">{preUploadWarning.matchedFileName}</span>
                </div>
              )}
            </div>

            <div className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              <p>
                <strong>AICTE Compliance Advisory:</strong> Re-uploading identical files for distinct compliance requirements may delay scrutiny review. You may proceed if this document intentionally serves multiple requirements, or cancel to select the correct document.
              </p>
              <p className="text-[10px] text-slate-400 mt-1 italic">
                Local Simulation Mode: Scope restricted to this institution’s local dossier.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPreUploadWarning(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const warning = preUploadWarning;
                  setPreUploadWarning(null);
                  await executeUpload(warning.req, warning.fileData);
                }}
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
              >
                Proceed with Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
