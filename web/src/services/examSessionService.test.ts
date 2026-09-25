import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExamSessionService } from './examSessionService';
import { ExamService } from './examService';
import { ExamPaper, ExamTestSession } from '../types';

describe('ExamSessionService Persistent Test Session Engine', () => {
  let samplePaper: ExamPaper;

  beforeEach(() => {
    localStorage.clear();
    samplePaper = ExamService.getPaperById('ssc-chsl-2025-13nov-s2')!;
  });

  it('TEST 1: initializes session with authoritative timestamps, version, and local persistence', () => {
    const session = ExamSessionService.createSession(samplePaper, 'user_123');

    expect(session.sessionId).toContain('session_ssc-chsl-2025-13nov-s2');
    expect(session.userId).toBe('user_123');
    expect(session.status).toBe('IN_PROGRESS');
    expect(session.version).toBe(1);
    expect(session.currentQuestionIndex).toBe(0);
    expect(session.currentSectionId).toBe('english');
    expect(session.expiresAt).toBeGreaterThan(session.startedAt);
    expect(session.timeRemainingSeconds).toBe(3600);

    // Verify persisted to local user storage
    const stored = ExamSessionService.getLocalSessions('user_123');
    expect(stored).toHaveLength(1);
    expect(stored[0].sessionId).toBe(session.sessionId);
  });

  it('TEST 2 & 3 & 4: Answer questions, Save & Exit, and resume with exact question and section restored', async () => {
    const session = ExamSessionService.createSession(samplePaper, 'user_abc');

    // Simulate answering Q0 and Q1, and navigating to Q4 in section 'english'
    session.userAnswers[0] = 1;
    session.userAnswers[1] = 2;
    session.questionStatuses[0] = 'ANSWERED';
    session.questionStatuses[1] = 'ANSWERED';
    session.currentQuestionIndex = 4;
    session.currentSectionId = 'english';

    // Save & Exit
    const paused = await ExamSessionService.saveAndExit(session);
    expect(paused.status).toBe('PAUSED');
    expect(paused.version).toBe(2);

    // Verify stored state in persistence
    const saved = await ExamSessionService.getSessionById(session.sessionId, 'user_abc');
    expect(saved).not.toBeNull();
    expect(saved?.status).toBe('PAUSED');
    expect(saved?.currentQuestionIndex).toBe(4);
    expect(saved?.userAnswers[0]).toBe(1);
    expect(saved?.userAnswers[1]).toBe(2);

    // Resume session
    const resumed = await ExamSessionService.resumeSession(session.sessionId, 'user_abc');
    expect(resumed?.status).toBe('IN_PROGRESS');
    expect(resumed?.currentQuestionIndex).toBe(4);
    expect(resumed?.currentSectionId).toBe('english');
    expect(resumed?.userAnswers[0]).toBe(1);
    expect(resumed?.userAnswers[1]).toBe(2);
  });

  it('TEST 5 & 6: preserves review flags and visited states across Save & Exit', async () => {
    const session = ExamSessionService.createSession(samplePaper, 'user_xyz');

    session.questionStatuses[0] = 'ANSWERED';
    session.questionStatuses[1] = 'MARKED_FOR_REVIEW';
    session.questionStatuses[2] = 'ANSWERED_AND_MARKED_FOR_REVIEW';
    session.questionStatuses[3] = 'NOT_ANSWERED';

    await ExamSessionService.saveAndExit(session);

    const resumed = await ExamSessionService.resumeSession(session.sessionId, 'user_xyz');
    expect(resumed?.questionStatuses[0]).toBe('ANSWERED');
    expect(resumed?.questionStatuses[1]).toBe('MARKED_FOR_REVIEW');
    expect(resumed?.questionStatuses[2]).toBe('ANSWERED_AND_MARKED_FOR_REVIEW');
    expect(resumed?.questionStatuses[3]).toBe('NOT_ANSWERED');
  });

  it('TEST 7: restores timer authoritatively based on expiresAt (elapsed wall-clock)', () => {
    const fixedStart = 1790000000000;
    vi.spyOn(Date, 'now').mockReturnValue(fixedStart);
    const session = ExamSessionService.createSession(samplePaper, 'user_timer');

    // Simulate exactly 10 minutes passing (600 seconds)
    vi.spyOn(Date, 'now').mockReturnValue(fixedStart + 600 * 1000);

    const remaining = ExamSessionService.calculateRemainingSeconds(session);
    expect(remaining).toBe(3000); // 3600 - 600 = 3000 seconds

    vi.restoreAllMocks();
  });

  it('TEST 8: heals legacy session missing expiresAt without returning NaN', () => {
    // Legacy session created without expiresAt or with NaN
    const legacySession: any = {
      sessionId: 'sess_legacy',
      paperId: 'test_paper',
      status: 'IN_PROGRESS',
      startedAt: Date.now() - 300 * 1000, // 5 mins ago
      durationSeconds: 3600,
      timeRemainingSeconds: 3300,
      expiresAt: undefined, // missing
    };

    const remaining = ExamSessionService.calculateRemainingSeconds(legacySession);
    expect(Number.isFinite(remaining)).toBe(true);
    expect(remaining).toBeGreaterThan(0);
    expect(isNaN(remaining)).toBe(false);
  });

  it('TEST 11: debounced autosave persists immediately to local cache preventing data loss on crash', async () => {
    const session = ExamSessionService.createSession(samplePaper, 'user_autosave');

    session.userAnswers[10] = 3;
    session.questionStatuses[10] = 'ANSWERED';

    // Queue autosave
    ExamSessionService.queueAutosave(session);

    // Local storage should reflect the update immediately without waiting for debounce timer
    const local = ExamSessionService.getLocalSessions('user_autosave');
    expect(local[0].userAnswers[10]).toBe(3);

    // Flush pending
    await ExamSessionService.flushAutosave();
  });

  it('TEST 13 & 14: Final submission locks session and prevents further resume; expired test auto-finalizes', async () => {
    const session = ExamSessionService.createSession(samplePaper, 'user_submit');
    const result = ExamService.calculateExamResult(session, samplePaper);

    const submitted = await ExamSessionService.submitSession(session, result);
    expect(submitted.status).toBe('SUBMITTED');
    expect(submitted.completedAt).toBeDefined();

    // Active session query should no longer return submitted session
    const activeSessions = await ExamSessionService.getActiveSessionsForUser('user_submit');
    expect(activeSessions.find((s) => s.sessionId === session.sessionId)).toBeUndefined();

    // Resuming an expired session should transition to EXPIRED
    const expiredSession = ExamSessionService.createSession(samplePaper, 'user_exp');
    expiredSession.expiresAt = Date.now() - 10000; // in the past
    ExamSessionService.saveSessionLocal(expiredSession);

    const resumedExp = await ExamSessionService.resumeSession(expiredSession.sessionId, 'user_exp');
    expect(resumedExp?.status).toBe('EXPIRED');
  });

  it('TEST 15: User A cannot access User B sessions (user-isolated partitions)', async () => {
    const sessionUserA = ExamSessionService.createSession(samplePaper, 'user_A');
    const sessionUserB = ExamSessionService.createSession(samplePaper, 'user_B');

    const sessionsForA = await ExamSessionService.getActiveSessionsForUser('user_A');
    const sessionsForB = await ExamSessionService.getActiveSessionsForUser('user_B');

    expect(sessionsForA.some((s) => s.sessionId === sessionUserA.sessionId)).toBe(true);
    expect(sessionsForA.some((s) => s.sessionId === sessionUserB.sessionId)).toBe(false);

    expect(sessionsForB.some((s) => s.sessionId === sessionUserB.sessionId)).toBe(true);
    expect(sessionsForB.some((s) => s.sessionId === sessionUserA.sessionId)).toBe(false);
  });

  it('TEST 16: Multiple unfinished tests appear concurrently for the user', async () => {
    const paper1 = samplePaper;
    const paper2 = { ...samplePaper, id: 'gate-2025-da', title: 'GATE 2025 — Data Science & AI', examId: 'gate' };

    const sess1 = ExamSessionService.createSession(paper1, 'multi_user');
    const sess2 = ExamSessionService.createSession(paper2, 'multi_user');

    await ExamSessionService.saveAndExit(sess1);
    await ExamSessionService.saveAndExit(sess2);

    const allUnfinished = await ExamSessionService.getActiveSessionsForUser('multi_user');
    expect(allUnfinished).toHaveLength(2);
    expect(allUnfinished.map((s) => s.paperId)).toEqual(
      expect.arrayContaining(['ssc-chsl-2025-13nov-s2', 'gate-2025-da'])
    );
  });

  it('TEST 17: Discarding session removes it cleanly from user active list', async () => {
    const session = ExamSessionService.createSession(samplePaper, 'user_discard');
    let active = await ExamSessionService.getActiveSessionsForUser('user_discard');
    expect(active).toHaveLength(1);

    await ExamSessionService.discardSession(session.sessionId, 'user_discard');
    active = await ExamSessionService.getActiveSessionsForUser('user_discard');
    expect(active).toHaveLength(0);
  });
});
