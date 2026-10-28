import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CollegeApplication } from '../../types';
import { CollegeDocumentChecklist } from './CollegeDocumentChecklist';
import { CollegeInfrastructureSection } from './CollegeInfrastructureSection';
import {
  Building2,
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowLeft,
  UploadCloud,
  FileCheck2,
  Info,
  Calendar,
  Layers,
  ChevronRight,
  ShieldCheck,
  Camera
} from 'lucide-react';

interface Props {
  application?: CollegeApplication | null;
  onBack: () => void;
  onSelectApplication?: (app: CollegeApplication) => void;
}

export const EoASection: React.FC<Props> = ({ application: initialApp, onBack, onSelectApplication }) => {
  const { college } = useAuth();
  const [currentApp, setCurrentApp] = useState<CollegeApplication | null>(initialApp || null);
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'infrastructure' | 'norms'>('overview');

  useEffect(() => {
    setCurrentApp(initialApp || null);
  }, [initialApp]);

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 hover:text-blue-900 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Category Selection</span>
        </button>

        <span className="text-xs bg-blue-100 text-blue-800 font-bold px-3 py-1 rounded-full border border-blue-200">
          Academic Year 2026–2027 Cycle
        </span>
      </div>

      {/* Main Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white rounded-2xl p-6 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 bg-blue-700/80 text-blue-200 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
              <Building2 className="w-3 h-3 text-sky-300" />
              <span>Track 1: Institutional Continuation</span>
            </div>
            <h2 className="text-2xl font-black">
              Extension of Approval (EoA)
            </h2>
            <p className="text-xs text-blue-100 max-w-2xl leading-relaxed">
              Mandatory annual approval extension for institutions already approved by AICTE. 
              Enables continuation of existing programs, increase/reduction in intake, addition of new disciplines, or closure of existing courses.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 text-center md:text-right flex-shrink-0">
            <p className="text-[11px] text-blue-200">Current Application Status</p>
            <p className="text-lg font-bold text-white mt-0.5">
              {currentApp ? currentApp.status : 'Ready to Initiate'}
            </p>
            <p className="text-[10px] text-sky-300 mt-1">
              AICTE ID: {college?.collegeId || '1-10972341'}
            </p>
            <button
              onClick={() => setActiveTab('documents')}
              className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold bg-white text-blue-900 hover:bg-blue-50 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
            >
              <UploadCloud className="w-3.5 h-3.5 text-blue-700" />
              <span>Upload / Review Documents</span>
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-4 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 px-1 border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-blue-700 text-blue-800 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Application Overview & Timeline
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          className={`pb-3 px-1 border-b-2 transition-colors ${
            activeTab === 'documents'
              ? 'border-blue-700 text-blue-800 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Mandatory Scrutiny Documents ({currentApp?.documents?.filter(d => d.status !== 'NOT_UPLOADED').length || 0})
        </button>
        <button
          onClick={() => setActiveTab('infrastructure')}
          className={`pb-3 px-1 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'infrastructure'
              ? 'border-blue-700 text-blue-800 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Infrastructure Photos & Evidence ({currentApp?.infrastructureEvidence?.length || 0})</span>
        </button>
        <button
          onClick={() => setActiveTab('norms')}
          className={`pb-3 px-1 border-b-2 transition-colors ${
            activeTab === 'norms'
              ? 'border-blue-700 text-blue-800 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          AICTE Cadre & Area Norms
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs text-slate-400 font-medium">Approved Intake (2025-26)</span>
              <p className="text-2xl font-bold text-slate-900">
                {currentApp?.intakeApprovedLastYear || 720} Seats
              </p>
              <p className="text-[11px] text-slate-500">Across 6 approved undergraduate branches</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs text-slate-400 font-medium">Proposed Intake (2026-27)</span>
              <p className="text-2xl font-bold text-blue-800">
                {currentApp?.intakeProposed || 780} Seats
              </p>
              <p className="text-[11px] text-emerald-600 font-medium">+60 seats (AI & Data Science expansion)</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs text-slate-400 font-medium">Pre-Scrutiny AI Score</span>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-emerald-700">
                  {currentApp?.complianceScore || 92}%
                </p>
                <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                  Compliant
                </span>
              </div>
              <p className="text-[11px] text-slate-500">0 critical anomalies flagged</p>
            </div>
          </div>

          {/* Stepper */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h4 className="text-sm font-bold text-slate-900">EoA Processing Pipeline</h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900">
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>1. Onboarding</span>
                </div>
                <p className="text-[11px] text-emerald-700">College ID & Profile Verified</p>
              </div>

              <div
                onClick={() => setActiveTab('documents')}
                className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 cursor-pointer hover:bg-emerald-100/80 transition-all hover:shadow-sm"
                title="Click to view and upload mandatory scrutiny documents"
              >
                <div className="flex items-center justify-between font-bold mb-1">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>2. Dossier Upload</span>
                  </div>
                  <span className="text-[10px] text-blue-700 underline font-medium">Go to Upload</span>
                </div>
                <p className="text-[11px] text-emerald-700">Affiliation & Land NOC submitted</p>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900">
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>3. AI Scrutiny</span>
                </div>
                <p className="text-[11px] text-blue-700">Currently Under Central Review</p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-400">
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  <span className="w-3.5 h-3.5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px]">4</span>
                  <span>4. Letter of EoA</span>
                </div>
                <p className="text-[11px] text-slate-500">Pending Council Sign-off</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Documents */}
      {activeTab === 'documents' && (
        <CollegeDocumentChecklist
          applicationType="EOA"
          application={currentApp}
          onApplicationUpdated={(updated) => {
            setCurrentApp(updated);
            if (onSelectApplication) onSelectApplication(updated);
          }}
        />
      )}

      {/* Tab 3: Infrastructure Evidence */}
      {activeTab === 'infrastructure' && (
        <CollegeInfrastructureSection
          applicationType="EOA"
          application={currentApp}
          onApplicationUpdated={(updated) => {
            setCurrentApp(updated);
            if (onSelectApplication) onSelectApplication(updated);
          }}
        />
      )}

      {/* Tab 4: Norms */}
      {activeTab === 'norms' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4 text-xs">
          <h4 className="text-sm font-bold text-slate-900">
            AICTE Approval Handbook Norms for Extension (2026-27)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <p className="font-bold text-slate-800">Faculty Cadre Ratio (SFR)</p>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Undergraduate Engineering: 1:15 or 1:20 (with at least 1 Professor, 2 Associate Professors for every 6 Assistant Professors per cadre).
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <p className="font-bold text-slate-800">Instructional Carpet Area</p>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Classrooms: 66 sqm each. Computer Centers: minimum 150 sqm with licensed & open-source software stack.
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <p className="font-bold text-slate-800">Fire Safety & Structural Stability</p>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Certificates from competent state fire authorities and government-chartered structural engineers must be valid for the entire academic duration.
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <p className="font-bold text-slate-800">Affiliating University Mandate</p>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                NOC or continuation of affiliation letter issued by the state university for the academic year 2026-27.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
