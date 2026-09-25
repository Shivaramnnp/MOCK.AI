import React from 'react';
import {
  TrendingUp,
  Award,
  AlertTriangle,
  Clock,
  CheckCircle,
  Play,
  Flame,
  BarChart2,
  Sparkles,
} from 'lucide-react';
import { TestHistory } from '../types';
import { AdSlot } from '../components/ads/AdSlot';

interface AnalyticsScreenProps {
  tests: TestHistory[];
  streakCount: number;
  onPracticeTopic: (topic: string) => void;
}

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({
  tests,
  streakCount,
  onPracticeTopic,
}) => {
  const completedTests = tests.filter((t) => t.lastTakenAt !== null);

  const totalTests = completedTests.length;
  const avgScore =
    totalTests > 0
      ? Math.round(
          completedTests.reduce((acc, t) => acc + (t.bestScorePercent || 0), 0) / totalTests
        )
      : 0;

  const totalQuestionsAnswered = completedTests.reduce((acc, t) => acc + t.bestTotal, 0);
  const totalCorrect = completedTests.reduce((acc, t) => acc + (t.bestScore || 0), 0);

  // Derive weak topics from tests with wrong answers
  const topicWrongMap: Record<string, number> = {};
  completedTests.forEach((t) => {
    t.questions.forEach((q) => {
      const topic = q.topic || t.category || 'General';
      if (t.wrongCount && t.wrongCount > 0) {
        topicWrongMap[topic] = (topicWrongMap[topic] || 0) + 1;
      }
    });
  });

  // Default mock weak topics if user has very few tests
  if (Object.keys(topicWrongMap).length === 0) {
    topicWrongMap['Sorting Algorithms'] = 3;
    topicWrongMap['Rotational Dynamics'] = 2;
    topicWrongMap['Aldehydes & Ketones'] = 1;
  }

  const weakTopics = Object.entries(topicWrongMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const maxWrong = Math.max(...weakTopics.map((w) => w[1]), 1);

  // Performance trend data points
  const recentScores = completedTests.length > 0
    ? completedTests.slice(0, 7).map((t) => t.bestScorePercent || 0)
    : [40, 55, 50, 75, 65, 85]; // demo preview trend if empty

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
            Real-time tracking of your accuracy, topic mastery, and weak spots
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 font-bold text-xs">
            <Flame className="w-4 h-4 fill-amber-500" />
            <span>{streakCount} Day Streak Active</span>
          </div>
        </div>
      </div>

      {/* ── 4 Key Performance Metrics ─────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
          <span className="text-xs font-bold text-surface-muted dark:text-darkSurface-muted block uppercase tracking-wider">
            Tests Attempted
          </span>
          <span className="text-2xl sm:text-3xl font-black text-surface-text dark:text-darkSurface-text mt-1 block">
            {totalTests > 0 ? totalTests : 'Preview'}
          </span>
          <span className="text-[11px] text-brand-green font-semibold mt-1 block">
            ✓ Complete curriculum
          </span>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
          <span className="text-xs font-bold text-surface-muted dark:text-darkSurface-muted block uppercase tracking-wider">
            Overall Accuracy
          </span>
          <span className="text-2xl sm:text-3xl font-black text-brand-primary mt-1 block">
            {totalTests > 0 ? `${avgScore}%` : '82%'}
          </span>
          <span className="text-[11px] text-surface-muted dark:text-darkSurface-muted font-medium mt-1 block">
            Target: 85%+
          </span>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
          <span className="text-xs font-bold text-surface-muted dark:text-darkSurface-muted block uppercase tracking-wider">
            Questions Practiced
          </span>
          <span className="text-2xl sm:text-3xl font-black text-brand-variant mt-1 block">
            {totalQuestionsAnswered > 0 ? totalQuestionsAnswered : 42}
          </span>
          <span className="text-[11px] text-surface-muted dark:text-darkSurface-muted font-medium mt-1 block">
            Across {tests.length} mock tests
          </span>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-sm">
          <span className="text-xs font-bold text-surface-muted dark:text-darkSurface-muted block uppercase tracking-wider">
            Readiness Tier
          </span>
          <span className="text-xl sm:text-2xl font-black text-emerald-500 mt-1 block">
            {avgScore >= 80 ? 'Mastery' : avgScore >= 60 ? 'Competitive' : 'Developing'}
          </span>
          <span className="text-[11px] text-surface-muted dark:text-darkSurface-muted font-medium mt-1 block">
            High percentile forecast
          </span>
        </div>
      </div>

      {/* ── Performance Trend Chart ───────────────────────────────────── */}
      <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-bold text-lg text-surface-text dark:text-darkSurface-text">
              Accuracy Trend Over Recent Tests
            </h3>
            <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
              Score progression across your latest mock exams
            </p>
          </div>
          <span className="text-xs font-bold text-brand-primary bg-brand-primary/10 px-3 py-1 rounded-full">
            Recent {recentScores.length} Tests
          </span>
        </div>

        {/* SVG Line Chart */}
        <div className="h-56 w-full relative">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 600 200" preserveAspectRatio="none">
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4F6EF7" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#4F6EF7" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            {[40, 80, 120, 160].map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2="600"
                y2={y}
                stroke="currentColor"
                className="text-surface-border dark:text-darkSurface-border stroke-1 stroke-dashed opacity-40"
              />
            ))}

            {/* Area fill */}
            {(() => {
              const pts = recentScores.map((score, i) => {
                const x = (i / (recentScores.length - 1)) * 580 + 10;
                const y = 180 - (score / 100) * 160;
                return `${x},${y}`;
              });
              const firstX = 10;
              const lastX = 590;
              const areaPath = `M ${firstX},180 L ${pts.join(' L ')} L ${lastX},180 Z`;
              const linePath = `M ${pts.join(' L ')}`;

              return (
                <>
                  <path d={areaPath} fill="url(#chartGradient)" />
                  <path d={linePath} fill="none" stroke="#4F6EF7" strokeWidth="3" strokeLinecap="round" />
                  {recentScores.map((score, i) => {
                    const x = (i / (recentScores.length - 1)) * 580 + 10;
                    const y = 180 - (score / 100) * 160;
                    return (
                      <g key={i} className="group cursor-pointer">
                        <circle cx={x} cy={y} r="5" fill="#FFFFFF" stroke="#4F6EF7" strokeWidth="3" />
                        <text
                          x={x}
                          y={y - 12}
                          textAnchor="middle"
                          fill="currentColor"
                          className="text-[10px] font-bold text-surface-text dark:text-darkSurface-text font-mono"
                        >
                          {score}%
                        </text>
                      </g>
                    );
                  })}
                </>
              );
            })()}
          </svg>
        </div>
      </div>

      {/* ── Weak Topics Detector ──────────────────────────────────────── */}
      <div className="rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-lg text-surface-text dark:text-darkSurface-text">
              Weak Topics & Priority Revision
            </h3>
          </div>
          <span className="text-xs font-semibold text-surface-muted dark:text-darkSurface-muted">
            Auto-detected by Error Frequency
          </span>
        </div>

        <div className="space-y-4 mt-6">
          {weakTopics.map(([topic, wrong]) => {
            const fraction = Math.round((wrong / maxWrong) * 100);

            return (
              <div
                key={topic}
                className="p-4 rounded-2xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-sm text-surface-text dark:text-darkSurface-text">
                      {topic}
                    </span>
                    <span className="text-xs font-semibold text-brand-red">
                      {wrong} missed question{wrong > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="w-full h-2 rounded-full bg-surface-elev1 dark:bg-darkSurface-elev1 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-brand-red"
                      style={{ width: `${fraction}%` }}
                    />
                  </div>
                </div>

                <button
                  onClick={() => onPracticeTopic(topic)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-brand-primary/10 hover:bg-brand-primary text-brand-primary hover:text-white font-bold text-xs transition-colors self-end sm:self-auto"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Practice Weak Spot</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Sponsored Learning Space (Recommended Study Aids) ─────── */}
      <div className="mt-8">
        <AdSlot placement="analytics_banner" format="responsive" />
      </div>
    </div>
  );
};
