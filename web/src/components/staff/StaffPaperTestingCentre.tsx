/**
 * MOCK.AI — Staff Paper Testing Centre (Stage 1)
 *
 * Dedicated environment for Mock.AI Team members to systematically audit,
 * test, and report anomalies/defects on competitive exam papers.
 * Access is restricted server-side to verified staff members.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldCheck,
  Bug,
  FileText,
  HelpCircle,
  ExternalLink,
  Save,
  Check,
  RotateCcw,
} from 'lucide-react';
import {
  UserProfile,
  ExamPaper,
  StaffPaperTestingSummary,
  StaffPaperTestingSession,
  StaffQuestionDefect,
  StaffDefectCategory,
  StaffQuestionVerdict,
  STAFF_DEFECT_CATEGORY_LABELS,
} from '../../types';
import { staffService } from '../../services/staffService';
import { EXAM_PAPERS_MAP, COMPETITIVE_EXAMS_CATALOG } from '../../data/exams/catalog';
import { LatexRenderer } from '../LatexRenderer';
import { StructuredContentRenderer } from '../StructuredContentRenderer';

interface StaffPaperTestingCentreProps {
  user: UserProfile | null;
  initialPaperId?: string | null;
  onNavigateToPaper?: (paperId: string | null) => void;
  onReturnToDashboard?: () => void;
}

export const StaffPaperTestingCentre: React.FC<StaffPaperTestingCentreProps> = ({
  user,
  initialPaperId,
  onNavigateToPaper,
  onReturnToDashboard,
}) => {
  // Navigation State
  const [activePaperId, setActivePaperId] = useState<string | null>(initialPaperId || null);
  const isClosedRef = useRef(false);

  // Summaries & Dashboard State
  const [summaries, setSummaries] = useState<StaffPaperTestingSummary[]>([]);
  const [isLoadingSummaries, setIsLoadingSummaries] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [examFilter, setExamFilter] = useState<string>('ALL');

  // Active Testing Session State
  const [session, setSession] = useState<StaffPaperTestingSession | null>(null);
  const [paperDefects, setPaperDefects] = useState<StaffQuestionDefect[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isLoadingPaper, setIsLoadingPaper] = useState(false);

  // Defect Reporting Form State
  const [isReportingDefect, setIsReportingDefect] = useState(false);
  const [defectCategory, setDefectCategory] = useState<StaffDefectCategory>('INCORRECT_OR_INCOMPLETE_QUESTION');
  const [defectDescription, setDefectDescription] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [staffNotes, setStaffNotes] = useState('');
  const [isSubmittingDefect, setIsSubmittingDefect] = useState(false);
  const [isSavingVerdict, setIsSavingVerdict] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Concurrency guard to prevent duplicate clicks and rapid key events during saving
  const isSavingRef = useRef(false);

  // Protection against concurrent/looping paper session loading
  const loadingPaperIdRef = useRef<string | null>(null);
  const onNavigateToPaperRef = useRef(onNavigateToPaper);
  useEffect(() => {
    onNavigateToPaperRef.current = onNavigateToPaper;
  }, [onNavigateToPaper]);

  useEffect(() => {
    if (initialPaperId) {
      isClosedRef.current = false;
    }
  }, [initialPaperId]);

  // Load Dashboard Summaries
  const loadSummaries = useCallback(async () => {
    setIsLoadingSummaries(true);
    try {
      const data = await staffService.getStaffTestingSummaries();
      setSummaries(data);
    } finally {
      setIsLoadingSummaries(false);
    }
  }, []);

  useEffect(() => {
    loadSummaries();
  }, [loadSummaries]);

  // Load Specific Paper Session
  const openPaperTesting = useCallback(async (paperId: string, notifyParent = false) => {
    if (!paperId) return;
    if (loadingPaperIdRef.current === paperId) return;
    isClosedRef.current = false;
    loadingPaperIdRef.current = paperId;

    const staffId = user?.uid || 'staff_member';
    setIsLoadingPaper(true);
    setActivePaperId(paperId);
    setSubmitError(null);
    setIsReportingDefect(false);

    // 1. Instant optimistic session resolution from local storage/index
    const localSession = staffService.getLocalPaperTestingSession(paperId, staffId);
    const paper = EXAM_PAPERS_MAP[paperId];
    const totalQ = paper?.questions?.length || localSession?.totalQuestions || 1;

    if (localSession) {
      setSession(localSession);
      const safeIndex = Math.min(Math.max(0, localSession.currentQuestionIndex || 0), totalQ - 1);
      setCurrentQuestionIndex(safeIndex);
    } else {
      const initialFallback: StaffPaperTestingSession = {
        sessionId: `sess_${paperId}_${staffId}`,
        paperId,
        paperName: paper?.title || paper?.examName || paperId,
        examId: paper?.examId || 'unknown',
        staffId,
        currentQuestionIndex: 0,
        testedQuestionIds: [],
        questionReviews: {},
        totalQuestions: totalQ,
        testedCount: 0,
        defectsCount: 0,
        status: 'NOT_STARTED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setSession(initialFallback);
      setCurrentQuestionIndex(0);
    }

    if (typeof window !== 'undefined' && !window.location.hash.includes(paperId)) {
      window.location.hash = `staff#paper-testing#${paperId}`;
    }

    if (notifyParent && onNavigateToPaperRef.current) {
      onNavigateToPaperRef.current(paperId);
    }

    try {
      const [activeSession, defects] = await Promise.all([
        staffService.getPaperTestingSession(paperId, staffId),
        staffService.getPaperDefects(paperId),
      ]);
      setSession(activeSession);
      setPaperDefects(defects);
      const updatedTotalQ = paper?.questions?.length || activeSession.totalQuestions || 1;
      const safeIndex = Math.min(Math.max(0, activeSession.currentQuestionIndex || 0), updatedTotalQ - 1);
      setCurrentQuestionIndex(safeIndex);
    } catch (err: any) {
      console.warn('[StaffPaperTestingCentre] Background session sync fallback:', err);
    } finally {
      setIsLoadingPaper(false);
      loadingPaperIdRef.current = null;
    }
  }, [user?.uid]);

  // Auto-open paper on mount or when initialPaperId / URL hash changes
  useEffect(() => {
    if (isClosedRef.current && !initialPaperId) {
      return;
    }
    let targetPaperId = initialPaperId;
    if (!targetPaperId && typeof window !== 'undefined') {
      const hash = window.location.hash;
      const match = hash.match(/paper[-_]testing[#/]([a-zA-Z0-9_-]+)/i) ||
                    hash.match(/[?&]paperId=([a-zA-Z0-9_-]+)/i);
      if (match && match[1]) {
        targetPaperId = match[1];
      }
    }
    if (
      targetPaperId &&
      session?.paperId !== targetPaperId &&
      loadingPaperIdRef.current !== targetPaperId &&
      !isClosedRef.current
    ) {
      openPaperTesting(targetPaperId, false);
    }
  }, [initialPaperId, session?.paperId, openPaperTesting]);

  const closePaperTesting = () => {
    isClosedRef.current = true;
    loadingPaperIdRef.current = null;
    setActivePaperId(null);
    setSession(null);
    setPaperDefects([]);
    setCurrentQuestionIndex(0);
    setIsReportingDefect(false);
    setDefectDescription('');
    setEvidenceReference('');
    setStaffNotes('');
    setSubmitError(null);
    if (typeof window !== 'undefined') {
      window.location.hash = 'staff#paper-testing';
    }
    if (onNavigateToPaperRef.current) {
      onNavigateToPaperRef.current(null);
    }
    if (onReturnToDashboard) {
      onReturnToDashboard();
    }
    loadSummaries();
  };

  // Active Paper Data
  const currentPaper: ExamPaper | undefined = useMemo(() => {
    if (!activePaperId) return undefined;
    return EXAM_PAPERS_MAP[activePaperId];
  }, [activePaperId]);

  const currentQuestion = useMemo(() => {
    if (!currentPaper || !currentPaper.questions || currentPaper.questions.length === 0) return null;
    const safeIdx = Math.min(Math.max(0, currentQuestionIndex), currentPaper.questions.length - 1);
    return currentPaper.questions[safeIdx] || null;
  }, [currentPaper, currentQuestionIndex]);

  // Defect for Current Question
  const currentQuestionDefects = useMemo(() => {
    if (!currentQuestion) return [];
    const qid = currentQuestion.id || `q_${currentQuestionIndex + 1}`;
    return paperDefects.filter((d) => d.questionId === qid || (currentQuestion.id && d.questionId === currentQuestion.id));
  }, [paperDefects, currentQuestion, currentQuestionIndex]);

  // Safe Navigation Guard: protects against duplicate saves and unsaved defect notes
  const canSafelyNavigate = useCallback(() => {
    if (isSavingRef.current || isSavingVerdict || isSubmittingDefect) {
      return false;
    }
    if (isReportingDefect && defectDescription.trim()) {
      const confirmLeave = window.confirm(
        'You have unsaved changes in the defect report form. Are you sure you want to navigate away and discard them?'
      );
      if (!confirmLeave) {
        return false;
      }
    }
    return true;
  }, [isSavingVerdict, isSubmittingDefect, isReportingDefect, defectDescription]);

  // Navigate to Previous Question
  const handleGoPrevious = useCallback(() => {
    if (currentQuestionIndex <= 0) return;
    if (!canSafelyNavigate()) return;

    setIsReportingDefect(false);
    setDefectDescription('');
    setEvidenceReference('');
    setStaffNotes('');
    setSubmitError(null);
    setCurrentQuestionIndex((prev) => Math.max(0, prev - 1));
  }, [currentQuestionIndex, canSafelyNavigate]);

  // Navigate to Next Question
  const handleGoNext = useCallback(() => {
    const totalQ = currentPaper?.questions?.length || 1;
    if (currentQuestionIndex >= totalQ - 1) return;
    if (!canSafelyNavigate()) return;

    setIsReportingDefect(false);
    setDefectDescription('');
    setEvidenceReference('');
    setStaffNotes('');
    setSubmitError(null);
    setCurrentQuestionIndex((prev) => Math.min(totalQ - 1, prev + 1));
  }, [currentPaper, currentQuestionIndex, canSafelyNavigate]);

  // Select Question from Palette
  const handleSelectQuestionIndex = useCallback((targetIndex: number) => {
    if (targetIndex === currentQuestionIndex) return;
    if (!canSafelyNavigate()) return;

    setIsReportingDefect(false);
    setDefectDescription('');
    setEvidenceReference('');
    setStaffNotes('');
    setSubmitError(null);
    setCurrentQuestionIndex(targetIndex);
  }, [currentQuestionIndex, canSafelyNavigate]);

  // Handle Question Review Verdict (Pass / Needs Review)
  const handleMarkVerdict = useCallback(async (verdict: StaffQuestionVerdict) => {
    if (isSavingRef.current || isSavingVerdict || isSubmittingDefect || !session || !currentQuestion || !user) return;

    isSavingRef.current = true;
    setIsSavingVerdict(true);
    setSubmitError(null);

    try {
      const qid = currentQuestion.id || `q_${currentQuestionIndex + 1}`;
      const reviews = { ...session.questionReviews };
      reviews[qid] = {
        verdict,
        reviewedBy: user.uid,
        reviewedAt: new Date().toISOString(),
      };

      const testedIds = Array.from(new Set([...session.testedQuestionIds, qid]));
      const totalQ = currentPaper?.questions.length || session.totalQuestions;
      const isFinished = testedIds.length >= totalQ;

      const updatedSession: StaffPaperTestingSession = {
        ...session,
        currentQuestionIndex,
        testedQuestionIds: testedIds,
        questionReviews: reviews,
        testedCount: testedIds.length,
        status: isFinished ? 'COMPLETED' : 'IN_PROGRESS',
      };

      const saved = await staffService.savePaperTestingProgress(updatedSession);
      if (!saved) {
        setSubmitError('Failed to persist session review progress. Please retry.');
        return;
      }
      setSession(updatedSession);

      // Auto-advance after verdict save if not on final question
      if (currentQuestionIndex < totalQ - 1) {
        setCurrentQuestionIndex((prev) => prev + 1);
        setIsReportingDefect(false);
        setDefectDescription('');
        setEvidenceReference('');
        setStaffNotes('');
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to persist session review progress. Please retry.');
    } finally {
      isSavingRef.current = false;
      setIsSavingVerdict(false);
    }
  }, [
    isSavingVerdict,
    isSubmittingDefect,
    session,
    currentQuestion,
    user,
    currentQuestionIndex,
    currentPaper,
  ]);

  // Handle Defect Submission (Auto-advance on success)
  const handleSubmitDefect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingRef.current || isSavingVerdict || isSubmittingDefect || !session || !currentQuestion || !user) return;

    if (!defectDescription.trim()) {
      setSubmitError('Please provide a description of the defect.');
      return;
    }

    isSavingRef.current = true;
    setIsSubmittingDefect(true);
    setSubmitError(null);

    try {
      const qid = currentQuestion.id || `q_${currentQuestionIndex + 1}`;
      const res = await staffService.reportQuestionDefect({
        paperId: session.paperId,
        questionId: qid,
        questionNumber: currentQuestion.questionNumber || currentQuestionIndex + 1,
        staffId: user.uid,
        staffEmail: user.email,
        defectCategory,
        defectDescription,
        evidenceReference,
        staffNotes,
        questionSnapshot: currentQuestion,
      });

      if (!res.success) {
        setSubmitError(res.error || 'Failed to record defect report.');
        return;
      }

      // Mark verdict as WRONG in current session
      const reviews = { ...session.questionReviews };
      reviews[qid] = {
        verdict: 'WRONG',
        notes: staffNotes,
        defectId: res.defect?.defectId,
        reviewedBy: user.uid,
        reviewedAt: new Date().toISOString(),
      };

      const testedIds = Array.from(new Set([...session.testedQuestionIds, qid]));
      const totalQ = currentPaper?.questions.length || session.totalQuestions;
      const updatedSession: StaffPaperTestingSession = {
        ...session,
        currentQuestionIndex,
        testedQuestionIds: testedIds,
        questionReviews: reviews,
        testedCount: testedIds.length,
        defectsCount: session.defectsCount + 1,
        status: 'HAS_DEFECTS',
      };

      const saved = await staffService.savePaperTestingProgress(updatedSession);
      if (!saved) {
        setSubmitError('Defect recorded but failed to persist session review progress.');
        return;
      }
      setSession(updatedSession);

      // Refresh paper defects list
      const updatedDefects = await staffService.getPaperDefects(session.paperId);
      setPaperDefects(updatedDefects);

      // Reset form
      setIsReportingDefect(false);
      setDefectDescription('');
      setEvidenceReference('');
      setStaffNotes('');

      // Auto-advance after defect save if not on final question
      if (currentQuestionIndex < totalQ - 1) {
        setCurrentQuestionIndex((prev) => prev + 1);
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Server error occurred while submitting defect.');
    } finally {
      isSavingRef.current = false;
      setIsSubmittingDefect(false);
    }
  };

  // Keyboard Shortcuts: Space (Pass), N (Needs Review), M (Report Defect), Left/Right Arrows (Navigation)
  useEffect(() => {
    if (!activePaperId || !currentPaper || !session) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Avoid conflicts with browser / OS shortcuts (Ctrl, Cmd, Alt)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      const key = e.key;
      const isSpace = key === ' ' || key === 'Space' || e.code === 'Space';
      const isN = key === 'n' || key === 'N';
      const isM = key === 'm' || key === 'M';
      const isArrowLeft = key === 'ArrowLeft';
      const isArrowRight = key === 'ArrowRight';

      if (!isSpace && !isN && !isM && !isArrowLeft && !isArrowRight) {
        return;
      }

      // 2. Prevent repeated keydown events from holding down keys
      if (e.repeat) {
        return;
      }

      // 3. Ignore when typing or interacting with inputs, textareas, selects, or editable elements
      const activeEl = document.activeElement;
      if (activeEl) {
        const tagName = activeEl.tagName.toUpperCase();
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
          return;
        }
        if ((activeEl as HTMLElement).isContentEditable) {
          return;
        }
        if (
          activeEl.closest('dialog') ||
          activeEl.closest('[role="dialog"]') ||
          activeEl.closest('form')
        ) {
          return;
        }
      }

      // If any modal dialog is open in the DOM
      if (document.querySelector('dialog[open], [role="dialog"]')) {
        return;
      }

      // If defect reporting panel is open, do not intercept keys
      if (isReportingDefect) {
        return;
      }

      // 4. Prevent actions while saving or submitting
      if (isSavingRef.current || isSavingVerdict || isSubmittingDefect) {
        return;
      }

      // 5. Normal button keyboard behaviour: if focus is on a button, allow Space to activate it
      if (isSpace && activeEl && activeEl.tagName === 'BUTTON' && !activeEl.getAttribute('data-pass-btn')) {
        return;
      }

      const totalQ = currentPaper.questions?.length || 1;

      if (isSpace) {
        // Prevent default browser scroll on Space
        e.preventDefault();
        handleMarkVerdict('PASS');
      } else if (isN) {
        e.preventDefault();
        handleMarkVerdict('NEEDS_REVIEW');
      } else if (isM) {
        e.preventDefault();
        setIsReportingDefect(true);
      } else if (isArrowLeft) {
        if (currentQuestionIndex > 0) {
          e.preventDefault();
          handleGoPrevious();
        }
      } else if (isArrowRight) {
        if (currentQuestionIndex < totalQ - 1) {
          e.preventDefault();
          handleGoNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    activePaperId,
    currentPaper,
    session,
    currentQuestionIndex,
    isReportingDefect,
    isSavingVerdict,
    isSubmittingDefect,
    handleMarkVerdict,
    handleGoPrevious,
    handleGoNext,
  ]);

  // Filtered Summaries for Dashboard
  const filteredSummaries = useMemo(() => {
    return summaries.filter((s) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = s.paperName.toLowerCase().includes(q);
        const matchesExam = s.examName.toLowerCase().includes(q) || s.examId.toLowerCase().includes(q);
        if (!matchesName && !matchesExam) return false;
      }
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (examFilter !== 'ALL' && s.examId !== examFilter) return false;
      return true;
    });
  }, [summaries, searchQuery, statusFilter, examFilter]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalPapers = summaries.length;
    const completedPapers = summaries.filter((s) => s.status === 'COMPLETED').length;
    const inProgressPapers = summaries.filter((s) => s.status === 'IN_PROGRESS' || s.status === 'HAS_DEFECTS').length;
    const totalDefects = summaries.reduce((acc, s) => acc + s.reportedDefects, 0);
    const unresolvedDefects = summaries.reduce((acc, s) => acc + s.unresolvedDefects, 0);
    return { totalPapers, completedPapers, inProgressPapers, totalDefects, unresolvedDefects };
  }, [summaries]);

  // ── VIEW 1: ACTIVE QUESTION REVIEW INTERFACE ──────────────────────────────
  if (activePaperId && currentPaper && session) {
    const totalQ = currentPaper.questions.length;
    const progressPercent = Math.round((session.testedCount / totalQ) * 100);
    const currentQId = currentQuestion ? (currentQuestion.id || `q_${currentQuestionIndex + 1}`) : '';
    const currentVerdict = currentQId ? session.questionReviews[currentQId]?.verdict : undefined;

    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={closePaperTesting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 hover:bg-surface-elev3 text-surface-text dark:text-darkSurface-text text-xs font-semibold transition-all"
              aria-label="Back to Paper Testing Centre"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Paper Testing Centre</span>
            </button>
            <div>
              <h2 className="text-base font-bold text-surface-text dark:text-darkSurface-text flex items-center gap-2">
                <span>{currentPaper.title || currentPaper.examName}</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-brand-primary/10 text-brand-primary font-mono uppercase">
                  {currentPaper.examId}
                </span>
              </h2>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                {`Question ${currentQuestionIndex + 1} of ${totalQ} · ${session.testedCount} Tested · ${session.defectsCount} Defects`}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="flex-1 bg-surface-elev2 dark:bg-darkSurface-elev2 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-brand-primary h-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs font-mono font-bold text-surface-muted dark:text-darkSurface-muted">
              {progressPercent}%
            </span>
          </div>
        </div>

        {/* Paper Testing Completion Banner */}
        {session.testedCount >= totalQ && (
          <div
            data-testid="paper-audit-completed-banner"
            className="p-5 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                  Paper Verification Completed
                </h4>
                <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                  All {totalQ} questions in this paper have been reviewed. {session.defectsCount} defect(s) logged.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closePaperTesting}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm shrink-0"
            >
              Return to Dashboard
            </button>
          </div>
        )}

        {/* Question Palette Strip */}
        <div className="p-4 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
          <div className="flex items-center justify-between mb-3 text-xs font-semibold text-surface-muted">
            <span>QUESTION PALETTE</span>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Pass</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Review</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Defect</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-surface-border dark:bg-darkSurface-border inline-block" /> Untested</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
            {currentPaper.questions.map((q, idx) => {
              const rev = session.questionReviews[q.id || `q_${idx + 1}`];
              const isCurrent = idx === currentQuestionIndex;
              let bg = 'bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text border-surface-border dark:border-darkSurface-border';

              if (rev?.verdict === 'PASS') {
                bg = 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 font-bold';
              } else if (rev?.verdict === 'NEEDS_REVIEW') {
                bg = 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400 font-bold';
              } else if (rev?.verdict === 'WRONG') {
                bg = 'bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-400 font-bold';
              }

              return (
                <button
                  key={q.id || idx}
                  type="button"
                  onClick={() => handleSelectQuestionIndex(idx)}
                  className={`w-8 h-8 rounded-lg text-xs font-mono transition-all border ${bg} ${
                    isCurrent ? 'ring-2 ring-brand-primary ring-offset-2 dark:ring-offset-darkSurface-elev1 scale-105 z-10' : 'hover:brightness-95'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Question Review & Defect Interface */}
        {currentQuestion && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Question Details Column (7 cols) */}
            <div className="lg:col-span-7 space-y-5 p-6 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
              {/* Question Metadata */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-surface-border dark:border-darkSurface-border text-xs">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-surface-elev2 dark:bg-darkSurface-elev2 font-mono font-bold text-surface-text dark:text-darkSurface-text">
                    Q.{currentQuestion.questionNumber || currentQuestionIndex + 1}
                  </span>
                  <span className="text-surface-muted dark:text-darkSurface-muted font-medium">
                    {currentQuestion.sectionName || 'Default Section'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-surface-muted dark:text-darkSurface-muted bg-surface-elev2 dark:bg-darkSurface-elev2 px-2 py-0.5 rounded">
                    ID: {currentQuestion.id}
                  </span>
                  {currentVerdict && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        currentVerdict === 'PASS'
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          : currentVerdict === 'NEEDS_REVIEW'
                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                          : 'bg-red-500/20 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {currentVerdict}
                    </span>
                  )}
                </div>
              </div>

              {/* Question Stem */}
              <div className="text-sm font-medium text-surface-text dark:text-darkSurface-text leading-relaxed">
                <StructuredContentRenderer
                  blocks={currentQuestion.contentBlocks}
                  fallbackText={currentQuestion.questionText || ''}
                  questionNumber={currentQuestionIndex + 1}
                />
              </div>

              {/* Diagram / Image Assets (deduplicated against contentBlocks) */}
              {(() => {
                const contentBlockAssetUrls = new Set(
                  (currentQuestion.contentBlocks || [])
                    .filter((b) => b.type === 'image' && b.assetUrl)
                    .map((b) => b.assetUrl)
                );
                const unrenderedDiagramUrls = (
                  currentQuestion.diagramUrls && currentQuestion.diagramUrls.length > 0
                    ? currentQuestion.diagramUrls
                    : currentQuestion.diagramUrl
                    ? [currentQuestion.diagramUrl]
                    : []
                ).filter((url): url is string => Boolean(url && !contentBlockAssetUrls.has(url)));

                if (unrenderedDiagramUrls.length === 0) return null;

                return unrenderedDiagramUrls.map((url, dIdx) => (
                  <div key={dIdx} className="p-3 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border flex justify-center">
                    <img
                      src={url}
                      alt={`Diagram for Q${currentQuestionIndex + 1}`}
                      className="max-h-72 object-contain rounded-lg shadow-sm"
                    />
                  </div>
                ));
              })()}

              {/* Options */}
              <div className="space-y-2.5 pt-2">
                <p className="text-xs font-bold uppercase tracking-wider text-surface-muted">Answer Options</p>
                <div className="grid grid-cols-1 gap-2">
                  {(currentQuestion.options || []).map((opt, oIdx) => {
                    const optKey = String.fromCharCode(65 + oIdx);
                    const isKey = currentQuestion.correctAnswer === optKey || currentQuestion.correctAnswerIndex === oIdx;
                    const optImg = currentQuestion.optionImages?.[oIdx] || currentQuestion.richOptions?.[oIdx]?.imageUrl;

                    return (
                      <div
                        key={oIdx}
                        className={`p-3 rounded-xl border flex items-start gap-3 transition-all ${
                          isKey
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-surface-text dark:text-darkSurface-text'
                            : 'bg-surface-elev1 dark:bg-darkSurface-elev2 border-surface-border dark:border-darkSurface-border'
                        }`}
                      >
                        <span
                          className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold font-mono shrink-0 ${
                            isKey
                              ? 'bg-emerald-500 text-white shadow-sm'
                              : 'bg-surface-elev3 dark:bg-darkSurface-elev3 text-surface-muted'
                          }`}
                        >
                          {optKey}
                        </span>
                        <div className="flex-1 text-sm pt-0.5">
                          {opt ? (
                            <LatexRenderer content={opt} />
                          ) : optImg ? null : (
                            <span className="text-xs text-amber-600 dark:text-amber-400 italic">Option content missing</span>
                          )}
                          {optImg && (
                            <img
                              src={optImg}
                              alt={`Option ${optKey}`}
                              className="mt-2 max-h-24 object-contain rounded border border-surface-border dark:border-darkSurface-border"
                            />
                          )}
                        </div>
                        {isKey && (
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full shrink-0">
                            Key ✓
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Official Key & Explanation */}
              <div className="p-4 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-surface-text dark:text-darkSurface-text font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>
                    {currentQuestion.isMta
                      ? 'Official Answer Key: Marks To All (MTA)'
                      : currentQuestion.answerRange
                      ? `Official Answer Key: Range [${currentQuestion.answerRange.min}, ${currentQuestion.answerRange.max}]`
                      : currentQuestion.correctAnswer
                      ? `Official Answer Key: Option ${currentQuestion.correctAnswer}`
                      : (currentQuestion.correctAnswerIndex ?? -1) >= 0
                      ? `Official Answer Key: Option ${String.fromCharCode(65 + currentQuestion.correctAnswerIndex)}`
                      : 'Official Answer Key: Not Specified'}
                  </span>
                </div>
                {currentQuestion.explanation && (
                  <p className="text-surface-muted dark:text-darkSurface-muted leading-relaxed">
                    <strong className="text-surface-text dark:text-darkSurface-text">Explanation: </strong>
                    {currentQuestion.explanation}
                  </p>
                )}
              </div>
            </div>

            {/* Verdict & Defect Actions Column (5 cols) */}
            <div className="lg:col-span-5 space-y-5">
              {/* Review Actions Card */}
              <div className="p-6 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-surface-text dark:text-darkSurface-text flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-brand-primary" />
                    <span>Question Verification Verdict</span>
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="header-prev-btn"
                      disabled={currentQuestionIndex <= 0 || isSavingVerdict || isSubmittingDefect}
                      onClick={handleGoPrevious}
                      aria-label="Previous Question"
                      title="Previous Question (Left Arrow)"
                      className="p-1.5 rounded-lg border border-surface-border dark:border-darkSurface-border bg-surface-elev1 dark:bg-darkSurface-elev2 hover:bg-surface-elev2 disabled:opacity-40 disabled:cursor-not-allowed text-surface-text dark:text-darkSurface-text transition-all"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      data-testid="header-next-btn"
                      disabled={currentQuestionIndex >= totalQ - 1 || isSavingVerdict || isSubmittingDefect}
                      onClick={handleGoNext}
                      aria-label="Next Question"
                      title="Next Question (Right Arrow)"
                      className="p-1.5 rounded-lg border border-surface-border dark:border-darkSurface-border bg-surface-elev1 dark:bg-darkSurface-elev2 hover:bg-surface-elev2 disabled:opacity-40 disabled:cursor-not-allowed text-surface-text dark:text-darkSurface-text transition-all"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    data-pass-btn="true"
                    disabled={isSavingVerdict || isSubmittingDefect}
                    onClick={() => handleMarkVerdict('PASS')}
                    title="Mark Pass (Space)"
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      currentVerdict === 'PASS'
                        ? 'bg-emerald-500 text-white border-emerald-600 shadow-md scale-102'
                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    <span>Pass</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSavingVerdict || isSubmittingDefect}
                    onClick={() => handleMarkVerdict('NEEDS_REVIEW')}
                    title="Mark Needs Review (N)"
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      currentVerdict === 'NEEDS_REVIEW'
                        ? 'bg-amber-500 text-white border-amber-600 shadow-md scale-102'
                        : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>Needs Review</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSavingVerdict || isSubmittingDefect}
                    onClick={() => setIsReportingDefect(true)}
                    title="Report Defect (M)"
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      currentVerdict === 'WRONG' || currentQuestionDefects.length > 0
                        ? 'bg-red-500 text-white border-red-600 shadow-md scale-102'
                        : 'bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-700 dark:text-red-400'
                    }`}
                  >
                    <Bug className="w-4 h-4" />
                    <span>Report Defect</span>
                  </button>
                </div>

                {/* Direct Question Navigation within Review Card */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-surface-border dark:border-darkSurface-border">
                  <button
                    type="button"
                    data-testid="review-prev-btn"
                    disabled={currentQuestionIndex <= 0 || isSavingVerdict || isSubmittingDefect}
                    onClick={handleGoPrevious}
                    title="Previous Question (←)"
                    className="flex-1 py-2 px-3 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev1 dark:bg-darkSurface-elev2 hover:bg-surface-elev2 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-surface-text dark:text-darkSurface-text flex items-center justify-center gap-1.5 transition-all shadow-sm"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous Question</span>
                  </button>

                  <button
                    type="button"
                    data-testid="review-next-btn"
                    disabled={currentQuestionIndex >= totalQ - 1 || isSavingVerdict || isSubmittingDefect}
                    onClick={handleGoNext}
                    title="Next Question (→)"
                    className="flex-1 py-2 px-3 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev1 dark:bg-darkSurface-elev2 hover:bg-surface-elev2 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-surface-text dark:text-darkSurface-text flex items-center justify-center gap-1.5 transition-all shadow-sm"
                  >
                    <span>Next Question</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Keyboard Shortcuts Hint */}
                <div
                  data-testid="keyboard-shortcuts-hint"
                  className="pt-2 text-[11px] font-mono text-surface-muted dark:text-darkSurface-muted text-center space-y-0.5 border-t border-surface-border/50 dark:border-darkSurface-border/50 select-none"
                >
                  <div>Space = Pass | N = Needs Review | M = Report Defect</div>
                  <div>← Previous | → Next</div>
                </div>

                {submitError && !isReportingDefect && (
                  <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-600 dark:text-red-400">
                    {submitError}
                  </div>
                )}

                {/* Defect Logging Panel */}
                {isReportingDefect && (
                  <form onSubmit={handleSubmitDefect} className="pt-4 border-t border-surface-border dark:border-darkSurface-border space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1.5">
                        <Bug className="w-3.5 h-3.5" />
                        <span>Log Question Defect</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsReportingDefect(false)}
                        className="text-xs text-surface-muted hover:text-surface-text"
                      >
                        Cancel
                      </button>
                    </div>

                    {submitError && (
                      <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-600 dark:text-red-400">
                        {submitError}
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-bold text-surface-muted mb-1">
                        Defect Category *
                      </label>
                      <select
                        value={defectCategory}
                        onChange={(e) => setDefectCategory(e.target.value as StaffDefectCategory)}
                        className="w-full text-xs p-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-1 focus:ring-brand-primary"
                      >
                        {Object.entries(STAFF_DEFECT_CATEGORY_LABELS).map(([cat, label]) => (
                          <option key={cat} value={cat}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-surface-muted mb-1">
                        Defect Description *
                      </label>
                      <textarea
                        rows={3}
                        value={defectDescription}
                        onChange={(e) => setDefectDescription(e.target.value)}
                        placeholder="Detail the exact defect (e.g. Option A is missing, symbol @ should be theta...)"
                        className="w-full text-xs p-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-1 focus:ring-brand-primary"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-surface-muted mb-1">
                        Evidence / Source Reference
                      </label>
                      <input
                        type="text"
                        value={evidenceReference}
                        onChange={(e) => setEvidenceReference(e.target.value)}
                        placeholder="e.g. Candidate Sheet Page 14, Q.2 Official Green Tick"
                        className="w-full text-xs p-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-1 focus:ring-brand-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-surface-muted mb-1">
                        Staff Internal Notes
                      </label>
                      <input
                        type="text"
                        value={staffNotes}
                        onChange={(e) => setStaffNotes(e.target.value)}
                        placeholder="Private notes for review / repair queue"
                        className="w-full text-xs p-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-1 focus:ring-brand-primary"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingDefect}
                      className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      {isSubmittingDefect ? 'Submitting...' : 'Submit Defect Report'}
                    </button>
                  </form>
                )}
              </div>

              {/* Existing Logged Defects on this Question */}
              {currentQuestionDefects.length > 0 && (
                <div className="p-5 rounded-3xl bg-red-500/10 border border-red-500/25 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5">
                      <Bug className="w-3.5 h-3.5" />
                      <span>{currentQuestionDefects.length} Active Defect(s) Logged</span>
                    </span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-700 dark:text-red-300">
                      Stage 1 Recorded
                    </span>
                  </div>

                  {currentQuestionDefects.map((def) => (
                    <div
                      key={def.defectId}
                      className="p-3 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-red-500/20 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-surface-text dark:text-darkSurface-text">
                          {STAFF_DEFECT_CATEGORY_LABELS[def.defectCategory] || def.defectCategory}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                              def.storageBackend === 'remote_db'
                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                                : 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {def.storageBackend === 'remote_db' ? 'Shared DB' : 'Local Draft (Pending Sync)'}
                          </span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted">
                            {def.status}
                          </span>
                        </div>
                      </div>
                      <p className="text-surface-muted dark:text-darkSurface-muted">{def.defectDescription}</p>
                      {def.evidenceReference && (
                        <p className="text-[11px] text-surface-muted">
                          <strong>Evidence:</strong> {def.evidenceReference}
                        </p>
                      )}
                      <div className="pt-1 text-[10px] font-mono text-surface-muted flex items-center justify-between">
                        <span>ID: {def.defectId}</span>
                        <span>{new Date(def.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom Pagination Buttons */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
          <button
            type="button"
            data-testid="bottom-prev-btn"
            disabled={currentQuestionIndex <= 0 || isSavingVerdict || isSubmittingDefect}
            onClick={handleGoPrevious}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 hover:bg-surface-elev3 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-surface-text dark:text-darkSurface-text transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Previous Question</span>
          </button>

          <span className="text-xs font-mono font-semibold text-surface-muted">
            {`Question ${currentQuestionIndex + 1} / ${totalQ}`}
          </span>

          <button
            type="button"
            data-testid="bottom-next-btn"
            disabled={currentQuestionIndex >= totalQ - 1 || isSavingVerdict || isSubmittingDefect}
            onClick={handleGoNext}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 hover:bg-surface-elev3 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-surface-text dark:text-darkSurface-text transition-all"
          >
            <span>Next Question</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── VIEW 2: PAPER TESTING DASHBOARD ───────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border">
          <p className="text-xs text-surface-muted font-bold uppercase tracking-wider">Total Papers</p>
          <p className="text-2xl font-black font-mono text-surface-text dark:text-darkSurface-text mt-1">{metrics.totalPapers}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border">
          <p className="text-xs text-surface-muted font-bold uppercase tracking-wider">Completed</p>
          <p className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1">{metrics.completedPapers}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border">
          <p className="text-xs text-surface-muted font-bold uppercase tracking-wider">In Progress</p>
          <p className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400 mt-1">{metrics.inProgressPapers}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border">
          <p className="text-xs text-surface-muted font-bold uppercase tracking-wider">Total Defects</p>
          <p className="text-2xl font-black font-mono text-red-600 dark:text-red-400 mt-1">{metrics.totalDefects}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border col-span-2 sm:col-span-1">
          <p className="text-xs text-surface-muted font-bold uppercase tracking-wider">Unresolved</p>
          <p className="text-2xl font-black font-mono text-red-600 dark:text-red-400 mt-1">{metrics.unresolvedDefects}</p>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-surface-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search papers by name, shift, year..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Exam Filter */}
          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border text-surface-text dark:text-darkSurface-text focus:outline-none"
          >
            <option value="ALL">All Exams</option>
            {COMPETITIVE_EXAMS_CATALOG.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border text-surface-text dark:text-darkSurface-text focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="NOT_STARTED">Not Started</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="HAS_DEFECTS">Has Defects</option>
            <option value="COMPLETED">Completed</option>
          </select>

          <button
            type="button"
            onClick={loadSummaries}
            className="p-2 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted hover:text-surface-text transition-all"
            title="Refresh Papers"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Papers Grid */}
      {isLoadingSummaries ? (
        <div className="p-12 text-center text-xs text-surface-muted animate-pulse">
          Loading paper testing registry...
        </div>
      ) : filteredSummaries.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border space-y-2">
          <FileText className="w-8 h-8 text-surface-muted mx-auto" />
          <p className="text-sm font-bold text-surface-text dark:text-darkSurface-text">No papers matching criteria</p>
          <p className="text-xs text-surface-muted">Try clearing the search or status filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSummaries.map((summary) => {
            const percent = summary.totalQuestions > 0 ? Math.round((summary.testedQuestions / summary.totalQuestions) * 100) : 0;
            const hasUnresolved = summary.unresolvedDefects > 0;

            let badgeColor = 'bg-surface-elev2 text-surface-muted border-surface-border';
            if (summary.status === 'COMPLETED') {
              badgeColor = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
            } else if (hasUnresolved || summary.status === 'HAS_DEFECTS') {
              badgeColor = 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30';
            } else if (summary.status === 'IN_PROGRESS') {
              badgeColor = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
            }

            return (
              <div
                key={summary.paperId}
                className="p-5 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-brand-primary/10 text-brand-primary">
                      {summary.examName}
                    </span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${badgeColor}`}>
                      {summary.status.replace('_', ' ')}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-surface-text dark:text-darkSurface-text line-clamp-2">
                    {summary.paperName}
                  </h3>
                  <p className="text-[11px] font-mono text-surface-muted">
                    {summary.totalQuestions} Questions total
                  </p>
                </div>

                <div className="space-y-3 pt-2 border-t border-surface-border dark:border-darkSurface-border">
                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-surface-muted">Testing Progress</span>
                      <span className="font-mono font-bold text-surface-text dark:text-darkSurface-text">
                        {summary.testedQuestions} / {summary.totalQuestions} ({percent}%)
                      </span>
                    </div>
                    <div className="w-full bg-surface-elev2 dark:bg-darkSurface-elev2 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          hasUnresolved ? 'bg-red-500' : percent === 100 ? 'bg-emerald-500' : 'bg-brand-primary'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  {/* Defects Tag */}
                  {summary.reportedDefects > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
                      <Bug className="w-3.5 h-3.5" />
                      <span>{summary.reportedDefects} Defect(s) ({summary.unresolvedDefects} unresolved)</span>
                    </div>
                  )}

                  {/* Action Button */}
                  <button
                    type="button"
                    disabled={isLoadingPaper && loadingPaperIdRef.current === summary.paperId}
                    onClick={() => openPaperTesting(summary.paperId, true)}
                    className="w-full py-2.5 rounded-xl bg-brand-primary hover:bg-brand-variant disabled:opacity-75 disabled:cursor-wait text-white font-bold text-xs shadow-sm hover:shadow transition-all flex items-center justify-center gap-1.5"
                  >
                    {isLoadingPaper && loadingPaperIdRef.current === summary.paperId ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Opening Paper...</span>
                      </>
                    ) : (
                      <>
                        <span>{summary.testedQuestions > 0 ? 'Resume Testing' : 'Start Testing'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
