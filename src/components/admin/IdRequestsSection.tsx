import React, { useState } from 'react';
import { UniqueIdRequest } from '../../types';
import { approveIdRequest, rejectIdRequest } from '../../services/dataService';
import { useAuth } from '../../context/AuthContext';
import {
  CheckCircle,
  XCircle,
  KeyRound,
  Building,
  User,
  Calendar,
  MapPin,
  Mail,
  Phone,
  AlertCircle,
  Sparkles
} from 'lucide-react';

interface Props {
  requests: UniqueIdRequest[];
  onRefresh: () => void;
}

export const IdRequestsSection: React.FC<Props> = ({ requests, onRefresh }) => {
  const { showToast } = useAuth();
  const [selectedReq, setSelectedReq] = useState<UniqueIdRequest | null>(null);
  const [modalType, setModalType] = useState<'approve' | 'reject' | null>(null);
  const [remarks, setRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [approvedResult, setApprovedResult] = useState<{
    collegeName: string;
    generatedId: string;
    temporaryPassword: string;
  } | null>(null);

  const pendingRequests = requests.filter((r) => r.status === 'Pending');
  const pastRequests = requests.filter((r) => r.status !== 'Pending');

  const handleOpenApprove = (req: UniqueIdRequest) => {
    setSelectedReq(req);
    setRemarks('All preliminary Trust & Society credentials verified against state registrar.');
    setModalType('approve');
  };

  const handleOpenReject = (req: UniqueIdRequest) => {
    setSelectedReq(req);
    setRemarks('Institution address/society registration documents could not be substantiated.');
    setModalType('reject');
  };

  const handleConfirmAction = async () => {
    if (!selectedReq || !modalType) return;
    setActionLoading(true);

    try {
      if (modalType === 'approve') {
        const result = await approveIdRequest(selectedReq.id, remarks);
        setApprovedResult({
          collegeName: result.college.collegeName,
          generatedId: result.college.collegeId,
          temporaryPassword: result.temporaryPassword,
        });
        showToast(
          `Unique College ID ${result.college.collegeId} generated successfully!`,
          'success'
        );
      } else {
        await rejectIdRequest(selectedReq.id, remarks);
        showToast(`Request ${selectedReq.id} rejected.`, 'info');
      }
      onRefresh();
      setModalType(null);
    } catch (err: any) {
      showToast(err.message || 'Action failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-600" />
            <span>Unique College ID Issuance Queue</span>
          </h3>
          <p className="text-xs text-slate-500">
            Review first-time applicant registrations, verify society deeds, and generate AICTE Permanent Unique College IDs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs bg-amber-100 text-amber-900 border border-amber-300 font-bold px-3 py-1 rounded-full">
            {pendingRequests.length} Pending Review
          </span>
        </div>
      </div>

      {/* Success Banner if ID was just generated */}
      {approvedResult && (
        <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-5 shadow-sm text-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-emerald-950 text-sm">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <span>College ID Generated & Account Activated!</span>
            </div>
            <button
              onClick={() => setApprovedResult(null)}
              className="text-emerald-700 hover:text-emerald-900 font-semibold"
            >
              Dismiss
            </button>
          </div>
          <p className="text-emerald-900">
            Institution: <strong>{approvedResult.collegeName}</strong>
          </p>
          <div className="flex flex-wrap gap-4 pt-1 font-mono text-[12px]">
            <div className="bg-white border border-emerald-300 px-3 py-1.5 rounded-lg text-emerald-900">
              Generated Unique College ID: <strong>{approvedResult.generatedId}</strong>
            </div>
            <div className="bg-white border border-emerald-300 px-3 py-1.5 rounded-lg text-emerald-900">
              Initial Temporary Password: <strong>{approvedResult.temporaryPassword}</strong>
            </div>
          </div>
          <p className="text-[11px] text-emerald-700">
            This college can now immediately authenticate at the College Portal using these credentials.
          </p>
        </div>
      )}

      {/* Pending Requests Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-800">
          Pending Verification Requests ({pendingRequests.length})
        </div>

        {pendingRequests.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No pending Unique College ID requests in the queue.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Ref ID & Date</th>
                  <th className="py-3 px-4">College Name & Type</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Authorized Representative</th>
                  <th className="py-3 px-4 text-right">Administrative Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pendingRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4">
                      <p className="font-mono font-bold text-slate-800">{req.id}</p>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        {req.requestDate}
                      </p>
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="font-bold text-slate-900">{req.collegeName}</p>
                      <p className="text-[11px] text-blue-700 font-medium">{req.institutionType}</p>
                      <p className="text-[11px] text-slate-400">{req.officialEmail}</p>
                    </td>

                    <td className="py-3.5 px-4 text-slate-600">
                      <p className="font-medium text-slate-800">{req.district}, {req.state}</p>
                      <p className="text-[11px] text-slate-400 truncate max-w-xs">{req.address} - {req.pinCode}</p>
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-800">{req.authorizedPersonName}</p>
                      <p className="text-[11px] text-slate-500">{req.authorizedPersonDesignation}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{req.contactNumber}</p>
                    </td>

                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleOpenApprove(req)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors inline-flex items-center gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Approve & Generate ID</span>
                      </button>
                      <button
                        onClick={() => handleOpenReject(req)}
                        className="px-3 py-1.5 bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Past / Processed Requests */}
      {pastRequests.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-700">
            Recent Scrutiny History ({pastRequests.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">College Name</th>
                  <th className="py-3 px-4">Assigned Unique ID</th>
                  <th className="py-3 px-4">Decision</th>
                  <th className="py-3 px-4">Officer Remarks</th>
                  <th className="py-3 px-4">Processed Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pastRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {req.collegeName}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-blue-800">
                      {req.generatedCollegeId || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        req.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {req.reviewRemarks}
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {req.reviewedAt || req.requestDate}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approval / Rejection Confirmation Modal */}
      {modalType && selectedReq && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className={`p-5 text-white ${modalType === 'approve' ? 'bg-emerald-800' : 'bg-rose-800'}`}>
              <h3 className="font-bold text-base">
                {modalType === 'approve' ? 'Approve & Issue Unique College ID' : 'Reject Institution ID Request'}
              </h3>
              <p className="text-xs text-white/80 mt-0.5">
                Target: {selectedReq.collegeName}
              </p>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {modalType === 'approve' ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-950 space-y-1">
                  <p className="font-semibold">Action will perform the following:</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-emerald-900">
                    <li>Generate an AICTE-standard 8-digit Unique College ID.</li>
                    <li>Create an active college account in the system database.</li>
                    <li>Permit the college to initiate New Approval or EoA applications.</li>
                  </ul>
                </div>
              ) : (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-950 space-y-1">
                  <p className="font-semibold">Action will reject this registration request:</p>
                  <p className="text-[11px] text-rose-900">
                    The reason below will be recorded in the official council scrutiny trail.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Administrative Review Remarks <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleConfirmAction}
                  className={`px-5 py-2 text-white rounded-lg font-bold shadow-sm transition-colors ${
                    modalType === 'approve'
                      ? 'bg-emerald-700 hover:bg-emerald-800'
                      : 'bg-rose-700 hover:bg-rose-800'
                  }`}
                >
                  {actionLoading ? 'Processing...' : modalType === 'approve' ? 'Confirm Approval & Generate ID' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
