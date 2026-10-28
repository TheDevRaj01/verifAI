import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/common/Header';
import { Footer } from './components/common/Footer';
import { ConfigNotice } from './components/common/ConfigNotice';
import { LandingPage } from './components/landing/LandingPage';
import { CollegePortal } from './components/college/CollegePortal';
import { AdminPortal } from './components/admin/AdminPortal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const MainContent: React.FC = () => {
  const { activeView, toastMessage, toastType } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Configuration Status Notice */}
      <ConfigNotice />

      {/* Main Indian Government & AICTE Header */}
      <Header />

      {/* Toast Notification Container */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 max-w-md animate-in slide-in-from-top-2 duration-200">
          <div className={`p-4 rounded-xl shadow-lg border text-xs flex items-center gap-3 ${
            toastType === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : toastType === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-blue-50 border-blue-300 text-blue-900'
          }`}>
            {toastType === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />}
            {toastType === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />}
            {toastType === 'info' && <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />}
            <span className="font-medium flex-1">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Routed View */}
      <main className="flex-1">
        <ErrorBoundary
          fallbackTitle="Application View Error"
          fallbackMessage="An unexpected issue occurred while rendering this view. You can use the header navigation to return to the portal or switch views."
        >
          {activeView === 'landing' && <LandingPage />}
          {activeView === 'college' && <CollegePortal />}
          {activeView === 'admin' && <AdminPortal />}
        </ErrorBoundary>
      </main>

      {/* Official Footer */}
      <Footer />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
};

export default App;
