import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CollegeApplication } from '../../types';
import { CollegeDocumentChecklist } from './CollegeDocumentChecklist';
import { CollegeInfrastructureSection } from './CollegeInfrastructureSection';
import {
  GraduationCap,
  FileText,
  CheckCircle,
  Clock,
  ArrowLeft,
  Building,
  Landmark,
  ShieldAlert,
  Info,
  Camera
} from 'lucide-react';

interface Props {
  application?: CollegeApplication | null;
  onBack: () => void;
  onSelectApplication?: (app: CollegeApplication) => void;
}

export const NewApprovalSection: React.FC<Props> = ({ application: initialApp, onBack, onSelectApplication }) => {
  const { college } = useAuth();
  const [currentApp, setCurrentApp] = useState<CollegeApplication | null>(initialApp || null);
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'infrastructure' | 'requirements'>('overview');

  useEffect(() => {
    setCurrentApp(initialApp || null);
  }, [initialApp]);

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Category Selection</span>
        </button>

        <span className="text-xs bg-indigo-100 text-indigo-800 font-bold px-3 py-1 rounded-full border border-indigo-200">
          First-Time Sanction Track (2026–2027)
        </span>
      </div>

      {/* Main Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white rounded-2xl p-6 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 bg-indigo-700/80 text-indigo-200 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
              <GraduationCap className="w-3 h-3 text-indigo-300" />
              <span>Track 2: New Technical Institution</span>
            </div>
            <h2 className="text-2xl font-black">
              New Technical Institution Approval
            </h2>
            <p className="text-xs text-indigo-100 max-w-2xl leading-relaxed">
              Comprehensive approval pathway for newly established trusts, societies, or government entities 
              applying to inaugurate new Engineering, Management, Pharmacy, Architecture, or Polytechnic colleges.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 text-center md:text-right flex-shrink-0">
            <p className="text-[11px] text-indigo-200">Application Status</p>
            <p className="text-lg font-bold text-white mt-0.5">
              {currentApp ? currentApp.status : 'Pre-Scrutiny Draft'}
            </p>
            <p className="text-[10px] text-indigo-300 mt-1">
              AICTE ID: {college?.collegeId || 'Pending Assignment'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-4 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 px-1 border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-indigo-700 text-indigo-800 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Approval Pathway & Metrics
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          className={`pb-3 px-1 border-b-2 transition-colors ${
            activeTab === 'documents'
              ? 'border-indigo-700 text-indigo-800 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Mandatory Scrutiny Documents ({currentApp?.documents?.filter(d => d.status !== 'NOT_UPLOADED').length || 0})
        </button>
        <button
          onClick={() => setActiveTab('infrastructure')}
          className={`pb-3 px-1 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'infrastructure'
              ? 'border-indigo-700 text-indigo-800 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Infrastructure Photos & Evidence ({currentApp?.infrastructureEvidence?.length || 0})</span>
        </button>
        <button
          onClick={() => setActiveTab('requirements')}
          className={`pb-3 px-1 border-b-2 transition-colors ${
            activeTab === 'requirements'
              ? 'border-indigo-700 text-indigo-800 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Mandatory Statutory Prerequisites
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs text-slate-400 font-medium">Proposed First-Year Intake</span>
              <p className="text-2xl font-bold text-slate-900">
                {currentApp?.intakeProposed || 240} Seats
              </p>
              <p className="text-[11px] text-slate-500">Across 2 initial core programs</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs text-slate-400 font-medium">Land Title Verification</span>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-indigo-800">5.0 Acres</p>
                <span className="text-[11px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold">
                  Urban Norm Met
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Contiguous piece of land registered</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs text-slate-400 font-medium">Pre-Scrutiny AI Score</span>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-emerald-700">
                  {currentApp?.complianceScore || 88}%
                </p>
                <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                  Verified
                </span>
              </div>
              <p className="text-[11px] text-slate-500">FDR & Society Deed authenticated</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h4 className="text-sm font-bold text-slate-900">New Institution Approval Milestones</h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900">
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>1. Trust Registration</span>
                </div>
                <p className="text-[11px] text-emerald-700">Deed & Resolution verified</p>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900">
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>2. Land & FDR Deposit</span>
                </div>
                <p className="text-[11px] text-emerald-700">Joint FDR & Lease Authenticated</p>
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900">
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>3. Scrutiny Committee</span>
                </div>
                <p className="text-[11px] text-indigo-700">Expert Visit Committee (EVC) Review</p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-400">
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  <span className="w-3.5 h-3.5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px]">4</span>
                  <span>4. Letter of Approval (LoA)</span>
                </div>
                <p className="text-[11px] text-slate-500">Final Council Sanction</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Documents */}
      {activeTab === 'documents' && (
        <CollegeDocumentChecklist
          applicationType="NEW_APPROVAL"
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
          applicationType="NEW_APPROVAL"
          application={currentApp}
          onApplicationUpdated={(updated) => {
            setCurrentApp(updated);
            if (onSelectApplication) onSelectApplication(updated);
          }}
        />
      )}

      {/* Tab 4: Requirements */}
      {activeTab === 'requirements' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4 text-xs">
          <h4 className="text-sm font-bold text-slate-900">
            Statutory AICTE Prerequisites for New Institutions
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <p className="font-bold text-slate-800">Land Title & Non-Encumbrance</p>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Must possess registered title or 30-year registered lease deed in the name of the Trust/Society, non-agricultural (NA) land conversion order from the District Collector.
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <p className="font-bold text-slate-800">Joint Fixed Deposit (Corpus Fund)</p>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Rs. 1.00 Crore Joint FDR created with AICTE and Society for a minimum period of 10 years in any scheduled commercial bank.
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <p className="font-bold text-slate-800">State Government Consent & University Affiliation</p>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                In-principle No Objection Certificate (NOC) from the respective State Higher Education Department and consent to affiliate from the designated affiliating university.
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <p className="font-bold text-slate-800">Barrier-Free Built-up Environment</p>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Mandatory ramps, lifts, and accessible washrooms conforming to the Persons with Disabilities (PwD) Act and AICTE safety norms.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
