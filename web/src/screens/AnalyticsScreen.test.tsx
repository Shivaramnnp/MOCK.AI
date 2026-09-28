import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AnalyticsScreen } from './AnalyticsScreen';
import { storage } from '../services/storage';
import { ExamSessionService } from '../services/examSessionService';
import { TestHistory, ExamTestSession, ExamResultSummary } from '../types';

describe('AnalyticsScreen', () => {
  const mockOnPracticeTopic = vi.fn();
  const mockOnNavigateExplore = vi.fn();
  const mockOnReviewTest = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Zero-Data Empty State', () => {
    it('renders clean empty state with 0 tests and no fake numbers or topics', () => {
      // Clean seed tests without completed tests
      const tests = storage.getTests();

      render(
        <AnalyticsScreen
          tests={tests}
          streakCount={0}
          userId="guest"
          onPracticeTopic={mockOnPracticeTopic}
          onNavigateExplore={mockOnNavigateExplore}
          onReviewTest={mockOnReviewTest}
        />
      );

      // Verify Screen Header
      expect(screen.getByText('Performance Analytics')).toBeDefined();
      expect(screen.getByText('0 Day Streak Active')).toBeDefined();

      // Verify Empty State Card
      expect(screen.getByText('No Test Attempts Yet')).toBeDefined();
      expect(
        screen.getByText(/Take a previous-year competitive exam or generate a custom AI mock test/i)
      ).toBeDefined();
      expect(screen.getByText('Explore Competitive Exams')).toBeDefined();

      // Verify 4 Metric Cards Show Real Zeros (NO FAKE PREVIEW / 82% / 42)
      expect(screen.getByText('Tests Attempted')).toBeDefined();
      expect(screen.getByText('0 completed sessions')).toBeDefined();

      expect(screen.getByText('Overall Accuracy')).toBeDefined();
      expect(screen.getByText('—')).toBeDefined(); // Displays '—' instead of fake '82%'

      expect(screen.getByText('Questions Practiced')).toBeDefined();
      expect(screen.getByText('Across 0 tests')).toBeDefined();

      expect(screen.getByText('Readiness Tier')).toBeDefined();
      expect(screen.getByText('Not Started')).toBeDefined();

      // Ensure NO fake topics or unscientific claims exist
      expect(screen.queryByText('Sorting Algorithms')).toBeNull();
      expect(screen.queryByText('Rotational Dynamics')).toBeNull();
      expect(screen.queryByText('Aldehydes & Ketones')).toBeNull();
      expect(screen.queryByText('High percentile forecast')).toBeNull();

      // Weak topics card should say "No Error Data Recorded"
      expect(screen.getByText('No Error Data Recorded')).toBeDefined();
    });

    it('clicking Explore Competitive Exams triggers navigation callback', () => {
      const tests = storage.getTests();

      render(
        <AnalyticsScreen
          tests={tests}
          streakCount={0}
          userId="guest"
          onPracticeTopic={mockOnPracticeTopic}
          onNavigateExplore={mockOnNavigateExplore}
          onReviewTest={mockOnReviewTest}
        />
      );

      const exploreBtn = screen.getByText('Explore Competitive Exams');
      fireEvent.click(exploreBtn);
      expect(mockOnNavigateExplore).toHaveBeenCalledTimes(1);
    });
  });

  describe('Single Completed Test (Calibrating State)', () => {
    it('renders single test metrics accurately without NaN SVG errors', () => {
      const test: TestHistory = {
        id: 'test-physics-1',
        title: 'Mechanics Diagnostic',
        category: 'Physics',
        createdAt: Date.now() - 3600000,
        lastTakenAt: Date.now(),
        bestScore: 4,
        bestScorePercent: 80,
        bestTotal: 5,
        wrongCount: 1,
        lastTimeSpentSeconds: 120,
        questions: Array.from({ length: 5 }, (_, i) => ({
          questionText: `Q${i}`,
          options: ['A', 'B', 'C', 'D'],
          correctAnswerIndex: 0,
          topic: 'Kinematics',
        })),
        userAnswers: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1 },
      };

      storage.saveTest(test);
      const tests = storage.getTests();

      render(
        <AnalyticsScreen
          tests={tests}
          streakCount={3}
          userId="guest"
          onPracticeTopic={mockOnPracticeTopic}
          onNavigateExplore={mockOnNavigateExplore}
          onReviewTest={mockOnReviewTest}
        />
      );

      // Verify 4 Metric Cards
      expect(screen.getByText('Tests Attempted')).toBeDefined();
      // Total correct = 4, Total attempted = 5 -> Accuracy = 80%
      expect(screen.getAllByText('80%').length).toBeGreaterThan(0);
      expect(screen.getByText('4 correct of 5 answered')).toBeDefined();
      expect(screen.getByText('Calibrating')).toBeDefined();

      // Verify Calibrating Banner
      expect(screen.getByText(/Readiness Calibration Active/i)).toBeDefined();

      // Single test baseline card (no NaN line path)
      expect(screen.getByText('Initial Baseline Recorded')).toBeDefined();
      expect(screen.getByText('80% Accuracy')).toBeDefined();
      expect(screen.getAllByText(/Mechanics Diagnostic/i).length).toBeGreaterThan(0);

      // Kinematics has 80% accuracy -> NOT in weak topics
      expect(screen.getByText('No Weak Spots Detected!')).toBeDefined();
    });
  });

  describe('Multi-Test State with Weak Topics & Filtering', () => {
    beforeEach(() => {
      // Setup 3 tests: 1 custom test + 2 competitive sessions
      const s1Result: ExamResultSummary = {
        sessionId: 'sess-chsl-1',
        paperId: 'paper-chsl',
        examId: 'ssc-chsl',
        paperTitle: 'SSC CHSL Tier 1 Paper',
        totalQuestions: 20,
        maxMarks: 40,
        totalScore: 20,
        percentage: 50,
        accuracy: 60,
        correctCount: 12,
        wrongCount: 8,
        unansweredCount: 0,
        timeSpentSeconds: 1200,
        submittedAt: Date.now() - 86400000,
        sectionResults: {
          quant: {
            sectionId: 'quant',
            sectionName: 'Quantitative Aptitude',
            totalQuestions: 10,
            maxMarks: 20,
            attempted: 10,
            correct: 4,
            wrong: 6, // 40% accuracy -> WEAK (< 65%)
            skipped: 0,
            score: 5,
            accuracy: 40,
            timeSpentSeconds: 600,
          },
          english: {
            sectionId: 'english',
            sectionName: 'English Comprehension',
            totalQuestions: 10,
            maxMarks: 20,
            attempted: 10,
            correct: 8,
            wrong: 2, // 80% accuracy -> Passing
            skipped: 0,
            score: 15,
            accuracy: 80,
            timeSpentSeconds: 600,
          },
        },
      };

      const s1: ExamTestSession = {
        sessionId: 'sess-chsl-1',
        paperId: 'paper-chsl',
        examId: 'ssc-chsl',
        paperTitle: 'SSC CHSL Tier 1 Paper',
        userId: 'user-vip',
        startedAt: Date.now() - 86400000,
        lastSavedAt: Date.now() - 86400000,
        expiresAt: Date.now() - 86400000,
        completedAt: Date.now() - 86400000,
        status: 'SUBMITTED',
        durationSeconds: 3600,
        timeRemainingSeconds: 0,
        elapsedSeconds: 1200,
        userAnswers: {},
        questionStatuses: {},
        currentQuestionIndex: 19,
        currentSectionId: 'english',
        version: 2,
        result: s1Result,
      };

      const s2Result: ExamResultSummary = {
        sessionId: 'sess-chsl-2',
        paperId: 'paper-chsl',
        examId: 'ssc-chsl',
        paperTitle: 'SSC CHSL Tier 1 Shift 2',
        totalQuestions: 20,
        maxMarks: 40,
        totalScore: 32,
        percentage: 80,
        accuracy: 85,
        correctCount: 17,
        wrongCount: 3,
        unansweredCount: 0,
        timeSpentSeconds: 1500,
        submittedAt: Date.now(),
        sectionResults: {
          quant: {
            sectionId: 'quant',
            sectionName: 'Quantitative Aptitude',
            totalQuestions: 10,
            maxMarks: 20,
            attempted: 10,
            correct: 7,
            wrong: 3,
            skipped: 0,
            score: 12.5,
            accuracy: 70,
            timeSpentSeconds: 700,
          },
        },
      };

      const s2: ExamTestSession = {
        sessionId: 'sess-chsl-2',
        paperId: 'paper-chsl',
        examId: 'ssc-chsl',
        paperTitle: 'SSC CHSL Tier 1 Shift 2',
        userId: 'user-vip',
        startedAt: Date.now(),
        lastSavedAt: Date.now(),
        expiresAt: Date.now(),
        completedAt: Date.now(),
        status: 'COMPLETED',
        durationSeconds: 3600,
        timeRemainingSeconds: 0,
        elapsedSeconds: 1500,
        userAnswers: {},
        questionStatuses: {},
        currentQuestionIndex: 19,
        currentSectionId: 'quant',
        version: 3,
        result: s2Result,
      };

      const t3: TestHistory = {
        id: 'test-custom-1',
        title: 'Algorithms Revision Quiz',
        category: 'Computer Science',
        createdAt: Date.now() - 10000,
        lastTakenAt: Date.now(),
        bestScore: 5,
        bestScorePercent: 100,
        bestTotal: 5,
        wrongCount: 0,
        lastTimeSpentSeconds: 300,
        questions: [],
      };

      ExamSessionService.setLocalSessions('user-vip', [s1, s2]);
      storage.saveTest(t3);
    });

    it('renders weak topics accurately with Practice Topic button', () => {
      const tests = storage.getTests();

      render(
        <AnalyticsScreen
          tests={tests}
          streakCount={5}
          userId="user-vip"
          onPracticeTopic={mockOnPracticeTopic}
          onNavigateExplore={mockOnNavigateExplore}
          onReviewTest={mockOnReviewTest}
        />
      );

      // Quant had 20 attempted, 11 correct, 9 wrong -> 55% accuracy (< 65% and >= 3 attempted) -> Weak Topic!
      expect(screen.getAllByText('Quantitative Aptitude').length).toBeGreaterThan(0);
      expect(screen.getByText(/9 missed of 20 attempted/i)).toBeDefined();

      // Click "Practice Topic" button
      const practiceBtns = screen.getAllByText('Practice Topic');
      expect(practiceBtns.length).toBeGreaterThan(0);
      fireEvent.click(practiceBtns[0]);

      expect(mockOnPracticeTopic).toHaveBeenCalledWith('Quantitative Aptitude');
    });

    it('filters metrics when changing exam filter dropdown', () => {
      const tests = storage.getTests();

      render(
        <AnalyticsScreen
          tests={tests}
          streakCount={5}
          userId="user-vip"
          onPracticeTopic={mockOnPracticeTopic}
          onNavigateExplore={mockOnNavigateExplore}
          onReviewTest={mockOnReviewTest}
        />
      );

      // Initially shows all 3 tests in filter dropdown
      expect(screen.getByText(/All Practice & Exams/i)).toBeDefined();

      // Change exam filter dropdown to custom tests only
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'custom' } });

      // Custom has 1 test with 100% accuracy
      expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
    });

    it('renders recent completed tests table and fires onReviewTest', () => {
      const tests = storage.getTests();

      render(
        <AnalyticsScreen
          tests={tests}
          streakCount={5}
          userId="user-vip"
          onPracticeTopic={mockOnPracticeTopic}
          onNavigateExplore={mockOnNavigateExplore}
          onReviewTest={mockOnReviewTest}
        />
      );

      expect(screen.getByText('Recent Completed Tests')).toBeDefined();
      expect(screen.getByText('SSC CHSL Tier 1 Shift 2')).toBeDefined();
      expect(screen.getByText('Algorithms Revision Quiz')).toBeDefined();

      const reviewButtons = screen.getAllByText('Review');
      expect(reviewButtons.length).toBeGreaterThan(0);

      fireEvent.click(reviewButtons[0]);
      expect(mockOnReviewTest).toHaveBeenCalled();
    });
  });
});
