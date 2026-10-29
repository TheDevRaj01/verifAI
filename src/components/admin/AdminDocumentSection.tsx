import React, { useState, useEffect } from 'react';
import {
  CollegeApplication,
  ApplicationType,
  ChecklistRequirement,
  RequiredDocument,
  ApplicationStatus,
} from '../../types';
import {
  getApplications,
  getChecklistRequirements,
  reviewApplicationDocument,
  updateApplicationStatus,
  getApplicationById,
  getApplicationFileBlob,
} from '../../services/dataService';
import { db, isFirebaseConfigured } from '../../services/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { ChecklistManagementSection } from './ChecklistManagementSection';
import {
  Building2,
  GraduationCap,
  FileCheck,
  Search,
  Filter,
  Eye,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  FileText,
  Download,
  X,
  Clock,
  MapPin,
  ShieldCheck,
  Check,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  ShieldAlert,
  Info,
  Copy,
} from 'lucide-react';
import { DocumentOcrViewer } from './DocumentOcrViewer';
import { getSampleDocumentPdfDataUrl } from '../../services/sampleDocumentGenerator';

type ReviewFilterStatus = 'ALL' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REPLACEMENT_REQUIRED';

export const AdminDocumentSection: React.FC = () => {
  // Level 1: Application Type Selection
  const [selectedType, setSelectedType] = useState<ApplicationType>('EOA');

  // Level 2 & 3 State
  const [applications, setApplications] = useState<CollegeApplication[]>([]);
  const [checklists, setChecklists] = useState<ChecklistRequirement[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedApp, setSelectedApp] = useState<CollegeApplication | null>(null);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReviewFilterStatus>('ALL');

  // Sub-view: Toggle Checklist Rules Management
  const [showChecklistConfig, setShowChecklistConfig] = useState(false);

  // Level 3 Modal States
  const [viewingDoc, setViewingDoc] = useState<RequiredDocument | null>(null);
  const [blobLoading, setBlobLoading] = useState(false);
  const [loadedBlobUrl, setLoadedBlobUrl] = useState<string | null>(null);
  const [replacementPromptDoc, setReplacementPromptDoc] = useState<RequiredDocument | null>(null);
  const [replacementRemarks, setReplacementRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!viewingDoc) {
      setLoadedBlobUrl(null);
      return;
    }
    if (viewingDoc.fileDataUrl || viewingDoc.fileUrl) {
      setLoadedBlobUrl(viewingDoc.fileUrl || viewingDoc.fileDataUrl || null);
      return;
    }
    if (viewingDoc.fileBlobId && selectedApp?.id) {
      setBlobLoading(true);
      getApplicationFileBlob(selectedApp.id, viewingDoc.fileBlobId)
        .then((url) => {
          if (url) {
            setLoadedBlobUrl(url);
          } else {
            const sampleUrl = getSampleDocumentPdfDataUrl(
              viewingDoc.requirementId || viewingDoc.id,
              viewingDoc.name,
              selectedApp?.collegeName,
              selectedApp?.academicYear
            );
            setLoadedBlobUrl(sampleUrl);
          }
        })
        .catch((err) => {
          console.warn('[VerifAI] Failed to load document blob:', err);
          const sampleUrl = getSampleDocumentPdfDataUrl(
            viewingDoc.requirementId || viewingDoc.id,
            viewingDoc.name,
            selectedApp?.collegeName,
            selectedApp?.academicYear
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
        selectedApp?.collegeName,
        selectedApp?.academicYear
      );
      setLoadedBlobUrl(sampleUrl);
    }
  }, [viewingDoc, selectedApp?.id, selectedApp?.collegeName, selectedApp?.academicYear]);

  useEffect(() => {
    loadData();

    // Live Firestore real-time listener for current application stream
    if (isFirebaseConfigured && db) {
      try {
        const q = query(collection(db, 'applications'), where('type', '==', selectedType));
        const unsub = onSnapshot(
          q,
          (snapshot) => {
            const fresh = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as CollegeApplication));
            if (fresh.length > 0) {
              setApplications(fresh);
              setSelectedApp((prev) => (prev ? fresh.find((a) => a.id === prev.id) || prev : null));
            }
          },
          (err) => console.warn('[VerifAI] AdminDocumentSection live sync notice:', err)
        );

        return () => unsub();
      } catch (e) {
        console.warn('[VerifAI] AdminDocumentSection live sync setup notice:', e);
      }
    }
  }, [selectedType]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allApps, reqs] = await Promise.all([
        getApplications({ type: selectedType }),
        getChecklistRequirements(selectedType, false),
      ]);
      setApplications(allApps);
      setChecklists(reqs);

      // If a college was selected, refresh its data
      if (selectedApp) {
        const freshApp = allApps.find((a) => a.id === selectedApp.id) || null;
        setSelectedApp(freshApp);
      }
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to load applications and checklists.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCollege = async (app: CollegeApplication) => {
    try {
      const freshApp = await getApplicationById(app.id, true);
      setSelectedApp(freshApp || app);
    } catch {
      setSelectedApp(app);
    }
  };

  const showNotice = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Calculate review status for a college application
  const getCollegeStatusInfo = (app: CollegeApplication, reqs: ChecklistRequirement[]) => {
    if (app.status === 'Draft') {
      return {
        key: 'PENDING',
        label: 'Draft / Pre-Submission',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
        dotClass: 'bg-slate-400',
      };
    }

    const uploadedDocs = app.documents?.filter(
      (d) => d.status !== 'NOT_UPLOADED' && Boolean(d.fileName)
    ) || [];

    if (uploadedDocs.some((d) => d.status === 'Replacement Required') || app.status === 'Clarification Requested') {
      return {
        key: 'REPLACEMENT_REQUIRED',
        label: 'Replacement Required',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
        dotClass: 'bg-rose-500',
      };
    }

    const activeMandatory = reqs.filter((r) => r.isActive && r.isMandatory && r.applicationType === app.type);
    const allMandatoryAccepted =
      activeMandatory.length > 0 &&
      activeMandatory.every((m) =>
        uploadedDocs.some(
          (d) =>
            (d.id === m.id || d.requirementId === m.id || d.name.toLowerCase() === m.title.toLowerCase()) &&
            d.status === 'Accepted'
        )
      );

    if (app.status === 'Documents Verified' || app.status === 'Approved' || allMandatoryAccepted) {
      return {
        key: 'COMPLETED',
        label: 'Completed',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        dotClass: 'bg-emerald-500',
      };
    }

    if (uploadedDocs.some((d) => d.status === 'Accepted')) {
      return {
        key: 'IN_PROGRESS',
        label: 'In Progress',
        badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
        dotClass: 'bg-blue-500',
      };
    }

    return {
      key: 'PENDING',
      label: 'Pending Review',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
      dotClass: 'bg-amber-500',
    };
  };

  // Filter applications by search and review status
  const filteredApplications = applications.filter((app) => {
    // 1. Strict Application Type Boundary
    if (app.type !== selectedType) return false;

    // 2. Search by College Name or Unique College ID
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      app.collegeName.toLowerCase().includes(term) ||
      app.collegeId.toLowerCase().includes(term) ||
      app.state.toLowerCase().includes(term) ||
      app.district.toLowerCase().includes(term);

    // 3. Status Filter
    if (!matchesSearch) return false;

    if (statusFilter === 'ALL') return true;
    const statusInfo = getCollegeStatusInfo(app, checklists);
    return statusInfo.key === statusFilter;
  });

  // Calculate overall metrics
  const activeReqs = checklists.filter((r) => r.isActive);
  const totalColleges = applications.filter((a) => a.type === selectedType).length;
  const replacementColleges = applications.filter(
    (a) => a.type === selectedType && a.documents?.some((d) => d.status === 'Replacement Required')
  ).length;

  // Handle Accept Document in Level 3
  const handleAcceptDoc = async (docId: string, docName: string) => {
    if (!selectedApp) return;
    if (selectedApp.status === 'Draft') {
      showNotice(
        'error',
        'Action Prohibited: Cannot accept documents for an application in "Draft" status. The institution must submit the application before official review.'
      );
      return;
    }
    setActionLoading(true);
    try {
      const updated = await reviewApplicationDocument(selectedApp.id, docId, {
        status: 'Accepted',
        remarks: 'Approved by AICTE Scrutiny Officer',
      });
      setSelectedApp(updated);
      setApplications((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      showNotice('success', `Document "${docName}" accepted successfully.`);
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to accept document.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Request Replacement in Level 3
  const handleConfirmReplacement = async () => {
    if (!selectedApp || !replacementPromptDoc) return;
    if (selectedApp.status === 'Draft') {
      showNotice(
        'error',
        'Action Prohibited: Cannot request replacements for an application in "Draft" status. The institution must submit the application before official review.'
      );
      return;
    }
    if (!replacementRemarks.trim()) {
      showNotice('error', 'Mandatory: Please provide a specific remark/reason for replacement.');
      return;
    }

    setActionLoading(true);
    try {
      const updated = await reviewApplicationDocument(selectedApp.id, replacementPromptDoc.id, {
        status: 'Replacement Required',
        remarks: replacementRemarks.trim(),
      });
      setSelectedApp(updated);
      setApplications((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      showNotice('success', `Replacement requested for "${replacementPromptDoc.name}".`);
      setReplacementPromptDoc(null);
      setReplacementRemarks('');
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to request replacement.');
    } finally {
      setActionLoading(false);
    }
  };

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

      {/* SECTION HEADER & LEVEL 1: APPLICATION TYPE SELECTION */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider bg-blue-500/20 text-sky-300 px-3 py-0.5 rounded-full border border-blue-500/30">
                Council Central Repository
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Verification & Scrutiny
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white">
              AICTE Document Verification Directorate
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Review and inspect compliance dossiers uploaded by colleges. Inspect proofs, approve requirements, 
              or request replacements with mandatory audit remarks.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowChecklistConfig(!showChecklistConfig)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                showChecklistConfig
                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                  : 'bg-white/10 text-slate-200 border-white/20 hover:bg-white/15'
              }`}
              title="Configure regulatory checklist requirements"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{showChecklistConfig ? 'Hide Checklist Engine' : 'Checklist Rules Engine'}</span>
            </button>

            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 bg-white/10 hover:bg-white/15 border border-white/20 text-slate-200 rounded-xl text-xs transition-colors"
              title="Refresh Records"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* LEVEL 1 CARDS: EoA Documents vs New Approval Documents */}
        <div className="space-y-2 pt-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Select Application Document Stream:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* EoA Documents Card */}
            <div
              onClick={() => {
                setSelectedType('EOA');
                setSelectedApp(null);
              }}
              className={`relative p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                selectedType === 'EOA'
                  ? 'bg-gradient-to-br from-blue-900/80 via-blue-950 to-slate-900 border-blue-400 shadow-lg shadow-blue-950/50'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                      selectedType === 'EOA'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">
                      EoA Documents
                    </h3>
                    <p className="text-xs text-blue-200">
                      Extension of Approval — Existing AICTE Technical Institutions
                    </p>
                  </div>
                </div>

                {selectedType === 'EOA' && (
                  <span className="text-[10px] font-bold bg-blue-500 text-white px-2.5 py-0.5 rounded-full shadow-sm">
                    Active Stream
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/10 text-xs text-slate-300">
                <span>
                  Colleges: <strong className="text-white">{applications.filter((a) => a.type === 'EOA').length}</strong>
                </span>
                <span>•</span>
                <span>
                  Compliance Rules: <strong className="text-sky-300">{checklists.filter((r) => r.applicationType === 'EOA' && r.isActive).length} active</strong>
                </span>
              </div>
            </div>

            {/* New Approval Documents Card */}
            <div
              onClick={() => {
                setSelectedType('NEW_APPROVAL');
                setSelectedApp(null);
              }}
              className={`relative p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                selectedType === 'NEW_APPROVAL'
                  ? 'bg-gradient-to-br from-indigo-900/80 via-indigo-950 to-slate-900 border-indigo-400 shadow-lg shadow-indigo-950/50'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                      selectedType === 'NEW_APPROVAL'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">
                      New Approval Documents
                    </h3>
                    <p className="text-xs text-indigo-200">
                      First-Time Sanctions — Newly Established Trusts & Societies
                    </p>
                  </div>
                </div>

                {selectedType === 'NEW_APPROVAL' && (
                  <span className="text-[10px] font-bold bg-indigo-500 text-white px-2.5 py-0.5 rounded-full shadow-sm">
                    Active Stream
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/10 text-xs text-slate-300">
                <span>
                  Colleges: <strong className="text-white">{applications.filter((a) => a.type === 'NEW_APPROVAL').length}</strong>
                </span>
                <span>•</span>
                <span>
                  Compliance Rules: <strong className="text-indigo-300">{checklists.filter((r) => r.applicationType === 'NEW_APPROVAL' && r.isActive).length} active</strong>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Checklist Rules Engine (if toggled) */}
      {showChecklistConfig && (
        <div className="p-4 bg-slate-50 border border-slate-300 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-blue-700" />
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Regulatory Checklist Rules Editor
              </h4>
            </div>
            <button
              onClick={() => setShowChecklistConfig(false)}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold"
            >
              Close Editor
            </button>
          </div>
          <ChecklistManagementSection />
        </div>
      )}

      {/* ============================================================ */}
      {/* LEVEL 3: INDIVIDUAL COLLEGE DOCUMENT DETAILS VIEW            */}
      {/* ============================================================ */}
      {selectedApp ? (
        <div className="space-y-6">
          {/* Back to College List Button */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelectedApp(null)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-xl text-xs font-bold shadow-sm transition-all"
            >
              <ArrowLeft className="w-4 h-4 text-blue-700" />
              <span>Back to {selectedType === 'EOA' ? 'EoA' : 'New Approval'} College List</span>
            </button>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Application Reference:</span>
              <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                {selectedApp.id}
              </span>
            </div>
          </div>

          {/* College Dossier Header Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                      selectedApp.type === 'EOA'
                        ? 'bg-blue-100 text-blue-800 border border-blue-200'
                        : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                    }`}
                  >
                    {selectedApp.type === 'EOA' ? 'Extension of Approval' : 'New Institution Sanction'}
                  </span>

                  <span className="font-mono text-xs text-sky-800 bg-sky-50 px-2.5 py-0.5 rounded-full font-bold border border-sky-200">
                    AICTE ID: {selectedApp.collegeId}
                  </span>

                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                      getCollegeStatusInfo(selectedApp, checklists).badgeClass
                    }`}
                  >
                    {getCollegeStatusInfo(selectedApp, checklists).label}
                  </span>
                </div>

                <h3 className="text-xl md:text-2xl font-black text-slate-900 leading-tight">
                  {selectedApp.collegeName}
                </h3>

                <p className="text-xs text-slate-500 flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                  <span>
                    {selectedApp.district}, {selectedApp.state}
                  </span>
                  <span>•</span>
                  <span>Program: <strong>{selectedApp.discipline}</strong></span>
                  <span>•</span>
                  <span>Academic Year: <strong>{selectedApp.academicYear}</strong></span>
                </p>
              </div>

              {/* Progress Summary Card */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-right min-w-[200px] flex-shrink-0">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  Dossier Compliance
                </p>
                <p className="text-2xl font-black text-blue-900 mt-0.5">
                  {selectedApp.complianceScore}%
                </p>
                <p className="text-[11px] text-slate-600 mt-1">
                  {selectedApp.documents?.filter((d) => d.status !== 'NOT_UPLOADED' && Boolean(d.fileName)).length || 0} of{' '}
                  {activeReqs.length || selectedApp.documents?.length || 0} Documents Uploaded
                </p>
              </div>
            </div>

            {/* Overall Scrutiny Status Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700">Council Scrutiny Status:</span>
                <span className="px-2.5 py-0.5 rounded-full font-bold bg-slate-900 text-white text-[11px]">
                  {selectedApp.status}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-500">Quick Status Transition:</span>
                {(['Under Scrutiny', 'Clarification Requested', 'Documents Verified'] as ApplicationStatus[]).map((st) => (
                  <button
                    key={st}
                    onClick={async () => {
                      try {
                        const updated = await updateApplicationStatus(selectedApp.id, st);
                        setSelectedApp(updated);
                        setApplications((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
                        showNotice('success', `Status updated to ${st}`);
                      } catch (err: any) {
                        showNotice('error', err.message || `Failed to update status to ${st}`);
                      }
                    }}
                    disabled={selectedApp.status === st || (selectedApp.status === 'Draft' && st === 'Documents Verified')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                      selectedApp.status === st
                        ? 'bg-blue-800 text-white border-blue-800 cursor-default'
                        : selectedApp.status === 'Draft' && st === 'Documents Verified'
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Draft Application Banner */}
          {selectedApp.status === 'Draft' && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-900 shadow-sm">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold text-sm">Draft Application — Pre-Submission Inspection Only</p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  This application is currently in <strong>Draft</strong> status and has not yet been submitted by the institution.
                  You may inspect uploaded proofs and verify documents, but administrative review decisions (Accept / Request Replacement) and status changes to "Documents Verified" are locked until formal submission.
                </p>
              </div>
            </div>
          )}

          {/* Required Documents List & Scrutiny Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-700" />
                  <span>Compliance Document Requirements & Uploaded Dossier</span>
                </h4>
                <p className="text-[11px] text-slate-500">
                  Inspect documents, verify authenticity, and record scrutiny acceptance or replacement requests.
                </p>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {activeReqs.length} Active Norm Requirements
              </span>
            </div>

            {/* List of Documents */}
            <div className="divide-y divide-slate-200">
              {activeReqs.map((req) => {
                // Find matching uploaded document
                const uploadedDoc = selectedApp.documents?.find(
                  (d) =>
                    d.id === req.id ||
                    d.requirementId === req.id ||
                    d.name.toLowerCase() === req.title.toLowerCase()
                );

                const isUploaded = Boolean(uploadedDoc && uploadedDoc.fileName && uploadedDoc.status !== 'NOT_UPLOADED');
                const isAccepted = uploadedDoc?.status === 'Accepted' || uploadedDoc?.status === 'Validated';
                const isReplacementRequired = uploadedDoc?.status === 'Replacement Required' || uploadedDoc?.status === 'Flagged';

                return (
                  <div
                    key={req.id}
                    className={`p-4 transition-colors ${
                      isReplacementRequired
                        ? 'bg-rose-50/30'
                        : isAccepted
                        ? 'bg-emerald-50/20'
                        : !isUploaded
                        ? 'bg-slate-50/60'
                        : 'hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      {/* Left: Info */}
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <FileText
                            className={`w-4 h-4 flex-shrink-0 ${
                              isAccepted
                                ? 'text-emerald-600'
                                : isReplacementRequired
                                ? 'text-rose-600'
                                : isUploaded
                                ? 'text-blue-700'
                                : 'text-slate-400'
                            }`}
                          />
                          <h5 className="font-bold text-xs text-slate-900">
                            {req.title}
                          </h5>

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

                        {/* File Details If Uploaded */}
                        {isUploaded ? (
                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs flex flex-wrap items-center justify-between gap-2 mt-2">
                            <div className="flex items-center gap-2">
                              <FileCheck className="w-4 h-4 text-blue-700" />
                              <span className="font-mono font-semibold text-slate-900">
                                {uploadedDoc?.fileName}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                ({uploadedDoc?.fileSize || 'N/A'})
                              </span>
                              {uploadedDoc?.version && uploadedDoc.version > 1 && (
                                <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.2 rounded">
                                  v{uploadedDoc.version}
                                </span>
                              )}
                            </div>

                            <span className="text-[11px] text-slate-400">
                              Uploaded: {uploadedDoc?.uploadDate}
                            </span>
                          </div>
                        ) : (
                          <div className="p-2 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center gap-2 mt-2">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                            <span>
                              <strong>Not Uploaded:</strong> The institution has not yet provided this document in their submission dossier.
                            </span>
                          </div>
                        )}

                        {/* Remarks if Replacement Required or previous officer remarks */}
                        {uploadedDoc?.adminRemarks && (
                          <div
                            className={`p-2.5 rounded-lg text-xs flex items-start gap-2 mt-2 ${
                              isReplacementRequired
                                ? 'bg-rose-50 border border-rose-300 text-rose-900'
                                : 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                            }`}
                          >
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
                            <div className="space-y-0.5">
                              <p className="font-bold">
                                Officer Remarks ({uploadedDoc.reviewedBy || 'AICTE Officer'}):
                              </p>
                              <p className="text-[11px] leading-relaxed">
                                "{uploadedDoc.adminRemarks}"
                              </p>
                              {uploadedDoc.reviewedAt && (
                                <p className="text-[10px] text-slate-400">
                                  Reviewed on: {uploadedDoc.reviewedAt}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Duplicate Document Advisory Alert */}
                        {uploadedDoc?.duplicateCheckResult &&
                          uploadedDoc.duplicateCheckResult.status !== 'UNIQUE' && (
                            <div
                              className={`p-2.5 rounded-lg text-xs flex items-start gap-2 mt-2 ${
                                uploadedDoc.duplicateCheckResult.status === 'EXACT_DUPLICATE'
                                  ? 'bg-rose-50 border border-rose-200 text-rose-900'
                                  : uploadedDoc.duplicateCheckResult.status === 'LIKELY_DUPLICATE'
                                  ? 'bg-amber-50 border border-amber-200 text-amber-900'
                                  : 'bg-yellow-50 border border-yellow-200 text-yellow-900'
                              }`}
                            >
                              <Copy className="w-4 h-4 flex-shrink-0 mt-0.5" />
                              <div className="space-y-0.5 flex-1">
                                <div className="flex items-center justify-between">
                                  <strong className="font-bold">
                                    Duplicate Advisory ({uploadedDoc.duplicateCheckResult.status.replace('_', ' ')}):
                                  </strong>
                                  <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded font-bold bg-white/80 border border-current">
                                    Method: {uploadedDoc.duplicateCheckResult.matches[0]?.method.replace('_', ' ') || 'AI Scan'}
                                  </span>
                                </div>
                                <p className="text-[11px] leading-relaxed">
                                  {uploadedDoc.duplicateCheckResult.overallReason}
                                </p>
                                <p className="text-[10px] opacity-75 italic pt-0.5">
                                  Officer decision support • Final scrutiny determination rests with AICTE officer.
                                </p>
                              </div>
                            </div>
                          )}
                      </div>

                      {/* Right: Status badge & Actions */}
                      <div className="flex flex-col sm:items-end gap-1.5 self-start flex-shrink-0 pt-1">
                        <div className="flex flex-wrap items-center gap-1">
                          {/* Status Badge */}
                          <span
                            className={`px-3 py-1 rounded-full text-center text-[10px] font-bold ${
                              isAccepted
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : isReplacementRequired
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : isUploaded
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}
                          >
                            {isAccepted
                              ? 'Accepted'
                              : isReplacementRequired
                              ? 'Replacement Required'
                              : isUploaded
                              ? 'Uploaded / Pending Review'
                              : 'Not Uploaded'}
                          </span>

                          {uploadedDoc?.duplicateCheckResult &&
                            uploadedDoc.duplicateCheckResult.status !== 'UNIQUE' && (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                  uploadedDoc.duplicateCheckResult.status === 'EXACT_DUPLICATE'
                                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                                    : uploadedDoc.duplicateCheckResult.status === 'LIKELY_DUPLICATE'
                                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                                    : 'bg-yellow-100 text-yellow-800 border-yellow-300'
                                }`}
                              >
                                {uploadedDoc.duplicateCheckResult.status.replace('_', ' ')}
                              </span>
                            )}

                          {uploadedDoc?.authorityVerificationResult && (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                uploadedDoc.authorityVerificationResult.isManualReview && uploadedDoc.authorityVerificationResult.status === 'VERIFIED'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-400 font-black'
                                  : uploadedDoc.authorityVerificationResult.status === 'VERIFIED'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : uploadedDoc.authorityVerificationResult.status === 'DETAILS_MISMATCH' ||
                                    uploadedDoc.authorityVerificationResult.status === 'RECORD_NOT_FOUND'
                                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                                  : uploadedDoc.authorityVerificationResult.status === 'EXPIRED'
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : uploadedDoc.authorityVerificationResult.status === 'MANUAL_REVIEW_REQUIRED'
                                  ? 'bg-orange-100 text-orange-800 border-orange-300'
                                  : 'bg-slate-100 text-slate-700 border-slate-300'
                              }`}
                            >
                              {uploadedDoc.authorityVerificationResult.isManualReview && uploadedDoc.authorityVerificationResult.status === 'VERIFIED'
                                ? 'MANUALLY VERIFIED'
                                : `Auth: ${uploadedDoc.authorityVerificationResult.status.replace(/_/g, ' ')}`}
                            </span>
                          )}
                        </div>

                        {/* Action Buttons for uploaded files */}
                        {isUploaded && uploadedDoc && (
                          <div className="flex items-center gap-1.5 pt-1">
                            <button
                              onClick={() => setViewingDoc(uploadedDoc)}
                              className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shadow-sm"
                              title="Inspect File"
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-700" />
                              <span>Inspect</span>
                            </button>

                            <button
                              onClick={() => handleAcceptDoc(uploadedDoc.id, req.title)}
                              disabled={actionLoading || isAccepted || selectedApp.status === 'Draft'}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                                selectedApp.status === 'Draft'
                                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                  : isAccepted
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 opacity-60'
                                  : 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm'
                              }`}
                              title={selectedApp.status === 'Draft' ? 'Action disabled: Application is in Draft status' : 'Accept Document'}
                            >
                              <Check className="w-3 h-3" />
                              <span>Accept</span>
                            </button>

                            <button
                              onClick={() => {
                                if (selectedApp.status === 'Draft') {
                                  showNotice(
                                    'error',
                                    'Action Prohibited: Cannot request replacements for an application in Draft status.'
                                  );
                                  return;
                                }
                                setReplacementPromptDoc(uploadedDoc);
                                setReplacementRemarks(uploadedDoc.adminRemarks || '');
                              }}
                              disabled={actionLoading || selectedApp.status === 'Draft'}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shadow-sm ${
                                selectedApp.status === 'Draft'
                                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                  : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200'
                              }`}
                              title={selectedApp.status === 'Draft' ? 'Action disabled: Application is in Draft status' : 'Request Replacement with Remarks'}
                            >
                              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>Replace</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Additional Uploaded Institutional Documents */}
              {selectedApp.documents
                ?.filter(
                  (d) =>
                    d.status !== 'NOT_UPLOADED' &&
                    Boolean(d.fileName) &&
                    !activeReqs.some(
                      (r) =>
                        r.id === d.id ||
                        r.id === d.requirementId ||
                        r.title.toLowerCase() === d.name.toLowerCase()
                    )
                )
                .map((extraDoc) => {
                  const isAccepted = extraDoc.status === 'Accepted' || extraDoc.status === 'Validated';
                  const isReplacementRequired =
                    extraDoc.status === 'Replacement Required' || extraDoc.status === 'Flagged';

                  return (
                    <div
                      key={extraDoc.id}
                      className={`p-4 transition-colors ${
                        isReplacementRequired
                          ? 'bg-rose-50/30'
                          : isAccepted
                          ? 'bg-emerald-50/20'
                          : 'hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-700 flex-shrink-0" />
                            <h5 className="font-bold text-xs text-slate-900">{extraDoc.name}</h5>
                            <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.2 rounded-full">
                              {extraDoc.category || 'Institutional Proof'}
                            </span>
                            <span className="text-[10px] bg-sky-100 text-sky-800 px-2 py-0.2 rounded-full font-bold">
                              Additional Document
                            </span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs flex flex-wrap items-center justify-between gap-2 mt-2">
                            <div className="flex items-center gap-2">
                              <FileCheck className="w-4 h-4 text-blue-700" />
                              <span className="font-mono font-semibold text-slate-900">{extraDoc.fileName}</span>
                              <span className="text-[11px] text-slate-500">({extraDoc.fileSize || 'N/A'})</span>
                            </div>
                            <span className="text-[11px] text-slate-400">Uploaded: {extraDoc.uploadDate}</span>
                          </div>

                          {extraDoc.adminRemarks && (
                            <div className="p-2.5 rounded-lg text-xs bg-rose-50 border border-rose-300 text-rose-900 flex items-start gap-2 mt-2">
                              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
                              <div>
                                <p className="font-bold">
                                  Officer Remarks ({extraDoc.reviewedBy || 'AICTE Officer'}):
                                </p>
                                <p className="text-[11px] leading-relaxed">"{extraDoc.adminRemarks}"</p>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col sm:items-end gap-2 self-start flex-shrink-0 pt-1">
                          <span
                            className={`px-3 py-1 rounded-full text-center text-[10px] font-bold ${
                              isAccepted
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : isReplacementRequired
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : 'bg-blue-100 text-blue-800 border border-blue-200'
                            }`}
                          >
                            {isAccepted
                              ? 'Accepted'
                              : isReplacementRequired
                              ? 'Replacement Required'
                              : 'Uploaded / Pending Review'}
                          </span>

                          <div className="flex items-center gap-1.5 pt-1">
                            <button
                              onClick={() => setViewingDoc(extraDoc)}
                              className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shadow-sm"
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-700" />
                              <span>Inspect</span>
                            </button>
                            <button
                              onClick={() => handleAcceptDoc(extraDoc.id, extraDoc.name)}
                              disabled={actionLoading || isAccepted || selectedApp.status === 'Draft'}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                                selectedApp.status === 'Draft'
                                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                  : isAccepted
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 opacity-60'
                                  : 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm'
                              }`}
                              title={selectedApp.status === 'Draft' ? 'Action disabled: Application is in Draft status' : 'Accept Document'}
                            >
                              <Check className="w-3 h-3" />
                              <span>Accept</span>
                            </button>
                            <button
                              onClick={() => {
                                if (selectedApp.status === 'Draft') {
                                  showNotice(
                                    'error',
                                    'Action Prohibited: Cannot request replacements for an application in Draft status.'
                                  );
                                  return;
                                }
                                setReplacementPromptDoc(extraDoc);
                                setReplacementRemarks(extraDoc.adminRemarks || '');
                              }}
                              disabled={actionLoading || selectedApp.status === 'Draft'}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shadow-sm ${
                                selectedApp.status === 'Draft'
                                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                  : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200'
                              }`}
                              title={selectedApp.status === 'Draft' ? 'Action disabled: Application is in Draft status' : 'Request Replacement with Remarks'}
                            >
                              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>Replace</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      ) : (
        /* ============================================================ */
        /* LEVEL 2: COLLEGE DIRECTORY                                   */
        /* ============================================================ */
        <div className="space-y-4">
          {/* Search Bar & Status Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search colleges by name, AICTE Unique ID, state, or district..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-2.5 p-0.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter by Review Status */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Filter className="w-4 h-4 text-slate-500" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as ReviewFilterStatus)}
                className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="ALL">All Review Statuses ({applications.filter((a) => a.type === selectedType).length})</option>
                <option value="PENDING">Pending Review</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="REPLACEMENT_REQUIRED">Replacement Required</option>
              </select>
            </div>
          </div>

          {/* Directory Summary Banner */}
          <div className="flex items-center justify-between text-xs text-slate-600 px-1">
            <p>
              Showing <strong>{filteredApplications.length}</strong> {selectedType === 'EOA' ? 'EoA' : 'New Approval'} institutions
              {searchTerm && <span> matching "{searchTerm}"</span>}
              {statusFilter !== 'ALL' && <span> with status: {statusFilter.replace('_', ' ')}</span>}
            </p>
            <span className="text-[11px] text-slate-400">
              Stream: {selectedType === 'EOA' ? 'Extension of Approval' : 'New Technical Institution'}
            </span>
          </div>

          {/* College Cards Directory */}
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200">
              Loading college document dossiers...
            </div>
          ) : filteredApplications.length === 0 ? (
            <div className="p-12 text-center space-y-3 bg-white rounded-2xl border border-slate-200">
              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
              <h4 className="text-sm font-bold text-slate-800">No colleges found</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No institutions match your search query or review status filter under the{' '}
                {selectedType === 'EOA' ? 'EoA' : 'New Approval'} stream.
              </p>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('ALL');
                }}
                className="px-4 py-1.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredApplications.map((app) => {
                const statusInfo = getCollegeStatusInfo(app, checklists);
                const uploadedDocsCount = app.documents?.filter(
                  (d) => d.status !== 'NOT_UPLOADED' && Boolean(d.fileName)
                ).length || 0;
                const totalExpected = activeReqs.length || app.documents?.length || 4;
                const progressPct = Math.round((uploadedDocsCount / Math.max(totalExpected, 1)) * 100);

                return (
                  <div
                    key={app.id}
                    className="bg-white rounded-2xl border border-slate-200 hover:border-blue-400 p-5 shadow-sm hover:shadow-md transition-all space-y-4"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left: Prominent College Identity */}
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-sky-800 bg-sky-50 px-2.5 py-0.5 rounded-md border border-sky-200">
                            ID: {app.collegeId}
                          </span>

                          <span
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                              app.type === 'EOA'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            {app.type === 'EOA' ? 'EoA' : 'New Approval'}
                          </span>

                          <span
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${statusInfo.badgeClass}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`} />
                            <span>{statusInfo.label}</span>
                          </span>
                        </div>

                        {/* Prominent, highly legible College Name */}
                        <h4 className="text-base md:text-lg font-black text-slate-900 tracking-tight leading-snug">
                          {app.collegeName}
                        </h4>

                        <p className="text-xs text-slate-500 flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                          <span>
                            {app.district}, {app.state}
                          </span>
                          <span>•</span>
                          <span>{app.discipline}</span>
                          <span>•</span>
                          <span>Ref: <strong className="font-mono text-slate-700">{app.id}</strong></span>
                        </p>
                      </div>

                      {/* Middle: Document Upload Progress */}
                      <div className="w-full md:w-56 space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200 flex-shrink-0">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-700">Document Upload:</span>
                          <span className="font-bold text-blue-900">{progressPct}%</span>
                        </div>

                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              progressPct === 100 ? 'bg-emerald-600' : 'bg-blue-600'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>

                        <p className="text-[11px] text-slate-500 text-right">
                          <strong className="text-slate-800">{uploadedDocsCount}</strong> of{' '}
                          <strong className="text-slate-800">{totalExpected}</strong> documents uploaded
                        </p>
                      </div>

                      {/* Right: View Documents Action */}
                      <div className="flex items-center self-end md:self-center flex-shrink-0">
                        <button
                          onClick={() => handleSelectCollege(app)}
                          className="px-5 py-2.5 bg-blue-800 hover:bg-blue-900 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 group"
                        >
                          <Eye className="w-4 h-4 text-sky-300" />
                          <span>View Documents</span>
                          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: DOCUMENT PREVIEW / INSPECT MODAL                      */}
      {/* ============================================================ */}
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
                  <span className="text-slate-400">Review Status:</span>
                  <p className="font-bold text-blue-700">{viewingDoc.status}</p>
                </div>
              </div>

              {/* Display preview */}
              <div className="border border-slate-200 rounded-lg p-4 bg-white text-center space-y-3">
                {(() => {
                  const url = loadedBlobUrl || viewingDoc.fileUrl || viewingDoc.fileDataUrl;
                  if (blobLoading) {
                    return (
                      <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-500">
                        <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                        <span>Loading file from secure storage...</span>
                      </div>
                    );
                  }

                  if (url && (url.startsWith('data:image') || /\.(jpe?g|png|webp)/i.test(viewingDoc.fileName || ''))) {
                    return (
                      <div className="space-y-2">
                        <img
                          src={url}
                          alt={viewingDoc.name}
                          className="max-h-60 mx-auto rounded border shadow-sm"
                        />
                        <a
                          href={url}
                          download={viewingDoc.fileName || 'image.jpg'}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-800 hover:bg-blue-900 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Image</span>
                        </a>
                      </div>
                    );
                  }

                  return (
                    <div className="py-4 space-y-2">
                      <FileText className="w-10 h-10 text-blue-600 mx-auto" />
                      <p className="font-bold text-slate-800 text-xs">
                        {viewingDoc.fileName || `${viewingDoc.name}.pdf`}
                      </p>
                      <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                        Authorized Scrutiny Dossier. Indexed in AICTE Central Records.
                      </p>
                      {url && (
                        <a
                          href={url}
                          download={viewingDoc.fileName || 'document.pdf'}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-800 hover:bg-blue-900 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Original File</span>
                        </a>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* AI Document OCR & Text Intelligence Viewer */}
            <DocumentOcrViewer
              doc={{ ...viewingDoc, fileDataUrl: loadedBlobUrl || viewingDoc.fileUrl || viewingDoc.fileDataUrl }}
              appId={selectedApp?.id}
              application={selectedApp || undefined}
              onOcrSaved={(updatedDoc) => {
                setViewingDoc(updatedDoc);
                if (selectedApp) {
                  setSelectedApp({
                    ...selectedApp,
                    documents: selectedApp.documents.map((d) =>
                      d.id === updatedDoc.id || d.requirementId === updatedDoc.id ? updatedDoc : d
                    ),
                  });
                }
                loadData();
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

      {/* ============================================================ */}
      {/* MODAL: REPLACEMENT REQUEST MODAL WITH MANDATORY REMARKS      */}
      {/* ============================================================ */}
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
              AICTE council protocols mandate providing a clear, actionable reason to the applicant institution.
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
                placeholder="e.g. The submitted fire safety certificate has expired. Please upload a renewed NOC issued by the competent municipal authority..."
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
                disabled={actionLoading || !replacementRemarks.trim()}
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
