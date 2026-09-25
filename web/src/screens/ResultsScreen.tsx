import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Award,
  Eye,
  Home,
  Share2,
  TrendingUp,
} from 'lucide-react';
import { TestSessionState } from '../types';
import { AdSlot } from '../components/ads/AdSlot';

interface ResultsScreenProps {
  session: TestSessionState;
  onReview: () => void;
  onRetake: () => void;
  onHome: () => void;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  session,
  onReview,
  onRetake,
  onHome,
}) => {
  const { questions, userAnswers, elapsedSeconds } = session;

  const total = questions.length;
  let correctCount = 0;
  let answeredCount = 0;

  questions.forEach((q, idx) => {
    const userChoice = userAnswers[idx];
    if (userChoice !== undefined) {
      answeredCount++;
      if (userChoice === q.correctAnswerIndex) {
        correctCount++;
      }
    }
  });

  const percent = total > 0 ? Math.round((correctCount * 100) / total) : 0;
  const wrongCount = answeredCount - correctCount;
  const skippedCount = total - answeredCount;

  // Trigger celebration confetti for high scores
  useEffect(() => {
    if (percent >= 70) {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#4F6EF7', '#9B4DFF', '#1DB974', '#FF9500'],
      });
    }
  }, [percent]);

  const getPerformanceBadge = () => {
    if (percent >= 90) return { label: 'Mastery Level 🏆', color: 'text-brand-green bg-emerald-500/10' };
    if (percent >= 70) return { label: 'Proficient Scholar ✨', color: 'text-brand-primary bg-brand-primary/10' };
    if (percent >= 50) return { label: 'Good Effort 👍', color: 'text-amber-500 bg-amber-500/10' };
    return { label: 'Needs Practice 📚', color: 'text-brand-red bg-red-500/10' };
  };

  const badge = getPerformanceBadge();

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  const handleShare = () => {
    const text = `🎯 I scored ${correctCount}/${total} (${percent}%) on "${session.title}" using MOCK.AI!`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      alert('Score summary copied to clipboard!');
    }
  };

  // Circular gauge calculations
  const strokeWidth = 14;
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-6 text-center animate-in zoom-in-95 duration-300">
      {/* ── Main Score Card ─────────────────────────────────────────── */}
      <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-8 shadow-sm">
        <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full mb-4 ${badge.color}`}>
          {badge.label}
        </span>

        {/* Circular Progress Gauge */}
        <div className="relative w-52 h-52 mx-auto flex items-center justify-center my-4">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
            <circle
              cx="100"
              cy="100"
              r={radius}
              className="text-surface-elev2 dark:text-darkSurface-elev2"
              strokeWidth={strokeWidth}
              stroke="currentColor"
              fill="transparent"
            />
            <circle
              cx="100"
              cy="100"
              r={radius}
              stroke="url(#scoreGradient)"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-1000 ease-out"
            />
            <defs>
              <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4F6EF7" />
                <stop offset="100%" stopColor="#9B4DFF" />
              </linearGradient>
            </defs>
          </svg>

          {/* Central Score Text */}
          <div className="absolute flex flex-col items-center justify-center">
            <span className="text-4xl sm:text-5xl font-display font-black text-surface-text dark:text-darkSurface-text">
              {percent}%
            </span>
            <span className="text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider mt-0.5">
              Accuracy
            </span>
          </div>
        </div>

        <h2 className="text-xl sm:text-2xl font-bold font-display text-surface-text dark:text-darkSurface-text mt-2">
          {session.title}
        </h2>
        <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-1">
          Exam completed in {formatTime(elapsedSeconds)}
        </p>

        {/* 4 Stat Boxes Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
          <div className="p-3.5 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border">
            <div className="flex items-center justify-center gap-1.5 text-xs text-brand-green font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Correct</span>
            </div>
            <span className="text-xl font-black text-surface-text dark:text-darkSurface-text mt-1 block">
              {correctCount}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border">
            <div className="flex items-center justify-center gap-1.5 text-xs text-brand-red font-bold">
              <XCircle className="w-4 h-4" />
              <span>Wrong</span>
            </div>
            <span className="text-xl font-black text-surface-text dark:text-darkSurface-text mt-1 block">
              {wrongCount}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border">
            <div className="flex items-center justify-center gap-1.5 text-xs text-amber-500 font-bold">
              <Clock className="w-4 h-4" />
              <span>Skipped</span>
            </div>
            <span className="text-xl font-black text-surface-text dark:text-darkSurface-text mt-1 block">
              {skippedCount}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border">
            <div className="flex items-center justify-center gap-1.5 text-xs text-brand-primary font-bold">
              <Clock className="w-4 h-4" />
              <span>Time</span>
            </div>
            <span className="text-base font-black text-surface-text dark:text-darkSurface-text mt-1 block">
              {formatTime(elapsedSeconds)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Performance Prediction & Learning Insight ────────────────── */}
      <div className="rounded-3xl bg-brand-primary/10 border border-brand-primary/20 p-5 text-left flex items-start gap-3">
        <TrendingUp className="w-5 h-5 text-brand-primary shrink-0 mt-0.5" />
        <div className="text-xs">
          <p className="font-bold text-surface-text dark:text-darkSurface-text">
            Performance Prediction & Readiness
          </p>
          <p className="text-surface-muted dark:text-darkSurface-muted mt-1 leading-relaxed">
            {percent >= 80
              ? 'Excellent conceptual retention. You are on track for high percentile placement in this subject.'
              : percent >= 50
              ? 'Solid foundational grasp. Focus on reviewing wrong items and verifying formula edge cases.'
              : 'Targeted revision advised. Re-read the source material and practice with untimed mode.'}
          </p>
        </div>
      </div>

      {/* ── Action Buttons ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <button
          onClick={onReview}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-brand-primary to-brand-variant text-white font-bold text-sm shadow-glow hover:brightness-110 active:scale-95 transition-all"
        >
          <Eye className="w-4 h-4" />
          <span>Review Answers</span>
        </button>

        <button
          onClick={onRetake}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-2xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-surface-text dark:text-darkSurface-text font-bold text-sm hover:bg-surface-elev2 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Re-take Exam</span>
        </button>

        <button
          onClick={handleShare}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-surface-border dark:border-darkSurface-border text-surface-muted hover:text-surface-text text-sm font-semibold transition-colors"
        >
          <Share2 className="w-4 h-4" />
          <span>Share</span>
        </button>

        <button
          onClick={onHome}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-surface-muted hover:text-surface-text text-sm font-semibold transition-colors"
        >
          <Home className="w-4 h-4" />
          <span>Back Home</span>
        </button>
      </div>

      {/* ── Sponsored Learning Space (Post-Test Resources) ───────────── */}
      <div className="mt-8 pt-4 border-t border-surface-border/40">
        <AdSlot placement="test_results_footer" format="responsive" />
      </div>
    </div>
  );
};
