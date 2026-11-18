// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  TopicPracticeService,
  PracticeTestConfig,
  validatePracticeQuestionCount,
  getClassificationTrustLevel,
  MAX_PRACTICE_QUESTIONS,
} from './topicPracticeService';
import { ExamService } from '../examService';
import { ExamSessionService } from '../examSessionService';
import { TopicClassificationStore } from '../taxonomy/topicClassificationStore';
import { getQuestionTopicMetadata } from '../taxonomy/topicClassifier';
import { ExamPaper, ExamTestSession, CompetitiveQuestion } from '../../types';

describe('TopicPracticeService — Test Engine & Integrity Architecture', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('1. Question Eligibility & Quality Assurance', () => {
    it('retrieves strictly STAFF_VERIFIED / trusted OFFICIAL questions for GATE with zero provisional, pending, or unclassified items', () => {
      const eligible = TopicPracticeService.getEligibleVerifiedQuestions('gate');
      expect(eligible.length).toBeGreaterThan(0);

      // Verify strict trust & quality constraints on every eligible verified question
      for (const q of eligible) {
        expect(q.verificationStatus).not.toBe('FAILED');
        expect(q.verificationStatus).not.toBe('UNVERIFIED');
        expect(q.topicMetadata?.classificationStatus).toBe('VERIFIED');
        expect(['STAFF', 'OFFICIAL']).toContain(q.topicMetadata?.classificationSource);
        expect(getClassificationTrustLevel(q.topicMetadata)).toBe('STAFF_VERIFIED');
        expect(q.topicMetadata?.primaryTopicId).not.toBe('uncategorized');
        expect(q.topicMetadata?.primaryTopicId).toBeTruthy();

        // Must have an official answer key
        const hasKey =
          q.isMta ||
          (typeof q.correctAnswer === 'string' && q.correctAnswer.length > 0) ||
          (Array.isArray(q.correctAnswerSet) && q.correctAnswerSet.length > 0) ||
          (q.correctAnswerIndex !== undefined && q.correctAnswerIndex >= 0) ||
          Boolean(q.answerRange) ||
          (Array.isArray(q.answerRanges) && q.answerRanges.length > 0);
        expect(hasKey).toBe(true);
      }

      // SSC CHSL currently has 0 staff-verified questions (all 14,126 are RULE_BASED_PROVISIONAL)
      expect(TopicPracticeService.getEligibleVerifiedQuestions('ssc-chsl').length).toBe(0);
      expect(TopicPracticeService.getProvisionalQuestions('ssc-chsl').length).toBeGreaterThan(0);
    });

    it('ensures question IDs in eligible pool are deduplicated', () => {
      const eligible = TopicPracticeService.getEligibleVerifiedQuestions('gate');
      const idSet = new Set(eligible.map((q) => q.id));
      expect(idSet.size).toBe(eligible.length);
    });
  });

  describe('2. Practice Catalog Discovery', () => {
    it('builds a structured catalog with subjects, topics, and accurate question counts', () => {
      const catalog = TopicPracticeService.getPracticeCatalog('gate');
      expect(catalog.examId).toBe('gate');
      expect(catalog.totalVerifiedQuestions).toBeGreaterThan(0);
      expect(catalog.subjects.length).toBeGreaterThan(0);

      const mlSubject = catalog.subjects.find(
        (s) => s.id === 'data_science_ai'
      );
      expect(mlSubject).toBeDefined();
      expect(catalog.totalProvisionalQuestions).toBeGreaterThan(0);

      if (mlSubject) {
        expect(mlSubject.topics.length).toBeGreaterThan(0);
        const hasQuestionsInTopics = mlSubject.topics.some((t) => t.verifiedQuestionCount > 0);
        expect(hasQuestionsInTopics).toBe(true);
      }
    });
  });

  describe('3. Question Filtering & Selection', () => {
    it('filters questions for a single topic (strictly excludes provisional by default; allows opt-in)', () => {
      const verifiedOnly = TopicPracticeService.filterQuestions('gate', ['linear_regression'], {
        count: 10,
      });
      // Every item in verified-only mode MUST be STAFF_VERIFIED
      for (const q of verifiedOnly) {
        expect(getClassificationTrustLevel(q.topicMetadata)).toBe('STAFF_VERIFIED');
      }

      const withProvisional = TopicPracticeService.filterQuestions('gate', ['linear_regression'], {
        count: 10,
        includeProvisional: true,
      });
      expect(Array.isArray(withProvisional)).toBe(true);
      if (withProvisional.length > 0) {
        expect(withProvisional.length).toBeLessThanOrEqual(10);
        for (const q of withProvisional) {
          const pId = q.topicMetadata?.primaryTopicId;
          const sId = q.topicMetadata?.subtopicId;
          expect(pId === 'linear_regression' || sId === 'linear_regression').toBe(true);
        }
      }
    });

    it('filters questions across multiple selected topics simultaneously without duplicates', () => {
      const topics = ['linear_regression', 'logistic_regression', 'clustering', 'decision_trees'];
      const filtered = TopicPracticeService.filterQuestions('gate', topics, {
        count: 20,
        includeProvisional: true,
      });
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.length).toBeLessThanOrEqual(20);

      const idSet = new Set(filtered.map((q) => q.id));
      expect(idSet.size).toBe(filtered.length);
    });

    it('filters questions by source (pyq vs practice)', () => {
      const pyqOnly = TopicPracticeService.filterQuestions('gate', ['machine_learning'], {
        source: 'pyq',
        count: 10,
        includeProvisional: true,
      });
      for (const q of pyqOnly) {
        const isPyq = Boolean(q.year || q.paperCode || q.id.includes('gate-'));
        expect(isPyq).toBe(true);
      }
    });

    it('filters questions by difficulty (easy vs hard)', () => {
      const easyQuestions = TopicPracticeService.filterQuestions('gate', ['machine_learning'], {
        difficulty: 'easy',
        count: 5,
        includeProvisional: true,
      });
      for (const q of easyQuestions) {
        expect(q.marks ?? 1).toBeLessThanOrEqual(1);
      }

      const hardQuestions = TopicPracticeService.filterQuestions('gate', ['machine_learning'], {
        difficulty: 'hard',
        count: 5,
        includeProvisional: true,
      });
      for (const q of hardQuestions) {
        expect(q.marks ?? 2).toBeGreaterThanOrEqual(2);
      }
    });

    it('returns empty array when no questions match criteria', () => {
      const empty = TopicPracticeService.filterQuestions('gate', ['non_existent_topic_id'], {
        count: 5,
      });
      expect(empty).toEqual([]);
    });
  });

  describe('4. Practice Test Generation & Verification Scheme', () => {
    it('generates a strictly verified ExamPaper for timed topic practice test (excluding provisional)', () => {
      const verifiedPool = TopicPracticeService.getEligibleVerifiedQuestions('gate');
      const verifiedTopicIds = Array.from(
        new Set(verifiedPool.map((q) => q.topicMetadata!.primaryTopicId!).filter(Boolean))
      );

      const config: PracticeTestConfig = {
        examId: 'gate',
        subjectId: 'data_science_ai',
        topicIds: verifiedTopicIds,
        questionCount: Math.min(5, verifiedPool.length),
        durationMinutes: 15,
        isUntimed: false,
        difficulty: 'mixed',
        source: 'both',
      };

      const paper = TopicPracticeService.generatePracticeTest(config);
      expect(paper).toBeDefined();
      expect(paper.id).toContain('practice_gate_data_science_ai_');
      expect(paper.testingMode).toBe('TOPIC_PRACTICE');
      expect(paper.isTopicPractice).toBe(true);
      expect(paper.isProvisionalPractice).toBe(false);
      expect(paper.isUntimed).toBe(false);
      expect(paper.durationMinutes).toBe(15);
      expect(paper.questions.length).toBe(Math.min(5, verifiedPool.length));

      // Verify question numbering 1..N & strict STAFF_VERIFIED trust
      paper.questions.forEach((q, idx) => {
        expect(q.questionNumber).toBe(idx + 1);
        expect(getClassificationTrustLevel(q.topicMetadata)).toBe('STAFF_VERIFIED');
      });

      // Verify marking scheme
      expect(paper.markingScheme.marksPerCorrect).toBe(1.0);
      expect(paper.markingScheme.negativeMarks).toBe(0.33);
    });

    it('generates an untimed practice test with duration 0 and untimed flag', () => {
      const config: PracticeTestConfig = {
        examId: 'gate',
        subjectId: 'data_science_ai',
        topicIds: ['machine_learning'],
        questionCount: 5,
        durationMinutes: 0,
        isUntimed: true,
        difficulty: 'mixed',
        source: 'both',
        includeProvisional: true,
      };

      const paper = TopicPracticeService.generatePracticeTest(config);
      expect(paper.isUntimed).toBe(true);
      expect(paper.isProvisionalPractice).toBe(true);
      expect(paper.durationMinutes).toBe(0);
      expect(paper.shift).toContain('Untimed');
    });

    it('throws descriptive error if no questions are available for the selected topic/filter', () => {
      const config: PracticeTestConfig = {
        examId: 'gate',
        subjectId: 'data_science_ai',
        topicIds: ['non_existent_topic'],
        questionCount: 10,
        durationMinutes: 30,
        isUntimed: false,
        difficulty: 'mixed',
        source: 'both',
      };

      expect(() => TopicPracticeService.generatePracticeTest(config)).toThrow(
        /No verified questions available/
      );
    });
  });

  describe('5. Evaluation, Negative Marking & Topic-wise Results', () => {
    // Helper to simulate answering correctly or wrongly based on question type
    const answerQuestion = (
      session: ExamTestSession,
      q: CompetitiveQuestion,
      index: number,
      isCorrect: boolean
    ) => {
      session.questionStatuses[index] = 'ANSWERED';
      if (q.questionType === 'NAT') {
        session.userNatAnswers = session.userNatAnswers || {};
        if (isCorrect) {
          session.userNatAnswers[index] = String(
            q.answerRange ? (q.answerRange.min + q.answerRange.max) / 2 : 10
          );
        } else {
          session.userNatAnswers[index] = '-99999';
        }
      } else if (q.questionType === 'MSQ') {
        session.userMsqAnswers = session.userMsqAnswers || {};
        if (isCorrect) {
          session.userMsqAnswers[index] =
            q.correctAnswerIndices && q.correctAnswerIndices.length > 0
              ? q.correctAnswerIndices
              : [0];
        } else {
          session.userMsqAnswers[index] = [99];
        }
      } else {
        const correctIdx = q.correctAnswerIndex >= 0 ? q.correctAnswerIndex : 0;
        session.userAnswers[index] = isCorrect ? correctIdx : (correctIdx + 1) % 4;
      }
    };

    it('calculates topicResults and difficultyResults with verified negative marking', () => {
      const config: PracticeTestConfig = {
        examId: 'gate',
        subjectId: 'data_science_ai',
        topicIds: ['machine_learning'],
        questionCount: 5,
        durationMinutes: 15,
        isUntimed: false,
        difficulty: 'mixed',
        source: 'both',
        includeProvisional: true,
      };

      const paper = TopicPracticeService.generatePracticeTest(config);
      const session = ExamSessionService.createSession(paper, 'test_student_1');

      // Answer Q0 correctly, Q1 wrongly, leave remainder unattempted
      const q0 = paper.questions[0];
      const q1 = paper.questions[1];

      answerQuestion(session, q0, 0, true);
      answerQuestion(session, q1, 1, false);

      // Calculate result
      const result = ExamService.calculateExamResult(session, paper);

      expect(result.totalQuestions).toBe(paper.questions.length);
      expect(result.attemptedCount).toBe(2);
      expect(result.correctCount).toBe(1);
      expect(result.wrongCount).toBe(1);
      expect(result.unansweredCount).toBe(paper.questions.length - 2);

      // Verify topic results breakdown exists
      expect(result.topicResults).toBeDefined();
      expect(Object.keys(result.topicResults!).length).toBeGreaterThan(0);

      const topResult = Object.values(result.topicResults!)[0];
      expect(topResult.totalQuestions).toBeGreaterThan(0);
      expect(topResult.attempted).toBe(2);
      expect(topResult.correct).toBe(1);
      expect(topResult.wrong).toBe(1);
      expect(topResult.accuracy).toBe(50); // 1 / 2 = 50%

      // Verify difficulty results breakdown exists
      expect(result.difficultyResults).toBeDefined();
    });
  });

  describe('6. Adaptive Progress Tracking & Recommendations', () => {
    const answerQuestion = (
      session: ExamTestSession,
      q: CompetitiveQuestion,
      index: number,
      isCorrect: boolean
    ) => {
      session.questionStatuses[index] = 'ANSWERED';
      if (q.questionType === 'NAT') {
        session.userNatAnswers = session.userNatAnswers || {};
        session.userNatAnswers[index] = isCorrect
          ? String(q.answerRange ? (q.answerRange.min + q.answerRange.max) / 2 : 10)
          : '-99999';
      } else if (q.questionType === 'MSQ') {
        session.userMsqAnswers = session.userMsqAnswers || {};
        session.userMsqAnswers[index] = isCorrect
          ? q.correctAnswerIndices && q.correctAnswerIndices.length > 0
            ? q.correctAnswerIndices
            : [0]
          : [99];
      } else {
        const correctIdx = q.correctAnswerIndex >= 0 ? q.correctAnswerIndex : 0;
        session.userAnswers[index] = isCorrect ? correctIdx : (correctIdx + 1) % 4;
      }
    };

    it('aggregates evidence-based topic performance history from real sessions', () => {
      const studentId = 'student_adaptive_01';
      const config: PracticeTestConfig = {
        examId: 'gate',
        subjectId: 'data_science_ai',
        topicIds: ['machine_learning'],
        questionCount: 4,
        durationMinutes: 15,
        isUntimed: false,
        difficulty: 'mixed',
        source: 'both',
        includeProvisional: true,
      };

      const paper = TopicPracticeService.generatePracticeTest(config);
      const session = ExamSessionService.createSession(paper, studentId);

      // Simulate student answering 1 correct, 3 wrong (low accuracy -> weak topic)
      session.status = 'COMPLETED';
      answerQuestion(session, paper.questions[0], 0, true);
      answerQuestion(session, paper.questions[1], 1, false);
      answerQuestion(session, paper.questions[2], 2, false);
      answerQuestion(session, paper.questions[3], 3, false);

      session.result = ExamService.calculateExamResult(session, paper);
      ExamSessionService.setLocalSessions(studentId, [session]);

      const history = TopicPracticeService.getTopicPerformanceHistory(studentId, 'gate');
      expect(history.length).toBeGreaterThan(0);

      const mlStat = history[0];
      expect(mlStat.totalQuestionsAttempted).toBe(4);
      expect(mlStat.correct).toBe(1);
      expect(mlStat.wrong).toBe(3);
      expect(mlStat.accuracy).toBe(25);
      expect(mlStat.isWeak).toBe(true);

      // Verify recommendations identify this weak topic
      const recommendations = TopicPracticeService.getRecommendations(studentId, 'gate');
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].topicId).toBe(mlStat.topicId);
      expect(recommendations[0].accuracy).toBe(25);
      expect(recommendations[0].reason).toContain('25%');
    });

    it('does not recommend strong topics where student demonstrated high accuracy', () => {
      const studentId = 'student_strong_01';
      const config: PracticeTestConfig = {
        examId: 'gate',
        subjectId: 'data_science_ai',
        topicIds: ['machine_learning'],
        questionCount: 3,
        durationMinutes: 15,
        isUntimed: false,
        difficulty: 'mixed',
        source: 'both',
        includeProvisional: true,
      };

      const paper = TopicPracticeService.generatePracticeTest(config);
      const session = ExamSessionService.createSession(paper, studentId);

      // 3 out of 3 correct = 100%
      session.status = 'COMPLETED';
      answerQuestion(session, paper.questions[0], 0, true);
      answerQuestion(session, paper.questions[1], 1, true);
      answerQuestion(session, paper.questions[2], 2, true);

      session.result = ExamService.calculateExamResult(session, paper);
      ExamSessionService.setLocalSessions(studentId, [session]);

      const recommendations = TopicPracticeService.getRecommendations(studentId, 'gate');
      expect(recommendations.length).toBe(0);
    });
  });

  describe('7. Question Count Synchronization & Validation Acceptance Matrix', () => {
    it('returns the full uncapped eligible pool when count is omitted (regression for 10-question cap bug)', () => {
      const catalog = TopicPracticeService.getPracticeCatalog('gate');
      // Find a subject with > 30 provisional+verified questions (explicitly opting into provisional mode)
      const largeSubject = catalog.subjects.find(
        (s) => s.totalQuestions + s.provisionalQuestions > 30
      );
      expect(largeSubject).toBeDefined();
      const topicIds = largeSubject!.topics
        .filter((t) => t.verifiedQuestionCount + t.provisionalQuestionCount > 0)
        .map((t) => t.id);

      const pool = TopicPracticeService.getMatchingQuestionPool('gate', topicIds, {
        difficulty: 'mixed',
        source: 'both',
        includeProvisional: true,
      });
      const filteredWithoutCount = TopicPracticeService.filterQuestions('gate', topicIds, {
        difficulty: 'mixed',
        source: 'both',
        includeProvisional: true,
      });

      expect(pool.length).toBeGreaterThan(30);
      expect(filteredWithoutCount.length).toBe(pool.length);

      // Generating 30 questions from a >30 eligible pool produces EXACTLY 30 unique questions
      const paper = TopicPracticeService.generatePracticeTest({
        examId: 'gate',
        subjectId: largeSubject!.id,
        topicIds,
        questionCount: 30,
        durationMinutes: 30,
        isUntimed: false,
        difficulty: 'mixed',
        source: 'both',
        includeProvisional: true,
      });
      expect(paper.questions.length).toBe(30);
      expect(paper.totalQuestions).toBe(30);
      expect(new Set(paper.questions.map((q) => q.id)).size).toBe(30);
    });

    it('validates every row of the requested vs eligible acceptance table accurately', () => {
      // Requested 5, Eligible 10 -> Valid, generate 5
      const case5of10 = validatePracticeQuestionCount({
        presetCount: 5,
        customInput: '',
        eligibleCount: 10,
        selectedTopicCount: 3,
      });
      expect(case5of10.isValid).toBe(true);
      expect(case5of10.requestedCount).toBe(5);
      expect(case5of10.eligibleCount).toBe(10);
      expect(case5of10.plannedGeneratedCount).toBe(5);

      // Requested 10, Eligible 10 -> Valid, generate 10
      const case10of10 = validatePracticeQuestionCount({
        presetCount: 10,
        customInput: '',
        eligibleCount: 10,
        selectedTopicCount: 3,
      });
      expect(case10of10.isValid).toBe(true);
      expect(case10of10.plannedGeneratedCount).toBe(10);

      // Requested 20, Eligible 10 -> Warn & block with maxAllowed = 10
      const case20of10 = validatePracticeQuestionCount({
        presetCount: 20,
        customInput: '',
        eligibleCount: 10,
        selectedTopicCount: 3,
      });
      expect(case20of10.isValid).toBe(false);
      expect(case20of10.errorCode).toBe('EXCEEDS_ELIGIBLE');
      expect(case20of10.maxAllowed).toBe(10);
      expect(case20of10.plannedGeneratedCount).toBe(0);
      expect(case20of10.message).toContain('Only 10 verified questions are available');

      // Requested 30, Eligible 10 -> Warn & block with maxAllowed = 10
      const case30of10 = validatePracticeQuestionCount({
        presetCount: 30,
        customInput: '',
        eligibleCount: 10,
        selectedTopicCount: 3,
      });
      expect(case30of10.isValid).toBe(false);
      expect(case30of10.errorCode).toBe('EXCEEDS_ELIGIBLE');
      expect(case30of10.maxAllowed).toBe(10);
      expect(case30of10.plannedGeneratedCount).toBe(0);
      expect(case30of10.message).toContain('Only 10 verified questions are available');

      // Requested 30, Eligible 50 -> Valid, generate 30
      const case30of50 = validatePracticeQuestionCount({
        presetCount: 30,
        customInput: '',
        eligibleCount: 50,
        selectedTopicCount: 3,
      });
      expect(case30of50.isValid).toBe(true);
      expect(case30of50.plannedGeneratedCount).toBe(30);

      // Requested 500, Eligible 10 -> Reject with maxAllowed = 10
      const case500of10 = validatePracticeQuestionCount({
        presetCount: 10,
        customInput: '500',
        eligibleCount: 10,
        selectedTopicCount: 3,
      });
      expect(case500of10.isValid).toBe(false);
      expect(case500of10.errorCode).toBe('EXCEEDS_ELIGIBLE');
      expect(case500of10.requestedCount).toBe(500);
      expect(case500of10.maxAllowed).toBe(10);
      expect(case500of10.plannedGeneratedCount).toBe(0);

      // Requested 500, Eligible 500 -> Reject session max limit (MAX_PRACTICE_QUESTIONS)
      const case500of500 = validatePracticeQuestionCount({
        presetCount: 10,
        customInput: '500',
        eligibleCount: 500,
        selectedTopicCount: 3,
      });
      expect(case500of500.isValid).toBe(false);
      expect(case500of500.errorCode).toBe('EXCEEDS_MAX_LIMIT');
      expect(case500of500.maxAllowed).toBe(MAX_PRACTICE_QUESTIONS);

      // Requested 0, Eligible 10 -> Reject
      const case0of10 = validatePracticeQuestionCount({
        presetCount: 10,
        customInput: '0',
        eligibleCount: 10,
        selectedTopicCount: 3,
      });
      expect(case0of10.isValid).toBe(false);
      expect(case0of10.errorCode).toBe('NON_POSITIVE');
      expect(case0of10.plannedGeneratedCount).toBe(0);

      // Requested -5, Eligible 10 -> Reject
      const caseNeg5of10 = validatePracticeQuestionCount({
        presetCount: 10,
        customInput: '-5',
        eligibleCount: 10,
        selectedTopicCount: 3,
      });
      expect(caseNeg5of10.isValid).toBe(false);
      expect(caseNeg5of10.errorCode).toBe('NON_POSITIVE');
      expect(caseNeg5of10.plannedGeneratedCount).toBe(0);

      // Non-numeric / decimal custom inputs -> Reject
      for (const bad of ['abc', '5.5', '12px', '1e2']) {
        const res = validatePracticeQuestionCount({
          presetCount: 10,
          customInput: bad,
          eligibleCount: 10,
          selectedTopicCount: 3,
        });
        expect(res.isValid).toBe(false);
        expect(res.errorCode).toBe('INVALID_FORMAT');
        expect(res.plannedGeneratedCount).toBe(0);
      }
    });

    it('rejects invalid or over-pool counts directly in generatePracticeTest', () => {
      const mlPool = TopicPracticeService.getMatchingQuestionPool('gate', ['machine_learning'], {
        includeProvisional: true,
      });
      expect(mlPool.length).toBeGreaterThan(0);

      // 0 and negative counts throw
      expect(() =>
        TopicPracticeService.generatePracticeTest({
          examId: 'gate',
          subjectId: 'data_science_ai',
          topicIds: ['machine_learning'],
          questionCount: 0,
          durationMinutes: 15,
          isUntimed: false,
          difficulty: 'mixed',
          source: 'both',
          includeProvisional: true,
        })
      ).toThrow(/at least 1/i);

      expect(() =>
        TopicPracticeService.generatePracticeTest({
          examId: 'gate',
          subjectId: 'data_science_ai',
          topicIds: ['machine_learning'],
          questionCount: -5,
          durationMinutes: 15,
          isUntimed: false,
          difficulty: 'mixed',
          source: 'both',
          includeProvisional: true,
        })
      ).toThrow(/at least 1/i);

      // Count exceeding MAX_PRACTICE_QUESTIONS throws
      expect(() =>
        TopicPracticeService.generatePracticeTest({
          examId: 'gate',
          subjectId: 'data_science_ai',
          topicIds: ['machine_learning'],
          questionCount: 500,
          durationMinutes: 15,
          isUntimed: false,
          difficulty: 'mixed',
          source: 'both',
          includeProvisional: true,
        })
      ).toThrow(/cannot exceed/i);

      // Count exceeding matching pool throws explicit availability error
      expect(() =>
        TopicPracticeService.generatePracticeTest({
          examId: 'gate',
          subjectId: 'data_science_ai',
          topicIds: ['machine_learning'],
          questionCount: mlPool.length + 1,
          durationMinutes: 15,
          isUntimed: false,
          difficulty: 'mixed',
          source: 'both',
          includeProvisional: true,
        })
      ).toThrow(/Only .* available/i);
    });
  });

  describe('8. Phase 2 Audit Regression Tests (DEF-01 through DEF-05)', () => {
    beforeEach(() => {
      localStorage.clear();
      TopicClassificationStore.clearCache();
      TopicPracticeService.clearIndexCache();
    });

    it('DEF-01: enforces GATE 2025 DA classification accuracy and excludes PENDING_REVIEW / OCR-defective items', () => {
      const daPaper = ExamService.getPaperById('gate-2025-da');
      expect(daPaper).toBeDefined();

      const byId = new Map(daPaper!.questions.map((q) => [q.id, q]));

      // Previously misclassified Calculus & AI & Algorithm questions are now accurate
      expect(getQuestionTopicMetadata(byId.get('gate-2025-da-q24')!, 'gate', 'da_core').primaryTopicId).toBe('calculus');
      expect(getQuestionTopicMetadata(byId.get('gate-2025-da-q44')!, 'gate', 'da_core').primaryTopicId).toBe('artificial_intelligence');
      expect(getQuestionTopicMetadata(byId.get('gate-2025-da-q27')!, 'gate', 'da_core').subtopicId).toBe('algorithms_complexity');
      expect(getQuestionTopicMetadata(byId.get('gate-2025-da-q57')!, 'gate', 'da_core').subtopicId).toBe('normalization_integrity');
      expect(getQuestionTopicMetadata(byId.get('gate-2025-da-q65')!, 'gate', 'da_core').subtopicId).toBe('algorithms_complexity');

      // Ambiguous or OCR-corrupted items routed to PENDING_REVIEW must NOT enter eligible verified pool
      const eligibleIds = new Set(TopicPracticeService.getEligibleVerifiedQuestions('gate').map((q) => q.id));
      for (const excludedId of [
        'gate-2025-da-q16',
        'gate-2025-da-q32',
        'gate-2025-da-q35',
        'gate-2025-da-q42',
        'gate-2025-da-q49',
        'gate-2025-da-q59',
        'gate-2025-da-q60',
      ]) {
        expect(eligibleIds.has(excludedId)).toBe(false);
      }

      // Raw f : R -> R stem must never match database_management in fresh rule-based classification
      const rawCalculus: CompetitiveQuestion = {
        ...byId.get('gate-2025-da-q24')!,
        id: 'synthetic-calc-test',
        topic: undefined,
        subtopic: undefined,
        topicMetadata: undefined,
      };
      expect(getQuestionTopicMetadata(rawCalculus, 'gate', 'da_core').primaryTopicId).not.toBe('database_management');
    });

    it('DEF-02: enforces strict per-user history isolation and prevents session double-counting', () => {
      const paper = TopicPracticeService.generatePracticeTest({
        examId: 'gate',
        subjectId: 'data_science_ai',
        topicIds: ['machine_learning'],
        questionCount: 3,
        durationMinutes: 15,
        isUntimed: false,
        difficulty: 'mixed',
        source: 'both',
        userId: 'user_alpha',
        includeProvisional: true,
      });

      const session = ExamSessionService.createSession(paper, 'user_alpha');
      session.userAnswers[0] = paper.questions[0].correctAnswerIndex ?? 0;
      session.questionStatuses[0] = 'ANSWERED';
      ExamService.submitExamSession(session, paper);

      // User Alpha sees exact attempt count = 1 (NOT double-counted as 2!)
      const alphaHistory = TopicPracticeService.getTopicPerformanceHistory('user_alpha', 'gate');
      expect(alphaHistory.length).toBeGreaterThan(0);
      expect(alphaHistory[0].totalAttempts).toBe(1);

      // User Beta sees ZERO sessions from User Alpha (strict user isolation!)
      const betaHistory = TopicPracticeService.getTopicPerformanceHistory('user_beta', 'gate');
      expect(betaHistory).toEqual([]);

      // Legacy active session fallback also isolates users
      const activeA = ExamSessionService.createSession(paper, 'user_alpha');
      expect(ExamSessionService.getActiveSession(paper.id, 'user_alpha')?.sessionId).toBe(activeA.sessionId);
      expect(ExamSessionService.getActiveSession(paper.id, 'user_beta')).toBeNull();
    });

    it('DEF-03 & DEF-04: persists synthetic practice papers strictly scoped to userId and prevents untimed expiry', () => {
      const paper = TopicPracticeService.generatePracticeTest({
        examId: 'gate',
        subjectId: 'data_science_ai',
        topicIds: ['machine_learning'],
        questionCount: 4,
        durationMinutes: 0,
        isUntimed: true,
        difficulty: 'mixed',
        source: 'both',
        userId: 'user_resume_test',
        includeProvisional: true,
      });

      // Persisted paper is restorable strictly within owner's userId scope
      const restored = TopicPracticeService.getPersistedPracticePaper(paper.id, 'user_resume_test');
      expect(restored).toBeDefined();
      expect(restored?.questions.length).toBe(4);
      expect(ExamService.getPaperById(paper.id, 'user_resume_test')?.id).toBe(paper.id);
      // Fails closed when userId is missing or belongs to another user!
      expect(ExamService.getPaperById(paper.id)).toBeUndefined();
      expect(ExamService.getPaperById(paper.id, 'other_user')).toBeUndefined();

      // Untimed session has durationSeconds === 0, isUntimed === true, and does not expire
      const session = ExamSessionService.createSession(paper, 'user_resume_test');
      expect(session.isUntimed).toBe(true);
      expect(session.durationSeconds).toBe(0);
      const active = ExamSessionService.getActiveSession(paper.id, 'user_resume_test');
      expect(active).not.toBeNull();
      expect(active?.status).toBe('IN_PROGRESS');
    });

    it('DEF-05: staff rejection immediately excludes verified question with staff-scoped audit trail without altering content', () => {
      const verifiedBefore = TopicPracticeService.getEligibleVerifiedQuestions('gate');
      expect(verifiedBefore.length).toBeGreaterThan(0);
      const targetQ = verifiedBefore[0];
      const originalStem = targetQ.questionText;
      const originalAns = targetQ.correctAnswer;
      const staffUid = '33333333-3333-4333-8333-333333333333';

      TopicClassificationStore.saveStaffDecision({
        questionId: targetQ.id,
        examId: 'gate',
        paperId: 'gate-2025-da',
        subjectId: 'data_science_ai',
        topicId: null,
        topicName: null,
        status: 'REJECTED',
        previousStatus: 'VERIFIED',
        reviewNotes: 'Rejected during quality audit',
        reviewedBy: staffUid,
      });
      TopicPracticeService.clearIndexCache();

      const verifiedAfter = TopicPracticeService.getEligibleVerifiedQuestions('gate');
      expect(verifiedAfter.some((q) => q.id === targetQ.id)).toBe(false);
      expect(verifiedAfter.length).toBe(verifiedBefore.length - 1);

      // Original content untouched & staff-scoped audit trail recorded
      expect(targetQ.questionText).toBe(originalStem);
      expect(targetQ.correctAnswer).toBe(originalAns);
      const log = TopicClassificationStore.getAuditLog(targetQ.id, staffUid);
      expect(log.length).toBe(1);
      expect(log[0].status).toBe('REJECTED');
      expect(log[0].reviewedBy).toBe(staffUid);
      expect(log[0].reviewNotes).toBe('Rejected during quality audit');
    });

    it('Gate C: permits exact 200 when eligible pool is 200', () => {
      const res = validatePracticeQuestionCount({
        presetCount: 10,
        customInput: '200',
        eligibleCount: 200,
        selectedTopicCount: 3,
      });
      expect(res.isValid).toBe(true);
      expect(res.plannedGeneratedCount).toBe(200);
    });
  });
});
