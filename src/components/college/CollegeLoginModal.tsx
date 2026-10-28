import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Building2, Lock, KeyRound, AlertCircle, ArrowRight, Sparkles, X, ArrowLeft } from 'lucide-react';

interface Props {
  onRequestNewId: () => void;
  onSuccess?: () => void;
  onCancel?: () => void;
  targetCategory?: 'EOA' | 'NEW_APPROVAL' | null;
}

export const CollegeLoginModal: React.FC<Props> = ({ onRequestNewId, onSuccess, onCancel, targetCategory }) => {
  const { loginCollege, showToast } = useAuth();
  const [collegeId, setCollegeId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await loginCollege(collegeId, password);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify your credentials.');
      showToast(err.message || 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoFill = (id: string) => {
    setCollegeId(id);
    setPassword('Password@123');
    setError(null);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-800 text-white p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-700/80 flex items-center justify-center border border-blue-500/50">
              <Building2 className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Institution Portal Authentication</h3>
              <p className="text-xs text-blue-200">
                Sign in with your AICTE-issued Unique College ID
              </p>
            </div>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-blue-300 hover:text-white p-1 rounded-lg hover:bg-blue-700/60 transition-colors"
              title="Close and return to categories"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {targetCategory && (
          <div className="mt-4 pt-3 border-t border-blue-700/60 flex items-center justify-between text-xs">
            <span className="text-blue-200 font-medium">Authentication required to access:</span>
            <span className="bg-blue-950/70 text-sky-300 font-bold px-2.5 py-0.5 rounded-full border border-blue-400/40">
              {targetCategory === 'EOA' ? 'Extension of Approval (EoA)' : 'New Approval Track'}
            </span>
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Demo Quick-Select Tip */}
        <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-700" />
              Demo Institutions (Click to auto-fill):
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleDemoFill('1-10972341')}
              className="bg-white hover:bg-blue-100/60 border border-blue-300 px-2 py-1 rounded text-[11px] font-mono text-blue-800 transition-colors"
            >
              1-10972341 (Delhi Inst.)
            </button>
            <button
              type="button"
              onClick={() => handleDemoFill('1-24891102')}
              className="bg-white hover:bg-blue-100/60 border border-blue-300 px-2 py-1 rounded text-[11px] font-mono text-blue-800 transition-colors"
            >
              1-24891102 (Maharashtra Tech)
            </button>
            <button
              type="button"
              onClick={() => handleDemoFill('1-38290145')}
              className="bg-white hover:bg-blue-100/60 border border-blue-300 px-2 py-1 rounded text-[11px] font-mono text-blue-800 transition-colors"
            >
              1-38290145 (Karnataka Apex)
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3 rounded-xl flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              AICTE-Issued Unique College ID <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={collegeId}
                onChange={(e) => setCollegeId(e.target.value)}
                placeholder="e.g. 1-10972341"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none font-mono"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Standard 8 to 10 digit AICTE permanent institute identifier.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="w-1/3 py-2.5 px-3 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className={`${onCancel ? 'w-2/3' : 'w-full'} py-2.5 px-4 bg-blue-800 hover:bg-blue-900 disabled:bg-blue-400 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2`}
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Sign In to Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Request New Unique ID prompt */}
        <div className="pt-4 border-t border-slate-200 text-center space-y-2">
          <p className="text-xs text-slate-600">
            Do not have an AICTE-issued Unique College ID?
          </p>
          <button
            type="button"
            onClick={onRequestNewId}
            className="text-xs font-bold text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-1"
          >
            <span>Request New Unique ID for First-Time Registration</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
