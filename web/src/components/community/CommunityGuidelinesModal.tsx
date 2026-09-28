/**
 * MOCK.AI — Transparent Community Guidelines & Appeals Policy Modal
 *
 * Educates users on permitted conduct:
 * - Legitimate constructive criticism, dispute of answer keys, and honest feedback are WELCOME.
 * - Clear distinction between allowed dissent and prohibited abuse/spam.
 * - Transparent appeals process.
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, ShieldCheck, AlertTriangle, HelpCircle, Mail } from 'lucide-react';

interface CommunityGuidelinesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommunityGuidelinesModal: React.FC<CommunityGuidelinesModalProps> = ({
  isOpen,
  onClose,
}) => {
  // Keyboard navigation: Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock background scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-brand-primary/10 text-brand-primary">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-display text-surface-text dark:text-darkSurface-text">
                Community Guidelines & Standards
              </h2>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                Our commitment to open academic feedback, fair moderation, and learner safety.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 text-surface-muted hover:text-surface-text dark:text-darkSurface-muted dark:hover:text-darkSurface-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-sm text-surface-text dark:text-darkSurface-text leading-relaxed flex-1">
          {/* Welcome & Philosophy */}
          <div className="p-4 rounded-2xl bg-brand-primary/5 border border-brand-primary/20 space-y-2">
            <h3 className="font-bold text-brand-primary flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              <span>Core Principle: Honest Feedback Drives Platform Quality</span>
            </h3>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted leading-relaxed">
              Mock.AI is built for aspirants. The community hub is designed so that students and faculty can openly point out errors, request missing papers, and report bugs. We measure our success by how fast we verify and fix reported issues.
            </p>
          </div>

          {/* What is encouraged */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>What is Encouraged & Protected</span>
            </h4>
            <ul className="space-y-2 text-xs text-surface-muted dark:text-darkSurface-muted">
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 font-bold">✓</span>
                <span><strong>Disputing answers & questions:</strong> Pointing out incorrect answer keys, unclear wording, or transcription flaws with supporting citations.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 font-bold">✓</span>
                <span><strong>Constructive criticism of Mock.AI:</strong> Expressing dissatisfaction with features, test performance, or UI without fear of moderation.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 font-bold">✓</span>
                <span><strong>Paper & feature requests:</strong> Rallying fellow students to vote for missing shifts, regional exams, or new analysis tools.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 font-bold">✓</span>
                <span><strong>Academic prep discussion:</strong> Sharing exam strategies, syllabus breakdowns, and conceptual clarifications.</span>
              </li>
            </ul>
          </div>

          {/* What is prohibited */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>Strictly Prohibited Violations</span>
            </h4>
            <ul className="space-y-2 text-xs text-surface-muted dark:text-darkSurface-muted">
              <li className="flex items-start gap-2">
                <span className="text-red-500 font-bold">✕</span>
                <span><strong>Abuse & Harassment:</strong> Personal attacks, hate speech, threats, or harassment directed at learners or staff.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 font-bold">✕</span>
                <span><strong>Commercial Spam:</strong> Promoting paid coaching, unauthorized telegram channels, referral links, or unverified services.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 font-bold">✕</span>
                <span><strong>Malware & Phishing:</strong> Distributing malicious links, phishing forms, or pirated file lockers.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 font-bold">✕</span>
                <span><strong>Staff Impersonation:</strong> Falsely claiming to represent Mock.AI or forging official moderation badges.</span>
              </li>
            </ul>
          </div>

          {/* Moderation Transparency & Audit Trail */}
          <div className="p-4 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border space-y-2 text-xs">
            <h4 className="font-bold text-surface-text dark:text-darkSurface-text">
              Cryptographic Staff Security & Auditability
            </h4>
            <p className="text-surface-muted dark:text-darkSurface-muted leading-relaxed">
              All moderation actions, status changes, and user restrictions are verified directly by PostgreSQL row-level security and written to an immutable, append-only audit log. Internal staff notes remain strictly confidential and are never returned in public student API responses.
            </p>
          </div>

          {/* Appeals */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 text-xs text-brand-primary">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-brand-primary flex-shrink-0" />
              <div>
                <p className="font-bold text-surface-text dark:text-darkSurface-text">Need to appeal a moderation action?</p>
                <p className="text-surface-muted dark:text-darkSurface-muted">
                  Email appeals@mockai.org with your account email and post ID for an independent review.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="p-4 sm:p-5 border-t border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white font-bold text-xs shadow-glow hover:brightness-110 active:scale-95 transition-all"
          >
            I Understand & Agree
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
