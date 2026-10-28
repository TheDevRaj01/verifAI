import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  CollegeApplication,
  ApplicationType,
  InfrastructureEvidenceItem,
  InfrastructureEvidenceType,
} from '../../types';
import {
  addInfrastructureEvidence,
  removeInfrastructureEvidence,
  createOrUpdateApplication,
} from '../../services/dataService';
import {
  Camera,
  UploadCloud,
  CheckCircle,
  AlertCircle,
  Trash2,
  Eye,
  Info,
  Building,
  Layers,
  Monitor,
  BookOpen,
  Wrench,
  Users,
  Droplets,
  ShieldCheck,
  FileText,
  X,
  Download,
  AlertTriangle,
  RefreshCw,
  FolderPlus,
} from 'lucide-react';

export interface InfrastructureCategoryConfig {
  key: InfrastructureEvidenceType;
  title: string;
  shortLabel: string;
  description: string;
  associatedRequirementId?: string;
  isMandatoryForEoA: boolean;
  isMandatoryForNewApproval: boolean;
  allowedExtensions: string[];
  maxFileSizeMB: number;
  maxFiles: number;
  icon: React.ComponentType<{ className?: string }>;
}

export const INFRASTRUCTURE_CATEGORIES: InfrastructureCategoryConfig[] = [
  {
    key: 'CAMPUS_EXTERIOR',
    title: 'Campus & Building Exterior',
    shortLabel: 'Campus Exterior',
    description: 'Prominent institutional entrance signage displaying college name, front elevation of academic blocks, and approach roads.',
    associatedRequirementId: 'REQ-NEW-007',
    isMandatoryForEoA: false,
    isMandatoryForNewApproval: true,
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxFileSizeMB: 5,
    maxFiles: 5,
    icon: Building,
  },
  {
    key: 'CLASSROOM_PHOTO',
    title: 'Classrooms & Lecture Halls',
    shortLabel: 'Classrooms',
    description: 'Interior instructional layout showing student desks, instructional board, lighting, and natural ventilation.',
    associatedRequirementId: 'REQ-EOA-006',
    isMandatoryForEoA: true,
    isMandatoryForNewApproval: true,
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxFileSizeMB: 5,
    maxFiles: 5,
    icon: Camera,
  },
  {
    key: 'LABORATORY_PHOTO',
    title: 'Laboratories & Workshops',
    shortLabel: 'Labs & Workshops',
    description: 'Specialized lab setups, experimental equipment benches, workshop machines, and safety warning protocols.',
    associatedRequirementId: 'REQ-EOA-006',
    isMandatoryForEoA: true,
    isMandatoryForNewApproval: true,
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxFileSizeMB: 5,
    maxFiles: 5,
    icon: Wrench,
  },
  {
    key: 'LIBRARY_PHOTO',
    title: 'Central Library & Reading Room',
    shortLabel: 'Library',
    description: 'Main book stack partitions, reference collection shelves, and quiet student reading hall seating.',
    associatedRequirementId: 'REQ-EOA-006',
    isMandatoryForEoA: true,
    isMandatoryForNewApproval: true,
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxFileSizeMB: 5,
    maxFiles: 5,
    icon: BookOpen,
  },
  {
    key: 'COMPUTER_CENTRE_PHOTO',
    title: 'Computer Labs & Equipment',
    shortLabel: 'Computer Labs',
    description: 'Networked computer terminals, institutional server rack infrastructure, and central UPS power backup.',
    associatedRequirementId: 'REQ-EOA-006',
    isMandatoryForEoA: true,
    isMandatoryForNewApproval: true,
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxFileSizeMB: 5,
    maxFiles: 5,
    icon: Monitor,
  },
  {
    key: 'FACULTY_ROOM_PHOTO',
    title: 'Faculty Rooms & Common Facilities',
    shortLabel: 'Faculty Rooms',
    description: 'Staff workstations, Head of Department chambers, girls/boys common rooms, and seminar conference halls.',
    isMandatoryForEoA: false,
    isMandatoryForNewApproval: false,
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxFileSizeMB: 5,
    maxFiles: 5,
    icon: Users,
  },
  {
    key: 'SANITATION_WATER_PHOTO',
    title: 'Toilets, Drinking Water & Sanitation',
    shortLabel: 'Sanitation & Water',
    description: 'Clean institutional washrooms (separate for boys, girls, staff), RO purified drinking water dispenser stations.',
    isMandatoryForEoA: true,
    isMandatoryForNewApproval: true,
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxFileSizeMB: 5,
    maxFiles: 5,
    icon: Droplets,
  },
  {
    key: 'ACCESSIBILITY_SAFETY_PHOTO',
    title: 'Accessibility & Safety Arrangements',
    shortLabel: 'Accessibility & Safety',
    description: 'Barrier-free PwD wheelchair ramps, tactile walkway tiles, accessible washrooms, and wall-mounted fire extinguishers.',
    associatedRequirementId: 'REQ-EOA-007',
    isMandatoryForEoA: true,
    isMandatoryForNewApproval: true,
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxFileSizeMB: 5,
    maxFiles: 5,
    icon: ShieldCheck,
  },
  {
    key: 'FLOOR_PLAN_DRAWING',
    title: 'Building Floor Plans & Layouts',
    shortLabel: 'Floor Plans (PDF/Image)',
    description: 'Certified architectural blueprint drawings demarcating rooms, built-up areas, emergency exits, and dimension scales.',
    associatedRequirementId: 'REQ-NEW-007',
    isMandatoryForEoA: false,
    isMandatoryForNewApproval: true,
    allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png'],
    maxFileSizeMB: 10,
    maxFiles: 3,
    icon: Layers,
  },
  {
    key: 'OTHER_INFRASTRUCTURE_EVIDENCE',
    title: 'Other Infrastructure Evidence',
    shortLabel: 'Other Amenities',
    description: 'Sports facilities, playground, cafeteria, hostel blocks, solar power arrays, or auxiliary generator setups.',
    isMandatoryForEoA: false,
    isMandatoryForNewApproval: false,
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.pdf'],
    maxFileSizeMB: 10,
    maxFiles: 5,
    icon: FileText,
  },
];

interface Props {
  applicationType: ApplicationType;
  application?: CollegeApplication | null;
  onApplicationUpdated: (app: CollegeApplication) => void;
}

export const CollegeInfrastructureSection: React.FC<Props> = ({
  applicationType,
  application: initialApp,
  onApplicationUpdated,
}) => {
  const { college } = useAuth();
  const [app, setApp] = useState<CollegeApplication | null>(initialApp || null);
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | InfrastructureEvidenceType>('ALL');
  const [uploadingCategory, setUploadingCategory] = useState<InfrastructureEvidenceType | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [previewItem, setPreviewItem] = useState<InfrastructureEvidenceItem | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Ensure application exists in local simulation
  const ensureApplication = async (): Promise<CollegeApplication> => {
    if (app) return app;
    if (!college) throw new Error('College profile not found. Please log in.');

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
      infrastructureEvidence: [],
      complianceScore: 80,
      flaggedIssuesCount: 0,
      remarks: 'Application draft initialized with infrastructure evidence section.',
    };

    const created = await createOrUpdateApplication(newApp);
    setApp(created);
    onApplicationUpdated(created);
    return created;
  };

  const isEoA = applicationType === 'EOA';
  const allEvidence = app?.infrastructureEvidence || [];

  const isCategoryMandatory = (cfg: InfrastructureCategoryConfig): boolean => {
    return isEoA ? cfg.isMandatoryForEoA : cfg.isMandatoryForNewApproval;
  };

  // Group evidence by category
  const getEvidenceForCategory = (catKey: InfrastructureEvidenceType) => {
    return allEvidence.filter(
      (e) => e.evidenceCategory === catKey || (catKey === 'CAMPUS_EXTERIOR' && e.evidenceCategory === 'BUILDING_EXTERIOR_PHOTO')
    );
  };

  // Calculate stats
  const totalMandatoryCategories = INFRASTRUCTURE_CATEGORIES.filter((c) => isCategoryMandatory(c)).length;
  const fulfilledMandatoryCategories = INFRASTRUCTURE_CATEGORIES.filter((c) => {
    if (!isCategoryMandatory(c)) return false;
    return getEvidenceForCategory(c.key).length > 0;
  }).length;

  const handleTriggerUpload = (categoryKey: InfrastructureEvidenceType) => {
    const input = fileInputRefs.current[categoryKey];
    if (input) {
      input.click();
    }
  };

  const handleFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
    cfg: InfrastructureCategoryConfig
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const existingItems = getEvidenceForCategory(cfg.key);
    if (existingItems.length + files.length > cfg.maxFiles) {
      setNotice({
        type: 'error',
        message: `Limit exceeded: "${cfg.title}" allows at most ${cfg.maxFiles} files. You already have ${existingItems.length} uploaded.`,
      });
      e.target.value = '';
      return;
    }

    setUploadingCategory(cfg.key);
    setNotice(null);

    try {
      const targetApp = await ensureApplication();
      let lastUpdatedApp = targetApp;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        const sizeMB = file.size / (1024 * 1024);

        // Extension check
        if (!cfg.allowedExtensions.includes(ext)) {
          throw new Error(
            `File "${file.name}" has invalid format "${ext}". Allowed: ${cfg.allowedExtensions.join(', ')}`
          );
        }

        // Size check
        if (sizeMB > cfg.maxFileSizeMB) {
          throw new Error(
            `File "${file.name}" exceeds the maximum size limit of ${cfg.maxFileSizeMB} MB (${sizeMB.toFixed(1)} MB).`
          );
        }

        // Read into Data URL for preview
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
          reader.readAsDataURL(file);
        });

        const reqId = cfg.associatedRequirementId || (isEoA ? 'REQ-EOA-006' : 'REQ-NEW-007');

        lastUpdatedApp = await addInfrastructureEvidence(lastUpdatedApp.id, {
          title: `${cfg.shortLabel} Proof (${i + 1 + existingItems.length})`,
          fileName: file.name,
          fileSize: `${(file.size / 1024).toFixed(0)} KB`,
          fileType: file.type || ext,
          fileDataUrl: dataUrl,
          evidenceCategory: cfg.key,
          requirementId: reqId,
          status: 'PENDING_REVIEW',
        });
      }

      setApp(lastUpdatedApp);
      onApplicationUpdated(lastUpdatedApp);
      setNotice({
        type: 'success',
        message: `Successfully uploaded ${files.length} file(s) for "${cfg.title}". Compliance assessment updated dynamically.`,
      });
    } catch (err: any) {
      setNotice({
        type: 'error',
        message: err.message || 'Failed to upload evidence.',
      });
    } finally {
      setUploadingCategory(null);
      e.target.value = '';
    }
  };

  const handleRemove = async (evidenceId: string, title: string) => {
    if (!app) return;
    if (!confirm(`Are you sure you want to remove "${title}"? Compliance assessment will be re-evaluated.`)) {
      return;
    }

    setNotice(null);
    try {
      const updated = await removeInfrastructureEvidence(app.id, evidenceId);
      setApp(updated);
      onApplicationUpdated(updated);
      setNotice({
        type: 'info',
        message: `Evidence "${title}" removed successfully.`,
      });
    } catch (err: any) {
      setNotice({
        type: 'error',
        message: err.message || 'Failed to remove evidence.',
      });
    }
  };

  const filteredCategories = INFRASTRUCTURE_CATEGORIES.filter((c) => {
    if (selectedFilter === 'ALL') return true;
    return c.key === selectedFilter;
  });

  return (
    <div className="space-y-6">
      {/* SECTION BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Camera className="w-6 h-6 text-emerald-400" />
              <h3 className="text-xl font-bold tracking-tight text-white">
                Infrastructure Photos & Physical Evidence
              </h3>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Upload photographs, architectural floor plan drawings, and proof of physical facilities for AICTE scrutiny review.
              Evidence is automatically cross-referenced with your application declarations and made available to scrutiny committees.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                <Building className="w-3.5 h-3.5 text-indigo-300" />
                {isEoA ? 'Extension of Approval (EoA)' : 'New Technical Institution Track'}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                Application: <strong className="text-white ml-0.5">{app?.id || 'Draft Mode'}</strong>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                {allEvidence.length} items attached
              </span>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 text-center md:text-right flex-shrink-0">
            <p className="text-[11px] text-slate-300 font-medium">Mandatory Coverage</p>
            <p className="text-2xl font-black text-white mt-0.5">
              {fulfilledMandatoryCategories} / {totalMandatoryCategories}
            </p>
            <p className="text-[10px] text-indigo-200 mt-1">Categories fulfilled</p>
          </div>
        </div>

        {/* Advisory Disclaimer */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-start gap-2 text-[11px] text-slate-300 leading-relaxed">
          <Info className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Official Guidance:</strong> Photographs and floor plans serve as preliminary desk scrutiny evidence.
            Uploading evidence assists the committee but does not substitute for statutory clearances or physical EVC inspection.
          </span>
        </div>
      </div>

      {/* FEEDBACK NOTICE */}
      {notice && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : notice.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-blue-50 border-blue-300 text-blue-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : notice.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
            )}
            <span className="font-medium">{notice.message}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="p-1 text-slate-400 hover:text-slate-600 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* CATEGORY FILTER PILLS */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <span className="text-slate-500 font-bold mr-1">Filter Categories:</span>
        <button
          onClick={() => setSelectedFilter('ALL')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
            selectedFilter === 'ALL'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          All Categories ({INFRASTRUCTURE_CATEGORIES.length})
        </button>
        {INFRASTRUCTURE_CATEGORIES.map((cfg) => {
          const count = getEvidenceForCategory(cfg.key).length;
          return (
            <button
              key={cfg.key}
              onClick={() => setSelectedFilter(cfg.key)}
              className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
                selectedFilter === cfg.key
                  ? 'bg-indigo-700 text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <span>{cfg.shortLabel}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  count > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* CATEGORY UPLOAD CARDS */}
      <div className="space-y-4">
        {filteredCategories.map((cfg) => {
          const Icon = cfg.icon;
          const items = getEvidenceForCategory(cfg.key);
          const isMandatory = isCategoryMandatory(cfg);
          const isUploading = uploadingCategory === cfg.key;
          const isAtLimit = items.length >= cfg.maxFiles;

          return (
            <div
              key={cfg.key}
              className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:border-slate-300 transition-all space-y-4"
            >
              {/* Category Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700 flex-shrink-0 mt-0.5">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{cfg.title}</h4>
                      {isMandatory ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          MANDATORY
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          OPTIONAL / RECOMMENDED
                        </span>
                      )}
                      {cfg.associatedRequirementId && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-50 text-blue-800 border border-blue-200">
                          {cfg.associatedRequirementId}
                        </span>
                      )}
                      <span className="text-[11px] font-bold text-slate-500">
                        ({items.length} / {cfg.maxFiles} uploaded)
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{cfg.description}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Permitted formats: <strong>{cfg.allowedExtensions.join(', ').toUpperCase()}</strong> • Max{' '}
                      <strong>{cfg.maxFileSizeMB} MB</strong> per file
                    </p>
                  </div>
                </div>

                {/* Upload Button */}
                <div className="flex-shrink-0 self-start sm:self-auto">
                  <input
                    type="file"
                    multiple
                    accept={cfg.allowedExtensions.join(',')}
                    ref={(el) => {
                      fileInputRefs.current[cfg.key] = el;
                    }}
                    onChange={(e) => handleFilesSelected(e, cfg)}
                    className="hidden"
                  />
                  <button
                    onClick={() => handleTriggerUpload(cfg.key)}
                    disabled={isUploading || isAtLimit || app?.status === 'Approved'}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs ${
                      isAtLimit
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                        : isUploading
                        ? 'bg-indigo-100 text-indigo-700 cursor-wait'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {isUploading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>{items.length === 0 ? 'Upload Evidence' : 'Add More Evidence'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Items List or Empty State */}
              {items.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <FolderPlus className="w-8 h-8 text-slate-400 mx-auto mb-1.5 opacity-60" />
                  <p className="text-xs font-bold text-slate-700">No evidence uploaded yet</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Click "Upload Evidence" to attach photographs or documents for this category.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {items.map((item) => {
                    const isPdf =
                      item.fileType === 'application/pdf' || (item.fileName || '').toLowerCase().endsWith('.pdf');

                    return (
                      <div
                        key={item.id}
                        className="p-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl space-y-2 transition-all flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          {/* Thumbnail / File representation */}
                          {item.fileDataUrl && !isPdf ? (
                            <div
                              onClick={() => setPreviewItem(item)}
                              className="h-28 w-full rounded-lg overflow-hidden border border-slate-200 bg-slate-200 cursor-pointer relative group"
                            >
                              <img
                                src={item.fileDataUrl}
                                alt={item.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold gap-1">
                                <Eye className="w-4 h-4" />
                                <span>Preview</span>
                              </div>
                            </div>
                          ) : (
                            <div
                              onClick={() => setPreviewItem(item)}
                              className="h-28 w-full rounded-lg border border-slate-200 bg-indigo-50/50 flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-100/50 transition-colors text-indigo-700 p-2 text-center"
                            >
                              {isPdf ? <Layers className="w-8 h-8 mb-1" /> : <Camera className="w-8 h-8 mb-1" />}
                              <span className="text-[11px] font-bold truncate max-w-[90%]">{item.fileName}</span>
                              <span className="text-[10px] text-slate-500">{isPdf ? 'PDF Drawing' : 'Attached File'}</span>
                            </div>
                          )}

                          {/* File Details */}
                          <div>
                            <p className="text-xs font-bold text-slate-900 truncate" title={item.title}>
                              {item.title}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono truncate" title={item.fileName}>
                              {item.fileName} {item.fileSize ? `• ${item.fileSize}` : ''}
                            </p>
                          </div>

                          {/* Status and Timestamp */}
                          <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] pt-1 border-t border-slate-200/60">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold ${
                                item.status === 'ACCEPTED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.status === 'FLAGGED'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.status === 'ACCEPTED'
                                ? 'Accepted'
                                : item.status === 'FLAGGED'
                                ? 'Flagged by Officer'
                                : 'Pending Scrutiny'}
                            </span>
                            <span className="text-slate-400">{item.uploadDate}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="pt-2 flex items-center justify-between border-t border-slate-200/60">
                          <button
                            onClick={() => setPreviewItem(item)}
                            className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Preview</span>
                          </button>
                          <button
                            onClick={() => handleRemove(item.id, item.title)}
                            disabled={app?.status === 'Approved'}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1 disabled:opacity-40"
                            title="Remove this evidence item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FULL-SIZE PREVIEW MODAL */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="space-y-0.5">
                <h4 className="text-sm font-bold text-slate-900">{previewItem.title}</h4>
                <p className="text-xs text-slate-500 font-mono">
                  {previewItem.fileName} • {previewItem.fileSize || 'N/A'} • Uploaded {previewItem.uploadDate}
                </p>
              </div>
              <button
                onClick={() => setPreviewItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Media Content */}
            <div className="bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center p-2 min-h-[240px]">
              {previewItem.fileDataUrl ? (
                previewItem.fileType === 'application/pdf' ||
                (previewItem.fileName || '').toLowerCase().endsWith('.pdf') ? (
                  <iframe
                    src={previewItem.fileDataUrl}
                    title={previewItem.title}
                    className="w-full h-96 rounded border border-slate-200"
                  />
                ) : (
                  <img
                    src={previewItem.fileDataUrl}
                    alt={previewItem.title}
                    className="max-h-96 max-w-full object-contain rounded"
                  />
                )
              ) : (
                <div className="text-center p-8 text-slate-500 space-y-2">
                  <Camera className="w-12 h-12 text-slate-400 mx-auto" />
                  <p className="text-xs font-semibold">Simulated evidence record</p>
                  <p className="text-[11px] text-slate-400">File attached in persistent local simulation mode.</p>
                </div>
              )}
            </div>

            {/* Review Status & Metadata Card */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">Scrutiny Status:</span>
                <span
                  className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                    previewItem.status === 'ACCEPTED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : previewItem.status === 'FLAGGED'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {previewItem.status || 'PENDING REVIEW'}
                </span>
              </div>
              {previewItem.reviewerRemarks && (
                <p className="text-slate-800 text-[11px] pt-1">
                  <strong>Officer Remarks:</strong> {previewItem.reviewerRemarks}
                </p>
              )}
              {previewItem.visualAnalysisSummary && (
                <p className="text-slate-600 text-[11px]">
                  <strong>System Observation:</strong> {previewItem.visualAnalysisSummary}
                </p>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t">
              {previewItem.fileDataUrl ? (
                <a
                  href={previewItem.fileDataUrl}
                  download={previewItem.fileName}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download File</span>
                </a>
              ) : (
                <div />
              )}
              <button
                onClick={() => setPreviewItem(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
