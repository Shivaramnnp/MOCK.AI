import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {

  Clock,
  ChevronLeft,
  ChevronRight,
  Send,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Bookmark,
  Eraser,
  HelpCircle,
  Maximize2,
  Minimize2,
  ShieldAlert,
  ZoomIn,
  X,
  LayoutGrid,
} from 'lucide-react';
import {
  ExamPaper,
  ExamTestSession,
  QuestionAttemptStatus,
  CompetitiveQuestion,
} from '../types';
import { ExamService } from '../services/examService';
import { ExamSessionService } from '../services/examSessionService';
import { LatexRenderer } from '../components/LatexRenderer';
import { resolveAssetUrl } from '../lib/supabaseContent';
import { ExamAsset } from '../components/ExamAsset';

interface CompetitiveExamPlayerScreenProps {
  paper: ExamPaper;
  initialSession?: ExamTestSession | null;
  userId?: string;
  onExit: () => void;
  onSubmit: (completedSession: ExamTestSession) => void;
}

export const CompetitiveExamPlayerScreen: React.FC<CompetitiveExamPlayerScreenProps> = ({
  paper,
  initialSession,
  userId = 'guest',
  onExit,
  onSubmit,
}) => {
  // Load existing session or create fresh
  const [session, setSession] = useState<ExamTestSession>(() => {
    if (initialSession && initialSession.paperId === paper.id) {
      return initialSession;
    }
    const existing = ExamSessionService.getActiveSession(paper.id, userId);
    if (existing) return existing;
    return ExamSessionService.createSession(paper, userId);
  });

  const [currentIndex, setCurrentIndex] = useState<number>(session.currentQuestionIndex || 0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>(session.userAnswers || {});
  const [userMsqAnswers, setUserMsqAnswers] = useState<Record<number, number[]>>(
    session.userMsqAnswers || {}
  );
  const [userNatAnswers, setUserNatAnswers] = useState<Record<number, string>>(
    session.userNatAnswers || {}
  );
  const [descriptiveAnswers, setDescriptiveAnswers] = useState<Record<number, string>>(
    session.userDescriptiveAnswers || {}
  );
  const [statuses, setStatuses] = useState<Record<number, QuestionAttemptStatus>>(
    session.questionStatuses || {}
  );
  const [timeRemaining, setTimeRemaining] = useState<number>(() => {
    const remaining = ExamSessionService.calculateRemainingSeconds(session);
    return Number.isFinite(remaining) ? remaining : (session.durationSeconds || 3600);
  });
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(session.elapsedSeconds);
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [isSavingExit, setIsSavingExit] = useState<boolean>(false);
  const [saveExitError, setSaveExitError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error' | 'idle'>('idle');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [isMobilePaletteOpen, setIsMobilePaletteOpen] = useState<boolean>(false);

  // SEC-003: Sanitize questions in memory to withhold answer keys, options, and explanations during the active test session
  const sanitizedQuestions = useMemo(() => {
    return paper.questions.map((q) => {
      const {
        correctAnswer: _ca,
        correctAnswerIndex: _cai,
        correctAnswerSet: _cas,
        correctAnswerSets: _cass,
        correctAnswerIndices: _cais,
        answerRange: _ar,
        answerRanges: _ars,
        explanation: _exp,
        modelSolution: _ms,
        ...safeQ
      } = q;
      return {
        ...safeQ,
        rubrics: paper.paperType === 'DESCRIPTIVE' ? q.rubrics : undefined,
      };
    });
  }, [paper.questions, paper.paperType]);

  const questions = sanitizedQuestions;
  const currentQuestion = questions[currentIndex] || questions[0];

  // ENG-001: Intercept browser back navigation to prevent accidental loss of test progress
  useEffect(() => {
    window.history.pushState({ mockaiExam: true }, '', window.location.href);

    const handlePopState = () => {
      window.history.pushState({ mockaiExam: true }, '', window.location.href);
      setShowExitConfirm(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Subscribe to autosave status
  useEffect(() => {
    return ExamSessionService.subscribeToAutosaveStatus((status) => {
      setSaveStatus(status);
    });
  }, []);

  // Flush on unload to prevent data loss on sudden browser close
  useEffect(() => {
    const handleBeforeUnload = () => {
      const currentSessionState: ExamTestSession = {
        ...session,
        currentQuestionIndex: currentIndex,
        userAnswers,
        userMsqAnswers,
        userNatAnswers,
        userDescriptiveAnswers: descriptiveAnswers,
        questionStatuses: statuses,
        timeRemainingSeconds: timeRemaining,
        elapsedSeconds,
      };
      ExamSessionService.saveSessionLocal(currentSessionState);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [session, currentIndex, userAnswers, userMsqAnswers, userNatAnswers, descriptiveAnswers, statuses, timeRemaining, elapsedSeconds]);

  // Current section determination
  const currentSection = useMemo(() => {
    return (
      paper.sections.find(
        (sec) => currentIndex >= sec.startIndex && currentIndex <= sec.endIndex
      ) || paper.sections[0]
    );
  }, [paper.sections, currentIndex]);

  // Auto-sync session state to storage
  const syncToStorage = useCallback(
    (overrides?: Partial<ExamTestSession>) => {
      setSession((prev) => {
        const updated: ExamTestSession = {
          ...prev,
          currentQuestionIndex: currentIndex,
          currentSectionId: currentSection?.id || prev.currentSectionId,
          userAnswers,
          userMsqAnswers,
          userNatAnswers,
          userDescriptiveAnswers: descriptiveAnswers,
          questionStatuses: statuses,
          timeRemainingSeconds: timeRemaining,
          elapsedSeconds,
          ...overrides,
        };
        ExamSessionService.saveSessionLocal(updated);
        ExamSessionService.queueAutosave(updated);
        return updated;
      });
    },
    [currentIndex, currentSection, userAnswers, userMsqAnswers, userNatAnswers, descriptiveAnswers, statuses, timeRemaining, elapsedSeconds]
  );

  // Timer countdown with authoritative wall-clock calculation
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = ExamSessionService.calculateRemainingSeconds(session);
      const safeRemaining = Number.isFinite(remaining) ? remaining : 0;
      setTimeRemaining(safeRemaining);
      setElapsedSeconds((prev) => prev + 1);

      if (safeRemaining <= 0) {
        clearInterval(timer);
        handleFinalSubmit();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [session]);

  // Periodic save checkpoint every 5 seconds
  useEffect(() => {
    const syncInterval = setInterval(() => {
      syncToStorage();
    }, 5000);
    return () => clearInterval(syncInterval);
  }, [syncToStorage]);

  // Format timer HH:MM:SS
  const formatTime = (totalSecs: number) => {
    if (!Number.isFinite(totalSecs) || totalSecs < 0) {
      return '00:00';
    }
    const safeSecs = Math.floor(totalSecs);
    const hours = Math.floor(safeSecs / 3600);
    const minutes = Math.floor((safeSecs % 3600) / 60);
    const seconds = safeSecs % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Question navigation handler
  const jumpToQuestion = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    setStatuses((prev) => {
      const next = { ...prev };
      // If previous was NOT_VISITED, mark as NOT_ANSWERED
      if (next[targetIndex] === 'NOT_VISITED') {
        next[targetIndex] = 'NOT_ANSWERED';
      }
      return next;
    });

    setCurrentIndex(targetIndex);
    syncToStorage({ currentQuestionIndex: targetIndex });
  };

  // Select option (MCQ)
  const handleSelectOption = (optionIndex: number) => {
    setUserAnswers((prev) => {
      const next = { ...prev, [currentIndex]: optionIndex };
      return next;
    });
  };

  // Toggle MSQ option
  const handleToggleMsqOption = (optionIndex: number) => {
    setUserMsqAnswers((prev) => {
      const current = prev[currentIndex] || [];
      const exists = current.includes(optionIndex);
      const next = exists ? current.filter((i) => i !== optionIndex) : [...current, optionIndex].sort();
      return { ...prev, [currentIndex]: next };
    });
  };

  // NAT input change
  const handleNatChange = (value: string) => {
    setUserNatAnswers((prev) => ({
      ...prev,
      [currentIndex]: value,
    }));
  };

  // Check if current question has an answer
  const checkHasAnswer = (idx: number) => {
    const q = questions[idx];
    if (!q) return false;
    if (paper.paperType === 'DESCRIPTIVE') {
      return (descriptiveAnswers[idx] || '').trim().length > 0;
    }
    if (q.questionType === 'MSQ') {
      return (userMsqAnswers[idx] || []).length > 0;
    }
    if (q.questionType === 'NAT') {
      return (userNatAnswers[idx] || '').trim().length > 0;
    }
    return userAnswers[idx] !== undefined && userAnswers[idx] !== null;
  };

  // Clear response
  const handleClearResponse = () => {
    setUserAnswers((prev) => {
      const next = { ...prev };
      delete next[currentIndex];
      return next;
    });
    setUserMsqAnswers((prev) => {
      const next = { ...prev };
      delete next[currentIndex];
      return next;
    });
    setUserNatAnswers((prev) => {
      const next = { ...prev };
      delete next[currentIndex];
      return next;
    });

    setStatuses((prev) => ({
      ...prev,
      [currentIndex]: 'NOT_ANSWERED',
    }));
  };

  // Save & Next
  const handleSaveAndNext = () => {
    const hasAnswer = checkHasAnswer(currentIndex);

    setStatuses((prev) => ({
      ...prev,
      [currentIndex]: hasAnswer ? 'ANSWERED' : 'NOT_ANSWERED',
    }));

    if (currentIndex < questions.length - 1) {
      jumpToQuestion(currentIndex + 1);
    }
  };

  // Mark for Review & Next
  const handleMarkForReviewAndNext = () => {
    const hasAnswer = checkHasAnswer(currentIndex);

    setStatuses((prev) => ({
      ...prev,
      [currentIndex]: hasAnswer
        ? 'ANSWERED_AND_MARKED_FOR_REVIEW'
        : 'MARKED_FOR_REVIEW',
    }));

    if (currentIndex < questions.length - 1) {
      jumpToQuestion(currentIndex + 1);
    }
  };

  // A11Y-001: Standard CBT Keyboard Navigation (1-4 / A-D for options, Enter for Save & Next, Esc for modal dismiss)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Escape key dismisses open overlays
      if (e.key === 'Escape') {
        if (zoomImageUrl) {
          setZoomImageUrl(null);
          return;
        }
        if (showSubmitModal) {
          setShowSubmitModal(false);
          return;
        }
        if (showExitConfirm) {
          setShowExitConfirm(false);
          return;
        }
        if (isMobilePaletteOpen) {
          setIsMobilePaletteOpen(false);
          return;
        }
      }

      // Do NOT intercept keys when user is typing inside an input or textarea
      const target = document.activeElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // Do NOT intercept if modifier keys are active
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // 2. Option Selection: 1-4 or A-D
      const key = e.key.toUpperCase();
      const optionMap: Record<string, number> = {
        '1': 0, 'A': 0,
        '2': 1, 'B': 1,
        '3': 2, 'C': 2,
        '4': 3, 'D': 3,
      };

      if (optionMap[key] !== undefined) {
        const optIdx = optionMap[key];
        if (currentQuestion?.options && optIdx < currentQuestion.options.length) {
          if (currentQuestion.questionType === 'MSQ') {
            handleToggleMsqOption(optIdx);
          } else if (currentQuestion.questionType !== 'NAT' && paper.paperType !== 'DESCRIPTIVE') {
            handleSelectOption(optIdx);
          }
        }
        return;
      }

      // 3. Enter key: Save & Next
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveAndNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    zoomImageUrl,
    showSubmitModal,
    showExitConfirm,
    isMobilePaletteOpen,
    currentQuestion,
    handleToggleMsqOption,
    handleSelectOption,
    handleSaveAndNext,
    paper.paperType,
  ]);

  // Section switcher
  const handleSelectSection = (sectionId: string) => {
    const targetSection = paper.sections.find((s) => s.id === sectionId);
    if (targetSection) {
      jumpToQuestion(targetSection.startIndex);
    }
  };

  // Final Submission
  const handleFinalSubmit = useCallback(() => {
    const currentSessionState: ExamTestSession = {
      ...session,
      currentQuestionIndex: currentIndex,
      userAnswers,
      userMsqAnswers,
      userNatAnswers,
      userDescriptiveAnswers: descriptiveAnswers,
      questionStatuses: statuses,
      timeRemainingSeconds: timeRemaining,
      elapsedSeconds,
    };

    const completed = ExamService.submitExamSession(currentSessionState, paper);
    setShowSubmitModal(false);
    onSubmit(completed);
  }, [session, currentIndex, userAnswers, userMsqAnswers, userNatAnswers, descriptiveAnswers, statuses, timeRemaining, elapsedSeconds, paper, onSubmit]);

  // Save & Exit handler: Flushes pending changes, sets status to 'PAUSED', persists and exits
  const handleSaveAndExit = useCallback(async () => {
    setIsSavingExit(true);
    setSaveExitError(null);
    try {
      const currentSessionState: ExamTestSession = {
        ...session,
        currentQuestionIndex: currentIndex,
        currentSectionId: currentSection?.id || session.currentSectionId,
        userAnswers,
        userMsqAnswers,
        userNatAnswers,
        userDescriptiveAnswers: descriptiveAnswers,
        questionStatuses: statuses,
        timeRemainingSeconds: timeRemaining,
        elapsedSeconds,
      };

      await ExamSessionService.saveAndExit(currentSessionState);
      setIsSavingExit(false);
      setShowExitConfirm(false);
      onExit();
    } catch (err: any) {
      console.error('Failed to save & exit test session:', err);
      setIsSavingExit(false);
      setSaveExitError('Your progress could not be saved. Please try again.');
    }
  }, [session, currentIndex, currentSection, userAnswers, userMsqAnswers, userNatAnswers, descriptiveAnswers, statuses, timeRemaining, elapsedSeconds, onExit]);

  // Status statistics for palette and modal
  const paletteStats = useMemo(() => {
    let answered = 0;
    let notAnswered = 0;
    let notVisited = 0;
    let markedForReview = 0;
    let answeredAndMarked = 0;

    for (let i = 0; i < questions.length; i++) {
      const st = statuses[i] || 'NOT_VISITED';
      if (st === 'ANSWERED') answered++;
      else if (st === 'NOT_ANSWERED') notAnswered++;
      else if (st === 'MARKED_FOR_REVIEW') markedForReview++;
      else if (st === 'ANSWERED_AND_MARKED_FOR_REVIEW') answeredAndMarked++;
      else notVisited++;
    }

    return { answered, notAnswered, notVisited, markedForReview, answeredAndMarked };
  }, [statuses, questions.length]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F19] text-surface-text dark:text-darkSurface-text flex flex-col select-none">
      {/* ── Official Examination Header ─────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white dark:bg-darkSurface-elev1 border-b border-surface-border dark:border-darkSurface-border px-4 py-2.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-xs uppercase">
              {paper.examId === 'gate' ? 'GATE' : 'SSC'}
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-bold font-display line-clamp-1">
                {paper.title}
              </h1>
              <p className="text-[10px] text-surface-muted dark:text-darkSurface-muted hidden sm:block">
                {paper.examId === 'gate'
                  ? 'IIT Roorkee / IISc • Graduate Aptitude Test in Engineering'
                  : 'Staff Selection Commission • Computer Based Examination'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Autosave Status Indicator */}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border">
              {saveStatus === 'saving' && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-ping" />
                  <span className="text-surface-muted">Saving...</span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Saved</span>
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400">Saved offline</span>
                </>
              )}
              {saveStatus === 'idle' && (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-surface-muted/60" />
                  <span className="text-surface-muted">Saved</span>
                </>
              )}
            </div>

            {/* Countdown Timer */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-mono text-xs sm:text-sm font-extrabold transition-all ${
                timeRemaining < 300
                  ? 'bg-red-500/10 text-red-600 border border-red-500/30 animate-pulse'
                  : timeRemaining < 600
                  ? 'bg-amber-500/10 text-amber-600 border border-amber-500/30'
                  : 'bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text border border-surface-border dark:border-darkSurface-border'
              }`}
            >
              <Clock className="w-4 h-4 text-brand-primary shrink-0" />
              <span>Time Left: {formatTime(timeRemaining)}</span>
            </div>

            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl text-surface-muted hover:text-surface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors hidden sm:block"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* UX-001: Mobile Question Palette Trigger */}
            <button
              onClick={() => setIsMobilePaletteOpen(true)}
              className="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/20 text-xs font-bold transition-colors cursor-pointer"
              title="Open Question Palette"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Palette</span>
            </button>

            <button
              onClick={() => setShowExitConfirm(true)}
              className="px-3 py-1.5 rounded-xl border border-surface-border dark:border-darkSurface-border text-xs font-semibold text-surface-muted hover:text-red-500 hover:border-red-500/30 transition-colors"
            >
              Exit
            </button>
          </div>
        </div>
      </header>

      {/* ── Section Navigation Bar ───────────────────────────────────── */}
      <div className="bg-white dark:bg-darkSurface-elev1 border-b border-surface-border dark:border-darkSurface-border px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto scrollbar-none">
          <span className="text-xs font-bold text-surface-muted mr-2 shrink-0">Sections:</span>
          {paper.sections.map((sec) => {
            const isActive = currentSection.id === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => handleSelectSection(sec.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all ${
                  isActive
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'bg-surface-elev1 dark:bg-darkSurface-elev2 text-surface-muted hover:text-surface-text border border-surface-border dark:border-darkSurface-border'
                }`}
              >
                {sec.name} ({sec.questionCount})
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Examination Workspace (Two Columns) ─────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left 3 Columns: Active Question Area */}
        <div className="lg:col-span-3 flex flex-col justify-between bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border rounded-2xl p-6 shadow-sm min-h-[560px]">
          {paper.paperType === 'DESCRIPTIVE' ? (
            <div className="space-y-6">
              {/* Question Subheader */}
              <div className="flex items-center justify-between pb-3 border-b border-surface-border dark:border-darkSurface-border">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold font-display text-surface-text dark:text-darkSurface-text">
                    Question {currentIndex + 1} of {questions.length}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-bold border border-purple-500/20">
                    {currentQuestion.sectionName}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                    {currentQuestion.marks} Marks
                  </span>
                  <span className="text-surface-muted bg-surface-elev2 dark:bg-darkSurface-elev2 px-2.5 py-1 rounded-lg font-medium">
                    {currentQuestion.wordLimit || '200 - 250 words'}
                  </span>
                </div>
              </div>

              {/* Question Prompt Box */}
              <div className="p-5 rounded-2xl bg-surface-elev1/70 dark:bg-darkSurface-elev2/70 border border-surface-border dark:border-darkSurface-border space-y-2">
                <span className="text-[11px] font-bold text-brand-primary uppercase tracking-wider block">
                  Question Prompt
                </span>
                <p className="text-sm sm:text-base leading-relaxed text-surface-text dark:text-darkSurface-text font-medium whitespace-pre-line">
                  {currentQuestion.questionText}
                </p>
              </div>

              {/* Rubric Card */}
              {currentQuestion.rubrics && currentQuestion.rubrics.length > 0 && (
                <div className="p-4 rounded-xl bg-brand-primary/5 border border-brand-primary/15 text-xs space-y-1.5">
                  <span className="font-bold text-brand-primary flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5" />
                    Official SSC Evaluation Rubrics & Guidelines (100 Marks Total)
                  </span>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-surface-text dark:text-darkSurface-text">
                    {currentQuestion.rubrics.map((r, ri) => (
                      <li key={ri} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-primary shrink-0" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Writing Editor Area */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-surface-text dark:text-darkSurface-text">
                    Draft Your Response:
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-surface-muted">
                      {(descriptiveAnswers[currentIndex] || '').length} characters
                    </span>
                    {(() => {
                      const words = (descriptiveAnswers[currentIndex] || '').trim()
                        ? (descriptiveAnswers[currentIndex] || '').trim().split(/\s+/).length
                        : 0;
                      const isEssay = currentIndex === 0;
                      const minWords = isEssay ? 200 : 150;
                      const maxWords = isEssay ? 250 : 200;
                      let badgeColor = 'bg-surface-elev2 text-surface-muted';
                      let statusText = `${words} words`;

                      if (words > 0 && words < minWords) {
                        badgeColor = 'bg-amber-500/10 text-amber-600 border border-amber-500/20';
                        statusText = `${words} / ${minWords}-${maxWords} words (Under Target)`;
                      } else if (words >= minWords && words <= maxWords) {
                        badgeColor = 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20';
                        statusText = `${words} words (Optimal Range)`;
                      } else if (words > maxWords) {
                        badgeColor = 'bg-red-500/10 text-red-600 border border-red-500/20';
                        statusText = `${words} / ${maxWords} words (+${words - maxWords} Over Limit)`;
                      }

                      return (
                        <span className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${badgeColor}`}>
                          {statusText}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <textarea
                  value={descriptiveAnswers[currentIndex] || ''}
                  onChange={(e) => {
                    const text = e.target.value;
                    setDescriptiveAnswers((prev) => {
                      const next = { ...prev, [currentIndex]: text };
                      syncToStorage({ userDescriptiveAnswers: next });
                      return next;
                    });
                    setStatuses((prev) => ({
                      ...prev,
                      [currentIndex]: text.trim().length > 0 ? 'ANSWERED' : 'NOT_ANSWERED',
                    }));
                  }}
                  placeholder="Type your formal essay / letter response here in English. Use clear paragraphs, appropriate formal address, and structured arguments..."
                  className="w-full h-72 sm:h-80 p-4 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-base dark:bg-darkSurface-base text-surface-text dark:text-darkSurface-text font-serif text-sm sm:text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-primary resize-y"
                />
              </div>

              {/* Action Footer Buttons for Descriptive */}
              <div className="pt-4 mt-4 border-t border-surface-border dark:border-darkSurface-border flex items-center justify-between gap-3">
                <button
                  onClick={() => jumpToQuestion(currentIndex - 1)}
                  disabled={currentIndex === 0}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border text-surface-muted hover:text-surface-text disabled:opacity-40 text-xs font-semibold transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous Question</span>
                </button>

                <div className="flex items-center gap-2">
                  {currentIndex < questions.length - 1 ? (
                    <button
                      onClick={() => jumpToQuestion(currentIndex + 1)}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold transition-all shadow-sm"
                    >
                      <span>Next: Letter Writing</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowSubmitModal(true)}
                      className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm shadow-emerald-600/20"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit Descriptive Exam</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col justify-between h-full space-y-6">
              <div className="space-y-6">
                {/* Question Subheader */}
                <div className="flex flex-wrap items-center justify-between pb-3 border-b border-surface-border dark:border-darkSurface-border gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-extrabold font-display text-surface-text dark:text-darkSurface-text">
                      Question {currentIndex + 1} of {questions.length}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-brand-primary/10 text-brand-primary text-[11px] font-bold">
                      {currentQuestion.sectionName}
                    </span>
                    {currentQuestion.questionType && (
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                          currentQuestion.questionType === 'MSQ'
                            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                            : currentQuestion.questionType === 'NAT'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                            : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                        }`}
                      >
                        {currentQuestion.questionType}
                        {currentQuestion.questionType === 'MSQ'
                          ? ' (Multiple Select)'
                          : currentQuestion.questionType === 'NAT'
                          ? ' (Numerical Answer)'
                          : ' (Single Choice)'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
                      +{currentQuestion.marks !== undefined ? currentQuestion.marks : paper.markingScheme.marksPerCorrect}
                    </span>
                    <span className="text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded">
                      -{currentQuestion.negativeMarks !== undefined ? currentQuestion.negativeMarks : paper.markingScheme.negativeMarks}
                    </span>
                  </div>
                </div>

                {/* Question Text */}
                {currentQuestion.questionText && currentQuestion.questionText.trim().length > 0 && (
                  <div className="text-sm sm:text-base leading-relaxed text-surface-text dark:text-darkSurface-text font-medium">
                    <LatexRenderer content={currentQuestion.questionText} />
                  </div>
                )}

                {/* Diagram/Image if present */}
                {((currentQuestion.diagramUrls && currentQuestion.diagramUrls.length > 0) || currentQuestion.diagramUrl) && (
                  <div className="my-4 space-y-3">
                    {(currentQuestion.diagramUrls || [currentQuestion.diagramUrl!]).map((url, dIdx) => (
                      <ExamAsset
                        key={`${currentQuestion.id}-diag-${dIdx}`}
                        url={url}
                        alt={`Figure ${dIdx + 1} for question ${currentIndex + 1}`}
                        variant="diagram"
                        onZoom={setZoomImageUrl}
                      />
                    ))}
                  </div>
                )}

                {/* Question Input / Option Choices */}
                {currentQuestion.questionType === 'NAT' ? (
                  /* NAT (Numerical Answer Type) */
                  <div className="space-y-4 pt-3 p-5 rounded-2xl bg-surface-elev1/50 dark:bg-darkSurface-elev2/40 border border-surface-border dark:border-darkSurface-border max-w-md">
                    <div className="space-y-1">
                      <label className="text-xs font-bold uppercase tracking-wider text-surface-muted">
                        Enter Numerical Answer:
                      </label>
                      <input
                        type="text"
                        value={userNatAnswers[currentIndex] || ''}
                        onChange={(e) => handleNatChange(e.target.value)}
                        placeholder="Type value (e.g. 14.5 or -0.25)"
                        className="w-full px-4 py-3 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-base text-lg font-mono font-bold text-surface-text dark:text-darkSurface-text focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      />
                    </div>
                    {/* On-Screen Virtual Keypad */}
                    <div className="space-y-2 pt-2 border-t border-surface-border/50 dark:border-darkSurface-border/50">
                      <div className="text-[11px] font-semibold text-surface-muted flex items-center justify-between">
                        <span>Virtual Keypad:</span>
                        {(userNatAnswers[currentIndex] || '').length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleNatChange('')}
                            className="text-red-500 hover:underline font-bold text-xs"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {['7', '8', '9', 'Backspace', '4', '5', '6', '-', '1', '2', '3', '.', '0', '00', 'Clear', 'Next'].map((key) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              const curr = userNatAnswers[currentIndex] || '';
                              if (key === 'Backspace') {
                                handleNatChange(curr.slice(0, -1));
                              } else if (key === 'Clear') {
                                handleNatChange('');
                              } else if (key === 'Next') {
                                handleSaveAndNext();
                              } else {
                                handleNatChange(curr + key);
                              }
                            }}
                            className={`p-2.5 rounded-xl font-mono text-xs sm:text-sm font-bold transition-all ${
                              key === 'Backspace' || key === 'Clear'
                                ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20'
                                : key === 'Next'
                                ? 'bg-brand-primary text-white hover:bg-brand-primary/90'
                                : 'bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border hover:bg-surface-elev2 text-surface-text dark:text-darkSurface-text shadow-2xs'
                            }`}
                          >
                            {key}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : currentQuestion.questionType === 'MSQ' ? (
                  /* MSQ (Multiple Select Question) Checkboxes */
                  <div className="space-y-3 pt-2">
                    <div className="text-xs font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-3 py-1.5 rounded-lg border border-purple-500/20 inline-block">
                      Select one or more correct options. No negative marks for wrong answers.
                    </div>
                    {currentQuestion.options.map((optionText, optIdx) => {
                      const optLetter = ['A', 'B', 'C', 'D'][optIdx];
                      const currentSelected = userMsqAnswers[currentIndex] || [];
                      const isSelected = currentSelected.includes(optIdx);
                      const optImage = currentQuestion.optionImages?.[optIdx];
                      const hasValidText =
                        optionText &&
                        optionText.trim().length > 0 &&
                        !/^Option\s*\([A-D]\)$/i.test(optionText.trim());

                      return (
                        <div
                          key={optIdx}
                          onClick={() => handleToggleMsqOption(optIdx)}
                          className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'border-purple-500 bg-purple-500/5 text-surface-text dark:text-darkSurface-text shadow-sm'
                              : 'border-surface-border dark:border-darkSurface-border hover:bg-surface-elev1 dark:hover:bg-darkSurface-elev2 text-surface-muted dark:text-darkSurface-muted'
                          }`}
                        >
                          <div
                            className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 transition-all ${
                              isSelected
                                ? 'bg-purple-600 text-white ring-2 ring-purple-500/30'
                                : 'border border-surface-border dark:border-darkSurface-border text-surface-muted bg-white dark:bg-darkSurface-elev1'
                            }`}
                          >
                            {isSelected ? '✓' : optLetter}
                          </div>
                          <div className="flex-1 text-xs sm:text-sm font-medium pt-0.5 text-surface-text dark:text-darkSurface-text space-y-2">
                            {optImage && (
                              <ExamAsset
                                key={`${currentQuestion.id}-msq-opt-${optIdx}`}
                                url={optImage}
                                alt={`Option ${optLetter} figure`}
                                variant="option"
                                onZoom={setZoomImageUrl}
                              />
                            )}
                            {hasValidText && (
                              <div>
                                <LatexRenderer content={optionText} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Standard MCQ Radio Options */
                  <div className="space-y-3 pt-2">
                    {currentQuestion.options.map((optionText, optIdx) => {
                      const optLetter = ['A', 'B', 'C', 'D'][optIdx];
                      const isSelected = userAnswers[currentIndex] === optIdx;
                      const optImage = currentQuestion.optionImages?.[optIdx];
                      const hasValidText =
                        optionText &&
                        optionText.trim().length > 0 &&
                        !/^Option\s*\([A-D]\)$/i.test(optionText.trim());

                      return (
                        <div
                          key={optIdx}
                          onClick={() => handleSelectOption(optIdx)}
                          className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'border-brand-primary bg-brand-primary/5 text-surface-text dark:text-darkSurface-text shadow-sm'
                              : 'border-surface-border dark:border-darkSurface-border hover:bg-surface-elev1 dark:hover:bg-darkSurface-elev2 text-surface-muted dark:text-darkSurface-muted'
                          }`}
                        >
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 transition-all ${
                              isSelected
                                ? 'bg-brand-primary text-white ring-2 ring-brand-primary/30'
                                : 'border border-surface-border dark:border-darkSurface-border text-surface-muted bg-white dark:bg-darkSurface-elev1'
                            }`}
                          >
                            {optLetter}
                          </div>
                          <div className="flex-1 text-xs sm:text-sm font-medium pt-0.5 text-surface-text dark:text-darkSurface-text space-y-2">
                            {optImage && (
                              <ExamAsset
                                key={`${currentQuestion.id}-mcq-opt-${optIdx}`}
                                url={optImage}
                                alt={`Option ${optLetter} figure`}
                                variant="option"
                                onZoom={setZoomImageUrl}
                              />
                            )}
                            {hasValidText && (
                              <div>
                                <LatexRenderer content={optionText} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action Footer Buttons for CBE */}
              <div className="pt-6 mt-6 border-t border-surface-border dark:border-darkSurface-border flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleMarkForReviewAndNext}
                    className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl border border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 text-xs font-bold transition-colors"
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>Mark for Review & Next</span>
                  </button>

                  <button
                    onClick={handleClearResponse}
                    disabled={userAnswers[currentIndex] === undefined}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border text-surface-muted hover:text-surface-text disabled:opacity-40 text-xs font-semibold transition-colors"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    <span>Clear Response</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => jumpToQuestion(currentIndex - 1)}
                    disabled={currentIndex === 0}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border text-surface-muted hover:text-surface-text disabled:opacity-40 text-xs font-semibold transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </button>

                  <button
                    onClick={handleSaveAndNext}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm shadow-emerald-600/20"
                  >
                    <span>Save & Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right 1 Column: Question Palette or Descriptive Modules */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border rounded-2xl p-5 shadow-sm space-y-4">
            {paper.paperType === 'DESCRIPTIVE' ? (
              <div className="space-y-4">
                <h3 className="text-xs font-bold font-display uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted pb-2 border-b border-surface-border dark:border-darkSurface-border">
                  Descriptive Modules
                </h3>

                <div className="space-y-2.5">
                  {questions.map((q, idx) => {
                    const text = (descriptiveAnswers[idx] || '').trim();
                    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
                    const isSelected = currentIndex === idx;

                    return (
                      <button
                        key={q.id}
                        onClick={() => jumpToQuestion(idx)}
                        className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-brand-primary bg-brand-primary/5 shadow-sm ring-1 ring-brand-primary/30'
                            : 'border-surface-border dark:border-darkSurface-border hover:bg-surface-elev1 dark:hover:bg-darkSurface-elev2'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-surface-text dark:text-darkSurface-text">
                            Q{idx + 1}. {q.sectionName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              words > 0
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                : 'bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted'
                            }`}
                          >
                            {words > 0 ? `${words} words` : 'Draft empty'}
                          </span>
                        </div>
                        <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted mt-1 truncate">
                          {q.wordLimit || '200 - 250 words'} • {q.marks} Marks
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="p-3 rounded-xl bg-surface-elev1/50 dark:bg-darkSurface-elev2/50 border border-surface-border dark:border-darkSurface-border text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-surface-muted">
                    <span>Total Words Written:</span>
                    <span className="font-bold text-surface-text dark:text-darkSurface-text">
                      {Object.values(descriptiveAnswers).reduce(
                        (acc, cur) => acc + (cur.trim() ? cur.trim().split(/\s+/).filter(Boolean).length : 0),
                        0
                      )}{' '}
                      words
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-surface-muted">
                    <span>Modules Attempted:</span>
                    <span className="font-bold text-surface-text dark:text-darkSurface-text">
                      {Object.values(descriptiveAnswers).filter((t) => t.trim().length > 0).length} /{' '}
                      {questions.length}
                    </span>
                  </div>
                </div>

                {/* Submit Exam Button */}
                <div className="pt-2">
                  <button
                    onClick={() => setShowSubmitModal(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold transition-all shadow-sm shadow-brand-primary/20"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Submit Examination</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="text-xs font-bold font-display uppercase tracking-wider text-surface-muted dark:text-darkSurface-muted pb-2 border-b border-surface-border dark:border-darkSurface-border">
                  Question Palette ({currentSection.name})
                </h3>

                {/* Status Legend */}
                <div className="grid grid-cols-2 gap-2 text-[11px] text-surface-muted dark:text-darkSurface-muted pb-3 border-b border-surface-border dark:border-darkSurface-border">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded bg-emerald-500 text-white font-bold flex items-center justify-center text-[9px]">
                      {paletteStats.answered}
                    </span>
                    <span>Answered</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded bg-red-500 text-white font-bold flex items-center justify-center text-[9px]">
                      {paletteStats.notAnswered}
                    </span>
                    <span>Not Answered</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded bg-purple-500 text-white font-bold flex items-center justify-center text-[9px]">
                      {paletteStats.markedForReview}
                    </span>
                    <span>Review</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border font-bold flex items-center justify-center text-[9px]">
                      {paletteStats.notVisited}
                    </span>
                    <span>Not Visited</span>
                  </div>
                </div>

                {/* Question Buttons Grid for Current Section */}
                <div className="grid grid-cols-5 gap-2 max-h-[300px] overflow-y-auto pr-1">
                  {questions
                    .slice(currentSection.startIndex, currentSection.endIndex + 1)
                    .map((q, idx) => {
                      const actualIndex = currentSection.startIndex + idx;
                      const st = statuses[actualIndex] || 'NOT_VISITED';
                      const isCurrent = actualIndex === currentIndex;

                      let badgeColor =
                        'bg-surface-elev1 dark:bg-darkSurface-elev2 border-surface-border text-surface-muted';
                      if (st === 'ANSWERED') {
                        badgeColor = 'bg-emerald-500 text-white border-emerald-600';
                      } else if (st === 'NOT_ANSWERED') {
                        badgeColor = 'bg-red-500 text-white border-red-600';
                      } else if (st === 'MARKED_FOR_REVIEW') {
                        badgeColor = 'bg-purple-500 text-white border-purple-600';
                      } else if (st === 'ANSWERED_AND_MARKED_FOR_REVIEW') {
                        badgeColor = 'bg-purple-600 text-white ring-2 ring-emerald-400 border-purple-700';
                      }

                      return (
                        <button
                          key={actualIndex}
                          onClick={() => jumpToQuestion(actualIndex)}
                          className={`h-8 rounded-lg text-xs font-bold flex items-center justify-center border transition-all ${badgeColor} ${
                            isCurrent ? 'ring-2 ring-brand-primary ring-offset-2 scale-105 shadow-sm' : ''
                          }`}
                        >
                          {actualIndex + 1}
                        </button>
                      );
                    })}
                </div>

                {/* Submit Exam Button */}
                <div className="pt-3 border-t border-surface-border dark:border-darkSurface-border">
                  <button
                    onClick={() => setShowSubmitModal(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold transition-all shadow-sm shadow-brand-primary/20"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Submit Examination</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* ── Submit Confirmation Modal ─────────────────────────────────── */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-xl space-y-6 animate-in zoom-in-95 duration-200">
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold font-display text-surface-text dark:text-darkSurface-text">
                Submit Examination?
              </h3>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                Please review your section summary before final submission. Once submitted, you cannot change your responses.
              </p>
            </div>

            {paper.paperType === 'DESCRIPTIVE' ? (
              <div className="space-y-4">
                <div className="border border-surface-border dark:border-darkSurface-border rounded-2xl overflow-hidden text-xs divide-y divide-surface-border dark:divide-darkSurface-border">
                  {questions.map((q, idx) => {
                    const text = (descriptiveAnswers[idx] || '').trim();
                    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
                    return (
                      <div
                        key={q.id}
                        className="p-3.5 bg-surface-elev1/30 dark:bg-darkSurface-elev2/30 flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-surface-text dark:text-darkSurface-text block">
                            Q{idx + 1}. {q.sectionName}
                          </span>
                          <span className="text-surface-muted text-[11px]">
                            {q.wordLimit} • {q.marks} Marks
                          </span>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full font-bold text-[11px] ${
                            words > 0
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                          }`}
                        >
                          {words > 0 ? `${words} words written` : 'Not attempted'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="p-3.5 rounded-xl bg-surface-elev1/50 dark:bg-darkSurface-elev2/50 text-xs text-surface-muted space-y-1 leading-relaxed">
                  <p className="font-semibold text-surface-text dark:text-darkSurface-text">
                    Post-Submission Review:
                  </p>
                  <p>
                    Your written drafts will be preserved and compared side-by-side with official SSC
                    reference essays, model letter structures, and marking rubrics.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Section Breakdown Summary Table */}
                <div className="border border-surface-border dark:border-darkSurface-border rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-surface-elev1 dark:bg-darkSurface-elev2 font-bold text-surface-muted">
                      <tr>
                        <th className="p-2.5">Section</th>
                        <th className="p-2.5 text-center">Total</th>
                        <th className="p-2.5 text-center text-emerald-600">Answered</th>
                        <th className="p-2.5 text-center text-purple-600">Review</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border dark:divide-darkSurface-border">
                      {paper.sections.map((sec) => {
                        let ans = 0;
                        let rev = 0;
                        for (let i = sec.startIndex; i <= sec.endIndex; i++) {
                          if (statuses[i] === 'ANSWERED') ans++;
                          if (
                            statuses[i] === 'MARKED_FOR_REVIEW' ||
                            statuses[i] === 'ANSWERED_AND_MARKED_FOR_REVIEW'
                          )
                            rev++;
                        }
                        return (
                          <tr key={sec.id}>
                            <td className="p-2.5 font-medium">{sec.name}</td>
                            <td className="p-2.5 text-center">{sec.questionCount}</td>
                            <td className="p-2.5 text-center font-bold text-emerald-600">{ans}</td>
                            <td className="p-2.5 text-center font-bold text-purple-600">{rev}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-surface-elev1/50 dark:bg-darkSurface-elev2/50 text-xs">
                  <span className="text-surface-muted">Total Questions Attempted:</span>
                  <span className="font-bold text-surface-text dark:text-darkSurface-text">
                    {paletteStats.answered + paletteStats.answeredAndMarked} / {questions.length}
                  </span>
                </div>

                {paletteStats.notAnswered + paletteStats.notVisited > 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      You have {paletteStats.notAnswered + paletteStats.notVisited} unanswered questions remaining.
                    </span>
                  </div>
                )}
              </>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 rounded-xl border border-surface-border text-xs font-bold text-surface-muted hover:text-surface-text transition-colors"
              >
                Return to Test
              </button>
              <button
                onClick={handleFinalSubmit}
                className="px-5 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold transition-all shadow-sm"
              >
                Confirm & Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Exit Confirmation Modal ──────────────────────────────────── */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold font-display text-surface-text dark:text-darkSurface-text">
                  Exit Test?
                </h3>
                <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                  Your progress will be saved.
                </p>
              </div>
            </div>

            {/* Test Stats Grid */}
            <div className="grid grid-cols-2 gap-3 py-1">
              <div className="p-3.5 rounded-2xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border">
                <span className="text-[11px] font-semibold text-surface-muted uppercase block">
                  You have attempted:
                </span>
                <span className="text-base font-extrabold text-surface-text dark:text-darkSurface-text mt-0.5 block">
                  {paletteStats.answered + paletteStats.answeredAndMarked} / {questions.length} questions
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border">
                <span className="text-[11px] font-semibold text-surface-muted uppercase block">
                  Marked for review:
                </span>
                <span className="text-base font-extrabold text-purple-600 dark:text-purple-400 mt-0.5 block">
                  {paletteStats.markedForReview + paletteStats.answeredAndMarked}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border">
                <span className="text-[11px] font-semibold text-surface-muted uppercase block">
                  Current question:
                </span>
                <span className="text-base font-extrabold text-brand-primary mt-0.5 block">
                  Q{currentIndex + 1}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border">
                <span className="text-[11px] font-semibold text-surface-muted uppercase block">
                  Time left:
                </span>
                <span className="text-base font-extrabold font-mono text-surface-text dark:text-darkSurface-text mt-0.5 block">
                  {formatTime(timeRemaining)}
                </span>
              </div>
            </div>

            {saveExitError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center justify-between gap-2">
                <span>{saveExitError}</span>
                <button
                  onClick={handleSaveAndExit}
                  className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold text-[10px] hover:bg-red-700"
                >
                  Retry
                </button>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setShowExitConfirm(false);
                  setSaveExitError(null);
                }}
                disabled={isSavingExit}
                className="px-4 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border text-xs font-bold text-surface-text dark:text-darkSurface-text hover:bg-surface-elev1 transition-colors"
              >
                Continue Test
              </button>
              <button
                onClick={handleSaveAndExit}
                disabled={isSavingExit}
                className="px-5 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2"
              >
                {isSavingExit ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save & Exit</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Zoom Image Lightbox Modal ─────────────────────────────────── */}
      {zoomImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setZoomImageUrl(null)}
        >
          <div
            className="relative bg-white p-4 rounded-2xl max-w-4xl max-h-[90vh] overflow-auto shadow-2xl flex flex-col items-center border border-surface-border"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setZoomImageUrl(null)}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-surface-elev1 text-surface-muted hover:text-surface-text hover:bg-surface-elev2 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={zoomImageUrl}
              alt="Enlarged figure"
              className="max-h-[80vh] w-auto object-contain mx-auto rounded-lg"
            />
          </div>
        </div>
      )}

      {/* ── Mobile Floating Palette Pill (UX-001) ───────────────────── */}
      <div className="lg:hidden fixed bottom-4 right-4 z-40">
        <button
          onClick={() => setIsMobilePaletteOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-brand-primary text-white shadow-xl shadow-brand-primary/30 text-xs font-bold hover:scale-105 active:scale-95 transition-all cursor-pointer"
        >
          <LayoutGrid className="w-4 h-4" />
          <span>Grid ({currentIndex + 1}/{questions.length})</span>
        </button>
      </div>

      {/* ── Mobile Question Palette Drawer Modal (UX-001) ─────────────── */}
      {isMobilePaletteOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-black/60 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-150"
          onClick={() => setIsMobilePaletteOpen(false)}
        >
          <div
            className="bg-white dark:bg-darkSurface-elev1 border-t border-surface-border dark:border-darkSurface-border rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-surface-border dark:border-darkSurface-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold font-display text-surface-text dark:text-darkSurface-text">
                  Question Palette ({currentSection.name})
                </h3>
                <p className="text-[11px] text-surface-muted">
                  Tap any question to jump directly
                </p>
              </div>
              <button
                onClick={() => setIsMobilePaletteOpen(false)}
                className="p-1.5 rounded-full bg-surface-elev2 hover:bg-surface-elev1 text-surface-muted cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sections Selector */}
            <div className="p-3 border-b border-surface-border dark:border-darkSurface-border flex gap-1.5 overflow-x-auto scrollbar-none">
              {paper.sections.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => handleSelectSection(sec.id)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-colors cursor-pointer ${
                    currentSection.id === sec.id
                      ? 'bg-brand-primary text-white'
                      : 'bg-surface-elev2 text-surface-muted hover:text-surface-text'
                  }`}
                >
                  {sec.name} ({sec.questionCount})
                </button>
              ))}
            </div>

            {/* Status Legend */}
            <div className="p-3 border-b border-surface-border dark:border-darkSurface-border grid grid-cols-4 gap-2 text-[10px] text-surface-muted">
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-emerald-500 text-white font-bold flex items-center justify-center text-[8px]">{paletteStats.answered}</span>
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-red-500 text-white font-bold flex items-center justify-center text-[8px]">{paletteStats.notAnswered}</span>
                <span>Unans</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-purple-500 text-white font-bold flex items-center justify-center text-[8px]">{paletteStats.markedForReview}</span>
                <span>Review</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-surface-elev2 border border-surface-border font-bold flex items-center justify-center text-[8px]">{paletteStats.notVisited}</span>
                <span>Left</span>
              </div>
            </div>

            {/* Palette Grid */}
            <div className="p-4 overflow-y-auto max-h-[45vh]">
              <div className="grid grid-cols-6 gap-2">
                {questions
                  .slice(currentSection.startIndex, currentSection.endIndex + 1)
                  .map((q, idx) => {
                    const actualIndex = currentSection.startIndex + idx;
                    const st = statuses[actualIndex] || 'NOT_VISITED';
                    const isCurrent = actualIndex === currentIndex;

                    let badgeColor = 'bg-surface-elev1 dark:bg-darkSurface-elev2 border-surface-border text-surface-muted';
                    if (st === 'ANSWERED') badgeColor = 'bg-emerald-500 text-white border-emerald-600';
                    else if (st === 'NOT_ANSWERED') badgeColor = 'bg-red-500 text-white border-red-600';
                    else if (st === 'MARKED_FOR_REVIEW') badgeColor = 'bg-purple-500 text-white border-purple-600';
                    else if (st === 'ANSWERED_AND_MARKED_FOR_REVIEW') badgeColor = 'bg-purple-600 text-white ring-2 ring-emerald-400 border-purple-700';

                    return (
                      <button
                        key={actualIndex}
                        onClick={() => {
                          jumpToQuestion(actualIndex);
                          setIsMobilePaletteOpen(false);
                        }}
                        className={`h-9 rounded-lg text-xs font-bold flex items-center justify-center border transition-all cursor-pointer ${badgeColor} ${
                          isCurrent ? 'ring-2 ring-brand-primary ring-offset-2 scale-105 shadow-sm' : ''
                        }`}
                      >
                        {actualIndex + 1}
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Bottom Submit Action */}
            <div className="p-3 border-t border-surface-border dark:border-darkSurface-border">
              <button
                onClick={() => {
                  setIsMobilePaletteOpen(false);
                  setShowSubmitModal(true);
                }}
                className="w-full py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit Examination</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
