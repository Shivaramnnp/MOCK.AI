import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Flag,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Loader2,
  FileQuestion,
  FileCheck2,
} from 'lucide-react';
import { communityService } from '../../services/communityService';
import { storage } from '../../services/storage';
import { UserProfile, QuestionReportCategory } from '../../types';

export interface ReportReasonOption {
  key: QuestionReportCategory;
  label: string;
  description: string;
}

export const REPORT_REASONS: readonly ReportReasonOption[] = [
  {
    key: 'incorrect_question',
    label: 'Incorrect question / statement',
    description: 'Factual error, wrong premise, or grammar issue in the question.',
  },
  {
    key: 'incorrect_answer',
    label: 'Incorrect answer key',
    description: 'The designated official correct key or answer value is wrong.',
  },
  {
    key: 'ambiguous_question',
    label: 'Ambiguous question',
    description: 'Multiple interpretations or more than one plausible correct answer.',
  },
  {
    key: 'incorrect_option',
    label: 'Incorrect options',
    description: 'Typo, missing option, or repeated option text among choices.',
  },
  {
    key: 'missing_image',
    label: 'Missing image / diagram',
    description: 'Figure, schematic, table, or graph is missing or failed to render.',
  },
  {
    key: 'formatting_rendering',
    label: 'Formatting / rendering issue',
    description: 'Broken LaTeX math equation, corrupted symbols, or cutoff text.',
  },
  {
    key: 'duplicate_question',
    label: 'Duplicate question',
    description: 'The exact question repeats earlier in this same examination.',
  },
  {
    key: 'marking_issue',
    label: 'Marks / negative-marking issue',
    description: 'Incorrect mark allocation or scoring discrepancy.',
  },
  {
    key: 'other',
    label: 'Other issue',
    description: 'Any other problem not covered by the categories above.',
  },
] as const;

export interface ReportQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  examId: string;
  examName?: string;
  paperId: string;
  paperTitle: string;
  questionId: string;
  questionNumber: number;
  sessionId?: string;
  user?: UserProfile | null;
  onReportSubmitted?: (reportId: string) => void;
}

export const ReportQuestionModal: React.FC<ReportQuestionModalProps> = ({
  isOpen,
  onClose,
  examId,
  examName,
  paperId,
  paperTitle,
  questionId,
  questionNumber,
  sessionId,
  user,
  onReportSubmitted,
}) => {
  const [selectedReason, setSelectedReason] = useState<QuestionReportCategory | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasExistingReport, setHasExistingReport] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Get authenticated user (fallback to local storage profile)
  const resolvedUser = user || (typeof window !== 'undefined' ? storage.getProfile() : null);

  // Check for existing duplicate report for this user + question + paper
  useEffect(() => {
    if (!isOpen || !questionId) {
      setHasExistingReport(false);
      return;
    }

    let isMounted = true;
    const checkDuplicate = async () => {
      setCheckingDuplicate(true);
      try {
        const dupes = await communityService.findDuplicates({
          type: 'QUESTION_REPORT',
          questionId,
          paperId,
          userId: resolvedUser?.uid,
        });

        if (isMounted) {
          setHasExistingReport(dupes.length > 0);
        }
      } catch (err) {
        console.warn('[ReportQuestionModal] Duplicate check error:', err);
      } finally {
        if (isMounted) {
          setCheckingDuplicate(false);
        }
      }
    };

    checkDuplicate();

    return () => {
      isMounted = false;
    };
  }, [isOpen, questionId, paperId, resolvedUser?.uid]);

  // Preserve focus & manage focus on open/close
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElement.current = document.activeElement as HTMLElement;
      setSelectedReason(null);
      setDescription('');
      setIsSubmitted(false);
      setErrorMessage(null);

      // Focus first focusable item after brief delay for modal animation
      const timer = setTimeout(() => {
        firstInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else if (previouslyFocusedElement.current) {
      previouslyFocusedElement.current.focus();
    }
  }, [isOpen]);

  // Lock background scroll
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Keyboard navigation: Escape key closes modal & Tab trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReason || isSubmitting || hasExistingReport) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const selectedOption = REPORT_REASONS.find((r) => r.key === selectedReason);
    const reasonLabel = selectedOption?.label || selectedReason;

    try {
      const reportTitle = `${examName || examId.toUpperCase()} Q#${questionNumber}: ${reasonLabel}`;
      const defaultDesc = `Reported: ${reasonLabel} for Question #${questionNumber} (${questionId}) in ${paperTitle}.`;
      const finalDesc = description.trim()
        ? `${defaultDesc}\n\nLearner Notes: ${description.trim()}`
        : defaultDesc;

      const createdPost = await communityService.createPost({
        type: 'QUESTION_REPORT',
        title: reportTitle,
        description: finalDesc,
        user: resolvedUser,
        metadata: {
          examId,
          examName: examName || examId.toUpperCase(),
          paperId,
          paperTitle,
          questionId,
          questionNumber,
          sessionId,
          questionCategory: selectedReason,
          reportReason: reasonLabel,
        },
      });

      setIsSubmitted(true);
      if (onReportSubmitted) {
        onReportSubmitted(createdPost.id);
      }

      // Auto close after brief success confirmation
      setTimeout(() => {
        setIsSubmitted(false);
        onClose();
      }, 1600);
    } catch (err: any) {
      console.error('[ReportQuestionModal] Submission failed:', err);
      setErrorMessage(
        err?.message || 'Failed to submit report. Please check your network and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      aria-describedby="report-modal-desc"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/65 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={modalRef}
        className="w-full max-w-xl max-h-[92vh] flex flex-col bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-left"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between p-5 sm:p-6 border-b border-surface-border dark:border-darkSurface-border bg-surface-elev1/40 dark:bg-darkSurface-elev2/40">
          <div className="space-y-1 pr-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                <Flag className="w-3 h-3" />
                <span>Question Verification</span>
              </span>
            </div>
            <h2
              id="report-modal-title"
              className="text-xl sm:text-2xl font-extrabold font-display text-surface-text dark:text-darkSurface-text"
            >
              Report Question
            </h2>
            <p
              id="report-modal-desc"
              className="text-xs text-surface-muted dark:text-darkSurface-muted"
            >
              Found an issue with this question? Tell us what needs to be checked.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close report dialog"
            className="p-2 rounded-xl text-surface-muted hover:text-surface-text dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors disabled:opacity-50 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Success State View */}
          {isSubmitted ? (
            <div className="py-10 text-center space-y-3 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-extrabold text-surface-text dark:text-darkSurface-text font-display">
                  Report submitted
                </h3>
                <p className="text-xs sm:text-sm text-surface-muted dark:text-darkSurface-muted max-w-sm mx-auto leading-relaxed">
                  Thanks for helping us improve Mock.AI. Our team will review this question.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Context Summary Card (Auto-populated immutable metadata) */}
              <div className="p-4 rounded-2xl bg-surface-elev1/50 dark:bg-darkSurface-elev2/50 border border-surface-border dark:border-darkSurface-border grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-surface-muted block text-[11px] font-medium">Exam</span>
                  <span className="font-bold text-surface-text dark:text-darkSurface-text">
                    {examName || examId.toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-surface-muted block text-[11px] font-medium">Question</span>
                  <span className="font-bold text-surface-text dark:text-darkSurface-text">
                    Question {questionNumber}
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-surface-muted block text-[11px] font-medium">Paper</span>
                  <span className="font-bold text-surface-text dark:text-darkSurface-text truncate block" title={paperTitle}>
                    {paperTitle}
                  </span>
                </div>
              </div>

              {/* Duplicate Report Alert if already reported */}
              {hasExistingReport && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold text-amber-800 dark:text-amber-300">
                      You have already reported this question.
                    </p>
                    <p className="text-amber-700 dark:text-amber-400/90 leading-relaxed">
                      Our moderation team is reviewing this question. You can safely continue your test without submitting another report.
                    </p>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs flex items-start gap-2.5 text-red-600 dark:text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Predefined Reasons Radio / Selection List */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-surface-text dark:text-darkSurface-text">
                  Select the issue reason <span className="text-red-500">*</span>
                </label>

                <div
                  role="radiogroup"
                  aria-label="Question issue reason"
                  className="space-y-2"
                >
                  {REPORT_REASONS.map((option, idx) => {
                    const isSelected = selectedReason === option.key;
                    return (
                      <label
                        key={option.key}
                        htmlFor={`report-reason-${option.key}`}
                        onClick={() => {
                          if (!hasExistingReport && !isSubmitting) {
                            setSelectedReason(option.key);
                          }
                        }}
                        className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-brand-primary bg-brand-primary/5 dark:bg-brand-primary/10 shadow-sm'
                            : 'border-surface-border dark:border-darkSurface-border hover:bg-surface-elev1/50 dark:hover:bg-darkSurface-elev2/50'
                        } ${hasExistingReport ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        <input
                          id={`report-reason-${option.key}`}
                          ref={idx === 0 ? firstInputRef : undefined}
                          type="radio"
                          name="reportReason"
                          value={option.key}
                          checked={isSelected}
                          disabled={hasExistingReport || isSubmitting}
                          onChange={() => setSelectedReason(option.key)}
                          className="mt-1 text-brand-primary focus:ring-brand-primary h-4 w-4 shrink-0"
                        />
                        <div className="space-y-0.5 flex-1">
                          <span className="block text-xs font-bold text-surface-text dark:text-darkSurface-text">
                            {option.label}
                          </span>
                          <span className="block text-[11px] text-surface-muted dark:text-darkSurface-muted leading-relaxed">
                            {option.description}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Additional Details (Optional Textarea) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="report-description"
                    className="block text-xs font-bold text-surface-text dark:text-darkSurface-text"
                  >
                    Additional details (optional)
                  </label>
                  <span className="text-[11px] text-surface-muted dark:text-darkSurface-muted">
                    {description.length}/500
                  </span>
                </div>
                <textarea
                  id="report-description"
                  rows={3}
                  maxLength={500}
                  value={description}
                  disabled={hasExistingReport || isSubmitting}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the issue so our team can verify it..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-base text-xs text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all placeholder:text-surface-muted dark:placeholder:text-darkSurface-muted resize-none disabled:opacity-50"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev1 dark:bg-darkSurface-elev2 hover:bg-surface-elev2 text-xs font-bold text-surface-text dark:text-darkSurface-text transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={!selectedReason || isSubmitting || hasExistingReport}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold shadow-md shadow-brand-primary/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Flag className="w-3.5 h-3.5" />
                      <span>Submit Report</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
