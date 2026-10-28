import React, { useState } from 'react';
import { submitIdRequest } from '../../services/dataService';
import { useAuth } from '../../context/AuthContext';
import {
  Building,
  Mail,
  MapPin,
  User,
  Phone,
  AlertTriangle,
  CheckCircle,
  X,
  FileText,
  ArrowRight
} from 'lucide-react';

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

export const RequestIdModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const { showToast } = useAuth();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [generatedReqId, setGeneratedReqId] = useState('');

  const [formData, setFormData] = useState({
    collegeName: '',
    officialEmail: '',
    institutionType: 'Engineering & Technology',
    address: '',
    state: 'Maharashtra',
    district: '',
    pinCode: '',
    authorizedPersonName: '',
    authorizedPersonDesignation: 'Principal / Director',
    contactNumber: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await submitIdRequest(formData);
      setGeneratedReqId(res.id);
      setSubmitted(true);
      showToast('Unique College ID request submitted successfully for AICTE review.', 'success');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      showToast(err.message || 'Error submitting request', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-blue-800 text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-700/80 flex items-center justify-center border border-blue-500/50">
              <Building className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Request New Unique College ID</h3>
              <p className="text-xs text-blue-200">
                Official AICTE Onboarding Registration for Unaffiliated Institutions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-blue-300 hover:text-white hover:bg-blue-700/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {submitted ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">
                Application Received Successfully!
              </h3>
              <p className="text-xs font-mono bg-slate-100 py-1.5 px-3 rounded-md text-slate-700 inline-block">
                Reference Tracking ID: <strong>{generatedReqId}</strong>
              </p>

              {/* Crucial Explanatory Notice */}
              <div className="bg-amber-50 border border-amber-300 text-amber-950 p-4 rounded-xl text-xs text-left max-w-lg mx-auto space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>Important AICTE Administrative Protocol:</span>
                </div>
                <p className="leading-relaxed">
                  Your request has been placed in the <strong>AICTE Central Admin Review Queue</strong>. 
                  In accordance with statutory guidelines, an authorized AICTE scrutiny officer must inspect 
                  your institution details, society credentials, and contact authorization before your Unique College ID is generated and account activated.
                </p>
                <p className="text-[11px] text-amber-800">
                  You will receive your permanent Unique College ID and activation credentials at <strong>{formData.officialEmail}</strong> once approved.
                </p>
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 bg-blue-800 hover:bg-blue-900 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  Return to Portal Home
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Mandatory Review Notice at the top */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-950">
                    Administrator Review Required for Account Activation
                  </p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Submitting this form does not grant instant access. The request must be reviewed, verified, 
                    and approved by an AICTE Administrator in the Admin Dashboard, who will assign your permanent Unique College ID.
                  </p>
                </div>
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Proposed / Official College Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    name="collegeName"
                    value={formData.collegeName}
                    onChange={handleChange}
                    placeholder="e.g. Saraswati College of Engineering & Research"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Official College Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    name="officialEmail"
                    value={formData.officialEmail}
                    onChange={handleChange}
                    placeholder="e.g. principal@saraswaticollege.edu.in"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Institution Discipline / Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    name="institutionType"
                    value={formData.institutionType}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none bg-white"
                  >
                    <option value="Engineering & Technology">Engineering & Technology</option>
                    <option value="Management (MBA / PGDM)">Management (MBA / PGDM)</option>
                    <option value="Pharmacy (B.Pharm / M.Pharm)">Pharmacy (B.Pharm / M.Pharm)</option>
                    <option value="Architecture & Planning">Architecture & Planning</option>
                    <option value="Polytechnic / Diploma">Polytechnic / Diploma</option>
                    <option value="Hotel Management & Catering">Hotel Management & Catering</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Campus Physical Address <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={2}
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Plot / Survey No., Street, Landmark, Area"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    State / UT <span className="text-rose-500">*</span>
                  </label>
                  <select
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none bg-white"
                  >
                    <option value="Delhi">Delhi</option>
                    <option value="Maharashtra">Maharashtra</option>
                    <option value="Karnataka">Karnataka</option>
                    <option value="Tamil Nadu">Tamil Nadu</option>
                    <option value="Uttar Pradesh">Uttar Pradesh</option>
                    <option value="Gujarat">Gujarat</option>
                    <option value="Telangana">Telangana</option>
                    <option value="West Bengal">West Bengal</option>
                    <option value="Odisha">Odisha</option>
                    <option value="Other">Other State</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    District <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    name="district"
                    value={formData.district}
                    onChange={handleChange}
                    placeholder="e.g. Pune / Lucknow"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    PIN Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    name="pinCode"
                    value={formData.pinCode}
                    onChange={handleChange}
                    placeholder="6-digit PIN code"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Authorized Person's Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    name="authorizedPersonName"
                    value={formData.authorizedPersonName}
                    onChange={handleChange}
                    placeholder="e.g. Dr. Rajesh Verma"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Authorized Person Designation <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    name="authorizedPersonDesignation"
                    value={formData.authorizedPersonDesignation}
                    onChange={handleChange}
                    placeholder="e.g. Principal / Secretary / Chairman"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mobile Contact Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    name="contactNumber"
                    value={formData.contactNumber}
                    onChange={handleChange}
                    placeholder="+91 98765 43210"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-blue-800 hover:bg-blue-900 disabled:bg-blue-400 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
                >
                  {loading ? 'Submitting Request...' : 'Submit Request for AICTE Review'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
