import { describe, it, expect, beforeEach } from 'vitest';
import { AnalyticsService } from './analyticsService';
import { storage } from './storage';
import { ExamSessionService } from './examSessionService';
import { ExamTestSession, TestHistory, ExamResultSummary } from '../types';

describe('AnalyticsService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Zero-Data / Fresh User State', () => {
    it('returns clean zeroed metrics without any mocked numbers or fake topics', () => {
      // Storage initialized with clean seed tests (none taken)
      const data = AnalyticsService.getUserAnalytics('guest');

      expect(data.summary.testsAttempted).toBe(0);
      expect(data.summary.overallAccuracy).toBe(0);
      expect(data.summary.questionsAttempted).toBe(0);
      expect(data.summary.questionsTotal).toBe(0);
      expect(data.summary.attemptRate).toBe(0);
      expect(data.summary.avgScorePercent).toBe(0);
      expect(data.summary.avgTimePerQuestionSeconds).toBe(0);
      expect(data.summary.readinessTier).toBe('Not Started');
      expect(data.summary.readinessDescription).toContain('diagnostic baseline');

      // Trends and weak topics must be completely empty (no mock data!)
      expect(data.trend).toHaveLength(0);
      expect(data.weakTopics).toHaveLength(0);
      expect(data.recentTests).toHaveLength(0);
    });

    it('returns zero stats from getOverallStats for fresh user', () => {
      const stats = AnalyticsService.getOverallStats('guest');
      expect(stats.totalTests).toBe(0);
      expect(stats.avgScore).toBe(0);
      expect(stats.accuracy).toBe(0);
    });
  });

  describe('Single Completed Test (Calibrating State)', () => {
    it('calculates accuracy as correct / attempted, ignoring skipped questions', () => {
      // Create a completed custom test with 10 questions: 4 correct, 1 wrong, 5 skipped (total 10)
      const test: TestHistory = {
        id: 'test-1',
        title: 'Physics Mechanics Quiz',
        category: 'Physics',
        createdAt: Date.now() - 3600000,
        lastTakenAt: Date.now(),
        bestScore: 4,
        bestScorePercent: 40,
        bestTotal: 10,
        wrongCount: 1,
        lastTimeSpentSeconds: 150,
        questions: Array.from({ length: 10 }, (_, i) => ({
          questionText: `Q${i}`,
          options: ['A', 'B', 'C', 'D'],
          correctAnswerIndex: 0,
          topic: i < 5 ? 'Kinematics' : 'Dynamics',
        })),
        userAnswers: {
          0: 0, // correct (Kinematics)
          1: 0, // correct (Kinematics)
          2: 0, // correct (Kinematics)
          3: 0, // correct (Kinematics)
          4: 1, // wrong (Kinematics)
          // 5-9: skipped (Dynamics)
        },
      };

      storage.saveTest(test);

      const data = AnalyticsService.getUserAnalytics('guest');

      expect(data.summary.testsAttempted).toBe(1);
      // Attempted = 4 correct + 1 wrong = 5. Accuracy = 4 / 5 * 100 = 80%.
      // NOT 4 / 10 = 40%! Skipped questions do NOT drag down accuracy.
      expect(data.summary.questionsAttempted).toBe(5);
      expect(data.summary.overallAccuracy).toBe(80);
      expect(data.summary.totalCorrect).toBe(4);
      expect(data.summary.totalWrong).toBe(1);
      expect(data.summary.attemptRate).toBe(50); // 5 / 10 * 100 = 50%
      expect(data.summary.avgTimePerQuestionSeconds).toBe(30); // 150s / 5 attempted = 30s
      expect(data.summary.readinessTier).toBe('Calibrating');

      // Trend has 1 point, no division by zero
      expect(data.trend).toHaveLength(1);
      expect(data.trend[0].accuracy).toBe(80);
      expect(data.trend[0].title).toBe('Physics Mechanics Quiz');

      // Kinematics: 5 attempted, 4 correct, 1 wrong -> 80% accuracy -> NOT weak (> 65%)
      // Dynamics: 0 attempted -> NOT weak
      expect(data.weakTopics).toHaveLength(0);
    });
  });

  describe('Competitive Exam Sessions Integration', () => {
    it('aggregates completed ExamTestSession from ExamSessionService', () => {
      const resultSummary: ExamResultSummary = {
        sessionId: 'session-cbe-101',
        paperId: 'ssc-chsl-2025-nov-s2',
        examId: 'ssc-chsl',
        paperTitle: 'SSC CHSL 2025 Tier 1',
        totalQuestions: 100,
        maxMarks: 200,
        totalScore: 140,
        percentage: 70,
        accuracy: 75,
        correctCount: 75,
        wrongCount: 25,
        unansweredCount: 0,
        timeSpentSeconds: 3000,
        submittedAt: Date.now(),
        sectionResults: {
          reasoning: {
            sectionId: 'reasoning',
            sectionName: 'General Intelligence',
            totalQuestions: 25,
            maxMarks: 50,
            attempted: 25,
            correct: 24,
            wrong: 1,
            skipped: 0,
            score: 47.5,
            accuracy: 96,
            timeSpentSeconds: 700,
          },
          gk: {
            sectionId: 'gk',
            sectionName: 'General Awareness',
            totalQuestions: 25,
            maxMarks: 50,
            attempted: 25,
            correct: 8,
            wrong: 17,
            skipped: 0,
            score: 7.5,
            accuracy: 32,
            timeSpentSeconds: 500,
          },
        },
      };

      const completedSession: ExamTestSession = {
        sessionId: 'session-cbe-101',
        paperId: 'ssc-chsl-2025-nov-s2',
        examId: 'ssc-chsl',
        paperTitle: 'SSC CHSL 2025 Tier 1',
        userId: 'guest',
        startedAt: Date.now() - 3600000,
        lastSavedAt: Date.now(),
        expiresAt: Date.now(),
        completedAt: Date.now(),
        status: 'SUBMITTED',
        durationSeconds: 3600,
        timeRemainingSeconds: 0,
        elapsedSeconds: 3000,
        userAnswers: {},
        questionStatuses: {},
        currentQuestionIndex: 99,
        currentSectionId: 'gk',
        version: 5,
        result: resultSummary,
      };

      ExamSessionService.submitSessionSync(completedSession, resultSummary);

      const data = AnalyticsService.getUserAnalytics('guest');

      expect(data.summary.testsAttempted).toBe(1);
      expect(data.summary.totalCorrect).toBe(75);
      expect(data.summary.totalWrong).toBe(25);
      expect(data.summary.questionsAttempted).toBe(100);
      expect(data.summary.overallAccuracy).toBe(75);
      expect(data.summary.readinessTier).toBe('Calibrating');

      // Weak topics gating:
      // General Intelligence: 25 attempted, 96% accuracy -> NOT weak
      // General Awareness: 25 attempted, 17 wrong, 32% accuracy -> WEAK (< 65% and attempted >= 3)
      expect(data.weakTopics).toHaveLength(1);
      expect(data.weakTopics[0].topic).toBe('General Awareness');
      expect(data.weakTopics[0].wrongCount).toBe(17);
      expect(data.weakTopics[0].accuracy).toBe(32);
      expect(data.weakTopics[0].severity).toBe('CRITICAL'); // < 40%
    });
  });

  describe('Multi-Test Benchmarking & Filter Support', () => {
    beforeEach(() => {
      // Setup 3 tests to exit calibration into established tiers
      // Test 1: 5 days ago, SSC CHSL
      const s1: ExamTestSession = {
        sessionId: 's-1',
        paperId: 'p-1',
        examId: 'ssc-chsl',
        paperTitle: 'SSC CHSL Mock 1',
        userId: 'user-123',
        startedAt: Date.now() - 5 * 86400000,
        lastSavedAt: Date.now() - 5 * 86400000,
        expiresAt: Date.now() - 5 * 86400000,
        completedAt: Date.now() - 5 * 86400000,
        status: 'SUBMITTED',
        durationSeconds: 3600,
        timeRemainingSeconds: 0,
        elapsedSeconds: 1800,
        userAnswers: {},
        questionStatuses: {},
        currentQuestionIndex: 10,
        currentSectionId: 'eng',
        version: 1,
        result: {
          sessionId: 's-1',
          paperId: 'p-1',
          examId: 'ssc-chsl',
          paperTitle: 'SSC CHSL Mock 1',
          totalQuestions: 10,
          maxMarks: 20,
          totalScore: 16,
          percentage: 80,
          accuracy: 80,
          correctCount: 8,
          wrongCount: 2,
          unansweredCount: 0,
          timeSpentSeconds: 1800,
          submittedAt: Date.now() - 5 * 86400000,
          sectionResults: {},
        },
      };

      // Test 2: 2 days ago, GATE CS
      const s2: ExamTestSession = {
        sessionId: 's-2',
        paperId: 'p-2',
        examId: 'gate-cs',
        paperTitle: 'GATE CS Mock 1',
        userId: 'user-123',
        startedAt: Date.now() - 2 * 86400000,
        lastSavedAt: Date.now() - 2 * 86400000,
        expiresAt: Date.now() - 2 * 86400000,
        completedAt: Date.now() - 2 * 86400000,
        status: 'COMPLETED',
        durationSeconds: 3600,
        timeRemainingSeconds: 0,
        elapsedSeconds: 2000,
        userAnswers: {},
        questionStatuses: {},
        currentQuestionIndex: 10,
        currentSectionId: 'cs',
        version: 1,
        result: {
          sessionId: 's-2',
          paperId: 'p-2',
          examId: 'gate-cs',
          paperTitle: 'GATE CS Mock 1',
          totalQuestions: 10,
          maxMarks: 20,
          totalScore: 18,
          percentage: 90,
          accuracy: 90,
          correctCount: 9,
          wrongCount: 1,
          unansweredCount: 0,
          timeSpentSeconds: 2000,
          submittedAt: Date.now() - 2 * 86400000,
          sectionResults: {},
        },
      };

      // Test 3: Today, Custom AI test
      const t3: TestHistory = {
        id: 'c-3',
        title: 'Data Structures Drill',
        category: 'Computer Science',
        createdAt: Date.now() - 10000,
        lastTakenAt: Date.now(),
        bestScore: 9,
        bestScorePercent: 90,
        bestTotal: 10,
        wrongCount: 1,
        lastTimeSpentSeconds: 600,
        questions: [],
      };

      ExamSessionService.setLocalSessions('user-123', [s1, s2]);
      storage.saveTest(t3);
    });

    it('classifies readiness tier as Mastery when accuracy >= 85% with >= 3 tests', () => {
      const data = AnalyticsService.getUserAnalytics('user-123');

      expect(data.summary.testsAttempted).toBe(3);
      // Correct: 8 + 9 + 9 = 26. Attempted: 10 + 10 + 10 = 30. Accuracy: 26/30 = 86.67% -> 87%
      expect(data.summary.overallAccuracy).toBe(87);
      expect(data.summary.readinessTier).toBe('Mastery');
      expect(data.trend).toHaveLength(3);
    });

    it('filters records by examId', () => {
      const data = AnalyticsService.getUserAnalytics('user-123', { examId: 'ssc-chsl' });
      expect(data.summary.testsAttempted).toBe(1);
      expect(data.summary.overallAccuracy).toBe(80);
      expect(data.trend[0].title).toBe('SSC CHSL Mock 1');
    });

    it('filters records by dateRange', () => {
      // 7d includes all 3 (completed today, 2d ago, 5d ago)
      const data7d = AnalyticsService.getUserAnalytics('user-123', { dateRange: '7d' });
      expect(data7d.summary.testsAttempted).toBe(3);

      // Add older test 40 days ago
      const sOld: ExamTestSession = {
        sessionId: 's-old',
        paperId: 'p-old',
        examId: 'ssc-chsl',
        paperTitle: 'Old Paper',
        userId: 'user-123',
        startedAt: Date.now() - 40 * 86400000,
        lastSavedAt: Date.now() - 40 * 86400000,
        expiresAt: Date.now() - 40 * 86400000,
        completedAt: Date.now() - 40 * 86400000,
        status: 'SUBMITTED',
        durationSeconds: 3600,
        timeRemainingSeconds: 0,
        elapsedSeconds: 1000,
        userAnswers: {},
        questionStatuses: {},
        currentQuestionIndex: 5,
        currentSectionId: 'eng',
        version: 1,
        result: {
          sessionId: 's-old',
          paperId: 'p-old',
          examId: 'ssc-chsl',
          paperTitle: 'Old Paper',
          totalQuestions: 5,
          maxMarks: 10,
          totalScore: 5,
          percentage: 50,
          accuracy: 50,
          correctCount: 2,
          wrongCount: 2,
          unansweredCount: 1,
          timeSpentSeconds: 1000,
          submittedAt: Date.now() - 40 * 86400000,
          sectionResults: {},
        },
      };

      const existing = ExamSessionService.getLocalSessions('user-123');
      ExamSessionService.setLocalSessions('user-123', [...existing, sOld]);

      const data30d = AnalyticsService.getUserAnalytics('user-123', { dateRange: '30d' });
      expect(data30d.summary.testsAttempted).toBe(3); // excludes 40d old

      const dataAll = AnalyticsService.getUserAnalytics('user-123', { dateRange: 'all' });
      expect(dataAll.summary.testsAttempted).toBe(4);
    });
  });
});
