import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Bookmark,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { TestSessionState } from '../types';
import { LatexRenderer } from '../components/LatexRenderer';
import { AdSlot } from '../components/ads/AdSlot';

interface ReviewScreenProps {
  session: TestSessionState;
  onBack: () => void;
}

export const ReviewScreen: React.FC<ReviewScreenProps> = ({ session, onBack }) => {
  const { questions, userAnswers, bookmarkedIndices } = session;
  const [selectedFilter, setSelectedFilter] = useState<string>('All');
  const [expandedExplanations, setExpandedExplanations] = useState<Record<number, boolean>>({});

  const filters = ['All', 'Correct ✓', 'Wrong ✗', 'Skipped ⏭', 'Bookmarked 🔖'];

  const toggleExplanation = (index: number) => {
    setExpandedExplanations((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const filteredQuestions = questions
    .map((q, idx) => {
      const userChoice = userAnswers[idx];
      const isCorrect = userChoice === q.correctAnswerIndex;
      const isSkipped = userChoice === undefined;
      const isBookmarked = bookmarkedIndices.includes(idx);
      return { q, idx, userChoice, isCorrect, isSkipped, isBookmarked };
    })
    .filter((item) => {
      if (selectedFilter === 'Correct ✓') return item.isCorrect;
      if (selectedFilter === 'Wrong ✗') return !item.isCorrect && !item.isSkipped;
      if (selectedFilter === 'Skipped ⏭') return item.isSkipped;
      if (selectedFilter === 'Bookmarked 🔖') return item.isBookmarked;
      return true;
    });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6 animate-in fade-in duration-200">
      {/* ── Top Bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-2 border-b border-surface-border dark:border-darkSurface-border">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-surface-muted hover:text-surface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold font-display text-surface-text dark:text-darkSurface-text">
              Review Exam Answers
            </h1>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
              {session.title} • {questions.length} Questions
            </p>
          </div>
        </div>
      </div>

      {/* ── Filter Chips ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {filters.map((flt) => (
          <button
            key={flt}
            onClick={() => setSelectedFilter(flt)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all ${
              selectedFilter === flt
                ? 'bg-brand-primary text-white shadow-sm'
                : 'bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border text-surface-muted hover:text-surface-text'
            }`}
          >
            {flt}
          </button>
        ))}
      </div>

      {/* ── Questions Review List ─────────────────────────────────────── */}
      <div className="space-y-4">
        {filteredQuestions.length === 0 ? (
          <div className="text-center py-12 text-surface-muted text-sm">
            No questions match the filter "{selectedFilter}".
          </div>
        ) : (
          filteredQuestions.map(({ q, idx, userChoice, isCorrect, isSkipped, isBookmarked }, arrayIndex) => {
            const isExpanded = expandedExplanations[idx] !== false; // expanded by default or toggled
            const shouldShowAd = (arrayIndex + 1) % 5 === 0 && arrayIndex < filteredQuestions.length - 1;

            let statusBadge = (
              <span className="flex items-center gap-1 text-xs font-bold text-brand-green bg-emerald-500/10 px-2.5 py-1 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Correct</span>
              </span>
            );

            if (isSkipped) {
              statusBadge = (
                <span className="flex items-center gap-1 text-xs font-bold text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Skipped</span>
                </span>
              );
            } else if (!isCorrect) {
              statusBadge = (
                <span className="flex items-center gap-1 text-xs font-bold text-brand-red bg-red-500/10 px-2.5 py-1 rounded-full">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Incorrect</span>
                </span>
              );
            }

            return (
              <React.Fragment key={idx}>
                <div
                  className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 shadow-sm space-y-4"
                >
                {/* Card Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 font-black text-xs flex items-center justify-center text-surface-text dark:text-darkSurface-text">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-surface-muted dark:text-darkSurface-muted">
                      {q.topic || 'Concept Review'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isBookmarked && (
                      <span className="text-[11px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Bookmark className="w-3 h-3 fill-amber-500" />
                        <span>Bookmarked</span>
                      </span>
                    )}
                    {statusBadge}
                  </div>
                </div>

                {/* Question Statement */}
                <div className="text-sm sm:text-base font-bold text-surface-text dark:text-darkSurface-text leading-relaxed">
                  <LatexRenderer content={q.questionText} />
                </div>

                {/* Options List */}
                <div className="space-y-2 pt-1">
                  {q.options.map((opt, optIdx) => {
                    const isCorrectAnswer = optIdx === q.correctAnswerIndex;
                    const isUserChoice = userChoice === optIdx;
                    const letter = String.fromCharCode(65 + optIdx);

                    let cardClass =
                      'bg-surface-elev2 dark:bg-darkSurface-elev2 border-surface-border dark:border-darkSurface-border text-surface-muted';
                    let letterClass =
                      'bg-white dark:bg-darkSurface-elev1 text-surface-muted border border-surface-border dark:border-darkSurface-border';

                    if (isCorrectAnswer) {
                      cardClass =
                        'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold';
                      letterClass = 'bg-brand-green text-white';
                    } else if (isUserChoice && !isCorrect) {
                      cardClass =
                        'bg-red-500/10 border-red-500/40 text-red-700 dark:text-red-300 font-semibold';
                      letterClass = 'bg-brand-red text-white';
                    }

                    return (
                      <div
                        key={optIdx}
                        className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all ${cardClass}`}
                      >
                        <div
                          className={`w-7 h-7 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 ${letterClass}`}
                        >
                          {letter}
                        </div>
                        <div className="min-w-0 flex-1 text-xs sm:text-sm">
                          <LatexRenderer content={opt} />
                        </div>
                        {isCorrectAnswer && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider shrink-0">
                            ✓ Correct Key
                          </span>
                        )}
                        {isUserChoice && !isCorrect && (
                          <span className="text-[10px] font-bold text-brand-red uppercase tracking-wider shrink-0">
                            ✗ Your Answer
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Solution & Step-by-Step Explanation */}
                <div className="pt-2">
                  <button
                    onClick={() => toggleExplanation(idx)}
                    className="flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:text-brand-variant transition-colors"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>{isExpanded ? 'Hide Solution Explanation' : 'Show Solution Explanation'}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-2.5 p-4 rounded-2xl bg-brand-primary/5 border border-brand-primary/15 text-xs sm:text-sm text-surface-text dark:text-darkSurface-text leading-relaxed animate-in fade-in duration-150">
                      <p className="font-bold text-brand-primary mb-1 text-xs uppercase tracking-wider">
                        Explanation & Core Derivation:
                      </p>
                      <LatexRenderer
                        content={
                          q.explanation ||
                          'This answer follows directly from the fundamental definitions and standard governing equations of the concept.'
                        }
                      />

                      {/* Source Citation if present */}
                      {q.citation && (
                        <div className="mt-3 pt-2 border-t border-brand-primary/15 text-[11px] text-surface-muted dark:text-darkSurface-muted">
                          <span className="font-bold">Source Reference: </span>
                          <span>"{q.citation.sourceExactText}"</span>
                          {q.citation.pageNumber && <span> (Page {q.citation.pageNumber})</span>}
                          {q.citation.youtubeTimestamp && (
                            <span> (Timestamp: {q.citation.youtubeTimestamp})</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {shouldShowAd && (
                <div className="py-2">
                  <AdSlot placement="review_inline" format="inline" />
                </div>
              )}
            </React.Fragment>
          );
        })
        )}
      </div>
    </div>
  );
};
