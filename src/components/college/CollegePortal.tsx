import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CollegeApplication } from '../../types';
import { getApplications } from '../../services/dataService';
import { CollegeLoginModal } from './CollegeLoginModal';
import { RequestIdModal } from './RequestIdModal';
import { EoASection } from './EoASection';
import { NewApprovalSection } from './NewApprovalSection';
import {
  Building2,
  GraduationCap,
  ArrowRight,
  ShieldCheck,
  FileCheck2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Layers,
  CheckCircle2,
  Clock,
  User,
  Info,
  LogOut,
  Lock
} from 'lucide-react';

export const CollegePortal: React.FC = () => {
  const {
    user,
    college,
    isAuthenticated,
    selectedCategory,
    setSelectedCategory,
    pendingCategory,
    setPendingCategory,
    logout,
    setActiveView
  } = useAuth();

  const isCollegeAuth = isAuthenticated && user?.role === 'college' && Boolean(college);

  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [collegeApplications, setCollegeApplications] = useState<CollegeApplication[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);

  // If pendingCategory was set from landing page and user is not logged in, trigger login modal
  useEffect(() => {
    if (!isCollegeAuth && pendingCategory) {
      setShowLoginModal(true);
    }
  }, [isCollegeAuth, pendingCategory]);

  // Load college applications when authenticated as college
  useEffect(() => {
    if (isCollegeAuth && college) {
      loadCollegeApps(college.collegeId);
    } else {
      setCollegeApplications([]);
    }
  }, [isCollegeAuth, college]);

  const loadCollegeApps = async (collegeId: string) => {
    setLoadingApps(true);
    try {
      const apps = await getApplications({ collegeId });
      setCollegeApplications(apps);
    } catch (e) {
      console.warn('Error loading college applications:', e);
    } finally {
      setLoadingApps(false);
    }
  };

  const currentEoAApp = collegeApplications.find((a) => a.type === 'EOA');
  const currentNewApp = collegeApplications.find((a) => a.type === 'NEW_APPROVAL');

  // Handle clicking on a category card
  const handleCategoryClick = (category: 'EOA' | 'NEW_APPROVAL') => {
    if (isCollegeAuth) {
      // Already authenticated: open category directly without prompting login
      setSelectedCategory(category);
    } else {
      // Not authenticated: remember category and open login modal first
      setPendingCategory(category);
      setSelectedCategory(null);
      setShowLoginModal(true);
    }
  };

  const handleApplicationUpdated = (updated: CollegeApplication) => {
    setCollegeApplications((prev) => {
      const idx = prev.findIndex((a) => a.id === updated.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      }
      return [updated, ...prev];
    });
  };

  // ROUTE & COMPONENT-LEVEL ACCESS PROTECTION:
  // If a category section is selected, only render it if the user is authenticated as a college.
  // Otherwise, block access, reset selected category, and prompt login.
  if (selectedCategory === 'EOA') {
    if (!isCollegeAuth) {
      // Force redirect to login if attempting unauthenticated access
      return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-6">
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-6 text-center max-w-lg mx-auto space-y-4">
            <Lock className="w-10 h-10 text-amber-600 mx-auto" />
            <h3 className="text-lg font-bold text-amber-950">Authentication Required</h3>
            <p className="text-xs text-amber-900 leading-relaxed">
              You must sign in with your AICTE-issued Unique College ID to access the <strong>Extension of Approval (EoA)</strong> section.
            </p>
            <CollegeLoginModal
              targetCategory="EOA"
              onRequestNewId={() => setShowRequestModal(true)}
              onCancel={() => setSelectedCategory(null)}
              onSuccess={() => setSelectedCategory('EOA')}
            />
          </div>
          {showRequestModal && (
            <RequestIdModal onClose={() => setShowRequestModal(false)} />
          )}
        </div>
      );
    }

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <EoASection
          application={currentEoAApp}
          onBack={() => setSelectedCategory(null)}
          onSelectApplication={handleApplicationUpdated}
        />
      </div>
    );
  }

  if (selectedCategory === 'NEW_APPROVAL') {
    if (!isCollegeAuth) {
      return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-6">
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-6 text-center max-w-lg mx-auto space-y-4">
            <Lock className="w-10 h-10 text-amber-600 mx-auto" />
            <h3 className="text-lg font-bold text-amber-950">Authentication Required</h3>
            <p className="text-xs text-amber-900 leading-relaxed">
              You must sign in with your AICTE-issued Unique College ID to access the <strong>New Approval</strong> section.
            </p>
            <CollegeLoginModal
              targetCategory="NEW_APPROVAL"
              onRequestNewId={() => setShowRequestModal(true)}
              onCancel={() => setSelectedCategory(null)}
              onSuccess={() => setSelectedCategory('NEW_APPROVAL')}
            />
          </div>
          {showRequestModal && (
            <RequestIdModal onClose={() => setShowRequestModal(false)} />
          )}
        </div>
      );
    }

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <NewApprovalSection
          application={currentNewApp}
          onBack={() => setSelectedCategory(null)}
          onSelectApplication={handleApplicationUpdated}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-2xl p-6 md:p-8 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-800/80 text-blue-200 border border-blue-600/60">
              <Building2 className="w-3.5 h-3.5 text-sky-400" />
              <span>AICTE Institutional Gateway</span>
            </span>
            <h1 className="text-3xl font-black tracking-tight">
              Technical Institutions Approval Portal
            </h1>
            <p className="text-sm text-blue-200 max-w-2xl leading-relaxed">
              Select your application category below to inspect requirements or track your compliance status. 
              Existing institutes apply under <strong className="text-white">EoA</strong>, while new applicants apply under <strong className="text-white">New Approval</strong>.
            </p>
          </div>

          {isCollegeAuth && college ? (
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 text-xs space-y-1.5 flex-shrink-0">
              <div className="flex items-center justify-between gap-4">
                <p className="text-blue-200 font-semibold">Active Institution Profile</p>
                <button
                  onClick={logout}
                  className="inline-flex items-center gap-1 text-[11px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/40 px-2 py-0.5 rounded transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Sign Out</span>
                </button>
              </div>
              <p className="text-sm font-bold text-white truncate max-w-xs">{college.collegeName}</p>
              <p className="font-mono text-sky-300">AICTE ID: {college.collegeId}</p>
              <div className="pt-1 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                  {college.status} Account
                </span>
                <span className="text-slate-300">{college.state}</span>
              </div>
            </div>
          ) : (
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 text-xs space-y-2 flex-shrink-0">
              <div className="flex items-center gap-2 text-amber-300 font-bold">
                <Lock className="w-4 h-4" />
                <span>Protected Portal Access</span>
              </div>
              <p className="text-[11px] text-blue-200 max-w-xs leading-relaxed">
                Choose an approval category to authenticate with your AICTE Unique College ID and password.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Two Prominent Application Categories (EoA & New Approval) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Select Application Category
            </h2>
            <p className="text-xs text-slate-500">
              {isCollegeAuth
                ? 'Your account is active. Click either category to open its section.'
                : 'Click either category below to sign in and open its corresponding section.'}
            </p>
          </div>
          <span className="text-xs font-medium text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
            Handbook 2026–27
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Category 1: EoA Card */}
          <div
            onClick={() => handleCategoryClick('EOA')}
            className={`group bg-white rounded-2xl border-2 ${
              isCollegeAuth
                ? 'border-blue-200 hover:border-blue-600'
                : 'border-slate-200 hover:border-blue-500'
            } p-6 shadow-sm hover:shadow-xl transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between`}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -z-0 opacity-60 group-hover:scale-110 transition-transform" />
            
            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold shadow-inner">
                  <Building2 className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-1.5">
                  {!isCollegeAuth && (
                    <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-300 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      Login Required
                    </span>
                  )}
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                    Renewal Track
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-extrabold text-slate-900 group-hover:text-blue-900 transition-colors">
                  EoA — Extension of Approval
                </h3>
                <p className="text-xs font-semibold text-blue-700 mt-0.5">
                  For existing AICTE-approved colleges applying for an extension
                </p>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Renew your annual approval, adjust student intake, add postgraduate or emerging tech courses, 
                  and verify faculty cadre ratios.
                </p>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-slate-900">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" />
                  <span>Prerequisite: Valid AICTE Permanent Unique College ID</span>
                </div>
                <p className="text-[11px] text-slate-500 pl-5">
                  Requires Faculty Aadhaar audit, Land compliance, and University Affiliation.
                </p>
              </div>
            </div>

            <div className="relative z-10 pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-700">
              <span>{isCollegeAuth ? 'Open EoA Section' : 'Sign in to Access EoA Section'}</span>
              <div className="w-7 h-7 rounded-full bg-blue-50 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center transition-colors">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Category 2: New Approval Card */}
          <div
            onClick={() => handleCategoryClick('NEW_APPROVAL')}
            className={`group bg-white rounded-2xl border-2 ${
              isCollegeAuth
                ? 'border-indigo-200 hover:border-indigo-600'
                : 'border-slate-200 hover:border-indigo-500'
            } p-6 shadow-sm hover:shadow-xl transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between`}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-bl-full -z-0 opacity-60 group-hover:scale-110 transition-transform" />
            
            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold shadow-inner">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-1.5">
                  {!isCollegeAuth && (
                    <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-300 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      Login Required
                    </span>
                  )}
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full">
                    First-Time Sanction
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-extrabold text-slate-900 group-hover:text-indigo-900 transition-colors">
                  New Approval
                </h3>
                <p className="text-xs font-semibold text-indigo-700 mt-0.5">
                  For colleges applying for AICTE approval for the first time
                </p>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Apply for the establishment of a new technical institution, polytechnic, or standalone management institute under AICTE regulations.
                </p>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-slate-900">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-700" />
                  <span>Prerequisite: Registered Trust/Society & Land Title</span>
                </div>
                <p className="text-[11px] text-slate-500 pl-5">
                  Requires Joint AICTE FDR, State Govt. NOC, and 30-year registered lease deed.
                </p>
              </div>
            </div>

            <div className="relative z-10 pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-700">
              <span>{isCollegeAuth ? 'Open New Approval Section' : 'Sign in to Access New Approval Section'}</span>
              <div className="w-7 h-7 rounded-full bg-indigo-50 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center transition-colors">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Authenticated Dashboard Summary OR First-Time Unique ID Option */}
      {isCollegeAuth && college ? (
        /* Authenticated College Summary */
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {college.collegeName} — Active Dossiers
              </h3>
              <p className="text-xs text-slate-500">
                AICTE Permanent Unique ID: <span className="font-mono text-blue-700 font-bold">{college.collegeId}</span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold px-3 py-1 rounded-full inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                AICTE Onboarding Active
              </span>
              <button
                onClick={logout}
                className="text-xs font-semibold text-rose-600 hover:text-rose-800 border border-rose-200 hover:bg-rose-50 px-3 py-1 rounded-lg transition-colors flex items-center gap-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Extension of Approval (EoA)</span>
                <span className={`text-[11px] px-2 py-0.5 rounded font-bold ${
                  currentEoAApp?.status === 'Documents Verified'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {currentEoAApp?.status || 'Draft'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Academic Year: 2026–2027 • Compliance Score: {currentEoAApp?.complianceScore || 92}%
              </p>
              <button
                onClick={() => setSelectedCategory('EOA')}
                className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                View Detailed EoA Dossier
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">New Approval Sanction</span>
                <span className="text-[11px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold">
                  {currentNewApp?.status || 'Not Applicable (Already Approved)'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Institutional setup verified • Permanent ID issued
              </p>
              <button
                onClick={() => setSelectedCategory('NEW_APPROVAL')}
                className="w-full py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                Inspect New Approval Guidelines
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Unauthenticated College: Prompt for Requesting New ID */
        <div className="bg-slate-100/70 border border-slate-200 rounded-2xl p-6 text-center space-y-3 max-w-xl mx-auto">
          <h3 className="text-sm font-bold text-slate-900">
            Do not have an AICTE-issued Unique College ID?
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Colleges applying to AICTE for the first time must request a permanent Unique College ID. 
            Once your registration is verified and approved by the AICTE Administrator, your ID and credentials will be activated.
          </p>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowRequestModal(true)}
              className="px-4 py-2 bg-white hover:bg-slate-50 border border-blue-400 text-blue-800 rounded-lg text-xs font-bold shadow-sm transition-colors inline-flex items-center gap-1.5"
            >
              <span>Request New Unique ID for Registration</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* College Login Modal (displayed when a category is clicked or requested) */}
      {showLoginModal && !isCollegeAuth && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg">
            <CollegeLoginModal
              targetCategory={pendingCategory}
              onRequestNewId={() => {
                setShowLoginModal(false);
                setShowRequestModal(true);
              }}
              onCancel={() => {
                setShowLoginModal(false);
                setPendingCategory(null);
              }}
              onSuccess={() => {
                setShowLoginModal(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Request New Unique ID Modal */}
      {showRequestModal && (
        <RequestIdModal
          onClose={() => setShowRequestModal(false)}
        />
      )}
    </div>
  );
};
