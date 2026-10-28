import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldCheck,
  Building2,
  Lock,
  LogOut,
  Menu,
  X,
  FileCheck2,
  Award,
  ChevronDown,
} from 'lucide-react';

export const Header: React.FC = () => {
  const {
    user,
    college,
    activeView,
    setActiveView,
    logout,
    isAuthenticated,
    setSelectedCategory,
    setPendingCategory
  } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavigateLanding = () => {
    setSelectedCategory(null);
    setPendingCategory(null);
    setActiveView('landing');
    setMobileMenuOpen(false);
  };

  const handleNavigateCollege = () => {
    setSelectedCategory(null);
    setPendingCategory(null);
    setActiveView('college');
    setMobileMenuOpen(false);
  };

  const handleNavigateAdmin = () => {
    setActiveView('admin');
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-slate-200">
      {/* Top National Ribbon */}
      <div className="bg-slate-900 text-slate-300 text-xs py-1.5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="font-medium text-slate-200 tracking-wide">
              भारत सरकार | Government of India
            </span>
            <span className="hidden sm:inline text-slate-500">|</span>
            <span className="hidden sm:inline text-slate-400">
              शिक्षा मंत्रालय | Ministry of Education
            </span>
          </div>

          <div className="flex items-center space-x-3 text-[11px]">
            <span className="hidden md:inline-flex items-center gap-1 bg-blue-900/60 text-blue-300 px-2 py-0.5 rounded border border-blue-700/50">
              <Award className="w-3 h-3 text-amber-400" />
              Smart India Hackathon 2024–2026
            </span>
            <span className="text-slate-400">English</span>
          </div>
        </div>
      </div>

      {/* Tricolor Accent Line */}
      <div className="tricolor-stripe w-full" />

      {/* Main Brand Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        {/* Brand & AICTE Identity */}
        <div 
          onClick={handleNavigateLanding}
          className="flex items-center gap-3.5 cursor-pointer group"
        >
          {/* AICTE emblem / portal icon */}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-950 text-white flex items-center justify-center shadow-md border border-blue-700 group-hover:scale-105 transition-transform">
            <FileCheck2 className="w-7 h-7 text-sky-300" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black tracking-tight text-blue-950 font-sans">
                Verif<span className="text-blue-600">AI</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
                AICTE Official
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-700 leading-tight">
              AI-Assisted Application Validation for AICTE
            </p>
            <p className="text-[11px] text-slate-500 hidden sm:block">
              अखिल भारतीय तकनीकी शिक्षा परिषद (Approval & Accreditation Portal)
            </p>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-2">
          <button
            onClick={handleNavigateLanding}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeView === 'landing'
                ? 'text-blue-700 bg-blue-50 border border-blue-200'
                : 'text-slate-600 hover:text-blue-900 hover:bg-slate-100'
            }`}
          >
            Home
          </button>

          <button
            onClick={handleNavigateCollege}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors ${
              activeView === 'college'
                ? 'text-blue-700 bg-blue-50 border border-blue-200'
                : 'text-slate-600 hover:text-blue-900 hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-4 h-4" />
            College Portal
          </button>

          <button
            onClick={handleNavigateAdmin}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors ${
              activeView === 'admin'
                ? 'text-blue-700 bg-blue-50 border border-blue-200'
                : 'text-slate-600 hover:text-blue-900 hover:bg-slate-100'
            }`}
          >
            <Lock className="w-4 h-4" />
            AICTE Admin
          </button>

          {/* User state / logout */}
          {isAuthenticated ? (
            <div className="ml-3 pl-3 border-l border-slate-200 flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-bold text-slate-800 truncate max-w-[180px]">
                  {user?.role === 'admin' ? 'AICTE Central Admin' : college?.collegeName || 'College User'}
                </p>
                <p className="text-[10px] text-slate-500 font-mono">
                  {user?.role === 'admin' ? 'Officer ID: AICTE-HQ' : `ID: ${college?.collegeId || user?.collegeId}`}
                </p>
              </div>
              <button
                onClick={logout}
                className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="ml-3 pl-3 border-l border-slate-200 flex items-center gap-2">
              <button
                onClick={handleNavigateCollege}
                className="px-3.5 py-2 bg-blue-800 hover:bg-blue-900 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
              >
                College Login
              </button>
              <button
                onClick={handleNavigateAdmin}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
              >
                Admin Login
              </button>
            </div>
          )}
        </nav>

        {/* Mobile menu button */}
        <div className="md:hidden flex items-center gap-2">
          {isAuthenticated && (
            <button
              onClick={logout}
              className="p-2 text-slate-600 hover:text-rose-600"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-slate-700 hover:bg-slate-100"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-slate-200 px-4 pt-2 pb-4 space-y-2">
          {isAuthenticated && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 mb-2">
              <p className="text-xs text-slate-500">Signed in as</p>
              <p className="text-sm font-bold text-slate-900">
                {user?.role === 'admin' ? 'AICTE Central Admin' : college?.collegeName}
              </p>
              <p className="text-xs font-mono text-blue-700">
                {user?.role === 'admin' ? 'Admin Portal' : `College ID: ${college?.collegeId}`}
              </p>
            </div>
          )}

          <button
            onClick={() => { handleNavigateLanding(); setMobileMenuOpen(false); }}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold ${
              activeView === 'landing' ? 'bg-blue-50 text-blue-800' : 'text-slate-700'
            }`}
          >
            Home
          </button>

          <button
            onClick={() => { handleNavigateCollege(); setMobileMenuOpen(false); }}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 ${
              activeView === 'college' ? 'bg-blue-50 text-blue-800' : 'text-slate-700'
            }`}
          >
            <Building2 className="w-4 h-4" />
            College Portal (EoA & New Approval)
          </button>

          <button
            onClick={() => { handleNavigateAdmin(); setMobileMenuOpen(false); }}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 ${
              activeView === 'admin' ? 'bg-blue-50 text-blue-800' : 'text-slate-700'
            }`}
          >
            <Lock className="w-4 h-4" />
            AICTE Administrator Portal
          </button>
        </div>
      )}
    </header>
  );
};
