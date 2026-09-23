import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Award,
  Home,
  Share2,
  ChevronDown,
  ChevronUp,
  Filter,
  ArrowLeft,
  HelpCircle,
  TrendingUp,
  Percent,
  Bookmark,
  ZoomIn,
  X,
  PenTool,
  FileText,
  BookOpen,
  Check,
  AlertCircle,
} from 'lucide-react';
import { ExamPaper, ExamTestSession, CompetitiveQuestion } from '../types';
import { LatexRenderer } from '../components/LatexRenderer';

interface CompetitiveExamResultsScreenProps {
  session: ExamTestSession;
  paper: ExamPaper;
  onRetake: () => void;
  onExplore: () => void;
}

export const CompetitiveExamResultsScreen: React.FC<CompetitiveExamResultsScreenProps> = ({
  session,
  paper,
  onRetake,
  onExplore,
}) => {
  const result = session.result;
  const questions = paper.questions;
  const userAnswers = session.userAnswers || {};
  const descriptiveAnswers = session.userDescriptiveAnswers || {};
  const isDescriptive = paper.paperType === 'DESCRIPTIVE';

  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [expandedExplanations, setExpandedExplanations] = useState<Record<number, boolean>>({});
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  // Trigger celebration confetti for strong scores or descriptive completion
  useEffect(() => {
    if (result && (isDescriptive || result.percentage >= 65)) {
      confetti({
        particleCount: 75,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#4F6EF7', '#9B4DFF', '#1DB974', '#FF9500'],
      });
    }
  }, [result, isDescriptive]);

  if (!result) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-surface-muted">No result calculation found for this session.</p>
        <button
          onClick={onExplore}
          className="px-4 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold"
        >
          Back to Explore
        </button>
      </div>
    );
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  const toggleExplanation = (index: number) => {
    setExpandedExplanations((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  // Filter questions for review
  const filteredQuestions = questions
    .map((q, idx) => {
      const userChoice = userAnswers[idx];
      const qMarks = q.marks !== undefined ? q.marks : paper.markingScheme.marksPerCorrect;
      const qNegative =
        q.negativeMarks !== undefined ? q.negativeMarks : paper.markingScheme.negativeMarks;

      let isAttempted = false;
      let isCorrect = false;
      let isWrong = false;
      let isSkipped = false;

      if (q.isMta) {
        isAttempted = true;
        isCorrect = true;
      } else if (q.questionType === 'MSQ') {
        const userMsq = session.userMsqAnswers?.[idx] || [];
        isAttempted = userMsq.length > 0;
        if (isAttempted) {
          const sortedUserLetters = [...userMsq].sort().map((i) => ['A', 'B', 'C', 'D'][i]);
          if (q.correctAnswerSets && q.correctAnswerSets.length > 0) {
            isCorrect = q.correctAnswerSets.some((set) => {
              const sortedSet = [...set].sort();
              return (
                sortedSet.length === sortedUserLetters.length &&
                sortedSet.every((val, i) => val === sortedUserLetters[i])
              );
            });
          } else if (q.correctAnswerSet && q.correctAnswerSet.length > 0) {
            const sortedSet = [...q.correctAnswerSet].sort();
            isCorrect =
              sortedSet.length === sortedUserLetters.length &&
              sortedSet.every((val, i) => val === sortedUserLetters[i]);
          } else if (q.correctAnswerIndices && q.correctAnswerIndices.length > 0) {
            const sortedIndices = [...q.correctAnswerIndices].sort();
            const sortedUser = [...userMsq].sort();
            isCorrect =
              sortedIndices.length === sortedUser.length &&
              sortedIndices.every((val, i) => val === sortedUser[i]);
          }
          isWrong = !isCorrect;
        } else {
          isSkipped = true;
        }
      } else if (q.questionType === 'NAT') {
        const userNat = session.userNatAnswers?.[idx];
        isAttempted = typeof userNat === 'string' && userNat.trim().length > 0;
        if (isAttempted && userNat) {
          const numVal = parseFloat(userNat.trim());
          if (!isNaN(numVal)) {
            const tolerance = 1e-4;
            if (q.answerRanges && q.answerRanges.length > 0) {
              isCorrect = q.answerRanges.some(
                (r) => numVal >= r.min - tolerance && numVal <= r.max + tolerance
              );
            } else if (q.answerRange) {
              isCorrect =
                numVal >= q.answerRange.min - tolerance && numVal <= q.answerRange.max + tolerance;
            }
          }
          isWrong = !isCorrect;
        } else {
          isSkipped = true;
        }
      } else {
        isAttempted = userChoice !== undefined && userChoice !== null;
        isCorrect = isAttempted && userChoice === q.correctAnswerIndex;
        isWrong = isAttempted && userChoice !== q.correctAnswerIndex;
        isSkipped = !isAttempted;
      }

      const status = session.questionStatuses[idx] || 'NOT_VISITED';
      const isMarked =
        status === 'MARKED_FOR_REVIEW' || status === 'ANSWERED_AND_MARKED_FOR_REVIEW';

      return {
        q,
        idx,
        userChoice,
        qMarks,
        qNegative,
        isAttempted,
        isCorrect,
        isWrong,
        isSkipped,
        isMarked,
      };
    })
    .filter((item) => {
      // Section filter
      if (selectedSectionFilter !== 'all' && item.q.sectionId !== selectedSectionFilter) {
        return false;
      }
      // Status filter
      if (selectedStatusFilter === 'correct') return item.isCorrect;
      if (selectedStatusFilter === 'wrong') return item.isWrong;
      if (selectedStatusFilter === 'skipped') return item.isSkipped;
      if (selectedStatusFilter === 'marked') return item.isMarked;
      return true;
    });

  const handleShare = () => {
    const text = isDescriptive
      ? `📝 I completed "${paper.title}" descriptive practice on MOCK.AI!`
      : `🎯 I scored ${result.totalScore}/${result.maxMarks} (${result.percentage}%) on "${paper.title}" on MOCK.AI!`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      alert('Score summary copied to clipboard!');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 space-y-8 animate-in fade-in duration-200">
      {/* ── Top Bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-surface-border dark:border-darkSurface-border">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-brand-primary">
            <span>Official Examination Result</span>
            <span>•</span>
            <span>{paper.tier}{isDescriptive ? ' • Descriptive Pen & Paper Mode' : ''}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold font-display text-surface-text dark:text-darkSurface-text">
            {paper.title}
          </h1>
          <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
            Submitted on {new Date(result.submittedAt).toLocaleDateString()} at{' '}
            {new Date(result.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={onRetake}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs font-bold text-surface-text hover:bg-surface-elev1 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-brand-primary" />
            <span>Retake Paper</span>
          </button>
          <button
            onClick={onExplore}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary/90 transition-all shadow-sm shadow-brand-primary/20"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Back to Explore</span>
          </button>
        </div>
      </div>

      {isDescriptive ? (
        /* ═══════════════════════════════════════════════════════════════════
           DESCRIPTIVE TIER 2 PRACTICE RESULTS & BENCHMARK REVIEW
           ═══════════════════════════════════════════════════════════════════ */
        <div className="space-y-8">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Modules Completed Card */}
            <div className="rounded-3xl bg-gradient-to-br from-brand-primary/10 via-brand-purple/5 to-transparent dark:from-brand-primary/20 dark:via-brand-purple/10 border border-brand-primary/20 p-6 flex flex-col justify-between shadow-sm">
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-primary">
                  Descriptive Modules Attempted
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-extrabold font-display text-surface-text dark:text-darkSurface-text">
                    {result.correctCount} / {questions.length}
                  </span>
                  <span className="text-xs font-semibold text-surface-muted dark:text-darkSurface-muted">
                    Completed
                  </span>
                </div>
                <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                  Official SSC Tier 2 pen-and-paper syllabus (50 Marks Essay + 50 Marks Letter/Application).
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-brand-primary/20 flex items-center justify-between text-xs">
                <span className="font-bold text-surface-text dark:text-darkSurface-text">
                  Total Paper Marks: {paper.totalMarks}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ready for Review
                </span>
              </div>
            </div>

            {/* Time Taken Card */}
            <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 flex flex-col justify-between shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-surface-muted">
                Exam Time & Pacing
              </span>
              <div className="text-center my-auto py-2">
                <div className="flex items-center justify-center gap-2 text-surface-text dark:text-darkSurface-text">
                  <Clock className="w-6 h-6 text-brand-primary" />
                  <span className="text-3xl font-extrabold font-display">
                    {formatTime(result.timeSpentSeconds)}
                  </span>
                </div>
                <span className="block text-xs text-surface-muted mt-1">
                  Official Duration: {paper.durationMinutes} Minutes
                </span>
              </div>
              <div className="text-[11px] text-surface-muted pt-2 border-t border-surface-border text-center">
                Pacing: ~{Math.round(result.timeSpentSeconds / 60)} min used out of {paper.durationMinutes} min
              </div>
            </div>

            {/* Evaluation Guidelines Card */}
            <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 flex flex-col justify-between shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-surface-muted">
                Evaluation Guidelines
              </span>
              <div className="space-y-1.5 py-1 text-xs text-surface-muted dark:text-darkSurface-muted">
                <div className="flex items-center gap-1.5 text-surface-text dark:text-darkSurface-text font-medium">
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Topic relevance & clarity (15M)</span>
                </div>
                <div className="flex items-center gap-1.5 text-surface-text dark:text-darkSurface-text font-medium">
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Structure & paragraph flow (15M)</span>
                </div>
                <div className="flex items-center gap-1.5 text-surface-text dark:text-darkSurface-text font-medium">
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Grammar & vocabulary (10M)</span>
                </div>
                <div className="flex items-center gap-1.5 text-surface-text dark:text-darkSurface-text font-medium">
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Word limit & format adherence (10M)</span>
                </div>
              </div>
              <button
                onClick={handleShare}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-surface-border text-xs font-bold text-surface-muted hover:text-surface-text transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Summary</span>
              </button>
            </div>
          </div>

          {/* Module-by-Module Submissions & Benchmark Solutions */}
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold font-display text-surface-text dark:text-darkSurface-text">
                Candidate Submissions & Official Benchmark Solutions
              </h3>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                Compare your drafted essay and letter with official SSC model answers and evaluation rubrics.
              </p>
            </div>

            {questions.map((q, idx) => {
              const draft = descriptiveAnswers[idx] || '';
              const wordCount = draft.trim() ? draft.trim().split(/\s+/).filter(Boolean).length : 0;
              const charCount = draft.length;
              const isExpanded = expandedExplanations[idx] !== false;

              // Parse target word limit
              const limitMatch = q.wordLimit?.match(/(\d+)\s*-\s*(\d+)/);
              const minLimit = limitMatch ? parseInt(limitMatch[1], 10) : 150;
              const maxLimit = limitMatch ? parseInt(limitMatch[2], 10) : 250;
              const isWithinLimit = wordCount >= minLimit && wordCount <= maxLimit;
              const isUnderLimit = wordCount > 0 && wordCount < minLimit;

              return (
                <div
                  key={q.id}
                  className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 sm:p-8 shadow-sm space-y-6"
                >
                  {/* Module Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-surface-border dark:border-darkSurface-border">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-sm">
                        Q{idx + 1}
                      </div>
                      <div>
                        <h4 className="text-sm sm:text-base font-bold text-surface-text dark:text-darkSurface-text">
                          {q.sectionName}
                        </h4>
                        <span className="text-xs text-surface-muted">
                          Maximum Marks: {q.marks} Marks • Word Limit: {q.wordLimit || '200-250 words'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {wordCount === 0 ? (
                        <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Not Attempted</span>
                        </span>
                      ) : (
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                            isWithinLimit
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            {wordCount} Words {isWithinLimit ? '(Optimal Range)' : isUnderLimit ? '(Below Target)' : '(Above Target)'}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Question Prompt */}
                  <div className="p-4 rounded-2xl bg-surface-elev1/50 dark:bg-darkSurface-elev2/50 border border-surface-border dark:border-darkSurface-border space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-surface-muted">
                      Official Question Topic
                    </span>
                    <div className="text-sm font-semibold text-surface-text dark:text-darkSurface-text leading-relaxed whitespace-pre-line">
                      <LatexRenderer content={q.questionText} />
                    </div>
                  </div>

                  {/* Candidate Drafted Content */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-surface-text dark:text-darkSurface-text">
                        <PenTool className="w-3.5 h-3.5 text-brand-primary" />
                        <span>Your Drafted Submission</span>
                      </div>
                      <span className="text-xs text-surface-muted">
                        {wordCount} words • {charCount} characters
                      </span>
                    </div>

                    {draft.trim() ? (
                      <div className="p-5 rounded-2xl bg-white dark:bg-darkSurface-elev2/30 border border-surface-border dark:border-darkSurface-border font-serif text-sm sm:text-base leading-relaxed text-surface-text dark:text-darkSurface-text whitespace-pre-line shadow-2xs">
                        {draft}
                      </div>
                    ) : (
                      <div className="p-8 rounded-2xl border border-dashed border-surface-border dark:border-darkSurface-border text-center space-y-1">
                        <p className="text-xs font-semibold text-surface-muted">
                          No written response was recorded for this module.
                        </p>
                        <p className="text-[11px] text-surface-muted">
                          You can review the benchmark model answer below to prepare for this topic.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Official SSC Evaluation Rubrics */}
                  {q.rubrics && q.rubrics.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-surface-text dark:text-darkSurface-text flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-amber-500" />
                        <span>Official Evaluation Rubrics</span>
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.rubrics.map((rubric, rIdx) => (
                          <div
                            key={rIdx}
                            className="p-3 rounded-xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 text-xs font-medium text-surface-text dark:text-darkSurface-text flex items-center gap-2"
                          >
                            <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold flex items-center justify-center shrink-0">
                              {rIdx + 1}
                            </span>
                            <span>{rubric}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Official SSC Model Solution */}
                  {q.modelSolution && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-brand-primary">
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Official SSC Model Benchmark Solution</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleExplanation(idx)}
                          className="text-xs font-bold text-brand-primary hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>{isExpanded ? 'Collapse Model Answer' : 'Expand Model Answer'}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="p-6 rounded-2xl bg-brand-primary/5 dark:bg-brand-primary/10 border border-brand-primary/20 space-y-3 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between text-[11px] font-bold text-brand-primary pb-2 border-b border-brand-primary/15">
                            <span>High-Scoring Standard Sample (Target Word Range Met)</span>
                            <span>Reference Standard</span>
                          </div>
                          <div className="text-xs sm:text-sm text-surface-text dark:text-darkSurface-text leading-relaxed whitespace-pre-line font-serif">
                            <LatexRenderer content={q.modelSolution} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════════════
           CBE OBJECTIVE RESULTS FLOW
           ═══════════════════════════════════════════════════════════════════ */
        <>
          {/* ── Score Cards Overview ──────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Main Net Score Card */}
            <div className="md:col-span-2 rounded-3xl bg-gradient-to-br from-brand-primary/10 via-brand-purple/5 to-transparent dark:from-brand-primary/20 dark:via-brand-purple/10 border border-brand-primary/20 p-6 sm:p-8 flex flex-col justify-between shadow-sm">
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-primary">
                  Net Score (After Negative Deductions)
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-extrabold font-display text-surface-text dark:text-darkSurface-text">
                    {result.totalScore}
                  </span>
                  <span className="text-sm font-semibold text-surface-muted dark:text-darkSurface-muted">
                    / {result.maxMarks} Marks
                  </span>
                </div>
                <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                  Calculated at +{paper.markingScheme.marksPerCorrect} marks per correct answer and -{paper.markingScheme.negativeMarks} marks per incorrect answer.
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-brand-primary/20 flex items-center justify-between text-xs">
                <span className="font-bold text-surface-text dark:text-darkSurface-text">
                  Accuracy: {result.accuracy}%
                </span>
                <span className="text-surface-muted">
                  Time Taken: {formatTime(result.timeSpentSeconds)}
                </span>
              </div>
            </div>

            {/* Detailed Breakdown Numbers */}
            <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 flex flex-col justify-between shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-surface-muted">
                Question Status
              </span>
              <div className="space-y-2 py-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Correct
                  </span>
                  <span className="font-bold">
                    {result.correctCount} (+{result.correctCount * paper.markingScheme.marksPerCorrect})
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-red-500 font-medium">
                    <XCircle className="w-3.5 h-3.5" /> Incorrect
                  </span>
                  <span className="font-bold">
                    {result.wrongCount} (-{result.wrongCount * paper.markingScheme.negativeMarks})
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-surface-muted font-medium">Unattempted</span>
                  <span className="font-bold">{result.unansweredCount}</span>
                </div>
              </div>
              <div className="text-[11px] text-surface-muted pt-2 border-t border-surface-border">
                Total Attempted: {result.correctCount + result.wrongCount} / {result.totalQuestions}
              </div>
            </div>

            {/* Percentile & Accuracy Metric */}
            <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 flex flex-col justify-between shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-surface-muted">
                Overall Accuracy
              </span>
              <div className="text-center my-auto py-2">
                <span className="text-4xl font-extrabold font-display text-emerald-600 dark:text-emerald-400">
                  {result.accuracy}%
                </span>
                <span className="block text-xs text-surface-muted mt-1">
                  Precision Rate
                </span>
              </div>
              <button
                onClick={handleShare}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-surface-border text-xs font-bold text-surface-muted hover:text-surface-text transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Result</span>
              </button>
            </div>
          </div>

          {/* ── Section-Wise Performance Table ────────────────────────────── */}
          <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 sm:p-8 shadow-sm space-y-4">
            <h3 className="text-base font-bold font-display text-surface-text dark:text-darkSurface-text">
              Section-Wise Performance Analysis
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-elev1 dark:bg-darkSurface-elev2 font-bold text-surface-muted border-b border-surface-border">
                  <tr>
                    <th className="p-3">Section</th>
                    <th className="p-3 text-center">Questions</th>
                    <th className="p-3 text-center">Attempted</th>
                    <th className="p-3 text-center text-emerald-600">Correct</th>
                    <th className="p-3 text-center text-red-500">Wrong</th>
                    <th className="p-3 text-center">Accuracy</th>
                    <th className="p-3 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border dark:divide-darkSurface-border font-medium">
                  {Object.values(result.sectionResults).map((sec) => (
                    <tr key={sec.sectionId} className="hover:bg-surface-elev1/40 transition-colors">
                      <td className="p-3 font-bold text-surface-text dark:text-darkSurface-text">
                        {sec.sectionName}
                      </td>
                      <td className="p-3 text-center text-surface-muted">{sec.totalQuestions}</td>
                      <td className="p-3 text-center">{sec.attempted}</td>
                      <td className="p-3 text-center text-emerald-600 font-bold">{sec.correct}</td>
                      <td className="p-3 text-center text-red-500 font-bold">{sec.wrong}</td>
                      <td className="p-3 text-center font-bold">
                        <span
                          className={`px-2 py-0.5 rounded-full ${
                            sec.accuracy >= 75
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : sec.accuracy >= 50
                              ? 'bg-amber-500/10 text-amber-600'
                              : 'bg-red-500/10 text-red-500'
                          }`}
                        >
                          {sec.accuracy}%
                        </span>
                      </td>
                      <td className="p-3 text-right font-extrabold text-brand-primary">
                        {sec.score} / {sec.maxMarks}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Question-by-Question Solution Review ───────────────────────── */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold font-display text-surface-text dark:text-darkSurface-text">
                  Detailed Question Review & Verified Solutions
                </h3>
                <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                  Review every answer with full mathematical derivations and explanations.
                </p>
              </div>

              {/* Review Filter Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Section Filter */}
                <select
                  value={selectedSectionFilter}
                  onChange={(e) => setSelectedSectionFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs font-semibold focus:outline-none"
                >
                  <option value="all">All Sections</option>
                  {paper.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                {/* Status Filter */}
                <div className="flex items-center gap-1 bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border rounded-xl p-1 text-xs">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'correct', label: 'Correct' },
                    { id: 'wrong', label: 'Wrong' },
                    { id: 'skipped', label: 'Skipped' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setSelectedStatusFilter(st.id)}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                        selectedStatusFilter === st.id
                          ? 'bg-brand-primary text-white shadow-sm'
                          : 'text-surface-muted hover:text-surface-text'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-4">
              {filteredQuestions.map(
                ({ q, idx, userChoice, isCorrect, isWrong, isSkipped, qMarks, qNegative }) => {
                  const isExpanded = expandedExplanations[idx] !== false; // expanded by default

                return (
                  <div
                    key={q.id}
                    className="rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-5 sm:p-6 shadow-sm space-y-4"
                  >
                    {/* Question Header Status */}
                    <div className="flex flex-wrap items-center justify-between pb-3 border-b border-surface-border dark:border-darkSurface-border gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-extrabold text-surface-text dark:text-darkSurface-text">
                          Q{idx + 1}.
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-muted text-[10px] font-bold">
                          {q.sectionName}
                        </span>
                        {q.questionType && (
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              q.questionType === 'MSQ'
                                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                                : q.questionType === 'NAT'
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                            }`}
                          >
                            {q.questionType}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {q.isMta ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full">
                            <Award className="w-3.5 h-3.5" />
                            <span>Marks to All (+{qMarks})</span>
                          </span>
                        ) : isCorrect ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Correct (+{qMarks})</span>
                          </span>
                        ) : isWrong ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-red-500 bg-red-500/10 px-2.5 py-0.5 rounded-full">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Wrong (-{qNegative})</span>
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-surface-muted bg-surface-elev2 dark:bg-darkSurface-elev2 px-2.5 py-0.5 rounded-full">
                            Unattempted (0)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Question Text */}
                    {q.questionText && q.questionText.trim().length > 0 && (
                      <div className="text-xs sm:text-sm text-surface-text dark:text-darkSurface-text leading-relaxed font-medium">
                        <LatexRenderer content={q.questionText} />
                      </div>
                    )}

                    {/* Diagram if available */}
                    {((q.diagramUrls && q.diagramUrls.length > 0) || q.diagramUrl) && (
                      <div className="my-2 space-y-2">
                        {(q.diagramUrls || [q.diagramUrl!]).map((url, dIdx) => (
                          <div
                            key={dIdx}
                            className="p-2.5 bg-white rounded-xl border border-surface-border shadow-2xs max-w-md mx-auto flex flex-col items-center group relative"
                          >
                            <img
                              src={url}
                              alt={`Diagram for Question ${idx + 1}`}
                              className="rounded-lg max-h-56 object-contain mx-auto cursor-zoom-in hover:opacity-95 transition-opacity"
                              onClick={() => setZoomImageUrl(url)}
                            />
                            <button
                              type="button"
                              onClick={() => setZoomImageUrl(url)}
                              className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-surface-muted hover:text-brand-primary transition-colors cursor-pointer"
                            >
                              <ZoomIn className="w-3 h-3" />
                              <span>Enlarge figure</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Question Options or Numerical Answer Review */}
                    {q.questionType === 'NAT' ? (
                      /* NAT Review Comparison */
                      <div className="p-4 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev1/40 dark:bg-darkSurface-elev2/30 space-y-3 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="p-3 rounded-lg bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border">
                            <span className="text-[10px] font-bold uppercase text-surface-muted block mb-1">
                              Your Entered Answer
                            </span>
                            <span
                              className={`font-mono font-bold text-sm ${
                                isCorrect
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : isWrong
                                  ? 'text-red-500'
                                  : 'text-surface-muted'
                              }`}
                            >
                              {session.userNatAnswers?.[idx] || 'Not Attempted'}
                            </span>
                          </div>
                          <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                            <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400 block mb-1">
                              Official Accepted Range
                            </span>
                            <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                              {q.correctAnswer}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : q.questionType === 'MSQ' ? (
                      /* MSQ Review Options */
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {q.options.map((optText, optIndex) => {
                          const optLetter = ['A', 'B', 'C', 'D'][optIndex];
                          const userMsq = session.userMsqAnswers?.[idx] || [];
                          const isUserPick = userMsq.includes(optIndex);
                          const isCorrectOpt = q.correctAnswerSet
                            ? q.correctAnswerSet.includes(optLetter)
                            : false;
                          const optImage = q.optionImages?.[optIndex];
                          const hasValidText =
                            optText &&
                            optText.trim().length > 0 &&
                            !/^Option\s*\([A-D]\)$/i.test(optText.trim());

                          let optStyle =
                            'bg-surface-elev1/40 dark:bg-darkSurface-elev2/40 border-surface-border/60 text-surface-muted';
                          if (isCorrectOpt) {
                            optStyle =
                              'bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold';
                          } else if (isUserPick && !isCorrectOpt) {
                            optStyle =
                              'bg-red-500/10 border-red-500 text-red-700 dark:text-red-300';
                          }

                          return (
                            <div
                              key={optIndex}
                              className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs transition-all ${optStyle}`}
                            >
                              <span
                                className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                                  isCorrectOpt
                                    ? 'bg-emerald-500 text-white'
                                    : isUserPick
                                    ? 'bg-red-500 text-white'
                                    : 'bg-surface-elev2 text-surface-muted'
                                }`}
                              >
                                {isUserPick ? '✓' : optLetter}
                              </span>
                              <div className="flex-1 pt-0.5 space-y-1.5">
                                {optImage && (
                                  <div className="inline-block p-1.5 bg-white rounded-lg border border-surface-border/70 shadow-2xs">
                                    <img
                                      src={optImage}
                                      alt={`Option ${optLetter} figure`}
                                      className="max-h-20 object-contain cursor-zoom-in"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setZoomImageUrl(optImage);
                                      }}
                                    />
                                  </div>
                                )}
                                {hasValidText && (
                                  <div>
                                    <LatexRenderer content={optText} />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Standard MCQ Option Choices */
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {q.options.map((optText, optIndex) => {
                          const optLetter = ['A', 'B', 'C', 'D'][optIndex];
                          const isCorrectOpt = optIndex === q.correctAnswerIndex;
                          const isUserPick = userChoice === optIndex;
                          const optImage = q.optionImages?.[optIndex];
                          const hasValidText =
                            optText &&
                            optText.trim().length > 0 &&
                            !/^Option\s*\([A-D]\)$/i.test(optText.trim());

                          let optStyle =
                            'bg-surface-elev1/40 dark:bg-darkSurface-elev2/40 border-surface-border/60 text-surface-muted';
                          if (isCorrectOpt) {
                            optStyle =
                              'bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold';
                          } else if (isUserPick && !isCorrectOpt) {
                            optStyle =
                              'bg-red-500/10 border-red-500 text-red-700 dark:text-red-300';
                          }

                          return (
                            <div
                              key={optIndex}
                              className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs transition-all ${optStyle}`}
                            >
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                                  isCorrectOpt
                                    ? 'bg-emerald-500 text-white'
                                    : isUserPick
                                    ? 'bg-red-500 text-white'
                                    : 'bg-surface-elev2 text-surface-muted'
                                }`}
                              >
                                {optLetter}
                              </span>
                              <div className="flex-1 pt-0.5 space-y-1.5">
                                {optImage && (
                                  <div className="inline-block p-1.5 bg-white rounded-lg border border-surface-border/70 shadow-2xs">
                                    <img
                                      src={optImage}
                                      alt={`Option ${optLetter} figure`}
                                      className="max-h-20 object-contain cursor-zoom-in"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setZoomImageUrl(optImage);
                                      }}
                                    />
                                  </div>
                                )}
                                {hasValidText && (
                                  <div>
                                    <LatexRenderer content={optText} />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Detailed Solution Box */}
                    <div className="pt-2">
                      <button
                        onClick={() => toggleExplanation(idx)}
                        className="flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:underline"
                      >
                        <span>{isExpanded ? 'Hide Solution' : 'View Verified Solution'}</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="mt-2.5 p-4 rounded-xl bg-brand-primary/5 dark:bg-brand-primary/10 border border-brand-primary/20 space-y-2 text-xs animate-in fade-in duration-200">
                          <span className="font-bold text-brand-primary flex items-center gap-1 text-[11px] uppercase tracking-wider">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Correct Answer:{' '}
                            {q.isMta ? 'Marks to All (MTA)' : q.questionType === 'NAT' ? `Range ${q.correctAnswer}` : `Option ${q.correctAnswer}`}
                          </span>
                          <div className="text-surface-text dark:text-darkSurface-text leading-relaxed whitespace-pre-line">
                            <LatexRenderer content={q.explanation} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredQuestions.length === 0 && (
                <div className="text-center py-12 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border text-surface-muted text-xs">
                  No questions match the current section and status filters.
                </div>
              )}
            </div>
          </div>
        </>
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
    </div>
  );
};
