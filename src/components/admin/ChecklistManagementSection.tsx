import React, { useState, useEffect } from 'react';
import { ApplicationType, ChecklistRequirement } from '../../types';
import {
  getChecklistRequirements,
  createChecklistRequirement,
  updateChecklistRequirement,
  deleteChecklistRequirement,
  reorderChecklistRequirements,
} from '../../services/dataService';
import {
  FileCheck,
  Plus,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  X,
  Check,
  FileText,
  Info,
  Layers,
  Building2,
  GraduationCap,
  Sparkles,
  HelpCircle,
  AlertTriangle
} from 'lucide-react';

const PREDEFINED_CATEGORIES = [
  'Institutional Details',
  'Faculty',
  'Infrastructure',
  'Financial Documents',
  'Regulatory Certificates',
  'Safety & Compliance',
  'Affiliation',
];

const FILE_TYPE_OPTIONS = [
  { label: 'PDF (.pdf)', value: '.pdf' },
  { label: 'PNG (.png)', value: '.png' },
  { label: 'JPG (.jpg)', value: '.jpg' },
  { label: 'JPEG (.jpeg)', value: '.jpeg' },
];

export const ChecklistManagementSection: React.FC = () => {
  const [selectedType, setSelectedType] = useState<ApplicationType>('EOA');
  const [requirements, setRequirements] = useState<ChecklistRequirement[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState<ChecklistRequirement | null>(null);
  const [deletingRequirement, setDeletingRequirement] = useState<ChecklistRequirement | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState(PREDEFINED_CATEGORIES[0]);
  const [formCustomCategory, setFormCustomCategory] = useState('');
  const [formIsMandatory, setFormIsMandatory] = useState(true);
  const [formAllowedTypes, setFormAllowedTypes] = useState<string[]>(['.pdf']);
  const [formMaxSizeMB, setFormMaxSizeMB] = useState(5);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    loadRequirements();
  }, [selectedType]);

  const loadRequirements = async () => {
    setLoading(true);
    try {
      // Admin sees both active and inactive requirements
      const list = await getChecklistRequirements(selectedType, false);
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

  const openAddModal = () => {
    setFormTitle('');
    setFormDescription('');
    setFormCategory(PREDEFINED_CATEGORIES[0]);
    setFormCustomCategory('');
    setFormIsMandatory(true);
    setFormAllowedTypes(['.pdf']);
    setFormMaxSizeMB(5);
    setFormIsActive(true);
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (req: ChecklistRequirement) => {
    setEditingRequirement(req);
    setFormTitle(req.title);
    setFormDescription(req.description);
    if (PREDEFINED_CATEGORIES.includes(req.category)) {
      setFormCategory(req.category);
      setFormCustomCategory('');
    } else {
      setFormCategory('CUSTOM');
      setFormCustomCategory(req.category);
    }
    setFormIsMandatory(req.isMandatory);
    setFormAllowedTypes(req.allowedFileTypes);
    setFormMaxSizeMB(req.maxFileSizeMB);
    setFormIsActive(req.isActive);
    setFormError(null);
  };

  const handleToggleAllowedType = (val: string) => {
    if (formAllowedTypes.includes(val)) {
      if (formAllowedTypes.length > 1) {
        setFormAllowedTypes(formAllowedTypes.filter((t) => t !== val));
      } else {
        setFormError('At least one file type must be permitted.');
      }
    } else {
      setFormAllowedTypes([...formAllowedTypes, val]);
      setFormError(null);
    }
  };

  const handleSaveRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setFormError('Document title is required.');
      return;
    }
    if (!formDescription.trim()) {
      setFormError('Document instructions/description are required.');
      return;
    }
    if (formAllowedTypes.length === 0) {
      setFormError('At least one allowed file type must be selected.');
      return;
    }

    const effectiveCategory =
      formCategory === 'CUSTOM' ? formCustomCategory.trim() || 'General' : formCategory;

    try {
      if (editingRequirement) {
        // Update existing
        await updateChecklistRequirement(editingRequirement.id, {
          title: formTitle.trim(),
          description: formDescription.trim(),
          category: effectiveCategory,
          isMandatory: formIsMandatory,
          allowedFileTypes: formAllowedTypes,
          maxFileSizeMB: formMaxSizeMB,
          isActive: formIsActive,
        });
        showNotice('success', `Checklist requirement "${formTitle.trim()}" updated successfully.`);
        setEditingRequirement(null);
      } else {
        // Create new
        const maxOrder = requirements.reduce((max, r) => Math.max(max, r.displayOrder), 0);
        await createChecklistRequirement({
          applicationType: selectedType,
          title: formTitle.trim(),
          description: formDescription.trim(),
          category: effectiveCategory,
          isMandatory: formIsMandatory,
          allowedFileTypes: formAllowedTypes,
          maxFileSizeMB: formMaxSizeMB,
          isActive: formIsActive,
          displayOrder: maxOrder + 1,
          academicYear: '2026-2027',
          isDemo: false,
        });
        showNotice('success', `New requirement "${formTitle.trim()}" added to ${selectedType} checklist.`);
        setIsAddModalOpen(false);
      }
      loadRequirements();
    } catch (err: any) {
      setFormError(err.message || 'Operation failed.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingRequirement) return;
    try {
      await deleteChecklistRequirement(deletingRequirement.id);
      showNotice('success', `Requirement "${deletingRequirement.title}" deleted.`);
      setDeletingRequirement(null);
      loadRequirements();
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to delete requirement.');
    }
  };

  const handleToggleActive = async (req: ChecklistRequirement) => {
    try {
      await updateChecklistRequirement(req.id, { isActive: !req.isActive });
      showNotice('success', `"${req.title}" is now ${!req.isActive ? 'Active (Visible to colleges)' : 'Disabled (Hidden from colleges)'}.`);
      loadRequirements();
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to update requirement status.');
    }
  };

  const handleMoveOrder = async (index: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= requirements.length) return;

    const newReqs = [...requirements];
    const temp = newReqs[index];
    newReqs[index] = newReqs[targetIndex];
    newReqs[targetIndex] = temp;

    const orderedIds = newReqs.map((r) => r.id);
    try {
      await reorderChecklistRequirements(selectedType, orderedIds);
      setRequirements(newReqs);
      showNotice('success', 'Checklist display order updated.');
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to reorder requirements.');
      loadRequirements();
    }
  };

  // Filtered requirements
  const filteredRequirements = requirements.filter((req) => {
    const matchesSearch =
      req.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategoryFilter === 'ALL' || req.category === selectedCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Unique categories in current list for filter
  const currentCategories = Array.from(new Set(requirements.map((r) => r.category)));

  const totalCount = requirements.length;
  const mandatoryCount = requirements.filter((r) => r.isMandatory).length;
  const optionalCount = requirements.filter((r) => !r.isMandatory).length;
  const activeCount = requirements.filter((r) => r.isActive).length;
  const disabledCount = requirements.filter((r) => !r.isActive).length;

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
          <button
            onClick={() => setNotification(null)}
            className="p-1 hover:bg-black/5 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider bg-blue-500/20 text-sky-300 px-3 py-0.5 rounded-full border border-blue-500/30">
                Council Scrutiny Configuration
              </span>
              <span className="text-xs text-slate-400 font-mono">
                APH Dynamic Rules Engine
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white">
              Document Checklist Management
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Define, configure, and publish mandatory & optional compliance document requirements. 
              Changes made here immediately update the upload dossier presented to applicant colleges.
            </p>
          </div>

          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Requirement</span>
          </button>
        </div>

        {/* Quick Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6 pt-5 border-t border-slate-800 text-xs">
          <div className="bg-white/5 p-2.5 rounded-lg border border-white/10">
            <p className="text-slate-400 text-[10px]">Total Checklist Items</p>
            <p className="text-lg font-bold text-white mt-0.5">{totalCount}</p>
          </div>
          <div className="bg-white/5 p-2.5 rounded-lg border border-white/10">
            <p className="text-rose-300 text-[10px]">Mandatory Documents</p>
            <p className="text-lg font-bold text-white mt-0.5">{mandatoryCount}</p>
          </div>
          <div className="bg-white/5 p-2.5 rounded-lg border border-white/10">
            <p className="text-blue-300 text-[10px]">Optional Documents</p>
            <p className="text-lg font-bold text-white mt-0.5">{optionalCount}</p>
          </div>
          <div className="bg-white/5 p-2.5 rounded-lg border border-white/10">
            <p className="text-emerald-300 text-[10px]">Active (Visible)</p>
            <p className="text-lg font-bold text-emerald-400 mt-0.5">{activeCount}</p>
          </div>
          <div className="bg-white/5 p-2.5 rounded-lg border border-white/10">
            <p className="text-amber-300 text-[10px]">Disabled (Hidden)</p>
            <p className="text-lg font-bold text-amber-300 mt-0.5">{disabledCount}</p>
          </div>
        </div>
      </div>

      {/* Regulatory Accuracy Disclaimer Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-900">
        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-bold">Illustrative Demo Checklist Notice (SIH Problem Statement 26261)</p>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            The seeded items below are sample templates for prototype evaluation and do not represent verified, official AICTE APH regulations. 
            AICTE Officers have full administrative authority to add, update, reorder, or purge items to match authentic council gazettes.
          </p>
        </div>
      </div>

      {/* Application Track Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedType('EOA')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              selectedType === 'EOA'
                ? 'bg-blue-800 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Extension of Approval (EoA) Checklist</span>
          </button>

          <button
            onClick={() => setSelectedType('NEW_APPROVAL')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              selectedType === 'NEW_APPROVAL'
                ? 'bg-indigo-800 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>New Technical Institution Checklist</span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-center gap-2">
          {/* Category Filter */}
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-auto"
          >
            <option value="ALL">All Categories ({requirements.length})</option>
            {currentCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Search */}
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search requirements..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Checklist Table / List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-blue-700" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              {selectedType === 'EOA' ? 'Extension of Approval' : 'New Approval'} Scrutiny Requirements
            </span>
            <span className="text-xs text-slate-500">
              ({filteredRequirements.length} items)
            </span>
          </div>

          <span className="text-[11px] text-slate-500">
            Order reflects sequence displayed to applicants
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Loading checklist requirements...
          </div>
        ) : filteredRequirements.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <FileText className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-bold text-slate-700">No requirements found</p>
            <p className="text-[11px] text-slate-500">
              {searchTerm || selectedCategoryFilter !== 'ALL'
                ? 'Try adjusting your search query or category filter.'
                : 'Click "+ Add New Requirement" to create the first document rule.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredRequirements.map((req, index) => (
              <div
                key={req.id}
                className={`p-4 transition-colors ${
                  !req.isActive ? 'bg-slate-50/70 opacity-75' : 'hover:bg-slate-50/50'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  {/* Left: Info */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Reorder Buttons */}
                    <div className="flex flex-col gap-1 items-center flex-shrink-0 pt-0.5">
                      <button
                        onClick={() => handleMoveOrder(index, 'UP')}
                        disabled={index === 0}
                        className="p-1 text-slate-400 hover:text-blue-700 disabled:opacity-20 disabled:hover:text-slate-400 rounded hover:bg-slate-100 transition-colors"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] font-mono text-slate-400 font-bold">
                        #{req.displayOrder}
                      </span>
                      <button
                        onClick={() => handleMoveOrder(index, 'DOWN')}
                        disabled={index === requirements.length - 1}
                        className="p-1 text-slate-400 hover:text-blue-700 disabled:opacity-20 disabled:hover:text-slate-400 rounded hover:bg-slate-100 transition-colors"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">
                          {req.title}
                        </span>

                        {req.isMandatory ? (
                          <span className="text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.2 rounded-full">
                            Mandatory
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.2 rounded-full">
                            Optional
                          </span>
                        )}

                        <span className="text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.2 rounded-full">
                          {req.category}
                        </span>

                        {req.isDemo && (
                          <span className="text-[9px] font-mono bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded">
                            Demo Template
                          </span>
                        )}

                        {!req.isActive && (
                          <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.2 rounded-full">
                            Disabled (Hidden from College)
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed">
                        {req.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-1">
                        <span>
                          Allowed Types: <strong className="text-slate-700 font-mono">{req.allowedFileTypes.join(', ')}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Max Size: <strong className="text-slate-700">{req.maxFileSizeMB} MB</strong>
                        </span>
                        <span>•</span>
                        <span className="font-mono text-[10px] text-slate-400">
                          ID: {req.id}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 self-end md:self-start flex-shrink-0 pt-1">
                    {/* Toggle Active Button */}
                    <button
                      onClick={() => handleToggleActive(req)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                        req.isActive
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                      }`}
                      title={req.isActive ? 'Click to disable' : 'Click to enable'}
                    >
                      {req.isActive ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Active</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5 text-slate-400" />
                          <span>Disabled</span>
                        </>
                      )}
                    </button>

                    {/* Edit Button */}
                    <button
                      onClick={() => openEditModal(req)}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                      title="Edit Requirement"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={() => setDeletingRequirement(req)}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                      title="Delete Requirement"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {(isAddModalOpen || editingRequirement) && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-sky-300 tracking-wider">
                  {selectedType === 'EOA' ? 'Extension of Approval' : 'New Approval'}
                </span>
                <h3 className="text-base font-bold text-white">
                  {editingRequirement ? 'Edit Document Requirement' : 'Add New Document Requirement'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingRequirement(null);
                }}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveRequirement} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Title */}
              <div className="space-y-1">
                <label className="font-bold text-slate-800">
                  Document Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Fire Safety Certificate & NOC"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="font-bold text-slate-800">
                  Instructions / Description for Colleges <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain exactly what authority must issue the document, validity requirements, or required endorsements..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs"
                />
              </div>

              {/* Category */}
              <div className="space-y-1">
                <label className="font-bold text-slate-800">Checklist Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-1 focus:ring-blue-500 text-xs bg-white"
                >
                  {PREDEFINED_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="CUSTOM">+ Custom Category...</option>
                </select>

                {formCategory === 'CUSTOM' && (
                  <input
                    type="text"
                    placeholder="Enter custom category name"
                    value={formCustomCategory}
                    onChange={(e) => setFormCustomCategory(e.target.value)}
                    className="w-full mt-2 px-3 py-2 border border-blue-300 bg-blue-50/30 rounded-lg text-slate-900 text-xs"
                  />
                )}
              </div>

              {/* Mandatory & Active Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">Mandatory Status</span>
                    <button
                      type="button"
                      onClick={() => setFormIsMandatory(!formIsMandatory)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        formIsMandatory ? 'bg-rose-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          formIsMandatory ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {formIsMandatory
                      ? 'Required: Application cannot be submitted without this file.'
                      : 'Optional: College may submit application without this document.'}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">Enable Requirement</span>
                    <button
                      type="button"
                      onClick={() => setFormIsActive(!formIsActive)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        formIsActive ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          formIsActive ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {formIsActive
                      ? 'Active: Immediately visible on the college document upload portal.'
                      : 'Disabled: Hidden from colleges; retained in council database.'}
                  </p>
                </div>
              </div>

              {/* Permitted File Types */}
              <div className="space-y-1.5 pt-1">
                <label className="font-bold text-slate-800">Permitted File Types</label>
                <div className="flex flex-wrap gap-2">
                  {FILE_TYPE_OPTIONS.map((opt) => {
                    const isSelected = formAllowedTypes.includes(opt.value);
                    return (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => handleToggleAllowedType(opt.value)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                          isSelected
                            ? 'bg-blue-50 border-blue-400 text-blue-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '} {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Maximum File Size */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">
                    Maximum File Size Limit: <strong className="text-blue-700">{formMaxSizeMB} MB</strong>
                  </label>
                  <span className="text-[11px] text-slate-500">Max recommended: 25 MB</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="25"
                  step="1"
                  value={formMaxSizeMB}
                  onChange={(e) => setFormMaxSizeMB(Number(e.target.value))}
                  className="w-full accent-blue-700"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingRequirement(null);
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-800 hover:bg-blue-900 text-white rounded-lg text-xs font-bold shadow transition-colors"
                >
                  {editingRequirement ? 'Update Requirement' : 'Save Requirement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingRequirement && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto border border-rose-300">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                Delete Requirement?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to permanently delete{' '}
                <strong className="text-slate-900">"{deletingRequirement.title}"</strong>?
              </p>
              <p className="text-[11px] text-rose-600 pt-1">
                Colleges will no longer be asked to submit this document in future submissions.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setDeletingRequirement(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold shadow"
              >
                Yes, Delete Requirement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
