import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Building2,
  Lock,
  FileCheck,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  FileText,
  Clock,
  Layers,
  Scale,
  Users,
  AlertTriangle,
  GraduationCap
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const { setActiveView, setSelectedCategory, setPendingCategory, isAuthenticated, user } = useAuth();

  const handleOpenCollegePortal = () => {
    setSelectedCategory(null);
    setPendingCategory(null);
    setActiveView('college');
  };

  const handleOpenCollegeTrack = (category: 'EOA' | 'NEW_APPROVAL') => {
    if (isAuthenticated && user?.role === 'college') {
      setSelectedCategory(category);
      setPendingCategory(null);
    } else {
      setSelectedCategory(null);
      setPendingCategory(category);
    }
    setActiveView('college');
  };

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-900 via-blue-950 to-slate-900 text-white py-16 md:py-24 px-4 sm:px-6">
        {/* Subtle grid background pattern */}
        <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
        
        <div className="relative max-w-6xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-blue-800/80 border border-blue-600/60 px-4 py-1.5 rounded-full text-xs font-semibold text-blue-200 shadow-sm backdrop-blur-sm">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Smart India Hackathon 2024–2026 Initiative</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Verif<span className="text-sky-400">AI</span>
          </h1>

          <p className="text-xl sm:text-2xl font-medium text-blue-200 max-w-3xl mx-auto">
            AI-Assisted Application Validation for AICTE
          </p>

          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            The intelligent scrutiny platform for the All India Council for Technical Education (AICTE). 
            Empowering institutions to apply seamlessly for approval renewals and first-time sanctioning, 
            while enabling AICTE administrators to verify credentials with automated document validation.
          </p>

          {/* Two Prominent Action Cards */}
          <div className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto text-left">
            {/* 1. College Portal CTA */}
            <div 
              onClick={handleOpenCollegePortal}
              className="bg-white/10 hover:bg-white/15 border border-white/20 hover:border-sky-400/70 p-6 rounded-2xl shadow-xl backdrop-blur-md cursor-pointer transition-all hover:-translate-y-1 group"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-md">
                <Building2 className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white flex items-center justify-between">
                <span>College Portal</span>
                <ArrowRight className="w-5 h-5 text-sky-400 group-hover:translate-x-1 transition-transform" />
              </h2>
              <p className="text-xs text-blue-200 mt-2 leading-relaxed">
                For technical colleges & universities. Apply for Extension of Approval (EoA), New Approval, or request an official AICTE Unique College ID.
              </p>
              <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-2 text-xs font-semibold text-sky-300">
                <span>Access Institution Portal</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* 2. AICTE Admin Portal CTA */}
            <div 
              onClick={() => setActiveView('admin')}
              className="bg-white/10 hover:bg-white/15 border border-white/20 hover:border-amber-400/70 p-6 rounded-2xl shadow-xl backdrop-blur-md cursor-pointer transition-all hover:-translate-y-1 group"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-600 text-white flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-md">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white flex items-center justify-between">
                <span>AICTE Admin Login</span>
                <ArrowRight className="w-5 h-5 text-amber-300 group-hover:translate-x-1 transition-transform" />
              </h2>
              <p className="text-xs text-blue-200 mt-2 leading-relaxed">
                For AICTE scrutiny officers and administrators. Manage EoA and New Approval queues, audit AI verification reports, and review Unique College ID requests.
              </p>
              <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-2 text-xs font-semibold text-amber-300">
                <span>Official Admin Login</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Quick Notice */}
          <div className="text-xs text-blue-300/80 pt-2 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Compliant with AICTE Approval Process Handbook (APH 2026–27)</span>
          </div>
        </div>
      </section>

      {/* Two Application Tracks Breakdown */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-800 bg-blue-100 px-3 py-1 rounded-full">
            Dual Scrutiny Channels
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-3">
            Tailored Validation Pathways
          </h2>
          <p className="text-sm text-slate-600 mt-2">
            VerifAI segments applications into dedicated tracks with specialized compliance checklists and scrutiny criteria.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Card 1: EoA */}
          <div className="bg-white rounded-2xl border-2 border-blue-100 hover:border-blue-400 p-8 shadow-sm hover:shadow-lg transition-all space-y-4">
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 bg-blue-100 text-blue-900 font-bold text-xs rounded-full">
                Track 1: Extension of Approval
              </span>
              <span className="text-xs font-mono text-slate-400">Category: EoA</span>
            </div>

            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-6 h-6 text-blue-700" />
              <span>EoA — Extension of Approval</span>
            </h3>

            <p className="text-sm text-slate-600 leading-relaxed">
              Designed for existing AICTE-approved institutions seeking renewal or variation of approved intake for the upcoming academic cycle.
            </p>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2 text-slate-700">
              <p className="font-semibold text-slate-900">Key Scrutiny Checkpoints:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Faculty Cadre & SFR Audit
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  University Affiliation Verification
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Building Occupancy & Safety NOC
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  NBA Accreditation Status Check
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => handleOpenCollegeTrack('EOA')}
                className="w-full py-2.5 px-4 bg-blue-800 hover:bg-blue-900 text-white text-xs font-bold rounded-xl shadow transition-colors flex items-center justify-center gap-2"
              >
                <span>Proceed with EoA Application</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Card 2: New Approval */}
          <div className="bg-white rounded-2xl border-2 border-indigo-100 hover:border-indigo-400 p-8 shadow-sm hover:shadow-lg transition-all space-y-4">
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 bg-indigo-100 text-indigo-900 font-bold text-xs rounded-full">
                Track 2: First-Time Sanction
              </span>
              <span className="text-xs font-mono text-slate-400">Category: New Approval</span>
            </div>

            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <GraduationCap className="w-6 h-6 text-indigo-700" />
              <span>New Technical Institution Approval</span>
            </h3>

            <p className="text-sm text-slate-600 leading-relaxed">
              For newly established colleges, polytechnics, and standalone institutes applying for AICTE approval for the first time.
            </p>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2 text-slate-700">
              <p className="font-semibold text-slate-900">Key Scrutiny Checkpoints:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                  Trust/Society Registration Deed
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                  30-Year Unencumbered Land Lease
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                  Joint Corpus Fixed Deposit (FDR)
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                  State Govt. In-Principle NOC
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => handleOpenCollegeTrack('NEW_APPROVAL')}
                className="w-full py-2.5 px-4 bg-indigo-800 hover:bg-indigo-900 text-white text-xs font-bold rounded-xl shadow transition-colors flex items-center justify-center gap-2"
              >
                <span>Proceed with New Approval Application</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* AI Scrutiny Core Pillars */}
      <section className="bg-slate-100/80 py-12 px-4 sm:px-6 border-y border-slate-200">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
              Future-Ready AI Scrutiny Pipeline
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Engineered to support automated OCR, anomaly detection, and tamper verification in subsequent SIH development phases.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
              <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                <FileText className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-900">OCR & Document Parser</h4>
              <p className="text-xs text-slate-500">
                Extracts structured tables from certificates, fire NOCs, and financial audit statements with layout awareness.
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <Scale className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-900">Cadre & SFR Validator</h4>
              <p className="text-xs text-slate-500">
                Validates Professor-to-Student ratios and flags cross-college duplicate faculty records using Aadhaar/PAN deduplication.
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
              <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-900">Anomaly & Fraud Alert</h4>
              <p className="text-xs text-slate-500">
                Detects altered stamps, forged signatures, and inconsistent land survey geo-coordinates against municipal maps.
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
              <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-900">Tamper-Evident Audit</h4>
              <p className="text-xs text-slate-500">
                Maintains a verifiable trail of administrative actions, ID approvals, and inspection recommendations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Process Stepper */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6">
          <div className="text-center max-w-xl mx-auto">
            <h3 className="text-lg font-bold text-slate-900">
              End-to-End Approval Lifecycle
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Transparent, automated workflow from institution onboarding to final Council sanction.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-2">
              <span className="w-8 h-8 rounded-full bg-blue-800 text-white font-bold text-xs inline-flex items-center justify-center">
                1
              </span>
              <h4 className="text-xs font-bold text-slate-900">Unique ID Issuance</h4>
              <p className="text-[11px] text-slate-500">
                Institutions request or use AICTE Unique College ID verified by Admin.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-2">
              <span className="w-8 h-8 rounded-full bg-blue-800 text-white font-bold text-xs inline-flex items-center justify-center">
                2
              </span>
              <h4 className="text-xs font-bold text-slate-900">Track Selection & Dossier</h4>
              <p className="text-[11px] text-slate-500">
                College selects EoA or New Approval track and compiles compliance dossiers.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-2">
              <span className="w-8 h-8 rounded-full bg-blue-800 text-white font-bold text-xs inline-flex items-center justify-center">
                3
              </span>
              <h4 className="text-xs font-bold text-slate-900">AI Validation & Scoring</h4>
              <p className="text-[11px] text-slate-500">
                Automated scrutiny computes compliance score and highlights any flags.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-2">
              <span className="w-8 h-8 rounded-full bg-emerald-700 text-white font-bold text-xs inline-flex items-center justify-center">
                4
              </span>
              <h4 className="text-xs font-bold text-slate-900">Council Sanction</h4>
              <p className="text-[11px] text-slate-500">
                AICTE Scrutiny Committee issues official Approval / EoA Letter.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
