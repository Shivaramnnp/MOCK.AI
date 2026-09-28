import { TestHistory, ExamTestSession } from '../types';
import { storage } from './storage';
import { ExamSessionService } from './examSessionService';
import { ExamService } from './examService';

export interface AnalyticsFilter {
  examId?: string; // 'all' | 'custom' | specific exam ID (e.g. 'ssc-chsl', 'gate-cs')
  dateRange?: '7d' | '30d' | '90d' | 'all';
}

export type ReadinessTier =
  | 'Mastery'
  | 'Competitive'
  | 'Developing'
  | 'Needs Attention'
  | 'Calibrating'
  | 'Not Started';

export interface MetricSummary {
  testsAttempted: number;
  overallAccuracy: number; // 0-100 percentage: correct / (correct + wrong) * 100
  questionsAttempted: number; // total questions answered
  questionsTotal: number; // total questions in attempted tests
  totalCorrect: number;
  totalWrong: number;
  attemptRate: number; // percentage of total questions attempted
  avgScorePercent: number; // average score / max score * 100
  avgTimePerQuestionSeconds: number; // average time spent per attempted question
  totalTimeSpentSeconds: number;
  readinessTier: ReadinessTier;
  readinessDescription: string;
}

export interface TrendPoint {
  id: string;
  title: string;
  examId: string;
  category: string;
  date: number;
  formattedDate: string;
  accuracy: number; // 0-100 percentage
  scorePercent: number; // 0-100 percentage
  score: number;
  maxScore: number;
  totalQuestions: number;
  attempted: number;
  correct: number;
  wrong: number;
}

export interface TopicPerformance {
  topic: string;
  category?: string;
  examId?: string;
  totalQuestions: number;
  attempted: number;
  correct: number;
  wrong: number;
  skipped: number;
  accuracy: number; // 0-100 percentage
}

export interface WeakTopicItem {
  topic: string;
  category?: string;
  wrongCount: number;
  attemptedCount: number;
  accuracy: number;
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE';
}

export interface CompletedTestRecord {
  id: string;
  title: string;
  category: string;
  examId: string;
  completedAt: number;
  formattedDate: string;
  score: number;
  maxScore: number;
  scorePercent: number;
  accuracy: number;
  timeSpentSeconds: number;
  questionsCount: number;
  attemptedCount: number;
  correctCount: number;
  wrongCount: number;
  isCompetitive: boolean;
  paperId?: string;
  sessionId?: string;
}

export interface AvailableExamOption {
  id: string;
  name: string;
  count: number;
}

export interface UserAnalyticsData {
  summary: MetricSummary;
  trend: TrendPoint[];
  topics: TopicPerformance[];
  weakTopics: WeakTopicItem[];
  recentTests: CompletedTestRecord[];
  availableExams: AvailableExamOption[];
}

export class AnalyticsService {
  /**
   * Aggregate all completed test records from both competitive exam sessions and custom tests.
   */
  static getRawCompletedRecords(userId: string = 'guest'): CompletedTestRecord[] {
    const records: CompletedTestRecord[] = [];
    const seenSessionIds = new Set<string>();

    // 1. Gather competitive exam sessions from ExamSessionService
    const localExamSessions = ExamSessionService.getLocalSessions(userId);
    const historyExamSessions = ExamService.getAttemptHistory().filter(
      (s) => !s.userId || s.userId === userId
    );

    const allExamSessions: ExamTestSession[] = [...localExamSessions, ...historyExamSessions];

    for (const session of allExamSessions) {
      if (
        (session.status === 'SUBMITTED' || session.status === 'COMPLETED') &&
        session.sessionId &&
        !seenSessionIds.has(session.sessionId)
      ) {
        seenSessionIds.add(session.sessionId);

        const res = session.result;
        const correctCount = res ? res.correctCount : 0;
        const wrongCount = res ? res.wrongCount : 0;
        const attemptedCount = correctCount + wrongCount;
        const totalQuestions = res ? res.totalQuestions : session.durationSeconds ? 100 : 0;
        const score = res ? res.totalScore : 0;
        const maxScore = res ? res.maxMarks : 100;
        const scorePercent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
        const accuracy = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;
        const timeSpent = res ? res.timeSpentSeconds : session.elapsedSeconds || 0;
        const completedAt = session.completedAt || session.lastSavedAt || session.startedAt || Date.now();

        records.push({
          id: session.sessionId,
          title: session.paperTitle || `Exam Paper ${session.paperId}`,
          category: session.examId.toUpperCase().replace('-', ' '),
          examId: session.examId,
          completedAt,
          formattedDate: new Date(completedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          score,
          maxScore,
          scorePercent,
          accuracy,
          timeSpentSeconds: timeSpent,
          questionsCount: totalQuestions,
          attemptedCount,
          correctCount,
          wrongCount,
          isCompetitive: true,
          paperId: session.paperId,
          sessionId: session.sessionId,
        });
      }
    }

    // 2. Gather completed custom tests from Storage
    const customTests = storage.getTests().filter((t) => t.lastTakenAt !== null);

    for (const test of customTests) {
      const correctCount = test.bestScore ?? 0;
      const wrongCount = test.wrongCount ?? 0;
      const totalQuestions = test.bestTotal || test.questions.length;
      const attemptedCount = correctCount + wrongCount > 0 ? correctCount + wrongCount : totalQuestions;
      const score = correctCount;
      const maxScore = totalQuestions;
      const scorePercent = test.bestScorePercent ?? (maxScore > 0 ? Math.round((score / maxScore) * 100) : 0);
      const accuracy = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : scorePercent;
      const timeSpent = test.lastTimeSpentSeconds || 0;
      const completedAt = test.lastTakenAt || test.createdAt || Date.now();

      records.push({
        id: test.id,
        title: test.title,
        category: test.category || 'General',
        examId: 'custom',
        completedAt,
        formattedDate: new Date(completedAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        score,
        maxScore,
        scorePercent,
        accuracy,
        timeSpentSeconds: timeSpent,
        questionsCount: totalQuestions,
        attemptedCount,
        correctCount,
        wrongCount,
        isCompetitive: false,
      });
    }

    return records.sort((a, b) => b.completedAt - a.completedAt);
  }

  /**
   * Main calculation method: compute complete data-driven analytics for a user.
   */
  static getUserAnalytics(
    userId: string = 'guest',
    filters: AnalyticsFilter = { examId: 'all', dateRange: 'all' }
  ): UserAnalyticsData {
    const allRecords = this.getRawCompletedRecords(userId);

    // Compute available exams list for filter dropdown
    const examCounts: Record<string, { name: string; count: number }> = {};
    for (const r of allRecords) {
      const key = r.examId;
      const name = r.isCompetitive ? r.category : 'Custom Practice Tests';
      if (!examCounts[key]) {
        examCounts[key] = { name, count: 0 };
      }
      examCounts[key].count += 1;
    }

    const availableExams: AvailableExamOption[] = [
      { id: 'all', name: 'All Practice & Exams', count: allRecords.length },
      ...Object.entries(examCounts).map(([id, info]) => ({
        id,
        name: info.name,
        count: info.count,
      })),
    ];

    // Apply Filters
    const now = Date.now();
    let filteredRecords = allRecords;

    // 1. Date Range Filter
    if (filters.dateRange && filters.dateRange !== 'all') {
      const days = filters.dateRange === '7d' ? 7 : filters.dateRange === '30d' ? 30 : 90;
      const cutoff = now - days * 86400000;
      filteredRecords = filteredRecords.filter((r) => r.completedAt >= cutoff);
    }

    // 2. Exam Filter
    if (filters.examId && filters.examId !== 'all') {
      filteredRecords = filteredRecords.filter((r) => r.examId === filters.examId);
    }

    // Metrics calculation
    const testsAttempted = filteredRecords.length;
    let totalQuestions = 0;
    let questionsAttempted = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let sumScorePercent = 0;
    let totalTimeSpentSeconds = 0;

    for (const r of filteredRecords) {
      totalQuestions += r.questionsCount;
      questionsAttempted += r.attemptedCount;
      totalCorrect += r.correctCount;
      totalWrong += r.wrongCount;
      sumScorePercent += r.scorePercent;
      totalTimeSpentSeconds += r.timeSpentSeconds;
    }

    // Authoritative Accuracy: correct / attempted * 100 (excluding skipped)
    const overallAccuracy =
      questionsAttempted > 0 ? Math.round((totalCorrect / questionsAttempted) * 100) : 0;

    const attemptRate =
      totalQuestions > 0 ? Math.round((questionsAttempted / totalQuestions) * 100) : 0;

    const avgScorePercent =
      testsAttempted > 0 ? Math.round(sumScorePercent / testsAttempted) : 0;

    const avgTimePerQuestionSeconds =
      questionsAttempted > 0 ? Math.round(totalTimeSpentSeconds / questionsAttempted) : 0;

    // Scientific Readiness Classification
    let readinessTier: ReadinessTier = 'Not Started';
    let readinessDescription = 'Complete your first mock test to establish a diagnostic baseline.';

    if (testsAttempted === 0) {
      readinessTier = 'Not Started';
      readinessDescription = 'Complete your first mock test to establish a diagnostic baseline.';
    } else if (testsAttempted < 3) {
      readinessTier = 'Calibrating';
      readinessDescription = `${testsAttempted} of 3 baseline tests completed. Take ${3 - testsAttempted} more for calibrated readiness analysis.`;
    } else {
      if (overallAccuracy >= 85) {
        readinessTier = 'Mastery';
        readinessDescription = 'Consistently hitting target accuracy benchmark across practiced domains.';
      } else if (overallAccuracy >= 70) {
        readinessTier = 'Competitive';
        readinessDescription = 'Solid conceptual foundation; target weak spots to push accuracy above 85%.';
      } else if (overallAccuracy >= 50) {
        readinessTier = 'Developing';
        readinessDescription = 'Core concepts developing; focus revision on high-error topics.';
      } else {
        readinessTier = 'Needs Attention';
        readinessDescription = 'High error frequency detected; recommend topic-by-topic guided study.';
      }
    }

    const summary: MetricSummary = {
      testsAttempted,
      overallAccuracy,
      questionsAttempted,
      questionsTotal: totalQuestions,
      totalCorrect,
      totalWrong,
      attemptRate,
      avgScorePercent,
      avgTimePerQuestionSeconds,
      totalTimeSpentSeconds,
      readinessTier,
      readinessDescription,
    };

    // Performance Trend (chronological: oldest to newest)
    const chronological = [...filteredRecords].sort((a, b) => a.completedAt - b.completedAt);
    const trend: TrendPoint[] = chronological.map((r) => ({
      id: r.id,
      title: r.title,
      examId: r.examId,
      category: r.category,
      date: r.completedAt,
      formattedDate: r.formattedDate,
      accuracy: r.accuracy,
      scorePercent: r.scorePercent,
      score: r.score,
      maxScore: r.maxScore,
      totalQuestions: r.questionsCount,
      attempted: r.attemptedCount,
      correct: r.correctCount,
      wrong: r.wrongCount,
    }));

    // Topic Performance & Weak Topic Detection
    const topicMap: Record<
      string,
      {
        topic: string;
        category?: string;
        examId?: string;
        total: number;
        attempted: number;
        correct: number;
        wrong: number;
        skipped: number;
      }
    > = {};

    // 1. Topic attribution from competitive exam sessions
    const localExamSessions = ExamSessionService.getLocalSessions(userId);
    const historyExamSessions = ExamService.getAttemptHistory();
    const seenExamIds = new Set(filteredRecords.filter((r) => r.isCompetitive).map((r) => r.id));

    const matchedSessions = [...localExamSessions, ...historyExamSessions].filter((s) =>
      seenExamIds.has(s.sessionId)
    );

    for (const session of matchedSessions) {
      if (session.result?.sectionResults) {
        for (const sr of Object.values(session.result.sectionResults)) {
          const topicName = sr.sectionName || sr.sectionId;
          if (!topicMap[topicName]) {
            topicMap[topicName] = {
              topic: topicName,
              category: session.examId.toUpperCase(),
              examId: session.examId,
              total: 0,
              attempted: 0,
              correct: 0,
              wrong: 0,
              skipped: 0,
            };
          }
          topicMap[topicName].total += sr.totalQuestions;
          topicMap[topicName].attempted += sr.attempted;
          topicMap[topicName].correct += sr.correct;
          topicMap[topicName].wrong += sr.wrong;
          topicMap[topicName].skipped += sr.skipped;
        }
      }
    }

    // 2. Topic attribution from custom tests
    const customTestIds = new Set(filteredRecords.filter((r) => !r.isCompetitive).map((r) => r.id));
    const matchedCustomTests = storage.getTests().filter((t) => customTestIds.has(t.id));

    for (const test of matchedCustomTests) {
      const userAnswers = test.userAnswers;

      if (userAnswers) {
        // Deterministic per-question mapping
        test.questions.forEach((q, idx) => {
          const topicName = q.topic || test.category || 'General';
          if (!topicMap[topicName]) {
            topicMap[topicName] = {
              topic: topicName,
              category: test.category,
              examId: 'custom',
              total: 0,
              attempted: 0,
              correct: 0,
              wrong: 0,
              skipped: 0,
            };
          }
          topicMap[topicName].total += 1;
          const ans = userAnswers[idx];
          if (ans !== undefined) {
            topicMap[topicName].attempted += 1;
            if (ans === q.correctAnswerIndex) {
              topicMap[topicName].correct += 1;
            } else {
              topicMap[topicName].wrong += 1;
            }
          } else {
            topicMap[topicName].skipped += 1;
          }
        });
      } else {
        // Fallback for tests without saved question answers
        const uniqueTopics = Array.from(
          new Set(test.questions.map((q) => q.topic).filter(Boolean))
        ) as string[];

        if (uniqueTopics.length === 1) {
          // If only 1 topic across all questions, attribution is exact
          const topicName = uniqueTopics[0];
          if (!topicMap[topicName]) {
            topicMap[topicName] = {
              topic: topicName,
              category: test.category,
              examId: 'custom',
              total: 0,
              attempted: 0,
              correct: 0,
              wrong: 0,
              skipped: 0,
            };
          }
          const correct = test.bestScore ?? 0;
          const wrong = test.wrongCount ?? 0;
          const total = test.bestTotal || test.questions.length;
          topicMap[topicName].total += total;
          topicMap[topicName].attempted += correct + wrong;
          topicMap[topicName].correct += correct;
          topicMap[topicName].wrong += wrong;
          topicMap[topicName].skipped += Math.max(0, total - (correct + wrong));
        } else {
          // If topics are mixed without answer map, aggregate at test category level
          const catName = test.category || 'General';
          if (!topicMap[catName]) {
            topicMap[catName] = {
              topic: catName,
              category: test.category,
              examId: 'custom',
              total: 0,
              attempted: 0,
              correct: 0,
              wrong: 0,
              skipped: 0,
            };
          }
          const correct = test.bestScore ?? 0;
          const wrong = test.wrongCount ?? 0;
          const total = test.bestTotal || test.questions.length;
          topicMap[catName].total += total;
          topicMap[catName].attempted += correct + wrong;
          topicMap[catName].correct += correct;
          topicMap[catName].wrong += wrong;
          topicMap[catName].skipped += Math.max(0, total - (correct + wrong));
        }
      }
    }

    const topics: TopicPerformance[] = Object.values(topicMap).map((t) => ({
      topic: t.topic,
      category: t.category,
      examId: t.examId,
      totalQuestions: t.total,
      attempted: t.attempted,
      correct: t.correct,
      wrong: t.wrong,
      skipped: t.skipped,
      accuracy: t.attempted > 0 ? Math.round((t.correct / t.attempted) * 100) : 0,
    }));

    // Weak Topic Gating:
    // 1. Must have attempted at least 3 questions (or at least 2 if overall questions attempted < 10)
    // 2. Accuracy must be < 65%
    // 3. Must have at least 1 wrong answer
    const sampleThreshold = questionsAttempted < 10 ? 2 : 3;

    const weakTopics: WeakTopicItem[] = topics
      .filter((t) => t.attempted >= sampleThreshold && t.accuracy < 65 && t.wrong > 0)
      .map((t) => {
        let severity: 'CRITICAL' | 'HIGH' | 'MODERATE' = 'MODERATE';
        if (t.accuracy < 40) severity = 'CRITICAL';
        else if (t.accuracy < 55) severity = 'HIGH';

        return {
          topic: t.topic,
          category: t.category,
          wrongCount: t.wrong,
          attemptedCount: t.attempted,
          accuracy: t.accuracy,
          severity,
        };
      })
      .sort((a, b) => b.wrongCount - a.wrongCount || a.accuracy - b.accuracy);

    return {
      summary,
      trend,
      topics: topics.sort((a, b) => b.attempted - a.attempted),
      weakTopics,
      recentTests: filteredRecords.slice(0, 10),
      availableExams,
    };
  }

  /**
   * Helper to retrieve unified stats for Home & Profile screens
   * (combining competitive exams and custom tests).
   */
  static getOverallStats(userId: string = 'guest'): {
    totalTests: number;
    avgScore: number;
    accuracy: number;
  } {
    const records = this.getRawCompletedRecords(userId);
    if (records.length === 0) {
      return { totalTests: 0, avgScore: 0, accuracy: 0 };
    }

    const totalTests = records.length;
    const avgScore = Math.round(
      records.reduce((acc, r) => acc + r.scorePercent, 0) / totalTests
    );
    const totalCorrect = records.reduce((acc, r) => acc + r.correctCount, 0);
    const totalAttempted = records.reduce((acc, r) => acc + r.attemptedCount, 0);
    const accuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;

    return { totalTests, avgScore, accuracy };
  }
}
