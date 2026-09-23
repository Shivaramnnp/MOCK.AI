import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Clock,
  ChevronLeft,
  ChevronRight,
  Send,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';
import { Question, TestSessionState } from '../types';
import { LatexRenderer } from '../components/LatexRenderer';

interface TestPlayerScreenProps {
  testId: string;
  title: string;
  category: string;
  questions: Question[];
  timerDurationSeconds?: number;
  assignmentId?: string;
  onExit: () => void;
  onSubmit: (session: TestSessionState) => void;
}

export const TestPlayerScreen: React.FC<TestPlayerScreenProps> = ({
  testId,
  title,
  category,
  questions,
  timerDurationSeconds = 60,
  assignmentId,
  onExit,
  onSubmit,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [bookmarkedIndices, setBookmarkedIndices] = useState<number[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(timerDurationSeconds);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [tabSwitchWarnings, setTabSwitchWarnings] = useState(0);
  const [showAntiCheatAlert, setShowAntiCheatAlert] = useState(false);

  // Timer countdown
  useEffect(() => {
    if (timerDurationSeconds <= 0) return; // untimed

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timerDurationSeconds]);

  // Anti-cheat: tab switch / window blur detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchWarnings((prev) => {
          const next = prev + 1;
          setShowAntiCheatAlert(true);
          return next;
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const handleAutoSubmit = useCallback(() => {
    const session: TestSessionState = {
      testId,
      title,
      category,
      questions,
      currentIndex,
      userAnswers,
      bookmarkedIndices,
      isSubmitted: true,
      timeRemainingSeconds: 0,
      elapsedSeconds,
      timerDurationSeconds,
      assignmentId,
    };
    onSubmit(session);
  }, [
    testId,
    title,
    category,
    questions,
    currentIndex,
    userAnswers,
    bookmarkedIndices,
    elapsedSeconds,
    timerDurationSeconds,
    assignmentId,
    onSubmit,
  ]);

  const handleSelectOption = (optionIndex: number) => {
    setUserAnswers((prev) => ({
      ...prev,
      [currentIndex]: optionIndex,
    }));
  };

  const toggleBookmark = () => {
    setBookmarkedIndices((prev) =>
      prev.includes(currentIndex) ? prev.filter((i) => i !== currentIndex) : [...prev, currentIndex]
    );
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showExitConfirm || showSubmitConfirm) return;

      if (e.key === '1' || e.key === 'a' || e.key === 'A') handleSelectOption(0);
      else if (e.key === '2' || e.key === 'b' || e.key === 'B') handleSelectOption(1);
      else if (e.key === '3' || e.key === 'c' || e.key === 'C') handleSelectOption(2);
      else if (e.key === '4' || e.key === 'd' || e.key === 'D') handleSelectOption(3);
      else if (e.key === 'ArrowRight' || e.key === 'k' || e.key === 'K') {
        if (currentIndex < questions.length - 1) setCurrentIndex((i) => i + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
        if (currentIndex > 0) setCurrentIndex((i) => i - 1);
      } else if (e.key === 'm' || e.key === 'M') {
        toggleBookmark();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, questions.length, showExitConfirm, showSubmitConfirm]);

  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(userAnswers).length;
  const isBookmarked = bookmarkedIndices.includes(currentIndex);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleFinalSubmit = () => {
    const session: TestSessionState = {
      testId,
      title,
      category,
      questions,
      currentIndex,
      userAnswers,
      bookmarkedIndices,
      isSubmitted: true,
      timeRemainingSeconds: timeRemaining,
      elapsedSeconds,
      timerDurationSeconds,
      assignmentId,
    };
    onSubmit(session);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6 animate-in fade-in duration-200">
      {/* ── Top Exam Navigation Bar ───────────────────────────────────── */}
      <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-4 shadow-sm flex items-center justify-between gap-4">
        {/* Exit Button */}
        <button
          onClick={() => setShowExitConfirm(true)}
          className="p-2 rounded-xl text-surface-muted hover:text-surface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Title & Question Counter */}
        <div className="text-center min-w-0 flex-1">
          <span className="text-[11px] font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider block">
            {category}
          </span>
          <h2 className="font-bold text-sm sm:text-base text-surface-text dark:text-darkSurface-text truncate">
            Question {currentIndex + 1} of {questions.length}
          </h2>
        </div>

        {/* Timer & Bookmark */}
        <div className="flex items-center gap-3">
          {timerDurationSeconds > 0 && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xs sm:text-sm font-bold border transition-colors ${
                timeRemaining <= 15
                  ? 'bg-red-500/10 border-red-500/30 text-brand-red animate-pulse'
                  : 'bg-surface-elev2 dark:bg-darkSurface-elev2 border-surface-border dark:border-darkSurface-border text-surface-text dark:text-darkSurface-text'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{formatTimer(timeRemaining)}</span>
            </div>
          )}

          <button
            onClick={toggleBookmark}
            title="Bookmark question (Press M)"
            className={`p-2 rounded-xl border transition-all ${
              isBookmarked
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                : 'border-surface-border dark:border-darkSurface-border text-surface-muted hover:text-surface-text'
            }`}
          >
            {isBookmarked ? <BookmarkCheck className="w-5 h-5 fill-amber-500" /> : <Bookmark className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ── Question Palette / Navigator ──────────────────────────────── */}
      <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-xs text-surface-muted dark:text-darkSurface-muted mb-2 px-1">
          <span>Question Navigator</span>
          <span>
            {answeredCount} / {questions.length} Answered
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {questions.map((_, idx) => {
            const isCur = idx === currentIndex;
            const isAns = userAnswers[idx] !== undefined;
            const isBkm = bookmarkedIndices.includes(idx);

            let btnStyle = 'bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted';
            if (isCur) {
              btnStyle = 'bg-gradient-to-tr from-brand-primary to-brand-variant text-white shadow-md scale-110 font-black';
            } else if (isBkm) {
              btnStyle = 'bg-amber-500/20 text-amber-500 border border-amber-500/40 font-bold';
            } else if (isAns) {
              btnStyle = 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 font-bold';
            }

            return (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`w-9 h-9 rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center justify-center ${btnStyle}`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Question Card ────────────────────────────────────────── */}
      <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 sm:p-8 shadow-sm space-y-6">
        {/* Topic Badge & Citation */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-brand-primary/10 text-brand-primary">
            {currentQuestion.topic || 'Concept Query'}
          </span>
          {currentQuestion.verificationStatus === 'VERIFIED' && (
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
              ✓ Verified Question
            </span>
          )}
        </div>

        {/* Question Text with LaTeX rendering */}
        <div className="text-base sm:text-lg font-bold text-surface-text dark:text-darkSurface-text leading-relaxed">
          <LatexRenderer content={currentQuestion.questionText} />
        </div>

        {/* 4 Clear Option Choice Cards */}
        <div className="space-y-3 pt-2">
          {currentQuestion.options.map((opt, optIndex) => {
            const isSelected = userAnswers[currentIndex] === optIndex;
            const letter = String.fromCharCode(65 + optIndex);

            return (
              <div
                key={optIndex}
                onClick={() => handleSelectOption(optIndex)}
                className={`group cursor-pointer flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                  isSelected
                    ? 'bg-brand-primary/10 border-brand-primary shadow-sm'
                    : 'bg-surface-elev2 dark:bg-darkSurface-elev2 border-surface-border dark:border-darkSurface-border hover:border-brand-primary/40'
                }`}
              >
                {/* Letter Circle Indicator */}
                <div
                  className={`w-9 h-9 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 transition-all ${
                    isSelected
                      ? 'bg-brand-primary text-white shadow-glow'
                      : 'bg-white dark:bg-darkSurface-elev1 text-surface-muted border border-surface-border dark:border-darkSurface-border group-hover:border-brand-primary'
                  }`}
                >
                  {letter}
                </div>

                {/* Option Text with LaTeX support */}
                <div className="min-w-0 flex-1 text-sm sm:text-base font-medium text-surface-text dark:text-darkSurface-text">
                  <LatexRenderer content={opt} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Keyboard Hints */}
        <div className="hidden sm:flex items-center justify-between text-[11px] text-surface-muted dark:text-darkSurface-muted pt-4 border-t border-surface-border dark:border-darkSurface-border font-mono">
          <span>Shortcuts: Press [1-4] or [A-D] to pick • [B] to bookmark</span>
          <span>[← / →] to navigate</span>
        </div>
      </div>

      {/* ── Bottom Controls Bar ───────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <button
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="flex items-center gap-1.5 px-5 py-3 rounded-2xl border border-surface-border dark:border-darkSurface-border text-xs sm:text-sm font-semibold text-surface-text dark:text-darkSurface-text hover:bg-surface-elev2 disabled:opacity-40 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous</span>
        </button>

        {currentIndex === questions.length - 1 ? (
          <button
            onClick={() => setShowSubmitConfirm(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-brand-primary to-brand-variant text-white text-xs sm:text-sm font-bold shadow-glow hover:brightness-110 active:scale-95 transition-all"
          >
            <Send className="w-4 h-4" />
            <span>Finish & Submit</span>
          </button>
        ) : (
          <button
            onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
            className="flex items-center gap-1.5 px-6 py-3 rounded-2xl bg-gradient-to-r from-brand-primary to-brand-variant text-white text-xs sm:text-sm font-bold shadow-md hover:brightness-110 active:scale-95 transition-all"
          >
            <span>Next Question</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Exit Confirmation Dialog ─────────────────────────────────── */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white dark:bg-darkSurface-elev1 rounded-3xl border border-surface-border dark:border-darkSurface-border shadow-2xl p-6 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <h3 className="font-bold text-lg text-surface-text dark:text-darkSurface-text">
              Exit this exam?
            </h3>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-1">
              Your ongoing progress will not be recorded until you submit.
            </p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-surface-muted hover:text-surface-text"
              >
                Continue Exam
              </button>
              <button
                onClick={onExit}
                className="px-5 py-2.5 rounded-xl bg-brand-red text-white text-xs font-bold shadow-sm"
              >
                Confirm Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Submit Confirmation Dialog ───────────────────────────────── */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-darkSurface-elev1 rounded-3xl border border-surface-border dark:border-darkSurface-border shadow-2xl p-6">
            <h3 className="font-bold text-xl text-surface-text dark:text-darkSurface-text mb-2">
              Ready to submit?
            </h3>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted mb-4">
              Here is a quick summary of your exam session:
            </p>

            <div className="space-y-2 p-4 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 text-xs">
              <div className="flex justify-between">
                <span className="text-surface-muted">Total Questions:</span>
                <span className="font-bold">{questions.length}</span>
              </div>
              <div className="flex justify-between text-brand-green">
                <span>Answered:</span>
                <span className="font-bold">{answeredCount}</span>
              </div>
              <div className="flex justify-between text-amber-500">
                <span>Unanswered / Skipped:</span>
                <span className="font-bold">{questions.length - answeredCount}</span>
              </div>
              <div className="flex justify-between text-brand-primary">
                <span>Bookmarked for review:</span>
                <span className="font-bold">{bookmarkedIndices.length}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-surface-muted hover:text-surface-text"
              >
                Back to Exam
              </button>
              <button
                onClick={handleFinalSubmit}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white text-xs font-bold shadow-md hover:brightness-110"
              >
                Submit Exam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Anti-Cheat Tab Switch Notification ────────────────────────── */}
      {showAntiCheatAlert && (
        <div className="fixed bottom-20 right-4 z-50 max-w-sm p-4 rounded-2xl bg-red-500/90 text-white shadow-2xl flex items-start gap-3 animate-in slide-in-from-bottom-4 duration-200">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold">Exam Integrity Monitor Notice</p>
            <p className="text-white/80 mt-0.5">
              Tab switch detected ({tabSwitchWarnings} warning{tabSwitchWarnings > 1 ? 's' : ''}). Please stay focused on the exam window.
            </p>
            <button
              onClick={() => setShowAntiCheatAlert(false)}
              className="mt-2 text-[10px] uppercase font-bold underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
