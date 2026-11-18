// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TopicPracticeScreen } from './TopicPracticeScreen';
import { ExamPaper } from '../types';

describe('TopicPracticeScreen — Complete Student Journey UI Test', () => {
  const mockOnBack = vi.fn();
  const mockOnStartTest = vi.fn();
  const mockOnNavigateToFullLength = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the two-mode switcher and all 5 journey steps including Review & Start summary', () => {
    render(
      <TopicPracticeScreen
        initialExamId="gate"
        onBack={mockOnBack}
        onStartTest={mockOnStartTest}
        onNavigateToFullLength={mockOnNavigateToFullLength}
      />
    );

    // Header & Two Testing Modes ONLY (no Subject-wise Test third mode)
    expect(screen.getAllByText('Topic-wise Practice').length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: 'Whole Mock Test' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Topic-wise Test' })).toBeInTheDocument();
    expect(screen.queryByText(/Subject-wise Test/i)).not.toBeInTheDocument();

    // 5 Steps & Progress Nav
    expect(screen.getByLabelText('Topic-wise practice steps')).toBeInTheDocument();
    expect(screen.getByText(/Select Examination/i)).toBeInTheDocument();
    expect(screen.getByText(/Select Subject/i)).toBeInTheDocument();
    expect(screen.getByText(/Configure Practice Test/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Review & Start/i).length).toBeGreaterThan(0);

    // Configuration Options
    expect(screen.getByText(/A\. Question Count/i)).toBeInTheDocument();
    expect(screen.getByText(/B\. Duration/i)).toBeInTheDocument();
    expect(screen.getByText(/C\. Difficulty/i)).toBeInTheDocument();
    expect(screen.getByText(/D\. Question Source/i)).toBeInTheDocument();

    // Live Test Summary & 4-bucket Classification Integrity Breakdown
    expect(screen.getByLabelText('Live Test Summary')).toBeInTheDocument();
    expect(screen.getByLabelText('Question classification breakdown')).toBeInTheDocument();
    expect(screen.getByText('Verified Eligible')).toBeInTheDocument();
    expect(screen.getByText('Provisional')).toBeInTheDocument();
    expect(screen.getByText('Pending Review')).toBeInTheDocument();
    expect(screen.getByText('Unclassified')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verified Only' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Verified Marking Scheme/i)).toBeInTheDocument();
  });

  it('switches examination when student clicks another exam card', () => {
    render(
      <TopicPracticeScreen
        initialExamId="gate"
        onBack={mockOnBack}
        onStartTest={mockOnStartTest}
      />
    );

    const sscCard = screen.getByText('SSC CHSL');
    fireEvent.click(sscCard);

    // Verified marking scheme updates to SSC rules
    expect(screen.getByText(/\+2\.0 correct \| -0\.50 negative/i)).toBeInTheDocument();
  });

  it('allows subject selection (e.g. Machine Learning)', () => {
    render(
      <TopicPracticeScreen
        initialExamId="gate"
        initialSubjectId="machine_learning"
        onBack={mockOnBack}
        onStartTest={mockOnStartTest}
      />
    );

    // Subject selection exists
    const mlSubjectButton = screen.getAllByText('Machine Learning')[0];
    expect(mlSubjectButton).toBeInTheDocument();
  });

  it('allows selecting single or multiple topics with live question count badges', () => {
    render(
      <TopicPracticeScreen
        initialExamId="gate"
        initialSubjectId="data_science_ai"
        onBack={mockOnBack}
        onStartTest={mockOnStartTest}
      />
    );

    // Machine Learning topic in Data Science & AI
    const mlTopic = screen.getAllByText('Machine Learning')[0];
    fireEvent.click(mlTopic);

    // "Select All" button selects all available topics
    const selectAllBtn = screen.getByText('Select All');
    fireEvent.click(selectAllBtn);

    // Should indicate selected count
    expect(screen.getAllByText(/Selected/i)[0]).toBeInTheDocument();

    // "Clear Selection" clears topics
    const clearBtn = screen.getByText('Clear Selection');
    fireEvent.click(clearBtn);
    expect(screen.getByText('0 Selected')).toBeInTheDocument();
  });

  it('toggles timed and untimed practice mode', () => {
    render(
      <TopicPracticeScreen
        initialExamId="gate"
        initialSubjectId="data_science_ai"
        initialTopicId="machine_learning"
        onBack={mockOnBack}
        onStartTest={mockOnStartTest}
      />
    );

    const untimedBtn = screen.getByRole('button', { name: 'Untimed' });
    fireEvent.click(untimedBtn);

    expect(
      screen.getByText(/Untimed mode allows stopwatch reflection without countdown exam pressure/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Untimed (Stopwatch)')).toBeInTheDocument();
  });

  it('displays validation error if student attempts to start test with 0 topics selected', () => {
    render(
      <TopicPracticeScreen
        initialExamId="gate"
        initialSubjectId="data_science_ai"
        onBack={mockOnBack}
        onStartTest={mockOnStartTest}
      />
    );

    // Ensure 0 topics selected
    const clearBtn = screen.getByText('Clear Selection');
    fireEvent.click(clearBtn);

    // Start Test button
    const startBtn = screen.getByRole('button', { name: /Start Practice Test/i });
    fireEvent.click(startBtn);

    // Button should be disabled or show message
    expect(startBtn).toBeDisabled();
  });

  it('generates a strictly verified practice test by default and provisional practice only when opted in', () => {
    render(
      <TopicPracticeScreen
        initialExamId="gate"
        initialSubjectId="data_science_ai"
        initialTopicId="machine_learning"
        onBack={mockOnBack}
        onStartTest={mockOnStartTest}
      />
    );

    // By default (Verified Only), machine_learning has 0 staff-verified questions -> Start MUST be disabled
    const startBtn = screen.getByRole('button', { name: /Start Practice Test/i });
    expect(startBtn).toBeDisabled();
    expect(screen.getByText(/0 verified questions eligible/i)).toBeInTheDocument();

    // Explicit opt-in to Provisional Practice unlocks provisional pool with clear labeling
    fireEvent.click(screen.getByRole('button', { name: 'Include Provisional' }));
    expect(startBtn).not.toBeDisabled();

    fireEvent.click(startBtn);

    expect(mockOnStartTest).toHaveBeenCalledTimes(1);
    const generatedPaper: ExamPaper = mockOnStartTest.mock.calls[0][0];

    expect(generatedPaper.id).toContain('practice_gate_data_science_ai_');
    expect(generatedPaper.testingMode).toBe('TOPIC_PRACTICE');
    expect(generatedPaper.questions.length).toBeGreaterThan(0);
    expect(generatedPaper.isTopicPractice).toBe(true);
    expect(generatedPaper.isProvisionalPractice).toBe(true);
  });

  it('navigates to Whole Mock Test when clicking Whole Mock Test in header', () => {
    render(
      <TopicPracticeScreen
        initialExamId="gate"
        onBack={mockOnBack}
        onStartTest={mockOnStartTest}
        onNavigateToFullLength={mockOnNavigateToFullLength}
      />
    );

    const wholeMockBtn = screen.getByRole('tab', { name: 'Whole Mock Test' });
    fireEvent.click(wholeMockBtn);

    expect(mockOnNavigateToFullLength).toHaveBeenCalledWith('gate');
  });

  it('keeps Requested, Eligible, and Planned counts distinct in the Live Test Summary', () => {
    render(
      <TopicPracticeScreen
        initialExamId="gate"
        initialSubjectId="machine_learning"
        onBack={mockOnBack}
        onStartTest={mockOnStartTest}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Include Provisional' }));
    fireEvent.click(screen.getByText('Select All'));
    const eligibleNum = Number(screen.getByTestId('summary-eligible-count').textContent);
    expect(eligibleNum).toBeGreaterThan(0);
    expect(eligibleNum).toBeLessThan(30);

    // Request 30 (> eligible): Requested = 30, Eligible = eligibleNum, Planned = '—'
    fireEvent.click(screen.getByRole('button', { name: '30' }));
    expect(screen.getByTestId('summary-requested-count')).toHaveTextContent('30');
    expect(screen.getByTestId('summary-eligible-count')).toHaveTextContent(String(eligibleNum));
    expect(screen.getByTestId('summary-planned-count')).toHaveTextContent('—');

    // Request 5 (<= eligible): Requested = 5, Eligible = eligibleNum, Planned = 5
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    expect(screen.getByTestId('summary-requested-count')).toHaveTextContent('5');
    expect(screen.getByTestId('summary-eligible-count')).toHaveTextContent(String(eligibleNum));
    expect(screen.getByTestId('summary-planned-count')).toHaveTextContent('5');
  });

  describe('Question Count Synchronization & Validation UI', () => {
    it('displays uncapped eligible count (> 30) and generates exactly 30 questions when opted into provisional pool >= 30', () => {
      render(
        <TopicPracticeScreen
          initialExamId="gate"
          initialSubjectId="engineering_mathematics"
          onBack={mockOnBack}
          onStartTest={mockOnStartTest}
        />
      );

      // Explicitly opt into Provisional Practice to test large (> 30) uncapped pool
      fireEvent.click(screen.getByRole('button', { name: 'Include Provisional' }));
      fireEvent.click(screen.getByText('Select All'));

      // Eligible counter must NOT be capped at 10 and is truthfully labeled provisional
      const eligibleBadge = screen.getByText(/eligible \(provisional\) questions eligible/i);
      const countMatch = eligibleBadge.textContent?.match(/(\d+)\s+eligible/);
      const eligibleNum = countMatch ? Number(countMatch[1]) : 0;
      expect(eligibleNum).toBeGreaterThan(30);

      // Select preset 30
      fireEvent.click(screen.getByRole('button', { name: '30' }));

      expect(screen.getByText(/Ready to generate/i).textContent).toMatch(/Ready to generate\s+30\s+questions/i);

      const startBtn = screen.getByRole('button', { name: /Start Practice Test/i });
      expect(startBtn).not.toBeDisabled();
      fireEvent.click(startBtn);

      expect(mockOnStartTest).toHaveBeenCalledTimes(1);
      const paper: ExamPaper = mockOnStartTest.mock.calls[0][0];
      expect(paper.questions.length).toBe(30);
      expect(paper.totalQuestions).toBe(30);
      expect(paper.isProvisionalPractice).toBe(true);
    });

    it('warns, blocks submission, and supports explicit adjustment when requested preset exceeds eligible pool', () => {
      render(
        <TopicPracticeScreen
          initialExamId="gate"
          initialSubjectId="machine_learning"
          onBack={mockOnBack}
          onStartTest={mockOnStartTest}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Include Provisional' }));
      fireEvent.click(screen.getByText('Select All'));

      const eligibleBadge = screen.getByText(/eligible \(provisional\) questions eligible/i);
      const eligibleNum = Number(eligibleBadge.textContent?.match(/(\d+)\s+eligible/)?.[1] || 0);
      expect(eligibleNum).toBeGreaterThan(0);
      expect(eligibleNum).toBeLessThan(30);

      // Select preset 30 (> eligible)
      fireEvent.click(screen.getByRole('button', { name: '30' }));

      // Must NOT display a misleading "Ready to generate" message
      expect(screen.queryByText(/Ready to generate/i)).not.toBeInTheDocument();

      // Must display explicit availability warning and disable Start button
      expect(
        screen.getAllByText(new RegExp(`Only ${eligibleNum} eligible \\(provisional\\) questions are available`, 'i')).length
      ).toBeGreaterThan(0);
      const startBtn = screen.getByRole('button', { name: /Start Practice Test/i });
      expect(startBtn).toBeDisabled();

      // Click explicit one-click adjust button
      const adjustBtn = screen.getByRole('button', { name: new RegExp(`Set to ${eligibleNum}`, 'i') });
      fireEvent.click(adjustBtn);

      // Readiness message and Start button synchronize cleanly
      expect(screen.getByText(/Ready to generate/i).textContent).toMatch(
        new RegExp(`Ready to generate\\s+${eligibleNum}\\s+questions`, 'i')
      );
      expect(startBtn).not.toBeDisabled();

      fireEvent.click(startBtn);
      expect(mockOnStartTest).toHaveBeenCalledTimes(1);
      const paper: ExamPaper = mockOnStartTest.mock.calls[0][0];
      expect(paper.questions.length).toBe(eligibleNum);
    });

    it('rejects 500, 0, -5, and non-numeric custom counts and never silently generates a mismatched count', () => {
      render(
        <TopicPracticeScreen
          initialExamId="gate"
          initialSubjectId="machine_learning"
          onBack={mockOnBack}
          onStartTest={mockOnStartTest}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Include Provisional' }));
      fireEvent.click(screen.getByText('Select All'));
      const customInput = screen.getByLabelText('Custom question count');
      const startBtn = screen.getByRole('button', { name: /Start Practice Test/i });

      // 500 -> Rejected, Start disabled, no "Ready to generate"
      fireEvent.change(customInput, { target: { value: '500' } });
      expect(startBtn).toBeDisabled();
      expect(screen.queryByText(/Ready to generate/i)).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/Only \d+ eligible \(provisional\) questions are available/i);

      // 0 -> Rejected
      fireEvent.change(customInput, { target: { value: '0' } });
      expect(startBtn).toBeDisabled();
      expect(screen.getByRole('alert')).toHaveTextContent(/at least 1/i);

      // -5 -> Rejected
      fireEvent.change(customInput, { target: { value: '-5' } });
      expect(startBtn).toBeDisabled();
      expect(screen.getByRole('alert')).toHaveTextContent(/at least 1/i);

      // Non-numeric -> Rejected
      fireEvent.change(customInput, { target: { value: 'abc' } });
      expect(startBtn).toBeDisabled();
      expect(screen.getByRole('alert')).toHaveTextContent(/valid whole number/i);

      // Valid count 5 -> Enabled and generates exactly 5
      fireEvent.change(customInput, { target: { value: '5' } });
      expect(startBtn).not.toBeDisabled();
      expect(screen.getByText(/Ready to generate/i).textContent).toMatch(/Ready to generate\s+5\s+questions/i);

      fireEvent.click(startBtn);
      expect(mockOnStartTest).toHaveBeenCalledTimes(1);
      expect(mockOnStartTest.mock.calls[0][0].questions.length).toBe(5);
    });

    it('recalculates custom-count validation immediately when difficulty or source filter shrinks eligible pool', () => {
      render(
        <TopicPracticeScreen
          initialExamId="gate"
          initialSubjectId="machine_learning"
          onBack={mockOnBack}
          onStartTest={mockOnStartTest}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Include Provisional' }));
      fireEvent.click(screen.getByText('Select All'));
      const eligibleAll = Number(
        screen.getByText(/eligible \(provisional\) questions eligible/i).textContent?.match(/(\d+)\s+eligible/)?.[1] || 0
      );
      expect(eligibleAll).toBeGreaterThan(4);

      const customInput = screen.getByLabelText('Custom question count');
      const startBtn = screen.getByRole('button', { name: /Start Practice Test/i });

      // Enter the full mixed eligible count -> valid
      fireEvent.change(customInput, { target: { value: String(eligibleAll) } });
      expect(startBtn).not.toBeDisabled();

      // Switch difficulty to Easy (1 Mark), shrinking eligible pool below custom count
      fireEvent.click(screen.getByRole('button', { name: 'Easy (1 Mark)' }));

      const eligibleEasy = Number(
        screen.getByText(/eligible \(provisional\) questions? eligible/i).textContent?.match(/(\d+)\s+eligible/)?.[1] || 0
      );
      expect(eligibleEasy).toBeLessThan(eligibleAll);

      // Validation immediately flags that requested count now exceeds eligible Easy pool
      expect(startBtn).toBeDisabled();
      expect(screen.getByRole('alert')).toHaveTextContent(
        new RegExp(`Only ${eligibleEasy} eligible \\(provisional\\)`, 'i')
      );

      // Switching source to Approved Practice Only (0 questions) immediately updates status
      fireEvent.click(screen.getByRole('button', { name: 'Approved Practice Only' }));
      expect(startBtn).toBeDisabled();
      expect(screen.getByText(/0 eligible \(provisional\) questions eligible/i)).toBeInTheDocument();
    });

    it('DEF-06: auto-selects owning subject for initialTopicId and allows clearing selection afterward', () => {
      render(
        <TopicPracticeScreen
          initialExamId="gate"
          initialTopicId="probability_statistics"
          onBack={mockOnBack}
          onStartTest={mockOnStartTest}
        />
      );

      // Automatically selected Engineering Mathematics (owner of probability_statistics)
      expect(screen.getByText(/Select Topics in Engineering Mathematics/i)).toBeInTheDocument();
      expect(screen.getByText('1 Selected')).toBeInTheDocument();

      // Clicking Clear Selection must stay cleared (not snap back to initialTopicId!)
      fireEvent.click(screen.getByRole('button', { name: /Clear Selection/i }));
      expect(screen.getByText('0 Selected')).toBeInTheDocument();
    });
  });
});
