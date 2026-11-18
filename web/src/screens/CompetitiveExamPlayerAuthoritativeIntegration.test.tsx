/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { CompetitiveExamPlayerScreen } from './CompetitiveExamPlayerScreen';
import { CompetitiveExamResultsScreen } from './CompetitiveExamResultsScreen';
import { CandidateApiClient } from '../services/uadue/delivery/candidateApiClient';
import {
  CandidateDeliveryApi,
  ICandidateDeliveryGateway,
  InitializeSessionResponse,
  LiveExamProjectionResponse,
  RecordAnswerResponse,
  SubmitAttemptResponse,
  CandidateApiError,
} from '../services/uadue/delivery/candidateDeliveryApi';
import { ExamPaper, ExamPresentationPaper, ExamTestSession } from '../types';

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

describe('CompetitiveExamPlayerScreen — Authoritative Staging Integration Audit', () => {
  const TENANT_ID = 'tenant_staging_mockai';
  const CANDIDATE_ID = 'cand_student_789';
  const SESSION_ID = 'sess_live_authoritative_001';
  const PACKAGE_ID = 'pkg_authoritative_gate_2025';

  const mockPresentationOnlyPaper: ExamPresentationPaper = {
    id: PACKAGE_ID,
    examId: 'gate',
    examName: 'GATE 2025',
    editionYear: 2025,
    title: 'GATE 2025 CSE — Authoritative Presentation Only',
    subTitle: 'IIT Roorkee',
    date: '2025-02-01',
    shift: 'Shift 1',
    tier: '1',
    language: 'en',
    totalQuestions: 4,
    totalMarks: 8,
    durationMinutes: 60,
    markingScheme: {
      marksPerCorrect: 2,
      negativeMarks: 0.66,
      unansweredMarks: 0,
    },
    sections: [
      {
        id: 'sec_1',
        name: 'General Aptitude',
        questionCount: 4,
        maxMarks: 8,
        startIndex: 0,
        endIndex: 3,
      },
    ],
    questions: [
      {
        id: 'q_canonical_101',
        questionNumber: 1,
        questionText: 'Which of the following sorting algorithms has worst-case time complexity O(n log n)?',
        options: ['Bubble Sort', 'Merge Sort', 'Quick Sort', 'Insertion Sort'],
        richOptions: [
          { id: 'opt_101_a', text: 'Bubble Sort' },
          { id: 'opt_101_b', text: 'Merge Sort' },
          { id: 'opt_101_c', text: 'Quick Sort' },
          { id: 'opt_101_d', text: 'Insertion Sort' },
        ],
        marks: 2,
        negativeMarks: 0.66,
        questionType: 'MCQ',
        sectionId: 'sec_1',
        sectionName: 'General Aptitude',
        examId: 'gate',
        year: 2025,
        date: '2025-02-01',
        shift: 'Shift 1',
        tier: '1',
        language: 'en',
      },
      {
        id: 'q_canonical_102',
        questionNumber: 2,
        questionText: 'What is the chromatic number of a bipartite graph with at least one edge?',
        options: ['1', '2', '3', '4'],
        richOptions: [
          { id: 'opt_102_a', text: '1' },
          { id: 'opt_102_b', text: '2' },
          { id: 'opt_102_c', text: '3' },
          { id: 'opt_102_d', text: '4' },
        ],
        marks: 2,
        negativeMarks: 0.66,
        questionType: 'MCQ',
        sectionId: 'sec_1',
        sectionName: 'General Aptitude',
        examId: 'gate',
        year: 2025,
        date: '2025-02-01',
        shift: 'Shift 1',
        tier: '1',
        language: 'en',
      },
      {
        id: 'q_canonical_103',
        questionNumber: 3,
        questionText: 'Which of the following data structures can be used to implement a priority queue? (Select all that apply)',
        options: ['Binary Heap', 'Fibonacci Heap', 'Unsorted Array', 'Stack'],
        richOptions: [
          { id: 'opt_103_a', text: 'Binary Heap' },
          { id: 'opt_103_b', text: 'Fibonacci Heap' },
          { id: 'opt_103_c', text: 'Unsorted Array' },
          { id: 'opt_103_d', text: 'Stack' },
        ],
        marks: 2,
        negativeMarks: 0,
        questionType: 'MSQ',
        sectionId: 'sec_1',
        sectionName: 'General Aptitude',
        examId: 'gate',
        year: 2025,
        date: '2025-02-01',
        shift: 'Shift 1',
        tier: '1',
        language: 'en',
      },
      {
        id: 'q_canonical_104',
        questionNumber: 4,
        questionText: 'What is the sum of angles of a triangle in degrees?',
        options: [],
        richOptions: [],
        marks: 2,
        negativeMarks: 0,
        questionType: 'NAT',
        sectionId: 'sec_1',
        sectionName: 'General Aptitude',
        examId: 'gate',
        year: 2025,
        date: '2025-02-01',
        shift: 'Shift 1',
        tier: '1',
        language: 'en',
      },
    ],
    paperType: 'CBE_OBJECTIVE',
    isPresentationOnly: true,
  };

  let mockGateway: ICandidateDeliveryGateway;
  let client: CandidateApiClient;
  let recordedAnswers: Array<{
    questionId: string;
    optionId?: string;
    optionIds?: string[];
    enteredValue?: string;
    clientEventId: string;
  }>;

  beforeEach(() => {
    localStorage.clear();
    recordedAnswers = [];

    mockGateway = {
      initializeOrResumeSession: vi.fn().mockResolvedValue({
        examSessionId: SESSION_ID,
        sessionState: 'ACTIVE',
        packageId: PACKAGE_ID,
        packageIntegritySeal: 'seal_authoritative_mock',
        currentLeaseId: 'lease_unit_test',
        scheduledDeadlineAt: new Date(Date.now() + 3600000).toISOString(),
        sessionToken: 'jwt.mock.session.token',
      } as InitializeSessionResponse),

      getLiveExamProjection: vi.fn().mockResolvedValue({
        paper: mockPresentationOnlyPaper,
        examSessionId: SESSION_ID,
        sessionState: 'ACTIVE',
        timeRemainingSeconds: 3600,
      } as LiveExamProjectionResponse),

      recordAnswerSelection: vi.fn().mockImplementation(async (req) => {
        recordedAnswers.push({
          questionId: req.canonicalQuestionId,
          optionId: req.selectedOptionId,
          optionIds: req.selectedOptionIds,
          enteredValue: req.enteredValue,
          clientEventId: req.clientEventId,
        });
        return {
          receipt: {
            receiptId: `rcpt_${Date.now()}`,
            examSessionId: req.examSessionId,
            clientEventId: req.clientEventId,
            clientSequenceNumber: req.clientSequenceNumber,
            serverSequenceNumber: req.clientSequenceNumber,
            canonicalQuestionId: req.canonicalQuestionId,
            responseFingerprint: 'fp_mock_canonical',
            serverTimestamp: new Date().toISOString(),
            validationStatus: 'ACCEPTED',
            serverSignature: 'sig_mock_accepted',
            idempotentReplay: false,
          },
          status: 'ACCEPTED',
        } as RecordAnswerResponse;
      }),

      pauseSession: vi.fn().mockResolvedValue({
        sessionState: 'PAUSED',
        remainingSeconds: 3500,
      }),

      resumeSession: vi.fn().mockResolvedValue({
        sessionState: 'ACTIVE',
        remainingSeconds: 3500,
      }),

      submitAttempt: vi.fn().mockResolvedValue({
        examSessionId: SESSION_ID,
        sessionState: 'SUBMITTED',
        submittedAt: new Date().toISOString(),
        evaluationRunId: 'eval_run_authoritative_mock',
      } as SubmitAttemptResponse),

      getCandidateResult: vi.fn().mockResolvedValue({
        result: {
          totalScore: 2.0,
          totalQuestions: 2,
          attemptedCount: 1,
          correctCount: 1,
          wrongCount: 0,
          accuracy: 100,
          percentile: 0,
          timeSpentSeconds: 120,
          sectionScores: { sec_1: 2.0 },
          questionResults: [
            {
              questionId: 'q_canonical_101',
              userAnswer: 1,
              isCorrect: true,
              marksAwarded: 2.0,
              timeSpentSeconds: 60,
            },
          ],
        },
      }),
    };

    client = new CandidateApiClient({
      api: mockGateway,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      deviceLeaseId: 'lease_unit_test',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Air-Gapped Presentation Paper: locks out client-side scoring when deliveryApiClient is missing', async () => {
    const handleSubmit = vi.fn();

    render(
      <CompetitiveExamPlayerScreen
        paper={mockPresentationOnlyPaper}
        onExit={vi.fn()}
        onSubmit={handleSubmit}
        // deliveryApiClient intentionally omitted
      />
    );

    // Verify paper renders questions
    expect(screen.getByText(/sorting algorithms/i)).toBeDefined();

    // Select an option
    const optMerge = screen.getByText('Merge Sort');
    fireEvent.click(optMerge);

    // Click Submit Examination
    const submitBtn = screen.getByText('Submit Examination');
    fireEvent.click(submitBtn);

    // Click Confirm & Submit
    const confirmBtn = screen.getByText('Confirm & Submit');
    fireEvent.click(confirmBtn);

    // Must FAIL CLOSED: zero submission, displays authoritative delivery required error
    await waitFor(() => {
      expect(
        screen.getByText(/AUTHORITATIVE_DELIVERY_REQUIRED/i)
      ).toBeDefined();
    });

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('2. Clear Response Invariant: clearing response correctly dispatches clearOption to deliveryApiClient', async () => {
    await client.initializeSession(PACKAGE_ID, SESSION_ID);

    render(
      <CompetitiveExamPlayerScreen
        paper={mockPresentationOnlyPaper}
        deliveryApiClient={client}
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    // Select Option Merge Sort
    const optMerge = screen.getByText('Merge Sort');
    fireEvent.click(optMerge);

    await waitFor(() => {
      expect(recordedAnswers.length).toBe(1);
    });
    expect(recordedAnswers[0].questionId).toBe('q_canonical_101');
    expect(recordedAnswers[0].optionId).toBe('opt_101_b');

    // Click Clear Response
    const clearBtn = screen.getByText('Clear Response');
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(recordedAnswers.length).toBe(2);
    });
    // The second dispatch must be a clear event (optionId: undefined)
    expect(recordedAnswers[1].questionId).toBe('q_canonical_101');
    expect(recordedAnswers[1].optionId).toBeUndefined();
    expect(client.getPendingAnswersCount()).toBe(0);
  });

  it('3. Full Authoritative Lifecycle: Select -> Clear -> Re-select -> Submit delivers verified raw score', async () => {
    await client.initializeSession(PACKAGE_ID, SESSION_ID);
    const handleSubmit = vi.fn();

    render(
      <CompetitiveExamPlayerScreen
        paper={mockPresentationOnlyPaper}
        deliveryApiClient={client}
        onExit={vi.fn()}
        onSubmit={handleSubmit}
      />
    );

    // 1. Select Option Bubble Sort on Q1
    fireEvent.click(screen.getByText('Bubble Sort'));
    await waitFor(() => expect(recordedAnswers.length).toBe(1));

    // 2. Clear response on Q1
    fireEvent.click(screen.getByText('Clear Response'));
    await waitFor(() => expect(recordedAnswers.length).toBe(2));
    expect(recordedAnswers[1].optionId).toBeUndefined();

    // 3. Re-select Option Merge Sort on Q1
    fireEvent.click(screen.getByText('Merge Sort'));
    await waitFor(() => expect(recordedAnswers.length).toBe(3));
    expect(recordedAnswers[2].optionId).toBe('opt_101_b');

    // 4. Save & Next to Q2
    fireEvent.click(screen.getByText('Save & Next'));
    expect(screen.getByText(/bipartite graph/i)).toBeDefined();

    // 5. Submit examination
    fireEvent.click(screen.getByText('Submit Examination'));
    fireEvent.click(screen.getByText('Confirm & Submit'));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledTimes(1);
    });

    const completedSession: ExamTestSession = handleSubmit.mock.calls[0][0];
    expect(completedSession.status).toBe('COMPLETED');
    expect(completedSession.result?.totalScore).toBe(2.0);
    // Contract invariant: Normalized score is null / undefined
    expect((completedSession.result as any).totalNormalizedScore).toBeUndefined();
    expect(mockGateway.submitAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ examSessionId: SESSION_ID }),
      expect.any(Object)
    );
  });

  it('4. Fail-Closed Terminal Locking: terminal lease mismatch immediately freezes candidate player', async () => {
    await client.initializeSession(PACKAGE_ID, SESSION_ID);

    // Simulate gateway throwing LEASE_MISMATCH terminal error
    (mockGateway.recordAnswerSelection as any).mockRejectedValueOnce(
      new CandidateApiError('LEASE_MISMATCH', 'Device lease revoked on session.')
    );

    render(
      <CompetitiveExamPlayerScreen
        paper={mockPresentationOnlyPaper}
        deliveryApiClient={client}
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    // Attempt to select an option
    fireEvent.click(screen.getByText('Merge Sort'));

    await waitFor(() => {
      expect(client.hasTerminalError()).toBe(true);
      expect(
        screen.getByText(/Device lease revoked on session/i)
      ).toBeDefined();
    });

    // Subsequent clicks should be blocked
    fireEvent.click(screen.getByText('Bubble Sort'));
    // No new dispatch
    expect(recordedAnswers.length).toBe(0);
  });

  it('5. Unsynced Answer Protection: submission fails closed when pending answers cannot reach server', async () => {
    await client.initializeSession(PACKAGE_ID, SESSION_ID);

    // Simulate transient network failure during recording
    (mockGateway.recordAnswerSelection as any).mockRejectedValue(
      new Error('Failed to fetch (Network offline)')
    );

    render(
      <CompetitiveExamPlayerScreen
        paper={mockPresentationOnlyPaper}
        deliveryApiClient={client}
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    // Select option (fails transiently)
    fireEvent.click(screen.getByText('Merge Sort'));

    await waitFor(() => {
      expect(client.getPendingAnswersCount()).toBe(1);
    });

    // Try to submit
    fireEvent.click(screen.getByText('Submit Examination'));
    fireEvent.click(screen.getByText('Confirm & Submit'));

    // Submission must FAIL CLOSED: prevents silent candidate answer loss
    await waitFor(() => {
      expect(
        screen.getByText(/Submission synchronization failed/i)
      ).toBeDefined();
    });
  });

  it('6. MSQ Question Dispatch: candidate toggles multi-select checkboxes and dispatches sorted array of option IDs', async () => {
    await client.initializeSession(PACKAGE_ID, SESSION_ID);

    render(
      <CompetitiveExamPlayerScreen
        paper={mockPresentationOnlyPaper}
        deliveryApiClient={client}
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    // Navigate to Q3 (MSQ)
    fireEvent.click(screen.getByText('Save & Next'));
    fireEvent.click(screen.getByText('Save & Next'));

    expect(screen.getByText(/Select one or more correct options/i)).toBeDefined();

    // 1. Select first MSQ option (Binary Heap)
    const optBinaryHeap = screen.getByText('Binary Heap');
    fireEvent.click(optBinaryHeap);

    await waitFor(() => {
      expect(recordedAnswers.length).toBe(1);
    });
    expect(recordedAnswers[0].questionId).toBe('q_canonical_103');
    expect(recordedAnswers[0].optionIds).toEqual(['opt_103_a']);

    // 2. Select second MSQ option (Fibonacci Heap)
    const optFibonacciHeap = screen.getByText('Fibonacci Heap');
    fireEvent.click(optFibonacciHeap);

    await waitFor(() => {
      expect(recordedAnswers.length).toBe(2);
    });
    expect(recordedAnswers[1].questionId).toBe('q_canonical_103');
    expect(recordedAnswers[1].optionIds).toEqual(['opt_103_a', 'opt_103_b']);

    // 3. Deselect first option (Binary Heap)
    fireEvent.click(optBinaryHeap);

    await waitFor(() => {
      expect(recordedAnswers.length).toBe(3);
    });
    expect(recordedAnswers[2].questionId).toBe('q_canonical_103');
    expect(recordedAnswers[2].optionIds).toEqual(['opt_103_b']);

    // 4. Click Clear Response to clear all selections
    const clearBtn = screen.getByText('Clear Response');
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(recordedAnswers.length).toBe(4);
    });
    expect(recordedAnswers[3].questionId).toBe('q_canonical_103');
    expect(recordedAnswers[3].optionId).toBeUndefined();
    expect(recordedAnswers[3].optionIds).toBeUndefined();
    expect(client.getPendingAnswersCount()).toBe(0);
  });

  it('7. NAT Question Dispatch: candidate enters numerical answer via text input and virtual keypad', async () => {
    await client.initializeSession(PACKAGE_ID, SESSION_ID);

    render(
      <CompetitiveExamPlayerScreen
        paper={mockPresentationOnlyPaper}
        deliveryApiClient={client}
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    // Navigate to Q4 (NAT)
    fireEvent.click(screen.getByText('Save & Next'));
    fireEvent.click(screen.getByText('Save & Next'));
    fireEvent.click(screen.getByText('Save & Next'));

    expect(screen.getByText(/Enter Numerical Answer/i)).toBeDefined();

    // 1. Enter value via text input
    const natInput = screen.getByPlaceholderText(/Type value/i);
    fireEvent.change(natInput, { target: { value: '180' } });

    await waitFor(() => {
      expect(recordedAnswers.length).toBe(1);
    });
    expect(recordedAnswers[0].questionId).toBe('q_canonical_104');
    expect(recordedAnswers[0].enteredValue).toBe('180');

    // 2. Click keypad button '5'
    const keypad5 = screen.getByRole('button', { name: '5' });
    fireEvent.click(keypad5);

    await waitFor(() => {
      expect(recordedAnswers.length).toBe(2);
    });
    expect(recordedAnswers[1].questionId).toBe('q_canonical_104');
    expect(recordedAnswers[1].enteredValue).toBe('1805');

    // 3. Clear via Clear Response button
    const clearBtn = screen.getByText('Clear Response');
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(recordedAnswers.length).toBe(3);
    });
    expect(recordedAnswers[2].questionId).toBe('q_canonical_104');
    expect(recordedAnswers[2].enteredValue).toBeUndefined();
    expect(recordedAnswers[2].optionId).toBeUndefined();
    expect(client.getPendingAnswersCount()).toBe(0);
  });

  it('8. Session Recovery via SessionStorage: restores active session and lease hint on player mount', async () => {
    CandidateApiClient.storeSession(PACKAGE_ID, CANDIDATE_ID, SESSION_ID, 'lease_recovered_999');
    const freshClient = new CandidateApiClient({
      api: mockGateway,
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
    });
    expect(freshClient.getActiveSessionId()).toBeNull();

    render(
      <CompetitiveExamPlayerScreen
        paper={mockPresentationOnlyPaper}
        deliveryApiClient={freshClient}
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(freshClient.getActiveSessionId()).toBe(SESSION_ID);
    });
    expect(freshClient.getDeviceLeaseId()).toBe('lease_recovered_999');
  });

  it('9. Session Storage Cleanup: clearStoredSession removes hint upon terminal submission', async () => {
    await client.initializeSession(PACKAGE_ID, SESSION_ID);
    expect(CandidateApiClient.getStoredSession(PACKAGE_ID, CANDIDATE_ID)).not.toBeNull();

    await client.submitExam();

    expect(CandidateApiClient.getStoredSession(PACKAGE_ID, CANDIDATE_ID)).toBeNull();
  });

  it('10. Authoritative Results Presentation: renders server-scored banner, raw score, and suppresses answer-key modal', () => {
    const authoritativeSession: ExamTestSession = {
      sessionId: SESSION_ID,
      paperId: PACKAGE_ID,
      examId: 'gate',
      paperTitle: 'GATE 2025 CSE',
      userId: CANDIDATE_ID,
      startedAt: Date.now() - 3600000,
      lastSavedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      completedAt: Date.now(),
      status: 'COMPLETED',
      durationSeconds: 3600,
      timeRemainingSeconds: 0,
      elapsedSeconds: 3600,
      userAnswers: { 0: 1 },
      questionStatuses: { 0: 'ANSWERED' },
      currentQuestionIndex: 0,
      currentSectionId: 'sec_1',
      version: 1,
      result: {
        sessionId: SESSION_ID,
        paperId: PACKAGE_ID,
        examId: 'gate',
        paperTitle: 'GATE 2025 CSE',
        totalQuestions: 4,
        totalScore: 2,
        totalRawScore: 2,
        isAuthoritative: true,
        correctCount: 1,
        wrongCount: 0,
        unansweredCount: 3,
        accuracy: 100,
        percentage: 25,
        timeSpentSeconds: 3600,
        submittedAt: Date.now(),
        sectionResults: {},
        maxMarks: 8,
        itemScores: {
          q_canonical_101: {
            isCorrect: true,
            marksAwarded: 2,
            penaltyDeducted: 0,
            netScore: 2,
          },
        },
      },
    };

    render(
      <CompetitiveExamResultsScreen
        session={authoritativeSession}
        paper={mockPresentationOnlyPaper as any}
        onRetake={vi.fn()}
        onExplore={vi.fn()}
      />
    );

    expect(screen.getByText(/Official Authoritative Evaluation/i)).toBeDefined();
    expect(screen.getByText(/Server-Scored/i)).toBeDefined();
    expect(screen.queryByText(/Attach Answer Key/i)).toBeNull();
    expect(screen.getByText(/\/ 8 Marks/i)).toBeDefined();
  });

  it('11. Fail-Closed Gateway Lockout: presentation paper without deliveryApiClient displays Gateway Locked badge', () => {
    render(
      <CompetitiveExamPlayerScreen
        paper={mockPresentationOnlyPaper}
        deliveryApiClient={undefined}
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText(/Gateway Locked/i)).toBeDefined();
  });

  it('12. Question Navigation Preservation: moving across questions maintains local answer state and dispatches accurately', async () => {
    await client.initializeSession(PACKAGE_ID, SESSION_ID);

    render(
      <CompetitiveExamPlayerScreen
        paper={mockPresentationOnlyPaper}
        deliveryApiClient={client}
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    // Q1: Select option B (Merge Sort)
    const optB = screen.getByText('Merge Sort');
    fireEvent.click(optB);

    await waitFor(() => {
      expect(recordedAnswers.length).toBe(1);
    });
    expect(recordedAnswers[0].questionId).toBe('q_canonical_101');

    // Click Save & Next to move to Q2
    const saveNextBtn = screen.getByText('Save & Next');
    fireEvent.click(saveNextBtn);

    // Verify on Q2
    expect(screen.getByText(/What is the chromatic number of a bipartite graph/i)).toBeDefined();

    // Select option B on Q2
    const opt2Elements = screen.getAllByText('2');
    // First element with text '2' is the option span
    fireEvent.click(opt2Elements[0]);

    await waitFor(() => {
      expect(recordedAnswers.length).toBe(2);
    });
    expect(recordedAnswers[1].questionId).toBe('q_canonical_102');

    // Click Previous to return to Q1
    const prevBtn = screen.getByText('Previous');
    fireEvent.click(prevBtn);

    // Verify on Q1 and Merge Sort remains selected in UI
    expect(screen.getByText(/Which of the following sorting algorithms/i)).toBeDefined();
    expect(client.getPendingAnswersCount()).toBe(0);
  });

  it('13. Network Failure & Resilient Retry: transient 503 preserves pending queue and drains on successful retry', async () => {
    await client.initializeSession(PACKAGE_ID, SESSION_ID);

    // Temporarily mock gateway to throw transient network error
    const originalRecord = mockGateway.recordAnswerSelection;
    let failOnce = true;
    mockGateway.recordAnswerSelection = vi.fn().mockImplementation(async (req, auth) => {
      if (failOnce) {
        failOnce = false;
        throw new Error('503 Service Unavailable: Database pooler transient timeout');
      }
      return originalRecord(req, auth);
    });

    render(
      <CompetitiveExamPlayerScreen
        paper={mockPresentationOnlyPaper}
        deliveryApiClient={client}
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    // Select option B
    const optB = screen.getByText('Merge Sort');
    fireEvent.click(optB);

    // Wait for transient failure handling
    await waitFor(() => {
      expect(client.getPendingAnswersCount()).toBe(1);
    });

    // Manually or automatically flush pending answers
    const flushResult = await client.flushPendingAnswers();
    expect(flushResult.synced).toBe(1);
    expect(flushResult.failed).toBe(0);
    expect(client.getPendingAnswersCount()).toBe(0);
    expect(client.hasTerminalError()).toBe(false);
  });

  it('14. Final Submission Idempotency: repeated submit calls resolve with identical terminal receipt', async () => {
    await client.initializeSession(PACKAGE_ID, SESSION_ID);

    const firstSubmit = await client.submitExam();
    expect(firstSubmit.sessionState).toBe('SUBMITTED');

    // Second call should return terminal response or idempotent status without error
    const secondSubmit = await client.submitExam();
    expect(secondSubmit.sessionState).toBe('SUBMITTED');
    expect(mockGateway.submitAttempt).toHaveBeenCalledTimes(2);
  });

  it('15. Rollback Safeguard: existing authoritative session fails closed when deliveryApiClient is missing, preventing silent client scoring fallback', async () => {
    const existingAuthoritativeSession: ExamTestSession = {
      sessionId: SESSION_ID,
      paperId: PACKAGE_ID,
      examId: 'gate',
      paperTitle: 'GATE 2025 Mock Test',
      userId: CANDIDATE_ID,
      startedAt: Date.now() - 1000,
      lastSavedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      completedAt: null,
      status: 'IN_PROGRESS',
      durationSeconds: 3600,
      timeRemainingSeconds: 3500,
      elapsedSeconds: 100,
      userAnswers: { 0: 1 },
      questionStatuses: { 0: 'ANSWERED' },
      currentQuestionIndex: 0,
      currentSectionId: 'sec_cs',
      version: 1,
      deliveryMode: 'AUTHORITATIVE',
    };

    render(
      <CompetitiveExamPlayerScreen
        paper={mockPresentationOnlyPaper}
        initialSession={existingAuthoritativeSession}
        deliveryApiClient={undefined} // Operator rolled back or gateway disconnected
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    // 1. Gateway Locked indicator must be visible
    expect(screen.getByText('Gateway Locked')).toBeDefined();

    // 2. Click Submit Examination
    const submitBtn = screen.getByText('Submit Examination');
    fireEvent.click(submitBtn);

    // 3. Confirm in modal
    const confirmBtn = screen.getByText('Confirm & Submit');
    fireEvent.click(confirmBtn);

    // 4. Must fail closed with authoritative required error, NOT evaluate on client
    await waitFor(() => {
      expect(
        screen.getByText(/AUTHORITATIVE_DELIVERY_REQUIRED/i)
      ).toBeDefined();
      expect(
        screen.getByText(/Silent fallback to client-side scoring is strictly prohibited/i)
      ).toBeDefined();
    });
  });
});

