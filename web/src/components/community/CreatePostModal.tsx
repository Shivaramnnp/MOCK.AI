/**
 * MOCK.AI — Create Community Post Modal
 *
 * Dedicated modal supporting 5 specialized post types:
 * 1. Paper Request (with canonical exam/year/shift linking & duplicate detection)
 * 2. Question Report (with locked canonical question linking & duplicate detection)
 * 3. Bug Report (with auto-environment diagnostics capture)
 * 4. Feature Request (with keyword duplicate detection)
 * 5. Academic Discussion
 */

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  FileQuestion,
  AlertTriangle,
  Bug,
  Lightbulb,
  MessageSquare,
  Users,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Laptop,
} from 'lucide-react';
import {
  CommunityPost,
  CommunityPostType,
  QuestionReportCategory,
  BugReportCategory,
  FeatureRequestCategory,
  DiscussionCategory,
  UserProfile,
} from '../../types';
import { communityService, getCommunityDisplayName } from '../../services/communityService';
import { COMPETITIVE_EXAMS_CATALOG } from '../../data/exams/catalog';

export interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated?: (post: CommunityPost) => void;
  onPostUpdated?: (post: CommunityPost) => void;
  onSelectExistingPost?: (post: CommunityPost) => void;
  user: UserProfile | null;
  initialType?: CommunityPostType;
  initialContext?: {
    examId?: string;
    editionYear?: number;
    paperId?: string;
    paperTitle?: string;
    questionId?: string;
    questionNumber?: number;
    tier?: string;
    shift?: string;
    currentRoute?: string;
    sessionId?: string;
  };
  editPost?: CommunityPost | null;
}

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  isOpen,
  onClose,
  onPostCreated,
  onPostUpdated,
  onSelectExistingPost,
  user,
  initialType = 'DISCUSSION',
  initialContext,
  editPost,
}) => {
  const isEditMode = Boolean(editPost);
  const [selectedType, setSelectedType] = useState<CommunityPostType>(initialType);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hasUserEditedTitle, setHasUserEditedTitle] = useState(false);

  // Paper Request fields
  const [examId, setExamId] = useState(initialContext?.examId || 'ssc-chsl');
  const [customExamName, setCustomExamName] = useState('');
  const [customExamAuthority, setCustomExamAuthority] = useState('');

  const [yearSelection, setYearSelection] = useState<string>(
    initialContext?.editionYear ? String(initialContext.editionYear) : '2024'
  );
  const [customYear, setCustomYear] = useState('');

  const [tier, setTier] = useState(initialContext?.tier || 'Tier 1');
  const [customStage, setCustomStage] = useState('');

  const [shift, setShift] = useState(initialContext?.shift || 'Shift 1');
  const [customSession, setCustomSession] = useState('');

  const [sourceUrl, setSourceUrl] = useState('');

  // Question Report fields
  const [questionCategory, setQuestionCategory] = useState<QuestionReportCategory>('incorrect_formula');
  const [paperId, setPaperId] = useState(initialContext?.paperId || '');
  const [questionId, setQuestionId] = useState(initialContext?.questionId || '');
  const [questionNumber, setQuestionNumber] = useState<number | undefined>(initialContext?.questionNumber);
  const [supportingSource, setSupportingSource] = useState('');

  // Bug Report fields
  const [bugCategory, setBugCategory] = useState<BugReportCategory>('test_engine');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [actualBehavior, setActualBehavior] = useState('');

  // Feature Request fields
  const [featureCategory, setFeatureCategory] = useState<FeatureRequestCategory>('new_exams');

  // Discussion fields
  const [discussionCategory, setDiscussionCategory] = useState<DiscussionCategory>('exam_prep');

  // Duplicate Detection State
  const [duplicates, setDuplicates] = useState<CommunityPost[]>([]);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  // Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Suggested title computation
  const suggestedTitle = useMemo(() => {
    if (selectedType === 'PAPER_REQUEST') {
      const isCustomExam = examId === 'CUSTOM_EXAM';
      const examNameStr = isCustomExam
        ? (customExamName.trim() || 'Custom Exam')
        : (COMPETITIVE_EXAMS_CATALOG.find((c) => c.id === examId)?.name || examId.toUpperCase());

      const yearStr = yearSelection === 'CUSTOM_YEAR'
        ? (customYear.trim() || '')
        : yearSelection;

      const stageStr = tier === 'CUSTOM_STAGE'
        ? customStage.trim()
        : (tier === 'Not Applicable' ? '' : tier);

      const sessionStr = shift === 'CUSTOM_SESSION'
        ? customSession.trim()
        : (shift === 'Not Applicable' ? '' : shift);

      const parts = [examNameStr, yearStr, stageStr, sessionStr, 'question paper missing'].filter(Boolean);
      return parts.join(' ');
    }
    return '';
  }, [selectedType, examId, customExamName, yearSelection, customYear, tier, customStage, shift, customSession]);

  // Keep title synced with suggestion if user hasn't typed their own title
  useEffect(() => {
    if (selectedType === 'PAPER_REQUEST' && !hasUserEditedTitle && suggestedTitle) {
      setTitle(suggestedTitle);
    }
  }, [selectedType, suggestedTitle, hasUserEditedTitle]);

  // Reset or apply initial context / editPost when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);

      if (editPost) {
        setSelectedType(editPost.type);
        setTitle(editPost.title);
        setDescription(editPost.description);
        setHasUserEditedTitle(true);

        const m = editPost.metadata || {};

        // Custom Exam vs Catalog Exam
        const isCustEx = Boolean(editPost.customExamName || m.isCustomExam || m.customExamName);
        if (isCustEx) {
          setExamId('CUSTOM_EXAM');
          setCustomExamName(editPost.customExamName || m.customExamName || '');
          setCustomExamAuthority(editPost.customExamAuthority || m.customExamAuthority || '');
        } else {
          setExamId(m.examId || 'ssc-chsl');
          setCustomExamName('');
          setCustomExamAuthority('');
        }

        // Custom Year vs Catalog Year
        const isCustYr = Boolean(editPost.customYear || m.isCustomYear || m.customYear);
        if (isCustYr) {
          setYearSelection('CUSTOM_YEAR');
          setCustomYear(String(editPost.customYear || m.customYear || ''));
        } else {
          setYearSelection(m.editionYear ? String(m.editionYear) : '2024');
          setCustomYear('');
        }

        // Custom Stage vs Catalog Tier
        const isCustStg = Boolean(editPost.customStage || m.customStage);
        if (isCustStg) {
          setTier('CUSTOM_STAGE');
          setCustomStage(editPost.customStage || m.customStage || '');
        } else {
          setTier(m.tier || 'Tier 1');
          setCustomStage('');
        }

        // Custom Session vs Catalog Shift
        const isCustSess = Boolean(editPost.customSession || m.customSession);
        if (isCustSess) {
          setShift('CUSTOM_SESSION');
          setCustomSession(editPost.customSession || m.customSession || '');
        } else {
          setShift(m.shift || 'Shift 1');
          setCustomSession('');
        }

        setSourceUrl(m.sourceUrl || '');
        setQuestionCategory(m.questionCategory || 'incorrect_formula');
        setPaperId(m.paperId || '');
        setQuestionId(m.questionId || '');
        setQuestionNumber(m.questionNumber);
        setSupportingSource(m.supportingSource || '');
        setBugCategory(m.bugCategory || 'test_engine');
        setExpectedBehavior(m.expectedBehavior || '');
        setActualBehavior(m.actualBehavior || '');
        setFeatureCategory(m.featureCategory || 'new_exams');
        setDiscussionCategory(m.discussionCategory || 'exam_prep');
        return;
      }

      // Create mode initialization
      setSelectedType(initialType);
      setHasUserEditedTitle(false);
      setTitle('');
      setDescription('');
      if (initialContext) {
        if (initialContext.examId) setExamId(initialContext.examId);
        if (initialContext.editionYear) setYearSelection(String(initialContext.editionYear));
        if (initialContext.paperId) setPaperId(initialContext.paperId);
        if (initialContext.questionId) setQuestionId(initialContext.questionId);
        if (initialContext.questionNumber) setQuestionNumber(initialContext.questionNumber);
        if (initialContext.tier) setTier(initialContext.tier);
        if (initialContext.shift) setShift(initialContext.shift);

        if (initialType === 'QUESTION_REPORT' && initialContext.questionNumber) {
          setTitle(`Issue reported on ${initialContext.examId?.toUpperCase()} Q${initialContext.questionNumber}`);
          setHasUserEditedTitle(true);
        } else if (initialType === 'PAPER_REQUEST' && initialContext.examId) {
          setTitle(`${initialContext.examId.toUpperCase()} ${initialContext.editionYear || ''} missing paper`);
        }
      }
    }
  }, [isOpen, editPost, initialType, initialContext]);

  // Environment Diagnostics (Auto-captured for bug reports)
  const diagnostics = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    return {
      route: initialContext?.currentRoute || window.location.pathname,
      browser: navigator.userAgent.includes('Chrome')
        ? 'Chrome'
        : navigator.userAgent.includes('Safari')
        ? 'Safari'
        : navigator.userAgent.includes('Firefox')
        ? 'Firefox'
        : 'Other',
      os: navigator.userAgent.includes('Mac')
        ? 'macOS'
        : navigator.userAgent.includes('Win')
        ? 'Windows'
        : navigator.userAgent.includes('Linux')
        ? 'Linux'
        : 'Mobile/Other',
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      appVersion: '1.0.0-prod',
      sessionId: initialContext?.sessionId,
      userAgent: navigator.userAgent,
    };
  }, [initialContext]);

  // Debounced duplicate detection (Only in Create Mode)
  useEffect(() => {
    if (!isOpen || isEditMode) {
      setDuplicates([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingDuplicates(true);
      try {
        const found = await communityService.findDuplicates({
          type: selectedType,
          title,
          examId: examId !== 'CUSTOM_EXAM' ? examId : undefined,
          editionYear: yearSelection !== 'CUSTOM_YEAR' ? Number(yearSelection) : undefined,
          tier: tier !== 'Not Applicable' && tier !== 'CUSTOM_STAGE' ? tier : undefined,
          shift: shift !== 'Not Applicable' && shift !== 'CUSTOM_SESSION' ? shift : undefined,
          questionId,
          isCustomExam: examId === 'CUSTOM_EXAM',
          customExamName: examId === 'CUSTOM_EXAM' ? customExamName : undefined,
          customYear: yearSelection === 'CUSTOM_YEAR' && customYear ? Number(customYear) : undefined,
          customStage: tier === 'CUSTOM_STAGE' ? customStage : undefined,
          customSession: shift === 'CUSTOM_SESSION' ? customSession : undefined,
        });
        setDuplicates(found);
      } catch {
        setDuplicates([]);
      } finally {
        setIsCheckingDuplicates(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [
    isEditMode,
    selectedType,
    title,
    examId,
    customExamName,
    yearSelection,
    customYear,
    tier,
    customStage,
    shift,
    customSession,
    questionId,
    isOpen,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (selectedType === 'PAPER_REQUEST') {
        if (examId === 'CUSTOM_EXAM') {
          if (!customExamName.trim() || customExamName.trim().length < 2) {
            throw new Error('Please enter a valid Custom Exam Name (at least 2 characters, e.g. POLYCET).');
          }
        }
        if (yearSelection === 'CUSTOM_YEAR') {
          const parsed = Number(customYear.trim());
          const maxYear = new Date().getFullYear() + 2;
          if (!customYear.trim() || isNaN(parsed) || parsed < 1950 || parsed > maxYear) {
            throw new Error(`Please enter a valid 4-digit exam year between 1950 and ${maxYear}.`);
          }
        }
        if (tier === 'CUSTOM_STAGE' && !customStage.trim()) {
          throw new Error('Please enter the custom stage name or choose a standard option.');
        }
        if (shift === 'CUSTOM_SESSION' && !customSession.trim()) {
          throw new Error('Please enter the custom session / shift name or choose a standard option.');
        }
      }

      // Auto-generate title for paper request if blank
      let finalTitle = title.trim();
      if (selectedType === 'PAPER_REQUEST' && !finalTitle) {
        finalTitle = suggestedTitle || 'Missing Exam Paper Request';
      }
      if (selectedType === 'QUESTION_REPORT' && !finalTitle && questionNumber) {
        finalTitle = `${examId.toUpperCase()} Question #${questionNumber} issue`;
      }

      if (!finalTitle || finalTitle.length < 5) {
        throw new Error('Please enter a descriptive title (at least 5 characters).');
      }

      const isCustomExamReq = selectedType === 'PAPER_REQUEST' && examId === 'CUSTOM_EXAM';
      const isCustomYearReq = selectedType === 'PAPER_REQUEST' && yearSelection === 'CUSTOM_YEAR';

      const postMetadata = {
        examId: selectedType === 'PAPER_REQUEST'
          ? (!isCustomExamReq ? examId : undefined)
          : (selectedType === 'QUESTION_REPORT' ? examId : undefined),
        editionYear: selectedType === 'PAPER_REQUEST'
          ? (!isCustomYearReq ? Number(yearSelection) : undefined)
          : (selectedType === 'QUESTION_REPORT' && yearSelection !== 'CUSTOM_YEAR' ? Number(yearSelection) : undefined),
        tier: selectedType === 'PAPER_REQUEST' && tier !== 'Not Applicable' && tier !== 'CUSTOM_STAGE' ? tier : undefined,
        shift: selectedType === 'PAPER_REQUEST' && shift !== 'Not Applicable' && shift !== 'CUSTOM_SESSION' ? shift : undefined,
        sourceUrl: sourceUrl.trim() || undefined,
        // Custom exam fields
        isCustomExam: isCustomExamReq,
        customExamName: isCustomExamReq ? customExamName.trim() : undefined,
        customExamAuthority: isCustomExamReq ? customExamAuthority.trim() || undefined : undefined,
        isCustomYear: isCustomYearReq,
        customYear: isCustomYearReq ? Number(customYear) : undefined,
        customStage: selectedType === 'PAPER_REQUEST' && tier === 'CUSTOM_STAGE' ? customStage.trim() : undefined,
        customSession: selectedType === 'PAPER_REQUEST' && shift === 'CUSTOM_SESSION' ? customSession.trim() : undefined,
        // Question Report fields
        paperId: selectedType === 'QUESTION_REPORT' ? paperId : undefined,
        questionId: selectedType === 'QUESTION_REPORT' ? questionId : undefined,
        questionNumber: selectedType === 'QUESTION_REPORT' ? questionNumber : undefined,
        questionCategory: selectedType === 'QUESTION_REPORT' ? questionCategory : undefined,
        supportingSource: supportingSource.trim() || undefined,
        // Bug Report fields
        bugCategory: selectedType === 'BUG_REPORT' ? bugCategory : undefined,
        expectedBehavior: selectedType === 'BUG_REPORT' ? expectedBehavior : undefined,
        actualBehavior: selectedType === 'BUG_REPORT' ? actualBehavior : undefined,
        diagnostics: selectedType === 'BUG_REPORT' ? diagnostics : undefined,
        featureCategory: selectedType === 'FEATURE_REQUEST' ? featureCategory : undefined,
        discussionCategory: selectedType === 'DISCUSSION' ? discussionCategory : undefined,
      };

      if (isEditMode && editPost) {
        const updated = await communityService.updatePost({
          postId: editPost.id,
          title: finalTitle,
          description,
          user,
          metadata: postMetadata,
        });

        if (onPostUpdated) {
          onPostUpdated(updated);
        }
        onClose();
        return;
      }

      const post = await communityService.createPost({
        type: selectedType,
        title: finalTitle,
        description,
        user,
        metadata: postMetadata,
      });

      if (onPostCreated) {
        onPostCreated(post);
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to submit post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSupportDuplicate = async (dup: CommunityPost) => {
    if (!user) {
      alert('Please sign in to support this request.');
      return;
    }
    try {
      await communityService.toggleSupport(dup.id, user);
      alert(`Supported "${dup.title}"! You will be notified when this is updated.`);
      if (onSelectExistingPost) {
        onSelectExistingPost(dup);
      }
      onClose();
    } catch {
      alert('Failed to support post.');
    }
  };

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
        className="w-full max-w-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Fixed Header */}
        <div className="p-5 sm:p-6 border-b border-surface-border dark:border-darkSurface-border flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold font-display text-surface-text dark:text-darkSurface-text">
              {isEditMode ? 'Edit Community Post' : 'Create Community Post'}
            </h2>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-0.5">
              {isEditMode
                ? 'Update your post details. All existing field values are preloaded.'
                : 'Discuss, request missing papers, or report platform & question issues.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-surface-muted hover:text-surface-text dark:text-darkSurface-muted dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Type Selection Tabs or Locked Banner */}
        {isEditMode ? (
          <div className="px-5 sm:px-6 py-3 border-b border-surface-border dark:border-darkSurface-border bg-surface-elev1/40 dark:bg-darkSurface-elev2/20 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-muted dark:text-darkSurface-muted font-medium">Post Type:</span>
              <span className="px-2.5 py-1 rounded-xl bg-brand-primary/10 text-brand-primary font-bold text-xs">
                {selectedType === 'PAPER_REQUEST' && '📄 Paper Request'}
                {selectedType === 'QUESTION_REPORT' && '⚠️ Question Report'}
                {selectedType === 'BUG_REPORT' && '🐛 Bug Report'}
                {selectedType === 'FEATURE_REQUEST' && '💡 Feature Request'}
                {selectedType === 'DISCUSSION' && '💬 Discussion'}
              </span>
            </div>
            <span className="text-[11px] text-surface-muted dark:text-darkSurface-muted font-medium">
              🔒 Type is locked to maintain metadata consistency
            </span>
          </div>
        ) : (
          <div className="px-5 sm:px-6 pt-4 pb-2.5 border-b border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 overflow-x-auto">
            <div className="flex items-center gap-1.5 min-w-max">
              <button
                type="button"
                onClick={() => setSelectedType('PAPER_REQUEST')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  selectedType === 'PAPER_REQUEST'
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-sm'
                    : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
                }`}
              >
              <FileQuestion className="w-3.5 h-3.5" />
              <span>Paper Request</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedType('QUESTION_REPORT')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedType === 'QUESTION_REPORT'
                  ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 shadow-sm'
                  : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Question Report</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedType('BUG_REPORT')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedType === 'BUG_REPORT'
                  ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 shadow-sm'
                  : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
              }`}
            >
              <Bug className="w-3.5 h-3.5" />
              <span>Bug Report</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedType('FEATURE_REQUEST')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedType === 'FEATURE_REQUEST'
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 shadow-sm'
                  : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span>Feature Request</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedType('DISCUSSION')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedType === 'DISCUSSION'
                  ? 'bg-brand-primary/15 text-brand-primary border border-brand-primary/30 shadow-sm'
                  : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Discussion</span>
            </button>
          </div>
        </div>
      )}

        {/* Form Container (Wrapping scrollable body and fixed footer) */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          {/* Scrollable Form Body */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
            {errorMessage && (
              <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* ── DUPLICATE DETECTION BANNER ─────────────────────────────── */}
            {duplicates.length > 0 && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs space-y-2.5">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>This issue may already have been reported!</span>
                </div>
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  To prevent duplicate admin work, please consider supporting the existing request instead:
                </p>
                <div className="space-y-2 pt-1">
                  {duplicates.slice(0, 2).map((dup) => (
                    <div
                      key={dup.id}
                      className="p-3 rounded-xl bg-white dark:bg-darkSurface-elev2 border border-amber-500/25 flex items-center justify-between gap-3 shadow-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-bold truncate text-surface-text dark:text-darkSurface-text">
                          {dup.title}
                        </p>
                        <span className="text-[10px] text-surface-muted dark:text-darkSurface-muted">
                          👥 {dup.supportCount} learners requested/supported this
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {onSelectExistingPost && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectExistingPost(dup);
                              onClose();
                            }}
                            className="px-3 py-1.5 rounded-lg bg-surface-elev2 hover:bg-surface-elev3 text-surface-text dark:bg-darkSurface-elev3 dark:hover:bg-darkSurface-elev2 dark:text-darkSurface-text text-[11px] font-semibold border border-surface-border dark:border-darkSurface-border transition-all"
                          >
                            View
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleSupportDuplicate(dup)}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-[11px] font-bold hover:brightness-110 shadow-sm transition-all"
                        >
                          Support Instead
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* ── TYPE 1: PAPER REQUEST FIELDS ────────────────────────────── */}
          {selectedType === 'PAPER_REQUEST' && (
            <div className="space-y-4 p-4 sm:p-5 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Target Exam Dropdown */}
                <div>
                  <label htmlFor="target-exam-select" className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1.5">Target Exam *</label>
                  <select
                    id="target-exam-select"
                    value={examId}
                    onChange={(e) => setExamId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                  >
                    <optgroup label="Catalog Exams">
                      {COMPETITIVE_EXAMS_CATALOG.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} ({e.category})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Unlisted / Other Exams">
                      <option value="CUSTOM_EXAM">✨ Custom / Other Exam</option>
                    </optgroup>
                  </select>
                </div>

                {/* Edition Year Dropdown */}
                <div>
                  <label htmlFor="edition-year-select" className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1.5">Edition Year *</label>
                  <select
                    id="edition-year-select"
                    value={yearSelection}
                    onChange={(e) => setYearSelection(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                  >
                    {[2025, 2024, 2023, 2022, 2021, 2020, 2019].map((y) => (
                      <option key={y} value={String(y)}>
                        {y}
                      </option>
                    ))}
                    <option value="CUSTOM_YEAR">📅 Custom / Other Year</option>
                  </select>
                </div>

                {/* Custom Exam Inputs (When Custom / Other Exam selected) */}
                {examId === 'CUSTOM_EXAM' && (
                  <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 animate-in fade-in">
                    <div>
                      <label htmlFor="custom-exam-name-input" className="block text-xs font-bold text-amber-800 dark:text-amber-300 mb-1.5">
                        Custom Exam Name *
                      </label>
                      <input
                        id="custom-exam-name-input"
                        type="text"
                        required
                        placeholder="e.g. POLYCET, NDA, TS EAMCET"
                        value={customExamName}
                        onChange={(e) => setCustomExamName(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-amber-500/30 bg-white dark:bg-darkSurface-elev1 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
                      />
                    </div>
                    <div>
                      <label htmlFor="custom-exam-authority-input" className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1.5">
                        Exam Authority / State (Optional)
                      </label>
                      <input
                        id="custom-exam-authority-input"
                        type="text"
                        placeholder="e.g. Andhra Pradesh / SBTET / UPSC"
                        value={customExamAuthority}
                        onChange={(e) => setCustomExamAuthority(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                      />
                    </div>
                  </div>
                )}

                {/* Custom Year Input (When Custom / Other Year selected) */}
                {yearSelection === 'CUSTOM_YEAR' && (
                  <div className="sm:col-span-2 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 animate-in fade-in">
                    <label htmlFor="custom-exam-year-input" className="block text-xs font-bold text-amber-800 dark:text-amber-300 mb-1.5">
                      Custom Exam Year * (4-digit year, 1950 - {new Date().getFullYear() + 2})
                    </label>
                    <input
                      id="custom-exam-year-input"
                      type="number"
                      required
                      min={1950}
                      max={new Date().getFullYear() + 2}
                      placeholder="e.g. 2015"
                      value={customYear}
                      onChange={(e) => setCustomYear(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-amber-500/30 bg-white dark:bg-darkSurface-elev1 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
                    />
                  </div>
                )}

                {/* Tier / Stage Dropdown */}
                <div>
                  <label htmlFor="tier-stage-select" className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1.5">Tier / Stage</label>
                  <select
                    id="tier-stage-select"
                    value={tier}
                    onChange={(e) => setTier(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs text-surface-text dark:text-darkSurface-text font-semibold focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                  >
                    <option value="Tier 1">Tier 1 (Preliminary)</option>
                    <option value="Tier 2">Tier 2 (Mains / Descriptive)</option>
                    <option value="Single Stage">Single Stage</option>
                    <option value="Not Applicable">Not Applicable</option>
                    <option value="CUSTOM_STAGE">✏️ Custom Stage</option>
                  </select>
                  {tier === 'CUSTOM_STAGE' && (
                    <input
                      type="text"
                      required
                      placeholder="e.g. Prelims, Phase 1, Round 2"
                      value={customStage}
                      onChange={(e) => setCustomStage(e.target.value)}
                      className="w-full mt-2 px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                    />
                  )}
                </div>

                {/* Shift / Session Dropdown */}
                <div>
                  <label htmlFor="shift-session-select" className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1.5">Shift / Session</label>
                  <select
                    id="shift-session-select"
                    value={shift}
                    onChange={(e) => setShift(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs text-surface-text dark:text-darkSurface-text font-semibold focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                  >
                    <option value="Shift 1">Shift 1 (Morning)</option>
                    <option value="Shift 2">Shift 2 (Afternoon)</option>
                    <option value="Shift 3">Shift 3 (Evening)</option>
                    <option value="Shift 4">Shift 4</option>
                    <option value="Not Applicable">Not Applicable</option>
                    <option value="CUSTOM_SESSION">✏️ Custom Session</option>
                  </select>
                  {shift === 'CUSTOM_SESSION' && (
                    <input
                      type="text"
                      required
                      placeholder="e.g. FN, AN, Day 1 Morning"
                      value={customSession}
                      onChange={(e) => setCustomSession(e.target.value)}
                      className="w-full mt-2 px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1.5">
                  Source Reference / Official Key Link (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://... or official question paper PDF / answer key link"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                />
              </div>
            </div>
          )}

          {/* ── TYPE 2: QUESTION REPORT FIELDS ──────────────────────────── */}
          {selectedType === 'QUESTION_REPORT' && (
            <div className="space-y-4 p-4 sm:p-5 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border">
              {/* Linked Question Context Badge */}
              {questionId ? (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-red-500" />
                    <span className="font-bold text-red-600 dark:text-red-400">
                      Linked to {examId.toUpperCase()} Question #{questionNumber || questionId}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-surface-muted dark:text-darkSurface-muted">{paperId || questionId}</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1.5">Exam Discipline</label>
                    <input
                      type="text"
                      placeholder="e.g. GATE 2025 DA or SSC CHSL"
                      value={examId}
                      onChange={(e) => setExamId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1.5">Question Number</label>
                    <input
                      type="number"
                      placeholder="e.g. 17"
                      value={questionNumber || ''}
                      onChange={(e) => setQuestionNumber(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1.5">Issue Category *</label>
                <select
                  value={questionCategory}
                  onChange={(e) => setQuestionCategory(e.target.value as QuestionReportCategory)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                >
                  <option value="incorrect_formula">Incorrect formula / LaTeX math rendering</option>
                  <option value="missing_image">Missing diagram or image</option>
                  <option value="wrong_image">Wrong image displayed</option>
                  <option value="broken_diagram">Broken diagram formatting</option>
                  <option value="incorrect_answer">Incorrect answer key</option>
                  <option value="incorrect_question">Incorrect question statement</option>
                  <option value="incorrect_option">Incorrect answer options</option>
                  <option value="formatting_rendering">Text continuation / boundary corruption</option>
                  <option value="missing_content">Missing question content</option>
                  <option value="other">Other issue</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1.5">
                  Official Answer Key / Textbook Source (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Official IIT GATE 2025 Master Key, Option B is correct"
                  value={supportingSource}
                  onChange={(e) => setSupportingSource(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                />
              </div>
            </div>
          )}

          {/* ── TYPE 3: BUG REPORT FIELDS ───────────────────────────────── */}
          {selectedType === 'BUG_REPORT' && (
            <div className="space-y-4 p-4 sm:p-5 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs">
                <div className="flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-purple-500 shrink-0" />
                  <span className="font-semibold text-purple-700 dark:text-purple-300">
                    Auto-Captured Environment Diagnostics
                  </span>
                </div>
                <span className="text-[11px] font-mono text-surface-muted dark:text-darkSurface-muted">
                  {diagnostics?.os} · {diagnostics?.browser} · {diagnostics?.viewport}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1.5">Bug Category *</label>
                <select
                  value={bugCategory}
                  onChange={(e) => setBugCategory(e.target.value as BugReportCategory)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                >
                  <option value="test_engine">Timed Exam Player / Controls</option>
                  <option value="timer">Exam Timer & Auto-Submit</option>
                  <option value="question_rendering">Question or Image Rendering</option>
                  <option value="results">Score Calculation & Results</option>
                  <option value="login">Authentication / Session</option>
                  <option value="explore">Explore Catalog</option>
                  <option value="community">Community / Discussions</option>
                  <option value="performance">Lag / Performance</option>
                  <option value="ui">UI Layout Shift</option>
                  <option value="other">Other Bug</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1.5">Expected Behavior</label>
                  <textarea
                    rows={2}
                    placeholder="What should have happened?"
                    value={expectedBehavior}
                    onChange={(e) => setExpectedBehavior(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1.5">Actual Behavior</label>
                  <textarea
                    rows={2}
                    placeholder="What actually occurred?"
                    value={actualBehavior}
                    onChange={(e) => setActualBehavior(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── TYPE 4: FEATURE REQUEST FIELDS ──────────────────────────── */}
          {selectedType === 'FEATURE_REQUEST' && (
            <div className="space-y-4 p-4 sm:p-5 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border">
              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1.5">Feature Category *</label>
                <select
                  value={featureCategory}
                  onChange={(e) => setFeatureCategory(e.target.value as FeatureRequestCategory)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                >
                  <option value="new_exams">New Competitive Exam (UPSC, Banking, State PSC, etc.)</option>
                  <option value="study_tools">Study Tools & AI Analysis</option>
                  <option value="analytics">Performance Analytics & Insights</option>
                  <option value="question_types">New Question Formats (NAT, MSQ, Case Studies)</option>
                  <option value="accessibility">Accessibility & Keyboard Navigation</option>
                  <option value="new_features">Other New Feature</option>
                </select>
              </div>
            </div>
          )}

          {/* ── TYPE 5: DISCUSSION FIELDS ───────────────────────────────── */}
          {selectedType === 'DISCUSSION' && (
            <div className="space-y-4 p-4 sm:p-5 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border">
              <div>
                <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1.5">Discussion Topic *</label>
                <select
                  value={discussionCategory}
                  onChange={(e) => setDiscussionCategory(e.target.value as DiscussionCategory)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs font-semibold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                >
                  <option value="exam_prep">Exam Preparation & Strategy</option>
                  <option value="doubt_clarification">Concept & Doubt Clarification</option>
                  <option value="study_resources">Syllabus & Study Resources</option>
                  <option value="general">General Academic Discussion</option>
                </select>
              </div>
            </div>
          )}

          {/* ── COMMON TITLE & DESCRIPTION ──────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted">
                Title *
              </label>
              {selectedType === 'PAPER_REQUEST' && suggestedTitle && title !== suggestedTitle && (
                <button
                  type="button"
                  onClick={() => {
                    setTitle(suggestedTitle);
                    setHasUserEditedTitle(false);
                  }}
                  className="text-[11px] font-bold text-brand-primary hover:underline"
                >
                  Use suggestion: "{suggestedTitle.length > 35 ? suggestedTitle.substring(0, 35) + '...' : suggestedTitle}"
                </button>
              )}
            </div>
            <input
              type="text"
              required
              placeholder={
                selectedType === 'PAPER_REQUEST'
                  ? 'e.g. POLYCET 2015 question paper missing'
                  : selectedType === 'QUESTION_REPORT'
                  ? 'e.g. GATE 2025 DA Q17 relational algebra operator formatting'
                  : selectedType === 'BUG_REPORT'
                  ? 'e.g. Timer freezes when switching question tabs in fullscreen'
                  : selectedType === 'FEATURE_REQUEST'
                  ? 'e.g. Dark mode for question diagram images'
                  : 'e.g. How to prepare for Engineering Mathematics?'
              }
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setHasUserEditedTitle(true);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-sm font-semibold text-surface-text dark:text-darkSurface-text placeholder:text-surface-muted dark:placeholder:text-darkSurface-muted focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-surface-muted dark:text-darkSurface-muted mb-1.5">
              Description *
            </label>
            <textarea
              required
              rows={4}
              placeholder="Provide clear details, steps to reproduce, or why this request is important for learners..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs text-surface-text dark:text-darkSurface-text placeholder:text-surface-muted dark:placeholder:text-darkSurface-muted leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
            />
          </div>
          </div>

          {/* Fixed Footer Submit Actions */}
          {(() => {
            const authorDisplayName = getCommunityDisplayName(user);
            const authorInitials = authorDisplayName
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase())
              .join('') || 'S';

            return (
              <div className="p-4 sm:p-5 border-t border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2.5">
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={authorDisplayName}
                      className="w-7 h-7 rounded-full object-cover border border-brand-primary/30"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-brand-primary/10 border border-brand-primary/25 text-brand-primary flex items-center justify-center font-bold text-[11px] shrink-0">
                      {authorInitials}
                    </div>
                  )}
                  <div>
                    <span className="text-[11px] text-surface-muted dark:text-darkSurface-muted block leading-tight">
                      {isEditMode ? 'Editing as:' : 'Posting as:'} <strong className="text-surface-text dark:text-darkSurface-text font-bold">{authorDisplayName}</strong>
                    </span>
                    <span className="text-[10px] text-surface-muted/80 dark:text-darkSurface-muted/80 block mt-0.5">
                      Your display name will be publicly visible with this post.
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
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
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white font-bold text-xs shadow-glow hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isSubmitting
                      ? (isEditMode ? 'Saving Changes...' : 'Submitting...')
                      : (isEditMode ? 'Save Changes' : 'Submit to Community')}
                  </button>
                </div>
              </div>
            );
          })()}
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
