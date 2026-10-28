import React, { useState, useEffect } from 'react';
import {
  FileText,
  ScanText,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Sparkles,
  Search,
  Languages,
  Info,
  ShieldCheck,
  Building2,
  Calendar,
  Layers,
  Clock,
} from 'lucide-react';
import {
  RequiredDocument,
  DocumentOcrResult,
  OcrMethod,
  CollegeApplication,
  ChecklistRequirement,
  DocumentValidationResult,
  ValidationCheckFinding,
} from '../../types';
import { extractTextFromDocument, OcrProgress } from '../../services/ocrService';
import {
  saveDocumentOcrResult,
  saveDocumentValidationResult,
  getApplicationById,
  getChecklistRequirements,
  checkDocumentDuplicates,
} from '../../services/dataService';
import {
  validateDocumentOcrText,
  VERIFICATION_DISCLAIMER,
} from '../../services/documentValidationService';

interface DocumentOcrViewerProps {
  doc: RequiredDocument;
  appId?: string;
  application?: CollegeApplication;
  requirement?: ChecklistRequirement;
  onOcrSaved?: (updatedDoc: RequiredDocument) => void;
  className?: string;
}

export const DocumentOcrViewer: React.FC<DocumentOcrViewerProps> = ({
  doc,
  appId,
  application: initialApp,
  requirement: initialReq,
  onOcrSaved,
  className = '',
}) => {
  const [isExtracting, setIsExtracting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<'eng' | 'hin' | 'eng+hin'>('eng');
  const [appContext, setAppContext] = useState<CollegeApplication | undefined>(initialApp);
  const [reqContext, setReqContext] = useState<ChecklistRequirement | undefined>(initialReq);
  const [activeTab, setActiveTab] = useState<'text' | 'validation' | 'duplicate'>('validation');

  // Load contextual application and requirement if not directly provided
  useEffect(() => {
    let isMounted = true;
    async function loadContext() {
      if (!appContext && appId) {
        try {
          const app = await getApplicationById(appId);
          if (app && isMounted) {
            setAppContext(app);
            const reqs = await getChecklistRequirements(app.type);
            const matchingReq = reqs.find((r) => r.id === (doc.requirementId || doc.id));
            if (matchingReq && isMounted) setReqContext(matchingReq);
          }
        } catch {
          // Silent fallback
        }
      } else if (appContext && !reqContext) {
        try {
          const reqs = await getChecklistRequirements(appContext.type);
          const matchingReq = reqs.find((r) => r.id === (doc.requirementId || doc.id));
          if (matchingReq && isMounted) setReqContext(matchingReq);
        } catch {
          // Silent fallback
        }
      }
    }
    loadContext();
    return () => {
      isMounted = false;
    };
  }, [appId, doc.requirementId, doc.id, appContext, reqContext]);

  // Existing OCR result if stored
  const currentResult: DocumentOcrResult | undefined =
    doc.ocrResult ||
    (doc.extractedText
      ? {
          text: doc.extractedText,
          method: doc.ocrMethod || 'native_pdf',
          extractedAt: doc.ocrExtractedAt || doc.uploadDate || new Date().toISOString(),
          charCount: doc.extractedText.length,
          wordCount: doc.extractedText.split(/\s+/).filter(Boolean).length,
          language: 'eng',
        }
      : undefined);

  // Existing Validation result if stored
  const currentValidation: DocumentValidationResult | undefined = doc.validationResult;

  // Check if existing validation is stale relative to current document version
  const isStaleValidation = Boolean(
    currentValidation &&
    doc.version !== undefined &&
    currentValidation.documentVersion !== undefined &&
    currentValidation.documentVersion !== doc.version
  );

  const handleStartExtraction = async () => {
    if (!doc.fileDataUrl) {
      setError('Document file data is not available. Please ensure the document is uploaded.');
      return;
    }

    setIsExtracting(true);
    setError(null);
    setProgress({ status: 'Starting extraction...', progress: 0 });

    try {
      const result = await extractTextFromDocument(doc.fileDataUrl, doc.fileType, doc.fileName, {
        language: selectedLanguage,
        maxPdfPages: 5,
        onProgress: (p) => setProgress(p),
      });

      // Persist to service if appId is present
      if (appId) {
        const reqId = doc.requirementId || doc.id;
        const updatedApp = await saveDocumentOcrResult(appId, reqId, result);
        const updatedDoc = updatedApp.documents.find((d) => d.id === reqId || d.requirementId === reqId);
        if (updatedDoc && onOcrSaved) {
          onOcrSaved(updatedDoc);
        }
      } else if (onOcrSaved) {
        onOcrSaved({
          ...doc,
          ocrResult: result,
          extractedText: result.text,
          ocrExtractedAt: result.extractedAt,
          ocrMethod: result.method,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred during OCR text extraction.';
      setError(msg);
    } finally {
      setIsExtracting(false);
      setProgress(null);
    }
  };

  const handleRunValidation = async () => {
    if (!currentResult?.text) {
      setError('No OCR text available to analyze. Please extract document text first.');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      // Execute rule-based information extraction and checklist validation
      const validationResult = validateDocumentOcrText(
        doc,
        currentResult.text,
        appContext,
        reqContext
      );

      // Persist validation result if appId is present
      if (appId) {
        const reqId = doc.requirementId || doc.id;
        const updatedApp = await saveDocumentValidationResult(appId, reqId, validationResult);
        const updatedDoc = updatedApp.documents.find((d) => d.id === reqId || d.requirementId === reqId);
        if (updatedDoc && onOcrSaved) {
          onOcrSaved(updatedDoc);
        }
      } else if (onOcrSaved) {
        onOcrSaved({
          ...doc,
          validationResult,
        });
      }

      setActiveTab('validation');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred during document validation.';
      setError(msg);
    } finally {
      setIsValidating(false);
    }
  };

  const handleCopyText = async () => {
    if (!currentResult?.text) return;
    try {
      await navigator.clipboard.writeText(currentResult.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = currentResult.text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRecheckDuplicates = async () => {
    if (!appId) return;
    setIsCheckingDuplicates(true);
    try {
      const result = await checkDocumentDuplicates(appId, doc.requirementId || doc.id);
      if (result && onOcrSaved) {
        onOcrSaved({
          ...doc,
          duplicateCheckResult: result,
        });
      }
    } catch (err: any) {
      console.error('Failed to check duplicates:', err);
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  const getMethodBadge = (method: OcrMethod) => {
    switch (method) {
      case 'native_pdf':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <FileText className="w-3 h-3 text-blue-600" />
            Digital Native PDF
          </span>
        );
      case 'ocr_pdf':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <Sparkles className="w-3 h-3 text-amber-600" />
            Scanned PDF OCR (Tesseract)
          </span>
        );
      case 'ocr_image':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <ScanText className="w-3 h-3 text-purple-600" />
            Image OCR (Tesseract)
          </span>
        );
    }
  };

  const getStatusBadge = (status: ValidationCheckFinding['status']) => {
    switch (status) {
      case 'PASS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-3 h-3 text-emerald-600" />
            Pass
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            Warning
          </span>
        );
      case 'NEEDS_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <AlertCircle className="w-3 h-3 text-rose-600" />
            Needs Review
          </span>
        );
      case 'NOT_CHECKED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <Info className="w-3 h-3 text-slate-500" />
            Not Checked
          </span>
        );
    }
  };

  const getVerdictBanner = (verdict: DocumentValidationResult['overallVerdict']) => {
    switch (verdict) {
      case 'SATISFACTORY':
        return {
          bg: 'bg-emerald-50 border-emerald-200 text-emerald-900',
          badge: 'bg-emerald-600 text-white',
          title: 'All Automated Checks Satisfactory',
          desc: 'Document text aligns with checklist requirements and application metadata. Proceed to official scrutiny inspection.',
        };
      case 'CAUTION_REVIEWS_NEEDED':
        return {
          bg: 'bg-amber-50 border-amber-200 text-amber-900',
          badge: 'bg-amber-600 text-white',
          title: 'Manual Scrutiny Review Recommended',
          desc: 'Automated rules detected items requiring officer manual inspection (e.g. unextracted dates or authority stamps).',
        };
      case 'DISCREPANCIES_FOUND':
        return {
          bg: 'bg-rose-50 border-rose-200 text-rose-900',
          badge: 'bg-rose-600 text-white',
          title: 'Discrepancies / Warnings Detected',
          desc: 'Document text contains potential mismatches (such as expired dates, mismatching institution, or missing serials).',
        };
      case 'INSUFFICIENT_DATA':
        return {
          bg: 'bg-slate-50 border-slate-300 text-slate-800',
          badge: 'bg-slate-700 text-white',
          title: 'Insufficient Readable Text',
          desc: 'Document text density is below threshold (< 30 characters). Check manual document preview.',
        };
    }
  };

  // Helper for search highlight
  const filteredText = currentResult?.text || '';
  const searchMatchesCount =
    searchTerm.trim().length > 1 && filteredText
      ? (filteredText.toLowerCase().match(new RegExp(searchTerm.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
      : 0;

  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-4 space-y-4 ${className}`}>
      {/* Top Banner / Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h5 className="text-xs font-black text-slate-900 tracking-tight">AI Document OCR & Information Validation</h5>
              <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded border border-indigo-200">
                AICTE Stage 1 & 2
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Extracts text and validates certificate details against official AICTE checklist rules
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {!isExtracting && (
            <div className="flex items-center gap-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-600">
              <Languages className="w-3.5 h-3.5 text-slate-500" />
              <select
                aria-label="OCR Language"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value as 'eng' | 'hin' | 'eng+hin')}
                className="bg-transparent font-medium text-slate-800 focus:outline-none text-xs cursor-pointer"
              >
                <option value="eng">English (eng)</option>
                <option value="hin">Hindi (hin)</option>
                <option value="eng+hin">English + Hindi</option>
              </select>
            </div>
          )}

          {/* OCR Trigger */}
          <button
            onClick={handleStartExtraction}
            disabled={isExtracting || !doc.fileDataUrl}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
              currentResult
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
            } disabled:opacity-50`}
          >
            {currentResult ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Re-extract OCR</span>
              </>
            ) : (
              <>
                <ScanText className="w-3.5 h-3.5" />
                <span>Extract Text (OCR)</span>
              </>
            )}
          </button>

          {/* Analyze & Validate Button */}
          {currentResult && (
            <button
              onClick={handleRunValidation}
              disabled={isValidating || isExtracting}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                currentValidation
                  ? 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
              } disabled:opacity-50`}
            >
              {isValidating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Validating...</span>
                </>
              ) : currentValidation ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>Re-analyze & Validate</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Analyze & Validate</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Extraction In-Progress Indicator */}
      {isExtracting && progress && (
        <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-200 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
              <span>{progress.status}</span>
            </div>
            <span className="font-mono text-indigo-700 font-black">{progress.progress}%</span>
          </div>

          <div className="w-full bg-indigo-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress.progress}%` }}
            />
          </div>

          <p className="text-[10px] text-indigo-700/80">
            Processing document pages safely in-browser. Scanned documents automatically engage Tesseract neural OCR.
          </p>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">
            <p className="font-bold">Processing Error</p>
            <p className="text-[11px] leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* If OCR text is available, render tabs between Extracted Text and Validation Findings */}
      {currentResult && !isExtracting && (
        <div className="space-y-3">
          {/* Navigation Tabs */}
          <div className="flex items-center justify-between border-b border-slate-200">
            <div className="flex items-center gap-2">
              {currentValidation && (
                <button
                  onClick={() => setActiveTab('validation')}
                  className={`px-3 py-1.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                    activeTab === 'validation'
                      ? 'border-blue-700 text-blue-800'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Validation Findings</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      currentValidation.summary.warnings > 0
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {currentValidation.summary.passed}/{currentValidation.findings.length}
                  </span>
                </button>
              )}

              <button
                onClick={() => setActiveTab('text')}
                className={`px-3 py-1.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === 'text' || !currentValidation
                    ? 'border-blue-700 text-blue-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Extracted OCR Text</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700 font-bold">
                  {currentResult.charCount.toLocaleString()} chars
                </span>
              </button>

              <button
                onClick={() => setActiveTab('duplicate')}
                className={`px-3 py-1.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === 'duplicate'
                    ? 'border-blue-700 text-blue-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Duplicate Check</span>
                {doc.duplicateCheckResult && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      doc.duplicateCheckResult.status === 'EXACT_DUPLICATE'
                        ? 'bg-rose-100 text-rose-800'
                        : doc.duplicateCheckResult.status === 'LIKELY_DUPLICATE'
                        ? 'bg-amber-100 text-amber-800'
                        : doc.duplicateCheckResult.status === 'POSSIBLE_DUPLICATE'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {doc.duplicateCheckResult.status === 'UNIQUE'
                      ? 'Unique'
                      : doc.duplicateCheckResult.status.replace('_', ' ')}
                  </span>
                )}
              </button>
            </div>

            {/* Quick Summary Pill if on text or duplicate tab */}
            {currentValidation && activeTab === 'text' && (
              <span className="text-[11px] text-slate-500 font-medium">
                Analysis Verdict:{' '}
                <strong className={currentValidation.summary.warnings > 0 ? 'text-rose-600' : 'text-emerald-700'}>
                  {currentValidation.overallVerdict.replace(/_/g, ' ')}
                </strong>
              </span>
            )}

            {activeTab === 'duplicate' && (
              <span className="text-[11px] text-slate-500 font-medium">
                Duplicate Status:{' '}
                <strong
                  className={
                    doc.duplicateCheckResult?.status === 'EXACT_DUPLICATE'
                      ? 'text-rose-600'
                      : doc.duplicateCheckResult?.status === 'LIKELY_DUPLICATE'
                      ? 'text-amber-600'
                      : doc.duplicateCheckResult?.status === 'POSSIBLE_DUPLICATE'
                      ? 'text-yellow-600'
                      : 'text-emerald-700'
                  }
                >
                  {(doc.duplicateCheckResult?.status || 'UNIQUE').replace(/_/g, ' ')}
                </strong>
              </span>
            )}
          </div>

          {/* ======================================================== */}
          {/* TAB 1: VALIDATION FINDINGS DASHBOARD                      */}
          {/* ======================================================== */}
          {activeTab === 'validation' && currentValidation && (
            <div className="space-y-4">
              {/* Overall Verdict Banner */}
              {(() => {
                const banner = getVerdictBanner(currentValidation.overallVerdict);
                return (
                  <div className={`p-3.5 rounded-xl border ${banner.bg} flex items-start justify-between gap-3`}>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${banner.badge}`}>
                          {currentValidation.overallVerdict.replace(/_/g, ' ')}
                        </span>
                        <h6 className="text-xs font-black">{banner.title}</h6>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">{banner.desc}</p>
                    </div>

                    {/* Summary Counters */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 text-xs">
                      <div className="text-center px-2 py-1 bg-white/80 rounded border border-slate-200">
                        <span className="text-emerald-700 font-black block">{currentValidation.summary.passed}</span>
                        <span className="text-[9px] text-slate-500 uppercase font-bold">Passed</span>
                      </div>
                      <div className="text-center px-2 py-1 bg-white/80 rounded border border-slate-200">
                        <span className="text-amber-700 font-black block">{currentValidation.summary.warnings}</span>
                        <span className="text-[9px] text-slate-500 uppercase font-bold">Warnings</span>
                      </div>
                      <div className="text-center px-2 py-1 bg-white/80 rounded border border-slate-200">
                        <span className="text-rose-700 font-black block">{currentValidation.summary.needsReview}</span>
                        <span className="text-[9px] text-slate-500 uppercase font-bold">Review</span>
                      </div>
                      <div className="text-center px-2 py-1 bg-white/80 rounded border border-slate-200">
                        <span className="text-slate-600 font-black block">{currentValidation.summary.notChecked}</span>
                        <span className="text-[9px] text-slate-500 uppercase font-bold">N/A</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Stale Validation Warning Banner if document version has incremented */}
              {isStaleValidation && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs flex items-start gap-2.5 shadow-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <p className="font-bold">Stale Validation Findings Detected</p>
                    <p className="text-[11px] leading-relaxed">
                      This document has been updated to <strong>version {doc.version}</strong>, but the displayed analysis was conducted on <strong>version {currentValidation.documentVersion}</strong>. Please click "Re-analyze & Validate" to refresh findings for the current document.
                    </p>
                  </div>
                  <button
                    onClick={handleRunValidation}
                    disabled={isValidating}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-bold transition-all flex items-center gap-1 flex-shrink-0 shadow-2xs"
                  >
                    <RefreshCw className={`w-3 h-3 ${isValidating ? 'animate-spin' : ''}`} />
                    <span>Re-analyze</span>
                  </button>
                </div>
              )}

              {/* Dedicated Authenticity Verification Status Card */}
              {doc.authorityVerificationResult ? (
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-3 shadow-2xs ${
                    doc.authorityVerificationResult.status === 'VERIFIED'
                      ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900'
                      : doc.authorityVerificationResult.status === 'DETAILS_MISMATCH' ||
                        doc.authorityVerificationResult.status === 'RECORD_NOT_FOUND'
                      ? 'bg-rose-50/80 border-rose-300 text-rose-900'
                      : doc.authorityVerificationResult.status === 'EXPIRED'
                      ? 'bg-amber-50/80 border-amber-300 text-amber-900'
                      : doc.authorityVerificationResult.status === 'MANUAL_REVIEW_REQUIRED'
                      ? 'bg-orange-50/80 border-orange-300 text-orange-900'
                      : 'bg-slate-50 border-slate-300 text-slate-800'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-white/90 border border-current">
                    {doc.authorityVerificationResult.status === 'VERIFIED' ? (
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                    ) : doc.authorityVerificationResult.status === 'DETAILS_MISMATCH' ||
                      doc.authorityVerificationResult.status === 'RECORD_NOT_FOUND' ? (
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                    ) : doc.authorityVerificationResult.status === 'EXPIRED' ? (
                      <Clock className="w-4 h-4 text-amber-600" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    )}
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-white/90 px-2 py-0.5 rounded border border-current">
                        {doc.authorityVerificationResult.isManualReview && doc.authorityVerificationResult.status === 'VERIFIED'
                          ? 'MANUALLY VERIFIED'
                          : `Issuing Authority: ${doc.authorityVerificationResult.status.replace(/_/g, ' ')}`}
                      </span>
                      <span className="text-[10px] font-mono font-bold bg-white/90 px-2 py-0.5 rounded border border-current">
                        Method: {doc.authorityVerificationResult.manualVerificationMethod || doc.authorityVerificationResult.method.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-xs font-black tracking-tight">
                      {doc.authorityVerificationResult.summary}
                    </p>
                    {doc.authorityVerificationResult.reviewerRemarks && (
                      <p className="text-[11px] leading-relaxed opacity-90">
                        Officer Remarks: {doc.authorityVerificationResult.reviewerRemarks}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-300 flex items-start gap-3 shadow-2xs">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center flex-shrink-0 text-amber-800">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded">
                        Authenticity Verification Status
                      </span>
                      <span className="text-[10px] font-mono font-bold text-amber-800 bg-white/90 px-2 py-0.5 rounded border border-amber-200">
                        AICTE Officer Decision-Support
                      </span>
                    </div>
                    <p className="text-xs font-black text-amber-950 tracking-tight">
                      AUTHENTICITY NOT VERIFIED — Official source verification is not performed yet.
                    </p>
                    <p className="text-[11px] text-amber-900/90 leading-relaxed">
                      This automated check analyzes extracted document text against AICTE checklist rules and application metadata. AICTE scrutiny officers can trigger official authority verification or record manual verification in the application modal.
                    </p>
                  </div>
                </div>
              )}

              {/* Checklist Requirement Baseline Card */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-700" />
                    <span>Checklist Requirement Baseline</span>
                  </span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">
                    {reqContext ? reqContext.id : (doc.requirementId || 'Standard Requirement')}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Requirement Title</span>
                    <strong className="text-slate-800 font-semibold">{reqContext?.title || doc.name}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Track / Category</span>
                    <strong className="text-slate-800 font-semibold">
                      {reqContext?.category || (appContext?.type === 'NEW_APPROVAL' ? 'New Approval' : 'EoA')}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Mandatory Requirement</span>
                    <strong className={`font-semibold ${reqContext?.isMandatory ? 'text-rose-700' : 'text-slate-600'}`}>
                      {reqContext?.isMandatory ? 'Yes (Mandatory)' : 'Optional'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Target Document File</span>
                    <strong className="text-slate-800 font-semibold truncate block">
                      v{doc.version || 1} {doc.fileName ? `(${doc.fileName})` : ''}
                    </strong>
                  </div>
                </div>
                {reqContext?.description && (
                  <div className="pt-1.5 border-t border-slate-200 text-[10px] text-slate-600 leading-relaxed">
                    <span className="font-bold text-slate-700">Requirement Scope:</span> {reqContext.description}
                  </div>
                )}
              </div>

              {/* Extracted Fields Summary Grid */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-700" />
                    <span>Extracted Document Entities</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">Rule-based pattern extraction</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Document / Certificate Type</span>
                    <strong className="text-slate-800 font-semibold">
                      {currentValidation.extractedFields.documentType || 'Not detected'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Certificate / Ref No.</span>
                    <strong className="font-mono text-slate-800 font-bold">
                      {currentValidation.extractedFields.certificateNumber || 'Not detected'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Issuing Authority</span>
                    <strong className="text-slate-800 font-semibold">
                      {currentValidation.extractedFields.issuingAuthority || 'Not detected'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Institution Name</span>
                    <strong className="text-slate-800 font-semibold">
                      {currentValidation.extractedFields.institutionName || 'Not detected'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Issue Date</span>
                    <strong className="text-slate-800 font-semibold">
                      {currentValidation.extractedFields.issueDate || 'Not detected'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Expiry / Validity Date</span>
                    <strong className="text-slate-800 font-semibold">
                      {currentValidation.extractedFields.expiryDate ||
                        (currentValidation.findings.find((f) => f.id === 'CHK-EXPIRY')?.status === 'NOT_CHECKED'
                          ? 'N/A (Permanent document)'
                          : 'Not detected')}
                    </strong>
                  </div>
                  {currentValidation.extractedFields.udin && (
                    <div>
                      <span className="text-slate-400 block text-[10px]">ICAI UDIN</span>
                      <strong className="font-mono text-cyan-900 font-bold">
                        {currentValidation.extractedFields.udin}
                      </strong>
                    </div>
                  )}
                  {currentValidation.extractedFields.academicYear && (
                    <div>
                      <span className="text-slate-400 block text-[10px]">Academic Year</span>
                      <strong className="text-blue-800 font-bold">
                        {currentValidation.extractedFields.academicYear}
                      </strong>
                    </div>
                  )}

                  {/* Any custom requirement details (FDR, Cadre, UDIN, etc.) */}
                  {currentValidation.extractedFields.specificDetails &&
                    Object.entries(currentValidation.extractedFields.specificDetails)
                      .filter(([key]) => key !== 'UDIN')
                      .map(([key, val]) => (
                        <div key={key}>
                          <span className="text-slate-400 block text-[10px]">{key}</span>
                          <strong className="text-slate-900 font-bold">{val}</strong>
                        </div>
                      ))}

                  {/* PDF Metadata Details if available */}
                  {currentValidation.pdfMetadata && (
                    <>
                      {currentValidation.pdfMetadata.creationDate && (
                        <div>
                          <span className="text-slate-400 block text-[10px]">PDF Creation Timestamp</span>
                          <strong className="font-mono text-[10px] text-slate-700 font-semibold truncate block">
                            {currentValidation.pdfMetadata.creationDate}
                          </strong>
                        </div>
                      )}
                      {currentValidation.pdfMetadata.modificationDate && (
                        <div>
                          <span className="text-slate-400 block text-[10px]">PDF Modification Timestamp</span>
                          <strong className="font-mono text-[10px] text-slate-700 font-semibold truncate block">
                            {currentValidation.pdfMetadata.modificationDate}
                          </strong>
                        </div>
                      )}
                      {currentValidation.pdfMetadata.producer && (
                        <div>
                          <span className="text-slate-400 block text-[10px]">PDF Producer Tool</span>
                          <strong className="text-[10px] text-slate-700 font-semibold truncate block">
                            {currentValidation.pdfMetadata.producer}
                          </strong>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Checklist Rules & Findings List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 pb-1">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-700" />
                    <span>Checklist & Document Intelligence Checks ({currentValidation.findings.length})</span>
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Target Track: <strong className="text-slate-800">{appContext?.type === 'NEW_APPROVAL' ? 'New Approval' : 'EoA'}</strong>
                  </span>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {currentValidation.findings.map((finding) => (
                    <div
                      key={finding.id}
                      className="p-3 bg-white rounded-lg border border-slate-200 space-y-2 shadow-2xs hover:border-slate-300 transition-all text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-[12px]">{finding.ruleName}</span>
                          {finding.categoryLabel && (
                            <span
                              className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                                finding.category === 'SUSPICIOUS_CHANGES'
                                  ? 'bg-purple-50 text-purple-800 border-purple-200'
                                  : finding.category === 'DATE_METADATA_ANOMALY'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : finding.category === 'IDENTIFIER_FORMAT'
                                  ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
                                  : finding.category === 'CROSS_DOCUMENT_CONSISTENCY'
                                  ? 'bg-orange-50 text-orange-800 border-orange-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {finding.categoryLabel}
                            </span>
                          )}
                        </div>
                        {getStatusBadge(finding.status)}
                      </div>

                      <p className="text-slate-600 text-[11px] leading-relaxed">{finding.reason}</p>

                      {/* Version Comparison Box (Previous vs Current Values) */}
                      {(finding.previousValue || finding.currentValue) && (
                        <div className="p-2 bg-purple-50/70 border border-purple-200 rounded-md space-y-1">
                          <span className="text-[9px] font-black uppercase tracking-wider text-purple-900 block">
                            Version Comparison (v{finding.previousVersion || 1} vs v{finding.currentVersion || 2})
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                            <div className="bg-white/90 p-1.5 rounded border border-purple-100">
                              <span className="text-[10px] text-slate-400 block font-semibold">Previous (v{finding.previousVersion || 1}):</span>
                              <span className="font-mono text-slate-700 font-bold break-all">
                                {finding.previousValue || 'None'}
                              </span>
                            </div>
                            <div className="bg-white/90 p-1.5 rounded border border-purple-100">
                              <span className="text-[10px] text-purple-700 block font-semibold">Current (v{finding.currentVersion || 2}):</span>
                              <span className="font-mono text-purple-950 font-bold break-all">
                                {finding.currentValue || 'None'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Comparison value if present */}
                      {finding.comparisonValue && !finding.previousValue && (
                        <div className="flex items-center gap-1.5 text-[10px] bg-slate-50 px-2 py-1 rounded border border-slate-200">
                          <span className="text-slate-400 font-medium">Comparison Baseline:</span>
                          <span className="font-mono text-slate-700 font-bold truncate max-w-md">
                            {finding.comparisonValue}
                          </span>
                        </div>
                      )}

                      {/* Evidence Snippet from OCR Text */}
                      {finding.evidenceSnippet && (
                        <div className="text-[10px] bg-indigo-50/50 text-indigo-950 p-2 rounded border border-indigo-100 font-mono italic">
                          <span className="not-italic font-sans font-bold text-indigo-700 text-[9px] uppercase tracking-wider block mb-0.5">
                            OCR Evidence Excerpt:
                          </span>
                          "{finding.evidenceSnippet}"
                        </div>
                      )}

                      {/* Suggested Officer Action */}
                      {finding.suggestedAction && (
                        <div className="flex items-start gap-1.5 text-[10px] bg-amber-50 text-amber-900 p-2 rounded border border-amber-200">
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-700 flex-shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <span className="font-bold text-amber-800 uppercase tracking-wider text-[9px] block">
                              Suggested Scrutiny Officer Action:
                            </span>
                            <span className="leading-relaxed">{finding.suggestedAction}</span>
                          </div>
                        </div>
                      )}

                      {/* Referenced Document in Dossier */}
                      {finding.relevantDocumentName && (
                        <div className="text-[10px] text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                          <span className="font-bold text-slate-700">Referenced Document:</span> {finding.relevantDocumentName}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Mandatory Regulatory Disclaimer Banner */}
              <div className="p-2.5 bg-slate-100 rounded-lg border border-slate-200 text-[10px] text-slate-600 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong className="text-slate-700">Audit Protocol Notice:</strong> {VERIFICATION_DISCLAIMER}
                </p>
              </div>
            </div>
          )}

          {/* Prompt to validate if on findings tab but not validated yet */}
          {activeTab === 'validation' && !currentValidation && (
            <div className="p-6 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center space-y-2">
              <Sparkles className="w-8 h-8 text-indigo-600 mx-auto" />
              <h6 className="text-xs font-bold text-slate-800">Checklist Validation Not Performed Yet</h6>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                OCR text is ready. Click <strong>"Analyze & Validate"</strong> to extract certificate details and run compliance checks against the official checklist.
              </p>
              <button
                onClick={handleRunValidation}
                disabled={isValidating}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center gap-1.5 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Run Automated Validation Now</span>
              </button>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: EXTRACTED OCR TEXT VIEWER                         */}
          {/* ======================================================== */}
          {activeTab === 'text' && (
            <div className="space-y-2.5">
              {/* Metadata Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  {getMethodBadge(currentResult.method)}
                  <span className="text-[11px] text-slate-500">
                    • <strong className="text-slate-800">{currentResult.charCount.toLocaleString()}</strong> characters
                  </span>
                  <span className="text-[11px] text-slate-500">
                    • <strong className="text-slate-800">{currentResult.wordCount.toLocaleString()}</strong> words
                  </span>
                  {currentResult.pageCount && (
                    <span className="text-[11px] text-slate-500">
                      • <strong className="text-slate-800">{currentResult.pageCount}</strong> pages
                    </span>
                  )}
                </div>

                <button
                  onClick={handleCopyText}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-[11px] font-bold shadow-2xs transition-all"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copy Text</span>
                    </>
                  )}
                </button>
              </div>

              {/* Keyword Search */}
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Find keyword in extracted document text (e.g. AICTE, affiliation, date)..."
                  className="w-full bg-transparent text-slate-900 placeholder:text-slate-400 focus:outline-none text-xs"
                />
                {searchTerm && (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 flex-shrink-0">
                    {searchMatchesCount} found
                  </span>
                )}
              </div>

              {/* Text Container */}
              <div className="p-3.5 bg-slate-950 text-slate-100 rounded-lg font-mono text-[11px] leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap select-text border border-slate-800 shadow-inner">
                {currentResult.text}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: DUPLICATE DETECTION DASHBOARD                     */}
          {/* ======================================================== */}
          {activeTab === 'duplicate' && (
            <div className="space-y-4">
              {/* Header Status Card */}
              {(() => {
                const dupResult = doc.duplicateCheckResult;
                const status = dupResult?.status || 'UNIQUE';
                const isExact = status === 'EXACT_DUPLICATE';
                const isLikely = status === 'LIKELY_DUPLICATE';
                const isPossible = status === 'POSSIBLE_DUPLICATE';

                const config = isExact
                  ? {
                      bg: 'bg-rose-50',
                      border: 'border-rose-300',
                      text: 'text-rose-900',
                      badge: 'bg-rose-700 text-white',
                      title: 'EXACT CRYPTOGRAPHIC DUPLICATE DETECTED',
                    }
                  : isLikely
                  ? {
                      bg: 'bg-amber-50',
                      border: 'border-amber-300',
                      text: 'text-amber-900',
                      badge: 'bg-amber-600 text-white',
                      title: 'LIKELY CERTIFICATE REFERENCE DUPLICATE DETECTED',
                    }
                  : isPossible
                  ? {
                      bg: 'bg-yellow-50',
                      border: 'border-yellow-300',
                      text: 'text-yellow-900',
                      badge: 'bg-yellow-600 text-white',
                      title: 'POSSIBLE TEXT SIMILARITY DUPLICATE WARNING',
                    }
                  : {
                      bg: 'bg-emerald-50',
                      border: 'border-emerald-200',
                      text: 'text-emerald-900',
                      badge: 'bg-emerald-700 text-white',
                      title: 'UNIQUE DOCUMENT — NO DUPLICATES DETECTED',
                    };

                return (
                  <div className={`p-4 rounded-xl border ${config.bg} ${config.border} ${config.text} space-y-2`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Copy className="w-4 h-4 flex-shrink-0" />
                        <h4 className="font-black text-xs tracking-wide uppercase">{config.title}</h4>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${config.badge}`}>
                        {status.replace('_', ' ')}
                      </span>
                    </div>

                    <p className="text-xs leading-relaxed font-medium">
                      {dupResult?.overallReason || 'No identical or highly similar documents found within this institution’s records.'}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-black/10 text-[11px]">
                      <div>
                        <span className="text-slate-500">File SHA-256 Hash:</span>
                        <p className="font-mono font-bold text-slate-800 break-all select-all">
                          {doc.fileHash || 'Calculating / Not indexed'}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Comparison Scope:</span>
                        <p className="font-semibold text-slate-800">
                          {dupResult?.comparisonScope === 'ALL_COLLEGE_APPLICATIONS'
                            ? 'All Applications of this Institution'
                            : 'Current Application Dossier'}{' '}
                          ({dupResult?.evaluatedDocumentsCount ?? 0} docs compared)
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 3 Methods Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Method A */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 text-xs shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">Method A: File Hash</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                        doc.duplicateCheckResult?.matches.some((m) => m.method === 'file_hash')
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {doc.duplicateCheckResult?.matches.some((m) => m.method === 'file_hash')
                        ? 'Match Found'
                        : 'Unique'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Cryptographic SHA-256 comparison. Identifies exact identical files even if renamed.
                  </p>
                </div>

                {/* Method B */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 text-xs shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">Method B: Cert Info</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                        doc.duplicateCheckResult?.matches.some((m) => m.method === 'certificate_info')
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {doc.duplicateCheckResult?.matches.some((m) => m.method === 'certificate_info')
                        ? 'Likely Match'
                        : 'Unique'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Matches normalized certificate number & authority. Different cert numbers are never flagged.
                  </p>
                </div>

                {/* Method C */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 text-xs shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">Method C: Text Similarity</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                        doc.duplicateCheckResult?.matches.some((m) => m.method === 'ocr_similarity')
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {doc.duplicateCheckResult?.matches.some((m) => m.method === 'ocr_similarity')
                        ? 'Similar (≥80%)'
                        : 'Below Threshold'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Deterministic word and bigram Jaccard analysis (80% threshold). Advisory warning only.
                  </p>
                </div>
              </div>

              {/* Matched Documents List */}
              {doc.duplicateCheckResult?.matches && doc.duplicateCheckResult.matches.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Matched Reference Documents ({doc.duplicateCheckResult.matches.length})</span>
                  </h5>
                  <div className="space-y-2">
                    {doc.duplicateCheckResult.matches.map((m, mIdx) => (
                      <div
                        key={mIdx}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="font-bold text-slate-900">
                            {m.matchedRequirementTitle}
                          </span>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                            App: {m.matchedApplicationId} ({m.matchedApplicationType})
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">{m.reason}</p>
                        {m.matchedFileName && (
                          <p className="text-[10px] text-slate-500 font-mono">
                            File: {m.matchedFileName} {m.matchedVersion ? `(v${m.matchedVersion})` : ''}
                          </p>
                        )}
                        {m.comparisonDetails && (
                          <div className="p-2 bg-white rounded border border-slate-200 text-[10px] font-mono grid grid-cols-2 gap-2 mt-1">
                            <div>
                              <span className="text-slate-400">Current Document:</span>
                              <p className="font-semibold text-slate-800 truncate">
                                {m.comparisonDetails.targetValue}
                              </p>
                            </div>
                            <div>
                              <span className="text-slate-400">Matched Document:</span>
                              <p className="font-semibold text-slate-800 truncate">
                                {m.comparisonDetails.matchedValue}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Officer Decision Support Notice */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
                  <span>Officer Decision Support Mandate</span>
                </div>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  The scrutiny officer makes the final regulatory determination. Duplicate detection alerts serve strictly as advisory decision support and do not automatically accept, reject, or mark documents for replacement.
                </p>
                <p className="text-[10px] text-blue-600 italic pt-1">
                  {doc.duplicateCheckResult?.notice ||
                    'Local Simulation Mode: Scope restricted to this institution’s local dossier.'}
                </p>
              </div>

              {/* Re-run button */}
              {appId && (
                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleRecheckDuplicates}
                    disabled={isCheckingDuplicates}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingDuplicates ? 'animate-spin' : ''}`} />
                    <span>{isCheckingDuplicates ? 'Checking Duplicates...' : 'Re-run Duplicate Check'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Notice when OCR not extracted yet */}
      {!currentResult && !isExtracting && !error && (
        <div className="space-y-3">
          {doc.duplicateCheckResult && doc.duplicateCheckResult.status !== 'UNIQUE' && (
            <div
              className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                doc.duplicateCheckResult.status === 'EXACT_DUPLICATE'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : doc.duplicateCheckResult.status === 'LIKELY_DUPLICATE'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-yellow-50 border-yellow-200 text-yellow-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold">
                  <Copy className="w-4 h-4" />
                  <span>
                    {doc.duplicateCheckResult.status === 'EXACT_DUPLICATE'
                      ? 'Pre-OCR Alert: Exact Duplicate File Detected'
                      : doc.duplicateCheckResult.status === 'LIKELY_DUPLICATE'
                      ? 'Pre-OCR Alert: Likely Duplicate Certificate'
                      : 'Pre-OCR Alert: Text Similarity Warning'}
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold bg-white/80 border border-current">
                  {doc.duplicateCheckResult.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed">
                {doc.duplicateCheckResult.overallReason}
              </p>
              {doc.fileHash && (
                <p className="text-[10px] font-mono opacity-80">
                  SHA-256: {doc.fileHash}
                </p>
              )}
            </div>
          )}

          <div className="p-4 bg-slate-50 rounded-lg border border-dashed border-slate-300 text-center space-y-1">
            <p className="text-xs font-semibold text-slate-700">
              Document text has not been extracted yet.
            </p>
            <p className="text-[11px] text-slate-500">
              Click <strong>"Extract Text (OCR)"</strong> above to extract text and analyze compliance against AICTE rules.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
