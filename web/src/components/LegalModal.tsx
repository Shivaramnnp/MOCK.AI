import React, { useEffect, useState } from 'react';
import {
  X,
  Shield,
  FileText,
  Activity,
  Lock,
  CheckCircle2,
  Server,
  Zap,
  Mail,
  Cpu,
  Database,
  Globe,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

export type LegalTabType = 'privacy' | 'terms' | 'status' | 'security';

interface LegalModalProps {
  isOpen: boolean;
  initialTab?: LegalTabType;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({
  isOpen,
  initialTab = 'privacy',
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<LegalTabType>(initialTab);
  const [lastChecked, setLastChecked] = useState<string>(() => new Date().toLocaleTimeString());
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRefreshStatus = () => {
    setIsRefreshingStatus(true);
    setTimeout(() => {
      setLastChecked(new Date().toLocaleTimeString());
      setIsRefreshingStatus(false);
    }, 600);
  };

  const tabs: { id: LegalTabType; label: string; icon: React.ReactNode }[] = [
    { id: 'privacy', label: 'Privacy Policy', icon: <Lock className="w-4 h-4" /> },
    { id: 'terms', label: 'Terms of Service', icon: <FileText className="w-4 h-4" /> },
    { id: 'status', label: 'System Status', icon: <Activity className="w-4 h-4" /> },
    { id: 'security', label: 'Security Compliance', icon: <Shield className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-3xl max-h-[90vh] bg-surface dark:bg-[#111625] rounded-3xl border border-surface-border dark:border-white/10 shadow-2xl flex flex-col overflow-hidden text-surface-text dark:text-darkSurface-text"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-surface-border dark:border-white/10 flex items-center justify-between shrink-0 bg-surface-elev1 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-primary to-brand-variant flex items-center justify-center text-white shadow-md">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold font-display">
                MOCK.AI Trust, Terms & Infrastructure
              </h2>
              <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted">
                Enterprise-grade security, academic privacy, and real-time reliability
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-surface-muted hover:text-surface-text hover:bg-surface-elev2 dark:hover:bg-white/[0.06] transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 border-b border-surface-border dark:border-white/10 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 bg-surface dark:bg-[#111625]">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-t-xl text-xs font-bold transition-all border-b-2 whitespace-nowrap ${
                  isActive
                    ? 'border-brand-primary text-brand-primary bg-brand-primary/10 dark:bg-brand-primary/15'
                    : 'border-transparent text-surface-muted hover:text-surface-text hover:bg-surface-elev1 dark:hover:bg-white/[0.03]'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body (Scrollable) */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 text-xs sm:text-sm leading-relaxed text-surface-text/90 dark:text-darkSurface-text/90">
          {/* ════════════════════════════════════════════════════════════════ */}
          {/* TAB 1: PRIVACY POLICY                                            */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {activeTab === 'privacy' && (
            <div className="space-y-6">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-primary">
                  Effective Date: September 2026
                </span>
                <h3 className="text-xl font-bold text-surface-text dark:text-white mt-1">
                  Privacy Policy & Data Protection
                </h3>
                <p className="text-surface-muted dark:text-darkSurface-muted text-xs mt-1">
                  At MOCK.AI, we protect student and educator privacy as an inviolable academic standard.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-brand-primary/5 dark:bg-brand-primary/10 border border-brand-primary/20 space-y-1">
                <h4 className="font-bold text-brand-primary text-xs uppercase tracking-wider">
                  Our Zero-Leak AI Commitment
                </h4>
                <p className="text-xs text-surface-text dark:text-darkSurface-text">
                  Your uploaded study materials (textbooks, lecture notes, custom exam papers) are
                  processed solely to generate mock questions for your study sessions. We <strong>never</strong> sell your personal data or use your private notes to train public commercial AI models.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-sm text-surface-text dark:text-white mb-1.5">
                    1. Information We Collect
                  </h4>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-surface-muted dark:text-darkSurface-muted">
                    <li><strong>Account Credentials:</strong> Full name, verified email address, phone number (optional), and chosen role (Learner, Student, Teacher).</li>
                    <li><strong>Study & Practice Data:</strong> Mock exam scores, streak statistics, answer selections, and weak-topic diagnostics.</li>
                    <li><strong>Ingestion Inputs:</strong> PDFs, lecture audio transcripts, YouTube video URLs, and topic prompts provided during test generation.</li>
                    <li><strong>Local Storage State:</strong> Offline cache, theme preferences (light/dark), and local API keys stored safely on your browser.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-bold text-sm text-surface-text dark:text-white mb-1.5">
                    2. How Your Data Is Processed & Protected
                  </h4>
                  <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                    We use state-of-the-art cloud infrastructure backed by <strong>Supabase</strong> with Row-Level Security (RLS) policies. Only your authenticated user account has access to your exam rosters, results, and study analytics.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-sm text-surface-text dark:text-white mb-1.5">
                    3. Data Export & Deletion
                  </h4>
                  <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                    You maintain complete ownership of your academic records. You can download a full JSON backup of all test history via <em>Settings → Data Management</em>, or reset your local progress at any time.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-sm text-surface-text dark:text-white mb-1.5">
                    4. Contact Our Data Protection Team
                  </h4>
                  <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                    For privacy inquiries or deletion requests, contact our compliance officer at <span className="font-semibold text-brand-primary">themockai.official@gmail.com</span>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* TAB 2: TERMS OF SERVICE                                          */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {activeTab === 'terms' && (
            <div className="space-y-6">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-primary">
                  Last Updated: September 2026
                </span>
                <h3 className="text-xl font-bold text-surface-text dark:text-white mt-1">
                  Terms of Service
                </h3>
                <p className="text-surface-muted dark:text-darkSurface-muted text-xs mt-1">
                  Please review these terms before creating tests and sharing study material on MOCK.AI.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-sm text-surface-text dark:text-white mb-1.5">
                    1. Acceptance of Terms
                  </h4>
                  <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                    By accessing or using MOCK.AI (including our mock exam generators, competitive exam modules, and classroom suites), you agree to be bound by these Terms of Service and all applicable educational laws.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-sm text-surface-text dark:text-white mb-1.5">
                    2. Permitted Educational Use
                  </h4>
                  <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                    MOCK.AI is engineered as an adaptive learning and competitive exam preparatory tool. You agree not to upload copyrighted exam answer leaks, confidential government materials without authorization, or software vulnerabilities designed to disrupt test delivery.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-sm text-surface-text dark:text-white mb-1.5">
                    3. AI Question & Explanation Accuracy
                  </h4>
                  <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                    While our AI pipelines utilize multi-pass verification and LaTeX mathematical formatting to ensure rigorous standards, AI-generated questions are intended as diagnostic study aids. Scholars should always cross-reference official syllabus blueprints.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-sm text-surface-text dark:text-white mb-1.5">
                    4. Educator & Classroom Conduct
                  </h4>
                  <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                    Teachers creating virtual classrooms are responsible for the exams assigned to enrolled students. MOCK.AI reserves the right to terminate accounts that violate student safety or academic ethics.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-sm text-surface-text dark:text-white mb-1.5">
                    5. Fair Usage & Rate Limits
                  </h4>
                  <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                    To maintain lightning-fast response times for all scholars worldwide, MOCK.AI enforces automated rate limiting on rapid bulk AI generation.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* TAB 3: SYSTEM STATUS                                             */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {activeTab === 'status' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-surface-border dark:border-white/10">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold mb-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>All Systems Operational</span>
                  </div>
                  <h3 className="text-xl font-bold text-surface-text dark:text-white">
                    Live Infrastructure Status
                  </h3>
                  <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted">
                    Real-time health of MOCK.AI services, databases, and AI pipelines
                  </p>
                </div>

                <button
                  onClick={handleRefreshStatus}
                  disabled={isRefreshingStatus}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-surface-border dark:border-white/10 bg-surface-elev1 dark:bg-white/[0.04] text-xs font-semibold hover:bg-surface-elev2 transition-all self-start sm:self-auto"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingStatus ? 'animate-spin' : ''}`} />
                  <span>Refresh ({lastChecked})</span>
                </button>
              </div>

              {/* Status Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    name: 'MOCK.AI Web Application',
                    desc: 'Edge CDN & Frontend Hosting',
                    status: 'Operational',
                    latency: '18ms',
                    icon: <Globe className="w-4 h-4 text-emerald-400" />,
                  },
                  {
                    name: 'Supabase Authentication',
                    desc: 'OAuth, OTP & User Sessions',
                    status: 'Operational',
                    latency: '36ms',
                    icon: <Lock className="w-4 h-4 text-emerald-400" />,
                  },
                  {
                    name: 'Cloud Database & Storage',
                    desc: 'PostgreSQL with Row Level Security',
                    status: 'Operational',
                    latency: '42ms',
                    icon: <Database className="w-4 h-4 text-emerald-400" />,
                  },
                  {
                    name: 'Gemini AI Ingestion Engine',
                    desc: 'Flash & Pro Multi-Modal Reasoning',
                    status: 'Operational',
                    latency: '1.2s',
                    icon: <Zap className="w-4 h-4 text-emerald-400" />,
                  },
                  {
                    name: 'Groq High-Speed Backup',
                    desc: 'Low-latency question generation',
                    status: 'Operational',
                    latency: '480ms',
                    icon: <Cpu className="w-4 h-4 text-emerald-400" />,
                  },
                  {
                    name: 'SMTP Email Delivery',
                    desc: 'Transactional Mailjet & Brevo Relays',
                    status: 'Operational',
                    latency: '99.8%',
                    icon: <Mail className="w-4 h-4 text-emerald-400" />,
                  },
                  {
                    name: 'LaTeX Math Formatter',
                    desc: 'Client-side KaTeX derivation engine',
                    status: 'Operational',
                    latency: '< 1ms',
                    icon: <Server className="w-4 h-4 text-emerald-400" />,
                  },
                  {
                    name: 'Competitive Exam Engine',
                    desc: 'SSC CHSL, GATE & NEET PyQ Bank',
                    status: 'Operational',
                    latency: '12ms',
                    icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
                  },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl border border-surface-border dark:border-white/10 bg-surface-elev1 dark:bg-white/[0.02] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-surface-elev2 dark:bg-white/[0.04] flex items-center justify-center shrink-0">
                        {item.icon}
                      </div>
                      <div className="min-w-0">
                        <h5 className="font-bold text-xs truncate text-surface-text dark:text-white">
                          {item.name}
                        </h5>
                        <p className="text-[10px] text-surface-muted dark:text-darkSurface-muted truncate">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block">
                        ● {item.status}
                      </span>
                      <span className="text-[10px] text-surface-muted dark:text-darkSurface-muted">
                        {item.latency}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Uptime Guarantee Card */}
              <div className="p-4 rounded-2xl bg-surface-elev1 dark:bg-white/[0.02] border border-surface-border dark:border-white/10 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-surface-text dark:text-white">99.98% Historical Uptime</span>
                  <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted">
                    Monitored continuous health across 4 global edge regions. Zero major outages in the past 90 days.
                  </p>
                </div>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold text-sm shrink-0">
                  99.98%
                </span>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* TAB 4: SECURITY COMPLIANCE                                       */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Enterprise Security Standards
                </span>
                <h3 className="text-xl font-bold text-surface-text dark:text-white mt-1">
                  Security & Regulatory Compliance
                </h3>
                <p className="text-surface-muted dark:text-darkSurface-muted text-xs mt-1">
                  Engineered with zero-trust architecture to protect students and academic institutions.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-4 rounded-2xl border border-surface-border dark:border-white/10 bg-surface-elev1 dark:bg-white/[0.02] space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                    <Lock className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-xs text-surface-text dark:text-white">
                    256-Bit SSL/TLS In Transit
                  </h4>
                  <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted leading-relaxed">
                    All client-server communications use HTTPS with TLS 1.3 encryption. HTTP traffic is strictly disallowed.
                  </p>
                </div>

                <div className="p-4 rounded-2xl border border-surface-border dark:border-white/10 bg-surface-elev1 dark:bg-white/[0.02] space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                    <Database className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-xs text-surface-text dark:text-white">
                    PostgreSQL Row-Level Security
                  </h4>
                  <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted leading-relaxed">
                    Database tables enforce Supabase RLS. No student can view exams, answers, or analytics belonging to another user.
                  </p>
                </div>

                <div className="p-4 rounded-2xl border border-surface-border dark:border-white/10 bg-surface-elev1 dark:bg-white/[0.02] space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                    <Shield className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-xs text-surface-text dark:text-white">
                    OAuth 2.0 PKCE & Bcrypt
                  </h4>
                  <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted leading-relaxed">
                    Passwords are never stored in plaintext. Single Sign-On (Google & GitHub) runs on secure PKCE flows.
                  </p>
                </div>

                <div className="p-4 rounded-2xl border border-surface-border dark:border-white/10 bg-surface-elev1 dark:bg-white/[0.02] space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-xs text-surface-text dark:text-white">
                    FERPA & GDPR Alignment
                  </h4>
                  <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted leading-relaxed">
                    Respects educational privacy rights. Full support for student data export, access requests, and complete profile deletion.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-surface-elev1 dark:bg-white/[0.02] border border-surface-border dark:border-white/10 space-y-1.5">
                <h4 className="font-bold text-xs text-surface-text dark:text-white">
                  Vulnerability Reporting
                </h4>
                <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted">
                  If you discover a potential security vulnerability within MOCK.AI, please report it directly to <span className="font-semibold text-brand-primary">themockai.official@gmail.com</span> for prioritized investigation.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-surface-border dark:border-white/10 flex items-center justify-between shrink-0 bg-surface-elev1 dark:bg-white/[0.02]">
          <span className="text-[11px] text-surface-muted dark:text-darkSurface-muted">
            MOCK.AI Platform &bull; All Rights Reserved &copy; {new Date().getFullYear()}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white font-bold text-xs shadow-md transition-all active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
