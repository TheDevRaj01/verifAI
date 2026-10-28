import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CollegeApplication, UniqueIdRequest, ApplicationType } from '../../types';
import { getApplications, getIdRequests } from '../../services/dataService';
import { AdminLoginModal } from './AdminLoginModal';
import { ApplicationDetailModal } from './ApplicationDetailModal';
import { IdRequestsSection } from './IdRequestsSection';
import { ChecklistManagementSection } from './ChecklistManagementSection';
import { AdminDocumentSection } from './AdminDocumentSection';
import {
  ShieldCheck,
  Building2,
  GraduationCap,
  KeyRound,
  Search,
  Filter,
  CheckCircle,
  AlertCircle,
  Clock,
  Eye,
  FileCheck,
  ArrowUpRight,
  TrendingUp,
  Award,
  Layers,
  ShieldAlert,
  LogOut
} from 'lucide-react';

export const AdminPortal: React.FC = () => {
  const { user, isAuthenticated, setActiveView, logout } = useAuth();
  const isAdmin = isAuthenticated && user?.role === 'admin';

  const [activeTab, setActiveTab] = useState<'eoa' | 'new_approval' | 'id_requests' | 'checklists'>('eoa');
  const [applications, setApplications] = useState<CollegeApplication[]>([]);
  const [idRequests, setIdRequests] = useState<UniqueIdRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApp, setSelectedApp] = useState<CollegeApplication | null>(null);

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [apps, reqs] = await Promise.all([getApplications(), getIdRequests()]);
      setApplications(apps);
      setIdRequests(reqs);
    } catch (e) {
      console.warn('Error loading admin portal data:', e);
    } finally {
      setLoading(false);
    }
  };

  // 1. Strict Protection: A college account must never be allowed to access admin pages
  if (isAuthenticated && user?.role === 'college') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto border border-rose-300 shadow-sm">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-800 px-3 py-1 rounded-full border border-rose-200">
            Access Denied • 403 Forbidden
          </span>
          <h2 className="text-2xl font-black text-slate-900">
            College Accounts Cannot Access AICTE Admin Portal
          </h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
            You are currently signed in as an institution (<strong>{user.displayName || user.email}</strong>). 
            AICTE administrative scrutiny consoles are restricted to authorized central officers.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setActiveView('college')}
            className="w-full sm:w-auto px-5 py-2.5 bg-blue-800 hover:bg-blue-900 text-white rounded-xl text-xs font-bold shadow transition-colors"
          >
            Return to College Portal
          </button>
          <button
            onClick={async () => {
              await logout();
              setActiveView('admin');
            }}
            className="w-full sm:w-auto px-5 py-2.5 bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out & Switch to Admin Login</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated: Show only the admin login screen without exposing any dashboard records
  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="text-center max-w-lg mx-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-3 py-1 rounded-full">
            Restricted Officer Gateway
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-2">
            AICTE Central Administrator Sign In
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Please authenticate using authorized council credentials to access scrutiny dossiers and approval records.
          </p>
        </div>

        <AdminLoginModal />
      </div>
    );
  }

  // Filter applications by category
  const eoaApps = applications.filter((a) => a.type === 'EOA');
  const newApps = applications.filter((a) => a.type === 'NEW_APPROVAL');
  const pendingRequests = idRequests.filter((r) => r.status === 'Pending');

  // Search filter
  const filterList = (list: CollegeApplication[]) => {
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(
      (a) =>
        a.collegeName.toLowerCase().includes(term) ||
        a.collegeId.toLowerCase().includes(term) ||
        a.state.toLowerCase().includes(term) ||
        a.district.toLowerCase().includes(term)
    );
  };

  const displayedEoaApps = filterList(eoaApps);
  const displayedNewApps = filterList(newApps);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-2xl p-6 md:p-8 shadow-xl border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Central Scrutiny Directorate</span>
              </span>
              <span className="text-xs font-mono text-slate-400">
                APH Cycle 2026–27
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
              AICTE Scrutiny & Approval Dashboard
            </h1>

            <p className="text-xs md:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Real-time administrative validation console. Oversee Extension of Approval (EoA) requests, 
              first-time institution sanctions, and new Unique College ID verification queues.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 text-xs space-y-1.5 flex-shrink-0">
            <div className="flex items-center justify-between gap-4">
              <p className="text-slate-400 font-semibold">Active Officer Session</p>
              <button
                onClick={logout}
                className="inline-flex items-center gap-1 text-[11px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/40 px-2 py-0.5 rounded transition-colors"
                title="Sign Out as Admin"
              >
                <LogOut className="w-3 h-3" />
                <span>Sign Out</span>
              </button>
            </div>
            <p className="text-sm font-bold text-white">{user.displayName || 'AICTE Central Admin'}</p>
            <p className="text-sky-300 font-mono text-[11px]">{user.email}</p>
            <div className="pt-1 flex items-center gap-2 text-[10px] text-amber-300">
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              <span>Full Council Scrutiny Privileges</span>
            </div>
          </div>
        </div>

        {/* Quick Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-slate-800">
          <div 
            onClick={() => setActiveTab('eoa')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              activeTab === 'eoa'
                ? 'bg-blue-900/60 border-blue-500'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-blue-300">
              <span>EoA Applications</span>
              <Building2 className="w-4 h-4" />
            </div>
            <p className="text-2xl font-black text-white mt-1">{eoaApps.length}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Approved Colleges</p>
          </div>

          <div 
            onClick={() => setActiveTab('new_approval')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              activeTab === 'new_approval'
                ? 'bg-indigo-900/60 border-indigo-500'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-indigo-300">
              <span>New Approvals</span>
              <GraduationCap className="w-4 h-4" />
            </div>
            <p className="text-2xl font-black text-white mt-1">{newApps.length}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">First-Time Institutions</p>
          </div>

          <div 
            onClick={() => setActiveTab('id_requests')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              activeTab === 'id_requests'
                ? 'bg-amber-900/60 border-amber-500'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-amber-300">
              <span>Unique ID Requests</span>
              <KeyRound className="w-4 h-4" />
            </div>
            <p className="text-2xl font-black text-white mt-1">{pendingRequests.length}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Awaiting Review</p>
          </div>

          <div className="p-3.5 bg-white/5 border border-white/10 rounded-xl">
            <div className="flex items-center justify-between text-xs text-emerald-300">
              <span>AI Scrutiny Accuracy</span>
              <TrendingUp className="w-4 h-4" />
            </div>
            <p className="text-2xl font-black text-white mt-1">98.4%</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Norm Conformance</p>
          </div>
        </div>
      </div>

      {/* Primary Category Selector Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2 overflow-x-auto">
          {/* Tab 1: EoA */}
          <button
            onClick={() => setActiveTab('eoa')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'eoa'
                ? 'bg-blue-800 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>EoA Applications ({eoaApps.length})</span>
          </button>

          {/* Tab 2: New Approval */}
          <button
            onClick={() => setActiveTab('new_approval')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'new_approval'
                ? 'bg-indigo-800 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>New Approval Applications ({newApps.length})</span>
          </button>

          {/* Tab 3: ID Requests */}
          <button
            onClick={() => setActiveTab('id_requests')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'id_requests'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Unique College ID Requests ({pendingRequests.length})</span>
            {pendingRequests.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>

          {/* Tab 4: Document Section */}
          <button
            onClick={() => setActiveTab('checklists')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'checklists'
                ? 'bg-blue-800 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FileCheck className="w-4 h-4" />
            <span>Document Section</span>
          </button>
        </div>

        {/* Search input */}
        {activeTab !== 'id_requests' && activeTab !== 'checklists' && (
          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by college, ID, or state..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
            />
          </div>
        )}
      </div>

      {/* SECTION 1: EoA Applications Table */}
      {activeTab === 'eoa' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Extension of Approval (EoA) Queue — 2026-27 Cycle
              </h3>
              <p className="text-[11px] text-slate-500">
                Displaying {displayedEoaApps.length} technical colleges applying for extension
              </p>
            </div>
            <span className="text-[11px] text-slate-400">
              *Sample data labeled as Demo Data
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">AICTE College ID</th>
                  <th className="py-3 px-4">College Name & Discipline</th>
                  <th className="py-3 px-4">State & District</th>
                  <th className="py-3 px-4">Intake (Last / Proposed)</th>
                  <th className="py-3 px-4">Compliance Score</th>
                  <th className="py-3 px-4">Scrutiny Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayedEoaApps.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-900">
                      {app.collegeId}
                      {app.isDemo && (
                        <span className="block text-[9px] font-sans font-semibold text-amber-700 bg-amber-100/60 px-1.5 py-0.2 rounded w-max mt-0.5">
                          Demo Data
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="font-bold text-slate-900">{app.collegeName}</p>
                      <p className="text-[11px] text-slate-500">{app.discipline}</p>
                    </td>

                    <td className="py-3.5 px-4 text-slate-600">
                      <p className="font-medium text-slate-800">{app.state}</p>
                      <p className="text-[11px] text-slate-400">{app.district}</p>
                    </td>

                    <td className="py-3.5 px-4 text-slate-800">
                      <span className="font-semibold">{app.intakeApprovedLastYear || '—'}</span>
                      <span className="text-slate-400 mx-1">→</span>
                      <span className="font-bold text-blue-800">{app.intakeProposed}</span>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-emerald-700">{app.complianceScore}%</span>
                        <div className="w-16 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-emerald-600 h-full rounded-full" 
                            style={{ width: `${app.complianceScore}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        app.status === 'Documents Verified'
                          ? 'bg-emerald-100 text-emerald-800'
                          : app.status === 'Clarification Requested'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {app.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedApp(app)}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Details</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 2: New Approval Applications Table */}
      {activeTab === 'new_approval' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                New Technical Institution Approval Queue
              </h3>
              <p className="text-[11px] text-slate-500">
                Displaying {displayedNewApps.length} new colleges applying for first-time sanctioning
              </p>
            </div>
            <span className="text-[11px] text-slate-400">
              *Sample data labeled as Demo Data
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Assigned AICTE ID</th>
                  <th className="py-3 px-4">College Name & Discipline</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Proposed Intake</th>
                  <th className="py-3 px-4">Scrutiny Score</th>
                  <th className="py-3 px-4">Stage</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayedNewApps.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-900">
                      {app.collegeId}
                      {app.isDemo && (
                        <span className="block text-[9px] font-sans font-semibold text-amber-700 bg-amber-100/60 px-1.5 py-0.2 rounded w-max mt-0.5">
                          Demo Data
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="font-bold text-slate-900">{app.collegeName}</p>
                      <p className="text-[11px] text-slate-500">{app.discipline}</p>
                    </td>

                    <td className="py-3.5 px-4 text-slate-600">
                      <p className="font-medium text-slate-800">{app.state}</p>
                      <p className="text-[11px] text-slate-400">{app.district}</p>
                    </td>

                    <td className="py-3.5 px-4 text-slate-800 font-bold">
                      {app.intakeProposed} Seats
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-indigo-800">{app.complianceScore}%</span>
                        <div className="w-16 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-indigo-600 h-full rounded-full" 
                            style={{ width: `${app.complianceScore}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800">
                        {app.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedApp(app)}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Details</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 3: Unique College ID Requests Queue */}
      {activeTab === 'id_requests' && (
        <IdRequestsSection
          requests={idRequests}
          onRefresh={loadData}
        />
      )}

      {/* SECTION 4: Document Section (Level 1, 2, 3) */}
      {activeTab === 'checklists' && (
        <AdminDocumentSection />
      )}

      {/* Detailed Application Modal */}
      {selectedApp && (
        <ApplicationDetailModal
          application={selectedApp}
          onClose={() => setSelectedApp(null)}
        />
      )}
    </div>
  );
};
