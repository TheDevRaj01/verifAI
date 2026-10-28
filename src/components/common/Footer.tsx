import React from 'react';
import { ShieldCheck, Phone, Mail, MapPin, ExternalLink, HelpCircle } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 text-slate-300 mt-16 border-t-4 border-blue-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Column 1: AICTE & VerifAI Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-lg">
              <ShieldCheck className="w-6 h-6 text-sky-400" />
              <span>VerifAI — AICTE</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Automated AI-assisted validation and document scrutiny portal for technical institutions applying for Extension of Approval (EoA) and New Approvals under AICTE norms.
            </p>
            <div className="pt-2 text-xs text-amber-300 font-medium">
              Smart India Hackathon (SIH) Prototype
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
              Application Tracks
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li className="hover:text-sky-300 cursor-pointer">
                Extension of Approval (EoA)
              </li>
              <li className="hover:text-sky-300 cursor-pointer">
                New Technical Institution Approval
              </li>
              <li className="hover:text-sky-300 cursor-pointer">
                Unique College ID Registration
              </li>
              <li className="hover:text-sky-300 cursor-pointer">
                Approval Process Handbook (APH 2026–27)
              </li>
              <li className="hover:text-sky-300 cursor-pointer">
                Cadre Ratio & Faculty Norms
              </li>
            </ul>
          </div>

          {/* Column 3: AICTE Policies */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
              AICTE Compliance
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li className="hover:text-sky-300 cursor-pointer">
                Land & Building Regulations
              </li>
              <li className="hover:text-sky-300 cursor-pointer">
                Anti-Ragging Committee Norms
              </li>
              <li className="hover:text-sky-300 cursor-pointer">
                Fire Safety & Structure Stability
              </li>
              <li className="hover:text-sky-300 cursor-pointer">
                National Board of Accreditation (NBA)
              </li>
              <li className="hover:text-sky-300 cursor-pointer">
                NIRF Alignment Parameters
              </li>
            </ul>
          </div>

          {/* Column 4: Helpdesk */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
              AICTE Central Helpdesk
            </h4>
            <div className="space-y-2.5 text-xs text-slate-400">
              <p className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>Nelson Mandela Marg, Vasant Kunj, New Delhi - 110070</span>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-sky-400 flex-shrink-0" />
                <span>011-29581000 / 29581050 (9:30 AM - 5:30 PM)</span>
              </p>
              <p className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-sky-400 flex-shrink-0" />
                <span>helpdesk-approval@aicte-india.org</span>
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Disclaimer */}
        <div className="border-t border-slate-800 pt-6 text-center text-xs text-slate-500 space-y-2">
          <p>
            © 2026 All India Council for Technical Education (AICTE), New Delhi. Developed for Smart India Hackathon.
          </p>
          <p className="text-[11px] text-slate-400">
            <strong>Demonstration Notice:</strong> Institutional records marked as Demo Data are for simulation and functional verification. Real backend utilizes Firebase Authentication and Cloud Firestore security rules.
          </p>
        </div>
      </div>
    </footer>
  );
};
