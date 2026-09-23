import { describe, it, expect, beforeEach } from 'vitest';
import { ExamService } from './examService';
import { ExamPaper, ExamTestSession } from '../types';

describe('ExamService - Competitive Exams Platform', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should retrieve available competitive exams with SSC CHSL marked as AVAILABLE', () => {
    const exams = ExamService.getAvailableExams();
    expect(exams.length).toBeGreaterThanOrEqual(5);

    const chsl = exams.find((e) => e.id === 'ssc-chsl');
    expect(chsl).toBeDefined();
    expect(chsl?.status).toBe('AVAILABLE');
    expect(chsl?.availableYears).toContain(2025);
    expect(chsl?.defaultPattern.markingScheme.marksPerCorrect).toBe(2.0);
    expect(chsl?.defaultPattern.markingScheme.negativeMarks).toBe(0.5);
  });

  it('should retrieve SSC CHSL 2025 13 Nov S2 paper with 100 validated questions', () => {
    const paper = ExamService.getPaperById('ssc-chsl-2025-13nov-s2');
    expect(paper).toBeDefined();
    if (!paper) return;

    expect(paper.totalQuestions).toBe(100);
    expect(paper.totalMarks).toBe(200);
    expect(paper.durationMinutes).toBe(60);
    expect(paper.sections).toHaveLength(4);

    // Verify section bounds
    expect(paper.sections[0].id).toBe('english');
    expect(paper.sections[0].questionCount).toBe(25);
    expect(paper.sections[1].id).toBe('reasoning');
    expect(paper.sections[1].questionCount).toBe(25);
    expect(paper.sections[2].id).toBe('quant');
    expect(paper.sections[2].questionCount).toBe(25);
    expect(paper.sections[3].id).toBe('general_awareness');
    expect(paper.sections[3].questionCount).toBe(25);

    // Check first question
    const q1 = paper.questions[0];
    expect(q1.questionNumber).toBe(1);
    expect(q1.questionText).toContain('studies insects');
    expect(q1.options).toHaveLength(4);
    expect(q1.correctAnswer).toBe('B');
    expect(q1.correctAnswerIndex).toBe(1);
  });

  it('should initialize and auto-save an active exam session', () => {
    const paper = ExamService.getPaperById('ssc-chsl-2025-13nov-s2');
    expect(paper).toBeDefined();
    if (!paper) return;

    const session = ExamService.createExamSession(paper, 'student-123');
    expect(session.sessionId).toContain('session_ssc-chsl-2025-13nov-s2');
    expect(session.status).toBe('IN_PROGRESS');
    expect(session.durationSeconds).toBe(3600);
    expect(session.timeRemainingSeconds).toBe(3600);
    expect(session.questionStatuses[0]).toBe('NOT_ANSWERED');
    expect(session.questionStatuses[1]).toBe('NOT_VISITED');

    // Verify localStorage persistence
    const loaded = ExamService.getActiveSession('ssc-chsl-2025-13nov-s2');
    expect(loaded).toBeDefined();
    expect(loaded?.sessionId).toBe(session.sessionId);
  });

  it('should accurately calculate negative marking for SSC CHSL (+2 correct, -0.5 wrong)', () => {
    const paper = ExamService.getPaperById('ssc-chsl-2025-13nov-s2')!;
    const session = ExamService.createExamSession(paper);

    // Simulate answering:
    // Q1 (correct): answer option index 1 (B)
    session.userAnswers[0] = paper.questions[0].correctAnswerIndex;
    // Q2 (correct): answer option index 0 (A)
    session.userAnswers[1] = paper.questions[1].correctAnswerIndex;
    // Q3 (wrong): wrong option index
    const wrongOpt = (paper.questions[2].correctAnswerIndex + 1) % 4;
    session.userAnswers[2] = wrongOpt;
    // Q4 (wrong): wrong option index
    const wrongOpt2 = (paper.questions[3].correctAnswerIndex + 1) % 4;
    session.userAnswers[3] = wrongOpt2;

    // Calculation:
    // 2 correct: 2 * 2 = 4 marks
    // 2 wrong: 2 * 0.5 = 1 mark deducted
    // Net score: 4 - 1 = 3.0 marks
    const result = ExamService.calculateExamResult(session, paper);

    expect(result.correctCount).toBe(2);
    expect(result.wrongCount).toBe(2);
    expect(result.unansweredCount).toBe(96);
    expect(result.totalScore).toBe(3.0);
    expect(result.accuracy).toBe(50); // 2 correct out of 4 attempted = 50%
  });

  it('should complete exam session, persist to history, and clear active session', () => {
    const paper = ExamService.getPaperById('ssc-chsl-2025-13nov-s2')!;
    const session = ExamService.createExamSession(paper);

    const completed = ExamService.submitExamSession(session, paper);
    expect(completed.status).toBe('COMPLETED');
    expect(completed.result).toBeDefined();

    // Active session should now be null
    expect(ExamService.getActiveSession()).toBeNull();

    // History should contain the attempt
    const history = ExamService.getAttemptHistory('ssc-chsl-2025-13nov-s2');
    expect(history).toHaveLength(1);
    expect(history[0].sessionId).toBe(completed.sessionId);
  });
});
