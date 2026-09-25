import React, { useState } from 'react';
import {
  Sparkles,
  Plus,
  Play,
  Edit3,
  Share2,
  Trash2,
  Upload,
  CheckCircle2,
  Circle,
  Clock,
  TrendingUp,
  Search,
  BookOpen,
  Store,
  Flame,
  ChevronRight,
  Target,
  AlertCircle,
} from 'lucide-react';
import { TestHistory, DailyTask, DailyInsight, UserProfile, ExamTestSession } from '../types';
import { AdSlot } from '../components/ads/AdSlot';

interface HomeScreenProps {
  tests: TestHistory[];
  profile: UserProfile;
  streakCount: number;
  dailyTasks: DailyTask[];
  dailyInsight: DailyInsight;
  activeSessions?: ExamTestSession[];
  onResumeSession?: (session: ExamTestSession) => void;
  onDiscardSession?: (sessionId: string) => void;
  onToggleTask: (taskId: string) => void;
  onOpenCreateModal: () => void;
  onStartTest: (test: TestHistory) => void;
  onEditTest: (test: TestHistory) => void;
  onDeleteTest: (testId: string) => void;
  onPublishTest?: (test: TestHistory) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  tests,
  profile,
  streakCount,
  dailyTasks,
  dailyInsight,
  activeSessions = [],
  onResumeSession,
  onDiscardSession,
  onToggleTask,
  onOpenCreateModal,
  onStartTest,
  onEditTest,
  onDeleteTest,
  onPublishTest,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Calculate statistics
  const completedTests = tests.filter((t) => t.lastTakenAt !== null);
  const avgScore =
    completedTests.length > 0
      ? Math.round(
          completedTests.reduce((acc, t) => acc + (t.bestScorePercent || 0), 0) /
            completedTests.length
        )
      : 0;

  const unfinishedTest = tests.find((t) => t.lastTakenAt === null);

  const categories = ['All', ...Array.from(new Set(tests.map((t) => t.category)))];

  const filteredTests = tests.filter((t) => {
    const matchesCategory = selectedCategory === 'All' || t.category === selectedCategory;
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleShare = (test: TestHistory) => {
    const jsonStr = JSON.stringify(test, null, 2);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(jsonStr);
      alert(`Test "${test.title}" copied to clipboard as JSON!`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 space-y-8 animate-in fade-in duration-300">
      {/* ── Header & Key Stats ────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-primary/10 via-brand-variant/10 to-transparent p-6 sm:p-8 border border-brand-primary/15">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-bold uppercase tracking-wider mb-2">
              <span>👋 Welcome back, {profile.fullName || 'Scholar'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-display font-black text-surface-text dark:text-darkSurface-text">
              Master Your Exams with AI
            </h1>
            <p className="text-sm sm:text-base text-surface-muted dark:text-darkSurface-muted mt-1 max-w-xl">
              Turn lecture notes, textbooks, YouTube videos, and syllabus topics into adaptive, anxiety-free mock tests.
            </p>
          </div>

          {/* Quick Stats Chips */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
            <div className="flex-1 sm:flex-none px-4 py-3 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm text-center">
              <span className="text-xs text-surface-muted dark:text-darkSurface-muted font-medium block">
                Total Tests
              </span>
              <span className="text-xl sm:text-2xl font-black text-surface-text dark:text-darkSurface-text">
                {tests.length}
              </span>
            </div>

            <div className="flex-1 sm:flex-none px-4 py-3 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm text-center">
              <span className="text-xs text-surface-muted dark:text-darkSurface-muted font-medium block">
                Avg. Score
              </span>
              <span className="text-xl sm:text-2xl font-black text-brand-primary">
                {avgScore}%
              </span>
            </div>

            <div className="flex-1 sm:flex-none px-4 py-3 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm text-center">
              <span className="text-xs text-surface-muted dark:text-darkSurface-muted font-medium block">
                Study Streak
              </span>
              <div className="flex items-center justify-center gap-1 text-xl sm:text-2xl font-black text-amber-500">
                <Flame className="w-5 h-5 fill-amber-500" />
                <span>{streakCount}d</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Daily AI Insight & Hero Create Button ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily AI Insight Card */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-primary to-brand-variant flex items-center justify-center text-white shadow-glow shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-primary">
                  Daily AI Learning Coach
                </span>
                <h3 className="font-bold text-base sm:text-lg text-surface-text dark:text-darkSurface-text">
                  {dailyInsight.title}
                </h3>
              </div>
            </div>
            <span className="text-xs text-surface-muted dark:text-darkSurface-muted font-mono hidden sm:inline">
              {dailyInsight.dateStr}
            </span>
          </div>

          <p className="text-sm text-surface-muted dark:text-darkSurface-muted mt-3 leading-relaxed">
            {dailyInsight.summary}
          </p>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-surface-border dark:border-darkSurface-border">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-surface-muted dark:text-darkSurface-muted">Recommended Focus:</span>
              <span className="font-bold text-brand-primary bg-brand-primary/10 px-2.5 py-0.5 rounded-full">
                {dailyInsight.focusArea}
              </span>
            </div>
            <button
              onClick={onOpenCreateModal}
              className="text-xs font-bold text-brand-primary hover:text-brand-variant flex items-center gap-1"
            >
              <span>Practice now</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Hero "Create Test" CTA */}
        <div
          onClick={onOpenCreateModal}
          className="group cursor-pointer rounded-3xl bg-gradient-to-br from-brand-primary via-indigo-600 to-brand-variant p-6 text-white shadow-xl hover:shadow-glow hover:scale-[1.01] active:scale-[0.99] transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white mb-4 group-hover:rotate-12 transition-transform">
              <Plus className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold font-display">Generate New Test</h3>
            <p className="text-xs text-white/80 mt-1">
              Upload PDF, lecture notes, YouTube link, or type any subject for instant exam questions.
            </p>
          </div>

          <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/20">
            <span className="text-xs font-semibold uppercase tracking-wider">10 Ingestion Sources</span>
            <div className="w-8 h-8 rounded-full bg-white text-brand-primary flex items-center justify-center shadow-md">
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Today's Tasks Checklist ──────────────────────────────────── */}
      <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-brand-primary" />
            <h3 className="font-bold text-base sm:text-lg text-surface-text dark:text-darkSurface-text">
              Today's Study Checklist
            </h3>
          </div>
          <span className="text-xs font-bold text-surface-muted dark:text-darkSurface-muted">
            {dailyTasks.filter((t) => t.isDone).length} of {dailyTasks.length} completed
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {dailyTasks.map((task) => (
            <div
              key={task.id}
              onClick={() => onToggleTask(task.id)}
              className={`cursor-pointer flex items-center gap-3 p-3.5 rounded-2xl border transition-all ${
                task.isDone
                  ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  : 'bg-surface-elev2 dark:bg-darkSurface-elev2 border-surface-border dark:border-darkSurface-border text-surface-text dark:text-darkSurface-text hover:border-brand-primary'
              }`}
            >
              {task.isDone ? (
                <CheckCircle2 className="w-5 h-5 text-brand-green shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-surface-muted dark:text-darkSurface-muted shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={`text-xs sm:text-sm font-semibold truncate ${
                    task.isDone ? 'line-through opacity-80' : ''
                  }`}
                >
                  {task.title}
                </p>
                <span className="text-[10px] text-surface-muted dark:text-darkSurface-muted block">
                  {task.description}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Continue Test Section (Persistent Saved Tests) ───────────── */}
      {activeSessions && activeSessions.length > 0 && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-brand-primary animate-pulse" />
              <h2 className="text-xl font-bold font-display text-surface-text dark:text-darkSurface-text">
                Continue Tests ({activeSessions.length})
              </h2>
            </div>
            <span className="text-xs text-surface-muted dark:text-darkSurface-muted">
              Resume in-progress mock exams exactly where you left off
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeSessions.map((sess) => {
              // Calculate answered count
              let answeredCount = 0;
              if (sess.questionStatuses) {
                Object.values(sess.questionStatuses).forEach((st) => {
                  if (st === 'ANSWERED' || st === 'ANSWERED_AND_MARKED_FOR_REVIEW') {
                    answeredCount++;
                  }
                });
              } else if (sess.userAnswers) {
                answeredCount = Object.keys(sess.userAnswers).length;
              }

              const totalQuestions = Object.keys(sess.questionStatuses || {}).length || 100;
              const percent = Math.min(100, Math.round((answeredCount / totalQuestions) * 100));

              // Time formatting
              const safeTime = Number.isFinite(sess.timeRemainingSeconds) && sess.timeRemainingSeconds >= 0
                ? Math.floor(sess.timeRemainingSeconds)
                : (sess.durationSeconds || 3600);
              const mins = Math.floor(safeTime / 60);
              const secs = safeTime % 60;
              const timeFormatted = `${mins}:${secs.toString().padStart(2, '0')}`;

              // Relative last saved time
              const elapsedMinutes = Math.max(0, Math.floor((Date.now() - (sess.lastSavedAt || sess.startedAt)) / 60000));
              const lastSavedStr =
                elapsedMinutes < 1
                  ? 'Just now'
                  : elapsedMinutes === 1
                  ? '1 minute ago'
                  : elapsedMinutes < 60
                  ? `${elapsedMinutes} minutes ago`
                  : `${Math.floor(elapsedMinutes / 60)} hours ago`;

              return (
                <div
                  key={sess.sessionId}
                  className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-brand-primary/25 hover:border-brand-primary p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-brand-primary/10 text-brand-primary font-extrabold text-[11px] uppercase tracking-wider">
                        {sess.examId === 'gate' ? 'GATE' : 'SSC CHSL'} {sess.tier ? `• ${sess.tier}` : ''}
                      </span>
                      <span className="text-[11px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full uppercase">
                        {sess.status}
                      </span>
                    </div>

                    <h3 className="font-bold text-sm sm:text-base text-surface-text dark:text-darkSurface-text line-clamp-2">
                      {sess.paperTitle}
                    </h3>

                    {(sess.examDate || sess.shift) && (
                      <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                        {[sess.examDate, sess.shift].filter(Boolean).join(' • ')}
                      </p>
                    )}
                  </div>

                  {/* Progress & Timing */}
                  <div className="space-y-2 pt-2 border-t border-surface-border dark:border-darkSurface-border text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-surface-muted">Progress:</span>
                      <span className="font-bold text-surface-text dark:text-darkSurface-text">
                        {answeredCount} / {totalQuestions} answered
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full h-2 rounded-full bg-surface-elev2 dark:bg-darkSurface-elev2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-brand-primary to-brand-variant rounded-full transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-surface-muted pt-1">
                      <div className="flex items-center gap-1.5 font-mono font-bold text-surface-text dark:text-darkSurface-text">
                        <Clock className="w-3.5 h-3.5 text-brand-primary" />
                        <span>Time left: {timeFormatted}</span>
                      </div>
                      <span className="text-[11px] text-surface-muted">
                        Saved: {lastSavedStr}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2">
                    {onDiscardSession && (
                      <button
                        onClick={() => {
                          if (window.confirm('Discard this test attempt? Progress will be permanently lost.')) {
                            onDiscardSession(sess.sessionId);
                          }
                        }}
                        className="p-2 rounded-xl text-surface-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Discard Test"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => onResumeSession?.(sess)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white font-bold text-xs sm:text-sm shadow-md hover:brightness-110 active:scale-95 transition-all"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>Resume Test</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Resume Unfinished Test (if any) ───────────────────────────── */}
      {unfinishedTest && (
        <div className="rounded-3xl bg-amber-500/10 border border-amber-500/25 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <Play className="w-5 h-5 fill-white" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                Unattempted Test Ready
              </span>
              <h4 className="font-bold text-sm sm:text-base text-surface-text dark:text-darkSurface-text">
                {unfinishedTest.title}
              </h4>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                {unfinishedTest.questions.length} Questions • {unfinishedTest.category}
              </p>
            </div>
          </div>
          <button
            onClick={() => onStartTest(unfinishedTest)}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs sm:text-sm shadow-md transition-colors self-start sm:self-auto"
          >
            Start Test Now
          </button>
        </div>
      )}

      {/* ── Your Tests Section ───────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold font-display text-surface-text dark:text-darkSurface-text">
              Your Tests ({tests.length})
            </h2>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
              Select any test to start practice, edit questions, or review analytics
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-surface-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
            />
          </div>
        </div>

        {/* Category Filter Pills */}
        {categories.length > 2 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-all ${
                  selectedCategory === cat
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border text-surface-muted hover:text-surface-text'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Tests Grid */}
        {filteredTests.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-3xl border border-dashed border-surface-border dark:border-darkSurface-border">
            <BookOpen className="w-12 h-12 text-surface-muted mx-auto mb-3 opacity-50" />
            <h3 className="font-bold text-base text-surface-text dark:text-darkSurface-text">
              No tests found
            </h3>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-1 max-w-sm mx-auto">
              Create your first test using any PDF, doc, YouTube link, or topic.
            </p>
            <button
              onClick={onOpenCreateModal}
              className="mt-4 px-5 py-2.5 rounded-xl bg-brand-primary text-white font-bold text-xs shadow-md hover:brightness-110"
            >
              + Create Test
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTests.map((test) => {
              const hasScore = test.bestScorePercent !== null;

              return (
                <div
                  key={test.id}
                  className="group relative rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border hover:border-brand-primary/50 shadow-sm hover:shadow-card p-5 flex flex-col justify-between transition-all"
                >
                  <div>
                    {/* Top Row: Category + Question Count */}
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-brand-primary/10 text-brand-primary">
                        {test.category || 'General'}
                      </span>
                      <span className="text-xs font-medium text-surface-muted dark:text-darkSurface-muted flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>{test.questions.length} Questions</span>
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="font-bold text-base text-surface-text dark:text-darkSurface-text group-hover:text-brand-primary transition-colors line-clamp-2">
                      {test.title}
                    </h3>

                    {/* Best Score or Unattempted Status */}
                    <div className="mt-3">
                      {hasScore ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-surface-muted dark:text-darkSurface-muted">
                              Best Score:
                            </span>
                            <span className="font-bold text-brand-primary">
                              {test.bestScore} / {test.bestTotal} ({test.bestScorePercent}%)
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-surface-elev2 dark:bg-darkSurface-elev2 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-variant"
                              style={{ width: `${test.bestScorePercent}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-amber-500 font-semibold flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Not taken yet</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between mt-5 pt-3 border-t border-surface-border dark:border-darkSurface-border">
                    <button
                      onClick={() => onStartTest(test)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition-all"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>{hasScore ? 'Re-take' : 'Start'}</span>
                    </button>

                    <div className="flex items-center gap-1 text-surface-muted">
                      <button
                        onClick={() => onEditTest(test)}
                        title="Edit in Studio"
                        className="p-1.5 rounded-lg hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 hover:text-brand-primary transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleShare(test)}
                        title="Share / Copy JSON"
                        className="p-1.5 rounded-lg hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 hover:text-brand-primary transition-colors"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete test "${test.title}"?`)) {
                            onDeleteTest(test.id);
                          }
                        }}
                        title="Delete test"
                        className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-brand-red transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Sponsored Learning Space (Non-Test Feed Banner) ────────── */}
        <div className="mt-8">
          <AdSlot placement="home_banner" />
        </div>
      </div>
    </div>
  );
};
