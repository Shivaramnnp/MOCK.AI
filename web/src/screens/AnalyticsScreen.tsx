import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Award,
  AlertTriangle,
  Clock,
  CheckCircle,
  Play,
  Flame,
  BarChart2,
  Filter,
  Calendar,
  Layers,
  ChevronRight,
  BookOpen,
  ArrowUpRight,
  Sparkles,
  Info,
} from 'lucide-react';
import { TestHistory } from '../types';
import { AdSlot } from '../components/ads/AdSlot';
import { AnalyticsService, TrendPoint, ReadinessTier } from '../services/analyticsService';

interface AnalyticsScreenProps {
  tests: TestHistory[];
  streakCount: number;
  userId?: string;
  onPracticeTopic: (topic: string) => void;
  onNavigateExplore?: () => void;
  onReviewTest?: (testId: string, isCompetitive: boolean, paperId?: string) => void;
}

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({
  tests,
  streakCount,
  userId = 'guest',
  onPracticeTopic,
  onNavigateExplore,
  onReviewTest,
}) => {
  const [selectedExamId, setSelectedExamId] = useState<string>('all');
  const [selectedDateRange, setSelectedDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('all');
  const [hoveredPoint, setHoveredPoint] = useState<TrendPoint | null>(null);

  // Compute analytics dynamically from authoritative service
  const analyticsData = useMemo(() => {
    return AnalyticsService.getUserAnalytics(userId, {
      examId: selectedExamId,
      dateRange: selectedDateRange,
    });
  }, [userId, selectedExamId, selectedDateRange, tests]);

  const { summary, trend, topics, weakTopics, recentTests, availableExams } = analyticsData;

  const isZeroState = summary.testsAttempted === 0;
  const isCalibrating = summary.readinessTier === 'Calibrating';

  // Helper for readiness tier styling
  const getReadinessBadge = (tier: ReadinessTier) => {
    switch (tier) {
      case 'Mastery':
        return {
          bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          dot: 'bg-emerald-500',
        };
      case 'Competitive':
        return {
          bg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
          dot: 'bg-blue-500',
        };
      case 'Developing':
        return {
          bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
          dot: 'bg-amber-500',
        };
      case 'Needs Attention':
        return {
          bg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
          dot: 'bg-rose-500',
        };
      case 'Calibrating':
        return {
          bg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
          dot: 'bg-purple-500',
        };
      default:
        return {
          bg: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
          dot: 'bg-slate-400',
        };
    }
  };

  const badgeStyle = getReadinessBadge(summary.readinessTier);

  // Format seconds to human readable
  const formatDuration = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-8 animate-in fade-in duration-300">
      {/* ── Screen Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-surface-border dark:border-darkSurface-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">📈</span>
            <h1 className="text-2xl sm:text-3xl font-bold font-display text-surface-text dark:text-darkSurface-text">
              Performance Analytics
            </h1>
          </div>
          <p className="text-sm text-surface-muted dark:text-darkSurface-muted mt-0.5">
            Authoritative, data-driven tracking of your exam accuracy, section mastery, and weak spots
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 font-bold text-xs">
            <Flame className="w-4 h-4 fill-amber-500" />
            <span>{streakCount} Day Streak Active</span>
          </div>
        </div>
      </div>

      {/* ── Filter Controls Bar ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-xs">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-surface-muted dark:text-darkSurface-muted shrink-0" />
          <span className="text-xs font-semibold text-surface-muted dark:text-darkSurface-muted">
            Filters:
          </span>

          {/* Exam Filter Dropdown */}
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-surface-elev1 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text focus:outline-hidden focus:border-brand-primary cursor-pointer"
          >
            {availableExams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.name} {exam.count > 0 ? `(${exam.count})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Date Range Selector */}
        <div className="flex items-center gap-1 self-start sm:self-auto">
          {(
            [
              { id: '7d', label: '7D' },
              { id: '30d', label: '30D' },
              { id: '90d', label: '90D' },
              { id: 'all', label: 'All Time' },
            ] as const
          ).map((range) => (
            <button
              key={range.id}
              onClick={() => setSelectedDateRange(range.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                selectedDateRange === range.id
                  ? 'bg-brand-primary text-white shadow-xs'
                  : 'text-surface-muted dark:text-darkSurface-muted hover:text-surface-text dark:hover:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── ZERO-DATA EMPTY STATE ─────────────────────────────────────── */}
      {isZeroState && (
        <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-8 sm:p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center mx-auto mb-4">
            <BarChart2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-display text-surface-text dark:text-darkSurface-text mb-2">
            No Test Attempts Yet
          </h2>
          <p className="text-sm text-surface-muted dark:text-darkSurface-muted max-w-lg mx-auto mb-6">
            Take a previous-year competitive exam or generate a custom AI mock test to begin tracking your
            overall accuracy, section mastery, and high-frequency error patterns.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {onNavigateExplore && (
              <button
                onClick={onNavigateExplore}
                className="px-5 py-2.5 rounded-xl bg-brand-primary text-white font-bold text-sm hover:bg-brand-primary/90 transition-all flex items-center gap-2 shadow-xs"
              >
                <BookOpen className="w-4 h-4" />
                <span>Explore Competitive Exams</span>
              </button>
            )}
            <button
              onClick={() => onPracticeTopic('General Aptitude')}
              className="px-5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border font-bold text-sm text-surface-text dark:text-darkSurface-text hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              <span>Start Practice Quiz</span>
            </button>
          </div>
        </div>
      )}

      {/* ── 4 KEY PERFORMANCE METRICS ─────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Tests Attempted */}
        <div className="p-5 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-xs">
          <span className="text-xs font-bold text-surface-muted dark:text-darkSurface-muted block uppercase tracking-wider">
            Tests Attempted
          </span>
          <span className="text-2xl sm:text-3xl font-black text-surface-text dark:text-darkSurface-text mt-1 block">
            {summary.testsAttempted}
          </span>
          <span className="text-[11px] text-surface-muted dark:text-darkSurface-muted font-medium mt-1 block">
            {summary.testsAttempted > 0
              ? `${summary.attemptRate}% questions attempted`
              : '0 completed sessions'}
          </span>
        </div>

        {/* Metric 2: Overall Accuracy */}
        <div className="p-5 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-xs">
          <span className="text-xs font-bold text-surface-muted dark:text-darkSurface-muted block uppercase tracking-wider">
            Overall Accuracy
          </span>
          <span className="text-2xl sm:text-3xl font-black text-brand-primary mt-1 block">
            {summary.testsAttempted > 0 ? `${summary.overallAccuracy}%` : '—'}
          </span>
          <span className="text-[11px] text-surface-muted dark:text-darkSurface-muted font-medium mt-1 block">
            {summary.testsAttempted > 0
              ? `${summary.totalCorrect} correct of ${summary.questionsAttempted} answered`
              : 'Target: 85%+'}
          </span>
        </div>

        {/* Metric 3: Questions Practiced */}
        <div className="p-5 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-xs">
          <span className="text-xs font-bold text-surface-muted dark:text-darkSurface-muted block uppercase tracking-wider">
            Questions Practiced
          </span>
          <span className="text-2xl sm:text-3xl font-black text-brand-variant mt-1 block">
            {summary.questionsAttempted}
          </span>
          <span className="text-[11px] text-surface-muted dark:text-darkSurface-muted font-medium mt-1 block">
            {summary.testsAttempted > 0
              ? `${summary.totalWrong} errors recorded`
              : 'Across 0 tests'}
          </span>
        </div>

        {/* Metric 4: Readiness Tier */}
        <div className="p-5 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-xs">
          <span className="text-xs font-bold text-surface-muted dark:text-darkSurface-muted block uppercase tracking-wider">
            Readiness Tier
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xl sm:text-2xl font-black text-surface-text dark:text-darkSurface-text">
              {summary.readinessTier}
            </span>
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${badgeStyle.dot}`} />
          </div>
          <span className="text-[11px] text-surface-muted dark:text-darkSurface-muted font-medium mt-1 block line-clamp-1" title={summary.readinessDescription}>
            {summary.readinessDescription}
          </span>
        </div>
      </div>

      {/* ── CALIBRATING BANNER ────────────────────────────────────────── */}
      {isCalibrating && (
        <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-start gap-3">
          <Info className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
          <div className="text-xs text-purple-900 dark:text-purple-200">
            <span className="font-bold">Readiness Calibration Active: </span>
            {summary.readinessDescription} Complete more mock exams to establish accurate percentile benchmarking and robust topic error frequency.
          </div>
        </div>
      )}

      {/* ── PERFORMANCE TREND CHART ───────────────────────────────────── */}
      {!isZeroState && (
        <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h3 className="font-bold text-lg text-surface-text dark:text-darkSurface-text">
                Accuracy Trend Over Recent Tests
              </h3>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                Chronological accuracy (%) across your completed mock tests
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-surface-muted dark:text-darkSurface-muted">
                <span className="inline-block w-3 h-0.5 bg-emerald-500 stroke-dashed" />
                <span>85% Benchmark</span>
              </div>
              <span className="text-xs font-bold text-brand-primary bg-brand-primary/10 px-3 py-1 rounded-full">
                {trend.length} {trend.length === 1 ? 'Test' : 'Tests'} Recorded
              </span>
            </div>
          </div>

          {/* SVG Line Chart */}
          <div className="h-64 w-full relative">
            {trend.length === 1 ? (
              // Single Test Presentation (Prevent 0/0 NaN)
              <div className="h-full flex flex-col items-center justify-center text-center p-4">
                <div className="p-4 rounded-2xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border max-w-md w-full">
                  <span className="text-xs font-bold text-brand-primary block uppercase">
                    Initial Baseline Recorded
                  </span>
                  <span className="text-3xl font-black text-surface-text dark:text-darkSurface-text mt-1 block">
                    {trend[0].accuracy}% Accuracy
                  </span>
                  <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-1 font-medium">
                    {trend[0].title} ({trend[0].formattedDate})
                  </p>
                  <div className="mt-3 pt-3 border-t border-surface-border dark:border-darkSurface-border text-[11px] text-surface-muted dark:text-darkSurface-muted">
                    Take your second test to establish your multi-point accuracy progression curve!
                  </div>
                </div>
              </div>
            ) : (
              // Multi-Point SVG Chart
              <svg
                className="w-full h-full overflow-visible"
                viewBox="0 0 600 200"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4F6EF7" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#4F6EF7" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid lines (25%, 50%, 75%, 100%) */}
                {[
                  { y: 30, label: '100%' },
                  { y: 70, label: '75%' },
                  { y: 110, label: '50%' },
                  { y: 150, label: '25%' },
                ].map((g) => (
                  <g key={g.y}>
                    <line
                      x1="30"
                      y1={g.y}
                      x2="590"
                      y2={g.y}
                      stroke="currentColor"
                      className="text-surface-border dark:text-darkSurface-border stroke-1 stroke-dashed opacity-50"
                    />
                    <text
                      x="24"
                      y={g.y + 3}
                      textAnchor="end"
                      fill="currentColor"
                      className="text-[9px] fill-surface-muted dark:fill-darkSurface-muted font-mono"
                    >
                      {g.label}
                    </text>
                  </g>
                ))}

                {/* 85% Target Benchmark Reference Line */}
                <line
                  x1="30"
                  y1={180 - (85 / 100) * 160}
                  x2="590"
                  y2={180 - (85 / 100) * 160}
                  stroke="#10B981"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  className="opacity-70"
                />

                {/* Chart Path and Points */}
                {(() => {
                  const pointsCount = trend.length;
                  const pts = trend.map((point, i) => {
                    const x = 40 + (i / (pointsCount - 1)) * 540;
                    const y = 180 - (point.accuracy / 100) * 150;
                    return { x, y, point };
                  });

                  const ptsString = pts.map((p) => `${p.x},${p.y}`).join(' L ');
                  const firstX = pts[0].x;
                  const lastX = pts[pts.length - 1].x;
                  const areaPath = `M ${firstX},180 L ${ptsString} L ${lastX},180 Z`;
                  const linePath = `M ${ptsString}`;

                  return (
                    <>
                      <path d={areaPath} fill="url(#chartGradient)" />
                      <path
                        d={linePath}
                        fill="none"
                        stroke="#4F6EF7"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {pts.map((p, i) => {
                        const isHovered = hoveredPoint?.id === p.point.id;
                        return (
                          <g
                            key={p.point.id || i}
                            className="cursor-pointer transition-transform"
                            onMouseEnter={() => setHoveredPoint(p.point)}
                            onMouseLeave={() => setHoveredPoint(null)}
                          >
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={isHovered ? 7 : 5}
                              fill="#FFFFFF"
                              stroke="#4F6EF7"
                              strokeWidth="3"
                              className="transition-all"
                            />
                            <text
                              x={p.x}
                              y={p.y - 12}
                              textAnchor="middle"
                              fill="currentColor"
                              className={`text-[10px] font-bold ${
                                isHovered
                                  ? 'fill-brand-primary text-xs font-black'
                                  : 'fill-surface-text dark:fill-darkSurface-text'
                              } font-mono`}
                            >
                              {p.point.accuracy}%
                            </text>
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
            )}

            {/* Interactive Tooltip Card */}
            {hoveredPoint && (
              <div className="absolute top-2 right-2 p-3 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border shadow-md max-w-xs text-xs animate-in fade-in duration-150 pointer-events-none">
                <span className="font-bold text-surface-text dark:text-darkSurface-text block line-clamp-1">
                  {hoveredPoint.title}
                </span>
                <span className="text-[11px] text-surface-muted dark:text-darkSurface-muted block">
                  {hoveredPoint.formattedDate} • {hoveredPoint.category}
                </span>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-medium pt-2 border-t border-surface-border dark:border-darkSurface-border">
                  <div>
                    <span className="text-surface-muted block">Accuracy:</span>
                    <span className="font-bold text-brand-primary">{hoveredPoint.accuracy}%</span>
                  </div>
                  <div>
                    <span className="text-surface-muted block">Score:</span>
                    <span className="font-bold text-surface-text dark:text-darkSurface-text">
                      {hoveredPoint.score} / {hoveredPoint.maxScore}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── WEAK TOPICS & PRIORITY REVISION ───────────────────────────── */}
      <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-lg text-surface-text dark:text-darkSurface-text">
              Weak Topics & Priority Revision
            </h3>
          </div>
          <span className="text-xs font-semibold text-surface-muted dark:text-darkSurface-muted">
            Gated by Sample Size (≥3 attempts, &lt;65% accuracy)
          </span>
        </div>

        {weakTopics.length === 0 ? (
          <div className="p-6 rounded-2xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-dashed border-surface-border dark:border-darkSurface-border text-center">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
            <h4 className="font-bold text-sm text-surface-text dark:text-darkSurface-text">
              {summary.testsAttempted === 0
                ? 'No Error Data Recorded'
                : 'No Weak Spots Detected!'}
            </h4>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted mt-1 max-w-md mx-auto">
              {summary.testsAttempted === 0
                ? 'Complete mock tests to automatically identify high-frequency error topics.'
                : 'All tested topics currently maintain solid accuracy (≥65%). Keep practicing to discover new revision targets.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4 mt-6">
            {weakTopics.map((item) => {
              const severityBadge =
                item.severity === 'CRITICAL'
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                  : item.severity === 'HIGH'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                  : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20';

              return (
                <div
                  key={item.topic}
                  className="p-4 rounded-2xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-bold text-sm text-surface-text dark:text-darkSurface-text">
                        {item.topic}
                      </span>
                      {item.category && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-surface-elev2 dark:bg-darkSurface-elev1 text-surface-muted dark:text-darkSurface-muted">
                          {item.category}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${severityBadge}`}
                      >
                        {item.severity}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-surface-muted dark:text-darkSurface-muted mb-1.5">
                      <span>{item.accuracy}% Accuracy</span>
                      <span className="text-brand-red font-semibold">
                        {item.wrongCount} missed of {item.attemptedCount} attempted
                      </span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-surface-elev2 dark:bg-darkSurface-elev1 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-500"
                        style={{ width: `${Math.max(8, item.accuracy)}%` }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => onPracticeTopic(item.topic)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-brand-primary/10 hover:bg-brand-primary text-brand-primary hover:text-white font-bold text-xs transition-colors self-end sm:self-auto shrink-0 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Practice Topic</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── TOPIC MASTERY BREAKDOWN ───────────────────────────────────── */}
      {topics.length > 0 && (
        <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 sm:p-8 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg text-surface-text dark:text-darkSurface-text">
              Section & Topic Mastery
            </h3>
            <span className="text-xs text-surface-muted dark:text-darkSurface-muted">
              {topics.length} Domains Analyzed
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {topics.map((t) => {
              const isMastery = t.accuracy >= 80;
              const isPassing = t.accuracy >= 65;
              const color = isMastery
                ? 'text-emerald-500'
                : isPassing
                ? 'text-blue-500'
                : 'text-rose-500';
              const barColor = isMastery
                ? 'bg-emerald-500'
                : isPassing
                ? 'bg-blue-500'
                : 'bg-rose-500';

              return (
                <div
                  key={t.topic}
                  className="p-4 rounded-2xl bg-surface-elev1 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="font-bold text-sm text-surface-text dark:text-darkSurface-text block">
                        {t.topic}
                      </span>
                      <span className="text-[11px] text-surface-muted dark:text-darkSurface-muted">
                        {t.attempted} attempted • {t.correct} correct • {t.wrong} wrong
                      </span>
                    </div>
                    <span className={`text-base font-black ${color}`}>{t.accuracy}%</span>
                  </div>

                  <div className="w-full h-1.5 rounded-full bg-surface-elev2 dark:bg-darkSurface-elev1 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${t.accuracy}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── RECENT COMPLETED TESTS TABLE ──────────────────────────────── */}
      {recentTests.length > 0 && (
        <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 sm:p-8 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg text-surface-text dark:text-darkSurface-text">
              Recent Completed Tests
            </h3>
            <span className="text-xs text-surface-muted dark:text-darkSurface-muted">
              Showing latest {recentTests.length} tests
            </span>
          </div>

          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-surface-border dark:border-darkSurface-border text-surface-muted dark:text-darkSurface-muted">
                  <th className="py-2.5 font-bold">Exam / Paper</th>
                  <th className="py-2.5 font-bold">Date</th>
                  <th className="py-2.5 font-bold">Score</th>
                  <th className="py-2.5 font-bold">Accuracy</th>
                  <th className="py-2.5 font-bold">Time</th>
                  <th className="py-2.5 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border dark:divide-darkSurface-border">
                {recentTests.map((test) => (
                  <tr
                    key={test.id}
                    className="hover:bg-surface-elev1 dark:hover:bg-darkSurface-elev2 transition-colors"
                  >
                    <td className="py-3 pr-3 font-semibold text-surface-text dark:text-darkSurface-text">
                      <div className="flex flex-col">
                        <span>{test.title}</span>
                        <span className="text-[10px] text-surface-muted font-normal">
                          {test.category}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-surface-muted dark:text-darkSurface-muted whitespace-nowrap">
                      {test.formattedDate}
                    </td>
                    <td className="py-3 font-medium text-surface-text dark:text-darkSurface-text whitespace-nowrap">
                      {test.score} / {test.maxScore}
                    </td>
                    <td className="py-3 whitespace-nowrap">
                      <span
                        className={`font-bold ${
                          test.accuracy >= 75
                            ? 'text-emerald-500'
                            : test.accuracy >= 50
                            ? 'text-brand-primary'
                            : 'text-brand-red'
                        }`}
                      >
                        {test.accuracy}%
                      </span>
                    </td>
                    <td className="py-3 text-surface-muted dark:text-darkSurface-muted whitespace-nowrap">
                      {formatDuration(test.timeSpentSeconds)}
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      {onReviewTest ? (
                        <button
                          onClick={() =>
                            onReviewTest(test.id, test.isCompetitive, test.paperId)
                          }
                          className="px-2.5 py-1 rounded-lg bg-surface-elev2 dark:bg-darkSurface-elev2 hover:bg-brand-primary hover:text-white text-surface-text dark:text-darkSurface-text font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          Review
                        </button>
                      ) : (
                        <span className="text-surface-muted text-[11px]">Completed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Sponsored Learning Space ──────────────────────────────────── */}
      <div className="mt-8">
        <AdSlot placement="analytics_banner" format="responsive" />
      </div>
    </div>
  );
};
