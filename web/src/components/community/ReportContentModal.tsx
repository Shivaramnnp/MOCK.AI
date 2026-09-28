/**
 * MOCK.AI — Report Content Modal
 *
 * Provides safe content moderation reporting for posts and comments.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Flag, AlertCircle, CheckCircle2 } from 'lucide-react';
import { communityService } from '../../services/communityService';
import { UserProfile } from '../../types';

export interface ReportContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: 'POST' | 'COMMENT';
  targetId: string;
  user: UserProfile | null;
}

export const ReportContentModal: React.FC<ReportContentModalProps> = ({
  isOpen,
  onClose,
  targetType,
  targetId,
  user,
}) => {
  const [reason, setReason] = useState<'SPAM' | 'ABUSE' | 'INAPPROPRIATE' | 'SCAM' | 'INCORRECT' | 'OTHER'>('SPAM');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Keyboard navigation: Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await communityService.submitReport({
        targetType,
        targetId,
        reason,
        details,
        user,
      });
      setIsSubmitted(true);
      setTimeout(() => {
        setIsSubmitted(false);
        onClose();
      }, 1500);
    } catch {
      alert('Failed to submit moderation report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border rounded-3xl p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-red-500" />
            <h3 className="font-bold text-base font-display text-surface-text dark:text-darkSurface-text">
              Report {targetType === 'POST' ? 'Post' : 'Comment'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-surface-muted hover:text-surface-text dark:text-darkSurface-muted dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSubmitted ? (
          <div className="py-6 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h4 className="font-bold text-sm text-surface-text dark:text-darkSurface-text">
              Report Submitted
            </h4>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
              Thank you for keeping Mock.AI safe and trustworthy.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-xs text-surface-muted dark:text-darkSurface-muted mb-1.5">Reason for report *</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev2 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
              >
                <option value="SPAM">Spam or unwanted advertising</option>
                <option value="ABUSE">Harassment or abusive behavior</option>
                <option value="INAPPROPRIATE">Inappropriate or NSFW content</option>
                <option value="SCAM">Scam or phishing links</option>
                <option value="INCORRECT">Misleading or harmful information</option>
                <option value="OTHER">Other violation</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-xs text-surface-muted dark:text-darkSurface-muted mb-1.5">Additional Details (Optional)</label>
              <textarea
                rows={3}
                placeholder="Describe why this content violates community guidelines..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev2 text-xs text-surface-text dark:text-darkSurface-text placeholder:text-surface-muted dark:placeholder:text-darkSurface-muted focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
