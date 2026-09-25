import {
  CompetitiveExam,
  ExamPaper,
  ExamTestSession,
  ExamResultSummary,
  SectionResultSummary,
} from '../types';
import {
  COMPETITIVE_EXAMS_CATALOG,
  EXAM_PAPERS_MAP,
  getPapersForExam,
  getPaperById,
} from '../data/exams/catalog';
import { examRepository, paperRepository, questionRepository } from '../repositories';
import { ExamSessionService } from './examSessionService';


const ACTIVE_SESSION_STORAGE_KEY = 'mockai_active_exam_session';
const ATTEMPT_HISTORY_STORAGE_KEY = 'mockai_exam_attempt_history';

export class ExamService {
  /**
   * Retrieve all supported competitive exams in the platform.
   * Sync — returns local catalog immediately.
   */
  static getAvailableExams(): CompetitiveExam[] {
    return COMPETITIVE_EXAMS_CATALOG;
  }

  /**
   * Retrieve exam metadata by exam ID. Sync — uses local catalog.
   */
  static getExamById(examId: string): CompetitiveExam | undefined {
    return COMPETITIVE_EXAMS_CATALOG.find((e) => e.id === examId);
  }

  /**
   * Retrieve all available previous-year papers for an exam. Sync — local.
   */
  static getPapersForExam(examId: string): ExamPaper[] {
    return getPapersForExam(examId);
  }

  /**
   * Retrieve a specific paper by its unique ID. Sync — local.
   */
  static getPaperById(paperId: string): ExamPaper | undefined {
    return getPaperById(paperId);
  }

  // ── Async Remote Methods (Project 2) ──────────────────────────────────────
  // These fetch from Supabase Project 2 with automatic local fallback.
  // Use these in new UI code. Existing sync methods remain for compatibility.

  /**
   * Fetch exam catalog from Project 2 (async, with local fallback).
   */
  static async getAvailableExamsAsync(): Promise<CompetitiveExam[]> {
    return examRepository.getExams();
  }

  /**
   * Fetch exam metadata from Project 2 by ID (async, with local fallback).
   */
  static async getExamByIdAsync(examId: string): Promise<CompetitiveExam | undefined> {
    return examRepository.getExamById(examId);
  }

  /**
   * Fetch all papers for an exam from Project 2 (async, with local fallback).
   * Optionally filter by year.
   */
  static async getPapersForExamAsync(examId: string, year?: number): Promise<Omit<ExamPaper, 'questions'>[]> {
    return paperRepository.getPapers(examId, year);
  }

  /**
   * Fetch a complete paper (metadata + questions + options + images) from Project 2.
   * Assembles the ExamPaper object ready for the exam player.
   * Falls back to local JSON when Project 2 is unavailable.
   */
  static async getPaperByIdAsync(paperId: string): Promise<ExamPaper | undefined> {
    // Try remote: fetch meta and questions in parallel
    const [meta, questions] = await Promise.all([
      paperRepository.getPaperMeta(paperId),
      questionRepository.getQuestions(paperId),
    ]);

    if (!meta) {
      // Full local fallback
      return getPaperById(paperId);
    }

    return {
      ...meta,
      questions,
    };
  }


  /**
   * Initialize a fresh exam test session with official section and question states.
   */
  static createExamSession(paper: ExamPaper, userId: string = 'guest'): ExamTestSession {
    return ExamSessionService.createSession(paper, userId);
  }

  /**
   * Auto-save the active exam test session to local persistence and queue remote persistence.
   */
  static saveActiveSession(session: ExamTestSession): void {
    ExamSessionService.saveSessionLocal(session);
    ExamSessionService.queueAutosave(session);
  }

  /**
   * Retrieve the active exam session if one exists.
   */
  static getActiveSession(paperId?: string, userId: string = 'guest'): ExamTestSession | null {
    const sessions = ExamSessionService.getLocalSessions(userId);
    const candidate = sessions.find(
      (s) =>
        (s.status === 'IN_PROGRESS' || s.status === 'PAUSED') &&
        (!paperId || s.paperId === paperId)
    );
    if (candidate) {
      const remaining = ExamSessionService.calculateRemainingSeconds(candidate);
      if (remaining <= 0) {
        candidate.status = 'EXPIRED';
        ExamSessionService.saveSessionLocal(candidate);
        return null;
      }
      candidate.timeRemainingSeconds = remaining;
      return candidate;
    }

    // Check legacy single-session key as fallback
    try {
      const data = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      if (!data) return null;
      const session = JSON.parse(data) as ExamTestSession;
      if (session.status !== 'IN_PROGRESS' && session.status !== 'PAUSED') return null;
      if (paperId && session.paperId !== paperId) return null;
      const remaining = ExamSessionService.calculateRemainingSeconds(session);
      if (remaining <= 0) {
        session.status = 'EXPIRED';
        ExamSessionService.saveSessionLocal(session);
        return null;
      }
      session.timeRemainingSeconds = remaining;
      return session;
    } catch (e) {
      return null;
    }
  }

  /**
   * Clear active exam session upon submission or cancellation.
   */
  static clearActiveSession(userId: string = 'guest'): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      } catch (e) {
        console.error('Failed to clear active exam session', e);
      }
    }
  }

  /**
   * Calculate exact score based on exam-specific negative marking rules.
   */
  static calculateExamResult(
    session: ExamTestSession,
    paper: ExamPaper
  ): ExamResultSummary {
    if (paper.paperType === 'DESCRIPTIVE') {
      const descriptiveAnswers = session.userDescriptiveAnswers || {};
      const questions = paper.questions;
      let completedCount = 0;
      const sectionResults: Record<string, SectionResultSummary> = {};

      for (const sec of paper.sections) {
        sectionResults[sec.id] = {
          sectionId: sec.id,
          sectionName: sec.name,
          totalQuestions: sec.questionCount,
          maxMarks: sec.maxMarks,
          attempted: 0,
          correct: 0,
          wrong: 0,
          skipped: 0,
          score: 0,
          accuracy: 0,
          timeSpentSeconds: 0,
        };
      }

      questions.forEach((q, index) => {
        const text = (descriptiveAnswers[index] || '').trim();
        const secSummary = sectionResults[q.sectionId];
        const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
        if (words > 0) {
          completedCount += 1;
          if (secSummary) {
            secSummary.attempted = 1;
            secSummary.correct = 1;
            secSummary.score = secSummary.maxMarks;
            secSummary.accuracy = 100;
          }
        } else if (secSummary) {
          secSummary.skipped = 1;
        }
      });

      return {
        sessionId: session.sessionId,
        paperId: paper.id,
        examId: paper.examId,
        paperTitle: paper.title,
        totalQuestions: questions.length,
        maxMarks: paper.totalMarks,
        totalScore: completedCount * 50,
        percentage: Math.round((completedCount / questions.length) * 100),
        accuracy: completedCount > 0 ? 100 : 0,
        correctCount: completedCount,
        wrongCount: 0,
        unansweredCount: questions.length - completedCount,
        timeSpentSeconds: session.elapsedSeconds,
        submittedAt: Date.now(),
        sectionResults,
      };
    }

    const marksPerCorrect = paper.markingScheme.marksPerCorrect;
    const negativeMarks = paper.markingScheme.negativeMarks;
    const questions = paper.questions;

    let totalScore = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;

    // Track per-section scores
    const sectionResults: Record<string, SectionResultSummary> = {};

    for (const sec of paper.sections) {
      sectionResults[sec.id] = {
        sectionId: sec.id,
        sectionName: sec.name,
        totalQuestions: sec.questionCount,
        maxMarks: sec.maxMarks,
        attempted: 0,
        correct: 0,
        wrong: 0,
        skipped: 0,
        score: 0,
        accuracy: 0,
        timeSpentSeconds: 0,
      };
    }

    questions.forEach((q, index) => {
      const secSummary = sectionResults[q.sectionId];
      const qMarks = q.marks !== undefined ? q.marks : marksPerCorrect;
      const qNegative = q.negativeMarks !== undefined ? q.negativeMarks : negativeMarks;

      if (q.isMta) {
        // Marks to All awarded by official committee
        correctCount += 1;
        totalScore += qMarks;
        if (secSummary) {
          secSummary.attempted += 1;
          secSummary.correct += 1;
          secSummary.score += qMarks;
        }
        return;
      }

      if (q.questionType === 'MSQ') {
        const userMsq = session.userMsqAnswers?.[index] || [];
        if (userMsq.length > 0) {
          if (secSummary) secSummary.attempted += 1;

          const sortedUserLetters = [...userMsq].sort().map((idx) => ['A', 'B', 'C', 'D'][idx]);
          let isCorrect = false;

          if (q.correctAnswerSets && q.correctAnswerSets.length > 0) {
            isCorrect = q.correctAnswerSets.some((set) => {
              const sortedSet = [...set].sort();
              return (
                sortedSet.length === sortedUserLetters.length &&
                sortedSet.every((val, i) => val === sortedUserLetters[i])
              );
            });
          } else if (q.correctAnswerSet && q.correctAnswerSet.length > 0) {
            const sortedSet = [...q.correctAnswerSet].sort();
            isCorrect =
              sortedSet.length === sortedUserLetters.length &&
              sortedSet.every((val, i) => val === sortedUserLetters[i]);
          } else if (q.correctAnswerIndices && q.correctAnswerIndices.length > 0) {
            const sortedIndices = [...q.correctAnswerIndices].sort();
            const sortedUser = [...userMsq].sort();
            isCorrect =
              sortedIndices.length === sortedUser.length &&
              sortedIndices.every((val, i) => val === sortedUser[i]);
          }

          if (isCorrect) {
            correctCount += 1;
            totalScore += qMarks;
            if (secSummary) {
              secSummary.correct += 1;
              secSummary.score += qMarks;
            }
          } else {
            wrongCount += 1;
            totalScore -= qNegative; // 0 for MSQ in GATE
            if (secSummary) {
              secSummary.wrong += 1;
              secSummary.score -= qNegative;
            }
          }
        } else {
          unansweredCount += 1;
          if (secSummary) {
            secSummary.skipped += 1;
          }
        }
      } else if (q.questionType === 'NAT') {
        const userNat = session.userNatAnswers?.[index];
        const hasEntered = userNat !== undefined && userNat !== null && userNat.trim().length > 0;
        if (hasEntered) {
          if (secSummary) secSummary.attempted += 1;
          const numVal = parseFloat(userNat.trim());

          let isCorrect = false;
          if (!isNaN(numVal)) {
            const tolerance = 1e-4;
            if (q.answerRanges && q.answerRanges.length > 0) {
              isCorrect = q.answerRanges.some(
                (r) => numVal >= r.min - tolerance && numVal <= r.max + tolerance
              );
            } else if (q.answerRange) {
              isCorrect =
                numVal >= q.answerRange.min - tolerance && numVal <= q.answerRange.max + tolerance;
            }
          }

          if (isCorrect) {
            correctCount += 1;
            totalScore += qMarks;
            if (secSummary) {
              secSummary.correct += 1;
              secSummary.score += qMarks;
            }
          } else {
            wrongCount += 1;
            totalScore -= qNegative; // 0 for NAT in GATE
            if (secSummary) {
              secSummary.wrong += 1;
              secSummary.score -= qNegative;
            }
          }
        } else {
          unansweredCount += 1;
          if (secSummary) {
            secSummary.skipped += 1;
          }
        }
      } else {
        // Standard MCQ
        const userChoice = session.userAnswers[index];
        if (userChoice !== undefined && userChoice !== null) {
          if (secSummary) secSummary.attempted += 1;

          if (userChoice === q.correctAnswerIndex) {
            correctCount += 1;
            totalScore += qMarks;
            if (secSummary) {
              secSummary.correct += 1;
              secSummary.score += qMarks;
            }
          } else {
            wrongCount += 1;
            totalScore -= qNegative;
            if (secSummary) {
              secSummary.wrong += 1;
              secSummary.score -= qNegative;
            }
          }
        } else {
          unansweredCount += 1;
          if (secSummary) {
            secSummary.skipped += 1;
          }
        }
      }
    });

    // Calculate accuracy percentage for each section
    for (const secId in sectionResults) {
      const s = sectionResults[secId];
      s.accuracy = s.attempted > 0 ? Math.round((s.correct / s.attempted) * 100) : 0;
      s.score = Math.round(s.score * 100) / 100;
    }

    const attemptedTotal = correctCount + wrongCount;
    const overallAccuracy = attemptedTotal > 0 ? Math.round((correctCount / attemptedTotal) * 100) : 0;
    const roundedTotalScore = Math.round(totalScore * 100) / 100;
    const percentage = paper.totalMarks > 0 ? Math.round((roundedTotalScore / paper.totalMarks) * 100) : 0;

    return {
      sessionId: session.sessionId,
      paperId: paper.id,
      examId: paper.examId,
      paperTitle: paper.title,
      totalQuestions: paper.totalQuestions,
      maxMarks: paper.totalMarks,
      totalScore: roundedTotalScore,
      percentage,
      accuracy: overallAccuracy,
      correctCount,
      wrongCount,
      unansweredCount,
      timeSpentSeconds: session.elapsedSeconds,
      submittedAt: Date.now(),
      sectionResults,
    };
  }

  /**
   * Finalize exam attempt: calculate scores, persist to attempt history, and clear active session.
   */
  static submitExamSession(
    session: ExamTestSession,
    paper: ExamPaper
  ): ExamTestSession {
    const result = this.calculateExamResult(session, paper);

    const completedSession: ExamTestSession = {
      ...session,
      status: 'COMPLETED',
      completedAt: Date.now(),
      result,
    };

    // Save to history and persistent service
    this.saveAttemptToHistory(completedSession);
    ExamSessionService.submitSessionSync(completedSession, result);
    ExamSessionService.submitSession(completedSession, result).catch((err) => {
      console.warn('Non-fatal: persistent submit sync error:', err);
    });
    this.clearActiveSession(session.userId);

    return completedSession;
  }

  /**
   * Save completed attempt to user's local history.
   */
  static saveAttemptToHistory(session: ExamTestSession): void {
    try {
      const history = this.getAttemptHistory();
      // Prepend recent attempt
      const updated = [session, ...history.filter((s) => s.sessionId !== session.sessionId)];
      localStorage.setItem(ATTEMPT_HISTORY_STORAGE_KEY, JSON.stringify(updated.slice(0, 50)));
    } catch (e) {
      console.error('Failed to save attempt to history', e);
    }
  }

  /**
   * Retrieve attempt history list.
   */
  static getAttemptHistory(paperId?: string): ExamTestSession[] {
    try {
      const raw = localStorage.getItem(ATTEMPT_HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const history = JSON.parse(raw) as ExamTestSession[];
      if (paperId) {
        return history.filter((s) => s.paperId === paperId);
      }
      return history;
    } catch (e) {
      console.error('Failed to read attempt history', e);
      return [];
    }
  }
}
