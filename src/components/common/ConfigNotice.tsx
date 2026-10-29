import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Database, ShieldCheck, Info, X, ExternalLink } from 'lucide-react';

export const ConfigNotice: React.FC = () => {
  const { isFirebaseLive } = useAuth();
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) return null;

  return (
    <div className={`border-b text-xs transition-colors ${
      isFirebaseLive 
        ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
        : 'bg-amber-50 border-amber-200 text-amber-900'
    }`}>
      <div className="max-w-7xl mx-auto px-4 py-2 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isFirebaseLive ? (
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <Database className="w-4 h-4 text-amber-600 flex-shrink-0" />
          )}
          <span>
            {isFirebaseLive ? (
              <strong className="font-semibold text-emerald-900">
                Live Firebase Connected:
              </strong>
            ) : (
              <strong className="font-semibold text-amber-950">
                Interactive Local Simulation Active:
              </strong>
            )}{' '}
            {isFirebaseLive ? (
              'Authentication, Cloud Firestore & Firebase Cloud Storage are running in live cloud sync mode.'
            ) : (
              'Firebase API keys not configured in .env. Interactive Local Simulation Mode is active with isolated browser persistence.'
            )}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {!isFirebaseLive && (
            <span className="hidden md:inline-flex items-center gap-1 text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded border border-amber-300">
              <Info className="w-3 h-3" />
              See <code>.env.example</code> to attach Firebase
            </span>
          )}
          <button
            onClick={() => setIsDismissed(true)}
            className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
            title="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
